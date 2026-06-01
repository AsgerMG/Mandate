-- q05: STEP Seal cohort — rates by family.
-- Count DISTINCT STEP-flagged companies (not event rows): a company with many
-- events in a family must count once, else multi-event families (Pillar II,
-- BDNS) inflate the STEP numerator far past the distinct-company denominator.
SELECT source_family AS family,
       COUNT(DISTINCT company_id) AS n,
       COUNT(DISTINCT CASE WHEN c.step_flagged = 1 THEN company_id END) AS step_n,
       ROUND(100.0 * COUNT(DISTINCT CASE WHEN c.step_flagged = 1 THEN company_id END) /
             COUNT(DISTINCT company_id), 2) AS step_rate_pct
FROM v_events v
JOIN companies c ON c.id = v.company_id
GROUP BY source_family
ORDER BY step_rate_pct DESC;
