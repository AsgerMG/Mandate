-- EDA views. Refreshed in Sprint 12 (HE Pillar II + JU partnerships), Sprint 13
-- (national development banks rolled up under a single family), and Sprint 14
-- (Europe-scope filter at the corpus layer + BEFORE INSERT trigger; aliases
-- canonicalised in place in `companies.country` so v_european_companies is now
-- a thin wrapper rather than a transform).
-- Re-running drops and recreates so the source_family mapping stays current.

DROP VIEW IF EXISTS v_ndb_distributor_rollup;
DROP VIEW IF EXISTS v_company_funding_layers;
DROP VIEW IF EXISTS v_state_aid_layer;
DROP VIEW IF EXISTS v_country_sector_family;
DROP VIEW IF EXISTS v_company_breadth_companies;
DROP VIEW IF EXISTS v_company_breadth;
DROP VIEW IF EXISTS v_events;
DROP VIEW IF EXISTS v_european_companies;

-- Companies are already restricted to the 40-country EU/Europe scope by the
-- `trg_companies_country_scope` BEFORE INSERT trigger (Sprint 14, see
-- docs/europe_scope.md and scripts/europe_scope.py). This view keeps a defensive
-- filter and surfaces `country_canon` for code paths that want to be explicit
-- about which column they're trusting. If the trigger ever gets disabled or
-- bypassed (e.g. by raw SQL imports), the WHERE clause here still keeps the
-- analytics clean. `country_canon` is identical to `country` post-Sprint-14
-- because aliases were canonicalised in place during the data clean-up.
CREATE VIEW v_european_companies AS
SELECT
  c.*,
  c.country AS country_canon
FROM companies c
WHERE c.country IN (
  'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE',
  'IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE',
  'NO','CH','IS','LI',
  'GB',
  'AL','BA','ME','MK','RS','XK',
  'UA','MD'
);

-- One row per (event, source family, normalised year). Filtered to events
-- whose company is in the Europe scope (see v_european_companies above).
-- Events whose company_id is NULL or non-European are excluded from every
-- downstream q* analysis.
CREATE VIEW v_events AS
SELECT
  e.*,
  CASE
    WHEN e.source LIKE 'eic_%'             THEN 'eic'
    WHEN e.source LIKE 'ipcei_%'           THEN 'ipcei'
    WHEN e.source LIKE 'edf_%'             THEN 'edf'
    WHEN e.source LIKE 'innovation_fund%'  THEN 'innovation_fund'
    WHEN e.source LIKE 'eib_%'             THEN 'eib'
    WHEN e.source LIKE 'eit_%'             THEN 'eit'
    WHEN e.source LIKE 'chips%' OR e.source LIKE 'kdt%' THEN 'chips_ju'
    WHEN e.source LIKE 'chp_%'             THEN 'horizon_eu_partnership'
    WHEN e.source LIKE 'ihi_%'             THEN 'horizon_eu_partnership'
    WHEN e.source LIKE 'eurohpc_%'         THEN 'horizon_eu_partnership'
    -- Sprint 18 JU batch
    WHEN e.source LIKE 'clean_aviation_%'  THEN 'horizon_eu_partnership'
    WHEN e.source LIKE 'sns_ju_%'          THEN 'horizon_eu_partnership'
    WHEN e.source LIKE 'sesar_ju_%'        THEN 'horizon_eu_partnership'
    WHEN e.source LIKE 'europes_rail_%'    THEN 'horizon_eu_partnership'
    WHEN e.source LIKE 'euspa_%'           THEN 'horizon_eu_partnership'
    WHEN e.source LIKE 'gh_edctp3_%'       THEN 'horizon_eu_partnership'
    WHEN e.source LIKE 'erc_poc_%'         THEN 'horizon_eu_pillar_ii'  -- Sprint 17
    WHEN e.source LIKE 'horizon_eu_%'      THEN 'horizon_eu_pillar_ii'  -- incl. Sprint 17 miss/eie/cbe
    WHEN e.source LIKE 'htgf_%'            THEN 'national_dev_banks'
    WHEN e.source LIKE 'cdti_%'            THEN 'national_dev_banks'
    WHEN e.source LIKE 'almi_%'            THEN 'national_dev_banks'
    WHEN e.source LIKE 'cdp_%'             THEN 'national_dev_banks'
    WHEN e.source LIKE 'tesi_%'            THEN 'national_dev_banks'
    WHEN e.source LIKE 'coparion_%'        THEN 'national_dev_banks'
    WHEN e.source LIKE 'invest_nl_%'       THEN 'national_dev_banks'
    WHEN e.source LIKE 'bpifrance_%'       THEN 'national_dev_banks'
    WHEN e.source LIKE 'sprind_%'          THEN 'national_dev_banks'
    WHEN e.source LIKE 'enterprise_ireland_%' THEN 'national_dev_banks'
    -- Sprint 16 central NDB registers
    WHEN e.source LIKE 'ademe_%'           THEN 'national_dev_banks'
    WHEN e.source LIKE 'innovationsfonden_%' THEN 'national_dev_banks'
    WHEN e.source LIKE 'eifo_%'            THEN 'national_dev_banks'
    WHEN e.source LIKE 'fr_relance_%'      THEN 'national_dev_banks'
    -- Sprint 17 direct NDB scrapers (run locally where reachable)
    WHEN e.source LIKE 'innovasjon_norge_%' THEN 'national_dev_banks'
    WHEN e.source LIKE 'nfr_%'             THEN 'national_dev_banks'
    WHEN e.source LIKE 'innosuisse_%'      THEN 'national_dev_banks'
    WHEN e.source LIKE 'vinnova_%'         THEN 'national_dev_banks'
    WHEN e.source LIKE 'business_finland_%' THEN 'national_dev_banks'
    WHEN e.source LIKE 'altum_%' OR e.source LIKE 'ilte_%' OR e.source LIKE 'eis_%' THEN 'national_dev_banks'
    WHEN e.source LIKE 'tacr_%'            THEN 'national_dev_banks'
    WHEN e.source LIKE 'innovate_uk_%'     THEN 'national_dev_banks'  -- 2026-06-10: UK national layer via UKRI GtR
    -- Sprint 15: national state-aid layer (SATR + national portals)
    WHEN e.source LIKE 'satr_%'            THEN 'state_aid_satr'
    WHEN e.source LIKE 'sudop_%'           THEN 'state_aid_satr'
    WHEN e.source LIKE 'bdns_%'            THEN 'state_aid_satr'  -- Sprint 17: Spain SNPSAP register
    WHEN e.source LIKE 'regas_%'           THEN 'state_aid_satr'
    WHEN e.source LIKE 'gov_si_%'          THEN 'state_aid_satr'
    ELSE e.source
  END AS source_family,
  COALESCE(strftime('%Y', e.project_started),
           strftime('%Y', e.call_deadline)) AS event_year
FROM public_funding_events e
INNER JOIN v_european_companies c ON c.id = e.company_id;

-- One row per company with breadth / depth metrics (all entity types — research orgs,
-- companies, public bodies). Use this for total-corpus rollups.
CREATE VIEW v_company_breadth AS
SELECT c.id, c.canonical_name, c.country, c.sector_inferred, c.entity_type,
       c.step_flagged,
       COUNT(DISTINCT v.source_family) AS n_source_families,
       COUNT(*) AS n_events,
       -- ipcei_linked rows are granted tranches of aid already counted as
       -- IPCEI approved ceilings: exclude from per-company euro totals so
       -- champion-style indicative sums stay single-counted (decision D-17).
       SUM(CASE WHEN v.ipcei_linked = 1 THEN 0
                ELSE COALESCE(v.grant_amount_eur, 0) END) AS total_grant_eur,
       SUM(COALESCE(v.debt_amount_eur, 0)) AS total_debt_eur,
       MIN(v.event_year) AS first_year,
       MAX(v.event_year) AS last_year
FROM companies c
JOIN v_events v ON v.company_id = c.id
GROUP BY c.id;

-- Companies-only sibling — strips out research_org / other so the champion analytics
-- recover the original Sprint 9 "company punches across instruments" semantics.
-- Sprint 12 added ~3,700 research-org coordinators via Pillar II consortia; the all-entities
-- view buries the startup/scaleup signal in research-org consortium leadership.
CREATE VIEW v_company_breadth_companies AS
SELECT * FROM v_company_breadth WHERE entity_type = 'company';

-- Country × sector × source family aggregate
CREATE VIEW v_country_sector_family AS
SELECT
  c.country, c.sector_inferred, v.source_family,
  COUNT(DISTINCT c.id) AS companies,
  COUNT(*) AS events,
  SUM(COALESCE(v.grant_amount_eur, 0) + COALESCE(v.debt_amount_eur, 0)) AS total_capital_eur
FROM companies c JOIN v_events v ON v.company_id = c.id
GROUP BY c.country, c.sector_inferred, v.source_family;


-- Sprint 15: state-aid layer — SATR + national state-aid portals (PL/RO/SI).
-- The legal-instrument view of public capital: every row is a Member-State-
-- granted state aid award above the reporting threshold. Use this when the
-- question is "what state-aid-classified capital reached this company?" rather
-- than "what NDB direct activity?" The two layers overlap (some NDB awards ARE
-- state aid; we keep both for traceability, dedup at the company level via
-- v_company_funding_layers).
CREATE VIEW v_state_aid_layer AS
SELECT
  e.satr_tm_id,
  e.aid_instrument,
  e.aid_objective,
  e.granting_authority,
  e.granting_authority_country,
  e.deployment_country,
  e.grant_amount_eur,
  e.grant_amount_basis,
  e.project_started,
  e.project_title,
  e.call_id            AS sa_case_number,
  e.raw_source_url,
  e.sector_tags_raw    AS nace_sector,
  v.source_family,
  e.source,
  c.id                 AS company_id,
  c.canonical_name,
  c.country            AS company_country,
  c.sector_inferred,
  c.entity_type
FROM public_funding_events e
INNER JOIN v_events v ON v.id = e.id
INNER JOIN companies c ON c.id = e.company_id
WHERE v.source_family = 'state_aid_satr';


-- Sprint 15: per-company 4-layer funding map. Each row is one company with
-- booleans + sums for the four channels: EU direct, state aid, NDB direct,
-- private. Use this for access-map and Sankey visualisations.
CREATE VIEW v_company_funding_layers AS
SELECT
  c.id,
  c.canonical_name,
  c.country,
  c.sector_inferred,
  c.entity_type,

  -- EU direct: agencies and JU partnerships
  MAX(CASE WHEN v.source_family IN (
        'eic','ipcei','edf','innovation_fund','eib','eit','chips_ju',
        'horizon_eu_pillar_ii','horizon_eu_partnership'
      ) THEN 1 ELSE 0 END)                                 AS received_eu_direct,
  SUM(CASE WHEN v.source_family IN (
        'eic','ipcei','edf','innovation_fund','eib','eit','chips_ju',
        'horizon_eu_pillar_ii','horizon_eu_partnership'
      ) THEN COALESCE(v.grant_amount_eur, 0)
             + COALESCE(v.debt_amount_eur, 0)
             + COALESCE(v.equity_amount_eur, 0)
        ELSE 0 END)                                        AS eu_direct_amount_eur,

  -- State aid: SATR + national portals
  MAX(CASE WHEN v.source_family = 'state_aid_satr'
        THEN 1 ELSE 0 END)                                 AS received_state_aid,
  SUM(CASE WHEN v.source_family = 'state_aid_satr'
        THEN COALESCE(v.grant_amount_eur, 0) ELSE 0 END)   AS state_aid_amount_eur,

  -- NDB direct: Tier-1/Tier-2 national development banks
  MAX(CASE WHEN v.source_family = 'national_dev_banks'
        THEN 1 ELSE 0 END)                                 AS received_ndb_direct,
  SUM(CASE WHEN v.source_family = 'national_dev_banks'
        THEN COALESCE(v.grant_amount_eur, 0)
             + COALESCE(v.equity_amount_eur, 0)
             + COALESCE(v.debt_amount_eur, 0)
        ELSE 0 END)                                        AS ndb_direct_amount_eur,

  -- Total event / family count
  COUNT(DISTINCT v.source_family) AS n_source_families,
  COUNT(*)                        AS n_events

FROM companies c
JOIN v_events v ON v.company_id = c.id
GROUP BY c.id;


-- Sprint 15 follow-up: NDB-distributor rollup. One row per (canonical NDB,
-- granting country), with event/company/EUR aggregates and a split between
-- "direct-scraper" rows (Sprint 13 NDB scrapers) and "SATR-routed" rows
-- (Sprint 15 state-aid pipeline). Lets you compare the institutional view
-- across both ingestion paths and identify NDBs whose activity is captured
-- entirely via one channel.
CREATE VIEW v_ndb_distributor_rollup AS
SELECT
  e.ndb_distributor                                          AS ndb_id,
  e.deployment_country                                       AS country,
  COUNT(*)                                                   AS events,
  COUNT(DISTINCT e.company_id)                               AS companies,
  ROUND(SUM(COALESCE(e.grant_amount_eur, 0))/1e6, 2)         AS million_eur,
  SUM(CASE WHEN e.satr_tm_id IS NOT NULL THEN 1 ELSE 0 END)  AS via_satr,
  SUM(CASE WHEN e.satr_tm_id IS NULL     THEN 1 ELSE 0 END)  AS via_direct_scraper
FROM public_funding_events e
INNER JOIN v_european_companies c ON c.id = e.company_id
WHERE e.ndb_distributor IS NOT NULL
GROUP BY e.ndb_distributor, e.deployment_country;
