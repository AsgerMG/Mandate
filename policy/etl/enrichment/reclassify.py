"""Re-derive document_type (and the CELEX-only stage fallback) over documents
already in the corpus.

Adapters classify at ingestion time, so a classifier improvement only reaches
documents fetched afterwards — and re-fetching 4,781 documents to re-run a pure
function over their CELEX ids would be absurd. This applies the current
classifier to what is already stored.

Why it matters more than it sounds: measured 2026-07-27, 459 real EU legal acts
were typed OTHER because `_classify_type` handled only R/L/D/PC/DC, and
`_DEEPEN_QUOTAS` sorts OTHER into the *commentary* tier — so the retrieval depth
budget was being spent as if those acts were newsletters. Classification is not
cosmetic metadata here; it decides what the brief gets to reason over.

Idempotent, and reports what it changed rather than only that it ran.
"""

from __future__ import annotations

from collections import Counter

import structlog
from sqlalchemy import select
from sqlalchemy.orm import Session

from data.models import Document, DocumentType, LifecycleStage, Source
from etl.adapters.eurlex import _classify_stage, _classify_type

log = structlog.get_logger(__name__)


def reclassify_celex_documents(session: Session, *, dry_run: bool = False) -> dict:
    """Re-derive type/stage for every document carrying a CELEX id.

    Only CELEX-bearing documents: the classifier reads a CELEX and nothing else,
    so a press item without one has nothing to re-derive and is left alone.

    Stage is only ever *filled in*, never overwritten — a stage that came from
    richer metadata (Cellar dates, an adapter's own procedure phase) must not be
    clobbered by the coarse CELEX fallback. Types are overwritten, because the
    classifier is the single authority on what a CELEX denotes.
    """
    documents = session.scalars(select(Document).where(Document.celex.is_not(None))).all()
    type_changes: Counter[str] = Counter()
    stage_fills: Counter[str] = Counter()

    for doc in documents:
        new_type = _classify_type(doc.celex)
        if new_type != doc.document_type:
            type_changes[f"{doc.document_type.value} -> {new_type.value}"] += 1
            if not dry_run:
                doc.document_type = new_type
        if doc.lifecycle_stage is LifecycleStage.UNKNOWN:
            new_stage = _classify_stage(doc.celex)
            if new_stage is not LifecycleStage.UNKNOWN:
                stage_fills[new_stage.value] += 1
                if not dry_run:
                    doc.lifecycle_stage = new_stage

    if not dry_run:
        session.commit()

    result = {
        "documents_examined": len(documents),
        "types_changed": sum(type_changes.values()),
        "type_transitions": dict(type_changes.most_common()),
        "stages_filled": sum(stage_fills.values()),
        "stage_fills": dict(stage_fills.most_common()),
        "dry_run": dry_run,
    }
    log.info("reclassified", **{k: v for k, v in result.items() if not isinstance(v, dict)})
    return result


# Source-key prefixes whose documents are subscription/institutional
# newsletters. Both are whole adapter families (etl/adapters/
# politico_newsletters.py builds keys as "politico_<slug>";
# ec_newsroom_newsletters.py as "ec_newsroom_<slug>"), so a prefix rule tracks
# the adapter instead of needing a per-feed list that drifts as feeds are added.
_NEWSLETTER_KEY_PREFIXES = ("politico_", "ec_newsroom_")


def _classify_by_source(source_key: str, extra: dict | None) -> DocumentType | None:
    """Type for a document with no CELEX to read, or None to leave it alone.

    Deliberately reuses signals that already exist rather than introducing a
    fourth hand-maintained list: the adapters' own ``extra["kind"]`` marker for
    verbatim debates, adapter-family key prefixes for newsletters, and
    briefing.py's curated ``_PRESS_SOURCE_KEYS`` allowlist for journalism. That
    allowlist exists *because* document_type couldn't express "this is press";
    consuming it here is the first step toward the type system carrying that
    knowledge instead.
    """
    if (extra or {}).get("kind") == "verbatim_debate":
        return DocumentType.VERBATIM_DEBATE
    if source_key.startswith(_NEWSLETTER_KEY_PREFIXES):
        return DocumentType.NEWSLETTER
    # Imported lazily: etl.intelligence imports the enrichment package, so a
    # module-level import here would close a cycle.
    from etl.intelligence.briefing import _PRESS_SOURCE_KEYS

    if source_key in _PRESS_SOURCE_KEYS:
        return DocumentType.PRESS
    return None


def reclassify_by_source(session: Session, *, dry_run: bool = False) -> dict:
    """Type the documents that carry no CELEX — newsletters, verbatim debates,
    journalism — which no amount of CELEX parsing can reach.

    Only touches documents currently typed OTHER. A document an adapter typed
    deliberately (PRESS, CONSULTATION) is left as the adapter decided; this is
    for filling the gap, not overruling.
    """
    rows = session.execute(
        select(Document, Source.key)
        .join(Source, Document.source_id == Source.id)
        .where(Document.celex.is_(None), Document.document_type == DocumentType.OTHER)
    ).all()
    changes: Counter[str] = Counter()
    for doc, source_key in rows:
        new_type = _classify_by_source(source_key, doc.extra)
        if new_type is not None and new_type != doc.document_type:
            changes[f"{doc.document_type.value} -> {new_type.value}"] += 1
            if not dry_run:
                doc.document_type = new_type
    if not dry_run:
        session.commit()
    result = {
        "documents_examined": len(rows),
        "types_changed": sum(changes.values()),
        "type_transitions": dict(changes.most_common()),
        "dry_run": dry_run,
    }
    log.info(
        "reclassified_by_source",
        examined=result["documents_examined"],
        changed=result["types_changed"],
    )
    return result


def type_histogram(session: Session) -> dict[str, int]:
    """Current document_type distribution — the before/after view for a
    reclassification run, and the number to watch for authority drift as new
    sources are added."""
    counts: Counter[str] = Counter()
    for (dtype,) in session.execute(select(Document.document_type)).all():
        counts[dtype.value if isinstance(dtype, DocumentType) else str(dtype)] += 1
    return dict(counts.most_common())
