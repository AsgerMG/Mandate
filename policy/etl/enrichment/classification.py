"""Sector/policy-area tagging via a forced tool-call classification.

This module is the *only* writer of ``Document.policy_areas`` /
``Document.sectors``. The pipeline briefly had an ``_attach_vocab()``
write-path fed from ``ParsedDocument``; no adapter ever populated it, so it
was a no-op for every document ever ingested, and it has been removed (see
``etl/adapters/base.py``) — had an adapter ever started supplying tags it
would have overwritten this pass's output on every re-sighting and
permanently suppressed ``classify_pending``, whose filter is
``~Document.policy_areas.any()``.

Rather than teach every adapter (55+ sources, each with its own heuristics)
to guess its own tags at parse time, one bulk pass after ingestion tags the
whole corpus uniformly from one model — mirroring ``embed_pending()``'s
loop-while-untagged-rows-exist pattern.

Uses Haiku, not the project's default Sonnet: this is a simple category-
picking task, not legal reasoning, and cost matters at corpus scale.
"""

from __future__ import annotations

from typing import Any

import structlog
from sqlalchemy import select
from sqlalchemy.orm import Session

from data.models import Document, DocumentVersion, PolicyArea, Sector
from data.seeds import POLICY_AREAS, SECTORS

log = structlog.get_logger(__name__)

CLASSIFY_MODEL = "claude-haiku-4-5-20251001"

_POLICY_AREA_SLUGS = [slug for slug, _ in POLICY_AREAS]
_SECTOR_SLUGS = [slug for slug, _ in SECTORS]

CLASSIFY_TOOL = {
    "name": "classify_document",
    "description": (
        "Tag a regulatory document with the policy areas and industry sectors "
        "it is most relevant to."
    ),
    # Without `strict`, the schema below (enum, minItems) is advisory only: the
    # model is free to return an out-of-vocabulary slug, which
    # parse_classify_response then drops, leaving the document with zero policy
    # areas. Reproduced on production document id=4437, where the model returned
    # 'energy' — not a slug in POLICY_AREAS — and the document re-matched
    # classify_pending's `~policy_areas.any()` filter forever (~3,197 API calls
    # on that ONE document over 45 minutes on 2026-08-02, until Anthropic
    # returned 403). `strict` makes the enum an actual constraint, and requires
    # additionalProperties: false on every object in the schema.
    #
    # `maxItems` on an array is NOT supported under `strict` (confirmed live:
    # "tools.0.custom: For 'array' type, property 'maxItems' is not supported"
    # — a 400 on every call, found 2026-08-10 after this schema ran unexercised
    # against the real API for three days). `minItems` is unaffected — this was
    # verified with a live call before shipping this fix, not assumed from the
    # one error message. The "1-3" / "0-3" cardinality is now prompt guidance
    # only, backstopped by a slice in parse_classify_response.
    "strict": True,
    "input_schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "policy_areas": {
                "type": "array",
                "minItems": 1,
                "items": {"type": "string", "enum": _POLICY_AREA_SLUGS},
                "description": "1-3 policy areas this document is most centrally about.",
            },
            "sectors": {
                "type": "array",
                "items": {"type": "string", "enum": _SECTOR_SLUGS},
                "description": (
                    "0-3 industry sectors this document specifically targets or "
                    "disproportionately affects. Empty if it applies broadly "
                    "across sectors rather than to a specific industry."
                ),
            },
        },
        "required": ["policy_areas", "sectors"],
    },
}

_MAX_TAGS = 3

CLASSIFY_SYSTEM = (
    "You classify EU/national tech-policy documents (legislation, press coverage, "
    "parliamentary debate) against two small controlled vocabularies. Pick policy "
    "areas by what the document is substantively about, not every area it briefly "
    "touches. Only pick a sector when the document specifically targets or "
    "disproportionately affects that industry (e.g. the Machinery Regulation -> "
    "manufacturing) — most horizontal law (GDPR, AI Act, DSA) applies broadly and "
    "should get zero sectors, not one for every plausible use case."
)


def build_classify_request(title: str, text: str) -> dict[str, Any]:
    """Assemble the messages.create(**kwargs) payload for one document (no API call)."""
    prompt = f"Title: {title}\n\nText:\n{text[:2000]}"
    return {
        "model": CLASSIFY_MODEL,
        "max_tokens": 300,
        "system": CLASSIFY_SYSTEM,
        "tools": [CLASSIFY_TOOL],
        "tool_choice": {"type": "tool", "name": "classify_document"},
        "messages": [{"role": "user", "content": prompt}],
    }


def parse_classify_response(content_blocks: list[Any]) -> dict[str, list[str]]:
    """Pull {"policy_areas": [...], "sectors": [...]} out of the tool-call
    response. Filters against the known slugs defensively — with
    ``"strict": True`` on the tool the enum is enforced server-side, but this
    stays as the second line of defence, and callers must still cope with an
    empty result (see classify_pending's made-progress guard).

    Also caps each list at ``_MAX_TAGS``: the schema cannot express "at most 3"
    under ``strict`` (``maxItems`` on an array isn't supported there), so the
    cardinality is prompt guidance only and this is the backstop."""
    for block in content_blocks:
        btype = block.get("type") if isinstance(block, dict) else getattr(block, "type", None)
        if btype != "tool_use":
            continue
        payload = block.get("input") if isinstance(block, dict) else getattr(block, "input", {})
        payload = payload or {}
        return {
            "policy_areas": [
                s for s in payload.get("policy_areas", []) if s in _POLICY_AREA_SLUGS
            ][:_MAX_TAGS],
            "sectors": [s for s in payload.get("sectors", []) if s in _SECTOR_SLUGS][:_MAX_TAGS],
        }
    return {"policy_areas": [], "sectors": []}


def classify_pending(session: Session, client: Any, *, batch_size: int = 50) -> int:
    """Classify every Document with no policy_areas tagged yet. Returns the
    number of documents attempted.

    Filters on ``policy_areas`` alone (not ``sectors``): a correctly-classified
    horizontal document (GDPR, AI Act) can legitimately end up with zero
    sectors, so filtering on ``sectors`` too would re-classify it forever.

    That filter is *not* a guarantee of progress, which is the trap this
    function was built on. The tool schema asks for at least one policy area,
    but a schema is only enforced when the tool carries ``"strict": True`` —
    without it the model can return an out-of-vocabulary slug, which
    parse_classify_response drops, leaving the document with an empty
    ``policy_areas`` that re-matches the filter on the very next iteration.
    ``strict`` is now set (see CLASSIFY_TOOL), but the loop no longer *relies*
    on it: every document is attempted at most once per run, tracked in
    ``attempted`` and excluded from later batches, so a document that cannot be
    classified is skipped and logged rather than retried until the API cuts us
    off. Re-running the pass retries it, which is the right cadence for a
    transient model failure.

    Whole-document, not per-version: a document's classification (what it's
    about, who it affects) rarely changes across content revisions, unlike
    embeddings which must track the current version's actual text.
    """
    policy_area_by_slug = {row.slug: row for row in session.scalars(select(PolicyArea))}
    sector_by_slug = {row.slug: row for row in session.scalars(select(Sector))}
    attempted: set[int] = set()
    total = 0
    unresolved = 0
    while True:
        stmt = (
            select(Document, DocumentVersion.text)
            .join(DocumentVersion, DocumentVersion.document_id == Document.id)
            .where(DocumentVersion.is_current.is_(True), ~Document.policy_areas.any())
            .order_by(Document.id)
            .limit(batch_size)
        )
        if attempted:
            stmt = stmt.where(Document.id.notin_(attempted))
        rows = session.execute(stmt).all()
        if not rows:
            break
        for doc, text in rows:
            attempted.add(doc.id)
            request = build_classify_request(doc.title, text or "")
            response = client.messages.create(**request)
            tags = parse_classify_response(response.content)
            if not tags["policy_areas"]:
                # No usable policy area came back. The document stays untagged
                # and is skipped for the rest of this run — never re-selected.
                unresolved += 1
                log.warning("classify_no_policy_areas", document_id=doc.id, title=doc.title[:120])
                continue
            # .get() rather than [] — an unseeded vocabulary table would
            # otherwise raise KeyError mid-batch and lose the whole run's work.
            doc.policy_areas = [
                row for s in tags["policy_areas"] if (row := policy_area_by_slug.get(s))
            ]
            doc.sectors = [row for s in tags["sectors"] if (row := sector_by_slug.get(s))]
        session.commit()
        total += len(rows)
        log.info("classified_batch", count=len(rows), total=total, unresolved=unresolved)
    if unresolved:
        log.warning("classify_unresolved_documents", count=unresolved)
    return total
