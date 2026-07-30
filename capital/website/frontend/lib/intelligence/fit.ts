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
import { BAND_INDEX, TICKET_MIDPOINT, typicalAward } from "./shortlist";
import type { DbInstrument } from "./corpus";
import type { InstrumentAssessment } from "./verdict";

/** Each component scores 0-1. Weights sum to 1. */
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

/**
 * How much of this instrument's funding history sits in the founder's sector.
 *
 * Scores 0.5 when we cannot tell — no mix on record, or no sector from the
 * founder. Neutral rather than zero: an unknown history is not evidence of a
 * bad match, and zeroing it would bury every instrument whose recipients we
 * have not classified.
 */
export function sectorFit(
  mix: Record<string, number> | null | undefined,
  founderSector?: string,
): number {
  if (!mix || !founderSector) return 0.5;
  const total = Object.values(mix).reduce((a, b) => a + b, 0);
  if (total <= 0) return 0.5;
  const share = (mix[founderSector] ?? 0) / total;
  return Math.min(1, share / SECTOR_FULL_MATCH_SHARE);
}

export function eligibilityFit(a?: InstrumentAssessment): number {
  if (!a) return 0.4;
  switch (a.status) {
    case "open": return 1;
    case "one_blocker": return 0.6;
    case "unknown": return 0.4;
    case "blocked": return 0;
  }
}

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
    sector: sectorFit(inst.sectorMix, input.founderSector),
    proximity: country === "" ? EU_WIDE_PROXIMITY
      : country === "EU" ? EU_WIDE_PROXIMITY
      : input.founderCountries?.has(country) ? HOME_COUNTRY_BONUS
      : 0,
    scale: scaleFit(inst, input.ticketBand),
    structure: structureFit(input.requiresConsortium, input.consortiumOk),
    capital: input.capitalWanted?.size
      ? (input.capitalWanted.has(inst.capitalType) ? 1 : 0.3)
      : 1,
    precedent: input.maxComparable && input.maxComparable > 0
      ? Math.log1p(input.comparableCount ?? 0) / Math.log1p(input.maxComparable)
      : 0,
    liveness: livenessFit(inst, year),
  };

  let score = 0;
  for (const k of Object.keys(FIT_WEIGHTS) as FitComponent[]) {
    score += FIT_WEIGHTS[k] * components[k];
  }

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
