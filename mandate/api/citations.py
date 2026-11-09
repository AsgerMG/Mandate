"""Citations as mandate-api hands them out, and the one check every writer runs.

A citation is identified by the SHA-256 of the bytes it quotes, not by a
version id. Ids are per database; a sha256 is the same everywhere. That is what
lets a rehearsal (a local mandate-api on a throwaway database, reading
production grounding read-only as its REFERENCE store) cite a production
passage without ever confusing it with a local row that happens to share an id.

    resolve(stores, sha256=..., span=..., quote=...)   -> dict  (or CitationError)
    resolve(stores, url=..., quote=...)                -> dict  (newest fetch of the URL)

`stores` is (primary, reference): the reference may be None and is only read.
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass

from mandate.grounding import store as gstore


class CitationError(ValueError):
    """The citation does not resolve to the words it claims."""


@dataclass
class Stores:
    primary: object            # a psycopg connection (read/write)
    reference: object | None   # a psycopg connection (read-only), or None


_BY_SHA = ("SELECT v.id, d.canonical_url, d.title, d.publisher, v.fetched_at, "
           "       (SELECT max(f.fetched_at) FROM grounding.fetches f WHERE f.version_id = v.id), "
           "       v.sha256, v.text "
           "  FROM grounding.document_versions v JOIN grounding.documents d ON d.id = v.document_id "
           " WHERE v.sha256 = %s")
_BY_URL = ("SELECT v.id, d.canonical_url, d.title, d.publisher, v.fetched_at, f.fetched_at, "
           "       v.sha256, v.text "
           "  FROM grounding.fetches f "
           "  JOIN grounding.documents d ON d.id = f.document_id "
           "  JOIN grounding.document_versions v ON v.id = f.version_id "
           " WHERE d.canonical_url = %s ORDER BY f.fetched_at DESC, f.id DESC LIMIT 1")


def _iso(t: dt.datetime | None) -> str | None:
    return t.astimezone(dt.timezone.utc).isoformat() if t else None


def _lookup(stores: Stores, sql: str, key: str):
    for name, con in (("primary", stores.primary), ("reference", stores.reference)):
        if con is None:
            continue
        row = con.execute(sql, (key,)).fetchone()
        if row is not None:
            return name, tuple(row.values()) if isinstance(row, dict) else tuple(row)
    return None, None


def as_dict(row: tuple, span: tuple[int, int], store: str) -> dict:
    vid, url, title, publisher, first, last, sha, text = row
    return {
        "sha256": sha, "version_id": vid, "store": store,
        "canonical_url": url, "title": title, "publisher": publisher,
        "fetched_at": _iso(first), "last_seen_at": _iso(last or first),
        "span": [span[0], span[1]], "quote": text[span[0]:span[1]],
    }


def resolve(stores: Stores, *, quote: str, sha256: str | None = None,
            url: str | None = None, span: tuple[int, int] | None = None) -> dict:
    """The citation of `quote` in the document named by sha256 (preferred) or by
    URL (its newest fetch). With a span, the quote must be what the span holds
    (whitespace-insensitive); without one, the quote is located."""
    if not quote or not quote.strip():
        raise CitationError("a citation needs the quoted words")
    if sha256:
        store, row = _lookup(stores, _BY_SHA, sha256.lower())
        if row is None:
            raise CitationError(f"no grounding version with sha256 {sha256}")
    elif url:
        try:
            cu = gstore.canonical_url(url)
        except ValueError as e:
            raise CitationError(str(e)) from e
        store, row = _lookup(stores, _BY_URL, cu)
        if row is None:
            raise CitationError(f"{cu} has never been fetched into grounding")
    else:
        raise CitationError("name the document: sha256 or url")
    text = row[7]
    if text is None:
        raise CitationError("that version has no extracted text; it cannot be cited")
    if span is not None:
        s, e = int(span[0]), int(span[1])
        if not (0 <= s <= e <= len(text)):
            raise CitationError(f"span {span} is outside the text (0-{len(text)})")
        if gstore._squash(quote) not in gstore._squash(text[s:e]):  # noqa: SLF001
            # the span's words are the record; a quote that is not among them
            # is a claim about the document the document does not make
            loc = gstore.locate(text, quote)
            if loc is None:
                raise CitationError("the quote is not in the document")
            s, e = loc
        else:
            loc = gstore.locate(text[s:e], quote)
            if loc is not None:
                s, e = s + loc[0], s + loc[1]
        return as_dict(row, (s, e), store)
    loc = gstore.locate(text, quote)
    if loc is None:
        raise CitationError("the quote is not in the document")
    return as_dict(row, loc, store)


def verify(stores: Stores, citation: dict) -> dict:
    """Does a stored citation still say what it claims? For the eval's validator
    and for every writer that accepts a citation from an agent."""
    out = {"resolved": False, "quote_matched": False, "store": None, "reason": ""}
    sha, span, quote = citation.get("sha256"), citation.get("span"), citation.get("quote") or ""
    if not sha or not span or len(span) != 2:
        out["reason"] = "not a grounding citation (needs sha256 and span)"
        return out
    store, row = _lookup(stores, _BY_SHA, str(sha).lower())
    if row is None:
        out["reason"] = "sha256 not in grounding"
        return out
    out["resolved"], out["store"] = True, store
    text = row[7] or ""
    s, e = int(span[0]), int(span[1])
    if not (0 <= s <= e <= len(text)):
        out["reason"] = "span outside the text"
        return out
    if gstore._squash(quote) and gstore._squash(quote) == gstore._squash(text[s:e]):  # noqa: SLF001
        out["quote_matched"] = True
    else:
        out["reason"] = "quote differs from the span"
    return out


def check_citations(stores: Stores, citations: dict) -> dict:
    """Every citation a writer was handed, re-resolved from grounding. Returns the
    canonical forms keyed as given; raises CitationError naming the first that
    does not resolve. A writer stores what grounding says, never what the agent
    said grounding says."""
    out = {}
    for cid, c in (citations or {}).items():
        if not isinstance(c, dict):
            raise CitationError(f"citation {cid}: not an object")
        span = c.get("span")
        out[cid] = resolve(stores, quote=c.get("quote") or "", sha256=c.get("sha256"),
                           url=None if c.get("sha256") else c.get("canonical_url"),
                           span=tuple(span) if span else None)
        out[cid]["label"] = c.get("label") or out[cid].get("title")
    return out
