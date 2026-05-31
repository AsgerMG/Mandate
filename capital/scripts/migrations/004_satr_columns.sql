-- Sprint 15 — SATR columns on public_funding_events.
-- Idempotent: each ALTER guarded by a SELECT against pragma_table_info.
-- Apply with: python scripts/migrations/apply.py 004
-- Or manually run the SELECTs first, then ALTER only the missing columns.

-- Columns added:
--   satr_tm_id                  TEXT — TM-XXXXXX reference, unique per SATR award
--   aid_instrument              TEXT — bid value from SATR (e.g. StateAidInstrumentPRC)
--   aid_objective               TEXT — bid value from SATR (e.g. StateAidObjectiveGberArt25c)
--   granting_authority          TEXT — granting authority name verbatim from SATR
--   granting_authority_country  TEXT — ISO 2-letter of granting authority

-- New `grant_amount_basis` values (no schema change; documented here):
--   satr_aid_element            — preferred when SATR Aid element is non-NULL
--   satr_nominal_amount         — fallback when only Nominal Amount is set
--   sudop_aid_element           — Polish SUDOP equivalent
--   regas_aid_element           — Romanian REGAS equivalent
--   gov_si_aid_element          — Slovenian gov.si equivalent

ALTER TABLE public_funding_events ADD COLUMN satr_tm_id TEXT;
ALTER TABLE public_funding_events ADD COLUMN aid_instrument TEXT;
ALTER TABLE public_funding_events ADD COLUMN aid_objective TEXT;
ALTER TABLE public_funding_events ADD COLUMN granting_authority TEXT;
ALTER TABLE public_funding_events ADD COLUMN granting_authority_country TEXT;

CREATE INDEX IF NOT EXISTS idx_pfe_satr_tm_id
    ON public_funding_events(satr_tm_id) WHERE satr_tm_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pfe_aid_instrument
    ON public_funding_events(aid_instrument);
CREATE INDEX IF NOT EXISTS idx_pfe_aid_objective
    ON public_funding_events(aid_objective);
CREATE INDEX IF NOT EXISTS idx_pfe_granting_authority_country
    ON public_funding_events(granting_authority_country);
