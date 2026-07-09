-- Migration 010: two-tier sector taxonomy on companies.
-- Applied via: python3 ETL/load/migrations/apply.py 010
--
-- Replaces the coarse single-label sector_inferred (8 buckets, ~49% other/
-- unclassified) with a two-tier taxonomy: a broad sector_top (11, 100% coverage)
-- and a granular controlled subsector (94). The NACE economic-activity code is the
-- authoritative backbone (see project-mgmt/nace_taxonomy.md); an LLM fills only what
-- NACE cannot resolve. sector_taxonomy_method records provenance:
--   nace      = both tiers from the NACE code (deterministic, exact)
--   nace_top  = Tier-1 from NACE, Tier-2 from the LLM (constrained to the sector)
--   programme = Tier-1 from a programme override (IF/EDF/chips), Tier-2 from the LLM
--   llm       = both tiers from the LLM (no NACE backbone)
--   NULL      = pending classification
-- Legacy sector_inferred is retained during transition.

ALTER TABLE companies ADD COLUMN sector_top TEXT;
ALTER TABLE companies ADD COLUMN subsector TEXT;
ALTER TABLE companies ADD COLUMN sector_taxonomy_method TEXT;
ALTER TABLE companies ADD COLUMN sector_taxonomy_updated_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_companies_sector_top
  ON companies(sector_top) WHERE sector_top IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_companies_subsector
  ON companies(subsector) WHERE subsector IS NOT NULL;
