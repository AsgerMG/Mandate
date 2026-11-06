// The per-instrument scoring terms the pool builder and its measurements read.
//
// ── WHAT THIS FILE IS, AFTER wsGB ─────────────────────────────────────────
// It opened "How well a fund fits this founder, as ONE NUMBER with its parts on
// show", and that number is gone. `scoreFitControl` combined nine of these
// terms into a composite and the composite's only job was to be one arm of the
// memo's deterministic sort. The model ranks the memo now, the sort is deleted,
// and what is left here is the TERMS — each with its own callers, each read as
// a column rather than as a verdict.
//
// The governing principle is unchanged and is the reason the terms survive the
// composite: a fund should never be excluded by a rule, it should fail to make
// the cut. A filter removes a fund from the universe and nothing downstream can
// recover it or explain its absence. A signal moves a fund down a list.
//
// Two things remain hard exclusions, because both are facts about an instrument
// rather than judgements about a founder: a conclusively failed encoded gate
// (verdict.ts `blocked`), and a national scheme in a country the founder cannot
// draw on. Neither is decided here.

import { BAND_INDEX, INDEFINITE_CAPITAL, TICKET_MIDPOINT, typicalAward } from "./shortlist";
import { hasThinEvidence } from "./accessMode";
import type { DbInstrument } from "./corpus";
import type { InstrumentAssessment } from "./verdict";

// ── WHAT IN THIS FILE REACHES THE FOUNDER'S TABLE, AND WHAT READS THE REST ─
//
// Screen one orders on `rowRelevance` in shortlist.ts: a blend of the semantic
// percentile and `sectorFit`, then permuted within each regime by the
// rank-preserving sibling reassignment. `sectorFit` / `sectorFitScorer` are the
// ONLY exports of this file on that path, and they are why the header above
// does not say "nothing here ranks".
//
// The memo's order is the MODEL's (agentSelect.ts). Nothing in this file
// touches it. That is new as of wsGB and it is what removed the composite: this
// header used to have to explain, at length, that seven of nine weighted
// components carrying 0.72 of the documented weight never reached the table
// while being computed for every row of every pool on every request.
//
// The remaining terms have readers, and each is named so that a future deletion
// is a decision rather than a guess:
//
//   sectorFit, sectorFitScorer   shortlist.ts (`rowRelevance`) -- the founder's
//                                own table. Also poolBlend.ts.
//   scaleFit, livenessFit,       poolBlend.ts, which was FITTED on them as
//   eligibilityFit               columns, and scripts/measure_sibling_choice.ts,
//                                which is measuring whether they separate
//                                siblings inside one regime. Deleting a column
//                                makes a published weight refer to nothing.
//   hasSectorHistory             the one predicate deciding which rows are blind
//
// What is NOT allowed is describing any of this as the ranker. That claim is
// what let a founder-facing ordering be discussed for months in terms of nine
// weighted components when it ran on two signals -- and then, for two days, as
// if the composite ranked anything at all.

/**
 * Share of an instrument's funded companies that must sit in the founder's
 * sector before it counts as a full thematic match.
 *
 * Deliberately low. A broad instrument that funds many sectors is not thereby
 * a bad fit — the EIC Accelerator's largest sector is a third of its awards
 * and it is genuinely open to everyone. The signal being caught is the
 * opposite case: an instrument whose funding history is overwhelmingly one
 * domain, ranking highly for a company in another purely because its funded
 * project titles share generic technology vocabulary.
 */
export const SECTOR_FULL_MATCH_SHARE = 0.25;

/**
 * Ticket fit as a continuous distance rather than a band membership test.
 *
 * The rule this replaces removed a whole channel when the founder's ask fell
 * outside a hand-set index range, which meant a large ask deleted the
 * startup-scaled instruments outright and a small one deleted the
 * large-scale lane, with no way to see it had happened. Distance says the
 * same thing softly: an instrument whose typical award is an order of
 * magnitude from the ask scores near zero and sinks, but it can still surface
 * when nothing better exists.
 *
 * Scores 0.5 when the instrument's own scale is unknown — neutral, because an
 * unknown ceiling is not a low one.
 */
/** A COLUMN OF `poolBlend.ts`, and a direct read of
 *  `scripts/measure_sibling_choice.ts`. Screen one does not use it:
 *  `selectLeafInstruments` and the sibling reassignment score ticket fit with
 *  `awardScorer` in shortlist.ts, which is a different function on the same
 *  idea. Two ticket scorers exist; this is the one the founder's table does NOT
 *  see. Do not delete it for want of a production caller while the sibling
 *  question is open. */
export function scaleFit(inst: DbInstrument, ticketBand?: string): number {
  const target = ticketBand ? TICKET_MIDPOINT[ticketBand] : undefined;
  const typical = typicalAward(inst);
  if (target === undefined || typical === null || typical <= 0) return 0.5;
  // Ratio in log space: funding sizes span five orders of magnitude, so a
  // linear difference would make every small instrument identical.
  const ratio = Math.log10(typical / target);
  // One decade out scores ~0.37, two decades ~0.02. Generous enough that a
  // neighbouring band is barely penalised, sharp enough that a mismatch sinks.
  return Math.exp(-(ratio * ratio));
}

/** How recently this instrument actually awarded anything. A scheme silent
 *  for years may be closed, repealed, or between programme periods; we cannot
 *  tell, so it is demoted rather than hidden, and the row says so. */
/** A COLUMN OF `poolBlend.ts`, plus `scripts/measure_sibling_choice.ts`. Note
 *  the founder's table applies a harder version of the same idea upstream and independently:
 *  `publishableInstruments()` drops a scheme whose registered end date has
 *  passed, which is a filter, not a demotion. */
export function livenessFit(inst: DbInstrument, year: number): number {
  if (!inst.lastYear) return 0.5;
  const age = year - inst.lastYear;
  if (age <= 1) return 1;
  if (age >= 5) return 0;
  return 1 - (age - 1) / 4;
}

/** Do we hold any sector history for this instrument at all? One predicate, so
 *  the scorer and every measurement agree about which rows are the blind ones. */
export function hasSectorHistory(mix: Record<string, number> | null | undefined): boolean {
  if (!mix) return false;
  const vs = Object.values(mix);
  return vs.length > 0 && vs.reduce((a, b) => a + b, 0) > 0;
}

/**
 * How much of this instrument's funding history sits in the founder's sector.
 *
 * Returns `null` when we cannot tell — no mix on record, or no sector from the
 * founder. NOT a number, and that is the whole point: what an unknown should
 * score is a property of the candidates it is competing against, so this
 * function cannot answer it and must not pretend to. `sectorFitScorer` below
 * solves it per founder. See the note there before reintroducing a constant.
 */
/** THE ONE EXPORT OF THIS FILE THAT RANKS THE FOUNDER'S TABLE. Read by
 *  `selectLeafInstruments` and by `rowRelevance` in shortlist.ts (through
 *  `sectorFitScorer`), where it carries whatever weight the semantic term
 *  leaves it.
 *
 *  Its known limitation is a property of the clip and is measured: inside
 *  one regime the 0.25 ceiling makes a leaf with 90% of its awards in the
 *  founder's sector indistinguishable from one with 26%, so it ties at the top
 *  of the group in most sibling comparisons -- it separates least exactly where
 *  separation is needed. Across channels the clip is right, because a broad
 *  fund must not be punished for being broad. Do not "fix" it here without
 *  reading that measurement; the change belongs in the within-regime
 *  comparison, not in this function. */
export function sectorFit(
  mix: Record<string, number> | null | undefined,
  founderSector?: string,
): number | null {
  if (!hasSectorHistory(mix) || !founderSector) return null;
  const total = Object.values(mix!).reduce((a, b) => a + b, 0);
  const share = (mix![founderSector] ?? 0) / total;
  return Math.min(1, share / SECTOR_FULL_MATCH_SHARE);
}

/** ── THE CLIP IS SETTLED. Do not re-introduce it as an arm ────────────────
 *
 *  There was a `SECTOR_CLIP_ARM=off` switch here that returned the raw share
 *  instead. It was deleted on 2026-08-09 because the question it existed to
 *  keep open is answered, and answered against it.
 *
 *  Measured ALONE over the pool, EXACT@5 with ties resolved by expectation
 *  (`scripts/measure_signal_power.ts`, N=600, seed 20260806) the unclipped
 *  share looks marginally better and is not a difference:
 *
 *      arm          tune                holdout
 *      clipped      16.3 +/-2.0         15.7 +/-2.0
 *      unclipped    18.8 +/-3.1         18.1 +/-3.1
 *
 *  END TO END IT IS NEGATIVE, and that is the finding. Replayed through the
 *  product's own ranking (`measure_recall.ts`, N=600, holdout, same seed):
 *
 *                       clipped (ships)    unclipped
 *      EXACT@5           127/600  21 +/-3.3   131/600  22 +/-3.3
 *      REGIME@5          438/600  73 +/-3.6   400/600  67 +/-3.8
 *      CHANNEL@5         553/600  92 +/-2.2   514/600  86 +/-2.8
 *      REGIME@5 on traced:exact_attribution  98%  ->  83%
 *
 *  Four cases in six hundred, inside the half-width on the metric it targets,
 *  bought with six points of REGIME@5, six of CHANNEL@5 and fifteen on the
 *  population that has siblings at all. The reason is structural rather than a
 *  question of N: the clip is what stops a narrow fund beating a broad one
 *  ACROSS channels, so removing it scatters the table off the right regime.
 *  Same trade `objectiveScorer` was moved out of the row sort to avoid. A
 *  larger N can only sharpen a +0.7 that is already paid for many times over.
 *
 *  The unclipped share is still MEASURABLE without this switch: it is its own
 *  standalone arm in `measure_signal_power.ts` ("sector share (unclipped)"),
 *  computed inline from `sectorMix`, so re-asking the standalone question costs
 *  nothing and needs no env var. See findings/signal_remeasure_wsBU.md. */

/**
 * The score for an instrument whose sector history we do not hold — solved over
 * the candidates it is competing with, not stated as a constant.
 *
 * ── The defect this exists to prevent, and it was live ────────────────────
 * This function's job used to be done by `return 0.5` inside `sectorFit`, under
 * a docstring that called 0.5 "neutral". The intent was right and the number was
 * not, and the difference between them is the whole finding of WS-BB.
 *
 * This repo has ONE convention for a gap in its own data, restated in four
 * docstrings: a gap is never read as evidence against the fund. `awardScorer`
 * returns 1 for a fund with no award median, `regionScorer` returns 1 for a leaf
 * with no recorded footprint, `gateFitScorer` returns 1 for a leaf whose rules
 * cannot be decided, `objectiveScorer` returns 1 for a leaf with no registered
 * objective. All four are MULTIPLIERS, so 1 is the identity of the operation and
 * "neutral" is exact — the term drops out and the rest of the score decides.
 *
 * Sector fit is the one term that is ADDED:
 *
 *     fit = wTheme * theme + (1 - wTheme) * sectorFit(mix, founderSector)
 *
 * and addition has no constant identity. For an added term the neutral value is
 * whatever the population it competes against scores, and that is an empirical
 * quantity, not a choice. Measured over the live corpus (802 publishable leaves
 * x 11 founder sectors, `scripts/probe_missing_data_neutral.ts`):
 *
 *     mean   0.256      median 0.084      p75 0.400
 *     share of real (leaf, founder) pairs scoring above 0.5:  20.7%
 *
 * So `0.5` did not withhold judgement. It placed every fund we know nothing
 * about at the 79th percentile of the funds we know something about, on the one
 * component built entirely from award history — a promotion, granted for the
 * absence of the evidence the component exists to read.
 *
 * ── Why this is not a Spanish problem, and why it looked like one ─────────
 * 94 publishable leaves carry no sector history and all 94 are the sole leaf of
 * their regime, 88 of them Spanish BDNS convocatorias. That is why the effect
 * surfaced as "a third of a Spanish founder's five rows are funds that can never
 * be the answer" (WS-AW). It is not a fact about Spain or about standalone
 * leaves: two thirds of standalone leaves carry full award history, are scored
 * on it, and ARE answers. It is a fact about a register that publishes calls
 * before they have paid anybody, and the next one lands the same way.
 *
 * ── Why the answer key cannot see any of this ─────────────────────────────
 * The recall set is built from awards that were made, so a zero-award leaf can
 * never be an answer under any ranker — the cross-tabulation is exact, 0 of 88
 * against 297 of 714 (`scripts/probe_standalone_pool.ts`). EXACT@5 can neither
 * reward promoting these rows nor punish it. `scripts/measure_evidence_reach.ts`
 * is the instrument that can.
 *
 * ── The property, and what a future change must preserve ──────────────────
 * A stand-in for data we do not hold must not move the row's RANK against the
 * candidates it competes with. For a multiplicative term that is the constant 1.
 * For an added term no constant can satisfy it, because the population moves
 * with the corpus, so the stand-in must be solved from the candidates.
 * `lib/intelligence/sectorNeutral.test.ts` states it as a property and
 * `scripts/check_missing_data_neutral.ts` fails the build if the live corpus
 * drifts away from it.
 *
 * ── MEAN or MEDIAN, decided by the guard rather than by taste ─────────────
 * WS-BB shipped the MEAN and left the question open in
 * `check_missing_data_neutral.ts`: mean-imputation leaves the fund's expected
 * SCORE equal to the population's, the median leaves its expected RANK equal,
 * they coincide on a symmetric population and this one is heavily right-skewed.
 * That check fired, exactly as its author said it would, and named the two
 * sectors where the skew is extreme:
 *
 *     space             mean stand-in 0.020 → 91st percentile of 673 leaves
 *     defense_security  mean stand-in 0.029 → 88th
 *
 * Read that carefully, because it is the ORIGINAL DEFECT at one tenth the size.
 * In a sector where nine leaves in ten have never funded anything, the mean is
 * dragged above the entire mode by the handful of specialists, and a fund we
 * hold no history for is once again promoted over the funds we do — for the
 * absence of the evidence the term exists to read.
 *
 * So the statistic is the MEDIAN. The property names RANK, and the median is
 * the rank-preserving statistic by construction.
 *
 * The obvious objection is that a median of zero BURIES the unknown, which is
 * the failure the original 0.5 was defending against and which this repo's
 * one convention forbids — a gap is never read as evidence against the fund.
 * It does not, and the reason is TIES. If 91% of the population scores exactly
 * 0, an unknown scoring 0 is not last, it is tied with the mode: the term takes
 * the same value for it and for the 91%, so it drops out of the comparison
 * exactly as a multiplier's 1 does. That is the neutrality property, reached
 * for an added term. Where the population really does hold history — every
 * sibling-grouped leaf in the corpus — the median is a real number and the
 * unknown sits mid-field.
 *
 * When no candidate has a mix the value is arbitrary: every candidate receives
 * it, so the term is constant and cannot reorder anything. FALLBACK_UNKNOWN is
 * what it is only so the number is stable across runs.
 */
export const FALLBACK_UNKNOWN = 0.5;

/** The three arms of the WS-BB2 measurement, and the ONLY reason this is a
 *  switch: `constant` is what shipped before WS-BB, `mean` is what WS-BB wrote,
 *  `median` is what ships. Every other input is held identical, so a difference
 *  between two runs is the statistic and not a second change smuggled alongside
 *  it. Unset — which is every request the product ever serves — is `median`.
 *
 *  Read once at module load, never per call, so a measurement cannot drift
 *  mid-run. `scripts/measure_recall.ts` and `scripts/measure_evidence_reach.ts`
 *  print it. */
export type SectorNeutralArm = "constant" | "mean" | "median";
export const SECTOR_NEUTRAL_ARM: SectorNeutralArm =
  (["constant", "mean", "median"] as const).find(
    (a) => a === process.env.SECTOR_NEUTRAL_ARM) ?? "median";

/** The median of an already-sorted, non-empty array. Even lengths take the
 *  midpoint, which is the standard definition and matters here only for tiny
 *  candidate pools. */
function medianOfSorted(xs: readonly number[]): number {
  const mid = xs.length >> 1;
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

export function sectorFitScorer<T extends { sectorMix?: Record<string, number> | null }>(
  candidates: readonly T[],
  founderSector?: string,
): (i: T | null | undefined) => number {
  const known: number[] = [];
  for (const c of candidates) {
    const s = sectorFit(c.sectorMix, founderSector);
    if (s !== null) known.push(s);
  }
  let neutral: number;
  if (!known.length || SECTOR_NEUTRAL_ARM === "constant") {
    neutral = FALLBACK_UNKNOWN;
  } else if (SECTOR_NEUTRAL_ARM === "mean") {
    neutral = known.reduce((a, b) => a + b, 0) / known.length;
  } else {
    known.sort((a, b) => a - b);
    neutral = medianOfSorted(known);
  }
  return (i) => (i ? sectorFit(i.sectorMix, founderSector) : null) ?? neutral;
}

/** A COLUMN OF `poolBlend.ts`. It carried the largest single weight in the
 *  deleted composite, 0.24, and reached no founder through it -- which was the
 *  clearest case of why a weights table must not be read as a ranking. */
export function eligibilityFit(a?: InstrumentAssessment): number {
  if (!a) return 0.4;
  switch (a.status) {
    case "open": return 1;
    case "one_blocker": return 0.6;
    case "unknown": return 0.4;
    case "blocked": return 0;
  }
}

/** ── `scoreFitControl` STOOD HERE AND IS DELETED (wsGB, 2026-08-12) ───────
 *
 *  Nine weighted components over one instrument, and this file's own header has
 *  tabulated since 2026-08-09 that seven of them — 0.72 of the documented
 *  weight — never reached a founder's table. Its single production caller was
 *  `orderMemoCandidates`, which computed it for every row of every pool and
 *  attached it to a candidate field the sort did not consult, because the
 *  shipped memo order was `verdict`. Its only OTHER reader was the `fit` control
 *  arm of that same constant.
 *
 *  wsGB removed the deterministic memo sort when `AGENT_SELECT` became
 *  `adviser`: the model ranks the subset now, so `SHIPPED_MEMO_ORDER`, its two
 *  controls and the scoring loop that fed them all went together. That is the
 *  exact removal the docstring here asked for — "once the memo's order comes
 *  from the selector, `SHIPPED_MEMO_ORDER`'s `fit` branch has no reason to
 *  exist, and the scoring loop at memoCandidates.ts dies with it — taking
 *  FIT_WEIGHTS, `structureFit` and `MemoCandidate.fit`."
 *
 *  ── THE WEIGHTS, KEPT AS A RECORD BECAUSE FINDINGS CITE THEM ─────────────
 *  `scripts/measure_sibling_choice.ts` cites "seven of nine documented weights
 *  carry 0.72 of FIT_WEIGHTS", and a citation into a deleted constant resolves
 *  to nothing. The table it refers to, in full:
 *
 *    eligibility 0.24   theme 0.16   proximity 0.13   sector 0.12
 *    scale 0.12   structure 0.08   capital 0.08   precedent 0.04
 *    liveness 0.03
 *
 *  The measurement that closed it: MEMO@6 24.0% for `fit` against `verdict`'s
 *  27.6% and `pool`'s 28.8%, one replay, one pool, tune n=250 seed 20260806.
 *  wsCR separately measured the re-sort moving the won leaf OUT of the published
 *  six 49 times for 13 in. Receipt: `scripts/archive/_wsct_order.ts`.
 *
 *  ── WHAT SURVIVED IT, AND WHY EACH ───────────────────────────────────────
 *  `sectorFit` / `sectorFitScorer` RANK the founder's table through
 *  `rowRelevance`; `scaleFit`, `livenessFit`, `eligibilityFit` and
 *  `hasSectorHistory` are columns `poolBlend.ts` was fitted on and
 *  `scripts/measure_sibling_choice.ts` reads directly. Deleting one of those
 *  would make a published weight refer to nothing, which is the opposite of
 *  what this deletion is for.
 *
 *  Gone with it, each having had no other reader: `FIT_WEIGHTS`,
 *  `FitComponent`, `FitScore`, `FitInput`, `structureFit`, `UNMATCHED_THEME`,
 *  `HOME_COUNTRY_BONUS`, `EU_WIDE_PROXIMITY`. */

/** ── `rankByFit` STOOD HERE AND IS DELETED, ON ITS OWN INSTRUCTION ────────
 *
 *  Its docstring read: "NO PRODUCTION CALLER. The only caller in the tree is
 *  `scripts/shadow_fit.ts` … If shadow_fit.ts is ever deleted, delete this with
 *  it." Both are gone (wsDO, 2026-08-11). shadow_fit.ts was the Phase-4 exit
 *  harness for the fit score, and that question is closed against it: wsCR
 *  measured the fit re-sort moving the won leaf OUT of the published six 49
 *  times for 13 in, and `_wsct_order.ts` scored it 24.0% MEMO@6 against
 *  `verdict`'s 27.6% on one replay of one pool. A harness whose exit condition
 *  has been answered by a better instrument is not a diagnostic, it is a second
 *  implementation of a dead ranking.
 *
 *  THE ONE THING IT DID THAT IS NOT DEAD, so it is not lost with it: the
 *  display-name collapse. Without it a brief publishes one door several times —
 *  a shadow run put the same national agency in three of five rows, a scarce
 *  row spent on nothing (contract rule FUND-3). That collapse ships, in
 *  `orderMemoCandidates` as `SEL-DUPE-NAME` and in `nameCollision.ts`, which is
 *  where it belongs: whether two rows LOOK like one fund is a property of what
 *  gets published, not of what scores well.
 *
 *  Full record: project-mgmt/findings/dead_ranker_wsDO.md §2. */

/** Band index helper, re-exported so callers scoring a pool do not have to
 *  reach into shortlist.ts for it while that module is being dismantled. */
export { BAND_INDEX };
