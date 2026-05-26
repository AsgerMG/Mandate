-- q02c: Sector share — champions (≥2 families) vs full corpus
SELECT sector_inferred AS sector,
       SUM(CASE WHEN n_source_families >= 2 THEN 1 ELSE 0 END) AS champion_count,
       COUNT(*) AS corpus_count,
       ROUND(100.0 * SUM(CASE WHEN n_source_families >= 2 THEN 1 ELSE 0 END) /
             (SELECT COUNT(*) FROM v_company_breadth WHERE n_source_families >= 2), 2) AS champion_pct,
       ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM v_company_breadth), 2) AS baseline_pct
FROM v_company_breadth
GROUP BY sector_inferred
ORDER BY champion_pct DESC;
