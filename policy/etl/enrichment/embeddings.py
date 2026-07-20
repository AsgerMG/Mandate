"""Embeddings: turn passage text into vectors, and search by meaning.

A pluggable ``Embedder`` keeps the provider swappable — the default is a small,
free, local model (BGE via fastembed) so meaning-search works offline with no
API key; a hosted model (Voyage, OpenAI) is a drop-in replacement later.

The embedding step is intentionally separate from ingestion so the pipeline can
run offline; populate vectors afterwards with ``regina embed``.
"""

from __future__ import annotations

import datetime as dt
from typing import Protocol

import structlog
from sqlalchemy import select
from sqlalchemy.orm import Session

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


def get_embedder(settings: Settings) -> Embedder:
    """Return the configured embedder. Local by default; extend here for
    hosted providers (e.g. a VoyageEmbedder keyed on the model name)."""
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
        "date_document": row.date_document.isoformat() if getattr(row, "date_document", None) else None,
    }


def semantic_search(session: Session, embedder: Embedder, query: str, *, k: int = 5) -> list[dict]:
    """Return the k passages closest in meaning to the query, each with the
    citation context needed to quote it."""
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
    return [_row_to_passage(row) for row in session.execute(stmt).all()]


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
    enough)."""
    cutoff = dt.date.today() - dt.timedelta(days=days)
    qvec = embedder.embed([query])[0]
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
    return [_row_to_passage(row) for row in session.execute(stmt).all()]
