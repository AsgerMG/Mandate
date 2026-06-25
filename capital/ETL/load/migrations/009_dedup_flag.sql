-- Migration 009: cross-source duplicate flag (applied via apply.py::apply_009)
--
-- Some events are the same grant reported by two sources. The first case is
-- ADEME grants >= EUR 100k that are also published in SATR-FR (France reports
-- them under the parent ministry, never under "ADEME"). Both feed France totals,
-- so the overlap inflates corpus and FR sums.
--
-- This migration adds:
--   public_funding_events.is_duplicate  INTEGER NOT NULL DEFAULT 0
--   public_funding_events.dup_reason    TEXT        -- why it was flagged
--   idx_pfe_is_duplicate                partial index on is_duplicate = 1
-- and refreshes v_events (from analysis/views.sql) to exclude is_duplicate = 1
-- rows, so every downstream total/count nets the overlap at one point.
--
-- Population is done by scripts/flag_ademe_satr_duplicates.py (re-runnable).
-- Reversible: UPDATE public_funding_events SET is_duplicate=0, dup_reason=NULL,
-- then refresh views.

ALTER TABLE public_funding_events ADD COLUMN is_duplicate INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public_funding_events ADD COLUMN dup_reason TEXT;
CREATE INDEX IF NOT EXISTS idx_pfe_is_duplicate
  ON public_funding_events(is_duplicate) WHERE is_duplicate = 1;
