-- A fifth `name_source`: `partition_key`.
--
-- The four that existed all answer "who named this row" with somebody:
--   deterministic   composed by us from register fields, or from a family key
--                   that traces to a published identifier
--   curated         a human read the official page and wrote the name
--   programme_feed  the feed's own words for the object
--   case_register   the Commission's title for a notified scheme
--
-- `partition_key` is the answer that was missing: NOBODY named it. The row's
-- name is a mechanical re-casing of a key the loader composed out of its own
-- query partitioning -- a country crossed with the filter set we send to a
-- search API (`satr_pt_equity`), a short slug we invented per API query
-- (`sudop_parp_rd`), a parse fallback for a topic code with no year
-- (`chips_ju_kdt_unknown`).
--
-- Twelve such rows were in founders' pools. `SATR Pt Equity` reached a
-- Portuguese founder unblocked as "National state aid (equity)" with a typical
-- award of EUR 255,571, and Poland's entire offerable pool was eight `Sudop *`
-- rows with no real Polish fund among them.
--
-- The value is DECLARED per feed in reference/family_name_evidence.json
-- and written by ETL/events/load/populate_funding_instruments.py (and, for a
-- corpus that already exists, ETL/terms/assign_name_evidence.py). It is read by
-- website/frontend/lib/intelligence/nameEvidence.ts, whose one consumer is
-- publishableInstruments().
--
-- This file is the Postgres/DDL statement of the change. SQLite cannot ALTER a
-- CHECK constraint, and rebuilding funding_instruments to widen one would mean
-- hand-restating a column list that has grown past sixty entries -- so
-- apply_032 in apply.py edits the DDL text in place, exactly as 026 did for
-- capital_type. No data moves and no column can be dropped by omission.

ALTER TABLE funding_instruments
  ADD COLUMN IF NOT EXISTS name_source TEXT NOT NULL DEFAULT 'deterministic';

-- Postgres carries its own CHECK on this column -- one the committed
-- postgres_schema.sql does not show, because that file is a dumped column list
-- and constraints live beside it. It rejected the first write of
-- `partition_key` outright, which is the constraint doing its job; widening it
-- is the second half of the same change and belongs in the same file as the
-- first, or the next store built from committed DDL alone diverges from the one
-- the product reads.
ALTER TABLE funding_instruments
  DROP CONSTRAINT IF EXISTS funding_instruments_name_source_check;
ALTER TABLE funding_instruments
  ADD CONSTRAINT funding_instruments_name_source_check
  CHECK (name_source IN ('deterministic', 'curated', 'programme_feed',
                         'case_register', 'partition_key'));
