-- Sector labels that survive a company reload.
--
-- The companies table is destructively reloaded (see europe_scope.py), and the
-- surrogate id is re-issued each time. An expensive LLM classification pass was
-- run, collected, and written to companies.sector_top -- and then wiped by the
-- next reload. All 8 batches are recorded as collected in
-- data/.taxonomy_batches.json; not one row carries sector_taxonomy_method='llm'
-- today, and max(created_at) sits six seconds before the surviving taxonomy
-- write. The results are past the API's 29-day retention, so the money is gone.
--
-- This is the third time this shape of bug has cost something: application
-- routes had to be moved off funding_instruments for the same reason, and
-- eligibility embeddings had to stop keying on re-issued gate ids.
--
-- Keyed on canonical_name + country rather than the surrogate id, because the
-- id is exactly what does not survive. 99.8% unique across the corpus; a
-- collision costs one company a slightly wrong sector, which is recoverable,
-- whereas keying on the id costs the entire pass.
CREATE TABLE IF NOT EXISTS company_sector_labels (
    name_key    TEXT PRIMARY KEY,
    sector_top  TEXT,
    subsector   TEXT,
    method      TEXT,
    labelled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
