-- mandate.eval_runs: one row per scenario run of the advisor eval
-- (mandate/eval). What was asked, what the agent said, how the rubric and the
-- citation validator scored it, and what it cost.
--
--   psql "$ADMIN_URL" -f mandate/db/eval_runs.sql   (after roles.sql; idempotent)
--
-- NOT YET APPLIED IN PRODUCTION. Until it is, the runner writes the same record
-- as JSON under mandate/eval/runs/ and `--record` is refused.
--
-- Append-only: a run is a measurement, and a measurement is never rewritten.
-- A re-grade (the owner grading a transcript) is a new row with `grades_run`
-- pointing at the run it grades.

\set ON_ERROR_STOP on
BEGIN;

SET LOCAL ROLE mandate_app;

CREATE TABLE IF NOT EXISTS mandate.eval_runs (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    scenario           text NOT NULL,            -- the scenario file's `id`
    scenario_sha256    text NOT NULL CHECK (scenario_sha256 ~ '^[0-9a-f]{64}$'),
    git_commit         text,
    endpoint           text NOT NULL,
    mission_id         text,
    models             jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- the NDJSON MissionEvents, as received
    transcript         jsonb NOT NULL CHECK (jsonb_typeof(transcript) = 'array'),
    -- per-checkpoint verdicts: [{"id", "met": true|false|null, "note"}]
    rubric             jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(rubric) = 'array'),
    rubric_score       double precision CHECK (rubric_score IS NULL OR rubric_score BETWEEN 0 AND 1),
    -- citation validator: {"total", "resolved", "quote_matched", "failures": [...]}
    citations          jsonb NOT NULL DEFAULT '{}'::jsonb,
    citation_score     double precision CHECK (citation_score IS NULL OR citation_score BETWEEN 0 AND 1),
    -- claims labelled cited / judgement / unverified, and any unlabelled
    claims             jsonb NOT NULL DEFAULT '{}'::jsonb,
    judge              text NOT NULL DEFAULT 'none' CHECK (judge IN ('none', 'claude', 'owner')),
    grades_run         uuid REFERENCES mandate.eval_runs(id),
    cost_eur           double precision,
    duration_s         double precision,
    note               text NOT NULL DEFAULT '',
    created_at         timestamptz NOT NULL DEFAULT now(),
    db_role            text NOT NULL DEFAULT current_user
);
CREATE INDEX IF NOT EXISTS eval_runs_scenario_idx ON mandate.eval_runs (scenario, created_at DESC);

CREATE OR REPLACE FUNCTION mandate.eval_runs_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'eval_runs is append-only: % refused', TG_OP;
END $$;
DROP TRIGGER IF EXISTS eval_runs_append_only ON mandate.eval_runs;
CREATE TRIGGER eval_runs_append_only BEFORE UPDATE OR DELETE ON mandate.eval_runs
  FOR EACH ROW EXECUTE FUNCTION mandate.eval_runs_append_only();
DROP TRIGGER IF EXISTS eval_runs_no_truncate ON mandate.eval_runs;
CREATE TRIGGER eval_runs_no_truncate BEFORE TRUNCATE ON mandate.eval_runs
  FOR EACH STATEMENT EXECUTE FUNCTION mandate.eval_runs_append_only();

RESET ROLE;
REVOKE UPDATE, DELETE, TRUNCATE ON mandate.eval_runs FROM capital_app, policy_app, capital_ro;

COMMIT;
