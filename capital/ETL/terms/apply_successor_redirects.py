"""Fill in the successor redirects the FORWARD-ONLY read of `caseLinks` missed.

DRY RUN BY DEFAULT. Writes nothing without `--apply`.

── What this repairs ──────────────────────────────────────────────────────
`caseLinks` is directional: the Commission files each edge once, on whichever
side it pleases. `populate_funding_instruments.py` used to iterate a case's OWN
links when it looked for the scheme that replaced a closed one, so a successor
that filed the edge on ITS record was invisible. wsHF counted the cost at 15
instruments across 14 schemes, against 40 found forward-only -- a 37.5%
under-report, and each of those 15 founders is shown a dead end where the
register names the replacement.

The loader is fixed (`live_successor` in ETL/lib/scheme_title.py, symmetric
through `link_map`). This applies the same rule to the corpus as it stands, so
the repair reaches founders without a full rebuild of funding_instruments --
which would republish whatever every other workstream currently holds in
SQLite.

── THE BOUND, AND WHY IT IS DRAWN HERE ────────────────────────────────────
IT ONLY FILLS IN A ROW THAT HOLDS NO SUCCESSOR TODAY. It never overwrites one
and never clears one.

That bound is not caution for its own sake. The symmetric map is a superset of
the forward one, so every forward-found successor is still a candidate -- but
the CHOICE among several can differ, because the old loop took the register's
filing order and the new rule takes sorted SA order. A row that already carries
a redirect could therefore be pointed somewhere else, and repointing a live
redirect is a different decision with a different blast radius from filling in
a blank one. Every such row is REPORTED, loudly, and left exactly as it is.

── What it writes ─────────────────────────────────────────────────────────
`successor_scheme` and `successor_title`, on both stores, and nothing else.
Not `scheme_end_date`, which is the loader's own business and is written from
the same register on every run.

  python3 ETL/terms/apply_successor_redirects.py                   # dry run
  python3 ETL/terms/apply_successor_redirects.py --apply           # SQLite
  python3 ETL/terms/apply_successor_redirects.py --apply --postgres
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB, ROOT  # noqa: E402
from scheme_title import link_map, live_successor, live_successors  # noqa: E402
# --- end ETL path bootstrap ---

import argparse  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
import sqlite3  # noqa: E402
from datetime import date  # noqa: E402

CASES = ROOT / "data" / "raw" / "state_aid_cases" / "cases.json"


def _one(rec: dict, key: str) -> str:
    v = rec.get(key)
    if isinstance(v, list):
        v = v[0] if v else ""
    return (v or "").strip()


def plan(conn: sqlite3.Connection, cases: dict, today: str):
    """(to_fill, would_repoint). Reads the corpus, decides nothing else."""
    edges = link_map(cases)
    rows = conn.execute(
        "SELECT id, scheme_code, successor_scheme, successor_title "
        "FROM funding_instruments "
        "WHERE scheme_code IS NOT NULL AND TRIM(scheme_code) <> ''").fetchall()

    to_fill, repoint = [], []
    for r in rows:
        sa = (r["scheme_code"] or "").strip()
        end = _one(cases.get(sa) or {}, "caseMeasureEndDate")[:10]
        if not end or end >= today:
            continue                      # not closed: nothing to redirect from
        succ, title = live_successor(sa, cases, edges, today)
        if not succ:
            continue
        held = (r["successor_scheme"] or "").strip()
        if not held:
            to_fill.append((r["id"], sa, succ, title,
                            len(live_successors(sa, cases, edges, today))))
        elif held != succ:
            repoint.append((r["id"], sa, held, succ))
    return to_fill, repoint


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write SQLite")
    ap.add_argument("--postgres", action="store_true",
                    help="also write Postgres, which is what founders read")
    args = ap.parse_args()

    if not CASES.exists():
        return _sys.exit(f"the fetched register is not on disk: {CASES}")
    cases = json.loads(CASES.read_text())
    today = date.today().isoformat()

    conn = sqlite3.connect(DB, timeout=60)
    conn.row_factory = sqlite3.Row
    to_fill, repoint = plan(conn, cases, today)

    print(f"register read {CASES}, {len(cases)} cases, today {today}")
    print(f"{len(to_fill)} instruments hold NO successor and the symmetric read "
          f"names one:")
    for iid, sa, succ, title, n in to_fill:
        several = f"  ({n} live candidates)" if n > 1 else ""
        print(f"  {sa:12} -> {succ:12}  {iid}{several}\n"
              f"      {title[:88]}")
    if repoint:
        print(f"\nNOT WRITTEN — {len(repoint)} rows already carry a successor that "
              f"the symmetric read would change.\n"
              f"  Repointing a live redirect is a different decision from filling "
              f"in a blank one.\n  Reported so it is settled deliberately:")
        for iid, sa, held, succ in repoint:
            print(f"  {sa:12} holds {held:12} -> would become {succ:12}  {iid}")
    else:
        print("\nno row already carrying a successor would be repointed by the "
              "symmetric read")

    if not args.apply:
        print("\nDRY RUN — nothing written. Re-run with --apply.")
        return 0

    conn.executemany(
        "UPDATE funding_instruments SET successor_scheme = ?, successor_title = ? "
        "WHERE id = ?",
        [(succ, title, iid) for iid, _, succ, title, _ in to_fill])
    conn.commit()
    print(f"\nSQLITE: wrote {len(to_fill)} successor redirects")

    if args.postgres:
        dsn = os.environ.get("DATABASE_URL")
        if not dsn:
            for line in (ROOT / ".env.local").read_text().splitlines():
                if line.startswith("DATABASE_URL="):
                    dsn = line.split("=", 1)[1].strip().strip('"')
        if not dsn:
            return _sys.exit("DATABASE_URL not set (expected in the repo-root "
                             ".env.local); SQLite was written, Postgres was not")
        import psycopg2
        pg = psycopg2.connect(dsn)
        with pg, pg.cursor() as cur:
            cur.executemany(
                "UPDATE funding_instruments SET successor_scheme = %s, "
                "successor_title = %s WHERE id = %s",
                [(succ, title, iid) for iid, _, succ, title, _ in to_fill])
        pg.close()
        print(f"POSTGRES: wrote {len(to_fill)} successor redirects")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
