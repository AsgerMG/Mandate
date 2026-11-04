-- Where a fund's money actually lands, as a routing attribute.
--
-- 123 publishable leaves share a scheme NAME with at least one sibling, and
-- their profile embeddings sit at mean cosine 0.947. That is not an embedding
-- defect: they are ONE notified scheme (SA.111723 covers fourteen of them)
-- delivered by MANY granting bodies. Nothing in the corpus said which founder
-- each body is for, so retrieval was being asked to guess between fourteen
-- texts that legitimately read alike.
--
-- What separates them is the applicant's REGION, and the corpus already holds
-- the evidence at full coverage: the State Aid Transparency Register publishes
-- the beneficiary's NUTS region on every award (satr_staging.region, 122,814 of
-- 122,814 rows), and each leaf is exactly one (sa_number, granting_authority)
-- pair in that table. Region is therefore MEASURED per leaf, not inferred from
-- the body's name -- "Bayerisches Staatsministerium" never contains the string
-- "Bayern", and a name rule would have missed it while inventing others.
--
-- delivery_region is the MOST SPECIFIC NUTS region that still covers a
-- supermajority of a leaf's own awards. That definition is what makes it safe:
-- a body that pays across a whole country resolves only to the country and is
-- recorded as NULL (no regional claim), while Conseil regional Nouvelle-
-- Aquitaine resolves to FRI at 97%. It is deliberately capped at NUTS level 2,
-- because that is the level the intake asks a founder about and the level
-- regions.generated.ts carries.
--
-- This is a PROGRAMME FACT, never a filter. Where a scheme is legally confined
-- to a region the Commission's own registration says so, and
-- encode_registered_regions.py already writes that as a filter gate. An award
-- history says where the money has gone, which narrows and must never
-- disqualify -- the same distinction the inferred GBER article already carries.

ALTER TABLE funding_instruments ADD COLUMN delivery_region TEXT;
ALTER TABLE funding_instruments ADD COLUMN delivery_region_share REAL;
-- The full distribution, for anything that wants to reason about a body that
-- serves two regions rather than one. JSON, NUTS id -> award count.
ALTER TABLE funding_instruments ADD COLUMN recipient_region_mix TEXT;
