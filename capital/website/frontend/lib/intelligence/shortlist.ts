// Which funds are even candidates for this founder.
//
// Split out of pipeline.ts, which had grown to 2,544 lines holding six
// responsibilities. This is the cohesive half that BOTH entry points share:
// the model-free verdict path (computeVerdict) and the full memo path
// (runIntelligence) each need a candidate shortlist before they diverge, and
// the two sat 1,200 lines apart in the same file sharing helpers by proximity
// rather than by contract.
//
// That distance had a cost: a regression that blanked every source citation on
// the fast path went unnoticed precisely because the two paths were far enough
// apart that changing one did not visibly touch the other.
//
// The boundary is deliberate — WHICH FUNDS QUALIFY lives here; HOW THE MEMO IS
// WRITTEN stays in pipeline.ts. Nothing in this file makes a model call.
import { readFileSync } from "fs";
import path from "path";
import { regionNameFor } from "./regions.generated";
import { recipientsIn } from "./regionPrior";
import { hydrateGatesFor } from "./corpus";
import { assessInstrument, isAttributable, isCited } from "./verdict";
import { loadDbInstruments, loadFundSnapshot, publishableInstruments, suppressedForUnconfirmedLiveness, toIso2, type DbInstrument } from "./corpus";
import { themeRelevance, thematicChannelTopUp, RELEVANCE_FLOOR } from "./relevance";
import { semanticSeparation } from "./semantic";
import { TICKET_BANDS } from "./types";
import type { EligibilityAnswers } from "./types";
import type { FounderFit, InstrumentRow, ProfileSignal } from "./types";
import type { ExclusionLog } from "./exclusions";
import { accessMode, passesCapitalPreference } from "./accessMode";
import { sectorFit } from "./fit";
import { NOT_AN_APPLYABLE_BODY } from "./briefChecks";
import { resolveNameCollisions } from "./nameCollision";

/** How many leaves a channel may put into the POOL, as opposed to the table.
 *
 *  The cap above exists so one channel cannot dominate the six rows a founder
 *  reads. It was also, accidentally, deciding what the ranker was allowed to
 *  CONSIDER -- and `state_aid_satr` holds 453 leaves, `national_dev_banks` 178.
 *  A French founder has 50 national R&D schemes and four could reach the pool,
 *  so the scheme they actually won was usually eliminated before anything
 *  ranked it. Measured on real recipients: pool recall 27%, and the misses were
 *  almost entirely SATR children.
 *
 *  Consideration and display are now separate concerns. The pool is wide, the
 *  global row sort decides, and DISPLAY_CAP still governs what is shown. */
// Measured on holdout, profile mode -- the national-scheme founder, 84% of the
// corpus. This cap, not ranking, was the single largest loss in the product:
//
//   cap   pool   EXACT@5
//    14    57%     15%     <- shipped for months
//    25    83%     14%
//    40    95%     13%
//    60    97%     14%
//
// A German founder has 116 sibling schemes under one regime; at 14 the fund
// they actually won was cut before ranking ever saw it 43% of the time, and
// `SEL-LEAF-CAP` accounted for 38 of 42 pool misses. Five ranking experiments
// in one session moved nothing because they were reordering a set that did not
// contain the answer.
//
// EXACT@5 is flat across the sweep, which is the honest reading: this fixes
// what the WRITER can see, not what the table shows. Those are different jobs
// -- the pool is a correctness floor, the top five is the ranking problem --
// and conflating them is what hid this for so long.
//
// ── IT HAS DONE THIS TWICE. IT IS GUARDED NOW. ────────────────────────────
// The sweep above chose 40. 40 then became binding again as the corpus widened,
// exactly as 14 had, and cost pool recall 81% -> 98% to undo (82df320). Twice,
// the same constant, the same silent mechanism: a fund cut HERE is absent from
// the pool, so every ranking diagnostic downstream reports a healthy ordering
// over a set that no longer contains the answer.
//
// It cannot do it a third time quietly. `scripts/check_leaf_cap.ts` runs in
// `npm run check` and FAILS the build when any (channel, country) group holds
// more country-serving leaves than this number. The reasoning is in
// `lib/intelligence/leafCap.ts`; the test proves the guard fires at both 40 and
// 14, i.e. it would have caught both real occurrences.
//
// ── IT DID IT A THIRD TIME, AND THIS TIME THE GUARD CAUGHT IT ─────────────
// 90 was chosen on 2026-08-06 against a widest group of 87 (`state_aid_satr`,
// ES). HEADROOM WAS THREE INSTRUMENTS. Within a day `state_aid_satr` in DE
// stood at 103 -- 13 candidates cut before the ranker scored them, for every
// German founder -- and `check_leaf_cap` went red. That is the first time this
// constant has been CAUGHT rather than discovered months later, and it is the
// only reason the raise below could be priced instead of guessed at.
//
// ── What the raise actually bought: NOTHING, and that is the finding ──────
// Holdout, three seeds, 250 pairs each, Postgres (1,076 instruments), same
// sample, one constant moved. Caps 90 / 103 / 250 produce BYTE-IDENTICAL
// output on every metric and every stratum -- aggregate, mode, population,
// regime size, and founder country:
//
//   seed        in pool   EXACT@5   REGIME@5   CHANNEL@5
//   20260806    239/250    71/250    208/250     217/250
//   7           241/250    83/250    212/250     219/250
//   99          242/250    75/250    212/250     218/250
//
// The reason is a SECOND collapse, downstream of this one and much stronger:
// the one-row-per-institution-name dedupe at the end of buildInstrumentTable.
// A German founder's pool holds 81 `satr_de` rows out of 103 publishable
// leaves, at EVERY cap from 90 upward -- so it is the dedupe, not this cap,
// that decides how many German siblings reach the ranker today. The 13 leaves
// this cap was cutting render under institution names already present and lose
// the dedupe's tie-break (own encoded rules), so they never reached the pool
// either way. That is a fact about today's corpus, not a structural guarantee:
// a load whose leaves carry their OWN encoded gates would win those tie-breaks
// and would reach the pool only if the cap let them through.
//
// So this raise is insurance, not a gain, and it is priced as insurance.
//
// ── Why 250, and not 104 ──────────────────────────────────────────────────
// All three previous values were chosen to clear the widest PUBLISHABLE group
// at the moment of choosing. All three were consumed; 90 lasted a day.
// Choosing 104 would be the same decision a fourth time.
//
// The quantity to clear is not the publishable count, because publishability
// moves with no data load at all: every leaf already in the database is one
// liveness repair or one data-floor fix away from being proposable, and those
// repairs are ordinary weekly work. Read from Postgres 2026-08-07 with
// `scripts/probe_leafcap_ceiling.ts`:
//
//   channel / country        publishable   leaves already in corpus
//   state_aid_satr  ES                87                        165
//   state_aid_satr  DE               103                        116
//   state_aid_satr  IT                67                         85
//   national_dev_banks  FR            73                         81
//
// Spain is 87 today and 165 without one new row being loaded. The ceiling to
// clear is therefore 165, and 250 is that with half again on top -- headroom
// stated as a multiple, so the next person can see what it was meant to absorb.
//
// ── What it costs, measured rather than assumed ───────────────────────────
// Earlier values were chosen tight because the payload cost was unknown and
// `check_payload_budget.ts` was believed to bound it. It did not; it measured
// phase one, which does not depend on this constant. It now measures phase two
// and prints the answer on every run. Removing this cap ENTIRELY costs 45 KB of
// worst-case per-request payload: 3.92 MB to 3.97 MB against an 8 MB budget.
// Payload is not what this number trades against.
//
// ── It is still a ceiling, not a surrender ────────────────────────────────
// 250 is reachable. Spain's BDNS register holds 647,047 convocatorias and is
// being loaded from; a group crossing 250 is a real event and this check will
// fire on it. What it will not do is fire on a Tuesday because eight Spanish
// deadlines were corrected -- and a guard that cries wolf on routine
// maintenance gets bumped by one and forgotten, which is the failure mode that
// produced 90.
export const POOL_LEAVES_PER_CHANNEL = 250;
/** Share of the ranking score from thematic match; the rest is sector intake. */
export const THEME_WEIGHT = 0.6;
/** Weight on thematic match in the ROW sort when a thematic signal exists at
 *  all. Higher than THEME_WEIGHT because by this point the leaf ranking has
 *  already applied sector fit within each channel; sector's job here is to break
 *  ties, not to compete with a description the founder actually wrote. */
export const THEME_DOMINANT_WEIGHT = 0.85;
/** Share of channel ordering taken from the empirical prior rather than from
 *  thematic fit. Half: the prior says where money is won, fit says what this
 *  founder builds, and a table that ignores either is wrong in a different way. */
export const PRIOR_WEIGHT = 0.5;
/** How peaked the RAW similarities must be before the description is treated as
 *  separating the funds. Below it the text scores everything alike and carries
 *  no ordering information, whatever its length.
 *
 *  Read by `semanticSeparation`, which is the SKEWNESS of the cosine
 *  similarities before percentile normalisation (semantic.ts). It used to be
 *  `max/mean - 1` read against the NORMALISED scores, where it could never fire.
 *
 *  0.20, and the honest reason it is not the empirical optimum: measured over
 *  296 holdout rows the canned population has a maximum skewness of 0.213 and
 *  putting the threshold at 0.25 classifies all of them correctly -- but that
 *  population contains only ELEVEN distinct strings, one per sector, so a
 *  threshold tuned to sit just above their maximum is fitted to eleven points.
 *  0.20 sits inside the interval where the trade is flat (real 52% / canned 4%
 *  at 0.20, 51% / 0% at 0.25, 64% / 19% at 0.15) and does not pretend to a
 *  precision eleven negatives cannot support. The measurement that decides this
 *  is EXACT@5 and REGIME@5, not the label accuracy. */
export const THEME_SPREAD_FLOOR = 0.20;
// PRIOR_WEIGHT_WITH_TEXT (0.15) and PRIOR_WEIGHT_WITHOUT_TEXT (0.6) stood here,
// documented, exported and never read by anything. The weighting they describe
// was tried and rejected -- the measurement survives in the comment inside
// `rowRelevance`, which is where a future attempt would start. A constant no
// code reads is not a record of a decision; it is a claim that the code behaves
// in a way it does not.

interface ChannelPrior {
  global: Record<string, number>;
  byCountry: Record<string, Record<string, number>>;
  byCountrySector: Record<string, Record<string, number>>;
}
let priorCache: ChannelPrior | undefined;
/** P(channel | country, sector), backing off to country then global. Thin cells
 *  are absent from the artifact by construction, so the back-off is what keeps
 *  the prior from memorising noise. */
// How far a matching objective may lift a row, in the multiplicative blend.
// The counter-weight is NOT a second constant: it is solved per founder so the
// signal is neutral across the group that carries objectives at all (below).
const OBJECTIVE_MATCH = 1.35;

// How far the founder's own region may reorder a set of siblings.
//
// Larger than OBJECTIVE_MATCH and AWARD_MATCH on purpose, and this is the only
// place in the file where one signal is deliberately allowed to dominate the
// others. Where a fund's recipients are is the single strongest discriminator
// the corpus holds for same-name siblings -- 66.2% @1 against a 22.4% uniform
// baseline, where the registered objective and the award median are identical
// across the whole group by construction: they are one notified scheme, so
// they were notified under one article and pay one kind of cheque. When region
// has something to say here, nothing else does.
const REGION_MATCH = 1.9;

/** Rank siblings by whether this founder's region is where the fund's money
 *  has actually gone.
 *
 *  ── Why this is not more gates ───────────────────────────────────────────
 *  The gate-based attempt at region measured flat, and the audit says why:
 *  only 148 of 958 instruments carry a `region_within` rule and the groups
 *  that need it most have none — ademe 0/75, vinnova 0/49, satr_fr_rnd 0/42.
 *  This asks award history instead, exactly as the peer prior does one level
 *  up, so it needs no encoding at all (ETL/terms/emit_region_prior.py).
 *
 *  ── The direction of the question ────────────────────────────────────────
 *  P(fund | region) — the COUNT of a leaf's recipients in the founder's
 *  region — not that count as a share of the leaf's own size. The share form
 *  is the same inversion `sectorFit` makes, and it measures worse here too
 *  (54.3% @1 against 65.7% on the same rows). A national body that placed 150
 *  awards in Normandy IS a better answer for a Normandy founder than a
 *  regional body that placed 42, and the ground truth agrees.
 *
 *  Containment is `regionsOverlap`, not string equality: the register reports
 *  recipients at NUTS-3 and a founder answers at NUTS-1 or 2, so FRD1 must
 *  satisfy a founder in FRD.
 *
 *  ── The comparison is inside ONE NOTIFIED SCHEME, never across a channel ──
 *  This is the constraint that makes the signal safe, and it is the same one
 *  `objectiveScorer` and the sector posterior both needed. Region says
 *  something precise about leaves that share a registration — they are one
 *  scheme delivered by many bodies, so their text, their article and their
 *  cheque size are identical and location is all that is left. Across a whole
 *  channel it says something much cruder: "which of the country's forty
 *  schemes has paid most into this region", which is a size prior wearing a
 *  geography costume, and the largest national bodies win it everywhere. Every
 *  attempt to apply one of these signals channel-wide has cost points (the
 *  objective prior, 21; the sector posterior, 2), so this one never leaves its
 *  scheme. A leaf that shares its registration with nobody here scores 1.
 *
 *  Returns 1.0 for a leaf with no recorded footprint, so a gap in the register
 *  is never read as an absence of recipients — the same treatment `awardScorer`
 *  gives the 98 funds with no award median. And returns neutral for a group in
 *  which no leaf has any recipient in the founder's region, because a signal
 *  that cannot separate those candidates must not reorder them. */
export function regionScorer(
  leaves: DbInstrument[], region?: string,
): (i: DbInstrument) => number {
  const neutral = () => 1;
  if (!region) return neutral;
  // The NOTIFIED SCHEME is the unit of comparison. `schemeCode` is that
  // registration — the SA number the corpus splits a regime on, and what the
  // 119 same-name leaves share with their siblings.
  //
  // Widening it to "same display name in the same country" was tried, because
  // that is literally the group a founder cannot tell apart on the page: one
  // national R&D framework registered twice puts fourteen leaves and nine more
  // under one name, and by scheme code alone the two halves are never compared.
  // It measures WORSE — within-group @1 fell 44.2% to 40.1%, and on the groups
  // of three to five that it actually changed, 65.5% to 43.1%. Two
  // registrations of one regime really are two schemes with two sets of
  // delivery bodies, and merging them puts a body in competition with awards it
  // could never have signed. Reverted; recorded so it is not retried.
  //
  // WIDENING TO THE REGIME WAS TRIED AND IT COSTS POINTS. Recorded here with
  // the scheme-name attempt above, because the case for it looks strong on
  // reach alone and it will be proposed again. Only 95 of 807 publishable
  // leaves share a scheme code with a sibling, so this scoping can separate
  // just 224 of 2,150 graded pairs -- 33 rows of the 300 the headline is
  // computed on, which is the real reason a signal measured at 66.2% @1 prints
  // bit-identical totals (`scripts/diagnose_region_reach.ts`). Scoped to the
  // regime it would reach 927 pairs, 131 of those 300: four times the reach.
  //
  // Measured anyway, holdout N=300, three seeds, ANSWERS=real, gate fit on:
  //
  //     scheme-scoped (ships)   EXACT@5   92 / 96 / 98
  //     regime-scoped           EXACT@5   85 / 92 / 96
  //
  // Worse on every seed, and worst in the markets region was supposed to serve
  // (DE 48 -> 42, 48 -> 43, 41 -> 35). A regime can hold a hundred leaves, and
  // at that width "which body has paid most into this region" stops being
  // geography and becomes a size prior -- the same failure that cost the
  // objective prior 21 points and the sector posterior 2. The narrow reach is
  // a fact about the CORPUS, not a defect in this function: the way to make
  // region matter more is for more leaves to carry a resolvable notified
  // scheme, which is collection work, not ranking work.
  const byScheme = new Map<string, DbInstrument[]>();
  for (const l of leaves) {
    const code = (l.schemeCode ?? "").trim();
    if (!code) continue;
    (byScheme.get(code) ?? byScheme.set(code, []).get(code)!).push(l);
  }
  const score = new Map<string, number>();
  for (const group of byScheme.values()) {
    if (group.length < 2) continue;
    const here = new Map<string, number>();
    for (const l of group) {
      const n = recipientsIn(l.id, region);
      if (n !== undefined) here.set(l.id, n);
    }
    const known = [...here.values()];
    // Nobody in this scheme has ever paid into the founder's region, or
    // everyone has to the same degree: either way it separates nothing.
    if (known.length < 2 || !known.some((n) => n > 0)) continue;
    const lo = Math.min(...known), hi = Math.max(...known);
    if (hi === lo) continue;
    // Counts within one scheme span four orders of magnitude — the French RDI
    // regime runs from 37 awards to 4,434 — so the multiplier sits on the log,
    // and then on the group's own range rather than on an absolute scale. A
    // leaf's score therefore says where it sits among the bodies delivering
    // ITS scheme, which is the only comparison being made.
    const lg = (n: number) => Math.log1p(n);
    const span = lg(hi) - lg(lo);
    for (const [id, n] of here) {
      score.set(id, Math.pow(REGION_MATCH, 2 * ((lg(n) - lg(lo)) / span) - 1));
    }
  }
  if (!score.size) return neutral;
  return (i: DbInstrument) => score.get(i.id) ?? 1;
}

// How far a founder's fit against a leaf's OWN encoded rules may reorder its
// regime. Sized like OBJECTIVE_MATCH rather than REGION_MATCH: unlike region,
// this signal is available on most groups, and one that speaks often must
// speak more quietly than one that speaks rarely and decisively.
const GATE_MATCH = 1.35;

/** Rank siblings by whether this founder actually CLEARS each leaf's rules.
 *
 *  ── Why this is worth having when 'gates do not rank' was already measured ─
 *  That verdict — won fund 62% pass against pool 63% — was taken on a harness
 *  that fed every replayed founder IDENTICAL intake answers. A rule can only
 *  separate two founders who differ, so the measurement had no signal to find.
 *  Re-measured with per-founder answers (`scripts/measure_gate_separation.ts`,
 *  ANSWERS=): within-regime top-1 rises from 4.7% to 9.3% against an unchanged
 *  4.8% uniform baseline, and from 1.5% to 7.5% in regimes of 51+ leaves,
 *  which is where the leaf choice actually binds.
 *
 *  ── Pass RATE, deliberately, and never the count of rules checked ─────────
 *  83% of gates are inherited from the regime and only 22% of decidable
 *  filters are a leaf's own, so the leaves that differ from their siblings
 *  differ largely in how much has been ENCODED about them — and the
 *  best-documented leaf of a regime is also the one most companies win. That
 *  makes "how many rules could we check" a size prior in disguise. Measured as
 *  a null model (`FIT=checked`): +0.5pp against uniform, where the pass-rate
 *  form gets +4.5pp. So the count is excluded from the score even though it
 *  correlates with the answer, and only the SHARE the founder clears is used.
 *
 *  ── Scoped to the REGIME, never across a channel ──────────────────────────
 *  The same constraint `regionScorer` and `objectiveScorer` are held to, for
 *  the same measured reason: applied channel-wide these become priors over
 *  which programme is biggest, and every attempt at that has cost points. A
 *  leaf alone in its regime here scores 1.
 *
 *  Returns neutral for a leaf whose rules could not be evaluated at all, and
 *  for a group whose leaves all fit identically — which is 68% of multi-leaf
 *  regimes, because their leaves inherit one rule set and are therefore
 *  genuinely indistinguishable this way. A signal that cannot separate its
 *  candidates must not reorder them. */
export function gateFitScorer(
  leaves: DbInstrument[], answers?: EligibilityAnswers,
): (i: DbInstrument) => number {
  // TEMPORARY, WS-AW. Three designs for what a rule should do for a fund with
  // no siblings, differing ONLY in scope -- every arm uses GATE_MATCH at the
  // same strength, so a difference between them is attributable to the design
  // and not to a tuning constant. Removed once measured; the winner ships
  // unconditionally.
  //
  //   regime  shipped: rank inside a regime, skip a group of one
  //   pool    rank across the whole channel the caller handed us
  //   both    regime as shipped, times a second ABSOLUTE term on the leaf's
  //           own pass rate, which is the only term a standalone leaf gets
  const scope = process.env.GATE_SCOPE ?? "regime";
  const neutral = () => 1;
  if (!answers) return neutral;
  // Assessed once per leaf, not once per group: `both` reads the same numbers
  // twice and two assessments of one leaf that could disagree would be a bug
  // waiting rather than a saving.
  const fitAll = new Map<string, number>();
  for (const l of leaves) {
    const a = assessInstrument(l, answers);
    // Nothing decidable about this leaf: a gap in our encoding, never
    // evidence that the founder fails. Same treatment awardScorer gives a
    // fund with no recorded award median.
    if (a.checked > 0) fitAll.set(l.id, a.passed / a.checked);
  }
  const byRegime = new Map<string, DbInstrument[]>();
  for (const l of leaves) {
    const r = (l as { parentId?: string }).parentId ?? l.id;
    (byRegime.get(r) ?? byRegime.set(r, []).get(r)!).push(l);
  }
  const score = new Map<string, number>();
  const groups = scope === "pool" ? [leaves] : [...byRegime.values()];
  for (const group of groups) {
    if (group.length < 2) continue;
    const fit = new Map<string, number>();
    for (const l of group) {
      const f = fitAll.get(l.id);
      if (f !== undefined) fit.set(l.id, f);
    }
    const known = [...fit.values()];
    if (known.length < 2) continue;
    const lo = Math.min(...known), hi = Math.max(...known);
    if (hi === lo) continue;
    for (const [id, f] of fit) {
      score.set(id, Math.pow(GATE_MATCH, 2 * ((f - lo) / (hi - lo)) - 1));
    }
  }
  // The absolute term. No group, no normalisation: 100% of a fund's own rules
  // cleared is GATE_MATCH and 0% is 1/GATE_MATCH, whatever else is on the
  // table. A leaf with nothing encoded stays at 1 and is neither rewarded nor
  // punished, exactly as in the relative term.
  if (scope === "both") {
    for (const [id, f] of fitAll) {
      score.set(id, (score.get(id) ?? 1) * Math.pow(GATE_MATCH, 2 * f - 1));
    }
  }
  if (!score.size) return neutral;
  return (i: DbInstrument) => score.get(i.id) ?? 1;
}

type Objectives = Record<string, { useOfFunds: string[]; articles: string[] }>;
let objectiveCache: Objectives | undefined;

function objectives(): Objectives {
  if (objectiveCache === undefined) {
    try {
      objectiveCache = JSON.parse(readFileSync(
        path.join(process.cwd(), "lib", "intelligence", "__objectives.json"),
        "utf8")) as Objectives;
    } catch {
      objectiveCache = {};
    }
  }
  return objectiveCache;
}

/** Re-rank on registered purpose WITHOUT moving the group that has one.
 *
 *  The first cut of this multiplied matches by 1.35 and misses by 0.7, and cost
 *  21 points of exact recall. The reason is that objective coverage is not
 *  random: all 421 instruments carrying one are state-aid schemes, because the
 *  objective comes from the transparency register and EU programmes are not in
 *  it. So "has a matching objective" was read as "is a national scheme", and the
 *  boost quietly became a channel prior -- the same population trade, and the
 *  same failure, as the prior itself.
 *
 *  The signal is real but it is only meaningful BETWEEN schemes that both
 *  declared a purpose. So the penalty is solved, per founder, to make the
 *  geometric mean of the multiplier exactly 1 over the rows that carry an
 *  objective: b^m * q^k = 1. Rows without one are untouched at 1, and the
 *  objective-carrying group as a whole neither rises nor falls -- it is only
 *  reordered internally, which is all the register entitles us to do. */
// Geometric midpoint of each ticket band, in euros. Bands span an order of
// magnitude, so the geometric centre is the honest representative.
const BAND_MID: Record<string, number> = {
  lt500k: 250_000, b500k_2m5: 1_118_000, b2m5_15m: 6_124_000,
  b15m_50m: 27_386_000, gt50m: 100_000_000,
};
const AWARD_N_FLOOR = 5;
const AWARD_MATCH = 1.35;

/** Does this scheme write cheques the size the founder is asking for?
 *
 *  `awardP50` is the median a fund has really paid over `awardN` awards; 852 of
 *  950 leaves carry one. Scored on ORDER OF MAGNITUDE, because that is how
 *  ticket size actually works: a EUR 20k median is not a route to EUR 1M
 *  however well it matches thematically, while EUR 800k against EUR 1.1M is the
 *  same cheque.
 *
 *  GRADED, not binary, and this matters. The first version scored fit/miss and
 *  went neutral unless the shortlist contained BOTH -- which disabled it in the
 *  exact case that matters most: a founder asking for >EUR 50M whose whole
 *  table writes EUR 219k cheques has zero "fits", so the scorer switched itself
 *  off and showed them the same five rows as a founder asking for <EUR 500k.
 *  When everything on the table is the wrong size, the right answer is to lead
 *  with the closest, not to give up.
 *
 *  Returns 1.0 for a fund with no usable award history, so the 98 instruments
 *  without one are neither rewarded nor punished for a gap in our data. */
// Exported for `scripts/diagnose_ordering.ts`, which reconstructs the row sort
// component by component. A copy of this arithmetic in the diagnostic would let
// the score being explained and the score being shipped drift apart, which is
// the one thing a diagnostic may not do.
export function awardScorer(
  _leaves: DbInstrument[], ticketBand?: string,
): (i: DbInstrument) => number {
  const want = ticketBand ? BAND_MID[ticketBand] : undefined;
  if (!want) return () => 1;
  return (i: DbInstrument) => {
    if (i.awardP50 == null || i.awardP50 <= 0 || (i.awardN ?? 0) < AWARD_N_FLOOR) return 1;
    // Decades away from the ask. 0 = same size, 1 = an order of magnitude out.
    const decades = Math.abs(Math.log10(i.awardP50 / want));
    // Within a decade is treated as a match and scores at or above 1; beyond
    // that the multiplier decays but never reaches 0, because a fund that is
    // the wrong size is a weaker route, not a disqualified one -- our award
    // medians are a summary of history, not a published minimum.
    return AWARD_MATCH / (1 + Math.max(0, decades - 1));
  };
}

/** "industrial research, experimental development (Art. 25(2)(b), 25(2)(c))" */
export function registeredPurpose(id?: string): string | undefined {
  const rec = id ? objectives()[id] : undefined;
  if (!rec?.useOfFunds?.length) return undefined;
  const what = rec.useOfFunds.map((u) => u.replace(/_/g, " ")).join(", ");
  return rec.articles?.length
    ? `${what} (Art. ${rec.articles.join(", Art. ")})`
    : what;
}

/** Exported for the ordering diagnostic; see `awardScorer` above. */
export function objectiveScorer(
  ids: (string | undefined)[], useOfFunds?: string[],
): (id?: string) => number {
  const neutral = () => 1;
  if (!useOfFunds?.length) return neutral;
  const obj = objectives();
  let m = 0, k = 0;
  for (const id of ids) {
    const reg = id ? obj[id]?.useOfFunds : undefined;
    if (!reg?.length) continue;
    if (reg.some((u) => useOfFunds.includes(u))) m++; else k++;
  }
  // All matched or all missed: the signal separates nothing here.
  if (!m || !k) return neutral;
  const penalty = Math.pow(OBJECTIVE_MATCH, -m / k);
  return (id?: string) => {
    const reg = id ? obj[id]?.useOfFunds : undefined;
    if (!reg?.length) return 1;
    return reg.some((u) => useOfFunds.includes(u)) ? OBJECTIVE_MATCH : penalty;
  };
}

function channelPrior(country?: string, sector?: string): Record<string, number> {
  if (priorCache === undefined) {
    try {
      priorCache = JSON.parse(readFileSync(
        path.join(process.cwd(), "lib", "intelligence", "channelPrior.generated.json"),
        "utf8")) as ChannelPrior;
    } catch {
      priorCache = { global: {}, byCountry: {}, byCountrySector: {} };
    }
  }
  const cc = toIso2(country ?? "");
  return (sector ? priorCache.byCountrySector[`${cc}|${sector}`] : undefined)
    ?? priorCache.byCountry[cc]
    ?? priorCache.global;
}

// Short, human display labels for the channel codes, for the funding breakdown.
const CHANNEL_LABEL: Record<string, string> = {
  eic: "EIC",
  horizon_eu_pillar_ii: "Horizon",
  horizon_eu_partnership: "Horizon partnership",
  innovation_fund: "Innovation Fund",
  ipcei: "IPCEI",
  chips_ju: "Chips JU",
  edf: "EDF",
  eit: "EIT",
  eib: "EIB",
  state_aid_satr: "state aid",
  national_dev_banks: "dev banks",
};

export const BAND_INDEX: Record<string, number> = Object.fromEntries(
  TICKET_BANDS.map((b, i) => [b.value, i]));

const FIT_FLAG: Record<Exclude<FounderFit, "startup_ready">, string> = {
  consortium_institutional:
    "Consortium required — informational for most solo-founder raises, not a target.",
  large_scale_industrial:
    "Large-scale industrial — sized well above a typical early-stage ask.",
};

/** id -> instrument, built once per warm invocation. */
export function instById(): Map<string, DbInstrument> {
  if (!instByIdCache) instByIdCache = new Map(loadDbInstruments().map((i) => [i.id, i]));
  return instByIdCache;
}

// Channels where "genuine breakthrough vs applied/incremental" actually
// changes how a founder should approach the fund — EIC/Horizon/EIT panels
// explicitly screen for technical risk; national dev banks and GBER loans do
// not. Deliberately small and easy to extend; adding a channel here is the
// only way Phase 4's profile signal ever touches a new row.
const DEPTH_SENSITIVE_CHANNELS = new Set(["eic", "horizon_eu_pillar_ii", "horizon_eu_partnership", "eit"]);

export const channelLabel = (code: string) => CHANNEL_LABEL[code] ?? code;

// Full instrument names for the comparison table (the short labels above are for
// the dense funding-breakdown cells). Order doubles as relevance priority: the
// everyday entry points first, the slow strategic vehicles last.
export const INSTRUMENT_NAME: Record<string, string> = {
  national_dev_banks: "National development banks",
  state_aid_satr: "National state aid (GBER)",
  eic: "EIC Accelerator",
  eit: "EIT (KIC programmes)",
  horizon_eu_pillar_ii: "Horizon Europe (Pillar II)",
  horizon_eu_partnership: "Horizon Europe partnership",
  eib: "EIB / EIF venture debt",
  innovation_fund: "EU Innovation Fund",
  edf: "European Defence Fund",
  chips_ju: "Chips Joint Undertaking",
  ipcei: "IPCEI",
};

export const INSTRUMENT_PRIORITY = Object.keys(INSTRUMENT_NAME);

// Universal entry points shown even when the field uses nothing, so a founder in
// an unfunded space still gets a shortlist to act on.
// The universal entry points, tried when the founder's own field history does
// not supply enough channels. Only three of these existed, which capped the
// whole brief: three defaults plus at most three large-scale top-ups, times
// two leaves each, is the ceiling on everything downstream — and Nebius and
// Corti bottomed out at two published institutions because of it. Horizon
// Pillar II and the EIT KICs are added because they genuinely serve most
// sectors; EDF (defence) and Chips JU (semiconductors) are deliberately not,
// being narrow enough that thematic matching should surface them instead.
export const DEFAULT_INSTRUMENTS = [
  "national_dev_banks", "state_aid_satr", "eic", "horizon_eu_pillar_ii", "eit",
];

// CHANNEL_BANDS -- the [min,max] ticket band each channel was said to serve --
// was deleted here. It had zero references: the only thing that ever read it was
// `channelServesBand`, which was retired to `return true` below, and the table
// then sat exported for a year describing routing the code does not do. The
// judgement it encoded (a EUR 20M ask should not be answered with EIC
// Accelerator) is live, in `awardScorer` against each instrument's own award
// median, which is the measured version of the same idea.

// `channelServesBand(channel, band)` stood here, retired to `return true` and
// still called from four sites, each guarded by an `if (!channelServesBand(...))`
// branch that could not execute, and each writing a `SEL-BAND` exclusion reason
// that could never be written. It was deleted with its call sites.
//
// Keeping a retired check as an always-true function was meant to let the call
// sites "read honestly". It does the opposite: four live-looking filters in the
// channel-admission path, and an exclusion vocabulary (`SEL-BAND`) that the
// exclusion register advertises and nothing can emit. The history is the honest
// record, and it is here.
//
// What it did: removed a whole channel when the founder's ask fell outside a
// range someone typed once -- a large ask deleted the startup-scaled routes, a
// small one deleted the large-scale lane, and neither left a trace. Its own
// comment called it a stopgap pending real ticket gates.
//
// What replaced it, and is live: `awardScorer` scores ticket proximity
// continuously against each instrument's OWN award median, so the judgement it
// encoded (a EUR 20M ask should not be answered with EIC Accelerator) survives
// as a ranking signal instead of a filter. That is the principle stated at the
// top of fit.ts: a fund should fail to make the cut, not be excluded by a rule.

// Large-scale channels surfaced when the ask is €15M+ even if absent from the
// field (the field's history skews small; the ask defines the universe).
export const LARGE_SCALE_TOPUP = ["eib", "innovation_fund", "ipcei"];

// Maps the founder-facing CAPITAL_OPTIONS values to the DB's capital_type
// enum — not 1:1, "Loans & guarantees" spans three DB values.
export const CAPITAL_SOUGHT_TO_DB: Record<string, string[]> = {
  grant: ["grant"],
  loan: ["loan", "guarantee", "counter_guarantee"],
  // SATR's own code is the combined "loan / repayable advances"
  // (StateAidInstrumentLradv, 13,729 events) -- the register does not separate
  // them, so a founder asking for a recoverable advance is pointed at that
  // same population rather than at nothing. Mapping it to a capital_type no
  // instrument carried meant the option matched zero funds and the graded
  // fallback then relaxed capital type entirely, discarding the answer.
  recoverable_advance: ["loan"],
  // `blended` used to sit here, and it is the reason a founder asking for
  // "Loans & guarantees" could not be shown a fund that pays nothing else.
  // See INDEFINITE_CAPITAL below: in this corpus `blended` is not a kind of
  // capital, it is the record of a vote that did not reach its threshold.
  equity: ["equity"],
  tax_credit: ["tax_credit"],
};

/**
 * Capital-type values that name no KIND of capital, only the outcome of a vote.
 *
 * ── The property ──────────────────────────────────────────────────────────
 * A stated capital preference may remove a fund only on EVIDENCE THAT THE FUND
 * DOES NOT PROVIDE WHAT WAS ASKED FOR. `capital_type` is one label chosen by a
 * majority vote over an instrument's own awards (`family_capital_type`,
 * ETL/events/load/populate_funding_instruments.py). `blended` is not an outcome
 * of that vote — it is what the vote emits when NOTHING reached the 60%
 * threshold, for any unresolved mixture whatever the kinds involved. It cannot
 * support removing a fund, because it does not say what the fund pays.
 *
 * ── What that cost ────────────────────────────────────────────────────────
 * `blended` was mapped to the EQUITY option and was in `accessMode.DILUTIVE`,
 * so it took an explicit request for equity to see one at all. Every `blended`
 * instrument in the corpus, checked one by one against the split vote the ETL
 * records beside each label, contains NO equity: 1,451 loan against 1,526
 * guarantee (2,977 awards, a national debt programme), three grant/loan splits,
 * two grant/tax-credit splits, two register rows stating loan and grant, one
 * with no vote. The largest was therefore visible only to founders who asked
 * for equity — the one thing it does not provide — and hidden from every
 * founder who asked for the debt it does.
 *
 * ── Why `unknown` is NOT here, though it fails the same test ──────────────
 * It fails a DIFFERENT test. `blended` is a fact we hold and were misreading;
 * `unknown` is a fact we never recorded, and the two do not have the same safe
 * default. Workstream AE priced `unknown` (8 publishable instruments, reachable
 * by no intake option) and declined to admit them for a reason that still
 * holds: among the untyped instruments are vehicles named "portfolio" and
 * "investments", and three of their typed siblings carry `equity`. Admitting
 * them to a grant-seeker's pool could put a cap-table investor in front of
 * someone who never asked for one, which is precisely what
 * `passesCapitalPreference` exists to prevent. An unresolved MIXTURE we can
 * enumerate is safe to admit; an unresolved BLANK is not.
 *
 * So `unknown` stays unreachable and stays a ratchet in
 * `check_capital_reach.ts`, whose own note says the honest fix is upstream in
 * the ETL. This constant deliberately does not overrule that.
 *
 * ── Why a set of values and not a list of instruments ─────────────────────
 * The test is on what the LABEL asserts, so a capital type this file has never
 * seen is handled by its own classification rather than by being named here.
 */
export const INDEFINITE_CAPITAL = new Set(["blended"]);

// Representative euro value per ticket band, for ranking real DB leaf
// instruments by proximity to the founder's stated ask, against each
// instrument's own historical total_eur/event_count average award.
export const TICKET_MIDPOINT: Record<string, number> = {
  lt500k: 250_000, b500k_2m5: 1_500_000, b2m5_15m: 8_000_000,
  b15m_50m: 32_000_000, gt50m: 75_000_000,
};

/** Which countries' national instruments should be in play: explicit
 *  targetMarkets (where the founder wants to RAISE) wins when given, else
 *  HQ country + wherever an entity already exists. */
export function founderCountryList(country?: string, targetMarkets?: string[], entityCountries?: string[]): string[] {
  const explicit = (targetMarkets ?? []).filter(Boolean);
  if (explicit.length) return explicit;
  return [...new Set([country, ...(entityCountries ?? [])].filter((c): c is string => Boolean(c)))];
}

export function instrumentServesCountry(instrumentCountry: string, founderCountries: string[]): boolean {
  if (!founderCountries.length) return true;      // no info yet — don't over-filter
  if (instrumentCountry === "EU") return true;     // EU-wide instruments always in play
  return founderCountries.some((c) => toIso2(c) === instrumentCountry);
}

export function instrumentServesCapital(instrumentCapitalType: string, capitalSought: string[]): boolean {
  if (!capitalSought.length) return true;
  // A label that names no kind cannot contradict what the founder asked for.
  // See INDEFINITE_CAPITAL: this is the difference between "this fund does not
  // pay grants" and "the vote about what this fund pays produced no answer",
  // which the old `allowed.has(...)` test collapsed into the same result.
  //
  // Note what is deliberately NOT done here: an UNMAPPED value does not get the
  // same treatment. Making it silence would be the more general-looking rule
  // and it would disarm `check_capital_reach.ts`, whose whole job is to fail
  // the build when a new capital type reaches no founder. A value nobody has
  // classified must be loud, not quietly admitted.
  if (INDEFINITE_CAPITAL.has(instrumentCapitalType)) return true;
  const allowed = new Set(capitalSought.flatMap((c) => CAPITAL_SOUGHT_TO_DB[c] ?? []));
  return allowed.size === 0 || allowed.has(instrumentCapitalType);
}

/** Every capital type some intake option admits. Derived from the option map
 *  rather than restated, so the two cannot drift. */
export const KNOWN_CAPITAL_TYPES = new Set(Object.values(CAPITAL_SOUGHT_TO_DB).flat());

/**
 * What a company like this one would actually receive.
 *
 * The median of the instrument's own awards, where we hold enough of them.
 * This used to be totalEur / eventCount — a MEAN, and public funding is
 * heavily skewed: one IPCEI tranche or a single large loan drags an average to
 * a figure no applicant has ever been paid. The median is an amount somebody
 * really got.
 *
 * Falls back to the mean where fewer than five priced awards exist, because a
 * rough number beats none for ranking, and scaleFit already treats an unknown
 * scale as neutral rather than low.
 */
/**
 * Cited requirements we cannot mechanically decide — the judgement criteria.
 *
 * ── Why these matter ──────────────────────────────────────────────────────
 * 564 filter gates across the corpus are traceable to a fund's own text and
 * carry no value_spec, because what they ask is not a threshold: "the applicant
 * must genuinely aim for significant international growth", "must have a
 * credible overall financing plan". The encoder is right to refuse them — no
 * comparator decides that, and a human assessor could not either.
 *
 * But refusing to ENCODE them turned into refusing to SHOW them. A published
 * row carried its one failing evaluated rule and nothing else, so a founder
 * looking at Vinnova was never told that international ambition and a credible
 * financing plan are what the assessor actually weighs — criteria we hold,
 * cited, from Vinnova's own document. 149 instruments have no evaluable cited
 * rule at all; for those, this is everything the fund has told us about who it
 * says yes to.
 *
 * Uncited requirements are excluded deliberately. The same rule governs the
 * whole product: only text traceable to the fund may be stated as the fund's
 * own, and an inferred stub presented as an assessment criterion would be us
 * putting words in their mouth.
 */
const JUDGEMENT_CAP = 3;

export function judgementCriteria(inst: DbInstrument): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  // OWN criteria before inherited ones, for the same reason structuringNotes
  // does it -- and here it is a correctness problem, not a presentation one.
  //
  // A scheme child inherits its whole regime's gates, and a regime covers
  // hundreds of unrelated schemes. Taking the first three matching gates showed
  // a hydrogen company applying to one German scheme these three rules, each
  // cited and each belonging to a DIFFERENT sibling scheme:
  //
  //   "...public-law bodies with automotive-industry competence"
  //   "...universities, regional/local authorities, commercial enterprises"
  //   "For Modules 1-8, cooperation with a partner institution from at least
  //    one of the specified Eastern Partnership countries is required"
  //
  // A founder reads that and concludes they need automotive credentials and a
  // Georgian partner. Neither rule governs the fund in front of them. Every
  // line is true of something; none is true of this.
  //
  // ORDERING ALONE DOES NOT FIX THAT CASE, and the ordering is kept anyway
  // because it is right on its own terms: 54 of 615 children now lead with a
  // criterion that is genuinely theirs. But BAFA has NO cited criteria of its
  // own, so all three of its lines are inherited whatever the order.
  //
  // The real defect is upstream and larger: rules extracted from an individual
  // scheme's document were attached to the REGIME, so satr_de_rnd's gate set is
  // a mixture of rules belonging to hundreds of unrelated schemes, and every
  // child inherits all of them undifferentiated. Fixing it means attributing an
  // extracted rule to the scheme whose document it came from -- source_file is
  // recorded, so the information exists -- rather than to the regime it was
  // harvested under. Not attempted here; it changes what every SATR child
  // claims about itself and deserves its own measured pass.
  //
  // Inherited criteria still show, because a regime's rules DO bind its
  // schemes -- they just must not outrank what the scheme says about itself.
  for (const ownFirst of [true, false]) {
    for (const g of inst.gates) {
      if (Boolean(g.inherited) !== !ownFirst) continue;
      if (g.gateRole && g.gateRole !== "filter") continue;
      if (g.valueSpec) continue;                       // decided by the engine
      if (!isCited(g)) continue;                       // not the fund's own words
      const text = (g.requirement ?? "").trim();
      const key = text.toLowerCase();
      if (!text || seen.has(key)) continue;
      seen.add(key);
      // Inherited criteria are LABELLED, not presented as this fund's own.
      //
      // Measured: 453 SATR scheme children hold zero cited criteria of their
      // own, and each regime's rules were extracted from exactly ONE document —
      // all 81 German R&D schemes are characterised by a single BMFTR
      // security-research Richtlinie. Unlabelled, a hydrogen founder reads
      // "public-law bodies with automotive-industry competence" as a condition
      // on the fund in front of them. Labelled, they read it as what the
      // framework document says, and can weigh it accordingly.
      //
      // The label names the framework rather than saying "regime-wide", because
      // "regime-wide" would itself be an unverified claim: we know which
      // document the rule came from, not that it binds every scheme under it.
      out.push(ownFirst ? text : `${frameworkLabel(inst)}: ${text}`);
      if (out.length >= JUDGEMENT_CAP) return out;
    }
  }
  return out;
}

/** Whose framework an inherited rule came from, for labelling. Falls back to a
 *  scope-only label when the parent cannot be resolved — never to silence,
 *  because an unlabelled inherited rule reads as the fund's own. */
function frameworkLabel(inst: DbInstrument): string {
  if (!inst.parentId) return "Framework rule";
  const parent = loadDbInstruments().find((i) => i.id === inst.parentId);
  if (!parent) return "Framework rule";
  // A SATR regime's name is a machine descriptor ("SATR De Rnd") that means
  // nothing to a founder, and putting it in front of a rule reads like a typo
  // rather than a scope. Say what the framework IS; the row already carries the
  // country and the legal basis beside it.
  if (parent.sourceFamilyBucket === "state_aid_satr") return "State aid regime";
  return parent.name ? `${parent.name} framework` : "Framework rule";
}

/**
 * How the money is shaped — the structuring layer, as opposed to eligibility.
 *
 * ── Why this was invisible ────────────────────────────────────────────────
 * The verdict engine admits only `filter` gates, because only a filter says
 * who qualifies. Correct for a verdict, and it meant 1,523 gates triaged
 * `programme_fact` or `obligation` reached nobody:
 *
 *   "Grant rate is 50% of eligible costs for SME research projects, rising to
 *    60% when the project content is ..."
 *   "De minimis aid must not be cumulated with other State aid for the same
 *    eligible costs"
 *   "Loan can cover up to 50% of total project costs, or up to 70% for a
 *    justified reason"
 *
 * That is the whole question a capital structuring analyst is paid to answer —
 * what fraction of this project can be public money, what stacks on what, and
 * what the company has to put in itself. We were holding it and discarding it.
 *
 * ── Selected by family, not by phrasing ───────────────────────────────────
 * G3_financial is the corpus's own name for rules about the SHAPE of the money
 * (rates, ceilings, co-financing), and G6_conditionality for what a recipient
 * commits to. Reading the taxonomy generalises to funds and languages nobody
 * has looked at; matching on words like "intensity" or "cumulation" would only
 * find the ones already written in English the way we expected.
 *
 * Kept separate from judgementCriteria on purpose. "You fund 50%" and "you
 * must be an SME" are both true and constrain completely different things, and
 * a founder who confuses them plans the wrong project.
 */
const STRUCTURING_FAMILIES = ["G3_financial", "G6_conditionality"];
const STRUCTURING_CAP = 3;

export function structuringNotes(inst: DbInstrument): string[] {
  const seen = new Set<string>();
  const picked: string[] = [];
  // OWN evidence before inherited, then financial shape before conditionality.
  //
  // The order used to be family-only, and with a cap of three that quietly
  // meant "whatever the regime says", forever: a scheme child inherits its
  // regime's whole gate set, so three cited regime facts filled the row before
  // anything the scheme said about itself was ever considered. Measured on the
  // per-scheme GBER article rules: 458 instruments carried one and it reached
  // exactly 0 rows. A fact about THIS scheme beats a fact about the regime it
  // sits under — that is the entire reason for distinguishing them.
  for (const ownFirst of [true, false]) {
    for (const family of STRUCTURING_FAMILIES) {
      for (const g of inst.gates) {
        if (Boolean(g.inherited) !== !ownFirst) continue;
        if (g.gateFamily !== family) continue;
        if (!g.gateRole || g.gateRole === "filter") continue;  // eligibility, not structure
        // Attributable, not merely cited: a register-derived article statement
        // is a fact about how the instrument is structured, filed by the
        // granting authority. Admissible HERE only (see isAttributable).
        if (!isAttributable(g)) continue;
        const text = (g.requirement ?? "").trim();
        const key = text.toLowerCase();
        if (!text || seen.has(key)) continue;
        seen.add(key);
        picked.push(text);
        if (picked.length >= STRUCTURING_CAP) return picked;
      }
    }
  }
  return picked;
}

/**
 * What this fund IS, in one line, from what we have measured about it.
 *
 * ── The problem it solves ─────────────────────────────────────────────────
 * 535 of 861 publishable rows share their display name with a sibling, because
 * `name` is the granting BODY and a body runs many products. A founder sees
 * "Bpifrance" three times and learns nothing: they cannot apply to Bpifrance,
 * they apply to one of its products.
 *
 * The products themselves are correctly separated — Bpifrance is three
 * instruments with medians of EUR 449k, EUR 386k and EUR 500k — but their real
 * names exist nowhere in the data. They live in each fund's own documents, and
 * only 51 of the 535 have one on disk. The id slug is no substitute:
 * prettified it reads "Anm Kepa" and "Aizdevumi Produktivit Te", which is
 * worse than the institution alone.
 *
 * So this describes rather than names. Every part is measured — capital type,
 * the region a rule restricts it to, what its recipients actually do, what it
 * actually pays — and nothing is invented. "Bpifrance · Grants ·
 * Ile-de-France · median EUR 385,500" tells a founder whether to keep reading.
 *
 * Replaced wholesale, not extended, when real product names arrive.
 */
// Short forms of the sector vocabulary, for a one-line descriptor. Keyed off
// SECTOR_OPTIONS so a sector added to the intake cannot silently go unnamed
// here; anything without a short form is simply omitted rather than guessed.
const SECTOR_WORD: Record<string, string> = {
  software_data_ai: "software & AI",
  health_life_sciences: "health & life sciences",
  energy_cleantech: "energy & cleantech",
  industrial_manufacturing: "industrial manufacturing",
  semiconductors_electronics: "semiconductors & electronics",
  mobility_transport: "mobility & transport",
  agrifood: "agrifood",
  materials_chemicals: "materials & chemicals",
  space: "space",
  defense_security: "defence & security",
};

const CAPITAL_WORD: Record<string, string> = {
  grant: "Grants", loan: "Loans", guarantee: "Guarantees",
  equity: "Equity", blended: "Blended finance",
};

/** Below this share of an instrument's awards, a "focus" is noise. */
const FOCUS_SHARE = 0.25;

function regionOfInstrument(inst: DbInstrument): string | null {
  for (const g of inst.gates) {
    const spec = g.valueSpec as { op?: string; allowed?: string[] } | null;
    if (spec?.op !== "region_within" || !spec.allowed?.length) continue;
    const names = spec.allowed.map(regionNameFor).filter(Boolean) as string[];
    if (!names.length) continue;
    return names.length === 1 ? names[0] : `${names.length} regions`;
  }
  return null;
}

export function fundDescriptor(inst: DbInstrument): string {
  const bits: string[] = [CAPITAL_WORD[inst.capitalType] ?? "Funding"];

  const region = regionOfInstrument(inst);
  if (region) bits.push(region);

  const mix = inst.sectorMix;
  if (mix) {
    const total = Object.values(mix).reduce((a, b) => a + b, 0);
    const top = Object.entries(mix).sort((a, b) => b[1] - a[1])[0];
    if (total && top && top[1] / total >= FOCUS_SHARE) {
      const label = SECTOR_WORD[top[0]];
      if (label) bits.push(`mostly ${label}`);
    }
  }
  return bits.join(" \u00b7 ");
}

/**
 * Make every published row nameable on its own.
 *
 * ── Why this is not cosmetic ──────────────────────────────────────────────
 * 392 publishable instruments across 76 names render under a name they share
 * with a sibling, because the name is the granting BODY and a body runs many
 * programmes: "Norges Forskningsradet" 59 times, "Altum (Latvia)" 25. The
 * dedupe below then DROPS the losers, so a founder does not merely see an
 * ambiguous row, they never see the programme at all.
 *
 * Where a real programme name exists it is already the row's name (see
 * data/reference/programme_names.json). Where an agency publishes none, the
 * distinguishing identifier the corpus does hold is used, in descending order
 * of how much it tells a reader: the notified scheme code, then the fragment
 * of the instrument's own id that its same-named siblings do not share, then
 * the capital type. Nothing is invented — every one of those is the fund's own
 * identifier, and where none separates them the dedupe still runs.
 */
/**
 * The label a row RENDERS under — the one thing both the disambiguator and the
 * collapse are allowed to group by.
 *
 * It exists because the two used to compute it separately: this spelling, which
 * reads the row's own published title, against `displayInstitutionName`, which
 * rebuilds a name from country + kind + scheme code and never looks at
 * `row.instrument` at all. For a row carrying a real title the two DISAGREE —
 * the derived name embeds the notified scheme code and so separates twins the
 * published title merges — and the consequence was a fund deleted from the pool
 * on a key the disambiguator had never examined. A "keep these two in sync"
 * comment is the bug in this repo; one exported function is the fix.
 */
function rowDisplayLabel(r: InstrumentRow): string {
  return r.instrument || displayInstitutionName(r);
}

function distinguishRowNames(rows: InstrumentRow[]): void {
  const byName = new Map<string, InstrumentRow[]>();
  for (const r of rows) {
    // The label the DEDUPE will collapse on, not a second one computed here.
    //
    // This grouped by `displayInstitutionName(r)` while the dedupe keyed on
    // `r.instrument || displayInstitutionName(r)`. Two functions, two keys: a
    // row carrying a real published title was grouped by its DERIVED name --
    // which embeds the notified scheme code and therefore separates it from its
    // twin -- so the disambiguator saw no collision to resolve, and the dedupe
    // then collapsed the pair on the title the disambiguator never examined.
    // Measured live: 4 rows across 22 markets, every one of them two DISTINCT
    // notified schemes publishing under one title (CZ SA.63670 against
    // SA.111735, and the DE and IT equivalents).
    const n = rowDisplayLabel(r);
    byName.set(n, [...(byName.get(n) ?? []), r]);
  }
  for (const [name, peers] of byName) {
    if (peers.length < 2) continue;
    // Sorted, because the shared prefix below is computed by folding over this
    // list and the dedupe now keys on the label it produces. Unsorted, the two
    // stores return rows in different sequences, produce different labels, keep
    // different survivors, and the parity check fails on order.
    const ids = peers.map((p) => p.instrumentId ?? "").sort();
    // The shared prefix is the agency; what follows identifies the programme.
    let prefix = ids[0] ?? "";
    for (const id of ids) {
      let i = 0;
      while (i < prefix.length && i < id.length && prefix[i] === id[i]) i++;
      prefix = prefix.slice(0, i);
    }
    // The token must be the field that actually DIFFERS among these peers.
    //
    // It preferred `schemeCode`, and peers collide precisely because they share
    // one: nine French children under SA.111723 all rendered
    // "FR R&D state aid scheme SA.111723", were declared indistinguishable, and
    // eight were dropped. Measured on 60 real recipients, this dedupe was 50%
    // of all misses -- larger than the ranking and the leaf cap combined.
    //
    // The granting body is what a founder actually approaches and is what
    // separates them: Region Normandie versus Caisse des Depots, under the same
    // notified regime.
    peers.sort((a, b) => (a.instrumentId ?? "").localeCompare(b.instrumentId ?? ""));
    const bodies = new Set(peers.map((p) => p.administeringBody ?? ""));
    const bodyDistinguishes = bodies.size === peers.length && !bodies.has("");
    // Where the body does not separate them, WHERE THE MONEY GOES often does,
    // and it is the thing a founder can act on: fourteen leaves share the
    // French RDI regime's name, and the ones a given founder can actually apply
    // to are the ones delivering into their region. Preferred over the id
    // fragment, which is an internal slug and tells a reader nothing.
    const regions = new Set(peers.map((p) => p.deliveryRegion ?? ""));
    const regionDistinguishes = regions.size === peers.length && !regions.has("");
    // A scheme-code branch was written here, tested the same way body and region
    // are tested, and REMOVED. Rationale it was written on: peers that collide
    // on a shared TITLE often carry different notified codes, and a code is a
    // published identifier where the id fragment below is an internal slug.
    // Rationale it was removed on: measured across 22 markets after the grouping
    // key was corrected, it produced a token ZERO times -- the granting body
    // separates every pair the corpus actually contains. A branch nothing can
    // emit is the SEL-BAND defect in code rather than in the register.
    for (const r of peers) {
      const token = (bodyDistinguishes ? r.administeringBody : "")
        || (regionDistinguishes && r.deliveryRegion
             ? regionNameFor(r.deliveryRegion) ?? r.deliveryRegion : "")
        || (r.instrumentId ?? "").slice(prefix.length).replace(/^_+/, "").replace(/_/g, " ")
        || r.schemeCode
        || r.capitalType
        || "";
      if (token) r.instrument = `${name} \u00b7 ${token}`;
    }
  }
}

/**
 * The family above a programme, as a founder would recognise it.
 *
 * Agencies name themselves — "ADEME (France)", "Vinnova" — and those pass
 * through. State-aid regimes do not: their id-derived name is "SATR FR RND",
 * which is an internal identifier and tells a founder nothing. They are
 * rendered as the regime they are, using the same country-and-kind derivation
 * displayInstitutionName already applies to scheme rows, so the breadcrumb and
 * the row agree about what the regime is called.
 *
 * Returns undefined rather than a family that merely repeats the row: a
 * breadcrumb that says the same thing twice is noise.
 */
function familyLabel(leaf: DbInstrument): string | undefined {
  const parent = leaf.parentId ? instById().get(leaf.parentId) : undefined;
  if (!parent?.name || parent.name === leaf.name) return undefined;
  const m = /^satr_([a-z]{2})_(rnd|equity)$/.exec(parent.id);
  if (m) {
    const kind = m[2] === "equity" ? "equity" : "R&D";
    return `${m[1].toUpperCase()} ${kind} state aid regime`;
  }
  return parent.name;
}

export function typicalAward(inst: DbInstrument): number | null {
  if (inst.awardP50 != null && inst.awardP50 > 0) return inst.awardP50;
  return inst.eventCount > 0 ? inst.totalEur / inst.eventCount : null;
}

let dbInstrumentsByBucketCache: Map<string, DbInstrument[]> | null = null;

export function dbInstrumentsByBucket(): Map<string, DbInstrument[]> {
  if (!dbInstrumentsByBucketCache) {
    dbInstrumentsByBucketCache = new Map();
    for (const inst of publishableInstruments()) {
      if (!inst.sourceFamilyBucket) continue;
      const list = dbInstrumentsByBucketCache.get(inst.sourceFamilyBucket) ?? [];
      list.push(inst);
      dbInstrumentsByBucketCache.set(inst.sourceFamilyBucket, list);
    }
  }
  return dbInstrumentsByBucketCache;
}

/**
 * Within a channel/family, select the 1-2 real DB-native leaf instruments
 * most relevant to this founder: country- and capital-type-filtered, then
 * ranked by how close the instrument's own historical average award is to
 * the founder's ticket band (falling back to event_count when the band or
 * the instrument's own scale is unknown). This is what turns "EIC" into
 * "EIC Pathfinder" / "EIC Accelerator" shown separately, and turns the
 * 200-row national_dev_banks bucket into the 1-2 schemes actually in the
 * founder's country. Returns [] if the family has no DB-native leaves yet
 * (the caller falls back to channel-only display).
 */
let instByIdCache: Map<string, DbInstrument> | null = null;

/** Channels whose instruments are national by construction: every leaf belongs
 *  to one country's programme, so an out-of-country leaf is never usable. */
export const NATIONAL_CHANNELS = new Set(["national_dev_banks", "state_aid_satr"]);

/** Inputs to leaf selection. An object rather than six positional arguments:
 *  the old signature was `(channel, countries, capital, band, description,
 *  semantic)`, which at the call site read as an unlabelled list where a
 *  transposed pair would still compile. */
export interface LeafSelectionInput {
  channel: string;
  founderCountries: string[];
  capitalSought: string[];
  ticketBand?: string;
  description?: string;
  semantic?: Map<string, number>;
  /** Founder's sector, for ranking on a fund's demonstrated intake. */
  founderSector?: string;
  /** What the money is for, matched against each scheme's registered objective. */
  useOfFunds?: string[];
  log?: ExclusionLog;
}

export function selectLeafInstruments(input: LeafSelectionInput): DbInstrument[] {
  const { channel, founderCountries, capitalSought, ticketBand, description, semantic, founderSector, useOfFunds, log } = input;
  const all = dbInstrumentsByBucket().get(channel) ?? [];
  if (!all.length) return [];
  // Graded fallback. The old single fallback ("if nothing matched, take
  // everything") relaxed country AND capital type at once, which is how a
  // German founder asking for grants ended up being offered Latvian Altum
  // loans: no German NDB in this bucket served grants, so the filter emptied
  // and every country came back. Relaxing capital type is defensible;
  // relaxing country is not, so it comes last and only to avoid an empty row.
  // Silence is not consent to dilution: an investment vehicle only appears
  // when the founder actively asked for equity. See accessMode.ts.
  const offered = all.filter((i) => {
    if (passesCapitalPreference(i, capitalSought)) return true;
    log?.record("SEL-CAPITAL", i.id,
      "an investor rather than a grantor, and the founder did not ask for equity");
    return false;
  });
  const inCountry = offered.filter((i) => instrumentServesCountry(i.country, founderCountries));
  for (const i of offered) {
    if (!inCountry.includes(i)) {
      log?.record("SEL-COUNTRY", i.id, `national to ${i.country}, outside the founder's usable countries`);
    }
  }
  let candidates = inCountry.filter((i) => instrumentServesCapital(i.capitalType, capitalSought));
  if (!candidates.length) {
    // The relaxation is recorded, not just the removal: a table built after
    // capital type was abandoned answers a different question than the one
    // the founder asked, and that is invisible in the output.
    for (const i of inCountry) log?.record("SEL-CAPITAL", i.id, `capital type ${i.capitalType} not among those sought (filter relaxed to avoid an empty channel)`);
    candidates = inCountry;
  } else {
    for (const i of inCountry) {
      if (!candidates.includes(i)) log?.record("SEL-CAPITAL", i.id, `capital type ${i.capitalType} not among those sought`);
    }
  }
  // For channels whose instruments are national by construction, an empty
  // in-country result means the answer is "nothing here", not "show them
  // somebody else's". The last-resort fallback handed a Danish founder the
  // Estonian Enterprise Foundation and a Lithuanian ministry — schemes no
  // Danish company can draw on — and they survived to the brief looking
  // plausible, because their country restriction is not encoded as a gate so
  // the verdict layer returned `unknown` rather than `blocked`. Country here
  // is a fact about the instrument, so it does not need a gate to be true.
  if (!candidates.length && !NATIONAL_CHANNELS.has(channel)) candidates = offered;
  if (!candidates.length) {
    log?.record("SEL-NATIONAL-EMPTY", channel,
      "channel is national by construction and holds no instrument in the founder's countries");
    return [];
  }
  const target = ticketBand ? TICKET_MIDPOINT[ticketBand] : undefined;
  // "Can this founder walk through the door at all", not "is this fund's flag
  // the same as theirs".
  //
  // This tested `toIso2(c) === i.country`, and an EU-wide instrument carries
  // country "EU", which never equals "IT". So every national scheme outranked
  // every EU programme, and the leaf cap cut before Horizon was reached.
  // Measured on 80 real recipients replayed through the pipeline: the fund a
  // company ACTUALLY won was missing from the pool 25% of the time, and the
  // misses were overwhelmingly Horizon clusters, EIC and Joint Undertakings --
  // the programmes that fund the most companies in Europe. For one Italian AI
  // company, horizon_eu_cl4 (which had funded it) ranked 203rd of 958.
  //
  // An EU-wide programme is exactly as reachable to an Italian founder as an
  // Italian one. It is not a "foreign fallback".
  //
  // This does NOT reopen the bug the country-first rule was written for: a
  // German satellite company was handed Latvian Altum loans because a spurious
  // lexical hit outranked country fit. Latvia is not EU-wide, so a Latvian
  // scheme still sorts below every German one for a German founder. Only the
  // pan-European tier is promoted, and only to parity, never above home.
  const isExactCountry = (i: DbInstrument) =>
    founderCountries.length > 0 &&
    (founderCountries.some((c) => toIso2(c) === i.country) || i.country === "EU");

  // Thematic match on the founder's own description, ahead of every other key.
  // Buckets like horizon_eu_partnership hold nine thematically unrelated Joint
  // Undertakings, and ranking those by event_count handed CHP and IHI (both
  // health) to every founder while EUSPA stayed invisible to satellite
  // companies. Only applied above RELEVANCE_FLOOR so a description that says
  // nothing thematic leaves the existing ordering untouched.
  // Semantic (instrument_profiles) is the primary signal; the lexical index is
  // the offline fallback when VOYAGE_KEY/Postgres is unavailable.
  const relevance = semantic?.size
    ? semantic
    : themeRelevance(description, candidates.map((i) => i.id));
  const rel = (i: DbInstrument) => {
    const r = relevance.get(i.id) ?? 0;
    return r >= RELEVANCE_FLOOR ? r : 0;
  };
  /** Thematic match and demonstrated intake, weighted. THEME_WEIGHT leads
   *  because a founder's own words are about their project, while sector share
   *  is a property of the fund's history; but history is what rescues the large
   *  programmes whose profiles are too broad to match sharply. */
  // Registered purpose, applied HERE and deliberately not in the row sort.
  //
  // Tried there first and it cost 21 points of exact recall, because objective
  // coverage is not random -- all 421 instruments carrying one are state-aid
  // schemes, since the objective comes from the transparency register and EU
  // programmes are not in it. Across channels the signal therefore reads as "is
  // a national scheme" and silently becomes a channel prior. Normalising it to
  // be mean-neutral was not enough: raising the variance inside one group still
  // pushes that group's winners into the visible five.
  //
  // Within a channel there is no such trade. Every candidate here is a sibling
  // competing for the same slot, they carry objectives or not as a group, and
  // reordering them cannot change how many rows the channel gets. That is also
  // exactly where the exact-scheme question lives: which of these 50 siblings.
  const objectiveFor = objectiveScorer(candidates.map((i) => i.id), useOfFunds);
  const score = (i: DbInstrument) =>
    (THEME_WEIGHT * rel(i) + (1 - THEME_WEIGHT) * sectorFit(i.sectorMix, founderSector))
    * objectiveFor(i.id);

  const sorted = [...candidates].sort((a, b) => {
    // An exact country match always outranks an EU-wide/foreign fallback
    // row, before ticket-size proximity — a founder's own national scheme
    // is more useful than a better-sized but irrelevant one.
    //
    // Thematic relevance sits AFTER this, never before: ranking on theme first
    // handed a German satellite company two Latvian Altum loans (and a question
    // about COVID-19 working capital) because a spurious lexical hit outranked
    // country fit. Theme decides between leaves that are equally reachable,
    // which is exactly the mixed-bucket case it exists for.
    const ea = isExactCountry(a), eb = isExactCountry(b);
    if (ea !== eb) return ea ? -1 : 1;
    // Thematic match BLENDED with the fund's demonstrated intake, not thematic
    // match alone.
    //
    // Semantic similarity is computed against instrument_profiles -- what a fund
    // funds -- and it is systematically weak for the big generalist programmes,
    // because their profile is diluted across everything they do. Measured: for
    // an Italian AI company, horizon_eu_cl4 (which had actually funded it)
    // ranked 203rd of 958, while narrow national programmes scored 1.00.
    //
    // sectorFit is the opposite kind of evidence: the share of a fund's real
    // recipients in this founder's sector. It was already computed in fit.ts and
    // never reached this ranking, so the one signal built from who a fund has
    // actually paid played no part in choosing the rows.
    //
    // Blended rather than tiered, because either alone is wrong: sector share
    // alone hands every agrifood founder the biggest agricultural bank, and
    // theme alone is what put CL4 at 203rd.
    const ra = Math.round(score(a) * 1e6), rb = Math.round(score(b) * 1e6);
    if (ra !== rb) return rb - ra;
    if (target !== undefined) {
      const da = typicalAward(a), db = typicalAward(b);
      if (da !== null && db !== null) {
        const diff = Math.abs(da - target) - Math.abs(db - target);
        if (diff !== 0) return diff;
      } else if ((da !== null) !== (db !== null)) {
        return da !== null ? -1 : 1; // known scale beats unknown
      }
    }
    // Last resort before raw volume: the UNFLOORED thematic score. rel()
    // zeroes anything under RELEVANCE_FLOOR, so when no leaf in a bucket
    // clears the floor every candidate ties at zero and the biggest
    // programme wins on event count alone. Germany's SATR bucket is how that
    // shows up: Landwirtschaftliche Rentenbank, the agricultural bank, was
    // handed to a robotics company and to an AI lab purely because
    // agricultural aid is high-volume. Preferring the least-mismatched leaf
    // is strictly better than preferring the largest one, and the floor still
    // does its real job above — keeping a weak thematic hit from outranking
    // country fit or ticket size.
    const rawA = Math.round((relevance.get(a.id) ?? 0) * 1e6);
    const rawB = Math.round((relevance.get(b.id) ?? 0) * 1e6);
    if (rawA !== rawB) return rawB - rawA;
    if (a.eventCount !== b.eventCount) return b.eventCount - a.eventCount;
    // Total order: without this the leaf kept depends on hydration order, and
    // the two stores return rows in different sequences.
    return a.id.localeCompare(b.id);
  });
  // A flat cap on how many leaves a channel may put into the POOL.
  //
  // This was a three-clause, relevance-aware cap:
  //
  //     idx < LEAVES_PER_CHANNEL(2)
  //       || (idx < MAX_LEAVES_PER_CHANNEL(4) && within NEAR_TIE_RATIO(0.9))
  //       || idx < POOL_LEAVES_PER_CHANNEL(40)
  //
  // Three constants, sixty lines of measured justification, and no effect on
  // the returned set: it is a disjunction, 2 < 40 and 4 < 40, so the third
  // clause admits everything the first two do and the near-tie test can never
  // change an outcome. The relevance-awareness was real when the cap was 2 and
  // display and consideration were the same number; separating the pool from
  // the table (POOL_LEAVES_PER_CHANNEL, above) subsumed it and nothing removed
  // the remains. The SEL-LEAF-CAP reason string described the dead branches, so
  // the exclusion log was reporting a rule the code had stopped applying.
  //
  // Deleting the two clauses is a no-op by construction, and the holdout
  // measurement agrees: EXACT@5 and REGIME@5 both unchanged.
  const keep = sorted.filter((_i, idx) => idx < POOL_LEAVES_PER_CHANNEL);
  for (const i of sorted.slice(POOL_LEAVES_PER_CHANNEL)) {
    log?.record("SEL-LEAF-CAP", i.id,
      `ranked below its channel's limit of ${POOL_LEAVES_PER_CHANNEL} candidates`);
  }
  return keep;
}

/**
 * Build the instrument-comparison table: the capital actually on the table for
 * this founder, side by side. Channels a peer or the founder has drawn on lead
 * (flagged usedInField); the table is topped up to a useful shortlist from the
 * universal entry points. Every figure comes from the curated fund snapshot,
 * never the model. Startup-ready capital (grants, SME loans/guarantees, EIC,
 * tax credits) leads; consortium/institutional and large-scale-industrial
 * instruments (Horizon, EIT, Chips JU, EDF, IPCEI, Innovation Fund, EIB growth
 * debt) are never added as a silent default — only when peer-proven or the
 * founder's own answers support them — and carry a visible fitFlag so they're
 * never presented as equivalent to startup-ready options. Within each
 * selected channel, real DB-native leaf instruments are picked and shown
 * separately when the founder's country/capital-type/ticket answers can
 * resolve them (falls back to the channel-level row otherwise). Returns the
 * full ranked candidate list, unsliced — callers cap to DISPLAY_CAP for
 * anything user-facing; the fuller list is what grounds the adaptive round
 * (Phase 3C) in gates from every instrument still plausibly in play, not
 * just the six shown in the table.
 */
export const DISPLAY_CAP = 6;

/** How many distinct funding channels to put in play before leaf selection.
 *  Each contributes at most two leaves, and everything downstream only ever
 *  removes rows. */
export const MIN_CHANNELS_CONSIDERED = 7;

// The pool synthesize() screens before cutting to the five shown. Deliberately
// wider than DISPLAY_CAP: funds a founder cannot access are dropped AFTER
// assessment, so a pool of six meant a founder blocked on three of them got a
// three-row brief while perfectly good candidates at rank seven were never
// looked at. Dropping must be able to backfill, not shrink the table.
export const VERDICT_POOL = 18;

/** How thematically plausible a large-scale channel must be before a big ticket
 *  alone earns it a place. Deliberately low: it only has to be somewhere in the
 *  semantic neighbourhood, not a top match. */
export const LARGE_SCALE_RELEVANCE_FLOOR = 0.5;

/** Inputs to the instrument table. Was seven positional parameters, which one
 *  call site rendered as a single unreadable line of bare values; the object
 *  also gives the exclusion log somewhere to live without an eighth. */
export interface InstrumentTableInput {
  fieldChannels: Set<string>;
  ticketBand?: string;
  consortiumOk?: boolean;
  founderCountries?: string[];
  capitalSought?: string[];
  /** Founder's free-text description, for thematic leaf selection. */
  description?: string;
  /** Semantic fund-match scores (semantic.ts). Absent/empty = lexical only. */
  semantic?: Map<string, number>;
  /** The founder's sector, for ranking on a fund's DEMONSTRATED intake.
   *  sectorFit() was computed in fit.ts and never reached the selector, so the
   *  ranking could not use the one signal built from who a fund has actually
   *  paid. */
  founderSector?: string;
  /** What the founder says the money is FOR. Collected on screen one since the
   *  beginning and, until now, matched against nothing. */
  useOfFunds?: string[];
  /** The founder's NUTS region (regions.generated.ts), when they have been
   *  asked for it. The one field that can separate the 119 leaves sharing a
   *  scheme name with a sibling: they are one notified scheme delivered by
   *  many bodies, so their text, their article and their cheque size are
   *  identical and only the applicant's location differs. See regionScorer. */
  founderRegion?: string;
  /** Everything the founder actually answered, for the ONE thing that needs
   *  the whole answer set rather than a single field: checking each leaf's own
   *  encoded rules against them. Read only in `materialiseInstrumentTable`,
   *  where gates are already in memory — selection above must stay gate-free.
   *  See `gateFitScorer`. */
  eligibility?: EligibilityAnswers;
  /** Records every fund this function removes. Optional: callers that do not
   *  care about the funnel need not thread one through. */
  log?: ExclusionLog;
}

/** One chosen row before its gates are known: the channel-level facts, plus
 *  the instrument it resolved to (null when only a channel-level row is
 *  honest). Deliberately gate-free, so selection cannot depend on them. */
export interface RowSelection {
  base: Omit<InstrumentRow, "instrument">;
  leaf: DbInstrument | null;
}

/**
 * Choose what the table will contain, WITHOUT reading a single gate.
 *
 * The whole two-phase design rests on this staying true: gates are fetched for
 * the instruments this returns, so anything here that read a gate would be
 * reading one that has not been loaded yet — and on the Postgres path that is
 * an empty array, not an error.
 */
export function selectInstrumentRows(input: InstrumentTableInput): RowSelection[] {
  const {
    fieldChannels, ticketBand, consortiumOk, description, semantic, founderSector, log,
    founderCountries = [], capitalSought = [],
  } = input;
  // Establishment is the first condition of every instrument in this corpus:
  // it is all EU and EEA public money, and none of it is open to a company
  // with no entity in a covered country. Stated once here rather than encoded
  // on 706 instruments, because it is a property of the corpus rather than of
  // any fund.
  //
  // A country we cannot resolve is not missing information, it is a company
  // outside our scope. Reading it as "no info, do not over-filter" is how a
  // San Francisco business with no European entity was shown German state aid
  // and five EU programmes.
  if (founderCountries.length > 0 &&
      !founderCountries.some((c) => toIso2(c))) {
    log?.record("SEL-COUNTRY", "*",
      `no establishment in a covered country (${founderCountries.join(", ")})`);
    return [];
  }
  // What the degradation policy cost THIS founder.
  //
  // publishableInstruments() withholds rows whose openness cannot be confirmed
  // (liveness.ts), and it has no request context, so the removal is recorded
  // here where the founder's countries are known. Reporting all of them would
  // be noise and would also be untrue: 73 of tonight's 80 are French, and a
  // German founder lost nothing. What is logged is what was actually taken off
  // this table, and the brief's withheld notice is built from this count.
  //
  // Note the order: dbInstrumentsByBucket() below reads the same filtered
  // corpus, so this is a record of a decision already made, never a second
  // filter. Nothing here removes anything.
  for (const r of suppressedForUnconfirmedLiveness()) {
    if (!instrumentServesCountry(r.country, founderCountries)) continue;
    log?.record("SEL-UNCONFIRMED-OPEN", r.id, r.reason);
  }
  const codes = new Set(fieldChannels);
  const idx = ticketBand ? BAND_INDEX[ticketBand] : undefined;
  if (idx !== undefined && idx >= 3) {
    // A big ticket opens the large-scale lane, but it does not make every
    // large-scale fund relevant. Unconditionally adding these handed a
    // consumer neobank IPCEI Tech4cure (health) and IPCEI Cloud, and handed a
    // robotics maker Innovation Fund PLT (decarbonisation pilots) — funds the
    // semantic layer had scored so low they were not even in its top 40. The
    // writer then had to spend rows telling the founder "do not pursue".
    //
    // So when we have a semantic read, a large-scale channel must earn its
    // place: at least one of its leaves has to be thematically plausible.
    // Without a semantic read (no Voyage key, no description) the old
    // behaviour stands, since scale alone is still better than nothing.
    // Score every large-scale leaf in ONE pass so the channels compete with
    // each other. Scoring per channel is meaningless: themeRelevance
    // normalises to the best match within the set it is handed, so each
    // channel's own best leaf always came back as 1.00 and nothing was ever
    // filtered. Semantic where we have it (the memo path), lexical otherwise —
    // the instant verdict path is contractually model-free, and without a
    // fallback the founder's FIRST table still showed a neobank "IPCEI
    // Med4cure" while only the final memo was clean.
    const largeScaleLeaves = LARGE_SCALE_TOPUP.flatMap(
      (c) => (dbInstrumentsByBucket().get(c) ?? []).map((l) => ({ channel: c, id: l.id })),
    );
    //
    // Gated on the SEMANTIC read only. A lexical fallback was tried and
    // removed: it behaved erratically, cutting BioNTech's table to three rows
    // while still leaving a neobank its health IPCEI, because lexical overlap
    // between a company description and a fund's legal text is too sparse to
    // threshold on. The instant verdict path is model-free by contract, so it
    // keeps the old scale-only behaviour and the memo corrects it — a rough
    // preliminary read is honest, an erratic one is not.
    const largeScaleRel = semantic?.size ? semantic : new Map<string, number>();
    for (const c of LARGE_SCALE_TOPUP) {
      if (largeScaleRel.size) {
        const best = Math.max(
          0,
          ...largeScaleLeaves.filter((l) => l.channel === c).map((l) => largeScaleRel.get(l.id) ?? 0),
        );
        if (best < LARGE_SCALE_RELEVANCE_FLOOR) {
          log?.record("SEL-LARGE-SCALE", c,
            `best thematic score ${best.toFixed(2)} below the ${LARGE_SCALE_RELEVANCE_FLOOR} floor for large-ticket channels`);
          continue;
        }
      }
      codes.add(c);
    }
  }
  for (const c of DEFAULT_INSTRUMENTS) {
    // Raised from 4. This cap, not any of the downstream filters, is what made
    // briefs thin: at most ~4 channels x 2 leaves is 8 rows BEFORE blocked
    // funds, duplicate names and the writer's own rejections take their cut,
    // and Nebius and Corti both bottomed out at two institutions. The brief
    // publishes up to five, so the pool feeding it has to be comfortably
    // larger than five.
    if (codes.size >= MIN_CHANNELS_CONSIDERED) {
      if (!codes.has(c)) log?.record("SEL-CHANNEL-CAP", c, `channel pool already at its cap of ${MIN_CHANNELS_CONSIDERED}`);
      continue;
    }
    // Only an explicit "no" rules out consortium-heavy channels. Treating
    // "not sure" as a no silently removed Horizon and the EIT KICs for every
    // undecided founder — the same unsure-means-failure mistake fixed in the
    // evaluator. Rows still carry a fitFlag so they are never presented as
    // equivalent to a solo-applicant route.
    // Consortium requirement is a scored component now (structureFit), read
    // from each instrument's own encoded gates rather than declared once per
    // channel in a curated brief. Nine differently-structured programmes in
    // one bucket used to inherit a single verdict.
    codes.add(c);
  }
  // Thematic top-up: pull in a channel nobody's peers used when it holds an
  // instrument that plainly funds what this company does. Without this the
  // shortlist is peer-driven plus a fixed default list, so a satellite company
  // could never reach EUSPA and a rail company could never reach Europe's Rail
  // — their whole channel was absent, not merely mis-ranked. Consortium-heavy
  // channels still respect the consortium gate.
  const thematicFirst: string[] = [];
  for (const hit of thematicChannelTopUp(description, codes, 2, semantic)) {
    thematicFirst.push(hit.channel);
    codes.add(hit.channel);
  }
  // Thematic matches lead the list. Callers slice to DISPLAY_CAP (6) before the
  // memo ever sees the table, and a top-up appended last was being truncated
  // away — so the channel was correctly identified and then silently dropped.
  // Channels are ordered by how well they fit THIS founder, not by a fixed list.
  //
  // DEFAULT_INSTRUMENTS is a priority order -- national_dev_banks, state_aid_satr,
  // eic, horizon_eu_pillar_ii, eit -- and rows are taken channel by channel, two
  // per channel, against a display cap of six. The first three channels
  // therefore consumed every row and Horizon Pillar II could never reach the
  // table for ANY founder.
  //
  // Measured by replaying real recipients: across 47 cases where the right fund
  // was in the pool but not shown, it was horizon_eu_pillar_ii in 39 of them,
  // while Horizon appeared in 3 of 282 shown rows. Only 2 of 282 shown rows were
  // even in the same channel as the fund the company actually won.
  //
  // So the remaining channels are sorted by their best leaf's score for this
  // founder. Thematic top-ups still lead: they were identified because the
  // founder's own words point at them, which is a stronger claim than a
  // score comparison across channels.
  // Semantic where we have it, lexical otherwise -- the same signal the leaf
  // ranking uses, so a channel cannot be ordered by one measure and its leaves
  // by another.
  const channelRelevance = semantic?.size
    ? semantic
    : themeRelevance(description ?? "", [...dbInstrumentsByBucket().values()]
        .flat().map((i) => i.id));
  const relevanceFor = (id: string) => channelRelevance.get(id) ?? 0;
  const channelScore = (c: string): number => {
    const leaves = dbInstrumentsByBucket().get(c) ?? [];
    let best = 0;
    for (const i of leaves) {
      const r = relevanceFor(i.id);
      if (r > best) best = r;
    }
    return best;
  };
  // Where funding of this kind is ACTUALLY won, from the corpus.
  //
  // Channel order was decided by text richness: EU programmes carry ~534 project
  // titles per leaf and national schemes carry zero, so every semantic signal
  // favours the EU side. Measured against real awards in the six main markets,
  // 77.8% of funded companies won national state aid and 14.5% Horizon Pillar
  // II -- and the published table was close to the inverse. The product showed
  // the 22% and under-showed the 78%.
  //
  // A prior, not a rule: it names no channel, it is re-estimated from the corpus
  // on every ETL run, and a country whose funding really does come from EU
  // programmes still gets EU rows because that is what its own data says.
  const prior = channelPrior(founderCountries[0], founderSector);
  const rest = [...codes].filter((c) => !thematicFirst.includes(c));
  rest.sort((a, b) => {
    // Rounded, for the reason given on the row sort: the offline path reads
    // cached scores and production reads pgvector, and raw floats reorder ties
    // between the two stores.
    // Thematic fit BLENDED with the prior. Neither alone: fit alone is what
    // inverted the table, and the prior alone would hand every founder the same
    // channels regardless of what they build.
    const sc = (x: string) =>
      Math.round(((1 - PRIOR_WEIGHT) * channelScore(x)
                  + PRIOR_WEIGHT * (prior[x] ?? 0)) * 1e6);
    const d = sc(b) - sc(a);
    if (d !== 0) return d;
    // Stable fallback: the hand-ordered default list, so a founder whose
    // description says nothing thematic sees exactly what they saw before.
    return DEFAULT_INSTRUMENTS.indexOf(a) - DEFAULT_INSTRUMENTS.indexOf(b);
  });
  const ordered = [...thematicFirst, ...rest];
  return ordered
    .flatMap((channel): RowSelection[] => {
      const snap = loadFundSnapshot(channel);
      if (!snap) return [];
      const fitFlag = snap.fit && snap.fit !== "startup_ready" ? FIT_FLAG[snap.fit] : undefined;
      const base = {
        channel,
        ticket: snap.ticket,
        speed: snap.speed,
        giveUp: snap.giveUp,
        bestFor: snap.bestFor,
        usedInField: fieldChannels.has(channel),
        fit: snap.fit,
        fitFlag,
      };
      const leaves = selectLeafInstruments({
        channel, founderCountries, capitalSought, ticketBand, description, semantic,
        founderSector: input.founderSector, useOfFunds: input.useOfFunds, log,
      });
      if (!leaves.length) {
        // A channel-level row is an honest stand-in when we simply hold no
        // leaf detail. It is NOT honest when the reason there are no leaves is
        // that this founder's country is not served: selectLeafInstruments
        // returns nothing for a national channel precisely so we say "nothing
        // here", and publishing "National development banks" instead told a
        // San Francisco company with no European entity to go and find one.
        if (NATIONAL_CHANNELS.has(channel) && founderCountries.length > 0) {
          log?.record("SEL-NATIONAL-EMPTY", channel,
            "national channel with no instrument in the founder's countries");
          return [];
        }
        return [{ base, leaf: null }];
      }
      return leaves.map((leaf) => ({ base, leaf }));
    });
}

/**
 * Turn selected instruments into published rows.
 *
 * Everything here reads GATES — legalBasisFor, accessMode, judgementCriteria,
 * structuringNotes and the dedupe's encodedCount — which is exactly why it is
 * separated from selection above. Selection traffics in DbInstrumentLite and
 * cannot touch gates; by the time this runs, hydrateGatesFor has fetched them
 * for the handful of instruments that got this far.
 */

// ── Peer precedent: what funds do companies LIKE THIS one actually win? ────
//
// Built by ETL/terms/emit_peer_prior.py from 627,957 traced (company ->
// instrument) award pairs, capped at 40 companies per instrument so the prior
// says "recurs for this kind of company" rather than "is enormous".
//
// This is the signal that broke a long plateau. Four previous attempts at
// exact-scheme recall -- corpus enrichment, the adaptive round, gate-fit
// ranking, region -- all measured flat at ~23%, because each tried to improve
// how well a founder's ATTRIBUTES match a fund's DESCRIPTION. This asks a
// different question: what happened to companies like them.
//
// Measured on a 150-company holdout sample, every test company excluded from
// the prior:
//
//     ranker alone              24%
//     peer precedent alone      27%
//     both right, same case     10 cases
//     UNION                     45%      <- almost orthogonal
//     1 ranker slot + peer fill 43%
//
// The ranker keeps the top slot because it catches 26 cases peer misses; peer
// fills the rest because it catches 32 the ranker misses. Neither dominates.
let peerPriorCache: Record<string, string[]> | undefined;

/** Exported for the ordering diagnostic; see `awardScorer`. */
export function peerPrior(country?: string, sector?: string): string[] {
  if (!country || !sector) return [];
  if (peerPriorCache === undefined) {
    try {
      peerPriorCache = JSON.parse(readFileSync(
        path.join(process.cwd(), "lib", "intelligence", "peerPrior.generated.json"),
        "utf8")) as Record<string, string[]>;
    } catch {
      peerPriorCache = {};
    }
  }
  return peerPriorCache[`${toIso2(country)}|${sector}`] ?? [];
}

/** Reorder a ranked table so peer precedent fills the visible slots.
 *
 *  Order-preserving where it can be: the ranker's single best row stays first,
 *  every row the peer prior knows about follows in peer order, and anything
 *  left keeps its original relative position. Nothing is added or removed --
 *  a fund the founder's own screen excluded can never re-enter here. */
function applyPeerPrecedence(
  rows: InstrumentRow[], country?: string, sector?: string,
  /** How much the founder's own words already tell us. Peer precedence answers
   *  "what do companies like this win", which is the best available signal when
   *  we know little about THIS project -- and the worst thing to lean on when
   *  the founder has described a specific one. Measured: applying it flat took
   *  the national-scheme founder from 76% to 94% regime recall and took the
   *  EU-project founder from 81% down to 47%, because peers skew national.
   *  So it steps aside where the description already discriminates. */
  descriptionIsSpecific = false,
): InstrumentRow[] {
  const ranked = peerPrior(country, sector);
  if (rows.length < 3 || !ranked.length) return rows;
  // A founder with a real project keeps the ranker's order for the top rows;
  // peer precedence only fills behind them.
  if (descriptionIsSpecific) {
    const rankOfP = new Map(ranked.map((id, i) => [id, i]));
    const head = rows.slice(0, 3);
    const tail = rows.slice(3).sort((a, b) =>
      (rankOfP.get(a.instrumentId ?? "") ?? 1e9) - (rankOfP.get(b.instrumentId ?? "") ?? 1e9));
    return [...head, ...tail];
  }
  const rankOf = new Map(ranked.map((id, i) => [id, i]));
  const [lead, ...rest] = rows;
  const known = rest.filter((r) => r.instrumentId && rankOf.has(r.instrumentId))
    .sort((a, b) => (rankOf.get(a.instrumentId!) ?? 1e9) - (rankOf.get(b.instrumentId!) ?? 1e9));
  const unknown = rest.filter((r) => !r.instrumentId || !rankOf.has(r.instrumentId));
  // One row per NOTIFIED SCHEME in the visible order.
  //
  // The dedupe above keys on display NAME, which is enough while ranking is
  // fit-driven. Peer precedence breaks that assumption: it can pull the equity
  // and the R&D child of ONE notified scheme (SA.111723) into the five at
  // once, because both are genuinely funds that companies like this won. They
  // are one door, and showing a founder the same SA number twice spends two of
  // five slots saying one thing.
  // DEMOTED, never dropped. This function returns the array the caller also
  // derives `candidateInstrumentIds` from, so filtering here would remove funds
  // from the WRITER's pool and not merely from the visible five -- measured
  // immediately: pool recall fell 97% -> 83% when this was a filter. Repeats go
  // to the back instead, so the table shows one row per scheme while the pool
  // keeps every fund the founder actually qualifies for.
  const seenScheme = new Set<string>();
  const firsts: InstrumentRow[] = [];
  const repeats: InstrumentRow[] = [];
  for (const r of [lead, ...known, ...unknown]) {
    const code = (r.schemeCode ?? "").trim();
    if (code && seenScheme.has(code)) { repeats.push(r); continue; }
    if (code) seenScheme.add(code);
    firsts.push(r);
  }
  return [...firsts, ...repeats];
}

export function materialiseInstrumentTable(
  selections: RowSelection[],
  input: InstrumentTableInput,
): InstrumentRow[] {
  const { consortiumOk, semantic, description, founderSector, founderCountries, useOfFunds, ticketBand, founderRegion, eligibility, log } = input;
  // Same signal the leaf ranking uses, so a row cannot be ordered by one
  // measure and the leaf inside it by another.
  const rel = semantic?.size
    ? semantic
    : themeRelevance(description ?? "",
        selections.map((s) => s.leaf?.id).filter((id): id is string => Boolean(id)));
  // The same blend the leaf ranking uses, not thematic relevance alone.
  //
  // A founder applying to a national scheme has no project text -- SATR and the
  // development banks carry no per-project titles at all -- so `rel` is 0 for
  // every row and this sort fell straight through to a hardcoded channel order.
  // sectorFit, the share of a fund's real recipients in the founder's sector,
  // is the strongest signal available in that case (41% top-5 on its own
  // against a 6% baseline) and it was reaching the leaf ranking but never the
  // row ranking.
  // The blend weight is FIXED, and the population split is handled one layer
  // down instead. This is a correction, not a simplification.
  //
  // The intent recorded here was that `wTheme` should fall to 0 for a founder
  // with no project text, so sector share could carry the ranking. That branch
  // had never executed (see below), and when the switch was repaired and it
  // finally did, it measured as damage: holdout EXACT@5 32% -> 33% but REGIME@5
  // 87% -> 86%, with project-mode recall falling 47% -> 37% exact and 76% -> 66%
  // regime. Dropping the thematic weight to zero throws away a real description
  // whenever the discriminator is wrong about it, and the discriminator is wrong
  // about 13% of them.
  //
  // Routing ONLY the peer-precedence branch on the same signal, and leaving
  // `wTheme` alone, gains on both metrics at once:
  //
  //     shipped (switch stuck on)     EXACT@5 32%   REGIME@5 87%
  //     switch repaired, wTheme too   EXACT@5 33%   REGIME@5 86%
  //     switch repaired, wTheme fixed EXACT@5 36%   REGIME@5 89%
  //
  // The reason the two behave differently is that they fail differently. Peer
  // precedence is ORTHOGONAL to fit -- being wrong about the population costs a
  // few positions in the tail. `wTheme` is the fit signal itself; being wrong
  // there deletes it. So the uncertain switch is allowed to steer the cheap
  // decision and not the expensive one.
  const wTheme = THEME_DOMINANT_WEIGHT;
  // How much the founder's description actually SEPARATES the funds, not merely
  // whether it produced scores.
  //
  // "Informative" was true for every founder, because a generic self-description
  // still returns similarity for everything -- so a specific EU project and a
  // one-line company summary were treated alike, and the prior tuned for one
  // wrecked the other. Spread is the honest test: a description that names a
  // technology peaks sharply on a few funds, one that says "we build software"
  // scores everything the same.
  //
  // The test was right and its input was wrong. This read `rel`, and `rel` holds
  // PERCENTILE RANKS (semantic.ts) -- a distribution that is uniform on [0,1] by
  // construction, so `max/mean - 1` came out 0.998 for every query ever made and
  // `themeInformative` was a true constant. The whole second branch below, and
  // the flat branch of applyPeerPrecedence, were unreachable code with measured
  // justifications attached to them.
  //
  // `semanticSeparation` is the same statistic computed where the information
  // still exists: on the raw cosines, before the rank normalisation. Measured
  // against the live index over the 11 canned sector templates and 19 real
  // project descriptions in the recall set, it splits the two populations at
  // 87%, and THEME_SPREAD_FLOOR sits inside the separating interval -- the
  // threshold never needed changing either.
  //
  // Deliberately not keyed on anything the harness supplies and production does
  // not. There is no `mode` field on a real request; a founder either wrote
  // something that discriminates funds or did not, and this asks the index that
  // question directly. A description too short to embed, a cold fallback with no
  // vector store, and a lexical-only path all return `undefined` -- which must
  // read as "assume the description carries the ranking", the behaviour that
  // shipped, rather than as zero.
  //
  // ── What this switch is actually worth, measured both ways ────────────────
  // The branch was forced on and off in turn, per population, on the fixed
  // ground truth (`__recallSetPlus.json`, holdout, n=120 each):
  //
  //                       real description      canned template
  //     forced "specific"   33% / 79%             18% / 95%
  //     forced flat         30% / 73%             25% / 95%
  //
  // So each population does prefer its own branch, and at the true 16/84 mix
  // perfect routing scores EXACT@5 26.3% against 20.4% for the stuck-on
  // behaviour that shipped before the statistic was fixed.
  //
  // But it also scores 25.8% for simply ALWAYS taking the flat branch. The
  // switch is worth about half a point over having no switch at all, because
  // the population that needs the "specific" branch is 16% of founders and
  // loses only 3 points by being routed flat. The audit's reconstruction --
  // "routing correctly is worth 40% against 32%" -- was measured against the
  // old ground truth and the old stuck-on code; it does not reproduce here.
  // Keep the switch (it is right on both populations and costs nothing), but
  // do not spend further effort on the discriminator: the headroom above it
  // is under a point.
  const spread = semanticSeparation(description);
  const themeInformative = spread === undefined || spread >= THEME_SPREAD_FLOOR;
  // The prior belongs HERE, not only in channel ordering. Ordering decides
  // which channels are considered; this sort decides the five rows, and it
  // overrides that order completely -- so applying the prior upstream alone
  // changed nothing (73% -> 73%).
  const prior = channelPrior(founderCountries?.[0], founderSector);
  const baseRelevance = (id: string) => {
    const inst = instById().get(id);
    const theme = rel.get(id) ?? 0;
    return wTheme * theme + (1 - wTheme) * sectorFit(inst?.sectorMix, founderSector);
  };
  // Re-rank SIBLINGS on registered purpose, award scale and delivery region.
  //
  // Diagnosed rather than guessed: with the pool cap fixed, 57 of 67 ranking
  // misses had a sibling from the SAME channel shown instead. The regime is
  // right; the scheme is not. All three signals are per-scheme facts that
  // siblings do not share -- the GBER article a scheme was notified under, the
  // median it has actually paid, and where its recipients are.
  //
  // Region is the one that reaches the hardest case. The other two are, by
  // construction, silent on a same-name group: fourteen leaves under one
  // notified regime were notified under one article and write one size of
  // cheque, so `obj` and `awd` return the same value for all fourteen and the
  // group falls through to thematic relevance between texts at 0.947 cosine.
  // Where the recipients are is the only fact that differs.
  //
  // Scoped per channel and normalised to a geometric mean of 1 within each, so
  // a leaf can gain only on its siblings and never on another channel. That
  // constraint is the whole design: applied globally these become channel
  // priors (objective coverage IS state aid) and cost 21 points when tried.
  const byChannel = new Map<string, RowSelection[]>();
  for (const sel of selections) {
    const list = byChannel.get(sel.base.channel) ?? [];
    list.push(sel);
    byChannel.set(sel.base.channel, list);
  }
  // Rank-PRESERVING, which is the part that took three attempts to get right.
  //
  // A multiplier -- even one normalised to a geometric mean of 1 within its
  // group -- still widens that group's spread, and a wider spread pushes the
  // group's best member up across channels. Measured: profile-mode regime
  // recall 78% -> 88% while project-mode fell 81% -> 62%, which is the same
  // population trade that sank the channel prior.
  //
  // So the scores a channel occupies are held fixed and only their ASSIGNMENT
  // changes. Each channel keeps its exact multiset of row scores; the siblings
  // are sorted by registered purpose and award scale, and handed those same
  // scores in order. Regime-level composition is therefore unchanged by
  // construction -- the table shows the same channels in the same places -- and
  // the only thing that can move is WHICH sibling is the one shown.
  //
  // That is exactly the diagnosed failure: 57 of 67 ranking misses had a
  // sibling of the won fund shown instead of it.
  const reassigned = new Map<string, number>();
  for (const [, group] of byChannel) {
    const leaves = group.map((g) => g.leaf).filter((l): l is DbInstrument => Boolean(l));
    if (leaves.length < 2) continue;
    const obj = objectiveScorer(leaves.map((l) => l.id), useOfFunds);
    const awd = awardScorer(leaves, input.ticketBand);
    const reg = regionScorer(leaves, founderRegion);
    // What the founder actually clears, per leaf. The fourth per-scheme fact
    // siblings do not share, and the only one built from the fund's own
    // eligibility TEXT rather than from its award history. See gateFitScorer.
    const gate = gateFitScorer(leaves, eligibility);
    const pref = (l: DbInstrument) => obj(l.id) * awd(l) * reg(l) * gate(l);
    // Nothing to say about these siblings: leave the channel untouched.
    if (leaves.every((l) => pref(l) === pref(leaves[0]))) continue;
    const slots = leaves.map((l) => baseRelevance(l.id)).sort((a, b) => b - a);
    const order = [...leaves].sort((a, b) =>
      (pref(b) - pref(a)) || (baseRelevance(b.id) - baseRelevance(a.id))
      || a.id.localeCompare(b.id));
    order.forEach((l, i) => reassigned.set(l.id, slots[i]));
  }
  // Does this fund write cheques the size the founder asked for?
  //
  // `ticketBand` sits on the FIRST SCREEN -- one of only six questions a
  // founder answers before seeing anything -- and until now it never reached
  // the row sort. Measured before fixing: a founder asking for >EUR 50M and one
  // asking for <EUR 500k were shown the IDENTICAL five rows, mean award median
  // EUR 219,274. We were showing someone seeking EUR 50M a set of funds that
  // write EUR 219k cheques, having just asked them how much they needed.
  //
  // Ticket fit did exist, but only in `selectLeafInstruments`, which is close
  // to inert: POOL_LEAVES_PER_CHANNEL admits 90 leaves per channel against a
  // widest real group of 87, so nearly every candidate survives leaf ranking
  // and this sort re-orders them on theme and sector alone. (The figure in this
  // comment said 40 for as long as the constant did not.)
  //
  // Scored on ORDER OF MAGNITUDE, reusing the same rule as the leaf scorer: a
  // EUR 20k median is not a route to EUR 1M however well it matches
  // thematically, while EUR 800k against EUR 1.1M is the same cheque. Applied
  // as a multiplier and normalised within the rows that HAVE an award median,
  // so funds with no recorded awards (98 of 950) are neither rewarded nor
  // punished for a gap in our data.
  const ticketFit = awardScorer(
    selections.map((s) => s.leaf).filter((l): l is DbInstrument => Boolean(l)),
    ticketBand,
  );
  const rowRelevance = (r: InstrumentRow) => {
    const inst = r.instrumentId ? instById().get(r.instrumentId) : undefined;
    const theme = r.instrumentId ? rel.get(r.instrumentId) ?? 0 : 0;
    const fit = wTheme * theme + (1 - wTheme) * sectorFit(inst?.sectorMix, founderSector);
    const ticket = inst ? ticketFit(inst) : 1;
    // The channel prior is deliberately NOT applied here yet. Measured, at
    // three weightings, on the recall set:
    //
    //   flat 0.5              national regime 64% -> 100%, EU 77% -> 15%
    //   0.15 with text        national 87%, EU 63%          net 73% -> 72%
    //   gated on score spread identical to the above
    //
    // It trades one population for the other every time, because the prior is a
    // population statistic and the row sort is the one place a specific founder's
    // evidence should win. The artifact and the finding are kept
    // (channelPrior.generated.json, project-mgmt/recall_95_next.md); what is
    // missing is a discriminator that says whether THIS founder's description
    // separates the funds. Neither "did it produce scores" nor "is the score
    // distribution peaked" does -- both are true for a generic self-description.
    // Ticket fit multiplies the row's score. It was computed here and DROPPED:
    // the returned expression named only `fit` and `reassigned`, so from the
    // commit that added it ("Make ticketBand actually affect what a founder is
    // shown") to today, `ticket` was assigned and never read. The comment above
    // described a term that had never executed.
    //
    // What kept it hidden is that `measure_recall.ts` feeds every replay the
    // same ticketBand, so a signal that discriminates BY ticket cannot move that
    // number either way -- which is exactly what the original commit said about
    // its own change, and then the number stayed flat for the other reason too.
    //
    // Observed directly instead (`scripts/check_ticket_effect.ts`, 12 profiles,
    // mean awardP50 of the five shown rows):
    //
    //                    b2m5_15m   b15m_50m      gt50m
    //   dropped           510,143  1,118,196  1,118,196
    //   multiplied in     553,849  1,261,472  1,389,064
    //
    // The two largest bands were returning the IDENTICAL table: the only live
    // ticket signal was the sibling reassignment, whose permutation saturates
    // once the ask is above every fund's median, so "EUR 15-50M" and "over EUR
    // 50M" ranked the corpus the same way. They now separate.
    //
    // Applied on top of `reassigned` rather than inside it, because the
    // reassignment is rank-preserving BY DESIGN -- it may only change which
    // sibling holds a slot, never which channel does -- and ticket size is a
    // property the founder stated about themselves, so it is allowed to move a
    // row across channels. Recall, both sets, holdout n=200: EXACT@5 35% -> 36%
    // with REGIME@5 unchanged at 89%.
    const base = r.instrumentId ? reassigned.get(r.instrumentId) ?? fit : fit;
    return base * ticket;
  };
  const ranked = selections
    .map(({ base, leaf }): InstrumentRow => {
      if (!leaf) {
        return { ...base, instrument: INSTRUMENT_NAME[base.channel] ?? channelLabel(base.channel) } as InstrumentRow;
      }
      return {
        ...base,
        instrument: leaf.name,
        instrumentId: leaf.id,
        country: leaf.country,
        capitalType: leaf.capitalType,
        eventCount: leaf.eventCount,
        administeringBody: leaf.administeringBody ?? undefined,
        administeringBodyShare: leaf.administeringBodyShare ?? undefined,
        deliveryRegion: leaf.deliveryRegion ?? undefined,
        deliveryRegionShare: leaf.deliveryRegionShare ?? undefined,
        lastAwardYear: leaf.lastYear ?? undefined,
        legalBasis: legalBasisFor(leaf),
        schemeCode: leaf.schemeCode ?? undefined,
        schemeOperators: leaf.schemeOperators ?? undefined,
        // Only reaches a founder who asked for equity. Said plainly, because
        // "an investor who will take a seat" is a different commitment from
        // "a grant you apply for", and the row should not blur them.
        accessMode: accessMode(leaf),
        applicationUrl: leaf.application?.url ?? undefined,
        applicationChannel: leaf.application?.channel ?? undefined,
        applicationTimeline: leaf.application?.timeline ?? undefined,
        // The channel's curated ticket line describes a whole programme
        // family. This leaf's own median describes what it has really paid,
        // and the two can be an order of magnitude apart: ADEME's curated
        // range sat against a measured median of EUR 20,000. Shown WITH its n,
        // because a median over 12 awards and one over 12,000 are different
        // claims and the row should not present them identically.
        typicalAward: leaf.awardP50 ?? undefined,
        typicalAwardN: leaf.awardN ?? undefined,
        aidIntensity: leaf.intensityP50 ?? undefined,
        aidIntensityN: leaf.intensityN ?? undefined,
        descriptor: fundDescriptor(leaf),
        // Where this sits in its agency's structure. A programme means more
        // read against its parent -- "Tremplin" alone is opaque, "ADEME >
        // Tremplin" says who runs it and that ADEME has others. Only shown
        // when the parent is a real family, never when it repeats the row.
        familyName: familyLabel(leaf),
        // What the scheme is REGISTERED to fund, verbatim from its GBER
        // article. Does not rank -- measured at zero -- but it is the sharpest
        // citable fact we hold about a national scheme: "notified under Art.
        // 25(2)(b) for industrial research" is structuring detail a founder can
        // act on, where "German R&D aid" is a label any model could produce.
        registeredPurpose: registeredPurpose(leaf.id),
        judgementCriteria: judgementCriteria(leaf),
        structuringNotes: structuringNotes(leaf),
      } as InstrumentRow;
    })
    .sort((a, b) => {
      // Proven-in-field first.
      //
      // Measured cost of these two tiers, tune split: EXACT@5 51% -> 49%,
      // REGIME@5 76% -> 73%. Kept, because they encode a product judgement the
      // recall number cannot see -- a fund proven in the founder's field, and
      // capital a startup can actually take, belong above a marginally better
      // thematic match they cannot use. Three points is the price and it is
      // recorded here so it is a choice rather than an oversight.
      if (a.usedInField !== b.usedInField) return a.usedInField ? -1 : 1;
      // Startup-ready capital next, unless the founder is consortium-ready
      // (then consortium/institutional rows aren't artificially demoted).
      const demote = (r: InstrumentRow) =>
        r.fit !== "" && r.fit !== "startup_ready" &&
        !(r.fit === "consortium_institutional" && consortiumOk);
      const da = demote(a), db = demote(b);
      if (da !== db) return da ? 1 : -1;
      // Thematic fit to THIS founder, then the hand-ordered list as a stable
      // fallback.
      //
      // This was INSTRUMENT_PRIORITY alone -- a second hardcoded channel order,
      // applied after selection had already ordered channels, silently
      // discarding that work. Two fixed priority lists in one pipeline meant no
      // founder's own description could move a channel up the table.
      //
      // Measured: across 47 replays where the fund a company actually won was
      // in the pool but not shown, it was horizon_eu_pillar_ii in 39 of them,
      // and Horizon appeared in 3 of 282 shown rows. national_dev_banks,
      // state_aid_satr and eic sit first in both lists and consumed all six
      // rows for everybody.
      // Rounded before comparing: the offline path reads scores from the
      // committed cache (6 dp) and production reads them live from pgvector, so
      // raw floats differ in the last places and reorder tied rows. The parity
      // check catches exactly that, and an order that depends on which store
      // answered is not an order.
      const ra = Math.round(rowRelevance(a) * 1e6);
      const rb = Math.round(rowRelevance(b) * 1e6);
      if (ra !== rb) return rb - ra;
      const pa = INSTRUMENT_PRIORITY.indexOf(a.channel);
      const pb = INSTRUMENT_PRIORITY.indexOf(b.channel);
      if (pa !== pb) return pa - pb;
      // Total order, so the sort cannot depend on the order rows arrived in.
      return (a.instrumentId ?? "").localeCompare(b.instrumentId ?? "");
    });
  // One row per institution NAME. 322 instruments share only 143 display
  // names, and selectLeafInstruments returns up to two leaves per channel,
  // so a founder could see "Enterprise Ireland" or "Norges Forskningsrad"
  // twice in the same table — which reads as a bug even when both rows are
  // real. Resolved here rather than at the call sites so the preliminary
  // verdict table and the memo's five institutions can never disagree.
  // Keep the leaf that can actually say something: the one with the most
  // ENCODED eligibility rules. First-wins looked right but is not — the sort
  // above orders by fit and channel priority, which knows nothing about
  // encoding coverage, so it kept an Enterprise Ireland leaf with zero
  // encoded rules over a sibling that returned a real "open" verdict.
  //
  // ── DEMOTED, never dropped ────────────────────────────────────────────────
  // This was a `.filter()`, and the array it filters is the one the caller
  // derives `candidateInstrumentIds` from — so a DISPLAY rule was deleting funds
  // from the writer's pool, where nothing downstream can recover them or even
  // report their absence. `applyPeerPrecedence` already made exactly this
  // correction for the notified-scheme repeat forty lines below, on exactly this
  // reasoning and with the measurement to match (pool 97% -> 83% when that one
  // was a filter). The two collapses were the same defect and only one of them
  // had been fixed.
  //
  // Measured before changing it, live Postgres corpus, one founder per country
  // across 22 countries: this rule removed 4 rows in total (DE 1, IT 1, CZ 2)
  // and 0 in the other 19 markets. It is nearly dead because `administering_body`
  // now separates siblings — DE's mean same-name class fell 91.8 -> 4.2 — and
  // `distinguishRowNames` reads that field. What it still catches is a different
  // thing from what it was written for: two DISTINCT notified schemes (different
  // SA numbers, different budgets, different granting decisions) that publish
  // under one shared title. A founder genuinely cannot tell those apart on the
  // page, so the display rule is right; deleting the second from the universe is
  // not, because they are two funds.
  //
  // Demotion satisfies both. The visible order is UNCHANGED — the losers move to
  // the very back, past `applyPeerPrecedence`, so every row a founder sees today
  // is the row they see now — and the pool keeps the fund.
  //
  // The collapse itself lives in `nameCollision.ts`, extracted so the invariant
  // above is a TEST rather than a comment: `visible + demoted === input` fails
  // the moment anyone turns this back into a `.filter()`, which is exactly the
  // simplification a reader without the history would reach for.
  distinguishRowNames(ranked);
  const encodedCount = (r: InstrumentRow) => {
    const inst = r.instrumentId ? instById().get(r.instrumentId) : undefined;
    return inst ? inst.gates.filter(
      (g) => g.valueSpec && (!g.gateRole || g.gateRole === "filter")).length : 0;
  };
  // Rows that genuinely cannot be told apart still collapse in the TABLE, but
  // the survivor is not decided by array position. encodedCount ties in 70% of
  // SATR cases -- siblings inherit their regime's gates, so the counts are
  // identical -- and the old reduce kept whichever came first. Prefer the leaf
  // carrying evidence of its OWN, then the richer one, then a total order on id
  // so the result cannot depend on hydration sequence.
  const ownCount = (r: InstrumentRow) => {
    const inst = r.instrumentId ? instById().get(r.instrumentId) : undefined;
    return inst ? inst.gates.filter((g) => !g.inherited).length : 0;
  };
  // ONE label function, passed to both the disambiguator and the collapse.
  // displayInstitutionName rebuilds the name from country + kind + scheme code
  // and never reads `row.instrument`, so while these were two functions the
  // disambiguator's work was invisible here and rows it had just told apart
  // were still collapsed. Two functions, two keys, was the whole defect.
  const collision = resolveNameCollisions(ranked, rowDisplayLabel,
    (a, b) => (ownCount(b) - ownCount(a))
      || (encodedCount(b) - encodedCount(a))
      || (a.instrumentId ?? "").localeCompare(b.instrumentId ?? ""));
  for (const { row, kept, label: name } of collision.collisions) {
    // The NAME they collided on, and WHICH row survived. Without both, the log
    // says a collision happened and nothing about whether the two rows were
    // really indistinguishable -- which is the only question that decides if
    // this rule is still earning its place.
    log?.record("SEL-DUPE-NAME", row.instrumentId ?? row.channel,
      `renders as "${name}", the same label as ${kept.instrumentId ?? kept.channel}, ` +
      `which is shown instead; this row is demoted to the back of the pool, not removed`);
  }
  const rowsOut = collision.visible;
  // Peer precedent decides the visible order, last, on the surviving rows.
  // Applied here rather than inside rowRelevance so it can never resurrect a
  // row the screen excluded or a duplicate the dedupe demoted -- it only
  // reorders what already qualified.
  // `themeInformative` is already computed above: it is true when the founder's
  // description peaks sharply on a few funds rather than scoring everything
  // alike, which is exactly the "we know what this project is" condition.
  //
  // The demoted rows are appended AFTER it rather than passed through it, so
  // they cannot take a visible slot: peer precedence sorts what it is given, and
  // a duplicate handed to it can land anywhere in the order. Appending keeps the
  // table byte-identical to the version that dropped them.
  return [
    ...applyPeerPrecedence(rowsOut, founderCountries?.[0], founderSector, themeInformative),
    ...collision.demoted,
  ];
}

/**
 * Phase 4: attach the founder's free-text profile signal to the instrument
 * table as a visible, clearly-non-authoritative annotation — never reorders,
 * promotes, or demotes a row, never touches which instruments are shown.
 * That's the whole trust argument: this can only ever add a sentence, never
 * hide or resurface an eligibility-relevant instrument. Skipped entirely
 * when the model's read agrees with what the founder already self-selected
 * (nothing new to tell them), and only ever attached to the small
 * DEPTH_SENSITIVE_CHANNELS set.
 */
export function applyProfileSignal(
  rows: InstrumentRow[],
  signal: ProfileSignal | null | undefined,
  selfReportedType: string | undefined,
): InstrumentRow[] {
  // No self-reported type means nothing to diverge from — the model's read is
  // simply the archetype, not a second opinion worth flagging.
  if (!signal?.note || !selfReportedType || signal.techDepthRead === selfReportedType) return rows;
  return rows.map((r) =>
    DEPTH_SENSITIVE_CHANNELS.has(r.channel) ? { ...r, profileNote: signal.note } : r);
}

/**
 * SATR-sourced leaf instruments get an auto-generated bucket name like
 * "SATR De Equity" — SATR is the data source (the EU's State Aid
 * Transparency Register), never a fund a founder could apply to. Prefer the
 * real granting authority (administeringBody, majority-voted from the raw
 * per-event granting_authority field — see populate_funding_instruments.py)
 * whenever the current name is one of these generic register labels.
 * Curated/NDB-branded SATR names (e.g. "Spain BDNS (regional agencies)",
 * deliberately naming a multi-agency rollup) are left alone — only the
 * literal "SATR ..." auto-prettified pattern gets swapped.
 */
export function displayInstitutionName(row: InstrumentRow): string {
  // A government department notifies a state-aid regime; it does not take
  // applications. Splitting the rollups surfaced these as instrument names,
  // which reads as "go and ask the Ministry of Finance for a grant" — a
  // dead end dressed as a lead. The scheme is still real money and still
  // worth publishing, so it renders by what it IS rather than by who
  // notified it. Same definition the brief check uses, so a row can never
  // pass one and fail the other.
  if (row.administeringBody && NOT_AN_APPLYABLE_BODY.test(row.administeringBody)) {
    // Name the SCHEME, not the category. "National state aid (R&D)" told a
    // founder nothing they could act on and did not match the link beside it,
    // which points at one specific notified scheme. The row now says which
    // scheme that is; the operators who run it render underneath.
    const kind = /\bequity\b/i.test(row.instrument) ? "equity" : "R&D";
    const country = row.country && row.country !== "EU" ? `${row.country} ` : "";
    return row.schemeCode
      ? `${country}${kind} state aid scheme ${row.schemeCode}`
      : `National state aid (${kind})`;
  }
  if (row.administeringBody && row.instrument.startsWith("SATR ")) {
    // Only when that body really is the instrument. administeringBody is a
    // PLURALITY of granting authorities, and these SATR rows are whole-country
    // rollups: satr_de_rnd's top body awarded 15.3% of its line items across
    // 419 distinct authorities, satr_fr_rnd's 41.5%. Rendering those as the
    // institution told a robotics founder to approach the German agricultural
    // bank and a French fintech the ecological transition ministry. The share
    // distribution is cleanly bimodal — 15 instruments at or below 50.7%, then
    // a jump to 60.1% — so 0.6 separates "this body IS the fund" from "this is
    // a country's aid system with one busy agency in it".
    const share = row.administeringBodyShare;
    if (share === undefined || share === null || share >= 0.6) return row.administeringBody;
  }
  // Honest fallback: name what the row actually is. Mirrors the channel-level
  // label a founder already sees when their country has no SATR leaf at all.
  const kind = /\bequity\b/i.test(row.instrument) ? "equity" : "R&D";
  if (row.instrument.startsWith("SATR ")) return `National state aid (${kind})`;
  return row.instrument;
}

// Short, founder-facing labels for the GBER articles a state-aid instrument
// can be gated on — mirrors GBER_ARTICLE_GATES in
// populate_funding_instruments.py (that script seeds the
// "gber_article_inferred" gate this reads; keep both in sync if either
// changes).
export const GBER_ARTICLE_LABEL: Record<string, string> = {
  StateAidObjectiveGberArt21: "GBER Art. 21 (risk finance)",
  StateAidObjectiveGberArt22: "GBER Art. 22 (start-up aid)",
  StateAidObjectiveGberArt25: "GBER Art. 25 (R&D aid)",
  StateAidObjectiveGberArt25b: "GBER Art. 25b (feasibility studies)",
  StateAidObjectiveGberArt25c: "GBER Art. 25c (SME R&D support)",
  StateAidObjectiveGberArt26: "GBER Art. 26 (research infrastructure)",
  StateAidObjectiveGberArt27: "GBER Art. 27 (innovation clusters)",
  StateAidObjectiveGberArt28: "GBER Art. 28 (SME innovation aid)",
  StateAidObjectiveGberArt29: "GBER Art. 29 (process/organisational innovation)",
};

/**
 * "What do we check eligibility against" for this specific leaf instrument —
 * the GBER article its aid is filed under, when the DB has that gate on
 * record (seeded deterministically from real per-event aid_objective codes,
 * never modeled). Undefined when no such gate exists (most non-state-aid
 * channels — EIC, EIB, Horizon — aren't GBER-gated the same way, so this is
 * expected to be empty for them).
 */
export function legalBasisFor(leaf: DbInstrument): string | undefined {
  const gate = leaf.gates.find((g) => g.id === "gber_article_inferred");
  if (!gate) return undefined;
  return GBER_ARTICLE_LABEL[gate.value] ?? gate.requirement.split(" — ")[0];
}

/** Synchronous entry, for the JSON path and the offline scripts: gates are
 *  already in memory there, so selection and materialisation can run back to
 *  back. */
export function buildInstrumentTable(input: InstrumentTableInput): InstrumentRow[] {
  return materialiseInstrumentTable(selectInstrumentRows(input), input);
}

/** The production entry. Selects gate-free, fetches gates for exactly the
 *  instruments selected, then materialises. */
export async function buildInstrumentTableHydrated(
  input: InstrumentTableInput,
): Promise<InstrumentRow[]> {
  const selections = selectInstrumentRows(input);
  await hydrateGatesFor(
    selections.map((s) => s.leaf?.id).filter((id): id is string => Boolean(id)));
  return materialiseInstrumentTable(selections, input);
}
