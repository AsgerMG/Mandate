// How well a fund fits this founder, as one number with its parts on show.
//
// ── What this replaces ─────────────────────────────────────────────────────
// Five hardcoded rules used to decide which funds a founder could see: a
// per-channel ticket-band table, a per-channel consortium declaration, a
// thematic floor on large-ticket channels, a writer-side disqualification
// flag, and a regex over the writer's own prose. Each was binary, each fired
// somewhere different, and none left a record.
//
// The governing principle: a fund should never be excluded by a rule, it
// should fail to make the cut. A filter removes a fund from the universe and
// nothing downstream can recover it or explain its absence. A signal moves a
// fund down a list, where a poor fit lands below the cut on its own and every
// component of that decision is recorded.
//
// Two things remain hard exclusions, because both are facts about an
// instrument rather than judgements about a founder: a conclusively failed
// encoded gate (verdict.ts `blocked`), and a national scheme in a country the
// founder cannot draw on. Everything else scores.
//
// ── On the weights ─────────────────────────────────────────────────────────
// They are a starting point, not a finding, and they are stated here rather
// than buried so that saying so is possible. What makes them safe is not that
// they are right but that every component is recorded per instrument per run,
// so a bad ranking can be attributed to a component rather than argued about.
import { BAND_INDEX, INDEFINITE_CAPITAL, TICKET_MIDPOINT, typicalAward } from "./shortlist";
import { hasThinEvidence } from "./accessMode";
import type { DbInstrument } from "./corpus";
import type { InstrumentAssessment } from "./verdict";

// ── WHAT IN THIS FILE ACTUALLY REACHES THE FOUNDER'S TABLE ────────────────
// Read this before quoting a weight below as if it ranked anything.
//
// `scoreFit` does NOT rank the five funds a founder first sees. It is called
// from exactly one place in production -- `synthesize()` in the MEMO path
// (pipeline.ts) -- over `hydratedTable.slice(0, VERDICT_POOL)`, i.e. over rows
// that screen one has ALREADY ordered and ALREADY cut. `computeVerdict`, which
// produces the table, never calls it.
//
// Screen one orders on `rowRelevance` in shortlist.ts: a blend of the semantic
// percentile and `sectorFit`, then permuted within each regime by the
// rank-preserving sibling reassignment. `sectorFit` is the ONLY export of this
// file on that path.
//
//   component     weight   reaches the five a founder first sees?
//   eligibility     0.24   no
//   theme           0.16   yes, but as shortlist's own semantic term
//   sector          0.12   yes, via sectorFit
//   proximity       0.13   no -- only as a binary country tier inside a channel
//   scale           0.12   no -- shortlist uses its own awardScorer instead
//   structure       0.08   no
//   capital         0.08   no -- only as a filter, in selectLeafInstruments
//   precedent       0.04   no -- peer precedence is a separate mechanism
//   liveness        0.03   no -- liveness is a publishability filter upstream
//
// So SEVEN of the nine components, carrying 0.72 of the weight documented
// below, never touch the table. They order the memo's pool, which is a real job
// and a smaller one than "the fit score".
//
// This is documented rather than deleted on purpose: whether any of these
// components can separate siblings inside one regime -- which is where the
// entire remaining loss is -- is an open question under active measurement
// (`scripts/measure_sibling_choice.ts` reads `scaleFit` and `livenessFit`
// directly for exactly that). Deleting a component because nothing calls it
// today would delete the candidate before the experiment.
//
// What is NOT allowed is describing this as the ranker. That claim is what let
// a founder-facing ordering be discussed for months in terms of nine weighted
// components when it ran on two signals.

/** Each component scores 0-1. Weights sum to 1.
 *
 *  These weight the MEMO pool, not the founder's table. See the note above:
 *  seven of the nine never reach screen one. */
export const FIT_WEIGHTS = {
  eligibility: 0.24,
  theme: 0.16,
  sector: 0.12,
  proximity: 0.13,
  scale: 0.12,
  structure: 0.08,
  capital: 0.08,
  precedent: 0.04,
  liveness: 0.03,
} as const;

export type FitComponent = keyof typeof FIT_WEIGHTS;

/** Score for an instrument the relevance index did not return at all. Low,
 *  not neutral: see the note at the assignment site. Not zero, because the
 *  lexical index is sparse and would otherwise punish every fund equally in
 *  the offline fallback where no semantic scores exist. */
export const UNMATCHED_THEME = 0.15;

/** How much an instrument's own country matters when it is not a hard
 *  exclusion. An EU-wide programme is open to everyone and so tells us
 *  nothing about fit; a scheme in the founder's own country is a door on
 *  their doorstep. Without this the two are indistinguishable, and the
 *  large pan-European programmes outrank every national route for everyone. */
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

export const HOME_COUNTRY_BONUS = 1;
export const EU_WIDE_PROXIMITY = 0.45;

export interface FitScore {
  instrumentId: string;
  score: number;
  components: Record<FitComponent, number>;
  /** Set only for the two remaining hard exclusions. A scored row is never
   *  excluded; this is how a fact is distinguished from a low score. */
  excluded?: "blocked" | "off-country";
}

export interface FitInput {
  instrument: DbInstrument;
  assessment?: InstrumentAssessment;
  /** Normalised semantic/lexical relevance for this instrument, 0-1. */
  theme?: number;
  /** What sector fit scores for an instrument whose funding history we do not
   *  hold — solved by the CALLER over its own pool with `sectorFitScorer`,
   *  because the neutral value of an added term is a property of the population
   *  and not of the instrument. Omitted, it falls back to FALLBACK_UNKNOWN and
   *  the note two fields up applies here too: 0.5 is not neutral, it is the
   *  79th percentile. */
  sectorNeutral?: number;
  /** Founder's ticket band key. */
  ticketBand?: string;
  /** Capital types the founder asked for, already mapped to DB values. */
  capitalWanted?: Set<string>;
  /** Comparable companies in the corpus that drew from this instrument. */
  comparableCount?: number;
  /** Highest comparable count across the pool, for normalisation. */
  maxComparable?: number;
  /** ISO2 countries the founder can draw on. */
  founderCountries?: Set<string>;
  /** Does the instrument require a consortium, per its own encoded gates? */
  requiresConsortium?: boolean;
  /** Founder's answer: can they field one? Undefined means unknown. */
  consortiumOk?: boolean;
  /** The founder's own sector (SECTOR_OPTIONS value), when known. */
  founderSector?: string;
  /** Current year, for liveness. Injected so scoring stays deterministic. */
  year: number;
}

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
/** REACHES THE MEMO POOL ONLY, via `scoreFit`. Screen one does not use this:
 *  `selectLeafInstruments` and the sibling reassignment score ticket fit with
 *  `awardScorer` in shortlist.ts, which is a different function on the same
 *  idea. Two ticket scorers exist; this is the one the founder's table does NOT
 *  see. Also read directly by `scripts/measure_sibling_choice.ts`, which is
 *  testing whether it separates siblings -- do not delete it for want of a
 *  production caller while that is open. */
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
/** REACHES THE MEMO POOL ONLY, via `scoreFit`, plus
 *  `scripts/measure_sibling_choice.ts`. Note the founder's table applies a
 *  harder version of the same idea upstream and independently:
 *  `publishableInstruments()` drops a scheme whose registered end date has
 *  passed, which is a filter, not a demotion. */
export function livenessFit(inst: DbInstrument, year: number): number {
  if (!inst.lastYear) return 0.5;
  const age = year - inst.lastYear;
  if (age <= 1) return 1;
  if (age >= 5) return 0;
  return 1 - (age - 1) / 4;
}

/** Whether the shape of the applicant this fund expects matches the founder.
 *  Replaces a per-channel declaration that gave nine differently-structured
 *  programmes in one bucket a single verdict. */
/** REACHES THE MEMO POOL ONLY, via `scoreFit`. No other caller in the tree. */
export function structureFit(requiresConsortium?: boolean, consortiumOk?: boolean): number {
  if (!requiresConsortium) return 1;
  if (consortiumOk === true) return 1;
  // Unknown is not a no. Treating it as one silently removed every
  // collaborative route from any founder who had not thought about it yet.
  if (consortiumOk === undefined) return 0.6;
  // A stated no is a real mismatch, but not a disqualification: partners can
  // be recruited, and the row says what it would take.
  return 0.25;
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
 *  Its known limitation is a property of the clip below and is measured: inside
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
  return SECTOR_CLIP_ARM === "off"
    ? share
    : Math.min(1, share / SECTOR_FULL_MATCH_SHARE);
}

/** ── The clip, as an ARM rather than as an argument ────────────────────────
 *
 *  The docstring above says the ceiling ties the top of a sibling group and
 *  points at a measurement. Workstream BU turned that into a switch, because
 *  "do not fix this without reading the measurement" is not something a reader
 *  can act on and a constant nobody can vary is a constant nobody can test.
 *
 *  `off` divides by nothing: the raw share, which is what the clip destroys
 *  above 0.25. Measured alone over the pool, EXACT@5 with ties resolved by
 *  expectation (`scripts/measure_signal_power.ts`, N=600, seed 20260806):
 *
 *      arm          tune                holdout
 *      clipped      16.3 +/-2.0         15.7 +/-2.0
 *      unclipped    18.8 +/-3.1         18.1 +/-3.1
 *
 *  Both gaps sit INSIDE the half-widths and neither is a difference.
 *
 *  ── AND END TO END IT IS NEGATIVE, WHICH IS THE POINT OF THE ARM ─────────
 *  Replayed through the product's own ranking (`measure_recall.ts`, N=600,
 *  holdout, same seed) the standalone gain does not survive contact with the
 *  table, and two other metrics pay for it:
 *
 *                       clipped (ships)    unclipped
 *      EXACT@5           127/600  21 +/-3.3   131/600  22 +/-3.3
 *      REGIME@5          438/600  73 +/-3.6   400/600  67 +/-3.8
 *      CHANNEL@5         553/600  92 +/-2.2   514/600  86 +/-2.8
 *      REGIME@5 on traced:exact_attribution  98%  ->  83%
 *
 *  Four cases in six hundred, inside the half-width, bought with six points of
 *  REGIME@5 and fifteen on the population that has siblings at all. The clip is
 *  doing exactly what the docstring above says it does -- stopping a narrow fund
 *  from beating a broad one ACROSS channels -- and removing it scatters the
 *  table off the right regime. Same trade `objectiveScorer` was moved out of the
 *  row sort to avoid.
 *
 *  So the arm defaults to the shipped behaviour and stays, so the question is
 *  re-askable at a larger N without anyone editing a constant back and forth --
 *  which is how a measured decision turns into a remembered one.
 *  See project-mgmt/findings/signal_remeasure_wsBU.md.
 *
 *  Read once at module load, never per call, for the same reason
 *  `SECTOR_NEUTRAL_ARM` is: a measurement must not be able to drift mid-run. */
export type SectorClipArm = "on" | "off";
export const SECTOR_CLIP_ARM: SectorClipArm =
  process.env.SECTOR_CLIP_ARM === "off" ? "off" : "on";

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

/** REACHES THE MEMO POOL ONLY, via `scoreFit`. No other caller in the tree --
 *  and it carries the largest single weight below, 0.24, which is the clearest
 *  case of why the weights table must not be read as the ranking. */
export function eligibilityFit(a?: InstrumentAssessment): number {
  if (!a) return 0.4;
  switch (a.status) {
    case "open": return 1;
    case "one_blocker": return 0.6;
    case "unknown": return 0.4;
    case "blocked": return 0;
  }
}

/**
 * The nine-component fit score.
 *
 * LIVE, but not where the file's name suggests. One production caller:
 * `synthesize()` in pipeline.ts, over `hydratedTable.slice(0, VERDICT_POOL)` —
 * so it orders the pool the WRITER sees, after screen one has already chosen
 * and cut the rows. It does not decide the five funds on the founder's table.
 * (Second caller: `scripts/shadow_fit.ts`, a harness.)
 */
export function scoreFit(input: FitInput): FitScore {
  const { instrument: inst, assessment, year } = input;

  // ── the two hard exclusions ──────────────────────────────────────────────
  const country = (inst.country ?? "").toUpperCase();
  const offCountry =
    Boolean(input.founderCountries?.size) &&
    country !== "" && country !== "EU" &&
    !input.founderCountries!.has(country);

  const components: Record<FitComponent, number> = {
    eligibility: eligibilityFit(assessment),
    // Absent from the relevance map means "no distinguishing overlap with what
    // this company does", which must score BELOW a weak but real match.
    //
    // A neutral 0.5 default was tried first and was actively wrong: the
    // relevance index only returns instruments clearing a signal floor, so
    // every unmatched fund inherited a score higher than a genuinely
    // weak-but-real one. Large thematic EU programmes then floated to the same
    // score for every archetype — identical numbers for a fintech, a govtech
    // and a consumer app — and outranked the founder's own national schemes.
    theme: input.theme ?? UNMATCHED_THEME,
    // Same treatment as `theme` directly above, for the same reason and after
    // the same measurement: an absent record must not inherit a score higher
    // than a real but weak one. `sectorFit` returns null when it cannot tell,
    // so this is the ONE place the pool's neutral is applied.
    sector: sectorFit(inst.sectorMix, input.founderSector)
      ?? input.sectorNeutral ?? FALLBACK_UNKNOWN,
    proximity: country === "" ? EU_WIDE_PROXIMITY
      : country === "EU" ? EU_WIDE_PROXIMITY
      : input.founderCountries?.has(country) ? HOME_COUNTRY_BONUS
      : 0,
    scale: scaleFit(inst, input.ticketBand),
    structure: structureFit(input.requiresConsortium, input.consortiumOk),
    // Neutral, not penalised, when the label names no kind of capital. The
    // same property the filter applies (INDEFINITE_CAPITAL in shortlist.ts):
    // `blended`/`unknown`/`framework` record that the majority vote produced no
    // answer, so scoring them as a mismatch would demote a fund for what WE do
    // not know about it. Kept in step with the filter deliberately — the two
    // disagreeing is how a fund survives selection only to sink in the memo.
    capital: !input.capitalWanted?.size || INDEFINITE_CAPITAL.has(inst.capitalType)
      ? 1
      : (input.capitalWanted.has(inst.capitalType) ? 1 : 0.3),
    precedent: input.maxComparable && input.maxComparable > 0
      ? Math.log1p(input.comparableCount ?? 0) / Math.log1p(input.maxComparable)
      : 0,
    liveness: livenessFit(inst, year),
  };

  // Thin evidence demotes rather than excludes: every component above is a
  // weaker claim when it rests on a handful of awards, so the score should be
  // too. Applied after the components so each stays readable on its own in the
  // recorded breakdown -- the whole point of recording them.
  const evidencePenalty = hasThinEvidence(inst) ? 0.75 : 1;

  let score = 0;
  for (const k of Object.keys(FIT_WEIGHTS) as FitComponent[]) {
    score += FIT_WEIGHTS[k] * components[k];
  }
  score *= evidencePenalty;

  const excluded: FitScore["excluded"] =
    assessment?.status === "blocked" ? "blocked" : offCountry ? "off-country" : undefined;

  return {
    instrumentId: inst.id,
    score: Math.round(1000 * score) / 1000,
    components,
    excluded,
  };
}

/**
 * Rank a scored pool, strongest first, hard exclusions removed. The caller
 * cuts; this does not know how many the brief publishes.
 *
 * NO PRODUCTION CALLER. The only caller in the tree is
 * `scripts/shadow_fit.ts`, which is what it is for: comparing what this
 * ranking WOULD publish against what the shipped path does. Kept for that,
 * and stated here so nobody reads its existence as evidence that the brief is
 * ranked this way. If shadow_fit.ts is ever deleted, delete this with it.
 *
 * `displayName` collapses instruments that render as the same institution,
 * keeping the highest-scoring one. Without it a brief publishes one door
 * several times: a shadow run put the same national agency in three of five
 * rows, which is a scarce row spent on nothing (contract rule FUND-3). The
 * ranking is the right place for it, because whether two rows LOOK like one
 * fund is a property of what gets published, not of what scores well.
 */
export function rankByFit(
  scores: FitScore[],
  displayName?: (instrumentId: string) => string,
): FitScore[] {
  const ranked = scores.filter((s) => !s.excluded).sort((a, b) => b.score - a.score);
  if (!displayName) return ranked;
  const seen = new Set<string>();
  return ranked.filter((s) => {
    const name = displayName(s.instrumentId).trim().toLowerCase();
    if (!name) return true;
    if (seen.has(name)) return false;
    seen.add(name);
    return true;
  });
}

/** Band index helper, re-exported so callers scoring a pool do not have to
 *  reach into shortlist.ts for it while that module is being dismantled. */
export { BAND_INDEX };
