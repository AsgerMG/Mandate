-- Sprint 9 EDA views. Refreshed in Sprint 12 to recognise HE Pillar II + JU partnerships.
-- Re-running drops and recreates so the source_family mapping stays current.

DROP VIEW IF EXISTS v_country_sector_family;
DROP VIEW IF EXISTS v_company_breadth_companies;
DROP VIEW IF EXISTS v_company_breadth;
DROP VIEW IF EXISTS v_events;

-- One row per (event, source family, normalised year)
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
    WHEN e.source LIKE 'horizon_eu_%'      THEN 'horizon_eu_pillar_ii'
    ELSE e.source
  END AS source_family,
  COALESCE(strftime('%Y', e.project_started),
           strftime('%Y', e.call_deadline)) AS event_year
FROM public_funding_events e;

-- One row per company with breadth / depth metrics (all entity types — research orgs,
-- companies, public bodies). Use this for total-corpus rollups.
CREATE VIEW v_company_breadth AS
SELECT c.id, c.canonical_name, c.country, c.sector_inferred, c.entity_type,
       c.step_flagged,
       COUNT(DISTINCT v.source_family) AS n_source_families,
       COUNT(*) AS n_events,
       SUM(COALESCE(v.grant_amount_eur, 0)) AS total_grant_eur,
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
