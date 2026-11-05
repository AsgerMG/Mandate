"""Backfill the scheme identity onto the 23k Spanish events already loaded.

── Why this exists ────────────────────────────────────────────────────────
`extract_bdns.py` had two bugs, both silent, both now fixed:

  1. It checked for a column named `satr_sa_number`. The real column is
     `satr_tm_id`. The check always found nothing, so the SA number the API
     returns on every record -- `ayudaEstado`, e.g. "SA.112521" -- was
     fetched correctly and then dropped before the INSERT.
  2. `convocatoria` (the call name -- Spain's equivalent of SATR's
     `aid_measure_title`) was written only to `project_title`. The general
     instrument split in `populate_funding_instruments.py` reads
     `programme_name` specifically; it was never populated for BDNS.

Together this collapsed 23,109 awards across every Spanish region and agency
into one instrument: "Spain BDNS (regional agencies)". The 7 Spanish
instruments Wincent held (vs. Germany's 121, France's 133) were a direct
consequence.

── Why a backfill and not a reload ────────────────────────────────────────
The rows are already loaded, matched to companies, deduped. Re-running
`--load-db` would skip every one of them (the `source, call_id` dedup check).
So this re-fetches the SAME api call `extract_bdns.py` already makes -- pure
HTTP, no scraping, no agents, no LLM cost -- and UPDATEs the existing rows by
`call_id`, which is stable across runs (built from `codConcesion`/`idConcesion`,
not from any field being fixed here).

Usage:
  python3 backfill_bdns_scheme_id.py --probe     # count what would change
  python3 backfill_bdns_scheme_id.py --write
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB as _ETL_DB  # noqa: E402

import argparse  # noqa: E402
import sqlite3  # noqa: E402

from extract_bdns import OBJECTIVES, _fetch_objective  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    conn = sqlite3.connect(_ETL_DB)
    conn.row_factory = sqlite3.Row
    cols = {r[1] for r in conn.execute("PRAGMA table_info(public_funding_events)")}
    if "satr_tm_id" not in cols or "programme_name" not in cols:
        print("public_funding_events is missing satr_tm_id or programme_name "
              "-- nothing to backfill onto.")
        return

    existing = {r[0] for r in conn.execute(
        "SELECT call_id FROM public_funding_events WHERE source LIKE 'bdns_es_ayudas_%'")}
    print(f"{len(existing)} existing BDNS rows to match against")

    updates: list[tuple] = []
    seen_call_ids: set[str] = set()
    for obj_id in OBJECTIVES:
        rows = _fetch_objective(obj_id)
        for r in rows:
            if r.get("_skip_cdti"):
                continue
            cid = r.get("call_id")
            if not cid or cid not in existing or cid in seen_call_ids:
                continue
            seen_call_ids.add(cid)
            sa = r.get("satr_tm_id")
            prog = r.get("programme_name")
            if sa or prog:
                updates.append((sa, prog, cid))
        print(f"  obj {obj_id}: {len(rows)} fetched, "
              f"{len(seen_call_ids)} matched so far")

    matched_sa = sum(1 for u in updates if u[0])
    matched_prog = sum(1 for u in updates if u[1])
    distinct_sa = len({u[0] for u in updates if u[0]})
    distinct_prog = len({u[1] for u in updates if u[1]})
    print(f"\n{len(updates)} rows to update out of {len(existing)} existing")
    print(f"  with SA number:      {matched_sa}  ({distinct_sa} distinct)")
    print(f"  with programme_name: {matched_prog}  ({distinct_prog} distinct)")

    if not args.write:
        print("\n[probe only] --write to apply")
        return

    conn.executemany(
        "UPDATE public_funding_events SET satr_tm_id = COALESCE(satr_tm_id, ?), "
        "programme_name = COALESCE(programme_name, ?) WHERE call_id = ?",
        updates)
    conn.commit()
    print(f"\nupdated {len(updates)} rows")


if __name__ == "__main__":
    main()
