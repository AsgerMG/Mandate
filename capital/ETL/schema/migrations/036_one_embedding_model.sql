-- 036: a column for the one Mandate embedding model beside each legacy vector.
--
-- Capital's three vector tables are in two legacy spaces (eligibility_embeddings
-- and instrument_profiles in voyage-3.5, signals_chunk_embeddings in a local
-- 384-d MiniLM). mandate/embedding/spaces.json names ONE model (voyage-4-large,
-- 1024-d, stored as halfvec). Moving a table means re-embedding it, and a query
-- embedded in one space and compared with vectors of another returns noise that
-- looks like a result -- so there may be NO moment when a reader's query model
-- and the vectors it reads disagree.
--
-- So the new vectors go BESIDE the old, never over them:
--   * this migration adds `embedding_v4 halfvec(1024)` (NULL until filled) and
--     makes the legacy `embedding` nullable, so that after the flip a writer
--     may write only the new column. No row is rewritten here.
--   * mandate/ops/one_model.sh fills embedding_v4 for every row; the writers
--     (embed_eligibility, build_instrument_profiles, embed_articles) fill it for
--     every NEW row from the moment this column exists (dual write).
--   * readers keep reading `embedding` until spaces.json `stored` flips, which
--     moves the query model AND the column (vector_columns) in one commit.
--   * the legacy column is dropped later, separately and owner-briefed
--     (mandate/ops/one_model_drop_old.sh), after a pg_dump archive.
--
-- No HNSW index on the new columns, on purpose: no reader's plan can use one.
-- semantic.ts ranks EVERY profile (no LIMIT), demandRetrieval.ts ranks within
-- a window partition, and signals_retrieval.py scans exactly (see its header).
-- The volume is a 5 GB Hobby disk; an index nothing reads is ~40 MB of it.
--
-- One ADD per statement: ETL/schema/check_store_schema.py reads them that way.
ALTER TABLE eligibility_embeddings ADD COLUMN IF NOT EXISTS embedding_v4 halfvec(1024);
ALTER TABLE eligibility_embeddings ALTER COLUMN embedding DROP NOT NULL;
ALTER TABLE instrument_profiles ADD COLUMN IF NOT EXISTS embedding_v4 halfvec(1024);
ALTER TABLE instrument_profiles ALTER COLUMN embedding DROP NOT NULL;
ALTER TABLE signals_chunk_embeddings ADD COLUMN IF NOT EXISTS embedding_v4 halfvec(1024);
ALTER TABLE signals_chunk_embeddings ALTER COLUMN embedding DROP NOT NULL;
