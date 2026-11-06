/**
 * THE company profile, for the site: the same shape, derivations and adapters
 * as mandate/profile (Python). mandate/profile/fixtures.json holds the two
 * languages equal; read mandate/profile/__init__.py for the reasoning.
 *
 * DIRECTION. The profile is the source. Capital's request body (and inside it
 * EligibilityAnswers) and policy's CompanyProfile are DERIVED from it, so each
 * brain keeps the input its engine was measured on, and every fact lives once.
 *
 * A LEAF apart from types: safe in a "use client" component.
 */
import type { EligibilityAnswers } from "../intelligence/types";
import {
  BALANCE_BANDS, COUNTRIES, DEVELOPMENT_STAGES, ENTERPRISE, FAMILY, FTE_BANDS, MARKETS,
  POLICY_JURISDICTIONS, POLICY_SECTOR_LIFT, SIZE_CLASSES, SME_TIERS, SUBSECTOR,
  SUBSECTOR_FAMILY, TURNOVER_BANDS, ids, isoForName, liftPolicyValue, policySectorsFor,
  policyValue, type Band, type EnumField,
} from "./vocabulary";

/** Capital's own answers, under capital's vocabulary (decision D20). */
export type FundingAnswers = Omit<EligibilityAnswers,
  "sector" | "fteBand" | "turnoverBand" | "balanceBand" | "developmentStage" | "entityCountries">
  & { capitalSought?: string[] };

export interface CompanyProfile {
  // identity
  name: string;
  description?: string;
  sector?: string;
  subsectors?: string[];
  incorporationCountry?: string;
  entityCountries?: string[];
  markets?: string[];
  // shape (size is derived: smeStatus / sizeClass)
  fteBand?: string;
  turnoverBand?: string;
  balanceBand?: string;
  developmentStage?: string;
  customerType?: string;
  // exposure
  usesAi?: boolean;
  aiRole?: string;
  aiUseCases?: string[];
  handlesPersonalData?: boolean;
  dataCategories?: string[];
  monthlyEuUsers?: string;
  // intent
  answers?: Record<string, string>;
  funding?: FundingAnswers;
}

export class ProfileError extends Error {}

type Kind = "str" | "bool" | "enum" | "enum[]" | "map" | "object";
/** The one declaration of the shape; equal to Python's FIELDS (fixtures.json). */
export const FIELDS: Record<keyof CompanyProfile, [Kind, readonly string[] | null]> = {
  name: ["str", null],
  description: ["str", null],
  sector: ["enum", Object.keys(FAMILY)],
  subsectors: ["enum[]", Object.keys(SUBSECTOR)],
  incorporationCountry: ["enum", Object.keys(COUNTRIES)],
  entityCountries: ["enum[]", Object.keys(COUNTRIES)],
  markets: ["enum[]", MARKETS],
  fteBand: ["enum", Object.keys(FTE_BANDS)],
  turnoverBand: ["enum", Object.keys(TURNOVER_BANDS)],
  balanceBand: ["enum", Object.keys(BALANCE_BANDS)],
  developmentStage: ["enum", DEVELOPMENT_STAGES],
  customerType: ["enum", ids("customerType")],
  usesAi: ["bool", null],
  aiRole: ["enum", ids("aiRole")],
  aiUseCases: ["enum[]", ids("aiUseCases")],
  handlesPersonalData: ["bool", null],
  dataCategories: ["enum[]", ids("dataCategories")],
  monthlyEuUsers: ["enum", ids("monthlyEuUsers")],
  answers: ["map", null],
  funding: ["object", null],
};

const empty = (v: unknown) => v === undefined || v === null || v === ""
  || (Array.isArray(v) && v.length === 0)
  || (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0);

/** The canonical form of a profile, or ProfileError. Unanswered (absent, null,
 *  "", [], {}) is dropped, so one company has one serialisation. */
export function validateProfile(raw: unknown): CompanyProfile {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ProfileError("a profile is a JSON object");
  const r = raw as Record<string, unknown>;
  const unknown = Object.keys(r).filter((k) => !(k in FIELDS)).sort();
  if (unknown.length) throw new ProfileError(`unknown profile field(s): ${unknown.join(", ")}`);
  const out: Record<string, unknown> = {};
  for (const [key, [kind, allowed]] of Object.entries(FIELDS)) {
    let v = r[key];
    if (empty(v)) continue;
    if (kind === "str") {
      if (typeof v !== "string") throw new ProfileError(`${key} must be a string`);
      if (key === "name") v = v.trim();
    } else if (kind === "bool") {
      if (typeof v !== "boolean") throw new ProfileError(`${key} must be true or false`);
    } else if (kind === "enum") {
      if (!allowed!.includes(v as string)) throw new ProfileError(`${key}: ${JSON.stringify(v)} is not in the vocabulary`);
    } else if (kind === "enum[]") {
      if (!Array.isArray(v) || v.some((x) => !allowed!.includes(x))) {
        throw new ProfileError(`${key}: ${JSON.stringify(v)} has a value not in the vocabulary`);
      }
      v = [...new Set(v as string[])];
    } else if (kind === "map") {
      if (typeof v !== "object" || Array.isArray(v)
          || Object.values(v as object).some((x) => typeof x !== "string")) {
        throw new ProfileError(`${key} must map question ids to text`);
      }
      v = { ...(v as object) };
    } else {
      if (typeof v !== "object" || Array.isArray(v)) throw new ProfileError(`${key} must be an object`);
      const o = Object.fromEntries(Object.entries(v as object)
        .filter(([, x]) => x !== undefined && x !== null && x !== "" && !(Array.isArray(x) && x.length === 0)));
      if (Object.keys(o).length === 0) continue;
      v = o;
    }
    out[key] = v;
  }
  if (!out.name) throw new ProfileError("a profile needs a name");
  return out as unknown as CompanyProfile;
}

// ── THE SIZE DERIVATIONS (decisions D12-D15) ───────────────────────────────

export type SmeStatus = "micro" | "small" | "medium" | "large";

const atMost = (band: Band | undefined, ceiling: number): boolean | undefined =>
  band === undefined ? undefined : band.max !== null && band.max <= ceiling;

/** EU SME status, Recommendation 2003/361/EC Art. 2. Identical to capital's
 *  deriveSmeStatus on capital's bands (companyProfile.test.ts proves it over
 *  every combination); finer bands close its missing EUR 10M balance rung. */
export function smeStatus(p: Pick<CompanyProfile, "fteBand" | "turnoverBand" | "balanceBand">): SmeStatus | undefined {
  const fte = p.fteBand ? FTE_BANDS[p.fteBand] : undefined;
  if (!fte) return undefined;
  const turnover = p.turnoverBand ? TURNOVER_BANDS[p.turnoverBand] : undefined;
  const balance = p.balanceBand ? BALANCE_BANDS[p.balanceBand] : undefined;
  for (const tier of SME_TIERS) {
    if (fte.max !== null && fte.max < tier.staffBelow) {
      const t = atMost(turnover, tier.turnoverAtMost), b = atMost(balance, tier.balanceAtMost);
      if (t === undefined && b === undefined) return undefined;
      if (t || b) return tier.id as SmeStatus;
    }
  }
  return "large";
}

/** Policy's five classes: SME tiers, with large split at 1,000 staff OR
 *  EUR 450M turnover into large / enterprise. */
export function sizeClass(p: Pick<CompanyProfile, "fteBand" | "turnoverBand" | "balanceBand">): string | undefined {
  const sme = smeStatus(p);
  if (sme !== "large") return sme;
  const fte = FTE_BANDS[p.fteBand!];
  const turnover = p.turnoverBand ? TURNOVER_BANDS[p.turnoverBand] : undefined;
  if (fte.min >= ENTERPRISE.staffAtLeast || (turnover && turnover.min >= ENTERPRISE.turnoverAbove)) return "enterprise";
  const staffBelow = fte.max !== null && fte.max < ENTERPRISE.staffAtLeast;
  const turnoverBelow = turnover !== undefined && turnover.max !== null && turnover.max <= ENTERPRISE.turnoverAbove;
  return staffBelow && turnoverBelow ? "large" : undefined;
}

export function capitalSector(p: CompanyProfile): string | undefined {
  if (p.sector) return p.sector;
  return p.subsectors?.length ? SUBSECTOR_FAMILY[p.subsectors[0]] : undefined;
}

// ── policy (Regina): CompanyProfile keyword arguments ───────────────────────

export interface PolicyProfileInput {
  name: string; description: string; sectors: string[]; markets: string[];
  uses_ai: boolean; handles_personal_data: boolean; company_size: string | null;
  ai_role: string | null; monthly_eu_users: string | null; data_categories: string[];
  ai_use_cases: string[]; customer_type: string | null; answers: Record<string, string>;
}

/** Decision D17. */
export function policyMarkets(p: CompanyProfile): string[] {
  let out: string[];
  if (p.markets?.length) {
    out = p.markets.filter((m) => POLICY_JURISDICTIONS.includes(m));
  } else {
    const where = [p.incorporationCountry, ...(p.entityCountries ?? [])].filter((c): c is string => !!c);
    out = where.length === 0 || where.some((c) => COUNTRIES[c].eu) ? ["EU"] : [];
    for (const c of new Set(where)) if (POLICY_JURISDICTIONS.includes(c)) out.push(c);
  }
  return out.length ? out : ["EU"];
}

export function toPolicyProfile(profile: CompanyProfile): PolicyProfileInput {
  const p = validateProfile(profile);
  const size = sizeClass(p);
  const one = (f: EnumField, v: string | undefined) => (v ? policyValue(f, v) : null);
  const many = (f: EnumField, v: string[] | undefined) => (v ?? []).map((x) => policyValue(f, x));
  return {
    name: p.name,
    description: p.description ?? "",
    sectors: policySectorsFor(p.sector, p.subsectors),
    markets: policyMarkets(p),
    uses_ai: p.usesAi ?? false,
    handles_personal_data: p.handlesPersonalData ?? false,
    company_size: size ? SIZE_CLASSES[size].policyValue : null,
    ai_role: one("aiRole", p.aiRole),
    monthly_eu_users: one("monthlyEuUsers", p.monthlyEuUsers),
    data_categories: many("dataCategories", p.dataCategories),
    ai_use_cases: many("aiUseCases", p.aiUseCases),
    customer_type: one("customerType", p.customerType),
    answers: { ...(p.answers ?? {}) },
  };
}

function liftSize(raw: string): Record<string, string> {
  const r = raw.trim();
  const c = Object.values(SIZE_CLASSES).find((x) =>
    r === x.policyValue || r === x.id || (x.aliases as readonly string[]).includes(r));
  if (!c) throw new ProfileError(`company_size ${JSON.stringify(raw)} is not a size class`);
  return { ...c.lift };
}

/** A policy brief request (as /regina/brief builds it) -> a profile. */
export function fromPolicyRequest(req: Partial<PolicyProfileInput> & { name: string }): CompanyProfile {
  const p: Record<string, unknown> = { name: req.name, description: req.description ?? "" };
  const subs: string[] = [];
  for (const slug of req.sectors ?? []) {
    const lift = POLICY_SECTOR_LIFT[slug];
    if (!lift) throw new ProfileError(`policy sector ${JSON.stringify(slug)} is not a seeded slug`);
    subs.push(lift.subsector);
    if (!p.sector) p.sector = lift.family;
  }
  p.subsectors = subs;
  p.markets = [...(req.markets ?? [])];
  p.usesAi = !!req.uses_ai;
  p.handlesPersonalData = !!req.handles_personal_data;
  if (req.company_size) Object.assign(p, liftSize(req.company_size));
  const single: [keyof PolicyProfileInput, EnumField][] =
    [["ai_role", "aiRole"], ["monthly_eu_users", "monthlyEuUsers"], ["customer_type", "customerType"]];
  for (const [key, field] of single) {
    const raw = req[key] as string | null | undefined;
    if (raw) {
      const got = liftPolicyValue(field, raw);
      if (!got) throw new ProfileError(`${key} ${JSON.stringify(raw)} is not in the vocabulary`);
      p[field] = got;
    }
  }
  const multi: [keyof PolicyProfileInput, EnumField][] =
    [["data_categories", "dataCategories"], ["ai_use_cases", "aiUseCases"]];
  for (const [key, field] of multi) {
    p[field] = ((req[key] as string[] | undefined) ?? []).map((raw) => {
      const got = liftPolicyValue(field, raw);
      if (!got) throw new ProfileError(`${key} ${JSON.stringify(raw)} is not in the vocabulary`);
      return got;
    });
  }
  p.answers = { ...(req.answers ?? {}) };
  return validateProfile(p);
}

// ── capital (Wincent): the /api/intelligence request body ───────────────────

const SHARED_ELIGIBILITY = ["sector", "fteBand", "turnoverBand", "balanceBand",
  "developmentStage", "entityCountries"] as const;

export interface CapitalProfileRequest {
  company: string; country?: string; description?: string;
  capitalSought?: string[]; eligibility?: EligibilityAnswers;
}

export function toEligibilityAnswers(profile: CompanyProfile): EligibilityAnswers {
  const p = validateProfile(profile);
  const { capitalSought: _drop, ...funding } = p.funding ?? {};
  void _drop;
  const out: Record<string, unknown> = { ...funding };
  const sector = capitalSector(p);
  if (sector) out.sector = sector;
  if (p.fteBand) out.fteBand = FTE_BANDS[p.fteBand].capital;
  if (p.turnoverBand) out.turnoverBand = TURNOVER_BANDS[p.turnoverBand].capital;
  if (p.balanceBand) out.balanceBand = BALANCE_BANDS[p.balanceBand].capital;
  if (p.developmentStage) out.developmentStage = p.developmentStage;
  if (p.entityCountries?.length) out.entityCountries = p.entityCountries.map((c) => COUNTRIES[c].name);
  return out as EligibilityAnswers;
}

/** The profile-derived part of capital's request body. Session state
 *  (profileSignal, projectAnswers, eligibilityBeforeRound) is not the company. */
export function toCapitalRequest(profile: CompanyProfile): CapitalProfileRequest {
  const p = validateProfile(profile);
  const out: CapitalProfileRequest = { company: p.name };
  if (p.incorporationCountry) out.country = COUNTRIES[p.incorporationCountry].name;
  if (p.description) out.description = p.description;
  if (p.funding?.capitalSought?.length) out.capitalSought = [...p.funding.capitalSought];
  const elig = toEligibilityAnswers(p);
  if (Object.keys(elig).length) out.eligibility = elig;
  return out;
}

const iso = (name: string, field: string) => {
  const c = isoForName(name);
  if (!c) throw new ProfileError(`${field}: ${JSON.stringify(name)} is not a country in the vocabulary`);
  return c;
};

/** A capital request body -> a profile. Callers holding a RAW body should run
 *  capital's sanitizeEligibility first (fromCapitalBody in profileRequest.ts). */
export function fromCapitalRequest(body: CapitalProfileRequest): CompanyProfile {
  const elig = { ...(body.eligibility ?? {}) } as Record<string, unknown>;
  const p: Record<string, unknown> = { name: body.company ?? "", description: body.description ?? "" };
  if (body.country) p.incorporationCountry = iso(body.country, "country");
  for (const k of ["sector", "fteBand", "turnoverBand", "balanceBand", "developmentStage"]) {
    if (elig[k] !== undefined && elig[k] !== null) p[k] = elig[k];
  }
  p.entityCountries = ((elig.entityCountries as string[] | undefined) ?? []).map((c) => iso(c, "entityCountries"));
  const funding: Record<string, unknown> = Object.fromEntries(
    Object.entries(elig).filter(([k]) => !(SHARED_ELIGIBILITY as readonly string[]).includes(k)));
  if (body.capitalSought?.length) funding.capitalSought = [...body.capitalSought];
  p.funding = funding;
  return validateProfile(p);
}
