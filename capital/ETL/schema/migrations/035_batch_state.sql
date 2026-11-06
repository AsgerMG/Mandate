-- 035: where an asynchronous LLM batch's id is kept between runs.
--
-- The signals classifiers (ETL/intelligence/transform/classify_relevance.py,
-- entity_link_articles.py, classify_signals.py) SUBMIT a Message Batch in one
-- run and COLLECT its results in a later one. The batch ids lived in
-- data/.signals_*_batches.json -- a file. On the weekly cron's container the
-- filesystem is scratch, so every id submitted there was gone by the next run:
-- results paid for and never collected. One row per kind, the same JSON shape
-- the file had ({"batches": [...], "collected": [...]}). See ETL/lib/batch_state.py.
CREATE TABLE IF NOT EXISTS batch_state (
    kind        TEXT PRIMARY KEY,
    state       JSONB NOT NULL DEFAULT '{"batches": [], "collected": []}'::jsonb,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
