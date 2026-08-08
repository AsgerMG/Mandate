-- Migration 008: Sprint 19 equity layer -- public_equity_stakes + instrument_class.
-- Applied via: python3 ETL/events/load/migrations/apply.py 008
--
-- - public_equity_stakes: positions, not funding events. One row per
--   (company, holding institution, as-of date). Stakes NEVER sum with
--   grants/loans -- that is the whole point of a separate table.
--   disclosure_level is the unit of analysis for the disclosure scorecard.
-- - instrument_class on public_funding_events: labels already-loaded rows that
--   are equity-class instruments (SATR PRVRISKFIN risk finance, BDNS
--   participative loans, EIC Fund positions, NDB co-invest rounds) so the grant
--   channel can exclude them and the equity signal is queryable.
--
-- ── Why this file arrived eighteen migrations late ─────────────────────────
-- 008 was the one migration in this directory that existed only as Python
-- inside apply.py. Nothing except apply.py reads a migration's Python, so every
-- tool and every person that asked "what does committed DDL create" got an
-- answer with public_equity_stakes.via_fund and public_funding_events.
-- instrument_class missing from it, and both columns looked like ALTERs
-- somebody had typed by hand against a live database. They were not. They were
-- a migration nobody could see.
--
-- The DDL now lives here ONCE and apply_008 executes this file. It is not
-- restated in Python: two copies of a CREATE TABLE carrying CHECK constraints
-- is the "keep these in sync" comment that has already produced three real
-- defects in this repo.

CREATE TABLE IF NOT EXISTS public_equity_stakes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL REFERENCES companies(id),
    holder TEXT NOT NULL,
    holder_type TEXT NOT NULL CHECK (holder_type IN (
        'eu_instrument','ndb','state_vc','regional_agency',
        'sovereign_fund','other')),
    stake_pct_min REAL,
    stake_pct_max REAL,
    ticket_eur REAL,
    as_of DATE,
    first_seen DATE,
    exited INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL,
    raw_source_url TEXT,
    disclosure_level TEXT NOT NULL CHECK (disclosure_level IN (
        'name_only','pct_range','pct_exact','amount')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (company_id, holder, source, as_of)
);
CREATE INDEX IF NOT EXISTS idx_pes_company ON public_equity_stakes(company_id);
CREATE INDEX IF NOT EXISTS idx_pes_holder ON public_equity_stakes(holder);
CREATE INDEX IF NOT EXISTS idx_pes_disclosure
  ON public_equity_stakes(disclosure_level);

-- via_fund (2026-06-11, PFR extraction): NULL = direct holding by the
-- institution; non-NULL = look-through LP exposure via the named private fund
-- (PFR Ventures publishes its full look-through portfolio -- unique among
-- European FoFs). Look-through stakes NEVER compare with direct ones, which is
-- why this is a column rather than a flag.
ALTER TABLE public_equity_stakes ADD COLUMN via_fund TEXT;

ALTER TABLE public_funding_events ADD COLUMN instrument_class TEXT;
CREATE INDEX IF NOT EXISTS idx_pfe_instrument_class
  ON public_funding_events(instrument_class) WHERE instrument_class IS NOT NULL;
