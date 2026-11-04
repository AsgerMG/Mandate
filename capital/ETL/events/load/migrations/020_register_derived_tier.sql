-- A third evidence tier: `register_derived`.
--
-- The two existing uncited tiers both describe a MODEL reading a document:
-- `inventory_inferred` (derived from our own inventory) and `llm_classified`
-- (an extraction with no quote). The per-scheme GBER article rules are neither.
-- The aid_objective code is filed per award by the granting authority itself in
-- the SATR transparency register, so its provenance is a public filing, not an
-- extraction — stronger than either uncited tier.
--
-- It is still NOT cited. The article is assigned by majority vote across a
-- scheme's own awards (floor 50%; a typical carrier is 43 of 64), so it says
-- what the scheme HAS funded, never what it requires. Filing it as `llm_cited`
-- would let it read as the fund's own eligibility rule and, worse, let it
-- disqualify a founder.
--
-- The read path enforces exactly that split: isAttributable() admits this tier
-- to structuring notes, isCited() keeps it out of judgement criteria, and gates
-- at this tier carry no value_spec, so no verdict can rest on one.
-- See website/frontend/lib/intelligence/verdict.ts and evidenceTier.test.ts.
--
-- SQLite cannot alter a CHECK constraint, so both tables are rebuilt. The
-- column lists below are the tables as they stand after 012/013, including the
-- columns added by ALTER since.

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
                            ('inventory_inferred','register_derived','llm_classified',
                             'llm_cited','llm_2pass','human_verified')),
    verify_note           TEXT,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    verify_by             DATE,
    gate_role             TEXT,
    intake_field_resolved TEXT,
    encoding_method       TEXT,
    UNIQUE (instrument_id, gate_key)
);

INSERT INTO eligibility_gates_new
    SELECT id, instrument_id, gate_key, gate_family, requirement, value,
           value_spec, intake_field, quote, source_file, source_locator,
           verification_level, verify_note, created_at, updated_at,
           verify_by, gate_role, intake_field_resolved, encoding_method
    FROM eligibility_gates;

DROP TABLE eligibility_gates;
ALTER TABLE eligibility_gates_new RENAME TO eligibility_gates;

CREATE INDEX IF NOT EXISTS idx_eg_instrument     ON eligibility_gates(instrument_id);
CREATE INDEX IF NOT EXISTS idx_eg_intake_field   ON eligibility_gates(intake_field) WHERE intake_field != 'none';
CREATE INDEX IF NOT EXISTS idx_eg_verification   ON eligibility_gates(verification_level);
-- Added by 013, after 012's rebuild. A table rebuild that recreates only the
-- indexes named in the migration it copied from drops every index added since.
CREATE INDEX IF NOT EXISTS idx_gates_role           ON eligibility_gates(gate_role);
CREATE INDEX IF NOT EXISTS idx_gates_resolved_field ON eligibility_gates(intake_field_resolved);

-- Clauses carry the same enumeration and must not drift from it: an evidence
-- tier that exists for one retrievable-chunk source and not the other is how
-- the two stop being comparable.
CREATE TABLE eligibility_clauses_new (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    instrument_id       TEXT NOT NULL REFERENCES funding_instruments(id),
    clause_type         TEXT NOT NULL CHECK (clause_type IN
                            ('obligation','cumulation','application','ticket')),
    clause_key          TEXT NOT NULL DEFAULT 'default',
    text                TEXT NOT NULL,
    quote                TEXT,
    source_file          TEXT,
    source_locator       TEXT,
    verification_level   TEXT NOT NULL CHECK (verification_level IN
                            ('inventory_inferred','register_derived','llm_classified',
                             'llm_cited','llm_2pass','human_verified')),
    verify_note           TEXT,
    verify_by             DATE,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (instrument_id, clause_type, clause_key)
);

INSERT INTO eligibility_clauses_new
    SELECT id, instrument_id, clause_type, clause_key, text, quote, source_file,
           source_locator, verification_level, verify_note, verify_by,
           created_at, updated_at
    FROM eligibility_clauses;

DROP TABLE eligibility_clauses;
ALTER TABLE eligibility_clauses_new RENAME TO eligibility_clauses;

CREATE INDEX IF NOT EXISTS idx_ec_instrument   ON eligibility_clauses(instrument_id);
CREATE INDEX IF NOT EXISTS idx_ec_type         ON eligibility_clauses(clause_type);
CREATE INDEX IF NOT EXISTS idx_ec_verification ON eligibility_clauses(verification_level);
