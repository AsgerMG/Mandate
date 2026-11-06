-- mandate.runs, mandate.run_steps, mandate.artefact_releases: the durable record
-- of every refresh, and of what the site is built from.
--
--   psql "$ADMIN_URL" -f mandate/db/runs.sql        (after roles.sql; idempotent)
--
-- WHY. On 2026-11-06 policy's data was found 12 days stale with no alarm: its
-- refresh state lived only in the API process's memory, and a redeploy erased
-- it. Capital's run outcome lived in a census row and a Railway log Railway
-- deletes with the container. Nothing could answer "when did each brain last
-- refresh, and did it finish" after the fact. These tables can, and the daily
-- health check (mandate/health/check.py) reads them.
--
-- WHO WRITES WHAT. The tables are owned by mandate_app (schema `mandate` is the
-- platform's). Every brain role may INSERT a run or step and UPDATE the rows IT
-- wrote -- `db_role` defaults to current_user and row-level security holds each
-- role to its own rows -- and may read everyone's (the orchestrator waits on
-- policy's row; the health check reads all of them). capital_ro reads. Nobody
-- but the owner deletes: a run that went wrong is a fact to keep.
--
-- artefact_releases is the manifest of one published set of site artefacts
-- (path -> sha256 in the grounding bucket). The site's prebuild reads the newest
-- row as capital_ro and downloads the bytes; see mandate/artefacts.py.

\set ON_ERROR_STOP on
BEGIN;

SET LOCAL ROLE mandate_app;

CREATE TABLE IF NOT EXISTS mandate.runs (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    brain         text NOT NULL,                 -- capital | policy | mandate (the orchestrator)
    kind          text NOT NULL,                 -- weekly_refresh | policy_refresh | ...
    parent_id     bigint REFERENCES mandate.runs(id),
    trigger       text NOT NULL DEFAULT 'manual',  -- cron | api | manual | test
    status        text NOT NULL DEFAULT 'running'
                  CHECK (status IN ('running', 'ok', 'partial', 'failed', 'abandoned')),
    started_at    timestamptz NOT NULL DEFAULT now(),
    heartbeat_at  timestamptz NOT NULL DEFAULT now(),
    finished_at   timestamptz,
    summary       text NOT NULL DEFAULT '',
    detail        jsonb NOT NULL DEFAULT '{}'::jsonb,
    host          text,
    db_role       text NOT NULL DEFAULT current_user
);
CREATE INDEX IF NOT EXISTS runs_brain_started_idx ON mandate.runs (brain, kind, started_at DESC);

CREATE TABLE IF NOT EXISTS mandate.run_steps (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    run_id        bigint NOT NULL REFERENCES mandate.runs(id),
    ord           integer NOT NULL,
    name          text NOT NULL,
    status        text NOT NULL DEFAULT 'running'
                  CHECK (status IN ('running', 'ok', 'partial', 'failed', 'skipped')),
    started_at    timestamptz NOT NULL DEFAULT now(),
    finished_at   timestamptz,
    exit_code     integer,
    summary       text NOT NULL DEFAULT '',
    detail        jsonb NOT NULL DEFAULT '{}'::jsonb,
    db_role       text NOT NULL DEFAULT current_user
);
CREATE INDEX IF NOT EXISTS run_steps_run_idx ON mandate.run_steps (run_id, ord);
CREATE INDEX IF NOT EXISTS run_steps_name_idx ON mandate.run_steps (name, started_at DESC);

CREATE TABLE IF NOT EXISTS mandate.artefact_releases (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    run_id        bigint REFERENCES mandate.runs(id),
    created_at    timestamptz NOT NULL DEFAULT now(),
    -- {"<served path, relative to web/>": {"sha256": "...", "bytes": n}, ...}
    files         jsonb NOT NULL,
    git_sha       text,
    db_role       text NOT NULL DEFAULT current_user
);
CREATE INDEX IF NOT EXISTS artefact_releases_created_idx ON mandate.artefact_releases (created_at DESC);

-- ── Row-level security: write your own rows, read everyone's ────────────────
ALTER TABLE mandate.runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE mandate.run_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE mandate.artefact_releases ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['runs', 'run_steps', 'artefact_releases'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS read_all ON mandate.%I', t);
    EXECUTE format('CREATE POLICY read_all ON mandate.%I FOR SELECT USING (true)', t);
    EXECUTE format('DROP POLICY IF EXISTS insert_own ON mandate.%I', t);
    EXECUTE format('CREATE POLICY insert_own ON mandate.%I FOR INSERT WITH CHECK (db_role = current_user)', t);
    EXECUTE format('DROP POLICY IF EXISTS update_own ON mandate.%I', t);
    EXECUTE format('CREATE POLICY update_own ON mandate.%I FOR UPDATE USING (db_role = current_user) WITH CHECK (db_role = current_user)', t);
  END LOOP;
END $$;

RESET ROLE;

-- ── Grants (as the admin) ─────────────────────────────────────────────────
GRANT USAGE ON SCHEMA mandate TO capital_app, policy_app, capital_ro;
GRANT SELECT, INSERT, UPDATE ON mandate.runs, mandate.run_steps TO capital_app, policy_app;
GRANT SELECT, INSERT ON mandate.artefact_releases TO capital_app;
GRANT SELECT ON mandate.runs, mandate.run_steps, mandate.artefact_releases TO capital_ro, policy_app;
-- and explicitly NOT: DELETE or TRUNCATE, to any brain role.
REVOKE DELETE, TRUNCATE ON mandate.runs, mandate.run_steps, mandate.artefact_releases
  FROM capital_app, policy_app, capital_ro;

COMMIT;
