-- Sprint 15 follow-up — NDB-implementer columns on public_funding_events.
-- Captures the entrusted_entity and financial_intermediaries columns from SATR
-- (where Bpifrance / FFG / Vinnova / L-Bank / etc. appear when the formal
-- granting authority is a ministry), plus a derived canonical NDB id.
--
-- Apply with: python scripts/migrations/apply.py 005

ALTER TABLE public_funding_events ADD COLUMN entrusted_entity TEXT;
ALTER TABLE public_funding_events ADD COLUMN financial_intermediaries TEXT;
-- Canonical NDB identifier (lowercase snake_case), set by the NDB-tagger:
--   kfw, ffg, vinnova, business_finland, awssg, hellenic_dev_bank,
--   mediocredito_centrale, invitalia, sace, l_bank, lfa_bayern, ...
-- NULL when no recognised NDB is involved (pure ministry-granted aid).
ALTER TABLE public_funding_events ADD COLUMN ndb_distributor TEXT;

CREATE INDEX IF NOT EXISTS idx_pfe_entrusted_entity ON public_funding_events(entrusted_entity);
CREATE INDEX IF NOT EXISTS idx_pfe_ndb_distributor ON public_funding_events(ndb_distributor)
    WHERE ndb_distributor IS NOT NULL;
