// The two named awards the site cites by name, in one place.
//
// ── Why these are literals, and why that is not the defect ─────────────────
// Both were checked against `data/db.sqlite` while wiring the rest of the
// site's numbers to the corpus:
//
//   STEGRA AB   companies#3013   innovation_fund_lsp_2022   EUR 250,000,000
//   Cellforce   companies#2247   satr_de_rnd_2021           EUR  56,718,406
//
// They are CLOSED awards from 2021 and 2022. Unlike a company count or a
// channel share, they cannot move when the corpus is refreshed — the figure a
// founder reads next year is the same figure, because the award finished. A
// builder that produced them would have to name two companies to do it, which
// is the patch shape this repo has a standing rule against, and would protect
// two numbers that have nothing to protect them from.
//
// ── What WAS the defect ────────────────────────────────────────────────────
// They existed twice, as independently maintained strings: once in
// `components/funding-ladder.tsx` and once in `app/about-public-capital/page.tsx`.
// A "keep in sync" pair with no mechanism is the bug, not the risk of one. One
// definition, imported by both, is the fix.
//
// ── Why its own module ─────────────────────────────────────────────────────
// `funding-ladder.tsx` is "use client". `lib/corpusProse.ts`, where the derived
// prose figures live, statically imports investor_insights.json and
// country_map.json — roughly 700 KB that must never reach a browser bundle.
// A leaf module with no imports at all can be shared by both sides; this is the
// same pattern `check_client_boundary.ts` documents for the server-only chain.

/** Values as PROSE, not as numbers: the sentence writes "EUR 250m", and a
 *  formatter that turned 250_000_000 into that string would be a third
 *  euro-formatting rule alongside `fmtEur` and `helpers.fmt_eur`. */
export const VERIFIED_AWARDS = {
  /** corpus: companies#3013 STEGRA AB · innovation_fund_lsp_2022 · EUR 250,000,000 */
  stegraInnovationFund: "EUR 250m",
  /** corpus: companies#2247 Cellforce · satr_de_rnd_2021 · EUR 56,718,406 */
  cellforceBatteryAid: "EUR 57m",
  /** corpus: SELECT DISTINCT source_family FROM v_events WHERE company_id IN
   *  (SELECT id FROM companies WHERE lower(canonical_name) LIKE
   *  '%multiverse computing%')  →  8 families (chips_ju, edf, eic, eit,
   *  horizon_eu_partnership, horizon_eu_pillar_ii, national_dev_banks,
   *  state_aid_satr).
   *
   *  The one figure here that CAN move: unlike the two closed awards above,
   *  a live company can win from a ninth channel. It is annotated with the
   *  query rather than derived because deriving it needs a builder that names
   *  a company, and because a stale "eight" is a smaller wrong than the
   *  per-company rule would be. Re-run the query when the copy is next
   *  revised. */
  multiverseChannels: 8,
} as const;
