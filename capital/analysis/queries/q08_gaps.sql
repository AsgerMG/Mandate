-- q08: Companies per country (for per-capita join in Python)
SELECT country,
       COUNT(*) AS companies,
       SUM(total_grant_eur) AS total_grant_eur,
       SUM(step_flagged) AS step_companies
FROM v_company_breadth
WHERE country IS NOT NULL
GROUP BY country
ORDER BY companies DESC;
