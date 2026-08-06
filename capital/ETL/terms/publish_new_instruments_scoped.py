"""Publish INSTRUMENTS created by one source, SQLite -> Postgres, by source tag.

── Why this exists beside the two publishers already here ─────────────────
`migrate_to_postgres.py` is the release publish: a full truncate + reinsert of
the whole eligibility subsystem. Correct for a release, catastrophic while
several agents hold uncommitted edits to the same SQLite file -- it carries
every neighbour's half-finished row into the live read path.

`publish_scheme_text_scoped.py` is the safe alternative and cannot help here,
for one reason stated in its own docstring: it UPDATEs by id. A row that does
not exist in Postgres yet is not updated, it is silently skipped. A source that
CREATES instruments has no publisher at all, and every such load until now has
had to run the full truncate.

So this one INSERTs, scoped by `funding_instrument_sources.source`. It touches
exactly the rows one source claims, it is idempotent, and it never deletes.

── Scoped by source, not by country ───────────────────────────────────────
Country is the wrong scope for an insert. Spain's other 94 instruments belong
to loaders that are not this one, and re-inserting them would republish
whatever a neighbouring agent happens to have in SQLite this minute. The source
tag is exactly the set of rows this workstream created, which is exactly the
set it may publish.

── The columns ────────────────────────────────────────────────────────────
All of them, because the row does not exist yet -- a partial insert would be a
row with no name or no capital type, and both are NOT NULL. That is safe here
precisely BECAUSE the scope is an insert of new ids: there is no neighbour's
work on these rows to overwrite. On conflict the same columns are updated, so
a re-harvest refreshes a call's window and text rather than failing.

Usage:
  python3 ETL/terms/publish_new_instruments_scoped.py --source bdns_es_convocatorias_abiertas
  python3 ETL/terms/publish_new_instruments_scoped.py --source ... --dry-run
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB  # noqa: E402
# --- end ETL path bootstrap ---

import argparse  # noqa: E402
import os  # noqa: E402
import sqlite3  # noqa: E402

# Read from SQLite's own table definition rather than listed here, so a
# migration that adds a column does not silently stop being published. The
# intersection with Postgres's columns is taken at run time for the same
# reason in reverse: a column SQLite has and Postgres has not is a migration
# that has not been applied there yet, and failing the whole publish over it
# would be worse than publishing the rest.
SKIP = {"created_at", "updated_at"}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", action="append", required=True, metavar="TAG")
    ap.add_argument("--successors", metavar="CC",
                    help="also publish successor_scheme/successor_title for this "
                         "country's EXISTING rows -- the revival pass writes them "
                         "onto leaves this source did not create, so no source tag "
                         "reaches them and publish_scheme_text_scoped.py does not "
                         "carry those two columns")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    sq_cols = [r[1] for r in conn.execute("PRAGMA table_info(funding_instruments)")
               if r[1] not in SKIP]
    ph = ",".join("?" for _ in args.source)
    rows = conn.execute(
        f"SELECT i.* FROM funding_instruments i "
        f"JOIN funding_instrument_sources s ON s.instrument_id = i.id "
        f"WHERE s.source IN ({ph})", args.source).fetchall()
    srcs = conn.execute(
        f"SELECT instrument_id, source FROM funding_instrument_sources "
        f"WHERE source IN ({ph})", args.source).fetchall()
    succ = []
    if args.successors:
        succ = conn.execute(
            "SELECT id, successor_scheme, successor_title FROM funding_instruments "
            "WHERE country = ?", (args.successors.upper(),)).fetchall()
    conn.close()
    print(f"{len(rows)} instruments tagged {'/'.join(args.source)}")
    if args.successors:
        n = sum(1 for r in succ if r["successor_scheme"])
        print(f"{len(succ)} {args.successors.upper()} rows carry a successor decision "
              f"({n} pointing at an open call, {len(succ)-n} cleared)")
    if args.dry_run:
        print("[dry run] nothing written")
        return

    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise SystemExit("DATABASE_URL not set (expected in the repo-root .env.local)")
    import psycopg2  # lazy: a dry run needs no driver

    pg = psycopg2.connect(dsn)
    with pg, pg.cursor() as cur:
        cur.execute("SELECT column_name, data_type FROM information_schema.columns "
                    "WHERE table_name='funding_instruments'")
        pg_types = dict(cur.fetchall())
        pg_cols = set(pg_types)
        cols = [c for c in sq_cols if c in pg_cols]
        missing = [c for c in sq_cols if c not in pg_cols]
        if missing:
            print(f"  not published (absent in Postgres): {', '.join(missing)}")
        # SQLite has no boolean type, so its 0/1 arrives as an integer and
        # Postgres refuses it. Coerced by reading Postgres's OWN declared type
        # rather than by naming the column: migrate_to_postgres.py hardcodes
        # `is_framework` in two places, and the next boolean column would have
        # to find and fix both.
        def coerce(r, c):
            v = r[c]
            return bool(v) if v is not None and pg_types[c] == "boolean" else v

        sets = ", ".join(f"{c} = EXCLUDED.{c}" for c in cols if c != "id")
        cur.executemany(
            f"INSERT INTO funding_instruments ({','.join(cols)}) "
            f"VALUES ({','.join(['%s'] * len(cols))}) "
            f"ON CONFLICT (id) DO UPDATE SET {sets}",
            [tuple(coerce(r, c) for c in cols) for r in rows])
        cur.executemany(
            "INSERT INTO funding_instrument_sources (instrument_id, source) "
            "VALUES (%s, %s) ON CONFLICT DO NOTHING",
            [(r["instrument_id"], r["source"]) for r in srcs])
        if succ:
            # Both columns, always, and NULLs included. A revival that has been
            # retracted in SQLite because its call shut must be retracted in
            # Postgres too, and COALESCE would make retraction impossible --
            # the row would keep pointing at a dead call under a successor
            # title, which is the failure this workstream exists to undo.
            cur.executemany(
                "UPDATE funding_instruments SET successor_scheme = %s, "
                "successor_title = %s WHERE id = %s",
                [(r["successor_scheme"], r["successor_title"], r["id"]) for r in succ])
            print(f"  published {len(succ)} successor decisions")
    pg.close()
    print(f"published {len(rows)} instruments and {len(srcs)} source rows to Postgres")


if __name__ == "__main__":
    main()
