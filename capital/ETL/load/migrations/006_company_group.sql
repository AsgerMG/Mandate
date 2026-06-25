-- Migration 006: company_group rollup key on companies.
-- Applied via: python3 scripts/migrations/apply.py 006
--
-- Name-based sister-entity grouping (Sprint 17 follow-up). Legally distinct
-- entities of one group (the IPCEI NOMAGIC convention keeps them separate rows)
-- share a company_group key so "largest recipient" analyses can roll up at
-- query time. NULL = singleton (no same-name sibling anywhere in the corpus).
-- Populated by scripts/build_company_groups.py (reset-then-tag, idempotent).

ALTER TABLE companies ADD COLUMN company_group TEXT;
CREATE INDEX IF NOT EXISTS idx_companies_group
  ON companies(company_group) WHERE company_group IS NOT NULL;
