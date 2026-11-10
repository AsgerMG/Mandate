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
"""
from __future__ import annotations

import json
import os
import sys

import psycopg

from mandate.api.citations import CitationError, Stores, resolve
from mandate.grounding import store as gstore


def main() -> None:
    con = psycopg.connect(os.environ["BENCH_GROUNDING_URL"], autocommit=True)
    con.execute("SET default_transaction_read_only = on")
    stores = Stores(primary=con, reference=None)
    for line in sys.stdin:
        if not line.strip():
            continue
        req = json.loads(line)
        try:
            if req["op"] == "cite":
                span = tuple(req["span"]) if req.get("span") else None
                out = {"ok": resolve(stores, quote=req.get("quote") or "", sha256=req.get("sha256"),
                                     url=None if req.get("sha256") else req.get("url"), span=span)}
            elif req["op"] == "latest":
                v = gstore.latest(con, req["url"])
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
