-- 034: which grounded source each eligibility gate and clause cites.
--
-- A gate has cited its source as `source_file` -- a filename on one laptop, or a
-- URL with no date -- since it was written. The source itself now lives in the
-- shared append-only schema `grounding` (mandate/db/grounding.sql): the original
-- bytes in the bucket by sha256, the extracted text, and every date it was
-- fetched. This table says, for each gate or clause, which grounding version it
-- cites and, where the quote was found in that version's text, exactly where.
--
-- Keyed on the NATURAL key (source_type, instrument_id, source_key), the same as
-- eligibility_embeddings and for the same reason: the gate tables' surrogate ids
-- were re-issued by every truncate-and-reload publish.
--
--   method  'quote_located'  the gate's quote IS version.text[char_start:char_end]
--                            (whitespace-insensitive); cite() reproduces it.
--           'file_only'      the named file, but the quote is not in its
--                            extracted text (a scanned PDF, an extractor that
--                            reflowed the words). Weaker, and labelled so.
--           'url_fetched'    the gate named a URL; the page was fetched later and
--                            the quote found in it.
--
-- INSERT-ONLY by use: a better link is a new row (a later linked_at), never an
-- edit of the old one. No foreign key into grounding on purpose: the cron applies
-- forward migrations unattended, and a cross-schema FK would make the capital
-- cron's first step depend on another schema's deploy order. Integrity is
-- checked by the script that writes the rows
-- (mandate/grounding/migrations/capital_sources_to_grounding.py), and grounding
-- rows cannot disappear (append-only), so a link that was valid stays valid.
CREATE TABLE IF NOT EXISTS eligibility_grounding (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_type           TEXT NOT NULL CHECK (source_type IN ('gate', 'clause')),
    instrument_id         TEXT NOT NULL,
    -- gate: eligibility_gates.gate_key. clause: clause_type || '::' || clause_key.
    source_key            TEXT NOT NULL,
    grounding_version_id  BIGINT NOT NULL,
    char_start            INTEGER,
    char_end              INTEGER,
    method                TEXT NOT NULL CHECK (method IN ('quote_located', 'file_only', 'url_fetched')),
    -- the source_file value this link was resolved from, verbatim
    source_file           TEXT,
    linked_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    linked_by             TEXT NOT NULL DEFAULT current_user,
    CHECK ((char_start IS NULL) = (char_end IS NULL)),
    CHECK (method <> 'quote_located' OR char_start IS NOT NULL),
    UNIQUE (source_type, instrument_id, source_key, grounding_version_id)
);
CREATE INDEX IF NOT EXISTS idx_egr_instrument ON eligibility_grounding(instrument_id);
CREATE INDEX IF NOT EXISTS idx_egr_version ON eligibility_grounding(grounding_version_id);
