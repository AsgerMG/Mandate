-- 043: THE NETWORK -- how ministries and funding vehicles interlink (owner, 19 Nov): who
-- oversees, funds, mandates, owns, sits on or appoints to whom, and who delegates a programme to
-- whom. One row per stated tie between two capital.institutions nodes, cited to the official page
-- that states it (governance pages, statutes, board pages, programme pages). Feeds Wincent's
-- `network` tool and the case board's `networks` graph. People who appear in two institutions'
-- charts are derived from capital.stakeholders, not stored here.
-- CITATIONS as 039/041/042; INSERT-ONLY with the same trigger.

CREATE TABLE IF NOT EXISTS institution_links (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    from_key    TEXT NOT NULL,
    to_key      TEXT NOT NULL,
    kind        TEXT NOT NULL CHECK (kind IN ('oversees', 'funds', 'mandates', 'owns', 'sits_on', 'delegates_to', 'appoints')),
    detail      TEXT,
    citations   JSONB NOT NULL CHECK (jsonb_typeof(citations) = 'array' AND jsonb_array_length(citations) >= 1),
    batch       TEXT NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    recorded_by TEXT NOT NULL DEFAULT current_user,
    UNIQUE (from_key, to_key, kind, batch)
);
CREATE INDEX IF NOT EXISTS idx_links_from ON institution_links(from_key);
CREATE INDEX IF NOT EXISTS idx_links_to ON institution_links(to_key);

CREATE OR REPLACE FUNCTION refuse_status_layer_rewrite() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '%.% is insert-only: % refused. A correction is a new row.',
    TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;
DROP TRIGGER IF EXISTS insert_only ON institution_links;
CREATE TRIGGER insert_only BEFORE UPDATE OR DELETE ON institution_links
    FOR EACH ROW EXECUTE FUNCTION refuse_status_layer_rewrite();

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'capital_ro') THEN GRANT SELECT ON institution_links TO capital_ro; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'capital_app') THEN GRANT SELECT, INSERT ON institution_links TO capital_app; END IF;
END $$;
