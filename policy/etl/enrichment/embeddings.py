"""Embeddings: turn passage text into vectors, and search by meaning.

The embedder itself is ``mandate.embedding`` -- the one module in the monorepo
that names an embedding model or calls an embeddings API. ``get_embedder``
returns the embedder for the space policy's passage vectors are stored in
(``grounding.passage_embeddings``, read through the ``grounded_passages`` view
that ``Passage`` is mapped on), so a query
and the vectors it is compared with cannot come from different models. The
local BGE fallback that lived here is gone: it was 384-dim against a 1024-dim
column, so it could only ever run against a different database than production.

The embedding step is intentionally separate from ingestion so the pipeline can
run offline; populate vectors afterwards with ``regina embed``.
"""

from __future__ import annotations

import datetime as dt
import math
import os
from typing import Protocol

import httpx
import structlog
from sqlalchemy import func, select, text
from sqlalchemy import true as sa_true
from sqlalchemy.orm import Session
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from data import grounding_bridge as gb
from data.config import Settings
from mandate.embedding import for_table, vector_literal
from data.models import Document, DocumentType, DocumentVersion, Passage, Source

log = structlog.get_logger(__name__)

#: Where policy's passage vectors live, as registered in mandate/embedding/spaces.json.
PASSAGES_TABLE = gb.EMBEDDINGS_TABLE


class Embedder(Protocol):
    dim: int

    def embed(self, texts: list[str]) -> list[list[float]]: ...


def _is_retryable_voyage(exc: BaseException) -> bool:
    """Same policy as etl/http.py's HttpClient: retry transient failures
    (network errors, 429, 5xx) only — a 4xx like a bad model name or an
    invalid key is permanent and must surface immediately, not retry-loop."""
    if isinstance(exc, httpx.TransportError):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code == 429 or exc.response.status_code >= 500
    return False


def get_embedder(settings: Settings | None = None) -> Embedder:
    """The embedder for policy's passages' stored space (mandate.embedding).

    Raises RuntimeError (EmbeddingError) when no Voyage key is set, as the old
    Voyage path did. ``settings`` is accepted and unused: the model is not a
    setting any more, because a setting is how one process ends up writing a
    vector another process cannot query."""
    return for_table(PASSAGES_TABLE)


def embed_pending(session: Session, embedder: Embedder, *, batch_size: int = 128) -> int:
    """Embed every current passage that has no vector yet, in batches. Returns
    the number embedded.

    Writes grounding.passage_embeddings (one row per passage and model,
    append-only: a passage already embedded in this model is never re-embedded),
    in ``gb.MODEL`` -- the model the grounded_passages view reads, so a vector
    written here is a vector the search can see.

    Restricted to current-version passages: a superseded version's passages are
    never retrievable once ``semantic_search``/``canon_passages`` filter on
    ``is_current``, so embedding them would only spend money."""
    if getattr(embedder, "model", gb.MODEL) != gb.MODEL:
        raise RuntimeError(
            f"embedder is {embedder.model!r} but grounded_passages reads {gb.MODEL!r}: "
            "a vector in another space would be invisible to every search")
    cast = _embedding_type(session)
    total = 0
    while True:
        rows = session.execute(
            select(Passage.id, Passage.text)
            .join(DocumentVersion, Passage.version_id == DocumentVersion.id)
            .where(Passage.embedding.is_(None), DocumentVersion.is_current.is_(True))
            .distinct()
            .order_by(Passage.id)
            .limit(batch_size)
        ).all()
        if not rows:
            break
        vectors = embedder.embed([r.text for r in rows])
        for row, vector in zip(rows, vectors, strict=True):
            session.execute(
                text(
                    "INSERT INTO grounding.passage_embeddings (passage_id, model, embedding) "
                    f"VALUES (:pid, :model, CAST(:vec AS {cast})) ON CONFLICT DO NOTHING"
                ),
                {"pid": row.id, "model": gb.MODEL, "vec": vector_literal(vector)},
            )
        session.commit()
        total += len(rows)
        log.info("embedded_batch", count=len(rows), total=total)
    return total


def _embedding_type(session: Session) -> str:
    """The SQL type of grounding.passage_embeddings.embedding as installed:
    halfvec(1024) in production, vector(1024) on a test server whose pgvector
    predates halfvec (mandate/grounding/testing.py)."""
    return session.execute(
        text(
            "SELECT 'public.' || format_type(atttypid, atttypmod) FROM pg_attribute "
            "WHERE attrelid = 'grounding.passage_embeddings'::regclass AND attname = 'embedding'"
        )
    ).scalar_one()


def _row_to_passage(row) -> dict:
    return {
        "title": row.title,
        "celex": row.celex,
        "url": row.url,
        # The document this passage belongs to. Needed to go from "these are
        # the instruments that matter for this profile" to "now give me more
        # passages from those same instruments" — see document_passages().
        # A stable integer key, unlike the celex-or-url-or-title string the
        # per-document caps in briefing.py fall back to for grouping.
        "document_id": getattr(row, "document_id", None),
        "stage": row.lifecycle_stage.value,
        "jurisdiction": row.jurisdiction.value,
        "document_type": row.document_type.value,
        # Distinguishes a primary-source floor-debate transcript (named
        # speaker, real stated position) from every other document_type
        # "other" — a generic label the model otherwise can't tell apart
        # from, say, a press summary. See briefing.py's _source_label().
        "kind": (row.extra or {}).get("kind"),
        "char_start": row.char_start,
        "char_end": row.char_end,
        "score": round(1.0 - float(row.distance), 3),  # cosine similarity
        "text": row.text,
        # Only populated by press_passages() below (semantic_search and
        # canon_passages don't select it — legal text is recency-agnostic by
        # design, so they have no need for it). None for any passage from
        # those two paths.
        "date_document": (
            row.date_document.isoformat() if getattr(row, "date_document", None) else None
        ),
    }


def semantic_search(
    session: Session, embedder: Embedder, query: str, *, k: int = 5, min_score: float | None = None
) -> list[dict]:
    """Return the k passages closest in meaning to the query, each with the
    citation context needed to quote it.

    ``min_score`` (cosine similarity, 0-1), when given, drops any result
    below the floor rather than backfilling with the next-best match — a
    genuine "nothing here is relevant enough" can return fewer than k
    passages, or none. Default None preserves the historical no-floor
    behavior; canon_passages() deliberately has no equivalent parameter,
    since every foundational act must get a guaranteed seat regardless of
    score for the Compliance table to render an explicit verdict."""
    qvec = embedder.embed([query])[0]
    stmt = (
        select(
            Passage.text,
            Passage.char_start,
            Passage.char_end,
            DocumentVersion.document_id.label("document_id"),
            Document.title,
            Document.celex,
            Document.url,
            Document.lifecycle_stage,
            Document.jurisdiction,
            Document.document_type,
            Document.extra,
            Passage.embedding.cosine_distance(qvec).label("distance"),
        )
        .join(DocumentVersion, Passage.version_id == DocumentVersion.id)
        .join(Document, DocumentVersion.document_id == Document.id)
        .where(Passage.embedding.is_not(None), DocumentVersion.is_current.is_(True))
        .order_by("distance")
        .limit(k)
    )
    results = [_row_to_passage(row) for row in session.execute(stmt).all()]
    if min_score is not None:
        return [r for r in results if r["score"] >= min_score]
    return results


def canon_passages(
    session: Session, embedder: Embedder, query: str, celex_codes: list[str]
) -> list[dict]:
    """One best-matching passage per instrument in ``celex_codes``.

    Open semantic top-k reliably surfaces whatever instrument best matches the
    company's own language (DMA/AI Act for a platform, GDPR for anyone) and
    just as reliably drops instruments a company should still be told it's
    *out of scope of* (CRA, NIS2, DORA...) because nothing in their profile
    text is close to those instruments' vocabulary. Without a retrieved
    passage the model has no grounded basis to write that row at all, so it's
    silently omitted — not flagged Out of Scope, just absent. Guaranteeing one
    passage per foundational act closes that gap: every canon instrument gets
    a seat in context, and the prompt's own guardrails decide the verdict.
    """
    if not celex_codes:
        return []
    qvec = embedder.embed([query])[0]
    distance = Passage.embedding.cosine_distance(qvec)
    stmt = (
        select(
            Passage.text,
            Passage.char_start,
            Passage.char_end,
            DocumentVersion.document_id.label("document_id"),
            Document.title,
            Document.celex,
            Document.url,
            Document.lifecycle_stage,
            Document.jurisdiction,
            Document.document_type,
            Document.extra,
            distance.label("distance"),
        )
        .join(DocumentVersion, Passage.version_id == DocumentVersion.id)
        .join(Document, DocumentVersion.document_id == Document.id)
        .where(
            Passage.embedding.is_not(None),
            DocumentVersion.is_current.is_(True),
            Document.celex.in_(celex_codes),
        )
        .distinct(Document.celex)
        .order_by(Document.celex, distance)
    )
    results = [_row_to_passage(row) for row in session.execute(stmt).all()]
    results.sort(key=lambda r: r["score"], reverse=True)
    return results


def document_passages(
    session: Session,
    embedder: Embedder,
    query: str,
    document_ids: list[int],
    *,
    k_per_doc: int = 4,
) -> list[dict]:
    """The ``k_per_doc`` passages closest in meaning to ``query`` from EACH of
    ``document_ids`` — the "go deeper" half of retrieval.

    semantic_search() answers "which passages in the corpus match", and every
    per-document cap in briefing.py then deliberately flattens the result
    toward one passage per instrument so no single document monopolizes
    context. That is the right shape for deciding WHICH instruments matter,
    and the wrong shape for saying anything specific about them: a single
    ~1,500-char window of a regulation is enough to name it and nothing more,
    which is exactly how a brief ends up naming 60 instruments and explaining
    none. This is the second pass — once breadth has picked the instruments,
    re-retrieve within only those, so the model sees several of an act's
    actual operative provisions instead of one arbitrary window of each.

    Uses an exact scan (row_number over the query-distance) rather than the
    HNSW index: the ``document_id`` filter narrows the candidate set to a few
    thousand rows at most, where exact distances are both cheap and immune to
    the ANN-recall trap press_passages() documents at length — a narrow filter
    plus an approximate index is how you silently get zero rows back."""
    if not document_ids:
        return []
    qvec = embedder.embed([query])[0]
    distance = Passage.embedding.cosine_distance(qvec).label("distance")
    ranked = (
        select(
            Passage.text,
            Passage.char_start,
            Passage.char_end,
            DocumentVersion.document_id.label("document_id"),
            Document.title,
            Document.celex,
            Document.url,
            Document.lifecycle_stage,
            Document.jurisdiction,
            Document.document_type,
            Document.extra,
            distance,
            func.row_number()
            .over(partition_by=DocumentVersion.document_id, order_by=distance)
            .label("rank_in_doc"),
        )
        .join(DocumentVersion, Passage.version_id == DocumentVersion.id)
        .join(Document, DocumentVersion.document_id == Document.id)
        .where(
            Passage.embedding.is_not(None),
            DocumentVersion.is_current.is_(True),
            DocumentVersion.document_id.in_(document_ids),
        )
        .subquery()
    )
    stmt = (
        select(ranked)
        .where(ranked.c.rank_in_doc <= k_per_doc)
        .order_by(ranked.c.distance)
    )
    return [_row_to_passage(row) for row in session.execute(stmt).all()]


class Reranker(Protocol):
    def rerank(self, query: str, texts: list[str]) -> list[float]: ...


class VoyageReranker:
    """Voyage cross-encoder reranker — scores each passage against the query
    jointly, rather than comparing two independently-produced vectors.

    Why this matters for this corpus specifically: a bi-encoder embedding
    match rewards documents whose overall prose *resembles* the query, and a
    company profile reads like discursive prose. Measured live 2026-07-27 on
    a fintech profile, the top six embedding hits were Commission staff
    working documents and impact assessments — long, discursive, topically
    adjacent — while DORA's actual operative text ranked seventh. Impact
    assessments are commentary about law; a compliance brief needs the law.
    A cross-encoder judges "does this passage answer this query" instead of
    "is this passage's prose shaped like this query", which is what separates
    those two cases.

    Returns scores in input order (not a sorted ranking) so callers keep
    control of ordering and can attach the score to their own dicts.
    """

    _ENDPOINT = "https://api.voyageai.com/v1/rerank"
    # Voyage's documented per-request ceiling is 1,000 documents; callers here
    # pass ~100 (see briefing.py's over-fetch pools), so this is a guard
    # against a future caller, not a limit anything currently approaches.
    _MAX_DOCUMENTS = 1000

    def __init__(
        self, model_name: str, api_key: str, *, client: httpx.Client | None = None
    ):
        self._model = model_name
        self._client = client or httpx.Client(timeout=60.0)
        self._headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    @retry(
        retry=retry_if_exception(_is_retryable_voyage),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        reraise=True,
    )
    def rerank(self, query: str, texts: list[str]) -> list[float]:
        if not texts:
            return []
        batch = texts[: self._MAX_DOCUMENTS]
        resp = self._client.post(
            self._ENDPOINT,
            headers=self._headers,
            json={"query": query, "documents": batch, "model": self._model},
        )
        resp.raise_for_status()
        scores = [0.0] * len(texts)
        for row in resp.json()["data"]:
            scores[row["index"]] = float(row["relevance_score"])
        return scores


def get_reranker(settings: Settings) -> Reranker | None:
    """The configured reranker, or None when reranking is unavailable.

    None is a supported mode, not a failure: callers fall back to pure
    embedding order, which is what every run did before reranking existed.
    That keeps local/offline runs (LocalEmbedder, no VOYAGE_API_KEY) working
    with no configuration, and makes an unset key a graceful downgrade rather
    than a broken brief."""
    if not settings.rerank_model:
        return None
    api_key = os.environ.get("VOYAGE_API_KEY")
    if not api_key:
        return None
    return VoyageReranker(settings.rerank_model, api_key)


def rerank_passages(
    reranker: Reranker | None,
    query: str,
    passages: list[dict],
    *,
    top_k: int | None = None,
    min_score: float | None = None,
) -> list[dict]:
    """Reorder ``passages`` by cross-encoder relevance, annotating each with
    ``rerank_score``, and keep the best ``top_k``.

    A network or API failure downgrades to embedding order rather than
    propagating: reranking improves which passages get used, but a brief
    built on embedding order alone is still a valid brief, and losing the
    whole report to a transient rerank 503 would be a bad trade. The
    downgrade is logged so it shows up as a quality regression rather than
    passing silently.

    ``min_score`` is left None by every current caller deliberately — the
    cross-encoder's score distribution over this corpus hasn't been measured
    yet, and a guessed floor would silently drop good passages. Reordering is
    the established win; floors wait for data."""
    if not passages:
        return []
    if reranker is None:
        ordered = passages
    else:
        try:
            scores = reranker.rerank(query, [p["text"] for p in passages])
            scored = [
                {**p, "rerank_score": round(s, 4)} for p, s in zip(passages, scores, strict=True)
            ]
            if min_score is not None:
                scored = [p for p in scored if p["rerank_score"] >= min_score]
            ordered = sorted(scored, key=lambda p: p["rerank_score"], reverse=True)
        except Exception as exc:
            log.warning("rerank_failed_using_embedding_order", error=str(exc))
            ordered = passages
    return ordered[:top_k] if top_k is not None else ordered


def _cosine_sim(a, b) -> float:
    """Plain cosine similarity between two equal-length vectors — written
    with zip/sum rather than numpy so it works whether the driver hands back
    a list or a numpy array, without adding a direct numpy dependency for
    what's a handful of ~1000-dim comparisons per call."""
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def _mmr_select(candidates: list[dict], *, k: int, lambda_mult: float = 0.6) -> list[dict]:
    """Maximal Marginal Relevance: greedily pick the candidate that
    maximizes ``lambda_mult * relevance - (1 - lambda_mult) * redundancy``,
    where redundancy is similarity to whatever's already been picked.

    Standard IR technique (Carbonell & Goldstein, SIGIR 1998) for exactly
    the failure mode found live 2026-07-22: a high-volume source (a Google
    News keyword feed with dozens of near-identical "what is the AI Act"
    explainer articles) swept every slot in a plain top-k-by-similarity
    ranking, crowding out genuinely current newsletter content that ranked
    only slightly lower. MMR fixes this by making near-duplicates of an
    already-picked passage actively unattractive, so diversity falls out of
    passages actually differing from each other — not a per-source quota
    that has to be hand-maintained as sources are added or removed.
    ``lambda_mult`` favors relevance over diversity (0.6, not the more even
    0.5 default some libraries use) since this must never surface something
    irrelevant just because it's different — every candidate here has
    already cleared ``min_score`` before this runs. Each candidate dict
    must carry ``score`` (query relevance) and ``_vec`` (embedding); both
    are consumed here, ``_vec`` is stripped by the caller before returning."""
    if len(candidates) <= k:
        return candidates
    pool = list(candidates)
    selected: list[dict] = []
    while pool and len(selected) < k:
        best_idx, best_mmr = 0, None
        for i, cand in enumerate(pool):
            redundancy = (
                max(_cosine_sim(cand["_vec"], s["_vec"]) for s in selected) if selected else 0.0
            )
            mmr_score = lambda_mult * cand["score"] - (1 - lambda_mult) * redundancy
            if best_mmr is None or mmr_score > best_mmr:
                best_idx, best_mmr = i, mmr_score
        selected.append(pool.pop(best_idx))
    return selected


#: Document types that make up the political-narrative layer. Inclusion is by
#: type rather than by a source allowlist because adapters set the type at
#: ingestion and `reclassify` fills in stragglers — so a newly added press source
#: is eligible immediately and cannot drift out of a hand-kept list.
PRESS_DOCUMENT_TYPES = (
    DocumentType.PRESS,
    DocumentType.NEWSLETTER,
    DocumentType.VERBATIM_DEBATE,
)


def press_passages(
    session: Session,
    embedder: Embedder,
    query: str,
    *,
    exclude_source_keys: frozenset[str] | set[str] = frozenset(),
    days: int = 90,
    k: int = 5,
    min_score: float | None = None,
) -> list[dict]:
    """Recency-filtered semantic search restricted to press/political-
    narrative sources (news outlets, institutional press releases,
    parliamentary floor-debate transcripts).

    A separate pass from semantic_search()'s relevance-only ranking:
    legal text doesn't go stale (GDPR from 2016 is as valid as anything
    new), so semantic_search/canon_passages are deliberately
    recency-agnostic — but press/political coverage does go stale, and an
    old article isn't useful "political landscape" context. ``source_keys``
    is a curated allowlist (see briefing.py's _PRESS_SOURCE_KEYS) rather
    than a document_type filter, since document_type doesn't reliably
    separate press from other "other"-typed sources (verbatim debates,
    legislative-tracking feeds) — mirrors how _CANON_CELEX is a curated
    allowlist for the same reason (automatic classification wasn't precise
    enough).

    ``min_score`` matters more here than for semantic_search(): a weak
    press match becomes weak, generic-sounding narrative color in the
    brief, not just a slightly-off citation — see semantic_search()'s
    docstring for the general floor semantics (drops results below the
    floor rather than backfilling; None preserves no-floor behavior). The
    floor is applied BEFORE the MMR diversification below, not after — MMR
    only reorders among candidates already judged relevant enough, it never
    pulls in something that wouldn't have qualified on its own.

    Over-fetches well past ``k`` and reranks with MMR (see _mmr_select)
    rather than a flat top-k-by-similarity slice — found live 2026-07-22
    that a plain slice let one high-volume source's near-duplicate content
    sweep every slot for topically narrow queries, even after fixing a
    separate ef_search under-provisioning bug. The over-fetch pool is capped
    at 100 candidates: MMR is O(pool * k), and 100 already comfortably
    exceeds pgvector's own practical ANN yield for a narrow filter."""
    cutoff = dt.date.today() - dt.timedelta(days=days)
    qvec = embedder.embed([query])[0]
    pool_size = min(max(k * 8, 40), 100)
    # Exact scan, not the HNSW index — the same choice document_passages()
    # makes, and for the same reason.
    #
    # This query's type + date filter narrows the eligible pool to ~10,600 of
    # 108,900 passages (9.7%), which is precisely where an approximate index
    # misbehaves: HNSW explores a bounded region of the graph, and when the query
    # is topically far from a sparse eligible subset the exploration can fail to
    # find ANY of it and return zero rows rather than weaker ones. That bit twice
    # — first with ~1,600 eligible rows (ef_search 40 → 100), then again at
    # ~10,400 (100 → 1,000, pgvector's own hard ceiling) — and each fix left a
    # standing instruction to re-verify as the pool grew. The pool grew again on
    # 2026-07-28 when press inclusion became type-based, and there was no headroom
    # left to raise.
    #
    # So the ef_search tuning was compensating for the wrong access method. An
    # exact scan over 10,600 vectors is deterministic by construction, cannot
    # silently return zero, needs no threshold to maintain, and measured *faster*
    # than the ANN path it replaces (0.71s vs 1.01s) — because exploring an HNSW
    # graph at ef_search=1,000 costs more than 10,600 honest distance
    # computations. Same results on the profiles compared.
    #
    # Revisit only if this pool grows by an order of magnitude: the cost is
    # linear in eligible rows, so ~100k would be the point to reconsider.
    #
    # Scoped to THIS query, not to the transaction. SET LOCAL lasts until the
    # transaction ends, and a brief runs every one of its retrieval queries in a
    # single transaction — so leaving these off leaked the exact-scan choice onto
    # every later vector query, forcing the HNSW-backed legal searches into full
    # scans of all 111k passages at 1.03s each instead of 0.43s (measured
    # 2026-07-29). It happens to cost nothing today only because this call runs
    # last in generate_briefing; that is call ordering, not a guarantee, and it
    # already invalidated a retrieval-variance measurement that shared one
    # transaction across repeats. Restore in a finally so the guarantee is local.
    previous = {
        name: session.execute(text(f"SHOW {name}")).scalar()
        for name in ("enable_indexscan", "enable_bitmapscan")
    }
    session.execute(text("SET LOCAL enable_indexscan = off"))
    session.execute(text("SET LOCAL enable_bitmapscan = off"))
    try:
        return _press_candidates(
            session, qvec, cutoff, exclude_source_keys, pool_size, min_score, k
        )
    finally:
        for name, value in previous.items():
            session.execute(text(f"SET LOCAL {name} = {'on' if value == 'on' else 'off'}"))


def _press_candidates(
    session: Session,
    qvec: list[float],
    cutoff: dt.date,
    exclude_source_keys: frozenset[str] | set[str],
    pool_size: int,
    min_score: float | None,
    k: int,
) -> list[dict]:
    """The press query itself. Split out only so the planner settings above can be
    restored in a ``finally`` without wrapping the whole function body."""
    stmt = (
        select(
            Passage.text,
            Passage.char_start,
            Passage.char_end,
            Passage.embedding,
            DocumentVersion.document_id.label("document_id"),
            Document.title,
            Document.celex,
            Document.url,
            Document.date_document,
            Document.lifecycle_stage,
            Document.jurisdiction,
            Document.document_type,
            Document.extra,
            Source.key.label("source_key"),
            Passage.embedding.cosine_distance(qvec).label("distance"),
        )
        .join(DocumentVersion, Passage.version_id == DocumentVersion.id)
        .join(Document, DocumentVersion.document_id == Document.id)
        .join(Source, Document.source_id == Source.id)
        .where(
            Passage.embedding.is_not(None),
            DocumentVersion.is_current.is_(True),
            Document.document_type.in_(PRESS_DOCUMENT_TYPES),
            Source.key.notin_(exclude_source_keys) if exclude_source_keys else sa_true(),
            Document.date_document.is_not(None),
            Document.date_document >= cutoff,
        )
        .order_by("distance")
        .limit(pool_size)
    )
    rows = session.execute(stmt).all()
    candidates = []
    for row in rows:
        passage = _row_to_passage(row)
        passage["source_key"] = row.source_key
        if min_score is not None and passage["score"] < min_score:
            continue
        candidates.append({**passage, "_vec": row.embedding})
    selected = _mmr_select(candidates, k=k)
    for s in selected:
        s.pop("_vec", None)
    return selected
