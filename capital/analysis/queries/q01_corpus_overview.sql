-- q01: Corpus overview — headline KPIs + breakdowns by family, sector, country
SELECT
  (SELECT COUNT(*) FROM companies) AS total_companies,
  (SELECT COUNT(*) FROM public_funding_events) AS total_events,
  (SELECT COUNT(DISTINCT source_family) FROM v_events) AS total_source_families,
  (SELECT COUNT(DISTINCT country) FROM companies WHERE country IS NOT NULL) AS total_countries,
  (SELECT COUNT(DISTINCT sector_inferred) FROM companies WHERE sector_inferred IS NOT NULL) AS total_sectors,
  (SELECT SUM(COALESCE(grant_amount_eur,0) + COALESCE(debt_amount_eur,0)) FROM public_funding_events) AS total_capital_eur;
