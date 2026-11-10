-- 039: the status layer -- which STATUS opens which public-money door -- and the regions'
-- economic fit, both cited.
--
-- WHY. A senior narrows a market twice before naming an instrument (playbook
-- mandate/playbooks/funding-routes.md §4d.2 and §4e): by STATUS (Art. 106 TUB, start-up
-- innovativa, an establishment in a region: "once the company holds it, list what it opens, at
-- each level") and by ECONOMIC GEOGRAPHY (the regions whose own strategy names the activity).
-- Until now that reasoning lived in prose a model had to remember. These tables make it a
-- lookup Wincent's match_status tool reads, with the quote that says so.
--
--   status_keys         the vocabulary: what a status is and how it is obtained (a plan step).
--   status_rules        status x product family x level x role -> effect, cited.
--   region_priorities   per NUTS-2 region, its S3 priority domains, cited, with OUR activity
--                       tags beside the region's own words (tag_basis says which is which).
--   source_supersessions  "document version X is superseded by Y", cited. Grounding is
--                       append-only and keyed by URL, so a newer edition at a NEW URL does not
--                       make the old one non-current there; this says it, without deleting.
--
-- CITATIONS are jsonb arrays of {sha256, quote, char_start, char_end, url, located}: the
-- grounding version (by sha256, the platform's citation key) and the span the quote was
-- located at by mandate.grounding.store.locate. No foreign key into grounding, for the reason
-- 034 gives (the cron applies forward migrations unattended; integrity is checked by the
-- loader, capital/ETL/terms/load_batch_italy.py, and grounding rows cannot disappear).
--
-- INSERT-ONLY, enforced: a trigger refuses UPDATE and DELETE. A correction is a new row
-- (status_rules.supersedes names the row it replaces). Loaded only by the batch loaders;
-- nothing in the weekly refresh writes these tables.

CREATE TABLE IF NOT EXISTS status_keys (
    key           TEXT PRIMARY KEY CHECK (key ~ '^[a-z0-9_.]+$'),
    label         TEXT NOT NULL,
    kind          TEXT NOT NULL CHECK (kind IN ('licence', 'registration', 'size', 'establishment', 'other')),
    country       TEXT,
    how_obtained  TEXT NOT NULL,
    citations     JSONB NOT NULL CHECK (jsonb_typeof(citations) = 'array' AND jsonb_array_length(citations) >= 1),
    batch         TEXT NOT NULL,
    recorded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    recorded_by   TEXT NOT NULL DEFAULT current_user
);

CREATE TABLE IF NOT EXISTS status_rules (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rule_key        TEXT NOT NULL UNIQUE,
    supersedes      TEXT,
    country         TEXT NOT NULL,
    level           TEXT NOT NULL CHECK (level IN ('eu', 'national', 'regional', 'local')),
    nuts            TEXT,
    product_family  TEXT NOT NULL,
    -- funding_instruments ids this rule applies to, when the corpus holds them (no FK: that
    -- table is rebuilt by upsert and its rows are never deleted, but a family may be held
    -- under several ids or none yet).
    instrument_ids  TEXT[] NOT NULL DEFAULT '{}',
    role            TEXT NOT NULL CHECK (role IN ('applicant', 'intermediary', 'investee')),
    status_key      TEXT NOT NULL REFERENCES status_keys(key),
    effect          TEXT NOT NULL CHECK (effect IN ('required', 'one_of', 'priority', 'excludes')),
    any_of          TEXT,
    activity_tags   TEXT[] NOT NULL DEFAULT '{}',
    statement       TEXT NOT NULL,
    verify_note     TEXT,
    citations       JSONB NOT NULL CHECK (jsonb_typeof(citations) = 'array' AND jsonb_array_length(citations) >= 1),
    batch           TEXT NOT NULL,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    recorded_by     TEXT NOT NULL DEFAULT current_user,
    CHECK ((effect = 'one_of') = (any_of IS NOT NULL)),
    CHECK (level <> 'regional' OR nuts IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_sr_status ON status_rules(status_key);
CREATE INDEX IF NOT EXISTS idx_sr_country_level ON status_rules(country, level);

CREATE TABLE IF NOT EXISTS region_priorities (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nuts           TEXT NOT NULL,
    country        TEXT NOT NULL,
    region         TEXT NOT NULL,
    strategy       TEXT NOT NULL,
    -- the region's own name for the domain, verbatim from the cited text
    priority       TEXT NOT NULL,
    activity_tags  TEXT[] NOT NULL DEFAULT '{}',
    tag_basis      TEXT NOT NULL,
    citations      JSONB NOT NULL CHECK (jsonb_typeof(citations) = 'array' AND jsonb_array_length(citations) >= 1),
    batch          TEXT NOT NULL,
    recorded_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    recorded_by    TEXT NOT NULL DEFAULT current_user,
    UNIQUE (nuts, priority)
);

CREATE TABLE IF NOT EXISTS source_supersessions (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    old_sha256    TEXT NOT NULL CHECK (old_sha256 ~ '^[0-9a-f]{64}$'),
    old_url       TEXT NOT NULL,
    new_sha256    TEXT NOT NULL CHECK (new_sha256 ~ '^[0-9a-f]{64}$'),
    new_url       TEXT NOT NULL,
    citations     JSONB NOT NULL CHECK (jsonb_typeof(citations) = 'array' AND jsonb_array_length(citations) >= 1),
    batch         TEXT NOT NULL,
    recorded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    recorded_by   TEXT NOT NULL DEFAULT current_user,
    UNIQUE (old_sha256, new_sha256)
);

CREATE OR REPLACE FUNCTION refuse_status_layer_rewrite() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '%.% is insert-only: % refused. A correction is a new row.',
    TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['status_keys', 'status_rules', 'region_priorities', 'source_supersessions'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS insert_only ON %I', t);
    EXECUTE format('CREATE TRIGGER insert_only BEFORE UPDATE OR DELETE ON %I '
                   'FOR EACH ROW EXECUTE FUNCTION refuse_status_layer_rewrite()', t);
  END LOOP;
END $$;
