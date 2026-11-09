-- The legacy vectors' exit (mandate/ops/one_model_drop_old.sh, step 5 of the
-- one-model move). Every row's vector in the one Mandate model is in
-- embedding_v4 (036) and every reader has read it since the flip; the legacy
-- columns were archived with pg_dump before this ran (~/Mandate-backups/one_model/).
-- Dropping a column drops its HNSW index with it.
ALTER TABLE eligibility_embeddings DROP COLUMN IF EXISTS embedding;
ALTER TABLE instrument_profiles DROP COLUMN IF EXISTS embedding;
ALTER TABLE signals_chunk_embeddings DROP COLUMN IF EXISTS embedding;
