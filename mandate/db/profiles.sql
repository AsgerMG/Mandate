-- mandate.accounts, workspaces, company_profiles and company_profile_versions:
-- the ONE company profile every brain reads, and the minimum that owns it.
--
--   psql "$ADMIN_URL" -f mandate/db/profiles.sql     (after roles.sql; idempotent)
--
-- NOT YET APPLIED IN PRODUCTION. Nothing writes these tables until the
-- conversational product does; the brains already accept the profile on their
-- request paths (capital: `profile` on /api/intelligence*, policy: `profile` on
-- /api/brief and /api/questions).
--
-- WHY VERSIONS, NEVER AN UPDATE. A profile is what an agent's advice was given
-- ON. When a founder corrects their headcount, the brief Regina wrote last week
-- was still written about the old one, and the record must say so. So a change
-- is a new row in company_profile_versions; a version is never rewritten or
-- deleted (grants AND a trigger, as in grounding.sql), and "the profile" is the
-- newest version (company_profile_current). A writer passes the version it read
-- (mandate/profile/store.py append_version(expected=...)): a concurrent edit is a
-- conflict to resolve, not a silent overwrite.
--
-- WHY payload IS jsonb, NOT COLUMNS. The shape is mandate/profile's FIELDS,
-- generated with the vocabulary for two languages, and validated by both before
-- anything is written. Columns would be a third copy of the shape to keep in
-- sync. `vocabulary_version` records which vocabulary a version was written
-- under; the vocabulary is insert-only, so an old version stays readable.
--
-- WHO WRITES WHAT. Owned by mandate_app. The site runs as capital_app, so
-- capital_app creates accounts, workspaces and profiles; both brain roles append
-- versions (an agent that learns a fact records it); everyone reads. Nobody but
-- the owner deletes, and the trigger stops the owner rewriting a version too.

\set ON_ERROR_STOP on
BEGIN;

SET LOCAL ROLE mandate_app;

CREATE TABLE IF NOT EXISTS mandate.accounts (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email         text NOT NULL,
    display_name  text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    db_role       text NOT NULL DEFAULT current_user
);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_email_idx ON mandate.accounts (lower(email));

CREATE TABLE IF NOT EXISTS mandate.workspaces (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name          text NOT NULL,
    created_by    uuid NOT NULL REFERENCES mandate.accounts(id),
    created_at    timestamptz NOT NULL DEFAULT now(),
    db_role       text NOT NULL DEFAULT current_user
);

CREATE TABLE IF NOT EXISTS mandate.workspace_members (
    workspace_id  uuid NOT NULL REFERENCES mandate.workspaces(id),
    account_id    uuid NOT NULL REFERENCES mandate.accounts(id),
    role          text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
    created_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, account_id)
);

-- The anchor: one company, owned by one workspace. It holds no facts; its
-- versions do.
CREATE TABLE IF NOT EXISTS mandate.company_profiles (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id  uuid NOT NULL REFERENCES mandate.workspaces(id),
    created_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid REFERENCES mandate.accounts(id),
    db_role       text NOT NULL DEFAULT current_user
);
CREATE INDEX IF NOT EXISTS company_profiles_workspace_idx ON mandate.company_profiles (workspace_id);

CREATE TABLE IF NOT EXISTS mandate.company_profile_versions (
    profile_id          uuid NOT NULL REFERENCES mandate.company_profiles(id),
    version             integer NOT NULL CHECK (version >= 1),
    payload             jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND payload ? 'name'),
    vocabulary_version  text NOT NULL,
    -- who said it: the founder, or the agent that recorded it, or an import
    source              text NOT NULL CHECK (source IN ('founder', 'wincent', 'regina', 'import')),
    author_account_id   uuid REFERENCES mandate.accounts(id),
    note                text NOT NULL DEFAULT '',
    created_at          timestamptz NOT NULL DEFAULT now(),
    db_role             text NOT NULL DEFAULT current_user,
    PRIMARY KEY (profile_id, version)
);

CREATE OR REPLACE VIEW mandate.company_profile_current AS
  SELECT DISTINCT ON (profile_id) *
  FROM mandate.company_profile_versions
  ORDER BY profile_id, version DESC;

-- Versions are append-only and gap-free: version n+1 only after n exists.
CREATE OR REPLACE FUNCTION mandate.profile_versions_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.version > 1 AND NOT EXISTS (
        SELECT 1 FROM mandate.company_profile_versions
        WHERE profile_id = NEW.profile_id AND version = NEW.version - 1) THEN
      RAISE EXCEPTION 'company_profile_versions: version % of % skips a version',
        NEW.version, NEW.profile_id;
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'company_profile_versions is append-only: % refused', TG_OP;
END $$;

DROP TRIGGER IF EXISTS profile_versions_append_only ON mandate.company_profile_versions;
CREATE TRIGGER profile_versions_append_only
  BEFORE INSERT OR UPDATE OR DELETE ON mandate.company_profile_versions
  FOR EACH ROW EXECUTE FUNCTION mandate.profile_versions_append_only();
DROP TRIGGER IF EXISTS profile_versions_no_truncate ON mandate.company_profile_versions;
CREATE TRIGGER profile_versions_no_truncate
  BEFORE TRUNCATE ON mandate.company_profile_versions
  FOR EACH STATEMENT EXECUTE FUNCTION mandate.profile_versions_append_only();

RESET ROLE;

-- ── Grants (as the admin) ─────────────────────────────────────────────────
GRANT USAGE ON SCHEMA mandate TO capital_app, policy_app, capital_ro;
GRANT SELECT, INSERT ON mandate.accounts, mandate.workspaces, mandate.workspace_members,
  mandate.company_profiles TO capital_app;
GRANT SELECT ON mandate.accounts, mandate.workspaces, mandate.workspace_members,
  mandate.company_profiles TO policy_app;
GRANT SELECT, INSERT ON mandate.company_profile_versions TO capital_app, policy_app;
GRANT SELECT ON mandate.company_profile_current TO capital_app, policy_app;
-- capital_ro (builds, CI) reads no company data: profiles are founders' facts.
-- and explicitly NOT: UPDATE, DELETE or TRUNCATE, to any brain role.
REVOKE UPDATE, DELETE, TRUNCATE ON mandate.accounts, mandate.workspaces,
  mandate.workspace_members, mandate.company_profiles, mandate.company_profile_versions
  FROM capital_app, policy_app, capital_ro;

COMMIT;
