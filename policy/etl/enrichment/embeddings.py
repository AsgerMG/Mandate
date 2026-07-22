"""Embeddings: turn passage text into vectors, and search by meaning.

A pluggable ``Embedder`` keeps the provider swappable — the default is a small,
free, local model (BGE via fastembed) so meaning-search works offline with no
API key; a hosted model (Voyage, OpenAI) is a drop-in replacement later.

The embedding step is intentionally separate from ingestion so the pipeline can
run offline; populate vectors afterwards with ``regina embed``.
"""

from __future__ import annotations

import datetime as dt
import os
from typing import Protocol

import httpx
import structlog
from sqlalchemy import select, text
from sqlalchemy.orm import Session
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from data.config import Settings
from data.models import Document, DocumentVersion, Passage, Source

log = structlog.get_logger(__name__)


class Embedder(Protocol):
    dim: int

    def embed(self, texts: list[str]) -> list[list[float]]: ...


class LocalEmbedder:
    """fastembed-backed local embedder (ONNX, CPU, no API key)."""

    def __init__(self, model_name: str, dim: int):
        from fastembed import TextEmbedding

        self._model = TextEmbedding(model_name)
        self.dim = dim

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [v.tolist() for v in self._model.embed(list(texts))]


def _is_retryable_voyage(exc: BaseException) -> bool:
    """Same policy as etl/http.py's HttpClient: retry transient failures
    (network errors, 429, 5xx) only — a 4xx like a bad model name or an
    invalid key is permanent and must surface immediately, not retry-loop."""
    if isinstance(exc, httpx.TransportError):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code == 429 or exc.response.status_code >= 500
    return False


class VoyageEmbedder:
    """Voyage AI-backed embedder (hosted, paid) — a drop-in Embedder for a
    corpus that has outgrown the local model's quality and, specifically,
    its English-only training (this corpus has real French/German content
    from an_verbatim/de_verbatim and FR/DE press).

    Doesn't reuse etl/http.py's HttpClient: that client's per-request
    politeness sleep exists for scraping courtesy on free public feeds, not
    a paid, already-rate-limited embeddings API — and it has no seam for a
    custom Authorization header. Retries the same transient failures it
    does, via the same tenacity policy.
    """

    _ENDPOINT = "https://api.voyageai.com/v1/embeddings"
    # Voyage's own cap for "large" models (e.g. voyage-4-large) is 120K tokens
    # per request; this leaves margin since we estimate tokens from character
    # count rather than real tokenization. A handful of this corpus's
    # passages were chunked before chunking.py's MAX_CHARS ceiling existed
    # and run to hundreds of thousands of characters — a fixed row-count
    # batch (embed_pending's default 128) can contain enough of them to blow
    # past the cap even though no single passage does, so batching here has
    # to be token-aware, not just row-count-aware.
    _MAX_TOKENS_PER_REQUEST = 100_000
    _CHARS_PER_TOKEN_ESTIMATE = 4

    def __init__(
        self, model_name: str, dim: int, api_key: str, *, client: httpx.Client | None = None
    ):
        self._model = model_name
        self.dim = dim
        self._client = client or httpx.Client(timeout=60.0)
        self._headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        vectors: list[list[float]] = []
        for batch in self._token_aware_batches(list(texts)):
            data = self._request(batch)
            vectors.extend(row["embedding"] for row in data["data"])
        return vectors

    def _token_aware_batches(self, texts: list[str]) -> list[list[str]]:
        batches: list[list[str]] = []
        current: list[str] = []
        current_tokens = 0
        for item in texts:
            item_tokens = max(1, len(item) // self._CHARS_PER_TOKEN_ESTIMATE)
            if current and current_tokens + item_tokens > self._MAX_TOKENS_PER_REQUEST:
                batches.append(current)
                current, current_tokens = [], 0
            current.append(item)
            current_tokens += item_tokens
        if current:
            batches.append(current)
        return batches

    @retry(
        retry=retry_if_exception(_is_retryable_voyage),
        stop=stop_after_attempt(4),
        wait=wait_exponential(multiplier=1, min=1, max=20),
        reraise=True,
    )
    def _request(self, texts: list[str]) -> dict:
        resp = self._client.post(
            self._ENDPOINT,
            headers=self._headers,
            json={"input": texts, "model": self._model, "output_dimension": self.dim},
        )
        resp.raise_for_status()
        return resp.json()


def get_embedder(settings: Settings) -> Embedder:
    """Return the configured embedder. Local by default; a Voyage model name
    (see .env.example) switches to the hosted VoyageEmbedder — VOYAGE_API_KEY
    is read directly from the environment, matching how ANTHROPIC_API_KEY is
    read directly by etl/intelligence/llm.py rather than through Settings."""
    if settings.embedding_model.startswith("voyage-"):
        api_key = os.environ.get("VOYAGE_API_KEY")
        if not api_key:
            raise RuntimeError(
                "EMBEDDING_MODEL is set to a Voyage model but VOYAGE_API_KEY is not set."
            )
        return VoyageEmbedder(settings.embedding_model, settings.embedding_dim, api_key)
    return LocalEmbedder(settings.embedding_model, settings.embedding_dim)


def embed_pending(session: Session, embedder: Embedder, *, batch_size: int = 128) -> int:
    """Embed every passage whose vector is still NULL, in batches. Returns the
    number embedded.

    Restricted to current-version passages: a superseded version's passages
    (kept around for the schema's own change-tracking/audit purpose — see
    models.py) are never retrievable once ``semantic_search``/
    ``canon_passages`` filter on ``is_current`` (see below), so embedding
    them would just burn CPU on vectors nothing will ever read."""
    total = 0
    while True:
        passages = session.scalars(
            select(Passage)
            .join(DocumentVersion, Passage.version_id == DocumentVersion.id)
            .where(Passage.embedding.is_(None), DocumentVersion.is_current.is_(True))
            .order_by(Passage.id)
            .limit(batch_size)
        ).all()
        if not passages:
            break
        vectors = embedder.embed([p.text for p in passages])
        for passage, vector in zip(passages, vectors, strict=True):
            passage.embedding = vector
        session.commit()
        total += len(passages)
        log.info("embedded_batch", count=len(passages), total=total)
    return total


def _row_to_passage(row) -> dict:
    return {
        "title": row.title,
        "celex": row.celex,
        "url": row.url,
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


def press_passages(
    session: Session,
    embedder: Embedder,
    query: str,
    source_keys: set[str],
    *,
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
    floor rather than backfilling; None preserves no-floor behavior)."""
    cutoff = dt.date.today() - dt.timedelta(days=days)
    qvec = embedder.embed([query])[0]
    # pgvector's HNSW index approximates nearest neighbors by exploring a
    # bounded region of the graph (hnsw.ef_search, default 40). That's fine
    # for semantic_search()'s near-unfiltered scan of the whole corpus, but
    # this query's Source.key + date filter narrows the eligible pool to a
    # sparse subset (~1,600 of 58,000+ passages) — when the query is
    # topically far from that subset, the default exploration budget can
    # fail to find ANY of them and silently return zero rows, not just
    # weaker ones. Found live 2026-07-22: 3 of 5 eval-panel profiles got 0
    # press passages despite thousands of eligible rows existing; ef_search
    # >=100 reliably found the true nearest matches in every case tested.
    # SET LOCAL scopes this to the current transaction only.
    session.execute(text("SET LOCAL hnsw.ef_search = 100"))
    stmt = (
        select(
            Passage.text,
            Passage.char_start,
            Passage.char_end,
            Document.title,
            Document.celex,
            Document.url,
            Document.date_document,
            Document.lifecycle_stage,
            Document.jurisdiction,
            Document.document_type,
            Document.extra,
            Passage.embedding.cosine_distance(qvec).label("distance"),
        )
        .join(DocumentVersion, Passage.version_id == DocumentVersion.id)
        .join(Document, DocumentVersion.document_id == Document.id)
        .join(Source, Document.source_id == Source.id)
        .where(
            Passage.embedding.is_not(None),
            DocumentVersion.is_current.is_(True),
            Source.key.in_(source_keys),
            Document.date_document.is_not(None),
            Document.date_document >= cutoff,
        )
        .order_by("distance")
        .limit(k)
    )
    results = [_row_to_passage(row) for row in session.execute(stmt).all()]
    if min_score is not None:
        return [r for r in results if r["score"] >= min_score]
    return results
