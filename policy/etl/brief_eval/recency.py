"""Read-only check: of the documents ingested recently, how many actually
show up in the panel's retrieved passages this round?

This is a corpus/retrieval signal independent of any single system-prompt
wording change — a prompt tweak alone can't fix a genuinely missing
retrieval hit, but it's useful context for the candidate-proposal step and
for the report either way.
"""

from __future__ import annotations

import datetime as dt

from sqlalchemy import select
from sqlalchemy.orm import Session

from data.models import Document


def recency_coverage(session: Session, retrieved_celex: set[str], within_days: int = 30) -> dict:
    cutoff = dt.datetime.now(dt.UTC) - dt.timedelta(days=within_days)
    recent = session.scalars(
        select(Document.celex).where(Document.created_at >= cutoff, Document.celex.is_not(None))
    ).all()
    recent_set = {c for c in recent if c}
    if not recent_set:
        return {"recent_total": 0, "recent_covered": 0, "coverage_pct": None}
    covered = recent_set & retrieved_celex
    return {
        "recent_total": len(recent_set),
        "recent_covered": len(covered),
        "coverage_pct": round(100 * len(covered) / len(recent_set), 1),
    }
