-- Migration 029: the second half of 028 -- the funding_instruments columns that
-- no migration created and that must be added AFTER 021/022.
-- Applied via: python3 ETL/events/load/migrations/apply.py 029
--
-- See 028's header for the whole finding. The split exists because 021 and 022
-- rebuild funding_instruments from a fixed column list and delete anything not
-- on it; these ten columns were added to the live database by self-healing ETL
-- scripts at some point after those rebuilds ran, so this is where they belong.
--
--     ETL/terms/migrate_to_postgres.py    description, eligibility_text,
--                                         eligibility_source_url,
--                                         eligibility_confidence,
--                                         eligibility_fetched_at
--     ETL/terms/name_applicable_object.py name_basis
--     ETL/terms/mark_offer_route.py       route_status, _source, _note

ALTER TABLE funding_instruments ADD COLUMN description TEXT;
ALTER TABLE funding_instruments ADD COLUMN eligibility_text TEXT;
ALTER TABLE funding_instruments ADD COLUMN eligibility_source_url TEXT;
ALTER TABLE funding_instruments ADD COLUMN eligibility_confidence TEXT;
ALTER TABLE funding_instruments ADD COLUMN eligibility_fetched_at TEXT;
ALTER TABLE funding_instruments ADD COLUMN name_basis TEXT;

-- route_status: whether an applicant can apply to this fund at all, as against
-- whether a call is open. Written only by mark_offer_route.py, which requires a
-- citation before it will record 'none', because declaring a row a non-fund is
-- a claim about the world. website/frontend/lib/intelligence/corpus.ts filters
-- the pool on it, so a store rebuilt without it does not serve a smaller pool --
-- it serves a wrong one.
ALTER TABLE funding_instruments ADD COLUMN route_status TEXT;
ALTER TABLE funding_instruments ADD COLUMN route_status_source TEXT;
ALTER TABLE funding_instruments ADD COLUMN route_status_note TEXT;
