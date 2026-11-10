"""Read-only grounding for the bench (web/scripts/brain_tool.ts).

Production cites through mandate-api's POST /grounding/cite, which runs
mandate.api.citations.resolve. This bridge runs that SAME function, on a
read-only connection (capital_ro), so a bench citation is byte-for-byte the one
production would hand out. It never fetches: production's /grounding/fetch
stores a page, which the bench must not do, so `latest` only reports what
grounding already holds.

Protocol: one JSON request per stdin line, one JSON reply per stdout line.
  {"op": "cite", "quote": ..., "sha256"?: ..., "url"?: ..., "span"?: [s, e]}
  {"op": "latest", "url": ...}
  {"op": "fetch", "url": ..., "title"?: ...}     only with BENCH_GROUNDING_WRITE_URL

RESEARCH COMPOUNDS (owner, 2026-11-10). The long tail is not bulk-loaded: Wincent reads it
live, and what he reads is stored, so the next founder starts from it. Production does that
in mandate-api's /grounding/fetch. The bench may do the same, ON PURPOSE ONLY: when
BENCH_GROUNDING_WRITE_URL (a brain role that may INSERT into grounding) and the bucket
(BUCKET_*, or GROUNDING_BUCKET_DIR in a rehearsal) are set, `fetch` runs the SAME code as
/grounding/fetch: the public-host check, mandate.grounding.store.fetch with the mandate-api
extractor, a reuse of a version fetched in the last 7 days. Grounding is append-only, so a
bench fetch can add a source and never change one. Without the variable, `fetch` refuses.
"""
from __future__ import annotations

import json
import os
import sys

import psycopg

from mandate.api.citations import CitationError, Stores, resolve
from mandate.grounding import store as gstore


REUSE_DAYS = 7          # mandate-api FetchIn.max_age_days default


def fetch_into_grounding(wcon, url: str, title: str | None) -> dict:
    """What mandate-api's POST /grounding/fetch does, on the bench's write connection."""
    import datetime as dt  # noqa: PLC0415
    import socket  # noqa: PLC0415
    from urllib.parse import urlsplit  # noqa: PLC0415

    from mandate.api.hosts import is_public_address  # noqa: PLC0415
    from mandate.api.extract import extractor  # noqa: PLC0415

    cu = gstore.canonical_url(url)
    v = gstore.latest(wcon, cu)
    if v and v.text:
        last = wcon.execute("SELECT max(fetched_at) FROM grounding.fetches WHERE version_id = %s", (v.id,)).fetchone()[0]
        if last and dt.datetime.now(dt.timezone.utc) - last <= dt.timedelta(days=REUSE_DAYS):
            return _out(v, True)
    host = urlsplit(cu).hostname or ""
    if not os.environ.get("BENCH_ALLOW_PRIVATE_HOSTS"):
        for info in socket.getaddrinfo(host, None):
            if not is_public_address(info[4][0]):
                raise ValueError("refusing to fetch a private or local address")
    with wcon.transaction():
        v = gstore.fetch(wcon, cu, extractor=extractor, title=title, kind="research",
                         headers={"user-agent": "Mozilla/5.0 (compatible; Mandate-grounding/0.1)"})
    return _out(v, False)


def _out(v, reused: bool) -> dict:
    return {"sha256": v.sha256, "canonical_url": v.canonical_url,
            "fetched_at": v.fetched_at.isoformat() if v.fetched_at else None,
            "chars": len(v.text or ""), "citable": bool(v.text), "reused": reused}


def main() -> None:
    con = psycopg.connect(os.environ["BENCH_GROUNDING_URL"], autocommit=True)
    con.execute("SET default_transaction_read_only = on")
    write_url = os.environ.get("BENCH_GROUNDING_WRITE_URL", "").strip()
    wcon = psycopg.connect(write_url, autocommit=True) if write_url else None
    # cite against the write connection when there is one, so a page fetched in this run
    # is citable in this run (the read-only replica of the same database sees it too)
    stores = Stores(primary=wcon or con, reference=None)
    for line in sys.stdin:
        if not line.strip():
            continue
        req = json.loads(line)
        try:
            if req["op"] == "cite":
                span = tuple(req["span"]) if req.get("span") else None
                out = {"ok": resolve(stores, quote=req.get("quote") or "", sha256=req.get("sha256"),
                                     url=None if req.get("sha256") else req.get("url"), span=span)}
            elif req["op"] == "fetch":
                if wcon is None:
                    raise ValueError("the bench stores research only with BENCH_GROUNDING_WRITE_URL "
                                     "set (see web/scripts/brain_tool.ts --ground)")
                out = {"ok": fetch_into_grounding(wcon, req["url"], req.get("title"))}
            elif req["op"] == "latest":
                v = gstore.latest(wcon or con, req["url"])
                out = {"ok": None if v is None else {
                    "sha256": v.sha256, "canonical_url": v.canonical_url,
                    "fetched_at": v.fetched_at.isoformat() if v.fetched_at else None,
                    "chars": len(v.text or ""), "citable": bool(v.text), "reused": True}}
            else:
                out = {"error": f"unknown op {req['op']}"}
        except (CitationError, ValueError) as e:
            out = {"error": str(e)}
        except Exception as e:  # noqa: BLE001 - reported to the caller, never swallowed
            out = {"error": f"{type(e).__name__}: {e}"}
        sys.stdout.write(json.dumps(out, default=str) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
