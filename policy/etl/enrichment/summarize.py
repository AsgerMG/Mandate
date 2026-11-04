"""Per-document synthesis into the ``enrichments`` table.

The table has existed since the original schema and had **zero rows** — nothing
in ``etl/`` ever wrote to it. This is the generator.

Two deliberate scope decisions, because "summarise the corpus" is the version of
this that costs a lot and buys little:

*Which documents.* Only instruments a brief reasons **about** — binding law, case
law and authoritative soft law. A newsletter already has a headline written by a
journalist; paying a model to summarise 3,139 of them adds nothing a brief would
ever cite. That takes the candidate set from 4,781 to a few hundred.

*Which model.* Haiku, following ``classification.py``'s precedent. This is
close-reading a document that is already in front of the model, not legal
reasoning over a retrieved corpus — the analytical work happens in
``intelligence/briefing.py`` with Sonnet, over passages this layer helps surface.

What the brief gets from it: ``summary`` gives retrieval a dense,
whole-instrument target to match against instead of only ~1,500-char windows, and
``plain_language``/``what_changes`` give each compliance-table row a grounded
one-liner without spending context on a full passage.

``citations`` records the passage ids the synthesis was generated from, so every
field stays auditable back to specific stored text — the same
"claims trace to sources by construction" rule the briefing layer follows.
"""

from __future__ import annotations

from typing import Any

import structlog
from sqlalchemy import select
from sqlalchemy.orm import Session

from data.models import Document, DocumentType, DocumentVersion, Enrichment, Passage

log = structlog.get_logger(__name__)

# Same model as classification.py, for the same reason (cost at corpus scale on
# a task that doesn't need frontier reasoning).
ENRICH_MODEL = "claude-haiku-4-5-20251001"

# Document types worth synthesising. Deliberately excludes PRESS, NEWSLETTER,
# VERBATIM_DEBATE, STAFF_WORKING_DOC, BUDGET and OTHER — see module docstring.
ENRICHABLE_TYPES = frozenset(
    {
        DocumentType.REGULATION,
        DocumentType.DIRECTIVE,
        DocumentType.DECISION,
        DocumentType.JUDGMENT,
        DocumentType.ENFORCEMENT_DECISION,
        DocumentType.GUIDELINE,
        DocumentType.STANDARD,
        DocumentType.PROPOSAL,
    }
)

# How much of a document to send. Long enough to cover an act's operative core,
# bounded so one 500k-char consolidated regulation can't dominate a run's cost.
# Passages arrive in document order, so this is the opening of the instrument —
# for EU acts that means title, subject matter and scope, which is exactly what
# a summary needs.
MAX_CHARS = 24_000

ENRICH_TOOL = {
    "name": "summarize_document",
    "description": "Summarise a regulatory document for a compliance analyst.",
    "input_schema": {
        "type": "object",
        "properties": {
            "summary": {
                "type": "string",
                "description": (
                    "2-3 sentences: what this instrument does and who it binds. "
                    "Name the actual obligations and the actors they fall on, not "
                    "the document's own framing of its importance."
                ),
            },
            "plain_language": {
                "type": "string",
                "description": (
                    "2-3 sentences a non-lawyer operator can act on: what a company "
                    "in scope actually has to DO. Concrete duties, thresholds and "
                    "deadlines where the text states them. No reassurance, no "
                    "'businesses should consider'."
                ),
            },
            "what_changes": {
                "type": "string",
                "description": (
                    "1-2 sentences on what this changes relative to the position "
                    "before it — a new duty, a raised threshold, a repeal, a "
                    "deadline. If the text does not say, write 'Not stated in this "
                    "document.' rather than inferring."
                ),
            },
        },
        "required": ["summary", "plain_language", "what_changes"],
    },
}

ENRICH_SYSTEM = (
    "You summarise EU and national regulatory documents for a compliance analyst who "
    "will act on what you write. Work only from the text provided — never from what you "
    "recall about the instrument, and never fill a gap with what a document of this kind "
    "usually says. If the provided text does not support a field, say so in that field "
    "instead of producing a plausible sentence. Prefer the operative fact (the duty, the "
    "threshold, the date, the actor) over the document's own abstract language about "
    "itself; a sentence that could describe any regulation is a wasted sentence."
)


def build_enrich_request(title: str, doc_type: str, text: str) -> dict[str, Any]:
    """The messages.create(**kwargs) payload for one document. Pure — no call."""
    return {
        "model": ENRICH_MODEL,
        "max_tokens": 1024,
        "system": ENRICH_SYSTEM,
        "tools": [ENRICH_TOOL],
        # Forced tool use: the point is three populated fields, not prose that
        # then has to be parsed out of a paragraph.
        "tool_choice": {"type": "tool", "name": "summarize_document"},
        "messages": [
            {
                "role": "user",
                "content": (
                    f"Document type: {doc_type}\nTitle: {title}\n\n"
                    f"Text (may be truncated):\n{text[:MAX_CHARS]}"
                ),
            }
        ],
    }


def _tool_payload(response: Any) -> dict | None:
    """The forced tool call's input, or None if the model returned prose."""
    for block in getattr(response, "content", []) or []:
        btype = block.get("type") if isinstance(block, dict) else getattr(block, "type", None)
        if btype == "tool_use":
            payload = (
                block.get("input") if isinstance(block, dict) else getattr(block, "input", None)
            )
            if isinstance(payload, dict):
                return payload
    return None


def _candidates(session: Session, limit: int | None) -> list[tuple[Document, str, list[int]]]:
    """Enrichable documents that don't have an enrichment yet, with their
    current version's text and the passage ids that text came from."""
    stmt = (
        select(Document)
        .where(Document.document_type.in_(ENRICHABLE_TYPES), Document.enrichment == None)  # noqa: E711
        .order_by(Document.id)
    )
    out: list[tuple[Document, str, list[int]]] = []
    for doc in session.scalars(stmt).all():
        rows = session.execute(
            select(Passage.id, Passage.text)
            .join(DocumentVersion, Passage.version_id == DocumentVersion.id)
            .where(DocumentVersion.document_id == doc.id, DocumentVersion.is_current.is_(True))
            .order_by(Passage.ordinal)
        ).all()
        if not rows:
            continue
        text, ids, used = "", [], 0
        for passage_id, passage_text in rows:
            if used >= MAX_CHARS:
                break
            text += passage_text + "\n\n"
            ids.append(passage_id)
            used += len(passage_text)
        out.append((doc, text, ids))
        if limit is not None and len(out) >= limit:
            break
    return out


def enrich_pending(
    session: Session, client: Any, *, limit: int | None = None, dry_run: bool = False
) -> dict:
    """Generate summary/plain_language/what_changes for enrichable documents
    that don't have an enrichment yet.

    Idempotent by construction: it only selects documents with no enrichment
    row, so re-running picks up newly ingested instruments and never re-pays for
    one already done. ``dry_run`` reports the candidate count and makes no API
    call — always worth running first, since this is the one enrichment in the
    project whose cost scales with corpus size.

    A per-document failure is logged and skipped rather than aborting: one
    malformed document must not cost the whole run's completed work.
    """
    candidates = _candidates(session, limit)
    if dry_run:
        return {"candidates": len(candidates), "written": 0, "errors": 0, "dry_run": True}

    written, errors = 0, 0
    for doc, text, passage_ids in candidates:
        try:
            response = client.messages.create(
                **build_enrich_request(doc.title, doc.document_type.value, text)
            )
            payload = _tool_payload(response)
            if payload is None:
                errors += 1
                log.warning("enrich_no_tool_call", document_id=doc.id)
                continue
            session.add(
                Enrichment(
                    document_id=doc.id,
                    summary=payload.get("summary"),
                    plain_language=payload.get("plain_language"),
                    what_changes=payload.get("what_changes"),
                    model=ENRICH_MODEL,
                    citations={"passage_ids": passage_ids},
                )
            )
            written += 1
            # Commit per document: this is a paid, long-running loop, and an
            # interruption at document 300 must not discard 299 paid-for results
            # — the same reasoning refresh applies per source.
            session.commit()
        except Exception:
            session.rollback()
            errors += 1
            log.exception("enrich_failed", document_id=doc.id)

    log.info("enriched", written=written, errors=errors, candidates=len(candidates))
    return {"candidates": len(candidates), "written": written, "errors": errors, "dry_run": False}
