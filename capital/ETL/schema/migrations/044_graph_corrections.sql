-- 044: CORRECTIONS to the graph core. The graph-core tables are insert-only and keyed one row per
-- key, so a value that was wrong when loaded (19 Nov: 33 institution names cut at a comma by a YAML
-- flow-mapping parse) or that changed since (a ministry renamed) cannot be rewritten in place.
-- A correction is a new row here; readers take the newest correction for (table, key, column) over
-- the original value. Written only by the graph-core loaders (load_graph_de.py writes a name
-- correction when the knowledge map's name differs from the stored one); read by Wincent's tools.
-- INSERT-ONLY with the same trigger as 039/041/042/043.

CREATE TABLE IF NOT EXISTS graph_corrections (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    table_name  TEXT NOT NULL CHECK (table_name IN ('institutions', 'institution_offers', 'processes', 'process_steps', 'stakeholders', 'institution_links')),
    row_key     TEXT NOT NULL,
    column_name TEXT NOT NULL CHECK (column_name IN ('name', 'name_local', 'role', 'product_name', 'title')),
    value       TEXT NOT NULL,
    reason      TEXT NOT NULL,
    citations   JSONB NOT NULL CHECK (jsonb_typeof(citations) = 'array'),
    batch       TEXT NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    recorded_by TEXT NOT NULL DEFAULT current_user,
    UNIQUE (table_name, row_key, column_name, value)
);
CREATE INDEX IF NOT EXISTS idx_graph_corrections_row ON graph_corrections(table_name, row_key, column_name, recorded_at DESC);

CREATE OR REPLACE FUNCTION refuse_status_layer_rewrite() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '%.% is insert-only: % refused. A correction is a new row.',
    TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;
DROP TRIGGER IF EXISTS insert_only ON graph_corrections;
CREATE TRIGGER insert_only BEFORE UPDATE OR DELETE ON graph_corrections
    FOR EACH ROW EXECUTE FUNCTION refuse_status_layer_rewrite();

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'capital_ro') THEN GRANT SELECT ON graph_corrections TO capital_ro; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'capital_app') THEN GRANT SELECT, INSERT ON graph_corrections TO capital_app; END IF;
END $$;
