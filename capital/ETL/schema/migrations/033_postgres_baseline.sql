-- 033: the Postgres baseline. The first forward migration, and a stamp rather
-- than a change.
--
-- On 2026-11-05 the corpus moved from SQLite into schema `capital`. Its schema
-- at that moment is ETL/schema/corpus_schema.sql (the corpus tables) plus
-- ETL/schema/postgres_schema.sql (the tables Postgres already served); ids
-- 004-032 are the SQLite lineage that produced it. This stamp says the store
-- has crossed that line, so the census's schema_state shows it, and it refuses
-- to stamp a store the baseline was never applied to.
DO $$
BEGIN
  IF to_regclass('companies') IS NULL
     OR to_regclass('public_funding_events') IS NULL
     OR to_regclass('funding_instruments') IS NULL
     OR to_regclass('schema_migrations') IS NULL THEN
    RAISE EXCEPTION 'the baseline is not in this store: apply ETL/schema/corpus_schema.sql and ETL/schema/postgres_schema.sql first';
  END IF;
END $$;
