// THE single source of truth for every corpus-wide figure shown on the site.
//
// Any page that states "X companies / Y events / €Z committed" MUST read it
// from here — never from investor_insights.json, companies_index.json, or a
// literal. There is one definition of each figure
// (website/build/lib/corpus_kpis.py), and the build guardrail in
// build_site_data.py fails if any generated file disagrees with it. This is why
// the home page, the nav, the footer and /about-public-capital always show the
// same number.
//
// ── What changed, and why this is now async ────────────────────────────────
// It used to be `import synthesis from "@/public/data/synthesis.json"` and a
// module-level const: a committed artifact, frozen until a human regenerated
// and pushed it. The ETL refreshed Railway weekly and the site did not follow —
// median 4.6 days behind, worst 32.4.
//
// It now reads the ETL's own record of its corpus (`corpus_census`) at render
// time, and falls back to that same artifact when the record is unreadable or
// when the coverage gate has not passed the corpus it describes. The figures
// therefore follow the database on their own, and a corpus that got worse still
// cannot reach a founder by being fresher.
//
// The cost of that is a promise: this is a SERVER-side read. A "use client"
// component cannot call it and must be handed the numbers as props — see
// components/nav-bar.tsx, which used to import the const directly.
//
// See lib/corpusFigures.ts for the source-of-record reasoning and
// lib/corpusCensus.ts for what makes a reading admissible.

import { cache } from "react";
import { readCorpusFigures } from "@/lib/corpusFigures";

export type { Synthesis, CorpusFigures, CorpusProvenance } from "@/lib/corpusFigures";
export { CORPUS_REVALIDATE_SECONDS, corpusAsOf } from "@/lib/corpusFigures";

/**
 * The corpus figures for this render.
 *
 * Wrapped in React's `cache()` so the layout, the nav and the page share ONE
 * read per render rather than opening three connections to say the same thing —
 * and, more importantly, so they cannot disagree. Three independent reads
 * spanning a census write would put two different company counts in the
 * masthead and the footer of one page, which is exactly the class of defect the
 * "single source of truth" rule above exists to prevent. Deduplicating per
 * render restores that guarantee across an async source.
 */
export const corpusStats = cache(readCorpusFigures);
