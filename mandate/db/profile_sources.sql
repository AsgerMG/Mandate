-- Widen who may append a company-profile version to include the orchestrator.
--
--   psql "$ADMIN_URL" -f mandate/db/profile_sources.sql   (after profiles.sql; idempotent)
--
-- NOT YET APPLIED IN PRODUCTION. profiles.sql allowed founder / wincent /
-- regina / import. The advisor platform's orchestrator ("Mandate") also learns
-- facts in conversation and records them (plan: profile.append_version(source=
-- 'mandate'|'wincent'|'regina')). A UNION of the old set: every row that was
-- valid stays valid, nothing is rewritten.

\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE mandate_app;
ALTER TABLE mandate.company_profile_versions
  DROP CONSTRAINT IF EXISTS company_profile_versions_source_check;
ALTER TABLE mandate.company_profile_versions
  ADD CONSTRAINT company_profile_versions_source_check
  CHECK (source IN ('founder', 'wincent', 'regina', 'import', 'mandate'));
RESET ROLE;
COMMIT;
