-- Migration 013: make the eligibility corpus machine-decidable.
-- Applied via: python3 ETL/events/load/migrations/apply.py 013
--
-- WHY (measured 2026-07-26, on the live corpus):
--   * 0 of 4,018 gates carry a value_spec, so eligibility.ts's
--     evaluateGenericGates() has never once fired. The product cannot say
--     "you qualify" — only "this looks thematically similar" and "you
--     answered N questions".
--   * A 150-gate random audit of the llm_cited tier found only ~58% are
--     genuine eligibility FILTERS on the company. ~19% are obligations that
--     bind you after award, ~21% are facts about the fund itself (funding
--     rate, budget, call timeline), ~3% are too vague to test. All four are
--     currently stored identically and treated as answerable requirements.
--   * Two independent passes disagreed with the stored intake_field on 52%
--     and 69% of samples. "Support is provided as non-dilutive grants" is
--     filed under borrowerModel; "aid intensity capped at 20% of eligible
--     costs" under turnoverBand.
--
-- DESIGN: two NEW columns rather than mutating intake_field.
--   intake_field is owned by the extractors (classify_gates_bulk.py's
--   ON CONFLICT ... DO UPDATE SET overwrites it on every re-run), so any
--   correction written there would be silently reverted the next time bulk
--   classification runs. Keeping it untouched preserves provenance — what the
--   extractor thought — while intake_field_resolved carries the curated truth
--   the product actually reads. Same reasoning as the no-FK rule on
--   eligibility_embeddings: never put durable work where a rebuild owns it.
--
--   value_spec needs no new column. It already exists, nothing writes it, and
--   aggregate_intake_usage.py explicitly reserves it ("once that work
--   starts"). This is that work.

-- filter        : a testable condition on the company/project -> can gate a verdict
-- obligation    : binds the beneficiary AFTER award -> belongs in the memo, never in the verdict
-- programme_fact: a fact about the fund (rate, budget, timeline) -> background only
-- vague         : too hedged to test -> excluded from everything
ALTER TABLE eligibility_gates ADD COLUMN gate_role TEXT;

-- The intake field whose ANSWER actually decides this gate, or 'none' when no
-- founder-supplied attribute could. Read by the product in preference to
-- intake_field; falls back to intake_field when NULL (not yet triaged).
ALTER TABLE eligibility_gates ADD COLUMN intake_field_resolved TEXT;

-- Triage/encoding provenance, so a later pass can tell hand-review from
-- model output without re-deriving it.
ALTER TABLE eligibility_gates ADD COLUMN encoding_method TEXT;

CREATE INDEX IF NOT EXISTS idx_gates_role ON eligibility_gates(gate_role);
CREATE INDEX IF NOT EXISTS idx_gates_resolved_field ON eligibility_gates(intake_field_resolved);
