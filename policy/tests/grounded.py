"""Seeding a document version the way production does: through mandate.grounding.

Before the move to schema grounding, tests built DocumentVersion and Passage rows
by hand. Those classes are now read-only views, so a test seeds through the same
store the pipeline writes (store_original + add_passages + a VersionRef), and a
fixture that would be impossible in production (a passage whose text is not in
its version) is impossible here too.
"""

from __future__ import annotations

import datetime as dt

from data import grounding_bridge as gb
from data.models import VersionRef
from mandate import grounding


def seed_version(
    session,
    document_id: int,
    *,
    text: str = "x",
    passages: list[str] = (),
    is_current: bool = True,
    fetched_at: dt.datetime | None = None,
    raw_format: str = "html",
    url: str | None = None,
) -> VersionRef:
    """One version of a document, its passages cut from its text, as a VersionRef.

    When the passages are not all in ``text`` (a fixture's placeholder text), the
    version text becomes the passages joined by newlines, so passage i starts one
    character after passage i-1 ends -- the offsets the old hand-built fixtures
    declared."""
    passages = list(passages)
    if passages and any(p not in text for p in passages):
        text = "\n".join(passages)
    con = gb.driver(session)
    v = grounding.store_original(
        con,
        text.encode("utf-8"),
        url or f"urn:mandate:policy:test:{document_id}",
        gb.TEXT_MIME,
        fetched_at or dt.datetime.now(dt.UTC),
        text=text,
        extractor="test",
    )
    spans, pos = [], 0
    for p in passages:
        i = text.find(p, pos)
        if i < 0:
            i = text.find(p)
        spans.append((i, i + len(p), None))
        pos = i + len(p)
    if spans:
        grounding.add_passages(con, v.id, gb.CHUNKER, spans)
    ref = VersionRef(
        document_id=document_id,
        grounding_version_id=v.id,
        raw_format=raw_format,
        fetched_at=fetched_at or dt.datetime.now(dt.UTC),
        is_current=is_current,
    )
    session.add(ref)
    session.flush()
    return ref
