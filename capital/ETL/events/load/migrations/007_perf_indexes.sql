-- Migration 007: pipeline scalability indexes + WAL (2026-06-10 audit).
-- Applied via: python3 scripts/migrations/apply.py 007
--
-- idx_companies_name_upper: every extractor's exact-match tier queries
--   WHERE UPPER(canonical_name)=?; without an expression index this was a
--   full table scan (7.3 ms/lookup at 153k companies — minutes of pure
--   scanning per register-scale load).
-- idx_pfe_source_call: per-insert dedup probe. NOT unique — EIC and SATR
--   legitimately share one call_id across all winners of a call /
--   beneficiaries of an aid measure (3,245 such shared pairs as of audit).
-- WAL: loads write one big transaction; WAL lets sanity checks and site
--   generators read concurrently instead of SQLITE_BUSY.

CREATE INDEX IF NOT EXISTS idx_companies_name_upper
  ON companies(UPPER(canonical_name));
CREATE INDEX IF NOT EXISTS idx_pfe_source_call
  ON public_funding_events(source, call_id);
PRAGMA journal_mode=WAL;
ANALYZE;
