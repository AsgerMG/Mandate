"""Pipeline orchestration: run an adapter, persist documents/versions/passages.

Responsibilities the adapters deliberately don't carry:
  * content hashing + version detection (skip unchanged, supersede on change)
  * upsert of the Document row keyed by (source, external_id)
  * (re)chunking a new version into passages
  * cursor + last_run bookkeeping on the Source row
"""

from __future__ import annotations

import datetime as dt
import hashlib

import structlog
from sqlalchemy import select
from sqlalchemy.orm import Session

from data.models import (
    Document,
    DocumentVersion,
    Passage,
    PolicyArea,
    Sector,
    Source,
)

from .adapters.base import ParsedDocument, SourceAdapter
from .chunking import chunk_text

log = structlog.get_logger(__name__)


def _hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _norm(text: str) -> str:
    """Normalize whitespace before hashing so trivial formatting churn doesn't
    create spurious new versions."""
    return "\n".join(line.strip() for line in (text or "").splitlines()).strip()


def ensure_source(session: Session, adapter: SourceAdapter) -> Source:
    source = session.scalar(select(Source).where(Source.key == adapter.key))
    if source is None:
        source = Source(
            key=adapter.key,
            name=adapter.name,
            jurisdiction=adapter.jurisdiction,
            base_url=adapter.base_url,
        )
        session.add(source)
        session.flush()
    return source


def run_adapter(session: Session, adapter: SourceAdapter, *, limit: int | None = None) -> dict:
    """Run one adapter end-to-end. Returns a small run summary."""
    source = ensure_source(session, adapter)
    since = _since(adapter, source)

    stats = {
        "discovered": 0,
        "new_docs": 0,
        "new_versions": 0,
        "unchanged": 0,
        "skipped": 0,
        "errors": 0,
    }
    seen = []

    for ref in adapter.discover(since, source.cursor):
        stats["discovered"] += 1
        seen.append(ref)
        try:
            raw = adapter.fetch(ref)
            parsed = adapter.parse(raw)
            if parsed is None:  # adapter judged it out of scope after full fetch
                stats["skipped"] += 1
                continue
            created_doc, created_ver = _persist(session, source, parsed, raw.fetched_at)
            stats["new_docs"] += int(created_doc)
            stats["new_versions"] += int(created_ver)
            stats["unchanged"] += int(not created_ver)
            session.flush()
        except Exception:  # one bad document must not abort the whole run
            stats["errors"] += 1
            log.exception("ingest_failed", source=adapter.key, external_id=ref.external_id)
        if limit and stats["discovered"] >= limit:
            break

    source.last_run_at = dt.datetime.now(dt.UTC)
    source.cursor = adapter.next_cursor(source.cursor, seen)
    log.info("source_run_complete", source=adapter.key, **stats)
    return stats


def _since(adapter: SourceAdapter, source: Source) -> dt.date:
    days = adapter.settings.backfill_days
    if source.last_run_at:  # incremental after the first full backfill
        return source.last_run_at.date()
    return dt.date.today() - dt.timedelta(days=days)


def _persist(
    session: Session, source: Source, parsed: ParsedDocument, fetched_at: dt.datetime
) -> tuple[bool, bool]:
    """Upsert document + add a new version if content changed. Returns
    (document_created, version_created)."""
    doc = session.scalar(
        select(Document).where(
            Document.source_id == source.id, Document.external_id == parsed.external_id
        )
    )
    created_doc = doc is None
    if doc is None:
        doc = Document(source_id=source.id, external_id=parsed.external_id)
        session.add(doc)

    # Refresh mutable metadata on every sighting (status, dates can change).
    doc.title = parsed.title
    doc.jurisdiction = parsed.jurisdiction
    doc.document_type = parsed.document_type
    doc.lifecycle_stage = parsed.lifecycle_stage
    doc.language = parsed.language
    doc.url = parsed.url
    doc.celex = parsed.celex
    doc.eli = parsed.eli
    doc.date_document = parsed.date_document
    doc.date_in_force = parsed.date_in_force
    doc.date_end_validity = parsed.date_end_validity
    doc.extra = parsed.extra or None
    _attach_vocab(session, doc, parsed)
    session.flush()

    content = _norm(parsed.text)
    content_hash = _hash(content)
    existing = session.scalar(
        select(DocumentVersion).where(
            DocumentVersion.document_id == doc.id,
            DocumentVersion.content_hash == content_hash,
        )
    )
    if existing is not None:
        return created_doc, False  # unchanged

    # New content: supersede prior current version, add this one + its passages.
    for v in doc.versions:
        v.is_current = False
    version = DocumentVersion(
        document_id=doc.id,
        content_hash=content_hash,
        raw_format=parsed.raw_format,
        text=content,
        char_count=len(content),
        fetched_at=fetched_at,
        is_current=True,
    )
    session.add(version)
    session.flush()

    for chunk in chunk_text(content):
        session.add(
            Passage(
                version_id=version.id,
                ordinal=chunk.ordinal,
                text=chunk.text,
                char_start=chunk.char_start,
                char_end=chunk.char_end,
            )
        )
    return created_doc, True


def _attach_vocab(session: Session, doc: Document, parsed: ParsedDocument) -> None:
    if parsed.policy_area_slugs:
        doc.policy_areas = list(
            session.scalars(
                select(PolicyArea).where(PolicyArea.slug.in_(parsed.policy_area_slugs))
            )
        )
    if parsed.sector_slugs:
        doc.sectors = list(
            session.scalars(select(Sector).where(Sector.slug.in_(parsed.sector_slugs)))
        )
