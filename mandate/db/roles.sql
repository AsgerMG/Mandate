-- One Postgres, one schema per brain, one role per schema.
--
-- WHY ROLES CARRY THE search_path: before this, each brain found its tables
-- only because they sat in `public`, or because a connection-option string
-- said where to look. Capital's code records that Railway's TCP proxy refuses
-- startup `options`, and policy's Alembic built an engine without them, so a
-- migration would have written into `public` while the app read `policy`. A
-- role default is in force for every connection that role makes, whatever the
-- client, driver or proxy. Code may still set it; it no longer has to.
--
-- WHY ONE ROLE PER BRAIN: no brain can write into another's schema. Two stores
-- is what let an approved correction sit applied in one and reverted in the
-- other for six days. One database with shared write access everywhere would
-- just move that defect inside a single instance.
--
-- `public` holds the pgvector extension and nothing else. Its `vector` type and
-- operator classes are owned by the extension, so every brain needs USAGE on it.
--
-- Idempotent: safe to re-run. Passwords are NOT here. mandate/db/apply_roles.py
-- sets them and writes the resulting URLs to Railway, never to git.

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['capital_app','policy_app','mandate_app','capital_ro'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I LOGIN', r);
    END IF;
  END LOOP;
END $$;

-- Nobody connects or creates by default; each role is granted what it needs.
REVOKE ALL ON DATABASE railway FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE railway TO capital_app, policy_app, mandate_app, capital_ro;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO capital_app, policy_app, mandate_app, capital_ro;

-- Policy's enum types were created in `public` before the schema move. They
-- belong to the brain. Columns reference a type by OID, so this is metadata.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['document_type','jurisdiction','lifecycle_stage','actor_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_type ty JOIN pg_namespace n ON n.oid = ty.typnamespace
               WHERE ty.typname = t AND n.nspname = 'public') THEN
      EXECUTE format('ALTER TYPE public.%I SET SCHEMA policy', t);
    END IF;
  END LOOP;
END $$;

-- Each app role OWNS its schema and everything in it, so it can migrate itself
-- (Alembic for policy, the ETL's DDL for capital) without the superuser.
DO $$
DECLARE
  pair text[];
  obj record;
BEGIN
  FOREACH pair SLICE 1 IN ARRAY ARRAY[['capital','capital_app'],['policy','policy_app'],['mandate','mandate_app']] LOOP
    EXECUTE format('ALTER SCHEMA %I OWNER TO %I', pair[1], pair[2]);
    FOR obj IN
      SELECT c.relname, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = pair[1] AND c.relkind IN ('r','p','v','m','S','f')
        -- sequences owned by a column follow their table
        AND NOT (c.relkind = 'S' AND EXISTS (
              SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype IN ('a','i')))
    LOOP
      EXECUTE format('ALTER %s %I.%I OWNER TO %I',
        CASE obj.relkind WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW'
                         WHEN 'S' THEN 'SEQUENCE' WHEN 'f' THEN 'FOREIGN TABLE' ELSE 'TABLE' END,
        pair[1], obj.relname, pair[2]);
    END LOOP;
    FOR obj IN
      SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = pair[1] AND t.typtype IN ('e','d','c')
        AND NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.reltype = t.oid)
    LOOP
      EXECUTE format('ALTER TYPE %I.%I OWNER TO %I', pair[1], obj.typname, pair[2]);
    END LOOP;
    EXECUTE format('ALTER ROLE %I SET search_path = %I, public', pair[2], pair[1]);
  END LOOP;
END $$;

-- capital_ro: what a build or CI step reads the corpus as. It can read, never write.
GRANT USAGE ON SCHEMA capital TO capital_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA capital TO capital_ro;
ALTER DEFAULT PRIVILEGES FOR ROLE capital_app IN SCHEMA capital GRANT SELECT ON TABLES TO capital_ro;
ALTER ROLE capital_ro SET search_path = capital, public;
ALTER ROLE capital_ro SET default_transaction_read_only = on;

-- ── grounding: the one shared, append-only schema (mandate/db/grounding.sql) ──
--
-- WHY A SEPARATE OWNER. Every other schema is owned by the brain that writes it.
-- grounding is written by every brain and owned by none of them, so that no
-- brain's own role can ALTER, DROP or rewrite it. grounding_owner cannot log in:
-- a migration is the admin saying `SET ROLE grounding_owner`, deliberately.
--
-- WHY SELECT + INSERT ONLY. What a brain cited must still be there, unchanged,
-- when someone checks the citation. A correction is a new row. REFERENCES lets a
-- brain's own tables point here by foreign key. Even the owner is stopped from
-- rewriting by the triggers in grounding.sql.
--
-- WHY CODE QUALIFIES `grounding.` WHEN IT NEVER QUALIFIES ITS OWN TABLES. A
-- role's search_path is its own schema plus public, and stays so: grounding is
-- not any brain's own, and a query that reaches it should say so.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'grounding_owner') THEN
    CREATE ROLE grounding_owner NOLOGIN;
  END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS grounding AUTHORIZATION grounding_owner;
ALTER SCHEMA grounding OWNER TO grounding_owner;
GRANT USAGE ON SCHEMA public TO grounding_owner;
REVOKE ALL ON SCHEMA grounding FROM PUBLIC;
GRANT USAGE ON SCHEMA grounding TO capital_app, policy_app, mandate_app, capital_ro;
-- tables that exist now (a re-run) and every table grounding_owner creates later
GRANT SELECT, INSERT, REFERENCES ON ALL TABLES IN SCHEMA grounding TO capital_app, policy_app, mandate_app;
GRANT SELECT ON ALL TABLES IN SCHEMA grounding TO capital_ro;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA grounding TO capital_app, policy_app, mandate_app;
ALTER DEFAULT PRIVILEGES FOR ROLE grounding_owner IN SCHEMA grounding
  GRANT SELECT, INSERT, REFERENCES ON TABLES TO capital_app, policy_app, mandate_app;
ALTER DEFAULT PRIVILEGES FOR ROLE grounding_owner IN SCHEMA grounding
  GRANT SELECT ON TABLES TO capital_ro;
ALTER DEFAULT PRIVILEGES FOR ROLE grounding_owner IN SCHEMA grounding
  GRANT USAGE ON SEQUENCES TO capital_app, policy_app, mandate_app;
-- and explicitly NOT: UPDATE, DELETE, TRUNCATE, to anyone.
REVOKE UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA grounding FROM capital_app, policy_app, mandate_app, capital_ro;

COMMIT;
