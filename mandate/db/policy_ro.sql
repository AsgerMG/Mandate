-- PROPOSED, NOT APPLIED: a read-only role for policy, the counterpart of capital_ro.
--
-- Nothing needs it today: the health check reads policy's freshness from the
-- runs policy records in mandate.runs (capital_ro can read those). It is for the
-- first check that must read policy's own tables (documents per source, the
-- newest published date). Apply as the admin, then set its password with
-- mandate/db/apply_roles.py (add 'policy_ro' to ROLES first) and store
-- POLICY_RO_DATABASE_URL as a GitHub secret.
\set ON_ERROR_STOP on
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'policy_ro') THEN
    CREATE ROLE policy_ro LOGIN;
  END IF;
END $$;
GRANT CONNECT ON DATABASE railway TO policy_ro;
GRANT USAGE ON SCHEMA public, policy, mandate TO policy_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA policy TO policy_ro;
ALTER DEFAULT PRIVILEGES FOR ROLE policy_app IN SCHEMA policy GRANT SELECT ON TABLES TO policy_ro;
GRANT SELECT ON mandate.runs, mandate.run_steps, mandate.artefact_releases TO policy_ro;
ALTER ROLE policy_ro SET search_path = policy, public;
ALTER ROLE policy_ro SET default_transaction_read_only = on;
COMMIT;
