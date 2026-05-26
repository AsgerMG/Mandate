-- q05: STEP Seal cohort — rates by family, country, sector
SELECT source_family AS family,
       COUNT(DISTINCT company_id) AS n,
       SUM(CASE WHEN c.step_flagged = 1 THEN 1 ELSE 0 END) AS step_n,
       ROUND(100.0 * SUM(CASE WHEN c.step_flagged = 1 THEN 1 ELSE 0 END) /
             COUNT(DISTINCT company_id), 2) AS step_rate_pct
FROM v_events v
JOIN companies c ON c.id = v.company_id
GROUP BY source_family
ORDER BY step_rate_pct DESC;
