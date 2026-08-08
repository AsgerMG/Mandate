-- Migration 027: the fifteen columns the corpus has always carried and that no
-- migration created.
-- Applied via: python3 ETL/events/load/migrations/apply.py 027
--
-- ── What this fixes ────────────────────────────────────────────────────────
-- A store rebuilt from schema.sql plus every migration in this directory was
-- NOT the database this project runs on. Fifteen columns existed in the live
-- corpus and in Postgres and were created by no committed DDL at all, in two
-- distinct ways.
--
-- ELEVEN were added by an `ALTER TABLE` that some ETL script runs on itself,
-- the first time it happens to run, on whichever database it happens to be
-- pointed at:
--
--     ETL/terms/mark_offer_route.py       route_status, _source, _note
--     ETL/terms/migrate_to_postgres.py    description, eligibility_text,
--                                         eligibility_source_url,
--                                         eligibility_confidence,
--                                         eligibility_fetched_at
--     ETL/terms/name_applicable_object.py name_basis
--     ETL/events/transform/*              companies.parent_group, sector_rule
--
-- Those self-heals are not wrong and they stay: a script that writes a column
-- should be able to create it. What was wrong is that they were the ONLY thing
-- that created it, so the answer to "does this store have route_status" was
-- "has anyone run mark_offer_route.py against it yet" -- a question about
-- history, asked of a database, with no way to find out but to look.
--
-- That is the same defect that produced the census failure this workstream
-- started from. `no such column: tier` was migration 019 never reaching the
-- Railway volume; the volume had run 9 of 23. Migrations at least LEAVE A
-- TRACE. These eleven columns had no migration to fail to run.
--
-- The other FOUR -- scheme_code, application_url, sector_mix, scheme_operators
-- -- are worse, and they are the ones that took a schema replay to find. No
-- committed statement anywhere in this repository adds them. Not a migration,
-- not a self-heal, not a CREATE TABLE. They exist because somebody typed ALTER
-- at a sqlite3 prompt against a live database, and they have been carried
-- forward ever since by 021 and 022, whose table rebuilds list them in a
-- `CREATE TABLE funding_instruments_new (...)` and then SELECT them out of the
-- table they are rebuilding. So they LOOK declared to anything that reads the
-- DDL, and 021 dies with `no such column: scheme_code` on any store that did
-- not already have them -- which is every store built from source.
--
-- They are not decorative. 759 of 1,088 leaves carry a scheme_code, which is
-- the SA number that joins the corpus to the state aid case register; 969
-- carry a sector_mix. Rebuild this database from its own repository and you get
-- a corpus that cannot reach the case register at all.
--
-- route_status is the one that reaches a founder. website/frontend/lib/
-- intelligence/corpus.ts filters the pool on it, so a store rebuilt without it
-- does not degrade -- it raises, or worse, reads NULL and offers rows the
-- register says are not open to an applicant.
--
-- ── What is deliberately NOT here ──────────────────────────────────────────
-- Three tables are in the same position -- company_sector_llm, satr_staging,
-- instrument_application -- and are staying where they are. Each is created by
-- `CREATE TABLE IF NOT EXISTS` in the single script that both creates and
-- consumes it, so its DDL IS committed and there is exactly one copy of it.
-- Restating a twenty-nine-column staging table here would produce a second
-- definition of the same table, which is the "keep these in sync" comment this
-- repo has now been bitten by three times. A column of type TEXT costs nothing
-- to state twice; a table does.

-- ── Why this is two migrations ─────────────────────────────────────────────
-- 021 and 022 do not ALTER funding_instruments, they REBUILD it: CREATE
-- funding_instruments_new with a fixed column list, copy, drop, rename. Any
-- column not in that list is deleted by them. So the columns that historically
-- arrived BEFORE the rebuilds have to be added before them, and the ones that
-- arrived after have to be added after, or the replay silently loses ten of
-- them. This file is the first half and 028 is the second. That is not
-- housekeeping: it is the reason a rebuild-from-source and the live corpus were
-- two different databases in the first place.

ALTER TABLE companies ADD COLUMN parent_group TEXT;
ALTER TABLE companies ADD COLUMN sector_rule TEXT;


-- The four with no origin in this repository at all. Written by
-- populate_funding_instruments.py (application_url, sector_mix,
-- scheme_operators) and by the case-register loaders (scheme_code); created,
-- until now, by nobody. They must exist before 021, which SELECTs them.
ALTER TABLE funding_instruments ADD COLUMN scheme_code TEXT;
ALTER TABLE funding_instruments ADD COLUMN application_url TEXT;
ALTER TABLE funding_instruments ADD COLUMN sector_mix TEXT;
ALTER TABLE funding_instruments ADD COLUMN scheme_operators TEXT;
