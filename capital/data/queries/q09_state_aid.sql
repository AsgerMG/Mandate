-- Q09 — State-aid layer view: SATR-only and cross-channel aggregates.
-- Sprint 15 output. Produces q09.json equivalents for a future site page.

-- 9a — by country
SELECT
  granting_authority_country AS country,
  COUNT(*) AS events,
  COUNT(DISTINCT company_id) AS companies,
  ROUND(SUM(grant_amount_eur)/1e9, 2) AS billion_eur
FROM public_funding_events
WHERE satr_tm_id IS NOT NULL
GROUP BY 1
ORDER BY 4 DESC NULLS LAST;

-- 9b — by aid instrument
SELECT
  aid_instrument AS instrument_bid,
  COUNT(*) AS events,
  COUNT(DISTINCT company_id) AS companies,
  ROUND(SUM(grant_amount_eur)/1e9, 2) AS billion_eur
FROM public_funding_events
WHERE satr_tm_id IS NOT NULL AND aid_instrument IS NOT NULL
GROUP BY 1
ORDER BY 2 DESC;

-- 9c — by aid objective
SELECT
  aid_objective AS objective_bid,
  COUNT(*) AS events,
  COUNT(DISTINCT company_id) AS companies,
  ROUND(SUM(grant_amount_eur)/1e9, 2) AS billion_eur
FROM public_funding_events
WHERE satr_tm_id IS NOT NULL AND aid_objective IS NOT NULL
GROUP BY 1
ORDER BY 2 DESC
LIMIT 30;

-- 9d — 4-layer access map: count of companies per channel combo
SELECT
  received_eu_direct AS eu,
  received_state_aid AS state_aid,
  received_ndb_direct AS ndb,
  COUNT(*) AS companies
FROM v_company_funding_layers
GROUP BY 1, 2, 3
ORDER BY 4 DESC;

-- 9e — Top 50 multi-channel companies (3+ channels)
SELECT
  canonical_name, country, sector_inferred,
  printf('€%.1fM', eu_direct_amount_eur/1e6) AS eu,
  printf('€%.1fM', state_aid_amount_eur/1e6) AS state_aid,
  printf('€%.1fM', ndb_direct_amount_eur/1e6) AS ndb,
  n_source_families AS families,
  n_events
FROM v_company_funding_layers
WHERE received_eu_direct=1 AND received_state_aid=1 AND received_ndb_direct=1
ORDER BY (eu_direct_amount_eur + state_aid_amount_eur + ndb_direct_amount_eur) DESC
LIMIT 50;

-- 9f — State-aid sector distribution (SATR-only companies)
SELECT
  c.sector_inferred AS sector,
  COUNT(*) AS companies,
  ROUND(SUM(pfe.grant_amount_eur)/1e9, 2) AS billion_eur
FROM companies c
JOIN public_funding_events pfe ON pfe.company_id = c.id
WHERE pfe.satr_tm_id IS NOT NULL
GROUP BY 1
ORDER BY 2 DESC;
