-- q01 helper: top countries by company count
SELECT country,
       COUNT(*) AS companies
FROM companies
WHERE country IS NOT NULL
GROUP BY country
ORDER BY companies DESC
LIMIT 20;
