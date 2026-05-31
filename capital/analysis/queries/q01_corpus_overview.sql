-- q01: Corpus overview — headline KPIs + breakdowns by family, sector, country.
-- All counts restricted to the Europe scope (40 countries) via v_european_companies
-- and the v_events filter on top of it. See docs/europe_scope.md.
SELECT
  (SELECT COUNT(DISTINCT c.id)
     FROM v_european_companies c
     JOIN v_events v ON v.company_id = c.id)            AS total_companies,
  (SELECT COUNT(*) FROM v_events)                       AS total_events,
  (SELECT COUNT(DISTINCT source_family) FROM v_events)  AS total_source_families,
  (SELECT COUNT(DISTINCT country_canon)
     FROM v_european_companies c
     JOIN v_events v ON v.company_id = c.id)            AS total_countries,
  (SELECT COUNT(DISTINCT c.sector_inferred)
     FROM v_european_companies c
     JOIN v_events v ON v.company_id = c.id
     WHERE c.sector_inferred IS NOT NULL)               AS total_sectors,
  (SELECT SUM(COALESCE(v.grant_amount_eur, 0)
            + COALESCE(v.debt_amount_eur, 0))
     FROM v_events v)                                   AS total_capital_eur;
