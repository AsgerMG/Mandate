-- mandate.missions, messages, decisions, actions, action_events, flags,
-- plan_steps: what the advisor did in a founder's workspace, and why.
--
--   psql "$ADMIN_URL" -f mandate/db/workspace.sql    (after roles.sql and profiles.sql; idempotent)
--
-- NOT YET APPLIED IN PRODUCTION. Written by mandate-api (mandate/api), which
-- connects as mandate_app; nothing else writes these tables.
--
-- WHY APPEND-ONLY. A decision is advice given ON a profile version, at a date,
-- on evidence. If the founder later learns it was wrong, the record has to show
-- what was said, when, and on what, and then what replaced it. So nothing here
-- is ever rewritten or deleted (grants AND a trigger, as in grounding.sql and
-- profiles.sql). A change is a new row:
--   * a decision that replaces another names it in `supersedes`;
--   * an action's status is the newest row of mandate.action_events, never a
--     column that moves;
--   * a flag that is resolved gets a new row with status 'resolved' and
--     `supersedes` pointing at the open one.
-- The *_current views give "the workspace as it stands".
--
-- WHO SAID IT. Every row carries `created_by`: the agent that wrote it
-- ('mandate', 'wincent', 'regina') or the founder. An agent row never carries
-- an account id; a founder row may.
--
-- WHY CLAIMS ARE jsonb, VALIDATED BY A CHECK. A decision's rationale is a list
-- of claims, each `{"text", "basis", "citation_ids"}`, where basis is 'cited'
-- (at least one citation id, resolvable in `citations`), 'judgement' or
-- 'unverified'. The runtime refuses an unlabelled claim before it gets here
-- (web/lib/mandate/agent/claims.ts); the CHECK below is the floor under that,
-- so a writer that skipped the runtime still cannot store a bare assertion.

\set ON_ERROR_STOP on
BEGIN;

SET LOCAL ROLE mandate_app;

-- One founder question and everything the agents did to answer it.
CREATE TABLE IF NOT EXISTS mandate.missions (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id     uuid NOT NULL REFERENCES mandate.workspaces(id),
    profile_id       uuid REFERENCES mandate.company_profiles(id),
    profile_version  integer,
    objective        text NOT NULL CHECK (length(btrim(objective)) > 0),
    -- the job playbook the orchestrator loaded (mandate/playbooks/<job>.md), if any
    job              text,
    created_by       text NOT NULL CHECK (created_by IN ('founder', 'mandate', 'wincent', 'regina', 'eval')),
    author_account_id uuid REFERENCES mandate.accounts(id),
    created_at       timestamptz NOT NULL DEFAULT now(),
    db_role          text NOT NULL DEFAULT current_user,
    CHECK ((profile_id IS NULL) = (profile_version IS NULL))
);
CREATE INDEX IF NOT EXISTS missions_workspace_idx ON mandate.missions (workspace_id, created_at DESC);

-- Every turn, by whoever spoke: the founder, the orchestrator, a specialist.
-- `content` is the text; `payload` carries anything structured (tool calls,
-- usage, the model id) so a mission can be replayed and audited.
CREATE TABLE IF NOT EXISTS mandate.messages (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    mission_id   uuid NOT NULL REFERENCES mandate.missions(id),
    created_by   text NOT NULL CHECK (created_by IN ('founder', 'mandate', 'wincent', 'regina', 'tool', 'eval')),
    content      text NOT NULL DEFAULT '',
    payload      jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
    created_at   timestamptz NOT NULL DEFAULT now(),
    db_role      text NOT NULL DEFAULT current_user
);
CREATE INDEX IF NOT EXISTS messages_mission_idx ON mandate.messages (mission_id, id);

-- Is every element of a claims array a labelled claim? Used by the CHECKs below.
CREATE OR REPLACE FUNCTION mandate.claims_are_labelled(claims jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_typeof(claims) = 'array'
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(claims) c
        WHERE jsonb_typeof(c) <> 'object'
           OR coalesce(length(btrim(c->>'text')), 0) = 0
           OR coalesce(c->>'basis', '') NOT IN ('cited', 'judgement', 'unverified')
           OR (c->>'basis' = 'cited' AND (jsonb_typeof(c->'citation_ids') <> 'array'
                                          OR jsonb_array_length(c->'citation_ids') = 0)))
$$;

CREATE TABLE IF NOT EXISTS mandate.decisions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mission_id      uuid NOT NULL REFERENCES mandate.missions(id),
    title           text NOT NULL CHECK (length(btrim(title)) > 0),
    recommendation  text NOT NULL CHECK (length(btrim(recommendation)) > 0),
    -- the reasoning, as labelled claims (see the header)
    claims          jsonb NOT NULL CHECK (mandate.claims_are_labelled(claims)),
    -- every citation the claims name, as the runtime resolved it:
    -- {"<id>": {"sha256", "canonical_url", "title", "span": [s, e], "quote", "fetched_at", ...}}
    citations       jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(citations) = 'object'),
    confidence      text NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
    due_at          timestamptz,
    supersedes      uuid REFERENCES mandate.decisions(id),
    created_by      text NOT NULL CHECK (created_by IN ('founder', 'mandate', 'wincent', 'regina')),
    author_account_id uuid REFERENCES mandate.accounts(id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    db_role         text NOT NULL DEFAULT current_user
);
CREATE INDEX IF NOT EXISTS decisions_mission_idx ON mandate.decisions (mission_id);

CREATE TABLE IF NOT EXISTS mandate.actions (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mission_id    uuid NOT NULL REFERENCES mandate.missions(id),
    decision_id   uuid REFERENCES mandate.decisions(id),
    title         text NOT NULL CHECK (length(btrim(title)) > 0),
    detail        text NOT NULL DEFAULT '',
    -- who the founder would contact, when the action is an approach
    stakeholder   jsonb CHECK (stakeholder IS NULL OR jsonb_typeof(stakeholder) = 'object'),
    -- a ready-to-send draft (the founder always sends; nothing leaves Mandate)
    draft         text,
    due_at        timestamptz,
    created_by    text NOT NULL CHECK (created_by IN ('founder', 'mandate', 'wincent', 'regina')),
    author_account_id uuid REFERENCES mandate.accounts(id),
    created_at    timestamptz NOT NULL DEFAULT now(),
    db_role       text NOT NULL DEFAULT current_user
);
CREATE INDEX IF NOT EXISTS actions_mission_idx ON mandate.actions (mission_id);

-- An action's status over time. The newest row is the status; an action with
-- no event is 'open'.
CREATE TABLE IF NOT EXISTS mandate.action_events (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    action_id   uuid NOT NULL REFERENCES mandate.actions(id),
    status      text NOT NULL CHECK (status IN ('open', 'in_progress', 'done', 'dismissed')),
    note        text NOT NULL DEFAULT '',
    created_by  text NOT NULL CHECK (created_by IN ('founder', 'mandate', 'wincent', 'regina')),
    author_account_id uuid REFERENCES mandate.accounts(id),
    created_at  timestamptz NOT NULL DEFAULT now(),
    db_role     text NOT NULL DEFAULT current_user
);
CREATE INDEX IF NOT EXISTS action_events_action_idx ON mandate.action_events (action_id, id DESC);

-- Something to fix: a gap in the founder's position that blocks or weakens a route.
CREATE TABLE IF NOT EXISTS mandate.flags (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mission_id   uuid NOT NULL REFERENCES mandate.missions(id),
    title        text NOT NULL CHECK (length(btrim(title)) > 0),
    severity     text NOT NULL CHECK (severity IN ('blocker', 'major', 'minor')),
    claims       jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (mandate.claims_are_labelled(claims)),
    citations    jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(citations) = 'object'),
    fix          text NOT NULL DEFAULT '',
    status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
    supersedes   uuid REFERENCES mandate.flags(id),
    created_by   text NOT NULL CHECK (created_by IN ('founder', 'mandate', 'wincent', 'regina')),
    author_account_id uuid REFERENCES mandate.accounts(id),
    created_at   timestamptz NOT NULL DEFAULT now(),
    db_role      text NOT NULL DEFAULT current_user
);
CREATE INDEX IF NOT EXISTS flags_mission_idx ON mandate.flags (mission_id);

-- The plan: ordered steps, each optionally tied to the decision it carries out.
CREATE TABLE IF NOT EXISTS mandate.plan_steps (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mission_id   uuid NOT NULL REFERENCES mandate.missions(id),
    decision_id  uuid REFERENCES mandate.decisions(id),
    ordinal      integer NOT NULL CHECK (ordinal >= 1),
    title        text NOT NULL CHECK (length(btrim(title)) > 0),
    detail       text NOT NULL DEFAULT '',
    horizon      text CHECK (horizon IS NULL OR horizon IN ('this_week', 'this_month', 'this_quarter', 'later')),
    supersedes   uuid REFERENCES mandate.plan_steps(id),
    created_by   text NOT NULL CHECK (created_by IN ('founder', 'mandate', 'wincent', 'regina')),
    author_account_id uuid REFERENCES mandate.accounts(id),
    created_at   timestamptz NOT NULL DEFAULT now(),
    db_role      text NOT NULL DEFAULT current_user
);
CREATE INDEX IF NOT EXISTS plan_steps_mission_idx ON mandate.plan_steps (mission_id, ordinal);

-- ── "As it stands" views ──────────────────────────────────────────────────
CREATE OR REPLACE VIEW mandate.decisions_current AS
  SELECT d.* FROM mandate.decisions d
   WHERE NOT EXISTS (SELECT 1 FROM mandate.decisions n WHERE n.supersedes = d.id);

CREATE OR REPLACE VIEW mandate.actions_current AS
  SELECT a.*, coalesce(
           (SELECT e.status FROM mandate.action_events e WHERE e.action_id = a.id
             ORDER BY e.id DESC LIMIT 1), 'open') AS status
    FROM mandate.actions a;

CREATE OR REPLACE VIEW mandate.flags_current AS
  SELECT f.* FROM mandate.flags f
   WHERE NOT EXISTS (SELECT 1 FROM mandate.flags n WHERE n.supersedes = f.id);

CREATE OR REPLACE VIEW mandate.plan_steps_current AS
  SELECT p.* FROM mandate.plan_steps p
   WHERE NOT EXISTS (SELECT 1 FROM mandate.plan_steps n WHERE n.supersedes = p.id);

-- ── Append-only, for the owner too ────────────────────────────────────────
CREATE OR REPLACE FUNCTION mandate.workspace_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % refused', TG_TABLE_NAME, TG_OP;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['missions','messages','decisions','actions','action_events','flags','plan_steps'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON mandate.%I', t || '_append_only', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON mandate.%I '
                   'FOR EACH ROW EXECUTE FUNCTION mandate.workspace_append_only()', t || '_append_only', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON mandate.%I', t || '_no_truncate', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON mandate.%I '
                   'FOR EACH STATEMENT EXECUTE FUNCTION mandate.workspace_append_only()', t || '_no_truncate', t);
  END LOOP;
END $$;

RESET ROLE;

-- ── Grants (as the admin) ─────────────────────────────────────────────────
-- mandate_app owns and writes. The site (capital_app) and policy read nothing
-- here directly: they go through mandate-api. capital_ro reads no founder data.
REVOKE UPDATE, DELETE, TRUNCATE ON mandate.missions, mandate.messages, mandate.decisions,
  mandate.actions, mandate.action_events, mandate.flags, mandate.plan_steps
  FROM capital_app, policy_app, capital_ro;

COMMIT;
