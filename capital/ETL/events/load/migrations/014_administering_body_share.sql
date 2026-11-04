-- How much of an instrument's history the named administering_body actually
-- accounts for.
--
-- administering_body is a majority vote over the raw per-event
-- granting_authority, and the frontend renders it INSTEAD of the auto-generated
-- register name ("SATR De Rnd" means nothing to a founder). But the vote is a
-- plurality, not a majority, and nothing recorded how thin it was:
--
--   satr_de_rnd  -> "Bundesamt fuer Wirtschaft und Ausfuhrkontrolle"  15.3% of 419 authorities
--   satr_it_rnd  -> "Ministero delle Imprese e del Made in Italy"     20.5% of 105
--   satr_gr_rnd  -> "Ministry of Agricultural Development"            28.0% of  29
--   satr_fr_rnd  -> "Ministere de la Transition ecologique"           41.5% of  30
--   satr_de_equity -> "Landwirtschaftliche Rentenbank"                49.6% of  35
--
-- Each of those rows is a rollup of a whole country's state aid, presented to
-- the founder as one specific agency to approach. A robotics company was shown
-- the German agricultural bank, and a French fintech the ecological transition
-- ministry, purely because those bodies award the most line items.
--
-- Storing the share lets the frontend keep the substitution where it is
-- genuinely informative and fall back to an honest generic label where it is
-- not. The distribution is cleanly bimodal (15 instruments at or below 50.7%,
-- then a jump to 60.1%), so any threshold in that gap separates the two
-- populations; displayInstitutionName uses 0.6.

ALTER TABLE funding_instruments ADD COLUMN administering_body_share REAL;

-- Backfill in place. Deliberately NOT done by re-running
-- populate_funding_instruments.py: that script does
-- `DELETE FROM eligibility_gates WHERE instrument_id NOT IN (... is_framework=1)`
-- as part of its full rebuild, which would destroy the encoded value_specs and
-- gate_role triage that cost real money to produce.
WITH auth AS (
  SELECT s.instrument_id AS iid, e.granting_authority AS ga, COUNT(*) AS n
  FROM funding_instrument_sources s
  JOIN public_funding_events e ON e.source = s.source
  WHERE e.granting_authority IS NOT NULL
  GROUP BY s.instrument_id, e.granting_authority
),
tot AS (SELECT iid, SUM(n) AS total, MAX(n) AS top FROM auth GROUP BY iid)
UPDATE funding_instruments
SET administering_body_share = (
  SELECT CAST(tot.top AS REAL) / tot.total FROM tot WHERE tot.iid = funding_instruments.id
)
WHERE administering_body IS NOT NULL
  AND EXISTS (SELECT 1 FROM tot WHERE tot.iid = funding_instruments.id);
