"""Sector/policy-area tagging via a forced tool-call classification.

``etl/pipeline.py``'s ``_attach_vocab()`` write-path already exists and works
— it's just never fed a non-empty ``policy_area_slugs``/``sector_slugs`` by
any adapter's ``ParsedDocument``, so it's a no-op for every document ever
ingested. Rather than teach every adapter (55+ sources, each with its own
heuristics) to guess its own tags at parse time, one bulk pass after
ingestion tags the whole corpus uniformly from one model — mirroring
``embed_pending()``'s loop-while-untagged-rows-exist pattern.

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
    "input_schema": {
        "type": "object",
        "properties": {
            "policy_areas": {
                "type": "array",
                "minItems": 1,
                "maxItems": 3,
                "items": {"type": "string", "enum": _POLICY_AREA_SLUGS},
                "description": "1-3 policy areas this document is most centrally about.",
            },
            "sectors": {
                "type": "array",
                "maxItems": 3,
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
    response. Filters against the known slugs defensively — the tool
    schema's enum should already prevent anything else."""
    for block in content_blocks:
        btype = block.get("type") if isinstance(block, dict) else getattr(block, "type", None)
        if btype != "tool_use":
            continue
        payload = block.get("input") if isinstance(block, dict) else getattr(block, "input", {})
        payload = payload or {}
        return {
            "policy_areas": [s for s in payload.get("policy_areas", []) if s in _POLICY_AREA_SLUGS],
            "sectors": [s for s in payload.get("sectors", []) if s in _SECTOR_SLUGS],
        }
    return {"policy_areas": [], "sectors": []}


def classify_pending(session: Session, client: Any, *, batch_size: int = 50) -> int:
    """Classify every Document with no policy_areas tagged yet. Returns the
    number classified.

    Filters on ``policy_areas`` alone (not ``sectors``) for idempotency: the
    tool schema requires at least one policy area per document, so a
    classified document always has a non-empty ``policy_areas``, but a
    correctly-classified horizontal document (GDPR, AI Act) can legitimately
    end up with zero sectors — filtering on ``sectors`` too would re-classify
    it forever.

    Whole-document, not per-version: a document's classification (what it's
    about, who it affects) rarely changes across content revisions, unlike
    embeddings which must track the current version's actual text.
    """
    policy_area_by_slug = {row.slug: row for row in session.scalars(select(PolicyArea))}
    sector_by_slug = {row.slug: row for row in session.scalars(select(Sector))}
    total = 0
    while True:
        rows = session.execute(
            select(Document, DocumentVersion.text)
            .join(DocumentVersion, DocumentVersion.document_id == Document.id)
            .where(DocumentVersion.is_current.is_(True), ~Document.policy_areas.any())
            .order_by(Document.id)
            .limit(batch_size)
        ).all()
        if not rows:
            break
        for doc, text in rows:
            request = build_classify_request(doc.title, text or "")
            response = client.messages.create(**request)
            tags = parse_classify_response(response.content)
            doc.policy_areas = [policy_area_by_slug[s] for s in tags["policy_areas"]]
            doc.sectors = [sector_by_slug[s] for s in tags["sectors"]]
        session.commit()
        total += len(rows)
        log.info("classified_batch", count=len(rows), total=total)
    return total
