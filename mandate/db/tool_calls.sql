-- mandate.tool_calls: one row per tool call any brain makes, and per Regina
-- search. The usage log (data_audit.md, "usage is invisible").
--
--   psql "$ADMIN_URL" -f mandate/db/tool_calls.sql   (after roles.sql; idempotent)
--
-- WHY ONE TABLE, NOT policy.retrieval_events. retrieval_events was built for
-- the retired /api/brief: it is gated off by a flag, stores the company
-- description as the query and self-prunes after 14 days. The question now is
-- "what do the brains use", across Wincent's tools, Regina's tools and Regina's
-- search, answered by one view. So every caller writes here, and
-- retrieval_events is left as it is (structure is never dropped in passing).
--
-- WHO WRITES. The agent runtime, through mandate-api (POST /usage/tool_calls,
-- as mandate_app); Regina's search (policy_app, directly); the bench
-- (web/scripts/brain_tool.ts) through mandate-api when it is configured.
-- capital_app may insert (a capital-side tool runner). capital_ro reads.
--
-- PRIVACY. args are stored as a sha256 and a short summary (<= 240 chars), not
-- in full: a query can carry a company's own words.
--
-- Append-only: a usage record is a measurement.

\set ON_ERROR_STOP on
BEGIN;

SET LOCAL ROLE mandate_app;

CREATE TABLE IF NOT EXISTS mandate.tool_calls (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    at             timestamptz NOT NULL DEFAULT now(),
    mission_id     text,
    brain          text NOT NULL CHECK (brain IN ('mandate', 'wincent', 'regina')),
    tool           text NOT NULL,
    -- agent: a production mission; bench: brain_tool.ts; search: Regina's
    -- /api/search; eval: the eval runner
    caller         text NOT NULL DEFAULT 'agent' CHECK (caller IN ('agent', 'bench', 'search', 'eval')),
    args_sha256    text CHECK (args_sha256 IS NULL OR args_sha256 ~ '^[0-9a-f]{64}$'),
    args_summary   text NOT NULL DEFAULT '' CHECK (length(args_summary) <= 240),
    ok             boolean NOT NULL DEFAULT true,
    result_count   integer,
    citations      integer NOT NULL DEFAULT 0,
    -- the stored tables the tool read (e.g. capital.public_equity_stakes), and
    -- the sources its rows came from (register source keys, feed names)
    tables         text[] NOT NULL DEFAULT '{}',
    sources        text[] NOT NULL DEFAULT '{}',
    ms             integer,
    error          text CHECK (error IS NULL OR length(error) <= 500),
    db_role        text NOT NULL DEFAULT current_user
);
CREATE INDEX IF NOT EXISTS tool_calls_at_idx ON mandate.tool_calls (at DESC);
CREATE INDEX IF NOT EXISTS tool_calls_brain_tool_idx ON mandate.tool_calls (brain, tool, at DESC);
CREATE INDEX IF NOT EXISTS tool_calls_mission_idx ON mandate.tool_calls (mission_id) WHERE mission_id IS NOT NULL;

CREATE OR REPLACE FUNCTION mandate.tool_calls_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'tool_calls is append-only: % refused', TG_OP;
END $$;
DROP TRIGGER IF EXISTS tool_calls_append_only ON mandate.tool_calls;
CREATE TRIGGER tool_calls_append_only BEFORE UPDATE OR DELETE ON mandate.tool_calls
  FOR EACH ROW EXECUTE FUNCTION mandate.tool_calls_append_only();
DROP TRIGGER IF EXISTS tool_calls_no_truncate ON mandate.tool_calls;
CREATE TRIGGER tool_calls_no_truncate BEFORE TRUNCATE ON mandate.tool_calls
  FOR EACH STATEMENT EXECUTE FUNCTION mandate.tool_calls_append_only();

-- What the brains use, last 30 days: one row per brain x tool x caller x
-- table x source. A call that read two tables counts once under each.
CREATE OR REPLACE VIEW mandate.brain_usage_30d AS
SELECT t.brain, t.tool, t.caller,
       coalesce(tb.tbl, '(none)')  AS table_name,
       coalesce(sr.src, '(none)')  AS source,
       count(*)                                    AS calls,
       count(*) FILTER (WHERE NOT t.ok)            AS failed,
       count(DISTINCT t.mission_id)                AS missions,
       sum(coalesce(t.result_count, 0))            AS results,
       sum(t.citations)                            AS citations,
       round(avg(t.ms))::integer                   AS avg_ms,
       max(t.at)                                   AS last_at
  FROM mandate.tool_calls t
  LEFT JOIN LATERAL unnest(t.tables)  AS tb(tbl) ON true
  LEFT JOIN LATERAL unnest(t.sources) AS sr(src) ON true
 WHERE t.at > now() - interval '30 days'
 GROUP BY 1, 2, 3, 4, 5;

RESET ROLE;

GRANT USAGE ON SCHEMA mandate TO capital_app, policy_app, capital_ro;
GRANT SELECT, INSERT ON mandate.tool_calls TO capital_app, policy_app;
GRANT SELECT ON mandate.tool_calls, mandate.brain_usage_30d TO capital_ro, policy_app, capital_app;
REVOKE UPDATE, DELETE, TRUNCATE ON mandate.tool_calls FROM capital_app, policy_app, capital_ro;

COMMIT;
