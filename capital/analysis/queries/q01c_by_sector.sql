-- q01 helper: companies by sector
SELECT c.sector_inferred AS sector,
       COUNT(*) AS companies
FROM companies c
GROUP BY c.sector_inferred
ORDER BY companies DESC;
