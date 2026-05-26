-- q03b: Source family × sector heatmap
SELECT source_family AS family, sector_inferred AS sector,
       COUNT(DISTINCT c.id) AS companies,
       COUNT(*) AS events
FROM companies c
JOIN v_events v ON v.company_id = c.id
WHERE sector_inferred IS NOT NULL
GROUP BY source_family, sector_inferred
ORDER BY companies DESC;
