-- q01 helper: top countries by company count (Europe scope only).
-- Uses country_canon so EL->GR / UK->GB / PO->PL etc. are merged.
SELECT c.country_canon AS country,
       COUNT(DISTINCT c.id) AS companies
FROM v_european_companies c
JOIN v_events v ON v.company_id = c.id
GROUP BY c.country_canon
ORDER BY companies DESC
LIMIT 20;
