"""Record whether a row is something a founder can APPLY TO, on its own axis.

── What this replaces, and why the replacement is not cosmetic ────────────
On 2026-08-07 the eleven IPCEI wave leaves were made non-offerable by inventing
a third `scheme_end_date_basis`, `closed_beneficiary_list`, which `isClosed()`
read as closed WITHOUT a date. The rows were correctly withheld. Everything
around that was wrong:

  * It made the corpus assert that IPCEI is CLOSED. It is not. The Commission's
    Design Support Hub lists nine IPCEI candidates in the design phase, the most
    recent endorsed by thirteen Member States on 20 May 2026, and states that
    its own job is to "actively support Member States in setting up national
    calls for expression of interest". Estonia's IPCEI Biotechnology call is
    open until 31.08.2026. A company absolutely can pursue IPCEI funding; it
    does so through its own Member State's call, not through a Commission
    decision that already named its beneficiaries.

  * It hid a modelling error instead of fixing it. The corpus was holding
    Commission APPROVAL DECISIONS as if they were funds -- the same class of
    error as the sixteen GB rows built from GtR `grantCategory` labels, and as
    the Spanish rows named after legal citations. Marking a non-fund closed
    makes the symptom disappear and leaves the non-fund in place.

  * It was not durable. `scheme_end_date_basis` is in BUILT_COLUMNS in
    populate_funding_instruments.py, which does DELETE FROM funding_instruments
    and restores only the columns it does NOT build. The next instrument rebuild
    would have wiped the basis on all eleven rows and silently republished them
    as offerable -- with no end date and no basis they read as OPEN.

`route_status` is deliberately absent from BUILT_COLUMNS, so the
preserve-by-difference pass in that rebuild carries it across untouched. This
is the reason it is a column and not a basis.

── The three states, and why "missing" is not "none" ──────────────────────
    attested    an application route is recorded from an official source
    unrecorded  believed to be an offer; the route has not been sourced yet
    none        the source establishes there is no route in

Only `none` withholds a row, and only `none` requires a source. 507 of 806
publishable rows have no recorded route today, nearly all of them real State-aid
schemes whose route we have simply never harvested. A missing route is a gap in
OUR COLLECTION, not a fact about the world, and a pass that treated the two as
the same would delete hundreds of live funds.

── Scope: a PARENT and a sourced reason, never a list of ids ──────────────
`--parent ipcei --status none --source URL` says "every leaf under this regime
is a decision, not an offer, and here is the source that says so". That is a
claim about the regime a reader can check. Eleven ids would be the same edit
with the reasoning left out.

Both stores, always: SQLite is where the ETL works, Postgres is what the product
reads, and a night was already lost to a load that landed in one of them.

Idempotent: re-running changes nothing and says so.

Usage:
  python3 ETL/terms/mark_offer_route.py --parent ipcei --status none \\
      --source https://competition-policy.ec.europa.eu/state-aid/ipcei/design-support-hub_en \\
      --note "..." --dry-run
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
# --- end ETL path bootstrap ---

import argparse  # noqa: E402
import os  # noqa: E402
import re  # noqa: E402
import sqlite3  # noqa: E402

from offer_route import ROUTE_STATUSES, ROUTE_NONE  # noqa: E402

COLS = (("route_status", "TEXT"),
        ("route_status_source", "TEXT"),
        ("route_status_note", "TEXT"))


def _load_env() -> None:
    """DATABASE_URL lives in the repo-root .env.local. A missing URL is a hard
    exit on the write path: half a migration is worse than none, because the
    product reads the half that did not land."""
    path = ROOT / ".env.local"
    if path.exists():
        for line in path.read_text().splitlines():
            m = re.match(r"^([A-Z_]+)=(.*)$", line)
            if m:
                os.environ.setdefault(m.group(1), m.group(2).strip("\"'"))


def _ensure_sqlite(conn: sqlite3.Connection) -> None:
    have = {r[1] for r in conn.execute("PRAGMA table_info(funding_instruments)")}
    for col, typ in COLS:
        if col not in have:
            conn.execute(f"ALTER TABLE funding_instruments ADD COLUMN {col} {typ}")
            print(f"  sqlite: added column {col}")


def _ensure_pg(cur) -> None:
    for col, typ in COLS:
        cur.execute("ALTER TABLE funding_instruments "
                    f"ADD COLUMN IF NOT EXISTS {col} {typ}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--parent", required=True,
                    help="regime whose LEAVES share this route status")
    ap.add_argument("--status", required=True, choices=sorted(ROUTE_STATUSES))
    ap.add_argument("--source", default="",
                    help="official URL or document locator. REQUIRED for 'none'")
    ap.add_argument("--note", default="", help="one line, why")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    if args.write == args.dry_run:
        raise SystemExit("choose exactly one of --write / --dry-run")
    if args.status == ROUTE_NONE and not args.source:
        # The whole failure being corrected is a row withheld on the strength of
        # our own columns. Withholding now costs a citation.
        raise SystemExit(
            "--source is required for --status none. Declaring a row a non-fund "
            "is a claim about the world and must cite the source that supports "
            "it, not our own metadata.")

    _load_env()
    url = os.environ.get("DATABASE_URL")
    if args.write and not url:
        raise SystemExit("DATABASE_URL is not set. SQLite alone is not a "
                         "migration -- the product reads Postgres.")

    sq = sqlite3.connect(DB)
    sq.row_factory = sqlite3.Row
    _ensure_sqlite(sq)
    rows = sq.execute(
        """SELECT id, name, route_status, route_status_source
             FROM funding_instruments
            WHERE parent_id = ?
              AND id NOT IN (SELECT parent_id FROM funding_instruments
                              WHERE parent_id IS NOT NULL)
            ORDER BY id""", (args.parent,)).fetchall()
    if not rows:
        raise SystemExit(f"no leaves under parent {args.parent!r}")

    print(f"{len(rows)} leaves under {args.parent} -> route_status={args.status}")
    todo = [r["id"] for r in rows
            if r["route_status"] != args.status
            or (r["route_status_source"] or "") != args.source]
    for r in rows:
        mark = "ok  " if r["id"] not in todo else "SET "
        print(f"  {mark} {r['id']:<22} was={r['route_status'] or '-'}")
    if not todo:
        print("nothing to do -- already recorded in SQLite")
    if args.dry_run:
        print("\ndry run: nothing written")
        return

    ids = [r["id"] for r in rows]
    marks = ",".join("?" * len(ids))
    sq.execute(
        f"""UPDATE funding_instruments
               SET route_status = ?, route_status_source = ?, route_status_note = ?
             WHERE id IN ({marks})""",
        [args.status, args.source, args.note, *ids])
    sq.commit()
    print(f"\nsqlite: {sq.total_changes} row(s) updated")

    import psycopg2  # noqa: PLC0415  -- optional dep, only the write path needs it
    pg = psycopg2.connect(url)
    with pg, pg.cursor() as cur:
        _ensure_pg(cur)
        cur.execute(
            """UPDATE funding_instruments
                  SET route_status = %s, route_status_source = %s,
                      route_status_note = %s
                WHERE id = ANY(%s)""",
            (args.status, args.source, args.note, ids))
        print(f"postgres: {cur.rowcount} row(s) updated")
        # Reconciled OUT of Postgres, so the run reports what the PRODUCT will
        # see rather than what this script believes it did.
        cur.execute(
            """SELECT count(*) FROM funding_instruments
                WHERE id = ANY(%s) AND route_status = %s
                  AND COALESCE(route_status_source,'') = %s""",
            (ids, args.status, args.source))
        print(f"postgres: {cur.fetchone()[0]} of {len(ids)} confirmed")
    pg.close()


if __name__ == "__main__":
    main()
