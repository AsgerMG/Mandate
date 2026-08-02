-- What the Commission's register says about a notified scheme's LIFETIME.
--
-- The corpus judged whether a fund was still open from award recency, and that
-- is systematically wrong for state aid: payments continue for years after a
-- scheme closes to new applicants. Measured against the register, 220 of 453
-- SATR children sit under a scheme whose measure end date has passed, and 130
-- of them still looked current because they had a 2024 or 2025 award.
-- "Italy - Support to electricity from renewable sources" ended 2021-12-30.
--
-- Sending a founder to apply to a scheme that closed three years ago costs them
-- real time, so these are removed from what a brief may PROPOSE. They stay in
-- the corpus: a closed scheme is still evidence of what a country funded and
-- who received it, which is what the peer tracing runs on.
--
-- successor_scheme is the linked case that is still running, where one exists
-- (40 of the 220). GBER schemes are routinely prolonged under a new SA number,
-- so "ended" often means "superseded" rather than "gone", and saying which is
-- the difference between a dead end and a redirection.
ALTER TABLE funding_instruments ADD COLUMN scheme_end_date TEXT;
ALTER TABLE funding_instruments ADD COLUMN successor_scheme TEXT;
ALTER TABLE funding_instruments ADD COLUMN successor_title TEXT;
