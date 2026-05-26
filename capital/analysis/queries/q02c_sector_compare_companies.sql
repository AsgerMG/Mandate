-- q02c (companies-only): Sector share — champions (≥2 families) vs full corpus,
-- restricted to entity_type='company'.
SELECT sector_inferred AS sector,
       SUM(CASE WHEN n_source_families >= 2 THEN 1 ELSE 0 END) AS champion_count,
       COUNT(*) AS corpus_count,
       ROUND(100.0 * SUM(CASE WHEN n_source_families >= 2 THEN 1 ELSE 0 END) /
             (SELECT COUNT(*) FROM v_company_breadth_companies WHERE n_source_families >= 2), 2) AS champion_pct,
       ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM v_company_breadth_companies), 2) AS baseline_pct
FROM v_company_breadth_companies
GROUP BY sector_inferred
ORDER BY champion_pct DESC;
