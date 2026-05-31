-- q01 helper: companies by sector (Europe scope only — distinct on companies
-- that have at least one in-scope funding event).
SELECT c.sector_inferred AS sector,
       COUNT(DISTINCT c.id) AS companies
FROM v_european_companies c
JOIN v_events v ON v.company_id = c.id
GROUP BY c.sector_inferred
ORDER BY companies DESC;
