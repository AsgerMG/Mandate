-- q05b: STEP rate by country
SELECT country,
       COUNT(*) AS n,
       SUM(step_flagged) AS step_n,
       ROUND(100.0 * SUM(step_flagged) / COUNT(*), 2) AS step_rate_pct
FROM v_company_breadth
WHERE country IS NOT NULL
GROUP BY country
HAVING n >= 5
ORDER BY step_rate_pct DESC;
