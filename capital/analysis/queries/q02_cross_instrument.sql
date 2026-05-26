-- q02a: Companies in ≥2 source families (champions)
SELECT b.canonical_name AS name,
       b.country,
       b.sector_inferred AS sector,
       b.n_source_families AS nFamilies,
       b.n_events AS nEvents,
       b.total_grant_eur AS totalGrantEur,
       b.total_debt_eur AS totalDebtEur,
       (b.total_grant_eur + b.total_debt_eur) AS total_eur
FROM v_company_breadth b
WHERE b.n_source_families >= 2
ORDER BY b.n_source_families DESC, total_eur DESC;
