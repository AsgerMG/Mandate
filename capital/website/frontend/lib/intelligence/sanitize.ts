// Whitelist-based sanitizers for public POST bodies. Never pass client JSON
// straight into EligibilityAnswers: it's fed into a prompt (the "Scoping
// profile (structured intake, AUTHORITATIVE)" block) and into the
// deterministic evaluator, so a stray field or an oversized string should be
// dropped, not forwarded.
import { CAPITAL_OPTIONS, type BorrowerModel, type CapitalType, type EligibilityAnswers, type TicketBand } from "./types";

const CAPITAL_TYPE_VALUES: readonly CapitalType[] = CAPITAL_OPTIONS.map((o) => o.value);
const TICKET_BAND_VALUES: readonly TicketBand[] = ["lt500k", "b500k_2m5", "b2m5_15m", "b15m_50m", "gt50m"];
const BORROWER_MODEL_VALUES: readonly BorrowerModel[] = ["operating", "balance_sheet_lender", "originator", "fund_manager"];
const YES_NO_UNSURE = ["yes", "no", "unsure"] as const;
const YES_NO_DEPENDS = ["yes", "no", "depends"] as const;
const FTE_BAND_VALUES = ["1-9", "10-49", "50-249", "250+"] as const;
const TURNOVER_BAND_VALUES = ["<2M", "2-10M", "10-50M", ">50M"] as const;
const BALANCE_BAND_VALUES = ["<2M", "2-43M", ">43M"] as const;
const COFINANCING_BAND_VALUES = [">50%", "25-50%", "<25%", "unsure"] as const;
const DEVELOPMENT_STAGE_VALUES = ["research", "prototype", "pilot_customers", "scaling_revenue"] as const;
const NEED_BY_VALUES = ["asap_weeks", "months_6", "months_18", "flexible"] as const;
const CONDITIONALITY_VALUES = ["local_entity", "geo_commitments", "state_shareholder", "job_commitments"] as const;

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
  };
  const hasAny = Object.values(out).some((v) => v !== undefined);
  return hasAny ? out : undefined;
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
