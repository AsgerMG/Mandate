"""Store an original, fetch one, cite a span of one.

    from mandate.grounding import store_original, fetch, cite, latest, read_original

    v = store_original(con, data, url="https://…/call.pdf", mime="application/pdf",
                       fetched_at=now, text=extracted, extractor="pdfplumber")
    c = cite(con, v.id, (1200, 1340))       # -> Citation: url, title, date, sha256, quote
    v = latest(con, "https://…/call.pdf")   # the most recent fetch of a document
    data = read_original(v)                 # the bytes, verified against sha256

`con` is any psycopg connection whose role may SELECT and INSERT in schema
grounding (every brain role; mandate/db/roles.sql). The caller owns the
transaction: nothing here commits, so a brain's own row and the grounding row it
points at land together or not at all.

THE ORDER IN store_original IS THE INVARIANT. Bytes go to the bucket BEFORE the
row is inserted. A row whose object is missing would be a citation nobody can
open; an object with no row is merely unreferenced, and the next store of the
same bytes adopts it (the key is the sha256, so the PUT is skipped).

DUPLICATES ARE IMPOSSIBLE, not discouraged: document_versions.sha256 is UNIQUE.
Storing bytes that are already stored, from any URL, by any brain, returns the
existing version and records one more row in grounding.fetches -- the date of
every sighting is kept, the bytes once.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import httpx

from .bucket import Bucket, bucket_from_env, key_for

_bucket: Bucket | None = None


def default_bucket() -> Bucket:
    global _bucket
    if _bucket is None:
        _bucket = bucket_from_env()
    return _bucket


def set_bucket(b: Bucket | None) -> None:
    """Point the module at a backend (tests, rehearsals). None re-reads the env."""
    global _bucket
    _bucket = b


@dataclass(frozen=True)
class Version:
    id: int
    document_id: int
    canonical_url: str
    sha256: str
    bucket_key: str
    mime: str
    byte_size: int
    fetched_at: dt.datetime        # when THESE bytes were first seen
    text: str | None
    created: bool                  # False when the bytes were already stored


@dataclass(frozen=True)
class Citation:
    version_id: int
    canonical_url: str
    title: str | None
    publisher: str | None
    fetched_at: dt.datetime        # first seen
    last_seen_at: dt.datetime      # most recent fetch that served these bytes
    sha256: str
    span: tuple[int, int]
    quote: str

    def line(self) -> str:
        """The one-line form a brief prints: source, date, and where."""
        who = self.publisher or urlsplit(self.canonical_url).netloc or self.canonical_url
        return (f"{self.title or self.canonical_url} ({who}), retrieved "
                f"{self.fetched_at.date().isoformat()}, chars {self.span[0]}-{self.span[1]}, "
                f"sha256 {self.sha256[:12]}")


_TRACKING = re.compile(r"^(utm_[a-z]+|fbclid|gclid|mc_[a-z]+)$", re.I)


def canonical_url(url: str) -> str:
    """One spelling per document. Conservative on purpose: lowercases scheme and
    host, drops the fragment, default ports and tracking parameters, and nothing
    else -- a path or query a server distinguishes must stay distinct.
    `urn:` identifiers pass through untouched."""
    url = url.strip()
    if url.lower().startswith("urn:"):
        return url
    p = urlsplit(url)
    if p.scheme.lower() not in ("http", "https") or not p.netloc:
        raise ValueError(f"not an http(s) URL or urn: {url!r}")
    host = p.hostname.lower() if p.hostname else ""
    port = p.port
    netloc = host if port in (None, 80 if p.scheme.lower() == "http" else 443) else f"{host}:{port}"
    if p.username:
        raise ValueError("a canonical URL carries no credentials")
    query = "&".join(kv for kv in p.query.split("&")
                     if kv and not _TRACKING.match(kv.split("=", 1)[0]))
    return urlunsplit((p.scheme.lower(), netloc, p.path or "/", query, ""))


def _one(con, sql: str, params: tuple) -> Any:
    row = con.execute(sql, params).fetchone()
    if row is None:
        return None
    return row if not isinstance(row, dict) else tuple(row.values())


def ensure_source(con, key: str, name: str, *, publisher: str | None = None,
                  base_url: str | None = None) -> int:
    con.execute("INSERT INTO grounding.sources (key, name, publisher, base_url) "
                "VALUES (%s, %s, %s, %s) ON CONFLICT (key) DO NOTHING",
                (key, name, publisher, base_url))
    return _one(con, "SELECT id FROM grounding.sources WHERE key = %s", (key,))[0]


def ensure_document(con, url: str, *, title: str | None = None, publisher: str | None = None,
                    kind: str | None = None, source_id: int | None = None) -> int:
    """The document for a URL, created on first sight. Insert-only: a title seen
    later does not overwrite the first one (the version's text is the record)."""
    cu = canonical_url(url)
    con.execute(
        "INSERT INTO grounding.documents (canonical_url, title, publisher, kind, source_id) "
        "VALUES (%s, %s, %s, %s, %s) ON CONFLICT (canonical_url) DO NOTHING",
        (cu, title, publisher, kind, source_id))
    return _one(con, "SELECT id FROM grounding.documents WHERE canonical_url = %s", (cu,))[0]


def _utc(t: dt.datetime) -> dt.datetime:
    if t.tzinfo is None:
        raise ValueError("fetched_at must be timezone-aware: a citation's date is an instant")
    return t.astimezone(dt.timezone.utc)


def store_original(con, data: bytes, url: str, mime: str, fetched_at: dt.datetime, *,
                   text: str | None = None, extractor: str | None = None,
                   title: str | None = None, publisher: str | None = None,
                   kind: str | None = None, source_id: int | None = None,
                   http_status: int | None = None, bucket: Bucket | None = None) -> Version:
    """Store bytes seen at `url` at `fetched_at`. Idempotent; see the module doc."""
    if not isinstance(data, (bytes, bytearray)):
        raise TypeError("store_original stores bytes; encode text explicitly")
    data = bytes(data)
    fetched_at = _utc(fetched_at)
    sha = hashlib.sha256(data).hexdigest()
    key = key_for(sha)
    (bucket or default_bucket()).put_if_absent(key, data, mime)   # bytes FIRST

    doc_id = ensure_document(con, url, title=title, publisher=publisher, kind=kind,
                             source_id=source_id)
    row = _one(con,
        "INSERT INTO grounding.document_versions "
        "  (document_id, fetched_at, sha256, mime, byte_size, bucket_key, text, extractor) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s) "
        "ON CONFLICT (sha256) DO NOTHING RETURNING id",
        (doc_id, fetched_at, sha, mime, len(data), key, text, extractor))
    created = row is not None
    con.execute(
        "INSERT INTO grounding.fetches (document_id, version_id, fetched_at, http_status) "
        "SELECT %s, id, %s, %s FROM grounding.document_versions WHERE sha256 = %s "
        "ON CONFLICT (document_id, version_id, fetched_at) DO NOTHING",
        (doc_id, fetched_at, http_status, sha))
    v = version_by_sha(con, sha)
    return Version(**{**v.__dict__, "created": created})


def record_fetch(con, url: str, sha256: str, fetched_at: dt.datetime, *,
                 http_status: int | None = None, title: str | None = None,
                 publisher: str | None = None, kind: str | None = None,
                 source_id: int | None = None) -> Version | None:
    """Record that `url` served bytes ALREADY stored (by sha256) at `fetched_at`:
    one grounding.fetches row, no bucket round trip. None when the bytes are not
    stored yet, so the caller must store_original() them (which uploads first).
    What a weekly re-fetch of an unchanged source costs: one row, not one upload."""
    try:
        v = version_by_sha(con, sha256)
    except LookupError:
        return None
    doc_id = ensure_document(con, url, title=title, publisher=publisher, kind=kind,
                             source_id=source_id)
    con.execute(
        "INSERT INTO grounding.fetches (document_id, version_id, fetched_at, http_status) "
        "VALUES (%s, %s, %s, %s) ON CONFLICT (document_id, version_id, fetched_at) DO NOTHING",
        (doc_id, v.id, _utc(fetched_at), http_status))
    return v


_VERSION_SQL = ("SELECT v.id, v.document_id, d.canonical_url, v.sha256, v.bucket_key, v.mime, "
                "       v.byte_size, v.fetched_at, v.text "
                "  FROM grounding.document_versions v JOIN grounding.documents d ON d.id = v.document_id ")


def _version(row) -> Version:
    return Version(*row, created=False)


def version_by_sha(con, sha256: str) -> Version:
    row = _one(con, _VERSION_SQL + "WHERE v.sha256 = %s", (sha256,))
    if row is None:
        raise LookupError(f"no grounding version with sha256 {sha256}")
    return _version(row)


def version(con, version_id: int) -> Version:
    row = _one(con, _VERSION_SQL + "WHERE v.id = %s", (version_id,))
    if row is None:
        raise LookupError(f"no grounding version {version_id}")
    return _version(row)


def latest(con, url: str) -> Version | None:
    """What `url` served on its most recent fetch, or None if never fetched."""
    row = _one(con,
        "SELECT v.id, v.document_id, d.canonical_url, v.sha256, v.bucket_key, v.mime, "
        "       v.byte_size, v.fetched_at, v.text "
        "  FROM grounding.fetches f "
        "  JOIN grounding.documents d ON d.id = f.document_id "
        "  JOIN grounding.document_versions v ON v.id = f.version_id "
        " WHERE d.canonical_url = %s ORDER BY f.fetched_at DESC, f.id DESC LIMIT 1",
        (canonical_url(url),))
    return _version(row) if row else None


def read_original(v: Version, *, bucket: Bucket | None = None) -> bytes:
    """The original bytes, verified against the version's sha256."""
    return (bucket or default_bucket()).get(v.bucket_key)


def fetch(con, url: str, *, client: httpx.Client | None = None, extractor=None,
          title: str | None = None, publisher: str | None = None, kind: str | None = None,
          source_id: int | None = None, bucket: Bucket | None = None,
          headers: dict[str, str] | None = None) -> Version:
    """GET `url` and store what it served. `extractor`, if given, is a callable
    (bytes, mime) -> (text, extractor_name) run before the insert, because a
    version's text cannot be added afterwards (append-only)."""
    own = client is None
    client = client or httpx.Client(timeout=60.0, follow_redirects=True,
                                    headers={"user-agent": "Mandate-grounding/0.1"})
    try:
        r = client.get(url, headers=headers)
        r.raise_for_status()
    finally:
        if own:
            client.close()
    mime = (r.headers.get("content-type") or "application/octet-stream").split(";")[0].strip()
    text, ext_name = (None, None)
    if extractor is not None:
        text, ext_name = extractor(r.content, mime)
    return store_original(con, r.content, url, mime, dt.datetime.now(dt.timezone.utc),
                          text=text, extractor=ext_name, title=title, publisher=publisher,
                          kind=kind, source_id=source_id, http_status=r.status_code,
                          bucket=bucket)


def _squash(s: str) -> str:
    return " ".join(s.split())


def cite(con, version_id: int, span: tuple[int, int], *, quote: str | None = None) -> Citation:
    """A citation of characters [start, end) of a version's text.

    Refuses a span outside the text, and -- when `quote` is given -- a quote that
    is not what the span holds (whitespace-insensitive). A citation that does not
    resolve to the words it claims is worse than none: it looks checked.
    """
    start, end = span
    row = _one(con,
        "SELECT v.id, d.canonical_url, d.title, d.publisher, v.fetched_at, "
        "       (SELECT max(f.fetched_at) FROM grounding.fetches f WHERE f.version_id = v.id), "
        "       v.sha256, v.text "
        "  FROM grounding.document_versions v JOIN grounding.documents d ON d.id = v.document_id "
        " WHERE v.id = %s", (version_id,))
    if row is None:
        raise LookupError(f"no grounding version {version_id}")
    vid, url, title, publisher, first, last, sha, text = row
    if text is None:
        raise ValueError(f"version {vid} has no extracted text; a span cannot be cited")
    if not (0 <= start <= end <= len(text)):
        raise ValueError(f"span {span} is outside version {vid}'s text (0-{len(text)})")
    got = text[start:end]
    if quote is not None and _squash(quote) != _squash(got):
        raise ValueError(f"quote does not match version {vid} at {span}: {got[:80]!r}")
    return Citation(vid, url, title, publisher, first, last or first, sha, (start, end), got)


def locate(text: str, quote: str) -> tuple[int, int] | None:
    """The span of `quote` in `text`, tolerant of whitespace differences (a PDF
    extractor's line breaks are not the quote's). None when it is not there."""
    q = _squash(quote)
    if not q:
        return None
    i = text.find(quote)
    if i >= 0:
        return (i, i + len(quote))
    # whitespace-insensitive: match token by token over the original string
    pattern = r"\s+".join(re.escape(tok) for tok in q.split(" "))
    m = re.search(pattern, text)
    return (m.start(), m.end()) if m else None


def add_passages(con, version_id: int, chunker: str,
                 spans: list[tuple[int, int, str | None]]) -> list[int]:
    """Cut passages from a version's text: (char_start, char_end, heading) each.
    The passage text is taken FROM the version, never passed in, so a passage
    cannot disagree with its source. Idempotent per (version, chunker, ordinal)."""
    v = version(con, version_id)
    if v.text is None:
        raise ValueError(f"version {version_id} has no text to cut passages from")
    ids = []
    for ordinal, (s, e, heading) in enumerate(spans):
        if not (0 <= s <= e <= len(v.text)):
            raise ValueError(f"passage span {(s, e)} outside version {version_id}")
        con.execute(
            "INSERT INTO grounding.passages (version_id, chunker, ordinal, char_start, char_end, heading, text) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s) ON CONFLICT (version_id, chunker, ordinal) DO NOTHING",
            (version_id, chunker, ordinal, s, e, heading, v.text[s:e]))
        ids.append(_one(con, "SELECT id FROM grounding.passages WHERE version_id = %s AND chunker = %s "
                             "AND ordinal = %s", (version_id, chunker, ordinal))[0])
    return ids
