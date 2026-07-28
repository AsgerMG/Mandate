// Whitelist-based sanitizers for public POST bodies. Never pass client JSON
// straight into EligibilityAnswers: it's fed into a prompt (the "Scoping
// profile (structured intake, AUTHORITATIVE)" block) and into the
// deterministic evaluator, so a stray field or an oversized string should be
// dropped, not forwarded.
import {
  CAPITAL_OPTIONS,
  COMPANY_TYPE_OPTIONS,
  type BorrowerModel,
  type CapitalType,
  type CompanyTypeValue,
  type EligibilityAnswers,
  type ProfileSignal,
  type TicketBand,
  SECTOR_OPTIONS,
  ACTIVITY_OPTIONS,
  USE_OF_FUNDS_OPTIONS,
  EXCLUSION_OPTIONS,
  TICKET_BANDS,
  FTE_BANDS,
  TURNOVER_BANDS,
  BALANCE_BANDS,
  COFINANCING_BANDS,
  DEVELOPMENT_STAGES,
  NEED_BY_BANDS,
  BORROWER_MODELS,
  CONDITIONALITY_VALUES,
} from "./types";

const CAPITAL_TYPE_VALUES: readonly CapitalType[] = CAPITAL_OPTIONS.map((o) => o.value);
const COMPANY_TYPE_VALUES: readonly CompanyTypeValue[] = COMPANY_TYPE_OPTIONS.map((o) => o.value);
const TICKET_BAND_VALUES: readonly TicketBand[] = TICKET_BANDS.map((b) => b.value);
const BORROWER_MODEL_VALUES: readonly BorrowerModel[] = BORROWER_MODELS.map((o) => o.value);
const YES_NO_UNSURE = ["yes", "no", "unsure"] as const;
const YES_NO_DEPENDS = ["yes", "no", "depends"] as const;
const FTE_BAND_VALUES = FTE_BANDS;
const TURNOVER_BAND_VALUES = TURNOVER_BANDS;
const BALANCE_BAND_VALUES = BALANCE_BANDS;
// "unsure" is accepted from the form but is not part of the ordered band
// vocabulary — it means "no answer", which NON_ANSWERS handles downstream.
const COFINANCING_BAND_VALUES = [...COFINANCING_BANDS, "unsure"] as const;
const DEVELOPMENT_STAGE_VALUES = DEVELOPMENT_STAGES;
const NEED_BY_VALUES = NEED_BY_BANDS;

// DERIVED, never re-typed. This list was a hand-copy and went stale the moment
// SECTOR_OPTIONS changed: it still held the retired 7-bucket vocabulary, so
// every real request through /api/intelligence had its sector silently dropped
// while the bench, which calls the pipeline directly, saw nothing wrong.
const SECTOR_VALUES = SECTOR_OPTIONS.map((o) => o.value);
const ACTIVITY_VALUES = ACTIVITY_OPTIONS.map((o) => o.value);
const USE_OF_FUNDS_VALUES = USE_OF_FUNDS_OPTIONS.map((o) => o.value);
const EXCLUSION_VALUES = EXCLUSION_OPTIONS.map((o) => o.value);

function pickEnum<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

function pickEnumList<T extends string>(v: unknown, allowed: readonly T[], max = 20): T[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is T => typeof x === "string" && (allowed as readonly string[]).includes(x)).slice(0, max);
  return out.length ? out : undefined;
}

/** Free-text country names (full English names, not a fixed enum) — length- and count-capped, not value-checked. */
function pickStringList(v: unknown, max = 60, maxLen = 60): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= maxLen).slice(0, max);
  return out.length ? out : undefined;
}

function pickYear(v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  const y = Math.trunc(v);
  return y >= 1900 && y <= 2100 ? y : undefined;
}

/**
 * Free text a founder typed, bounded before it reaches a model prompt.
 *
 * The description is interpolated into eight prompt sites and is the only
 * unbounded, unauthenticated input the pipeline has. /verdict capped it at
 * 400 characters; the two PAID routes capped it at nothing, so an anonymous
 * request could inflate every prompt in the run — and each run is six model
 * calls plus web search. Cost amplification first, prompt injection second.
 *
 * 1,200 characters is roughly a generous paragraph: past that a founder is
 * pasting a deck, not describing a company, and nothing downstream reads more
 * closely than the first few sentences anyway.
 */
export const MAX_DESCRIPTION_CHARS = 1200;

export function sanitizeFreeText(v: unknown, maxLen = MAX_DESCRIPTION_CHARS): string | undefined {
  // TRUNCATE, never reject. The first version of this delegated to pickString,
  // which returns undefined for anything over the limit — so a founder who
  // wrote 1,300 characters would have had their entire description silently
  // discarded. That is the same silent-drop failure this bound was added to
  // prevent, just moved somewhere new; a unit test caught it on the first run.
  //
  // Over-length input is someone being thorough, not an attack. Cutting it
  // bounds the prompt cost while keeping the answer they gave.
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s.length ? s.slice(0, maxLen) : undefined;
}

function pickString(v: unknown, maxLen: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s.length > 0 && s.length <= maxLen ? s : undefined;
}

/** Whitelist a raw request body's `eligibility` field into EligibilityAnswers, or undefined if empty/invalid. */
export function sanitizeEligibility(raw: unknown): EligibilityAnswers | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const b = raw as Record<string, unknown>;
  const out: EligibilityAnswers = {
    ticketBand: pickEnum(b.ticketBand, TICKET_BAND_VALUES),
    borrowerModel: pickEnum(b.borrowerModel, BORROWER_MODEL_VALUES),
    entityCountries: pickStringList(b.entityCountries),
    wouldOpenEntity: pickEnum(b.wouldOpenEntity, YES_NO_DEPENDS),
    fteBand: pickEnum(b.fteBand, FTE_BAND_VALUES),
    turnoverBand: pickEnum(b.turnoverBand, TURNOVER_BAND_VALUES),
    balanceBand: pickEnum(b.balanceBand, BALANCE_BAND_VALUES),
    ownerOver25: pickEnum(b.ownerOver25, YES_NO_UNSURE),
    institutionalOwner: pickEnum(b.institutionalOwner, YES_NO_UNSURE),
    nonEuControl: pickEnum(b.nonEuControl, YES_NO_UNSURE),
    cofinancingBand: pickEnum(b.cofinancingBand, COFINANCING_BAND_VALUES),
    foundedYear: pickYear(b.foundedYear),
    lossesOverHalfCapital: pickEnum(b.lossesOverHalfCapital, YES_NO_UNSURE),
    conditionality: pickEnumList(b.conditionality, CONDITIONALITY_VALUES),
    developmentStage: pickEnum(b.developmentStage, DEVELOPMENT_STAGE_VALUES),
    activityCountries: pickStringList(b.activityCountries),
    consortium: pickEnum(b.consortium, YES_NO_UNSURE),
    bankRelationship: pickEnum(b.bankRelationship, YES_NO_UNSURE),
    institutionalBacking: pickEnum(b.institutionalBacking, YES_NO_UNSURE),
    needBy: pickEnum(b.needBy, NEED_BY_VALUES),
    sector: pickEnum(b.sector, SECTOR_VALUES),
    // Was missing entirely, so the whole activities axis was discarded before
    // it could gate anything — the axis that carries most GBER exclusions.
    activities: pickEnumList(b.activities, ACTIVITY_VALUES),
    useOfFunds: pickEnumList(b.useOfFunds, USE_OF_FUNDS_VALUES),
    exclusionFlags: pickEnumList(b.exclusionFlags, EXCLUSION_VALUES),
  };
  // The undertaking-in-difficulty test is now one line of the exclusions
  // checklist rather than its own question, but eligibility.ts's framework
  // check and 64 encoded gates still read `lossesOverHalfCapital`. Derive it,
  // or that whole check silently goes dark. Only "none" implies a clean "no" —
  // an unanswered checklist stays undefined, never a pass.
  if (!out.lossesOverHalfCapital && out.exclusionFlags?.length) {
    out.lossesOverHalfCapital = out.exclusionFlags.includes("losses_over_half_capital")
      ? "yes"
      : out.exclusionFlags.includes("none")
        ? "no"
        : undefined;
  }

  const hasAny = Object.values(out).some((v) => v !== undefined);
  return hasAny ? out : undefined;
}

/**
 * Fold the incorporation country into `entityCountries`.
 *
 * The first screen asks "Incorporated in" as a top-level `country`, and nothing
 * ever wrote it into `entityCountries` — so the single most-encoded gate field
 * in the corpus (185 rules across 105 instruments, "must be established in X")
 * evaluated as UNANSWERED for every founder who did not separately list an
 * entity. Every country rule silently returned "unknown".
 *
 * Derived server-side rather than in the client payload so all three routes
 * (verdict, intake, memo) get it from one place and none can drift.
 */
export function withIncorporationCountry(
  elig: EligibilityAnswers | undefined,
  country: string | undefined,
): EligibilityAnswers | undefined {
  const c = country?.trim();
  if (!c) return elig;
  const existing = elig?.entityCountries ?? [];
  if (existing.some((x) => x.trim().toLowerCase() === c.toLowerCase())) return elig;
  return { ...(elig ?? {}), entityCountries: [c, ...existing] };
}

/** Whitelist a raw request body's `targetMarkets` field: free-text country names, length- and count-capped. */
export function sanitizeTargetMarkets(raw: unknown): string[] | undefined {
  return pickStringList(raw);
}

/** Whitelist a raw request body's `capitalSought` field against CAPITAL_OPTIONS. */
export function sanitizeCapitalSought(raw: unknown): string[] | undefined {
  return pickEnumList(raw, CAPITAL_TYPE_VALUES);
}

const INSTRUMENT_ID_RE = /^[a-z0-9_]{1,60}$/;

/** Whitelist a raw request body's `candidateInstrumentIds` field — internal
 *  DB ids only, never free text: lowercase/digits/underscore, length-capped. */
export function sanitizeInstrumentIds(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = raw.filter((x): x is string => typeof x === "string" && INSTRUMENT_ID_RE.test(x)).slice(0, 40);
  return out.length ? out : undefined;
}

/**
 * Whitelist a raw request body's `projectAnswers` field (brief_funnel_v2
 * Stage 2b). Every string here reaches a model prompt, and `answer` can be
 * founder free text, so each field is length-capped and the instrument id is
 * shape-checked like any other. Count-capped at 12: the panel can only
 * generate 5 per round.
 *
 * These deliberately never become EligibilityAnswers, so nothing here can
 * reach the deterministic evaluator no matter what a client posts.
 */
export function sanitizeProjectAnswers(raw: unknown): import("./types").ProjectAnswer[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = raw.flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const b = x as Record<string, unknown>;
    const questionId = pickString(b.questionId, 140);
    const question = pickString(b.question, 400);
    const answer = pickString(b.answer, 400);
    const instrumentId = pickString(b.instrumentId, 60);
    if (!questionId || !question || !answer || !instrumentId) return [];
    if (!INSTRUMENT_ID_RE.test(instrumentId)) return [];
    return [{
      questionId,
      question,
      answer,
      instrumentId,
      instrumentName: pickString(b.instrumentName, 160) ?? instrumentId,
      gateKey: pickString(b.gateKey, 120) ?? "",
      quote: pickString(b.quote, 600) ?? "",
      locator: pickString(b.locator, 160),
    }];
  }).slice(0, 12);
  return out.length ? out : undefined;
}

/** Whitelist a raw request body's `profileSignal` field (Phase 4) — the
 *  client only ever echoes back what our own /api/intelligence/intake
 *  response gave it, but never trust that round-trip: techDepthRead must be
 *  a real COMPANY_TYPE_OPTIONS value, note is length-capped free text. */
export function sanitizeProfileSignal(raw: unknown): ProfileSignal | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const b = raw as Record<string, unknown>;
  const techDepthRead = pickEnum(b.techDepthRead, COMPANY_TYPE_VALUES);
  const note = pickString(b.note, 300);
  return techDepthRead && note ? { techDepthRead, note } : undefined;
}
