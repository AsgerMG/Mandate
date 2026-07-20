"""Writes RetrievalEvent rows for real /api/brief traffic.

Only called from etl/api.py's /api/brief handler, and only when
Settings.brief_eval_enabled is true. Keys passages by (celex/url/title,
char_start, char_end) — the same identity scheme briefing.parse_response
already uses to resolve citations — so no upstream schema change was needed
to support this.
"""

from __future__ import annotations

import datetime as dt

from sqlalchemy import delete
from sqlalchemy.orm import Session

from data.config import get_settings
from data.models import RetrievalEvent


def _key(src: dict) -> str:
    return str(src.get("celex") or src.get("url") or src.get("title") or "")


def log_retrieval_event(
    session: Session, query: str, retrieved: list[dict], citations: list[dict]
) -> None:
    """Record which of the passages handed to the model actually got cited,
    then prune anything past the retention window in the same transaction —
    this table carries real user-submitted company descriptions, so it's
    self-bounding rather than kept indefinitely."""
    cited_keys = {_key(c) for c in citations}
    rows = [
        {
            "key": _key(p),
            "title": p.get("title"),
            "celex": p.get("celex"),
            "char_start": p.get("char_start"),
            "char_end": p.get("char_end"),
        }
        for p in retrieved
    ]
    cited_rows = [r for r in rows if r["key"] and r["key"] in cited_keys]
    session.add(RetrievalEvent(query=query, retrieved=rows, cited=cited_rows))

    retention_days = get_settings().brief_eval_retention_days
    cutoff = dt.datetime.now(dt.UTC) - dt.timedelta(days=retention_days)
    session.execute(delete(RetrievalEvent).where(RetrievalEvent.created_at < cutoff))
