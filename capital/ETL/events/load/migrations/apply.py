"""Idempotent migration runner.

Usage: python ETL/load/migrations/apply.py 004

Applies the migration only if its columns/indexes are not already present.
Logs applied migrations to schema_migrations table (auto-created).
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

import sqlite3
import sys
from pathlib import Path

DB_PATH = _ETL_DB
MIG_DIR = _Path(__file__).resolve().parent


def already_applied(conn: sqlite3.Connection, mig_id: str) -> bool:
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations ("
        " id TEXT PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"
    )
    row = conn.execute(
        "SELECT 1 FROM schema_migrations WHERE id = ?", (mig_id,)
    ).fetchone()
    return row is not None


def table_exists(conn: sqlite3.Connection, table: str) -> bool:
    return conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone() is not None


def column_exists(conn: sqlite3.Connection, table: str, column: str) -> bool:
    cols = [r[1] for r in conn.execute(f"PRAGMA table_info({table})")]
    return column in cols


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

    - public_equity_stakes: positions, not funding events. One row per
      (company, holding institution, as-of date). Stakes NEVER sum with
      grants/loans — that is the whole point of a separate table.
      disclosure_level is the unit of analysis for the disclosure scorecard.
    - instrument_class on public_funding_events: labels already-loaded rows
      that are equity-class instruments (SATR PRVRISKFIN risk finance, BDNS
      participative loans, EIC Fund positions, NDB co-invest rounds) so the
      grant channel can exclude them and the equity signal is queryable.
    """
    conn.execute("""
        CREATE TABLE IF NOT EXISTS public_equity_stakes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL REFERENCES companies(id),
            holder TEXT NOT NULL,
            holder_type TEXT NOT NULL CHECK (holder_type IN (
                'eu_instrument','ndb','state_vc','regional_agency',
                'sovereign_fund','other')),
            stake_pct_min REAL,
            stake_pct_max REAL,
            ticket_eur REAL,
            as_of DATE,
            first_seen DATE,
            exited INTEGER NOT NULL DEFAULT 0,
            source TEXT NOT NULL,
            raw_source_url TEXT,
            disclosure_level TEXT NOT NULL CHECK (disclosure_level IN (
                'name_only','pct_range','pct_exact','amount')),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (company_id, holder, source, as_of)
        )
    """)
    print("  CREATE TABLE IF NOT EXISTS public_equity_stakes")
    indexes = [
        ("idx_pes_company",
         "CREATE INDEX IF NOT EXISTS idx_pes_company "
         "ON public_equity_stakes(company_id)"),
        ("idx_pes_holder",
         "CREATE INDEX IF NOT EXISTS idx_pes_holder "
         "ON public_equity_stakes(holder)"),
        ("idx_pes_disclosure",
         "CREATE INDEX IF NOT EXISTS idx_pes_disclosure "
         "ON public_equity_stakes(disclosure_level)"),
    ]
    for name, sql in indexes:
        print(f"  CREATE INDEX IF NOT EXISTS {name}")
        conn.execute(sql)

    # via_fund (2026-06-11, PFR extraction): NULL = direct holding by the
    # institution; non-NULL = look-through LP exposure via the named private
    # fund (PFR Ventures publishes its full look-through portfolio — unique
    # among European FoFs). Look-through stakes NEVER compare with direct.
    if not column_exists(conn, "public_equity_stakes", "via_fund"):
        print("  ADD COLUMN via_fund")
        conn.execute("ALTER TABLE public_equity_stakes ADD COLUMN via_fund TEXT")
    else:
        print("  skip via_fund (exists)")

    if not column_exists(conn, "public_funding_events", "instrument_class"):
        print("  ADD COLUMN instrument_class")
        conn.execute(
            "ALTER TABLE public_funding_events ADD COLUMN instrument_class TEXT"
        )
    else:
        print("  skip instrument_class (exists)")
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_pfe_instrument_class "
        "ON public_funding_events(instrument_class) "
        "WHERE instrument_class IS NOT NULL"
    )
    print("  CREATE INDEX IF NOT EXISTS idx_pfe_instrument_class")


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
    if column_exists(conn, "eligibility_gates", "verify_by"):
        print("  skip 012 (already applied — verify_by exists)")
        return
    sql = (MIG_DIR / "012_llm_cited_and_clauses.sql").read_text()
    conn.executescript(sql)
    print("  applied 012_llm_cited_and_clauses.sql")


def apply_013(conn: sqlite3.Connection) -> None:
    """gate_role + intake_field_resolved + encoding_method — makes the
    eligibility corpus machine-decidable without mutating extractor-owned
    columns (see 013_gate_role_and_resolved_field.sql for the measurements
    that motivated it)."""
    if column_exists(conn, "eligibility_gates", "gate_role"):
        print("  skip 013 (already applied — gate_role exists)")
        return
    sql = (MIG_DIR / "013_gate_role_and_resolved_field.sql").read_text()
    conn.executescript(sql)
    print("  applied 013_gate_role_and_resolved_field.sql")


def apply_014(conn: sqlite3.Connection) -> None:
    """administering_body_share — how much of an instrument's history the body
    we NAME actually awarded. Without it the frontend rendered a 15%-plurality
    agency as if it were the fund (see the SQL for the measurements)."""
    if column_exists(conn, "funding_instruments", "administering_body_share"):
        print("  skip 014 (already applied — administering_body_share exists)")
        return
    sql = (MIG_DIR / "014_administering_body_share.sql").read_text()
    conn.executescript(sql)
    print("  applied 014_administering_body_share.sql")


def apply_015(conn: sqlite3.Connection) -> None:
    """award_p25/p50/p75 + award_n — what an instrument typically GIVES.

    total_eur is the size of the scheme, not of an award, and the corpus spans
    EUR 16k at p10 to EUR 1.1M at p90 (see the SQL). 92% of events already
    carry an amount; this records what was always derivable."""
    if column_exists(conn, "funding_instruments", "award_p50"):
        print("  skip 015 (already applied — award_p50 exists)")
        return
    sql = (MIG_DIR / "015_award_percentiles.sql").read_text()
    conn.executescript(sql)
    print("  applied 015_award_percentiles.sql")


def apply_016(conn: sqlite3.Connection) -> None:
    """programme_ref / programme_name — the substream level.

    The raw registers name their programmes and the loaders dropped it: 473
    ADEME programmes became one row. See the SQL for why the name is never
    synthesised."""
    if column_exists(conn, "public_funding_events", "programme_name"):
        print("  skip 016 (already applied — programme_name exists)")
        return
    sql = (MIG_DIR / "016_programme_identity.sql").read_text()
    conn.executescript(sql)
    print("  applied 016_programme_identity.sql")


def apply_017(conn: sqlite3.Connection) -> None:
    """company_sector_labels -- sector labels that survive a company reload.

    An entire paid classification pass was destroyed by the next destructive
    reload of companies; see the SQL."""
    if table_exists(conn, "company_sector_labels"):
        print("  skip 017 (already applied)")
        return
    sql = (MIG_DIR / "017_company_sector_labels.sql").read_text()
    conn.executescript(sql)
    print("  applied 017_company_sector_labels.sql")


def apply_018(conn: sqlite3.Connection) -> None:
    """intensity_p50 / intensity_n -- realised aid intensity, measured from
    events that carry both a grant and a total project cost."""
    if column_exists(conn, "funding_instruments", "intensity_p50"):
        print("  skip 018 (already applied)")
        return
    sql = (MIG_DIR / "018_realised_intensity.sql").read_text()
    conn.executescript(sql)
    print("  applied 018_realised_intensity.sql")


def apply_019(conn: sqlite3.Connection) -> None:
    """tier / root_id / depth — the hierarchy, made explicit and filterable."""
    if column_exists(conn, "funding_instruments", "tier"):
        print("  skip 019 (already applied)")
        return
    conn.executescript((MIG_DIR / "019_instrument_hierarchy.sql").read_text())
    print("  applied 019_instrument_hierarchy.sql")


MIGRATIONS = {
    "004": apply_004,
    "005": apply_005,
    "006": apply_006,
    "007": apply_007,
    "008": apply_008,
    "009": apply_009,
    "010": apply_010,
    "011": apply_011,
    "012": apply_012,
    "013": apply_013,
    "014": apply_014,
    "015": apply_015,
    "016": apply_016,
    "017": apply_017,
    "018": apply_018,
    "019": apply_019,
}


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit("Usage: python apply.py <migration_id>")
    mig_id = sys.argv[1]
    if mig_id not in MIGRATIONS:
        sys.exit(f"Unknown migration: {mig_id}. Available: {sorted(MIGRATIONS)}")

    conn = sqlite3.connect(DB_PATH)
    try:
        if already_applied(conn, mig_id):
            print(f"Migration {mig_id} already applied — re-running idempotently.")
        print(f"Applying migration {mig_id}...")
        MIGRATIONS[mig_id](conn)
        conn.execute(
            "INSERT OR REPLACE INTO schema_migrations(id) VALUES (?)",
            (mig_id,),
        )
        conn.commit()
        print(f"Migration {mig_id} applied.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
