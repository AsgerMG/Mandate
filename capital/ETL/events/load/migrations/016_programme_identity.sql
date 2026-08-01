-- The substream level: which PROGRAMME an award was made under.
--
-- A founder does not apply to "ADEME". They apply to "Tremplin pour la
-- transition ecologique des PME". The raw registers carry that distinction and
-- the loaders discarded it, collapsing 473 named ADEME programmes into one row
-- with a single EUR 20,000 median, and 6,345 Vinnova awards into another.
--
--   programme_ref   the source's own identifier, where it has one
--                   (Vinnova DiarienummerProgram, CDTI idConvocatoria)
--   programme_name  the source's own NAME for it, where it publishes one
--                   (ADEME dispositifAide). Never synthesised: a child named
--                   "2009-02199" is worse than no child, and a name invented
--                   from the project titles underneath it invents a programme.
--
-- Carried mechanically here, with no interpretation. Splitting instruments on
-- it is a separate step that can be reverted without losing the data.
ALTER TABLE public_funding_events ADD COLUMN programme_ref TEXT;
ALTER TABLE public_funding_events ADD COLUMN programme_name TEXT;
CREATE INDEX IF NOT EXISTS idx_pfe_programme
    ON public_funding_events (source, programme_name);
