"""One-off (and re-runnable) bulk migration: SQLite's eligibility subsystem
(funding_instruments / funding_instrument_sources / eligibility_gates /
eligibility_clauses) -> Railway Postgres (DATABASE_URL).

SQLite stays the authoring source of truth (see sync_gates_from_yaml.py) --
this script is a one-way publish, always a full truncate + reinsert (only a
few thousand rows total, cheap, and avoids incremental-diff drift bugs). Not
part of the regular research loop; run it after a `sync_gates_from_yaml.py`
pass whenever you want the live product to see the update, or use
`publish_eligibility.py` (which calls this) as part of `make eligibility`.

funding_instruments.parent_id self-references the same table, so instruments
are loaded in two passes: first with parent_id NULLed out, then a second
UPDATE pass sets the real parent_id -- avoids needing DEFERRABLE constraints
or fragile insert-order dependency.

Usage: python3 ETL/terms/migrate_to_postgres.py [--dry-run]
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

import argparse
import json
import os
import sqlite3

import psycopg

INSTRUMENT_TERMS_JSON = ROOT / "website" / "frontend" / "public" / "data" / "instrument_terms.json"


def fetch_sqlite():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    instruments = conn.execute("SELECT * FROM funding_instruments").fetchall()
    sources = conn.execute("SELECT * FROM funding_instrument_sources").fetchall()
    gates = conn.execute("SELECT * FROM eligibility_gates").fetchall()
    clauses = conn.execute("SELECT * FROM eligibility_clauses").fetchall()
    conn.close()
    return instruments, sources, gates, clauses


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    url = os.environ.get("DATABASE_URL")
    if not url:
        _sys.exit("DATABASE_URL not set (add to .env.local)")

    instruments, sources, gates, clauses = fetch_sqlite()
    print(f"SQLite: {len(instruments)} instruments, {len(sources)} sources, "
          f"{len(gates)} gates, {len(clauses)} clauses")
    if args.dry_run:
        print("[dry-run] nothing written to Postgres.")
        return

    pg = psycopg.connect(url)
    try:
        with pg.cursor() as cur:
            # Truncate in FK-safe order (children first), CASCADE for safety.
            cur.execute("TRUNCATE eligibility_clauses, eligibility_gates, "
                        "funding_instrument_sources, funding_instruments CASCADE")

            # Pass 1: instruments with parent_id NULLed out.
            cur.executemany(
                """INSERT INTO funding_instruments
                     (id, parent_id, name, name_source, country, administering_body,
                      ndb_id, source_family_bucket, capital_type, capital_type_basis,
                      event_count, company_count, total_eur, first_year, last_year,
                      is_framework, sample_project_titles)
                   VALUES (%s, NULL, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                [(r["id"], r["name"], r["name_source"], r["country"], r["administering_body"],
                  r["ndb_id"], r["source_family_bucket"], r["capital_type"], r["capital_type_basis"],
                  r["event_count"], r["company_count"], r["total_eur"], r["first_year"], r["last_year"],
                  bool(r["is_framework"]), r["sample_project_titles"]) for r in instruments],
            )
            # Pass 2: fill in parent_id now that every row exists.
            cur.executemany(
                "UPDATE funding_instruments SET parent_id = %s WHERE id = %s",
                [(r["parent_id"], r["id"]) for r in instruments if r["parent_id"]],
            )

            cur.executemany(
                "INSERT INTO funding_instrument_sources (instrument_id, source) VALUES (%s, %s)",
                [(r["instrument_id"], r["source"]) for r in sources],
            )

            cur.executemany(
                """INSERT INTO eligibility_gates
                     (instrument_id, gate_key, gate_family, requirement, value, value_spec,
                      intake_field, quote, source_file, source_locator, verification_level,
                      verify_note, verify_by)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                [(r["instrument_id"], r["gate_key"], r["gate_family"], r["requirement"], r["value"],
                  r["value_spec"], r["intake_field"], r["quote"], r["source_file"], r["source_locator"],
                  r["verification_level"], r["verify_note"], r["verify_by"]) for r in gates],
            )

            cur.executemany(
                """INSERT INTO eligibility_clauses
                     (instrument_id, clause_type, clause_key, text, quote, source_file,
                      source_locator, verification_level, verify_note, verify_by)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                [(r["instrument_id"], r["clause_type"], r["clause_key"], r["text"], r["quote"],
                  r["source_file"], r["source_locator"], r["verification_level"],
                  r["verify_note"], r["verify_by"]) for r in clauses],
            )
        pg.commit()
        print("Postgres: migration committed.")

        # Post-publish consistency check: Postgres should now match the
        # instrument count in the JSON fallback exactly, since both are
        # generated from the same SQLite state (run eligibility_export.py
        # first if this looks stale -- `make eligibility` does this in the
        # right order automatically).
        if INSTRUMENT_TERMS_JSON.exists():
            json_records = json.loads(INSTRUMENT_TERMS_JSON.read_text())["records"]
            pg_count = pg.execute("SELECT COUNT(*) FROM funding_instruments").fetchone()[0]
            if len(json_records) != pg_count:
                _sys.exit(
                    f"CONSISTENCY CHECK FAILED: instrument_terms.json has "
                    f"{len(json_records)} instruments, Postgres has {pg_count}. "
                    f"Re-run eligibility_export.py before trusting either.")
            print(f"Consistency check OK: {pg_count} instruments match the JSON fallback.")
        else:
            print("(instrument_terms.json not found -- skipping consistency check)")
    finally:
        pg.close()


if __name__ == "__main__":
    main()
