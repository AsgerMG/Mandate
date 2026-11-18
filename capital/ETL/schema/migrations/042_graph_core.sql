-- 042: THE GRAPH CORE -- the data that draws the case board's graphs, held instead of
-- re-researched on every case (owner, 18 Nov: "know all processes, know all hierarchies, and
-- have an updated repository of stakeholders"; mandate/plans/condensed_core.md).
--
--   institutions        the HIERARCHY: ministry -> promotional bank / agency -> division ->
--                       unit -> programme, and the channels that carry it (house bank,
--                       regional institute, guarantee bank). One row per node; parent_key
--                       names the node above. Feeds the board's `hierarchies`.
--   institution_offers  which node OFFERS which instrument (capital.funding_instruments, whose
--                       eligibility gates already exist) and through which channel: the link
--                       from the tree down to the products and their requirements.
--   processes           an application or decision PROCESS, per instrument or institution.
--   process_steps       its steps: order, who acts (an institutions key or a role), timing,
--                       and `gates`: what must be true to pass the step, each cited. Feeds the
--                       board's `process_maps`.
--   stakeholders        WHO IS IN CHARGE: a role in a unit (by function), and the role-holder's
--                       name only where the institution publishes it, with last_verified. A
--                       re-verification is a NEW row (insert-only); the current view is the
--                       newest row per key. Public professional roles only. Feeds `networks`
--                       and the stakeholders section.
--
-- CITATIONS as 039/041: jsonb arrays of {sha256, quote, char_start, char_end, url, located},
-- spans checked by the loader (mandate.grounding.store.locate) before it writes; no FK into
-- grounding. INSERT-ONLY, the same trigger as 039/041: a correction is a new row with a new
-- batch, never an edit.

CREATE TABLE IF NOT EXISTS institutions (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    key           TEXT NOT NULL UNIQUE CHECK (key ~ '^[a-z0-9_.]+$'),
    parent_key    TEXT CHECK (parent_key IS NULL OR parent_key ~ '^[a-z0-9_.]+$'),
    market        TEXT NOT NULL CHECK (market ~ '^[A-Z]{2}$'),   -- 'EU' for EU bodies
    level         TEXT NOT NULL CHECK (level IN ('eu', 'national', 'regional', 'local')),
    region        TEXT,                                           -- NUTS code or name when regional
    kind          TEXT NOT NULL CHECK (kind IN ('ministry', 'institution', 'division', 'unit', 'programme',
                                                 'regional_body', 'channel', 'committee')),
    name          TEXT NOT NULL,
    name_local    TEXT,
    role          TEXT,                                           -- what it does for a company, one line
    website       TEXT,
    citations     JSONB NOT NULL CHECK (jsonb_typeof(citations) = 'array' AND jsonb_array_length(citations) >= 1),
    batch         TEXT NOT NULL,
    recorded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    recorded_by   TEXT NOT NULL DEFAULT current_user
);
CREATE INDEX IF NOT EXISTS idx_inst_market ON institutions(market);
CREATE INDEX IF NOT EXISTS idx_inst_parent ON institutions(parent_key);

CREATE TABLE IF NOT EXISTS institution_offers (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    key             TEXT NOT NULL UNIQUE CHECK (key ~ '^[a-z0-9_.]+$'),  -- the knowledge map's product key
    institution_key TEXT NOT NULL,
    instrument_id   TEXT,                                         -- capital.funding_instruments.id, when held
    product_name    TEXT NOT NULL,
    product_type    TEXT NOT NULL CHECK (product_type IN ('loan', 'guarantee', 'grant', 'equity', 'lease', 'tax', 'other')),
    channel_key     TEXT,                                         -- the node a company applies through (house bank ...)
    applicant       TEXT NOT NULL CHECK (applicant IN ('company', 'bank_on_behalf', 'intermediary', 'fund', 'other')),
    terms           JSONB NOT NULL DEFAULT '{}'::jsonb,           -- {rate_basis, ceiling, currency, term, deadline}
    citations       JSONB NOT NULL CHECK (jsonb_typeof(citations) = 'array' AND jsonb_array_length(citations) >= 1),
    batch           TEXT NOT NULL,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    recorded_by     TEXT NOT NULL DEFAULT current_user
);
CREATE INDEX IF NOT EXISTS idx_offers_inst ON institution_offers(institution_key);

CREATE TABLE IF NOT EXISTS processes (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    key             TEXT NOT NULL UNIQUE CHECK (key ~ '^[a-z0-9_.]+$'),
    institution_key TEXT NOT NULL,
    offer_id        BIGINT,                                       -- institution_offers.id when per product
    kind            TEXT NOT NULL CHECK (kind IN ('funding_decision', 'legislative', 'regulatory', 'procurement', 'other')),
    title           TEXT NOT NULL,
    explains        TEXT,
    citations       JSONB NOT NULL CHECK (jsonb_typeof(citations) = 'array' AND jsonb_array_length(citations) >= 1),
    batch           TEXT NOT NULL,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    recorded_by     TEXT NOT NULL DEFAULT current_user
);

CREATE TABLE IF NOT EXISTS process_steps (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    process_key   TEXT NOT NULL,
    step_no       INT NOT NULL CHECK (step_no >= 1),
    label         TEXT NOT NULL,
    kind          TEXT NOT NULL CHECK (kind IN ('step', 'decision', 'document', 'deadline')),
    actor         TEXT NOT NULL,                                  -- an institutions key, or 'company' / a role
    timing        TEXT,
    gates         JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(gates) = 'array'),  -- [{label, citations}]
    citations     JSONB NOT NULL CHECK (jsonb_typeof(citations) = 'array' AND jsonb_array_length(citations) >= 1),
    batch         TEXT NOT NULL,
    recorded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    recorded_by   TEXT NOT NULL DEFAULT current_user,
    UNIQUE (process_key, step_no, batch)
);

CREATE TABLE IF NOT EXISTS stakeholders (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    key             TEXT NOT NULL CHECK (key ~ '^[a-z0-9_.]+$'),  -- stable per role, not per person
    institution_key TEXT NOT NULL,
    role            TEXT NOT NULL,                                -- the function: "Head of SME lending"
    priority_hint   TEXT CHECK (priority_hint IS NULL OR priority_hint IN ('decides', 'influences')),
    holder_name     TEXT,                                         -- ONLY when the institution publishes it
    also_sits_on    TEXT[] NOT NULL DEFAULT '{}',                 -- other institutions keys (boards, committees)
    reach           TEXT,                                         -- the published channel: unit contact, press office
    last_verified   DATE NOT NULL,
    citations       JSONB NOT NULL CHECK (jsonb_typeof(citations) = 'array' AND jsonb_array_length(citations) >= 1),
    batch           TEXT NOT NULL,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    recorded_by     TEXT NOT NULL DEFAULT current_user
);
CREATE INDEX IF NOT EXISTS idx_stake_key ON stakeholders(key, last_verified DESC);
CREATE INDEX IF NOT EXISTS idx_stake_inst ON stakeholders(institution_key);

-- ORG CHARTS: the source of truth for structure and stakeholders (owner, 18 Nov). One row per
-- fetch of an institution's official organisation chart / board / departments page: the grounding
-- version (sha256) it was stored as, and whether it changed since the last fetch. A changed chart
-- is re-extracted into institutions (units) and stakeholders (role-holders) as NEW rows whose
-- citations point at this version; nothing is edited in place.
CREATE TABLE IF NOT EXISTS org_charts (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    institution_key TEXT NOT NULL,
    url             TEXT NOT NULL,
    sha256          TEXT NOT NULL,                                -- the grounding version
    fetched_at      TIMESTAMPTZ NOT NULL,
    changed         BOOLEAN NOT NULL,                             -- differs from the previous fetch
    extracted_at    TIMESTAMPTZ,                                  -- set on the extraction row (a new row)
    extracted_by    TEXT,                                         -- e.g. 'bench session (subscription)'
    batch           TEXT NOT NULL,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    recorded_by     TEXT NOT NULL DEFAULT current_user
);
CREATE INDEX IF NOT EXISTS idx_orgchart_inst ON org_charts(institution_key, fetched_at DESC);

CREATE OR REPLACE FUNCTION refuse_status_layer_rewrite() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '%.% is insert-only: % refused. A correction is a new row.',
    TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;

DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['institutions', 'institution_offers', 'processes', 'process_steps', 'stakeholders', 'org_charts'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS insert_only ON %I', t);
    EXECUTE format('CREATE TRIGGER insert_only BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION refuse_status_layer_rewrite()', t);
  END LOOP;
END $$;

-- Read access for the app's roles (the brains' tools read through capital_ro). When the loader
-- runs as the admin user, default privileges for capital_app's tables do not cover these.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'capital_ro') THEN
    GRANT SELECT ON institutions, institution_offers, processes, process_steps, stakeholders, org_charts TO capital_ro;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'capital_app') THEN
    GRANT SELECT, INSERT ON institutions, institution_offers, processes, process_steps, stakeholders, org_charts TO capital_app;
  END IF;
END $$;
