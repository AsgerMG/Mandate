-- What an instrument typically GIVES.
--
-- total_eur says how big the scheme is. It says nothing about what a company
-- like this one would receive, and the difference is the whole question: the
-- corpus spans EUR 16k at p10 to EUR 1.1M at p90, so "you may be eligible"
-- without a number is close to useless advice.
--
-- Percentiles rather than a mean, because public funding is heavily skewed --
-- one IPCEI tranche drags an average to a figure no applicant ever received.
-- award_n travels with them so nothing can quote a median without knowing how
-- many real awards it rests on.
--
-- 92% of events already carry an amount. This records what was always
-- derivable and never derived.
ALTER TABLE funding_instruments ADD COLUMN award_p25 REAL;
ALTER TABLE funding_instruments ADD COLUMN award_p50 REAL;
ALTER TABLE funding_instruments ADD COLUMN award_p75 REAL;
ALTER TABLE funding_instruments ADD COLUMN award_n INTEGER NOT NULL DEFAULT 0;
