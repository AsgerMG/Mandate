-- Did the run that produced this store finish every step it started?
--
-- The corpus already records what it CONTAINS (corpus_census) and what its
-- schema IS (schema_migrations). It has never recorded how the run that built
-- it went. That fact lived in exactly one place -- a subprocess exit code, read
-- by the runner, turned into a string, and written into a Postgres row in a
-- DIFFERENT store from the corpus it describes.
--
-- So the fact does not survive a copy of the file. `make pull-db` brings the
-- volume's rows to a laptop and brings no trace of the fact that the run which
-- produced them stopped half way; `refresh.py` then rebuilds, publishes, and
-- records `ok` about a corpus assembled by a run that was not. On 2026-08-09
-- census #10 recorded `partial: refresh_open_calls.py` against the volume, and
-- nothing on the volume itself said so.
--
-- A mark is opened BEFORE a step runs and closed after it. That is deliberately
-- not a transaction: five subprocesses each committing their own SQLite writes
-- cannot share one, and pretending otherwise would be the thing this repo keeps
-- finding -- a boundary that is asserted and not enforced. What it gives
-- instead is DURABLE INTENT. A container killed mid-step leaves the mark open,
-- and an open mark is indistinguishable from a failed one on purpose: both mean
-- "a step began writing here and never said it was done".
--
--   step       the runner's own label for the step. One row per step; the
--              newest run of it wins, because the question is always about the
--              state the store is in NOW, not its history.
--   run_id     which run wrote it, so a runner can tell its own in-flight marks
--              from the ones the store arrived carrying.
--   closed_at  NULL means opened and never closed.
--   outcome    'ok' | 'partial' | 'failed'. Only 'ok' with a closed_at is
--              resolved. Anything else -- including NULL -- is not.
--
-- Read by ETL/lib/corpus_marks.py, folded into the census's run_outcome by
-- publish_corpus_census.py, and enforced by ETL/schema/check_corpus_marks.py.
-- The census is what carries it to every downstream consumer, because
-- website/frontend/lib/corpusCensus.ts::admissibility already refuses any
-- run_outcome that is not exactly 'ok', and both the guard and the runtime
-- call it.
CREATE TABLE IF NOT EXISTS corpus_run_marks (
  step       TEXT PRIMARY KEY,
  run_id     TEXT NOT NULL,
  runner     TEXT,
  opened_at  TEXT NOT NULL,
  closed_at  TEXT,
  outcome    TEXT,
  detail     TEXT
);
