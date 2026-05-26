-- q05d: Scatter data — each company: total_grant_eur, n_source_families, step_flagged
SELECT canonical_name AS name,
       country,
       sector_inferred AS sector,
       total_grant_eur,
       n_source_families,
       step_flagged
FROM v_company_breadth
WHERE total_grant_eur > 0;
