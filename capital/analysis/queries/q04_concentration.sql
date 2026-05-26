-- q04: Per-family ordered list for Gini / Lorenz computation (Python computes Gini)
SELECT source_family AS family,
       company_id,
       SUM(COALESCE(grant_amount_eur, 0)) AS grant_eur
FROM v_events
GROUP BY source_family, company_id
ORDER BY source_family, grant_eur ASC;
