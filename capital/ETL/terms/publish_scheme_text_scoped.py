"""Publish the eligibility columns for ONE set of countries, SQLite -> Postgres.

── Why not migrate_to_postgres.py ─────────────────────────────────────────
That script is the release publish: a full truncate + reinsert of the whole
eligibility subsystem. Correct for a release, wrong while several enrichment
agents hold uncommitted edits to the same SQLite file at once -- it would
carry every neighbour's half-finished row into the live read path along with
yours. `load_scheme_text.py --postgres` mirrors the rows a single load
produced, which is the right scope but only reaches rows that load just
wrote; a re-run that finds everything already loaded mirrors nothing, and any
row whose administering_body or delivery_region was filled in separately is
never published at all.

So this publishes by COUNTRY: every instrument of the named countries, with
only the eligibility-provenance columns, by id. It is idempotent, it never
deletes, and it cannot touch a row outside the countries you name.

── What it will not do ────────────────────────────────────────────────────
It writes no gates. Turning prose into an `eligibility_gates` row means
assigning gate_role and verification_level, and a seeded gate MUST declare
gate_role -- a design decision, not a publish step. Same boundary
load_scheme_text.py draws.

Usage:
  python3 ETL/terms/publish_scheme_text_scoped.py --country EU --country NO
  python3 ETL/terms/publish_scheme_text_scoped.py --country EU --dry-run
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

# The columns this workstream owns. Deliberately short: everything else about
# an instrument is some other loader's business, and a wide UPDATE here would
# silently republish whatever a neighbour happened to have in SQLite.
COLUMNS = (
    "description",
    "eligibility_text",
    "eligibility_source_url",
    "eligibility_confidence",
    "eligibility_fetched_at",
    "administering_body",
    "delivery_region",
    # Written by load_scheme_text.py's lifetime_facts() pass, so it is this
    # workstream's column and belongs in this list. It is also the one column
    # here that REMOVES rows from the product rather than describing them:
    # publishableInstruments() drops a scheme whose end date has passed. Spain
    # is the demonstration -- 64 of its 87 BDNS leaves are convocatorias whose
    # window shut, and publishing the prose without this date ships their
    # expired rules as current guidance, which is the precise outcome the
    # active-only rule exists to prevent.
    "scheme_end_date",
    # And ALWAYS beside it. `scheme_end_date` alone is not a fact, it is half of
    # one: the same column holds a call's application deadline and a State-aid
    # notification's expiry, and only the basis says which. Publishing the date
    # without it lands an unlabelled date, which the liveness test reads as a
    # call deadline and closes -- so shipping one column and not the other would
    # unpublish every renewed SATR measure in the countries being published,
    # which is exactly the 306-leaf outage of 2026-08-06. They travel together
    # or neither travels.
    "scheme_end_date_basis",
)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--country", action="append", required=True, metavar="CC")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    countries = [c.strip().upper() for c in args.country]
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    placeholders = ",".join("?" for _ in countries)
    rows = conn.execute(
        f"SELECT id, {', '.join(COLUMNS)} FROM funding_instruments "
        f"WHERE country IN ({placeholders})", countries).fetchall()
    conn.close()

    have = sum(1 for r in rows
               if (r["eligibility_text"] or "").strip())
    print(f"{len(rows)} instruments in {'/'.join(countries)}; "
          f"{have} carry eligibility_text")

    if args.dry_run:
        print("[dry run] nothing written")
        return

    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise SystemExit("DATABASE_URL not set (expected in the repo-root .env.local)")

    import psycopg2  # lazy: a dry run needs no driver

    sets = ", ".join(f"{c} = %s" for c in COLUMNS)
    payload = [tuple(r[c] for c in COLUMNS) + (r["id"],) for r in rows]
    pg = psycopg2.connect(dsn)
    with pg, pg.cursor() as cur:
        cur.executemany(
            f"UPDATE funding_instruments SET {sets} WHERE id = %s", payload)
    pg.close()
    print(f"published {len(payload)} rows to Postgres")


if __name__ == "__main__":
    main()
