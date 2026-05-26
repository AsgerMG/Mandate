-- q05c: STEP rate by sector
SELECT sector_inferred AS sector,
       COUNT(*) AS n,
       SUM(step_flagged) AS step_n,
       ROUND(100.0 * SUM(step_flagged) / COUNT(*), 2) AS step_rate_pct
FROM v_company_breadth
WHERE sector_inferred IS NOT NULL
GROUP BY sector_inferred
ORDER BY step_rate_pct DESC;
