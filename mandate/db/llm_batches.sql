-- mandate.llm_batches: every Message Batch any brain submits, from the moment
-- it is paid for until its results are written.
--
--   psql "$ADMIN_URL" -f mandate/db/llm_batches.sql   (after roles.sql and runs.sql; idempotent)
--
-- WHY. A Message Batch is paid for when it is submitted and is only worth
-- anything if a later run can find it. The weekly cron's disk is scratch, so a
-- batch id kept in a file is a batch paid for and never collected (it happened:
-- capital migration 035 moved the signals ids into capital.batch_state). This
-- is the platform-wide successor: one row per batch, with the custom_ids it
-- carries (so a later run never resubmits work that is still in flight), the
-- caller's per-item metadata (so a later run can write results back without
-- the process that submitted them), and the measured cost. Client:
-- mandate/llm/batch.py; nothing else writes here.
--
-- WHO WRITES WHAT. Owned by mandate_app, like mandate.runs. Every brain role
-- may INSERT a batch and UPDATE the rows IT wrote (row-level security on
-- db_role), and read everyone's. Nobody but the owner deletes: a batch that
-- went wrong is a spend to account for.

\set ON_ERROR_STOP on
BEGIN;

SET LOCAL ROLE mandate_app;

CREATE TABLE IF NOT EXISTS mandate.llm_batches (
    batch_id      text PRIMARY KEY,                -- msgbatch_...
    kind          text NOT NULL,                   -- the job: capital.taxonomy, capital.pertinence, ...
    brain         text NOT NULL,
    run_id        bigint REFERENCES mandate.runs(id),
    attempt       integer NOT NULL DEFAULT 1,      -- 2+ = a resubmission of errored items
    status        text NOT NULL DEFAULT 'submitted'
                  CHECK (status IN ('submitted', 'collected', 'abandoned')),
    -- {"<custom_id>": <caller metadata or null>, ...}: what is in flight, and
    -- what the collector needs to write each result back.
    items         jsonb NOT NULL DEFAULT '{}'::jsonb,
    request_count integer NOT NULL DEFAULT 0,
    models        text[] NOT NULL DEFAULT '{}',
    estimate_usd  numeric(12, 4),                  -- at batch prices, before submitting
    cost_usd      numeric(12, 4),                  -- measured from usage, at collection
    usage         jsonb NOT NULL DEFAULT '{}'::jsonb,   -- token totals by kind
    counts        jsonb NOT NULL DEFAULT '{}'::jsonb,   -- succeeded / errored / expired / ...
    submitted_at  timestamptz NOT NULL DEFAULT now(),
    collected_at  timestamptz,
    note          text NOT NULL DEFAULT '',
    db_role       text NOT NULL DEFAULT current_user
);
CREATE INDEX IF NOT EXISTS llm_batches_pending_idx
    ON mandate.llm_batches (kind, submitted_at) WHERE status = 'submitted';

ALTER TABLE mandate.llm_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS read_all ON mandate.llm_batches;
CREATE POLICY read_all ON mandate.llm_batches FOR SELECT USING (true);
DROP POLICY IF EXISTS insert_own ON mandate.llm_batches;
CREATE POLICY insert_own ON mandate.llm_batches FOR INSERT WITH CHECK (db_role = current_user);
DROP POLICY IF EXISTS update_own ON mandate.llm_batches;
CREATE POLICY update_own ON mandate.llm_batches FOR UPDATE
    USING (db_role = current_user) WITH CHECK (db_role = current_user);

RESET ROLE;

GRANT USAGE ON SCHEMA mandate TO capital_app, policy_app, capital_ro;
GRANT SELECT, INSERT, UPDATE ON mandate.llm_batches TO capital_app, policy_app;
GRANT SELECT ON mandate.llm_batches TO capital_ro;
REVOKE DELETE, TRUNCATE ON mandate.llm_batches FROM capital_app, policy_app, capital_ro;

COMMIT;
