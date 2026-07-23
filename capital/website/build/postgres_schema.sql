-- Postgres schema for the eligibility subsystem (Railway migration Phase 2).
-- Direct translation of the SQLite tables in
-- ETL/events/load/migrations/011_funding_instruments.sql +
-- 012_llm_cited_and_clauses.sql. Only these 4 tables move to Postgres —
-- the broad companies/events corpus stays SQLite-authored + JSON-exported
-- (see the migration plan for why).
--
-- Translation notes:
--   INTEGER PRIMARY KEY AUTOINCREMENT -> GENERATED ALWAYS AS IDENTITY
--   REAL                              -> DOUBLE PRECISION
--   TIMESTAMP DEFAULT CURRENT_TIMESTAMP -> TIMESTAMPTZ DEFAULT now()
--   is_framework INTEGER (0/1)        -> BOOLEAN
--   enums stay TEXT + CHECK (not Postgres ENUM types) -- matches the SQLite
--     convention exactly and avoids ALTER TYPE friction as tiers/families grow
--
-- Apply with: psql "$DATABASE_URL" -f website/build/postgres_schema.sql

CREATE TABLE IF NOT EXISTS funding_instruments (
    id                     TEXT PRIMARY KEY,
    parent_id              TEXT REFERENCES funding_instruments(id),
    name                   TEXT NOT NULL,
    name_source            TEXT NOT NULL DEFAULT 'deterministic'
                               CHECK (name_source IN ('deterministic','curated')),
    country                TEXT,
    administering_body     TEXT,
    ndb_id                 TEXT,
    source_family_bucket   TEXT,
    capital_type           TEXT NOT NULL DEFAULT 'unknown'
                               CHECK (capital_type IN (
                                   'grant','loan','guarantee','counter_guarantee',
                                   'equity','blended','tax_credit','recoverable_advance',
                                   'framework','unknown')),
    capital_type_basis     TEXT,
    event_count            INTEGER NOT NULL DEFAULT 0,
    company_count          INTEGER NOT NULL DEFAULT 0,
    total_eur              DOUBLE PRECISION NOT NULL DEFAULT 0,
    first_year             INTEGER,
    last_year              INTEGER,
    is_framework            BOOLEAN NOT NULL DEFAULT FALSE,
    sample_project_titles  TEXT,
    created_at             TIMESTAMPTZ DEFAULT now(),
    updated_at             TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fi_parent   ON funding_instruments(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fi_country  ON funding_instruments(country);
CREATE INDEX IF NOT EXISTS idx_fi_capital  ON funding_instruments(capital_type);
CREATE INDEX IF NOT EXISTS idx_fi_events   ON funding_instruments(event_count DESC);

CREATE TABLE IF NOT EXISTS funding_instrument_sources (
    instrument_id TEXT NOT NULL REFERENCES funding_instruments(id),
    source        TEXT NOT NULL,
    PRIMARY KEY (instrument_id, source)
);
CREATE INDEX IF NOT EXISTS idx_fis_source ON funding_instrument_sources(source);

CREATE TABLE IF NOT EXISTS eligibility_gates (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    instrument_id       TEXT NOT NULL REFERENCES funding_instruments(id),
    gate_key            TEXT NOT NULL,
    gate_family         TEXT NOT NULL CHECK (gate_family IN
                            ('G1_nexus','G2_size_ownership','G3_financial',
                             'G4_borrower_model','G5_use_of_funds','G6_conditionality')),
    requirement         TEXT NOT NULL,
    value                TEXT,
    value_spec           TEXT,
    intake_field         TEXT NOT NULL DEFAULT 'none',
    quote                TEXT,
    source_file          TEXT,
    source_locator       TEXT,
    verification_level   TEXT NOT NULL CHECK (verification_level IN
                            ('inventory_inferred','llm_classified','llm_cited','llm_2pass','human_verified')),
    verify_note           TEXT,
    created_at            TIMESTAMPTZ DEFAULT now(),
    updated_at            TIMESTAMPTZ DEFAULT now(),
    verify_by             DATE,
    UNIQUE (instrument_id, gate_key)
);
CREATE INDEX IF NOT EXISTS idx_eg_instrument     ON eligibility_gates(instrument_id);
CREATE INDEX IF NOT EXISTS idx_eg_intake_field   ON eligibility_gates(intake_field) WHERE intake_field != 'none';
CREATE INDEX IF NOT EXISTS idx_eg_verification   ON eligibility_gates(verification_level);

CREATE TABLE IF NOT EXISTS eligibility_clauses (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    instrument_id       TEXT NOT NULL REFERENCES funding_instruments(id),
    clause_type         TEXT NOT NULL CHECK (clause_type IN
                            ('obligation','cumulation','application','ticket')),
    clause_key          TEXT NOT NULL DEFAULT 'default',
    text                TEXT NOT NULL,
    quote                TEXT,
    source_file          TEXT,
    source_locator       TEXT,
    verification_level   TEXT NOT NULL CHECK (verification_level IN
                            ('inventory_inferred','llm_classified','llm_cited','llm_2pass','human_verified')),
    verify_note           TEXT,
    verify_by             DATE,
    created_at            TIMESTAMPTZ DEFAULT now(),
    updated_at            TIMESTAMPTZ DEFAULT now(),
    UNIQUE (instrument_id, clause_type, clause_key)
);
CREATE INDEX IF NOT EXISTS idx_ec_instrument   ON eligibility_clauses(instrument_id);
CREATE INDEX IF NOT EXISTS idx_ec_type         ON eligibility_clauses(clause_type);
CREATE INDEX IF NOT EXISTS idx_ec_verification ON eligibility_clauses(verification_level);
