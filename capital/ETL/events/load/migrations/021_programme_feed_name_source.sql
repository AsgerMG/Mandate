-- A third name_source: `programme_feed`.
--
-- `deterministic` means we composed the name (usually the granting body) and
-- `curated` means a human chose it from an agency register. Neither describes a
-- name the SOURCE FEED itself carries in `public_funding_events.programme_name`,
-- which is what 71 development-bank families now display: INNO-NAERING,
-- ENERGIFORSKNING, GRONNFORM, Innobooster, Grand Solutions.
--
-- The distinction is not cosmetic. `curated` carries a per-name source URL in
-- data/reference/programme_names.json and is a standing human decision;
-- `programme_feed` is re-derived on every load from a >=80%-dominant vote across
-- the instrument's own events, so it self-corrects when the feed does and needs
-- no maintenance. Collapsing them would hide which names a person is answerable
-- for.
--
-- SQLite cannot alter a CHECK constraint, so the table is rebuilt. Column list
-- is funding_instruments as it stands after 019 (hierarchy) -- read from the
-- live schema rather than assumed, because this table gains columns often.

CREATE TABLE funding_instruments_new (
    id                     TEXT PRIMARY KEY,   -- family key, e.g. 'satr_de_rnd', 'eic_accelerator', 'eu_sme_definition'
    parent_id              TEXT REFERENCES funding_instruments(id),
    name                   TEXT NOT NULL,
    name_source          TEXT NOT NULL CHECK (name_source IN ('deterministic','curated','programme_feed')),
    country                TEXT,                -- ISO2, 'EU', or NULL if mixed
    administering_body     TEXT,
    ndb_id                 TEXT,                -- majority ndb_distributor match, nullable
    source_family_bucket   TEXT,                -- ties back to the existing v_events.source_family (11-bucket grain)
    capital_type           TEXT NOT NULL DEFAULT 'unknown'
                               CHECK (capital_type IN (
                                   'grant','loan','guarantee','counter_guarantee',
                                   'equity','blended','tax_credit','recoverable_advance',
                                   'framework','unknown')),
    capital_type_basis     TEXT,                -- e.g. 'grant_amount_basis=htgf_equity' — audit trail
    event_count            INTEGER NOT NULL DEFAULT 0,
    company_count          INTEGER NOT NULL DEFAULT 0,
    total_eur              REAL NOT NULL DEFAULT 0,
    first_year             INTEGER,
    last_year              INTEGER,
    is_framework            INTEGER NOT NULL DEFAULT 0,   -- 1 for the 8 EU-law records with no events of their own
    sample_project_titles  TEXT,                -- JSON array, SATR rows only: top-N distinct project_title by count
    created_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP
, administering_body_share REAL, scheme_code TEXT, application_url TEXT, sector_mix TEXT, scheme_operators TEXT, award_p25 REAL, award_p50 REAL, award_p75 REAL, award_n INTEGER NOT NULL DEFAULT 0, intensity_p50 REAL, intensity_n INTEGER NOT NULL DEFAULT 0, tier TEXT, root_id TEXT, depth INTEGER NOT NULL DEFAULT 0, path TEXT);
INSERT INTO funding_instruments_new (id, parent_id, name, name_source, country, administering_body, ndb_id, source_family_bucket, capital_type, capital_type_basis, event_count, company_count, total_eur, first_year, last_year, is_framework, sample_project_titles, created_at, updated_at, administering_body_share, scheme_code, application_url, sector_mix, scheme_operators, award_p25, award_p50, award_p75, award_n, intensity_p50, intensity_n, tier, root_id, depth, path) SELECT id, parent_id, name, name_source, country, administering_body, ndb_id, source_family_bucket, capital_type, capital_type_basis, event_count, company_count, total_eur, first_year, last_year, is_framework, sample_project_titles, created_at, updated_at, administering_body_share, scheme_code, application_url, sector_mix, scheme_operators, award_p25, award_p50, award_p75, award_n, intensity_p50, intensity_n, tier, root_id, depth, path FROM funding_instruments;
DROP TABLE funding_instruments;
ALTER TABLE funding_instruments_new RENAME TO funding_instruments;
CREATE INDEX idx_fi_parent   ON funding_instruments(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX idx_fi_country  ON funding_instruments(country);
CREATE INDEX idx_fi_capital  ON funding_instruments(capital_type);
CREATE INDEX idx_fi_events   ON funding_instruments(event_count DESC);
CREATE INDEX idx_fi_tier ON funding_instruments (tier);
CREATE INDEX idx_fi_root ON funding_instruments (root_id);
CREATE INDEX idx_fi_path ON funding_instruments (path);
