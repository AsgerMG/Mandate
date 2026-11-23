-- 046: THE REGISTER LAYER (the census, owner 19 Nov 2026). One row per public body as an
-- OFFICIAL REGISTER lists it (FR Annuaire de l'administration, UK GOV.UK organisations, later IT
-- IndicePA and EU Whoiswho): its parents and children, its status (open / closed and its
-- successor), the heads the register names with their appointment reference, its links (website,
-- org chart, organising text). The knowledge map is generated from this layer by the scope rule;
-- coverage is measured against it. A new row only when the body's content changed
-- (content_sha256); insert-only with the graph core's trigger. Public professional roles only:
-- no e-mail, no phone.

CREATE TABLE IF NOT EXISTS register_entries (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    market          TEXT NOT NULL,
    register        TEXT NOT NULL,
    register_id     TEXT NOT NULL,
    name            TEXT NOT NULL,
    kind            TEXT,
    status          TEXT NOT NULL CHECK (status IN ('open', 'closed')),
    parent_ids      TEXT[] NOT NULL DEFAULT '{}',
    child_ids       TEXT[] NOT NULL DEFAULT '{}',
    successor_ids   TEXT[] NOT NULL DEFAULT '{}',
    heads           JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(heads) = 'array'),
    links           JSONB NOT NULL DEFAULT '{}'::jsonb,
    citations       JSONB NOT NULL CHECK (jsonb_typeof(citations) = 'array' AND jsonb_array_length(citations) >= 1),
    content_sha256  TEXT NOT NULL,
    batch           TEXT NOT NULL,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    recorded_by     TEXT NOT NULL DEFAULT current_user,
    UNIQUE (register, register_id, content_sha256)
);
CREATE INDEX IF NOT EXISTS idx_register_entries_body ON register_entries(register, register_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_register_entries_market ON register_entries(market);

CREATE OR REPLACE FUNCTION refuse_status_layer_rewrite() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '%.% is insert-only: % refused. A correction is a new row.',
    TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;
DROP TRIGGER IF EXISTS insert_only ON register_entries;
CREATE TRIGGER insert_only BEFORE UPDATE OR DELETE ON register_entries
    FOR EACH ROW EXECUTE FUNCTION refuse_status_layer_rewrite();

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'capital_ro') THEN GRANT SELECT ON register_entries TO capital_ro; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'capital_app') THEN GRANT SELECT, INSERT ON register_entries TO capital_app; END IF;
END $$;
