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

-- Phase 5: embeddings for RAG retrieval over gate/clause text. One row per
-- (gate or clause) — matches the "one chunk per structural unit already
-- defined in the schema" design, not arbitrary character-window chunking;
-- gates/clauses are already short, atomic, well-defined units. Only
-- meaningfully-cited rows get embedded (embed_eligibility.py filters to
-- verification_level IN ('llm_cited','llm_2pass','human_verified') --
-- embedding an llm_classified guess with no real quote isn't worth
-- retrieving). Requires `CREATE EXTENSION vector;` (pgvector, confirmed
-- available on Railway's Postgres image, v0.8.5).
-- Keyed on the NATURAL key, and deliberately WITHOUT a foreign key. Both are
-- corrections to a design that silently destroyed this table (2026-07-26):
--
--  * source_id pointed at eligibility_gates.id, which is GENERATED ALWAYS AS
--    IDENTITY and re-issued on every migrate_to_postgres.py run (it inserts
--    gates without ids). So a surviving embedding would re-point at a
--    DIFFERENT gate after any reload — worse than losing it, since retrieval
--    would confidently return the wrong requirement text. (instrument_id,
--    gate_key) is stable and verified unique: 4,018/4,018 gates and 893/893
--    clauses.
--  * The FK to funding_instruments meant migrate_to_postgres.py's
--    `TRUNCATE ... funding_instruments CASCADE` cascaded into here and wiped
--    all 3,327 embeddings, invisibly — the table is not named in that
--    statement, and TRUNCATE leaves no n_tup_del trace. Postgres also REQUIRES
--    CASCADE when truncating a referenced table, so the FK made the wipe
--    unavoidable rather than accidental. This is a derived cache rebuilt from
--    Voyage; an orphaned row is harmless (never retrieved), a destroyed table
--    costs a full re-embed. No FK is the right trade.
CREATE TABLE IF NOT EXISTS eligibility_embeddings (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_type    TEXT NOT NULL CHECK (source_type IN ('gate', 'clause')),
    instrument_id  TEXT NOT NULL,
    -- gate: eligibility_gates.gate_key. clause: clause_type || '::' || clause_key.
    source_key     TEXT NOT NULL,
    chunk_text     TEXT NOT NULL,
    embedding      vector(1024) NOT NULL,  -- voyage-3.5 dimension; see embed_eligibility.py
    model          TEXT NOT NULL,
    created_at     TIMESTAMPTZ DEFAULT now(),
    UNIQUE (source_type, instrument_id, source_key)
);
-- One "what this fund actually funds" profile per instrument, embedded for
-- matching a company description to relevant funds. Distinct from
-- eligibility_embeddings above, which indexes what a fund DEMANDS: querying
-- rule text with a company description compares two different semantic spaces
-- and measurably fails (a rail company retrieved IPCEI's depreciation rules
-- above Europe's Rail). Built by ETL/terms/build_instrument_profiles.py from
-- stated scope PLUS the real project titles the instrument has funded — the
-- strongest available signal and unique to this corpus.
--
-- Natural key, no FK, for the same reason as eligibility_embeddings: the four
-- core tables are truncate-and-reloaded with CASCADE.
CREATE TABLE IF NOT EXISTS instrument_profiles (
    instrument_id  TEXT PRIMARY KEY,
    profile_text   TEXT NOT NULL,
    embedding      vector(1024) NOT NULL,  -- voyage-3.5
    model          TEXT NOT NULL,
    n_titles       INTEGER NOT NULL DEFAULT 0,  -- provenance: funded titles used
    built_at       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ip_embedding_hnsw
    ON instrument_profiles USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_ee_instrument ON eligibility_embeddings(instrument_id);
CREATE INDEX IF NOT EXISTS idx_ee_embedding_hnsw
    ON eligibility_embeddings USING hnsw (embedding vector_cosine_ops);
