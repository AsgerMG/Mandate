-- q06: Events per year per source family
SELECT event_year AS year,
       source_family AS family,
       COUNT(*) AS events,
       COUNT(DISTINCT company_id) AS companies,
       AVG(COALESCE(grant_amount_eur, 0)) AS avg_grant_eur,
       SUM(COALESCE(grant_amount_eur, 0)) AS total_grant_eur
FROM v_events
WHERE event_year IS NOT NULL AND CAST(event_year AS INTEGER) >= 2020
GROUP BY event_year, source_family
ORDER BY event_year, source_family;
