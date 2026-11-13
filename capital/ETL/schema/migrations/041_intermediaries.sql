-- 041: the INTERMEDIARIES layer -- which banks, lessors, guarantee institutions and funds
-- already carry EU (EIF / InvestEU) or national fund-of-funds backing, in which market, for
-- which product, cited.
--
-- WHY. A senior does not stop at "InvestEU exists": the money reaches a company through a
-- named lender, lessor or fund that has signed with the EIF (or with KfW Capital), and the
-- first question is whether the company's OWN bank is one of them (playbook
-- mandate/playbooks/funding-routes.md: follow public money through its channels). Until now
-- that was a live web search every time. This table makes it a lookup Wincent's
-- find_intermediaries tool reads, with the line of the EIF or KfW Capital list that says so.
--
--   intermediaries   one row per (intermediary, backing), market = ISO2 of the intermediary's
--                    country as the publishing list gives it ('EU' for the implementing
--                    partner itself; 'UK' for a UK-based manager in a national fund-of-funds).
--
-- CITATIONS: jsonb arrays of {sha256, quote, char_start, char_end, url, located}, exactly as
-- migration 039: the grounding version by sha256 and the span of the quote located by
-- mandate.grounding.store.locate. No FK into grounding (034's reason); the loader,
-- capital/ETL/terms/load_batch_eifo_investeu.py, checks every span before it writes.
--
-- `backing_detail` is the publishing list's own figures per programme line:
-- [{programme, support, currency, amount}], as of `as_of` (the list's date). A list is a
-- snapshot: a newer list is loaded as NEW rows under a new batch, never by editing these.
--
-- INSERT-ONLY, enforced by the same trigger function as 039 (re-declared here so this file
-- applies on its own).

CREATE TABLE IF NOT EXISTS intermediaries (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    key             TEXT NOT NULL UNIQUE CHECK (key ~ '^[a-z0-9_.]+$'),
    market          TEXT NOT NULL CHECK (market ~ '^[A-Z]{2}$'),
    name            TEXT NOT NULL,
    kind            TEXT NOT NULL CHECK (kind IN ('bank', 'lessor', 'specialised_lender', 'guarantee_institution',
                                                   'promotional_bank', 'fund', 'fund_manager', 'implementing_partner')),
    product_types   TEXT[] NOT NULL CHECK (product_types <@ ARRAY['loan', 'lease', 'guarantee', 'equity']::text[]
                                           AND cardinality(product_types) >= 1),
    backing         TEXT NOT NULL CHECK (backing IN ('eif_investeu_guarantee', 'eif_investeu_equity',
                                                     'kfw_capital_fund_of_funds', 'investeu_implementing_partner')),
    backing_detail  JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(backing_detail) = 'array'),
    as_of           DATE,
    website         TEXT,
    note            TEXT,
    citations       JSONB NOT NULL CHECK (jsonb_typeof(citations) = 'array' AND jsonb_array_length(citations) >= 1),
    batch           TEXT NOT NULL,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    recorded_by     TEXT NOT NULL DEFAULT current_user
);
CREATE INDEX IF NOT EXISTS idx_int_market ON intermediaries(market);
CREATE INDEX IF NOT EXISTS idx_int_products ON intermediaries USING gin (product_types);

CREATE OR REPLACE FUNCTION refuse_status_layer_rewrite() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '%.% is insert-only: % refused. A correction is a new row.',
    TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;

DROP TRIGGER IF EXISTS insert_only ON intermediaries;
CREATE TRIGGER insert_only BEFORE UPDATE OR DELETE ON intermediaries
    FOR EACH ROW EXECUTE FUNCTION refuse_status_layer_rewrite();
