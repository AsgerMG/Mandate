-- q01 helper: companies by source family
SELECT source_family AS family,
       COUNT(DISTINCT company_id) AS companies
FROM v_events
GROUP BY source_family
ORDER BY companies DESC;
