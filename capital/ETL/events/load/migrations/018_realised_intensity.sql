-- What share of a project this instrument actually paid, measured.
--
-- Aid intensity is the structuring question -- how much of this can be public
-- money -- and it exists in fund documents as prose ("50% of eligible costs").
-- Extracting that prose needs a model. This does not: 76,364 events carry both
-- a grant and a total project cost, so for instruments with enough of them the
-- realised rate can be computed from what recipients were really paid.
--
-- Measured rather than declared, which is the stronger evidence of the two:
-- Bpifrance's documents say roughly 45% and its awards say 45%.
--
-- intensity_n travels with it so nothing can quote a rate without knowing how
-- many projects stand behind it.
ALTER TABLE funding_instruments ADD COLUMN intensity_p50 REAL;
ALTER TABLE funding_instruments ADD COLUMN intensity_n INTEGER NOT NULL DEFAULT 0;
