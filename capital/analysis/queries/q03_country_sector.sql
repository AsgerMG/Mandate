-- q03: Country × sector heatmap
SELECT country, sector_inferred AS sector,
       COUNT(DISTINCT id) AS companies,
       SUM(COALESCE(total_grant_eur,0) + COALESCE(total_debt_eur,0)) AS total_eur
FROM v_company_breadth
WHERE country IS NOT NULL AND sector_inferred IS NOT NULL
GROUP BY country, sector_inferred
ORDER BY companies DESC;
