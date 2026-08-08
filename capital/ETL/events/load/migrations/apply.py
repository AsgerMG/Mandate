"""Idempotent migration runner — for EVERY store, not whichever one you are at.

Usage:
  python3 ETL/events/load/migrations/apply.py all       bring this store up to date
  python3 ETL/events/load/migrations/apply.py --check   what is pending (exit 1 if any)
  python3 ETL/events/load/migrations/apply.py --ids     ids reachable? (no store needed)
  python3 ETL/events/load/migrations/apply.py 004       one migration, by id

Applies a migration only if its columns/indexes are not already present, and
logs it to schema_migrations (auto-created). `all` is the form that matters:
this repo's schema drift was never a bad migration, it was a migration nobody
ran against the second store. See apply_all().
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

import re
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


def apply_020(conn: sqlite3.Connection) -> None:
    """register_derived — a third evidence tier for register-filed facts."""
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE name = 'eligibility_gates'").fetchone()
    if row and "register_derived" in row[0]:
        print("  skip 020 (already applied)")
        return
    conn.executescript((MIG_DIR / "020_register_derived_tier.sql").read_text())
    print("  applied 020_register_derived_tier.sql")


def apply_021(conn: sqlite3.Connection) -> None:
    """programme_feed name_source — names the feed itself carries."""
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE name = 'funding_instruments'").fetchone()
    if row and "programme_feed" in row[0]:
        print("  skip 021 (already applied)")
        return
    conn.executescript((MIG_DIR / "021_programme_feed_name_source.sql").read_text())
    print("  applied 021_programme_feed_name_source.sql")


def apply_022(conn: sqlite3.Connection) -> None:
    """case_register name_source — the Commission's title for a notified scheme."""
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE name = 'funding_instruments'").fetchone()
    if row and "case_register" in row[0]:
        print("  skip 022 (already applied)")
        return
    conn.executescript((MIG_DIR / "022_case_register_name_source.sql").read_text())
    print("  applied 022_case_register_name_source.sql")


def apply_023(conn: sqlite3.Connection) -> None:
    """scheme_end_date / successor — the register's word on a scheme's lifetime."""
    if column_exists(conn, "funding_instruments", "scheme_end_date"):
        print("  skip 023 (already applied)")
        return
    conn.executescript((MIG_DIR / "023_scheme_lifetime.sql").read_text())
    print("  applied 023_scheme_lifetime.sql")


def apply_025(conn: sqlite3.Connection) -> None:
    """scheme_end_date_basis -- WHICH register supplied the end date, hence
    whether its expiry closes anything. See the migration's own header.

    Numbered 026, not 025. Two migrations were both written as 025, and because
    this one is defined ABOVE the other, Python's second `def apply_025` simply
    replaced it: MIGRATIONS["025"] pointed at declared_catchment and this
    migration was unreachable through the runner on every database that had not
    already had it applied by hand. The live corpus records both 025 and 026 in
    schema_migrations, so 026 is the id it was in fact applied under."""
    if column_exists(conn, "funding_instruments", "scheme_end_date_basis"):
        print("  skip 025 (already applied)")
        return
    conn.executescript((MIG_DIR / "025_scheme_end_date_basis.sql").read_text())
    print("  applied 025_scheme_end_date_basis.sql")


def apply_024(conn: sqlite3.Connection) -> None:
    """delivery_region — where a fund's money actually lands, as routing."""
    if column_exists(conn, "funding_instruments", "delivery_region"):
        print("  skip 024 (already applied)")
        return
    conn.executescript((MIG_DIR / "024_delivery_region.sql").read_text())
    print("  applied 024_delivery_region.sql")


def apply_027(conn: sqlite3.Connection) -> None:
    """catchment_region — the territory a body is REGISTERED to serve, which is a
    rule, as against delivery_region's measured award footprint.

    Numbered 027, and the journey to that number is the whole lesson. It was
    written as a second 025, so its function SHADOWED apply_025 above:
    `MIGRATIONS["025"]` resolved to this one and 025_scheme_end_date_basis.sql
    was unreachable through the runner — on any store that had not already
    received it by hand, the column whose absence cost 306 of 948 leaves would
    simply never be created.

    Two workstreams found that independently and both renumbered to 026 — AL
    moved THIS file, AS moved the other one. Neither was correct by the time
    they landed, because 026 had meanwhile been taken by the capital_type
    migration on main. Merging AL alone re-created the identical defect one
    number along: two `def apply_026`, this one shadowed by capital_type's, and
    `declared_catchment` unreachable again. The merge silently undid the fix it
    was carrying.

    So 027, which is free in every store. And the reason it could go wrong three
    times is structural, not careless: MIGRATIONS is a hand-written dict whose
    keys cannot notice that Python already threw one of the two `def`s away.
    check_migration_ids() below is what makes it noticeable.
    """
    if column_exists(conn, "funding_instruments", "catchment_region"):
        print("  skip 027 (already applied)")
        return
    conn.executescript((MIG_DIR / "027_declared_catchment.sql").read_text())
    print("  applied 027_declared_catchment.sql")


CAPITAL_TYPE_VALUES = (
    "grant", "loan", "guarantee", "counter_guarantee", "equity", "blended",
    "tax_credit", "recoverable_advance", "framework", "unknown",
    # Added by 026. See ETL/events/load/populate_funding_instruments.py.
    "non_financial", "undetermined",
)


def apply_026(conn: sqlite3.Connection) -> None:
    """Two capital_type values that separate three states the column collapsed.

    `unknown` was carrying all of "this pays nothing", "the source will not say
    what it pays" and "we never looked". None of them is reachable by any intake
    option, so all three funds were removed for every founder in every country,
    and there was no way to tell a debt we owe from a decision we made.

      non_financial  the programme's OWN page says participants receive support
                     and no capital -- EIT Digital's Venture Acceleration
                     Programme, EIT Food's RisingFoodStars. A described object
                     this product may not offer, because every intake option is
                     a kind of capital.
      undetermined   the official source was consulted and does not state the
                     kind. EIT Climate-KIC's Clean Cities Spain cohort is
                     ambiguous between a Stage 1 cash grant and a Stage 2
                     Climate-SAFE, and the cohort page names neither.
      unknown        we never recorded it. The only one of the three that is a
                     DEFECT, and now the only one the ratchet in
                     website/frontend/scripts/check_capital_reach.ts counts.

    SQLite cannot ALTER a CHECK constraint, and 021 rebuilt the whole table to
    widen `name_source` -- 54 columns ago. Rebuilding again would mean
    hand-restating a column list that has grown six times since and is the
    stated reason 021's own comment gives for reading the schema rather than
    assuming it. So the DDL TEXT is edited in place instead: no data moves, no
    column list is retyped, nothing can be dropped by omission.
    """
    ddl = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='funding_instruments'"
    ).fetchone()
    if ddl is None:
        print("  skip 026 (funding_instruments absent)")
        return
    if "'non_financial'" in ddl[0]:
        print("  skip 026 (already applied)")
        return
    old = "'framework','unknown')"
    if old not in ddl[0]:
        raise SystemExit(
            "026: the capital_type CHECK is not in the shape this migration "
            "expects. Inspect the DDL and update the migration rather than "
            "loosening it -- a dropped constraint is how an unreachable value "
            "gets in silently.")
    new_ddl = ddl[0].replace(old, "'framework','unknown','non_financial','undetermined')")
    version = conn.execute("PRAGMA schema_version").fetchone()[0]
    conn.execute("PRAGMA writable_schema=ON")
    conn.execute(
        "UPDATE sqlite_master SET sql=? WHERE type='table' AND name='funding_instruments'",
        (new_ddl,))
    conn.execute(f"PRAGMA schema_version={version + 1}")
    conn.execute("PRAGMA writable_schema=OFF")
    conn.commit()
    bad = conn.execute("PRAGMA integrity_check").fetchone()[0]
    if bad != "ok":
        raise SystemExit(f"026: integrity_check failed after DDL edit: {bad}")
    print("  applied 026: capital_type gains non_financial, undetermined")


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
    "020": apply_020,
    "021": apply_021,
    "022": apply_022,
    "023": apply_023,
    "024": apply_024,
    "025": apply_025,
    "026": apply_026,
    "027": apply_027,
}


def check_migration_ids() -> list[str]:
    """Every migration id is reachable, exactly once. Returns complaints.

    ── Why a hand-written dict cannot police itself ────────────────────────
    `MIGRATIONS` maps "025" to `apply_025`. If two functions are both named
    `apply_025`, Python keeps the second and discards the first WITHOUT a word,
    and the dict then maps the id to whichever survived. The table looks
    complete. Every id is present. One migration has simply ceased to exist.

    That happened, and then it happened twice more while being fixed: workstream
    AL renumbered 025_declared_catchment to 026, workstream AS renumbered
    025_scheme_end_date_basis to 026, and by the time either landed, main had
    given 026 to capital_type. Merging AL's fix re-created the same shadowing
    one number along. Three occurrences of one defect, none of which any test
    could see, because the failure is a NAME COLLISION IN SOURCE and every
    runtime structure downstream of it is well-formed.

    So this reads the source text rather than the dict, which is the only place
    the collision is still visible, and cross-checks it against the .sql files
    on disk. It runs on every invocation, including `--check`, because a
    migration that is unreachable is not a lint issue: it is a store that can
    never reach the schema this checkout expects.
    """
    problems: list[str] = []

    # 1. Duplicate `def apply_NNN` in this file. Python has already collapsed
    #    them by the time anything imports us, so the source is the only witness.
    defs: dict[str, int] = {}
    for m in re.finditer(r"^def (apply_(\d{3}))\(", Path(__file__).read_text(), re.M):
        defs[m.group(2)] = defs.get(m.group(2), 0) + 1
    for mig_id, n in sorted(defs.items()):
        if n > 1:
            problems.append(
                f"{n} functions are named apply_{mig_id}. Python keeps the last and "
                f"silently discards the rest, so {n - 1} migration(s) are unreachable "
                f"through this runner and no store can ever reach their schema.")

    # 2. Every .sql on disk is reachable, and every entry has its file. A file
    #    nobody calls is a migration that was written and never applied anywhere.
    on_disk = {p.name.split("_", 1)[0] for p in MIG_DIR.glob("[0-9][0-9][0-9]_*.sql")}
    orphaned = sorted(on_disk - set(MIGRATIONS))
    if orphaned:
        problems.append(
            f"{len(orphaned)} migration file(s) with no MIGRATIONS entry: "
            f"{', '.join(orphaned)}. Unreachable through the runner.")

    # 3. Ids must be contiguous from the first. A gap is either a migration that
    #    was deleted after being applied somewhere -- so that store now records
    #    an id nothing can reproduce -- or a renumbering that lost a file.
    ids = sorted(MIGRATIONS)
    gaps = [f"{n:03d}" for a, b in zip(ids, ids[1:])
            for n in range(int(a) + 1, int(b))]
    if gaps:
        problems.append(f"gap(s) in the migration sequence at: {', '.join(gaps)}.")

    return problems


def applied_ids(conn: sqlite3.Connection) -> set[str]:
    """Every id this store has recorded. Creates the table if absent, so a store
    that has never been migrated reports an empty set rather than raising."""
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations ("
        " id TEXT PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"
    )
    return {r[0] for r in conn.execute("SELECT id FROM schema_migrations")}


def status(conn: sqlite3.Connection) -> tuple[list[str], list[str]]:
    """(pending, unknown) for this store.

    `unknown` is an id the store has recorded that this runner cannot produce.
    That is not a curiosity: it means somebody ran the DDL by hand and stamped
    it, so the change exists in exactly one store and no other store can ever
    reach the same schema. It is reported, loudly, rather than ignored.
    """
    have = applied_ids(conn)
    pending = [m for m in sorted(MIGRATIONS) if m not in have]
    unknown = sorted(have - set(MIGRATIONS))
    return pending, unknown


def apply_one(conn: sqlite3.Connection, mig_id: str) -> None:
    MIGRATIONS[mig_id](conn)
    conn.execute("INSERT OR REPLACE INTO schema_migrations(id) VALUES (?)", (mig_id,))


def apply_all(conn: sqlite3.Connection) -> list[str]:
    """Bring this store to the checkout's schema. Idempotent, in id order.

    ── Why this exists ────────────────────────────────────────────────────
    Until it did, a migration reached a store only when a human remembered to
    run `apply.py <id>` while pointed at that store. In practice that meant the
    laptop, every time, and the Railway volume never — the corpus census taken
    inside the container on 2026-08-07 failed its whole coverage block with
    `no such column: tier`, migration 020, three weeks after it was applied
    here. Schema changes also ride on ordinary ETL scripts that self-heal with
    ALTER TABLE (mark_offer_route.py, name_applicable_object.py,
    merge_companies.py, classify.py), which has the same shape: the schema
    follows whichever SCRIPT ran, not whichever STORE matters.

    So this is a step a pipeline can run, not a command a person must remember,
    and railway_cron.py runs it first.
    """
    pending, unknown = status(conn)
    if unknown:
        print(f"  WARNING: {len(unknown)} id(s) recorded here that this runner "
              f"does not know: {', '.join(unknown)}")
        print("  Somebody applied DDL by hand. No other store can reproduce it.")
    # Every migration, not just the unstamped ones. A stamp is a RECORD that
    # something ran, and this repo has stamps that are not true: DDL applied by
    # hand and stamped after the fact, and ids that moved under stores which had
    # already recorded them when two workstreams renumbered the same collision.
    # Trusting the stamp makes those permanent -- the store skips forever and
    # the column never arrives. Each apply_NNN tests for its own change first,
    # so this is a column of skips on a current store and a repair on a lying
    # one. `pending` is still what gets REPORTED, because that is the honest
    # answer to "what did this store not have".
    for mig_id in sorted(MIGRATIONS):
        apply_one(conn, mig_id)
    conn.commit()
    return pending


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit("Usage: python apply.py <migration_id> | all | --check | --ids")
    arg = sys.argv[1]

    # Before any store is opened. An unreachable migration is not a lint issue:
    # it is a schema no store can reach, and applying the reachable ones on top
    # of that produces a store that looks migrated and is not.
    broken = check_migration_ids()
    if broken:
        for b in broken:
            print(f"MIGRATION TABLE BROKEN: {b}", file=sys.stderr)
        sys.exit(1)

    # `--ids` is that check ALONE, touching no store and needing no corpus.
    # It exists so CI can run it. CI has no data/db.sqlite -- the file is
    # gitignored -- so `--check` there would connect to an empty database,
    # report 27 pending and fail every build; the guard would then be removed
    # and the collision it catches would go back to being invisible. This is
    # the half that reads only committed source, which is exactly what CI holds.
    if arg == "--ids":
        print(f"{len(MIGRATIONS)} migrations, every id reachable exactly once.")
        return

    conn = sqlite3.connect(DB_PATH)
    try:
        if arg == "--check":
            pending, unknown = status(conn)
            print(f"{DB_PATH}")
            print(f"  applied {len(applied_ids(conn))}, pending {len(pending)}"
                  + (f": {', '.join(pending)}" if pending else ""))
            if unknown:
                print(f"  UNKNOWN (hand-applied, unreproducible elsewhere): "
                      f"{', '.join(unknown)}")
            sys.exit(1 if (pending or unknown) else 0)

        if arg == "all":
            applied = apply_all(conn)
            print(f"Schema up to date ({len(applied)} applied this run"
                  + (f": {', '.join(applied)}" if applied else "") + ").")
            return

        if arg not in MIGRATIONS:
            sys.exit(f"Unknown migration: {arg}. Available: {sorted(MIGRATIONS)}")
        if already_applied(conn, arg):
            print(f"Migration {arg} already applied — re-running idempotently.")
        print(f"Applying migration {arg}...")
        apply_one(conn, arg)
        conn.commit()
        print(f"Migration {arg} applied.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
