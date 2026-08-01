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
import re
import sqlite3

import psycopg

INSTRUMENT_TERMS_JSON = ROOT / "website" / "frontend" / "public" / "data" / "instrument_terms.json"


def check_values(table: str, column: str) -> list[str]:
    """The allowed values for a column, read out of SQLite's own CHECK constraint.

    Parsed rather than restated so Postgres cannot fall behind a migration that
    widens an enumeration. This has now happened twice in one day -- migration
    020 added an evidence tier and 021 a name source, and each time the publish
    failed with a CheckViolation on rows that were correct in SQLite. Generalised
    to any column for that reason: the next enumeration should not need a third
    special case.

    Raises if the constraint is missing, which is the right failure. Publishing
    with no constraint would let a typo'd value reach the read path, where an
    unrecognised tier silently means "not cited" and the row disappears.
    """
    conn = sqlite3.connect(DB)
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE name = ?", (table,)).fetchone()
    conn.close()
    if not row:
        raise SystemExit(f"{table} not found in SQLite; cannot derive its constraint.")
    m = re.search(
        rf"{column}\s+TEXT[^,]*?CHECK\s*\(\s*{column}\s+IN\s*\(([^)]*)\)",
        row[0], re.S | re.I)
    if not m:
        raise SystemExit(
            f"{table}.{column} has no CHECK constraint in SQLite; Postgres's "
            f"constraint is derived from it and cannot be built.")
    values = re.findall(r"'([^']+)'", m.group(1))
    if not values:
        raise SystemExit(f"{table}.{column} CHECK parsed to zero values.")
    return values


def fetch_sqlite():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    instruments = conn.execute("SELECT * FROM funding_instruments").fetchall()
    sources = conn.execute("SELECT * FROM funding_instrument_sources").fetchall()
    gates = conn.execute("SELECT * FROM eligibility_gates").fetchall()
    clauses = conn.execute("SELECT * FROM eligibility_clauses").fetchall()
    applications = conn.execute("SELECT * FROM instrument_application").fetchall()
    conn.close()
    return instruments, sources, gates, clauses, applications


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    url = os.environ.get("DATABASE_URL")
    if not url:
        _sys.exit("DATABASE_URL not set (add to .env.local)")

    # (table, column) pairs whose enumeration lives in SQLite and must be
    # mirrored into Postgres. Adding an enumerated column means adding it here,
    # and nothing else.
    ENUMS = [("eligibility_gates", "verification_level"),
             ("eligibility_clauses", "verification_level"),
             ("funding_instruments", "name_source")]
    enums = {(t, c): check_values(t, c) for t, c in ENUMS}
    instruments, sources, gates, clauses, applications = fetch_sqlite()
    print(f"SQLite: {len(instruments)} instruments, {len(sources)} sources, "
          f"{len(gates)} gates, {len(clauses)} clauses")
    for (t, c), vals in enums.items():
        print(f"  {t}.{c} (from SQLite's CHECK): {', '.join(vals)}")
    if args.dry_run:
        print("[dry-run] nothing written to Postgres.")
        return

    pg = psycopg.connect(url)
    try:
        with pg.cursor() as cur:
            # Truncate in FK-safe order (children first). CASCADE is REQUIRED
            # here (Postgres refuses to truncate a table other tables
            # reference), but it is not free: until 2026-07-26,
            # eligibility_embeddings carried an FK to funding_instruments, so
            # this one statement silently destroyed all 3,327 Voyage embeddings
            # on every run. The table is not named here, and TRUNCATE leaves no
            # n_tup_del trace, so nothing showed it. That FK is now gone and
            # embeddings are keyed on (instrument_id, gate_key) — stable across
            # reloads — so they survive this. Do NOT reintroduce an FK from any
            # derived/expensive table to these four.
            # Self-healing schema: there is no Postgres DDL file in the repo
            # (the tables were created out of band), so a column added to
            # SQLite by a migration has to be reconciled here or the publish
            # fails on the next run with an unhelpful "column does not exist".
            cur.execute("ALTER TABLE funding_instruments "
                        "ADD COLUMN IF NOT EXISTS administering_body_share REAL")
            # Added with the per-authority/scheme split and the sector-affinity
            # signal. Without these the live product hydrates instruments with
            # the columns missing, and the fit score's sector component
            # silently returns its neutral value for every fund — a ranking
            # that differs from the measured one with nothing to show for it.
            for ddl in ("scheme_code TEXT", "application_url TEXT", "sector_mix TEXT",
                        "scheme_operators TEXT",
                        # What the instrument typically awards (migration 015).
                        "award_p25 DOUBLE PRECISION", "award_p50 DOUBLE PRECISION",
                        "award_p75 DOUBLE PRECISION", "award_n INTEGER",
                        # Realised aid intensity (migration 018). Adding a
                        # column to the corpus.ts phase-one SELECT without
                        # adding it here does not fail loudly: hydration throws,
                        # corpus.ts catches, and every request silently serves
                        # the JSON fallback instead of Postgres. That is exactly
                        # what happened between 018 landing and this line.
                        "intensity_p50 DOUBLE PRECISION", "intensity_n INTEGER",
                        # Hierarchy projections (migration 019), derived from
                        # parent_id on every load.
                        "tier TEXT", "root_id TEXT", "depth INTEGER", "path TEXT"):
                cur.execute(f"ALTER TABLE funding_instruments ADD COLUMN IF NOT EXISTS {ddl}")
            # Self-healing CONSTRAINTS, for the same reason as the columns
            # above. Adding an evidence tier in SQLite (migration 020 added
            # `register_derived`) leaves Postgres rejecting every row at that
            # tier with a CheckViolation, days after the tier looked like it
            # worked locally. The allowed list is PARSED OUT OF THE SQLITE DDL
            # rather than restated here: SQLite is the authoring source of
            # truth for this subsystem, and a second hand-written enumeration
            # of the same six values is the "keep in sync" comment that this
            # repo has now been bitten by three times.
            for (table, column), vals in enums.items():
                allowed = ", ".join(f"'{v}'" for v in vals)
                cur.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS "
                            f"{table}_{column}_check")
                cur.execute(f"ALTER TABLE {table} ADD CONSTRAINT "
                            f"{table}_{column}_check "
                            f"CHECK ({column} IN ({allowed}))")

            # Curated application routes live in their own table because
            # funding_instruments is truncated on every publish.
            cur.execute("""
                CREATE TABLE IF NOT EXISTS instrument_application (
                  id            TEXT PRIMARY KEY,
                  instrument_id TEXT NOT NULL,
                  channel       TEXT,
                  timeline      TEXT,
                  url           TEXT,
                  quote         TEXT,
                  source_file   TEXT,
                  updated_at    TIMESTAMPTZ DEFAULT now()
                )""")

            embeddings_before = cur.execute(
                "SELECT COUNT(*) FROM eligibility_embeddings").fetchone()[0]
            cur.execute("TRUNCATE eligibility_clauses, eligibility_gates, "
                        "funding_instrument_sources, funding_instruments CASCADE")

            # Pass 1: instruments with parent_id NULLed out.
            #
            # The column list is READ FROM SQLITE, not written out here. It was
            # written out here, and it silently stopped at scheme_operators: the
            # award medians, the realised intensities and the hierarchy columns
            # were all computed, exported to JSON, and never reached Postgres.
            # Nothing failed, because corpus.ts SELECTs them and Postgres had the
            # columns (added by the self-healing DDL above) -- they were simply
            # always NULL. Production therefore ranked on typicalAward's mean
            # fallback, the statistic the median was introduced to replace after
            # it was found overstating by up to 450x.
            #
            # A hand-maintained list beside a table that gains a column every
            # few days is a "keep in sync" comment in disguise. Deriving it means
            # the next column is carried without anyone remembering to.
            cols = list(instruments[0].keys()) if instruments else []
            insert_cols = [c for c in cols if c != "parent_id"]
            placeholders = ", ".join(["%s"] * len(insert_cols))
            cur.executemany(
                f"""INSERT INTO funding_instruments ({", ".join(insert_cols)})
                    VALUES ({placeholders})""",
                [tuple(bool(r[c]) if c == "is_framework" else r[c] for c in insert_cols)
                 for r in instruments],
            )
            # Pass 2: fill in parent_id now that every row exists.
            cur.executemany(
                "UPDATE funding_instruments SET parent_id = %s WHERE id = %s",
                [(r["parent_id"], r["id"]) for r in instruments if r["parent_id"]],
            )

            cur.execute("TRUNCATE instrument_application")
            cur.executemany(
                """INSERT INTO instrument_application
                     (id, instrument_id, channel, timeline, url, quote, source_file)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                [(r["id"], r["instrument_id"], r["channel"], r["timeline"],
                  r["url"], r["quote"], r["source_file"]) for r in applications],
            )
            cur.executemany(
                "INSERT INTO funding_instrument_sources (instrument_id, source) VALUES (%s, %s)",
                [(r["instrument_id"], r["source"]) for r in sources],
            )

            cur.executemany(
                """INSERT INTO eligibility_gates
                     (instrument_id, gate_key, gate_family, requirement, value, value_spec,
                      intake_field, gate_role, intake_field_resolved, encoding_method,
                      quote, source_file, source_locator, verification_level,
                      verify_note, verify_by)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                [(r["instrument_id"], r["gate_key"], r["gate_family"], r["requirement"], r["value"],
                  r["value_spec"], r["intake_field"], r["gate_role"], r["intake_field_resolved"],
                  r["encoding_method"], r["quote"], r["source_file"], r["source_locator"],
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

        # The embeddings this reload used to destroy. Reported explicitly so a
        # regression is loud rather than invisible: if this ever prints a drop,
        # something has reintroduced a cascade path into the derived tables.
        embeddings_after = pg.execute(
            "SELECT COUNT(*) FROM eligibility_embeddings").fetchone()[0]
        if embeddings_after < embeddings_before:
            _sys.exit(
                f"EMBEDDINGS LOST: {embeddings_before} before, {embeddings_after} after. "
                f"Something re-created an FK/cascade from eligibility_embeddings into the "
                f"truncated tables. Fix that before re-running embed_eligibility.py.")
        stale = pg.execute(
            """SELECT COUNT(*) FROM eligibility_embeddings e
               WHERE e.source_type = 'gate' AND NOT EXISTS (
                       SELECT 1 FROM eligibility_gates g
                       WHERE g.instrument_id = e.instrument_id AND g.gate_key = e.source_key)"""
        ).fetchone()[0]
        print(f"Embeddings: {embeddings_after} kept ({stale} now stale; "
              f"run `embed_eligibility.py run` to fill new gates).")

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
