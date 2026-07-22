-- Migration 012: add the 'llm_cited' verification tier + eligibility_clauses
-- table (Phase 5 of the eligibility plan — comprehensive, text-first,
-- RAG-ready research program).
-- Applied via: python3 ETL/events/load/migrations/apply.py 012
--
-- llm_cited sits between llm_classified and llm_2pass on the honesty
-- ladder: the model read a REAL fetched primary-source document and
-- produced a real quote + source_locator that passed the existing free
-- mechanical verbatim-match check (extract_terms.py's verify_gate fragment
-- (a)) — so fabrication of the quote itself is ruled out, but no independent
-- entailment pass has judged the interpretation. Still renders at most
-- likely_met/likely_not_met, same as llm_2pass-adjacent soft tiers; only
-- llm_2pass and human_verified may assert met/not_met
-- (see website/frontend/lib/intelligence/eligibility.ts's ASSERTABLE_LEVELS).
--
-- SQLite can't ALTER a CHECK constraint in place, so eligibility_gates is
-- rebuilt: new table with the extended CHECK, data copied across, old
-- table dropped, new one renamed into place. Indexes recreated identically.
--
-- eligibility_clauses is the DB-native home for the YAML schema's
-- obligations[]/cumulation/application/ticket fields, which today only
-- exist in data/instrument_terms/*.yaml and are never synced to the DB or
-- exported — a real gap for Phase 5's RAG chunking (which treats each of
-- these as its own retrievable chunk, same as a gate).

CREATE TABLE eligibility_gates_new (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
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
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (instrument_id, gate_key)
);

INSERT INTO eligibility_gates_new
    SELECT id, instrument_id, gate_key, gate_family, requirement, value,
           value_spec, intake_field, quote, source_file, source_locator,
           verification_level, verify_note, created_at, updated_at
    FROM eligibility_gates;

DROP TABLE eligibility_gates;
ALTER TABLE eligibility_gates_new RENAME TO eligibility_gates;

CREATE INDEX IF NOT EXISTS idx_eg_instrument     ON eligibility_gates(instrument_id);
CREATE INDEX IF NOT EXISTS idx_eg_intake_field   ON eligibility_gates(intake_field) WHERE intake_field != 'none';
CREATE INDEX IF NOT EXISTS idx_eg_verification   ON eligibility_gates(verification_level);

CREATE TABLE IF NOT EXISTS eligibility_clauses (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    instrument_id       TEXT NOT NULL REFERENCES funding_instruments(id),
    clause_type         TEXT NOT NULL CHECK (clause_type IN
                            ('obligation','cumulation','application','ticket')),
    clause_key          TEXT NOT NULL DEFAULT 'default',  -- disambiguates multiple obligations per instrument
    text                TEXT NOT NULL,                     -- embeddable prose (requirement, or templated for 'ticket')
    quote                TEXT,
    source_file          TEXT,
    source_locator       TEXT,
    verification_level   TEXT NOT NULL CHECK (verification_level IN
                            ('inventory_inferred','llm_classified','llm_cited','llm_2pass','human_verified')),
    verify_note           TEXT,
    verify_by             DATE,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (instrument_id, clause_type, clause_key)
);
CREATE INDEX IF NOT EXISTS idx_ec_instrument  ON eligibility_clauses(instrument_id);
CREATE INDEX IF NOT EXISTS idx_ec_type        ON eligibility_clauses(clause_type);
CREATE INDEX IF NOT EXISTS idx_ec_verification ON eligibility_clauses(verification_level);

-- verify_by wasn't on eligibility_gates before this migration either —
-- add it here so both retrievable-chunk sources (gates + clauses) carry
-- staleness metadata the same way, per Phase 5's maintenance plan.
ALTER TABLE eligibility_gates ADD COLUMN verify_by DATE;
