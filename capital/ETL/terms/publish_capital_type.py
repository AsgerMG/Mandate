"""Publish capital_type + capital_type_basis, SQLite -> Postgres. Nothing else.

── Why a scoped publisher and not migrate_to_postgres.py ──────────────────
Same reason publish_scheme_text_scoped.py exists: the full publish is a
truncate and reinsert of the whole subsystem, which is correct for a release
and wrong while several enrichment agents hold uncommitted edits to the same
SQLite file. This writes two columns, by id, for rows that already exist in
Postgres. It never inserts, never deletes, and cannot carry a neighbour's
half-finished work into the read path.

── The constraint, and why it is reconciled here ──────────────────────────
`funding_instruments.capital_type` carries a CHECK. Widening it is not
optional bookkeeping -- a publish of `non_financial` against the old
constraint fails row by row, and the failure mode of a partial publish is a
corpus in which some rows were corrected and others silently were not. So the
constraint is brought level with the DECLARED value list first, from the same
`CAPITAL_TYPE_VALUES` the SQLite migration reads, and the publish is refused
if that cannot be done.

Usage:
  python3 ETL/terms/publish_capital_type.py --dry-run
  python3 ETL/terms/publish_capital_type.py
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        _sys.path.insert(0, str(_anc / "events" / "load" / "migrations"))
        break
from etl_env import DB, ROOT  # noqa: E402
# --- end ETL path bootstrap ---

import argparse  # noqa: E402
import os  # noqa: E402
import sqlite3  # noqa: E402

from apply import CAPITAL_TYPE_VALUES  # noqa: E402

COLUMNS = ("capital_type", "capital_type_basis")
CONSTRAINT = "funding_instruments_capital_type_check"


def load_database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if url:
        return url
    # Documented to live at the REPO ROOT. Thirty-four copies of this block
    # once looked only beside themselves and reported "no credentials" on a
    # checkout that had them; see website/frontend/scripts/loadEnv.ts.
    env = ROOT / ".env.local"
    if env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("DATABASE_URL="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit(
        "publish_capital_type: no DATABASE_URL, in the environment or in "
        f"{env}. A publish that cannot find the database must stop, not "
        "report success against nothing.")


def reconcile_constraint(cur, dry_run: bool) -> None:
    cur.execute(
        "SELECT pg_get_constraintdef(oid) FROM pg_constraint "
        "WHERE conrelid='funding_instruments'::regclass AND conname=%s",
        (CONSTRAINT,))
    row = cur.fetchone()
    if row is None:
        raise SystemExit(
            f"publish_capital_type: {CONSTRAINT} is absent from Postgres. "
            "Restore it rather than publishing without it -- the constraint is "
            "what stops an unreachable capital type arriving silently.")
    missing = [v for v in CAPITAL_TYPE_VALUES if f"'{v}'" not in row[0]]
    if not missing:
        return
    print(f"  constraint is missing {', '.join(missing)} — widening")
    if dry_run:
        return
    values = ", ".join(f"'{v}'" for v in CAPITAL_TYPE_VALUES)
    cur.execute(f"ALTER TABLE funding_instruments DROP CONSTRAINT {CONSTRAINT}")
    cur.execute(
        f"ALTER TABLE funding_instruments ADD CONSTRAINT {CONSTRAINT} "
        f"CHECK (capital_type IN ({values}))")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    import psycopg2  # imported late so --help works without it

    conn = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    local = {r["id"]: tuple(r[c] for c in COLUMNS) for r in conn.execute(
        f"SELECT id, {', '.join(COLUMNS)} FROM funding_instruments")}

    pg = psycopg2.connect(load_database_url())
    cur = pg.cursor()
    reconcile_constraint(cur, args.dry_run)

    cur.execute(f"SELECT id, {', '.join(COLUMNS)} FROM funding_instruments")
    remote = {r[0]: tuple(r[1:]) for r in cur.fetchall()}

    changes = [(i, v) for i, v in local.items()
               if i in remote and remote[i] != v]
    absent = [i for i in local if i not in remote]

    for iid, values in changes:
        old = remote[iid]
        print(f"   {str(old[0]):14} -> {str(values[0]):14}  {iid}")
        if not args.dry_run:
            cur.execute(
                "UPDATE funding_instruments SET capital_type=%s, "
                "capital_type_basis=%s WHERE id=%s", (*values, iid))
    if not args.dry_run:
        pg.commit()

    print(f"{len(changes)} instruments updated"
          f"{' (dry run, nothing written)' if args.dry_run else ''}")
    if absent:
        # Not an error and not silence: this publisher does not insert, and a
        # row SQLite has that Postgres does not is some other publisher's work.
        print(f"  {len(absent)} instruments exist only in SQLite and were not "
              f"inserted (this publisher never inserts): "
              f"{', '.join(sorted(absent)[:5])}"
              f"{' ...' if len(absent) > 5 else ''}")
    pg.close()


if __name__ == "__main__":
    main()
