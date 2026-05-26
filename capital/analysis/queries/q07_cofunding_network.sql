-- q07: Co-funding ordered pairs (directed: first_family → second_family by first_year)
SELECT a_fam.source_family AS family_a,
       b_fam.source_family AS family_b,
       COUNT(DISTINCT a_fam.company_id) AS co_companies
FROM (
  SELECT company_id, source_family,
         MIN(event_year) AS min_year
  FROM v_events
  GROUP BY company_id, source_family
) a_fam
JOIN (
  SELECT company_id, source_family,
         MIN(event_year) AS min_year
  FROM v_events
  GROUP BY company_id, source_family
) b_fam ON a_fam.company_id = b_fam.company_id
       AND a_fam.source_family <> b_fam.source_family
       AND a_fam.min_year <= b_fam.min_year
WHERE a_fam.source_family < b_fam.source_family
GROUP BY family_a, family_b
ORDER BY co_companies DESC;
