"""Idempotent migration runner.

Usage:
  python3 ETL/events/load/migrations/apply.py 004     # one migration
  python3 ETL/events/load/migrations/apply.py --all    # every pending one, in order
  python3 ETL/events/load/migrations/apply.py --status # what this store is missing

── Where "already applied" is decided ─────────────────────────────────────
Not here, and not in `schema_migrations`. Each migration's guard lives in
ETL/lib/schema_state.py and reads the STORE's own schema for the migration's
effect, because that is the only answer that survives the way schema actually
travels in this project: `push_local.py` uploads a whole db.sqlite to the
Railway volume, carrying that file's `schema_migrations` rows with it, so the
table describes the machine the file came from rather than the store it is in.
The census reads the same predicates, so "the volume is missing 019" is one
fact with one definition rather than two implementations that can disagree.

`schema_migrations` is still written — it is a useful log of when a migration
ran here — but nothing branches on it.
"""
from __future__ import annotations


# --- ETL path bootstrap (auto-added; see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB as _ETL_DB, ROOT as _ETL_ROOT  # noqa: E402,F401
# --- end ETL path bootstrap ---

import argparse  # noqa: E402
import sqlite3  # noqa: E402
import sys  # noqa: E402
from pathlib import Path  # noqa: E402

from schema_state import (  # noqa: E402
    DESCRIPTIONS, IDS, column_exists, is_applied, pending, table_exists,
)

DB_PATH = _ETL_DB
MIG_DIR = _Path(__file__).resolve().parent


def log_applied(conn: sqlite3.Connection, mig_id: str) -> None:
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations ("
        " id TEXT PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"
    )
    conn.execute("INSERT OR REPLACE INTO schema_migrations(id) VALUES (?)", (mig_id,))


def run_sql(conn: sqlite3.Connection, filename: str) -> None:
    """Execute a migration's .sql, statement by statement, tolerating only
    `duplicate column name`.

    `executescript` aborts the whole file on the first error, and most of the
    migrations here are a run of bare `ALTER TABLE ... ADD COLUMN`. A store that
    has some of a migration's columns and not the rest -- which is what a hand
    ALTER, or a script that self-heals one column, actually leaves behind -- can
    therefore never be finished by the runner: the first ALTER raises, the rest
    never run, and the store stays half-migrated for as long as anybody keeps
    running the migration and reading the same error.

    Skipping exactly one error class keeps that from being a dead end without
    hiding anything: a column that is already there is the outcome the statement
    was asking for. Every other error still aborts.
    """
    sql = (MIG_DIR / filename).read_text()
    body = "\n".join(line.split("--")[0] for line in sql.splitlines())
    for statement in (s.strip() for s in body.split(";")):
        if not statement:
            continue
        try:
            conn.execute(statement)
        except sqlite3.OperationalError as exc:
            if "duplicate column name" not in str(exc):
                raise
            print(f"  skip (already present): {' '.join(statement.split())[:70]}")
    print(f"  applied {filename}")


def apply_004(conn: sqlite3.Connection) -> None:
    """SATR columns + indexes on public_funding_events."""
    targets = [
        "satr_tm_id",
        "aid_instrument",
        "aid_objective",
        "granting_authority",
        "granting_authority_country",
    ]
    for col in targets:
        if not column_exists(conn, "public_funding_events", col):
            print(f"  ADD COLUMN {col}")
            conn.execute(f"ALTER TABLE public_funding_events ADD COLUMN {col} TEXT")
        else:
            print(f"  skip {col} (exists)")

    indexes = [
        ("idx_pfe_satr_tm_id",
         "CREATE INDEX IF NOT EXISTS idx_pfe_satr_tm_id ON public_funding_events(satr_tm_id) WHERE satr_tm_id IS NOT NULL"),
        ("idx_pfe_aid_instrument",
         "CREATE INDEX IF NOT EXISTS idx_pfe_aid_instrument ON public_funding_events(aid_instrument)"),
        ("idx_pfe_aid_objective",
         "CREATE INDEX IF NOT EXISTS idx_pfe_aid_objective ON public_funding_events(aid_objective)"),
        ("idx_pfe_granting_authority_country",
         "CREATE INDEX IF NOT EXISTS idx_pfe_granting_authority_country ON public_funding_events(granting_authority_country)"),
    ]
    for name, sql in indexes:
        print(f"  CREATE INDEX IF NOT EXISTS {name}")
        conn.execute(sql)


def apply_005(conn: sqlite3.Connection) -> None:
    """NDB-implementer columns + canonical ndb_distributor on public_funding_events."""
    targets = [
        "entrusted_entity",
        "financial_intermediaries",
        "ndb_distributor",
    ]
    for col in targets:
        if not column_exists(conn, "public_funding_events", col):
            print(f"  ADD COLUMN {col}")
            conn.execute(f"ALTER TABLE public_funding_events ADD COLUMN {col} TEXT")
        else:
            print(f"  skip {col} (exists)")
    indexes = [
        ("idx_pfe_entrusted_entity",
         "CREATE INDEX IF NOT EXISTS idx_pfe_entrusted_entity ON public_funding_events(entrusted_entity)"),
        ("idx_pfe_ndb_distributor",
         "CREATE INDEX IF NOT EXISTS idx_pfe_ndb_distributor ON public_funding_events(ndb_distributor) WHERE ndb_distributor IS NOT NULL"),
    ]
    for name, sql in indexes:
        print(f"  CREATE INDEX IF NOT EXISTS {name}")
        conn.execute(sql)


def apply_006(conn: sqlite3.Connection) -> None:
    """company_group rollup key on companies (name-based sister-entity grouping)."""
    if not column_exists(conn, "companies", "company_group"):
        print("  ADD COLUMN company_group")
        conn.execute("ALTER TABLE companies ADD COLUMN company_group TEXT")
    else:
        print("  skip company_group (exists)")
    print("  CREATE INDEX IF NOT EXISTS idx_companies_group")
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_companies_group "
        "ON companies(company_group) WHERE company_group IS NOT NULL"
    )


def apply_007(conn: sqlite3.Connection) -> None:
    """Pipeline scalability: hot-path indexes + WAL (2026-06-10 audit).

    - idx_companies_name_upper: every extractor's exact-match tier queries
      WHERE UPPER(canonical_name)=? — was a full table scan (7.3 ms/row at
      153k companies; minutes per register-scale load).
    - idx_pfe_source_call: the per-insert dedup probe (source, call_id) —
      was a bucket scan (4.25 ms on the 27.7k-row ademe_aid bucket).
      NOT unique: EIC/SATR legitimately share one call_id across all
      winners of a call / beneficiaries of an aid measure.
    - WAL journal mode: lets sanity checks and site generators read while
      a load is writing (loads previously held an exclusive lock for their
      whole single transaction).
    """
    indexes = [
        ("idx_companies_name_upper",
         "CREATE INDEX IF NOT EXISTS idx_companies_name_upper "
         "ON companies(UPPER(canonical_name))"),
        ("idx_pfe_source_call",
         "CREATE INDEX IF NOT EXISTS idx_pfe_source_call "
         "ON public_funding_events(source, call_id)"),
    ]
    for name, sql in indexes:
        print(f"  CREATE INDEX IF NOT EXISTS {name}")
        conn.execute(sql)
    mode = conn.execute("PRAGMA journal_mode=WAL").fetchone()[0]
    print(f"  journal_mode={mode}")
    conn.execute("ANALYZE")
    print("  ANALYZE done")


def apply_008(conn: sqlite3.Connection) -> None:
    """Sprint 19 equity layer: public_equity_stakes table + instrument_class.

    The DDL is in 008_equity_stakes_and_instrument_class.sql. It was restated in
    Python here until 2026-08-08, and only here, which is why both of its
    columns read as unexplained hand-ALTERs to everything that answers "what
    does committed DDL create" -- see the file's own header.
    """
    run_sql(conn, "008_equity_stakes_and_instrument_class.sql")


def apply_009(conn: sqlite3.Connection) -> None:
    """Cross-source duplicate flag + duplicate-free v_events.

    Some events are the same grant reported by two sources (an ADEME grant also
    published in SATR-FR). `is_duplicate=1` marks the row to drop from corpus
    totals; `dup_reason` records why. v_events (refreshed from data/views.sql)
    excludes flagged rows, so every downstream total nets the overlap at one
    point. Reversible: clear the flag and refresh views.
    """
    if not column_exists(conn, "public_funding_events", "is_duplicate"):
        print("  ADD COLUMN is_duplicate")
        conn.execute(
            "ALTER TABLE public_funding_events "
            "ADD COLUMN is_duplicate INTEGER NOT NULL DEFAULT 0"
        )
    else:
        print("  skip is_duplicate (exists)")
    if not column_exists(conn, "public_funding_events", "dup_reason"):
        print("  ADD COLUMN dup_reason")
        conn.execute("ALTER TABLE public_funding_events ADD COLUMN dup_reason TEXT")
    else:
        print("  skip dup_reason (exists)")
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_pfe_is_duplicate "
        "ON public_funding_events(is_duplicate) WHERE is_duplicate = 1"
    )
    print("  CREATE INDEX IF NOT EXISTS idx_pfe_is_duplicate")

    # Refresh all views from the canonical source so v_events picks up the
    # is_duplicate exclusion. views.sql drops and recreates every view.
    views_sql = (_ETL_ROOT / "data" / "views.sql").read_text()
    conn.executescript(views_sql)
    print("  refreshed views from data/views.sql")


def apply_010(conn: sqlite3.Connection) -> None:
    """Two-tier sector taxonomy columns on companies (see nace_taxonomy.md)."""
    targets = [
        "sector_top",
        "subsector",
        "sector_taxonomy_method",
        "sector_taxonomy_updated_at",
    ]
    for col in targets:
        if not column_exists(conn, "companies", col):
            typ = "TIMESTAMP" if col.endswith("_at") else "TEXT"
            print(f"  ADD COLUMN {col}")
            conn.execute(f"ALTER TABLE companies ADD COLUMN {col} {typ}")
        else:
            print(f"  skip {col} (exists)")
    for name, sql in [
        ("idx_companies_sector_top",
         "CREATE INDEX IF NOT EXISTS idx_companies_sector_top ON companies(sector_top) WHERE sector_top IS NOT NULL"),
        ("idx_companies_subsector",
         "CREATE INDEX IF NOT EXISTS idx_companies_subsector ON companies(subsector) WHERE subsector IS NOT NULL"),
    ]:
        print(f"  CREATE INDEX IF NOT EXISTS {name}")
        conn.execute(sql)


def apply_011(conn: sqlite3.Connection) -> None:
    """funding_instruments + funding_instrument_sources + eligibility_gates
    (see 011_funding_instruments.sql for the full schema rationale)."""
    sql = (MIG_DIR / "011_funding_instruments.sql").read_text()
    conn.executescript(sql)
    print("  applied 011_funding_instruments.sql")


def apply_012(conn: sqlite3.Connection) -> None:
    """'llm_cited' verification tier + eligibility_clauses table (Phase 5:
    comprehensive text-first eligibility research, see
    012_llm_cited_and_clauses.sql for the full rationale)."""
    sql = (MIG_DIR / "012_llm_cited_and_clauses.sql").read_text()
    conn.executescript(sql)
    print("  applied 012_llm_cited_and_clauses.sql")


def apply_013(conn: sqlite3.Connection) -> None:
    """gate_role + intake_field_resolved + encoding_method — makes the
    eligibility corpus machine-decidable without mutating extractor-owned
    columns (see 013_gate_role_and_resolved_field.sql for the measurements
    that motivated it)."""
    sql = (MIG_DIR / "013_gate_role_and_resolved_field.sql").read_text()
    conn.executescript(sql)
    print("  applied 013_gate_role_and_resolved_field.sql")


def apply_014(conn: sqlite3.Connection) -> None:
    """administering_body_share — how much of an instrument's history the body
    we NAME actually awarded. Without it the frontend rendered a 15%-plurality
    agency as if it were the fund (see the SQL for the measurements)."""
    sql = (MIG_DIR / "014_administering_body_share.sql").read_text()
    conn.executescript(sql)
    print("  applied 014_administering_body_share.sql")


def apply_015(conn: sqlite3.Connection) -> None:
    """award_p25/p50/p75 + award_n — what an instrument typically GIVES.

    total_eur is the size of the scheme, not of an award, and the corpus spans
    EUR 16k at p10 to EUR 1.1M at p90 (see the SQL). 92% of events already
    carry an amount; this records what was always derivable."""
    sql = (MIG_DIR / "015_award_percentiles.sql").read_text()
    conn.executescript(sql)
    print("  applied 015_award_percentiles.sql")


def apply_016(conn: sqlite3.Connection) -> None:
    """programme_ref / programme_name — the substream level.

    The raw registers name their programmes and the loaders dropped it: 473
    ADEME programmes became one row. See the SQL for why the name is never
    synthesised."""
    sql = (MIG_DIR / "016_programme_identity.sql").read_text()
    conn.executescript(sql)
    print("  applied 016_programme_identity.sql")


def apply_017(conn: sqlite3.Connection) -> None:
    """company_sector_labels -- sector labels that survive a company reload.

    An entire paid classification pass was destroyed by the next destructive
    reload of companies; see the SQL."""
    sql = (MIG_DIR / "017_company_sector_labels.sql").read_text()
    conn.executescript(sql)
    print("  applied 017_company_sector_labels.sql")


def apply_018(conn: sqlite3.Connection) -> None:
    """intensity_p50 / intensity_n -- realised aid intensity, measured from
    events that carry both a grant and a total project cost."""
    sql = (MIG_DIR / "018_realised_intensity.sql").read_text()
    conn.executescript(sql)
    print("  applied 018_realised_intensity.sql")


def apply_019(conn: sqlite3.Connection) -> None:
    """tier / root_id / depth — the hierarchy, made explicit and filterable."""
    conn.executescript((MIG_DIR / "019_instrument_hierarchy.sql").read_text())
    print("  applied 019_instrument_hierarchy.sql")


def apply_020(conn: sqlite3.Connection) -> None:
    """register_derived — a third evidence tier for register-filed facts."""
    conn.executescript((MIG_DIR / "020_register_derived_tier.sql").read_text())
    print("  applied 020_register_derived_tier.sql")


def apply_021(conn: sqlite3.Connection) -> None:
    """programme_feed name_source — names the feed itself carries."""
    conn.executescript((MIG_DIR / "021_programme_feed_name_source.sql").read_text())
    print("  applied 021_programme_feed_name_source.sql")


def apply_022(conn: sqlite3.Connection) -> None:
    """case_register name_source — the Commission's title for a notified scheme."""
    conn.executescript((MIG_DIR / "022_case_register_name_source.sql").read_text())
    print("  applied 022_case_register_name_source.sql")


def apply_023(conn: sqlite3.Connection) -> None:
    """scheme_end_date / successor — the register's word on a scheme's lifetime."""
    conn.executescript((MIG_DIR / "023_scheme_lifetime.sql").read_text())
    print("  applied 023_scheme_lifetime.sql")


def apply_024(conn: sqlite3.Connection) -> None:
    """delivery_region — where a fund's money actually lands, as routing."""
    conn.executescript((MIG_DIR / "024_delivery_region.sql").read_text())
    print("  applied 024_delivery_region.sql")


def apply_025(conn: sqlite3.Connection) -> None:
    """catchment_region — the territory a body is REGISTERED to serve, which is a
    rule, as against delivery_region's measured award footprint."""
    conn.executescript((MIG_DIR / "025_declared_catchment.sql").read_text())
    print("  applied 025_declared_catchment.sql")


def apply_026(conn: sqlite3.Connection) -> None:
    """scheme_end_date_basis -- WHICH register supplied the end date, hence
    whether its expiry closes anything. See the migration's own header.

    Filed as a second `025` until 2026-08-07, which made it unreachable: two
    `def apply_025` in one module means Python keeps the later one, so
    `apply.py 025` ran the catchment migration and this SQL could not be
    applied by the runner at all. That is exactly the failure that put the
    Railway volume a migration behind, and the reason MIGRATIONS is now derived
    from schema_state.IDS rather than hand-written — a duplicate key in a dict
    literal is silent, a duplicate id in the registry is a startup error.
    """
    conn.executescript((MIG_DIR / "026_scheme_end_date_basis.sql").read_text())
    print("  applied 026_scheme_end_date_basis.sql")


def apply_027(conn: sqlite3.Connection) -> None:
    """The columns that only ever existed because an ETL script ALTERed them in
    on itself, or because somebody typed ALTER. Part 1 of 2 — see the
    migration's own header for the list, for the split, and for the three tables
    that are deliberately not in it.

    Runs through run_sql rather than executescript on purpose: every store this
    will meet already has SOME of these columns, because the scripts that add
    them run at different times.
    """
    run_sql(conn, "027_columns_that_had_no_migration.sql")


def apply_028(conn: sqlite3.Connection) -> None:
    """Part 2 of 027: the funding_instruments columns that must land after the
    021/022 table rebuilds, which delete anything not in their column list."""
    run_sql(conn, "028_columns_added_after_the_rebuilds.sql")


# Derived from the registry rather than written out again: schema_state.IDS is
# the list of migrations that exist, and a migration with a guard but no
# implementation (or the reverse) is a startup error here instead of a
# surprise on the one store that needed it.
MIGRATIONS = {i: globals()[f"apply_{i}"] for i in IDS}
_orphans = [i for i in IDS if f"apply_{i}" not in globals()]
if _orphans:  # pragma: no cover - structural, fails at import
    raise RuntimeError(f"schema_state declares {_orphans} with no apply_NNN here")


def _run(conn: sqlite3.Connection, mig_id: str) -> None:
    print(f"Applying migration {mig_id} — {DESCRIPTIONS[mig_id]}")
    MIGRATIONS[mig_id](conn)
    log_applied(conn, mig_id)
    conn.commit()
    if not is_applied(conn, mig_id):
        # The migration ran and its own guard still says it did not happen.
        # Louder than a silent pass: the next reader would take the store for
        # up to date on the strength of a log row.
        raise SystemExit(
            f"Migration {mig_id} ran but its effect is not present in the store. "
            f"Do not treat this database as migrated.")
    print(f"Migration {mig_id} applied.")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("migration", nargs="?", help="a single migration id, e.g. 019")
    ap.add_argument("--all", action="store_true",
                    help="apply every pending migration, in order. This is what "
                         "the weekly Railway run does against the volume.")
    ap.add_argument("--status", action="store_true",
                    help="say what this store is missing and change nothing")
    ap.add_argument("--db", default=None,
                    help="the store to act on. Defaults to etl_env.DB. There is "
                         "more than one store in this project and only one of "
                         "them is the laptop's, which is how the volume ended up "
                         "9 of 23 migrations behind.")
    args = ap.parse_args()

    DB_PATH = _Path(args.db) if args.db else _ETL_DB
    conn = sqlite3.connect(DB_PATH)
    try:
        missing = pending(conn)
        if args.status:
            print(f"store: {DB_PATH}")
            print(f"  {len(IDS) - len(missing)}/{len(IDS)} migrations present")
            for m in missing:
                print(f"  PENDING {m} — {DESCRIPTIONS[m]}")
            raise SystemExit(1 if missing else 0)

        if args.all:
            if not missing:
                print(f"store: {DB_PATH}\n  up to date — all {len(IDS)} migrations present")
                return
            print(f"store: {DB_PATH}\n  {len(missing)} pending: {', '.join(missing)}")
            for m in missing:
                _run(conn, m)
            return

        if not args.migration:
            ap.error("give a migration id, or --all, or --status")
        if args.migration not in MIGRATIONS:
            sys.exit(f"Unknown migration: {args.migration}. Available: {list(IDS)}")
        if is_applied(conn, args.migration):
            print(f"Migration {args.migration} is already present in this store — "
                  f"re-running idempotently.")
        _run(conn, args.migration)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
