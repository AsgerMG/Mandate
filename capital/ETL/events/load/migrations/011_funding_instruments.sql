-- Migration 011: funding_instruments + eligibility_gates — the DB-native
-- home for "which funds exist, at what scale, and what gates them."
-- Applied via: python3 ETL/events/load/migrations/apply.py 011
--
-- funding_instruments: one row per instrument FAMILY (year-stripped
-- public_funding_events.source, per ETL/lib/instrument_family.py, plus
-- curated parent rows for EIC/IPCEI/Innovation Fund/Horizon Pillar II &
-- partnership/Chips JU/EDF/EIT, plus is_framework rows for the cross-cutting
-- EU-law records currently only in data/instrument_terms/*.yaml). Populated
-- by ETL/events/load/populate_funding_instruments.py — deterministic,
-- SQL-only, zero API cost (Tier 0).
--
-- funding_instrument_sources: the relational join instrument -> raw
-- public_funding_events.source values (replaces what would otherwise be a
-- JSON side-channel).
--
-- eligibility_gates: one row per requirement, FK'd to funding_instruments.
-- verification_level is the honesty mechanism: inventory_inferred (free,
-- corpus-derived heuristic) < llm_classified (cheap, 1 call/family, no
-- citation) < llm_2pass (existing ETL/terms/extract_terms.py pipeline,
-- cited + mechanically + entailment verified) < human_verified. Nothing
-- below llm_2pass may render as an asserted met/not_met fact in the frontend
-- (see website/frontend/lib/intelligence/eligibility.ts).

CREATE TABLE IF NOT EXISTS funding_instruments (
    id                     TEXT PRIMARY KEY,   -- family key, e.g. 'satr_de_rnd', 'eic_accelerator', 'eu_sme_definition'
    parent_id              TEXT REFERENCES funding_instruments(id),
    name                   TEXT NOT NULL,
    name_source            TEXT NOT NULL DEFAULT 'deterministic'
                               CHECK (name_source IN ('deterministic','curated')),
    country                TEXT,                -- ISO2, 'EU', or NULL if mixed
    administering_body     TEXT,
    ndb_id                 TEXT,                -- majority ndb_distributor match, nullable
    source_family_bucket   TEXT,                -- ties back to the existing v_events.source_family (11-bucket grain)
    capital_type           TEXT NOT NULL DEFAULT 'unknown'
                               CHECK (capital_type IN (
                                   'grant','loan','guarantee','counter_guarantee',
                                   'equity','blended','tax_credit','recoverable_advance',
                                   'framework','unknown',
                                   -- 026: three states `unknown` was collapsing.
                                   -- non_financial = the source says it pays nothing;
                                   -- undetermined  = the source was asked and will not say;
                                   -- unknown       = we never recorded it. Only the last
                                   -- is a defect, and only it is ratcheted.
                                   'non_financial','undetermined')),
    capital_type_basis     TEXT,                -- e.g. 'grant_amount_basis=htgf_equity' — audit trail
    event_count            INTEGER NOT NULL DEFAULT 0,
    company_count          INTEGER NOT NULL DEFAULT 0,
    total_eur              REAL NOT NULL DEFAULT 0,
    first_year             INTEGER,
    last_year              INTEGER,
    is_framework            INTEGER NOT NULL DEFAULT 0,   -- 1 for the 8 EU-law records with no events of their own
    sample_project_titles  TEXT,                -- JSON array, SATR rows only: top-N distinct project_title by count
    created_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fi_parent   ON funding_instruments(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fi_country  ON funding_instruments(country);
CREATE INDEX IF NOT EXISTS idx_fi_capital  ON funding_instruments(capital_type);
CREATE INDEX IF NOT EXISTS idx_fi_events   ON funding_instruments(event_count DESC);  -- Tier-2 prioritisation query

CREATE TABLE IF NOT EXISTS funding_instrument_sources (
    instrument_id TEXT NOT NULL REFERENCES funding_instruments(id),
    source        TEXT NOT NULL,   -- raw public_funding_events.source value
    PRIMARY KEY (instrument_id, source)
);
CREATE INDEX IF NOT EXISTS idx_fis_source ON funding_instrument_sources(source);

CREATE TABLE IF NOT EXISTS eligibility_gates (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    instrument_id       TEXT NOT NULL REFERENCES funding_instruments(id),
    gate_key            TEXT NOT NULL,   -- stable per-instrument id, e.g. 'sme_test' (mirrors YAML gate id)
    gate_family         TEXT NOT NULL CHECK (gate_family IN
                            ('G1_nexus','G2_size_ownership','G3_financial',
                             'G4_borrower_model','G5_use_of_funds','G6_conditionality')),
    requirement         TEXT NOT NULL,
    value                TEXT,            -- human-readable threshold/enum (as today in YAML)
    value_spec           TEXT,            -- JSON structured comparator; NULL = not machine-evaluable yet
    intake_field         TEXT NOT NULL DEFAULT 'none',
    quote                TEXT,
    source_file          TEXT,
    source_locator       TEXT,
    verification_level   TEXT NOT NULL CHECK (verification_level IN
                            ('inventory_inferred','llm_classified','llm_2pass','human_verified')),
    verify_note           TEXT,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (instrument_id, gate_key)
);
CREATE INDEX IF NOT EXISTS idx_eg_instrument     ON eligibility_gates(instrument_id);
CREATE INDEX IF NOT EXISTS idx_eg_intake_field   ON eligibility_gates(intake_field) WHERE intake_field != 'none';
CREATE INDEX IF NOT EXISTS idx_eg_verification   ON eligibility_gates(verification_level);
