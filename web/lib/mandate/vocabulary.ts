/**
 * The ONE company vocabulary, for the site. Same lookups as
 * mandate/vocabulary/__init__.py, over the same generated data.
 *
 * The source is mandate/vocabulary/vocabulary.json, and the reasons behind every
 * mapping are its `decisions`. Do not add a value here: add it there and run
 * `python3 mandate/vocabulary/emit.py`.
 *
 * A LEAF: imports nothing but its generated data, so a "use client" component
 * may import it (see check_client_boundary.ts).
 */
import { VOCABULARY, VOCABULARY_VERSION } from "./vocabulary.generated";

export { VOCABULARY, VOCABULARY_VERSION };
const V = VOCABULARY;

// ── sectors ─────────────────────────────────────────────────────────────────
export type SectorFamily = (typeof V.sectors)[number]["id"];
type Family = (typeof V.sectors)[number];
type Sub = Family["subsectors"][number];
export type Subsector = Sub["id"];

export const SECTOR_FAMILIES = V.sectors.map((f) => f.id) as readonly SectorFamily[];
export const FAMILY: Record<string, Family> = Object.fromEntries(V.sectors.map((f) => [f.id, f]));
export const SUBSECTOR: Record<string, Sub> = Object.fromEntries(
  V.sectors.flatMap((f) => f.subsectors.map((s) => [s.id, s] as const)));
export const SUBSECTOR_FAMILY: Record<string, SectorFamily> = Object.fromEntries(
  V.sectors.flatMap((f) => f.subsectors.map((s) => [s.id, f.id] as const)));

/** capital's SECTOR_OPTIONS shape: value, label, and the unnamed-residual
 *  declaration its encoder and checks read. Order is the source's. */
export const SECTOR_FAMILY_OPTIONS = V.sectors.map((f) =>
  "unnamedResidual" in f && f.unnamedResidual
    ? { value: f.id, label: f.label, unnamedResidual: true as const }
    : { value: f.id, label: f.label });

export const POLICY_SECTOR_LIFT: Record<string, { family: SectorFamily; subsector: Subsector }> =
  Object.fromEntries(V.policySectors.map((p) => [p.slug, { family: p.family, subsector: p.subsector }]));

export function policySectorOfSubsector(sub: string): string | null {
  const s = SUBSECTOR[sub];
  if (s && "policySector" in s) return s.policySector as string;
  const f = FAMILY[SUBSECTOR_FAMILY[sub]];
  return f?.policySector ?? null;
}

/** Policy's sector slugs, DERIVED (decision D2): each subsector's in order,
 *  then the family's if no subsector of that family was given. */
export function policySectorsFor(family: string | undefined, subsectors: readonly string[] | undefined): string[] {
  const out: string[] = [];
  const subs = subsectors ?? [];
  for (const s of subs) {
    const slug = policySectorOfSubsector(s);
    if (slug && !out.includes(slug)) out.push(slug);
  }
  if (family && !subs.some((s) => SUBSECTOR_FAMILY[s] === family)) {
    const slug = FAMILY[family]?.policySector;
    if (slug && !out.includes(slug)) out.push(slug);
  }
  return out;
}

// ── size ────────────────────────────────────────────────────────────────────
export interface Band { id: string; min: number; max: number | null; capital: string; covers?: readonly string[] }
const byId = (bands: readonly Band[]) => Object.fromEntries(bands.map((b) => [b.id, b])) as Record<string, Band>;
export const FTE_BANDS = byId(V.size.fteBands);
export const TURNOVER_BANDS = byId(V.size.turnoverBands);
export const BALANCE_BANDS = byId(V.size.balanceBands);
export const SME_TIERS = V.size.smeTiers;
export const ENTERPRISE = V.size.enterprise;
export const SIZE_CLASSES = Object.fromEntries(V.size.sizeClasses.map((c) => [c.id, c])) as
  Record<string, (typeof V.size.sizeClasses)[number]>;
export type SizeClass = (typeof V.size.sizeClasses)[number]["id"];

/** capital's own band list for an axis: the distinct `capital` projections, in order. */
const capitalOrder = (bands: readonly Band[]) => [...new Set(bands.map((b) => b.capital))];
export const CAPITAL_FTE_BANDS = capitalOrder(V.size.fteBands);
export const CAPITAL_TURNOVER_BANDS = capitalOrder(V.size.turnoverBands);
export const CAPITAL_BALANCE_BANDS = capitalOrder(V.size.balanceBands);

// ── places ──────────────────────────────────────────────────────────────────
export type Iso2 = (typeof V.countries)[number]["iso2"];
export const COUNTRIES = Object.fromEntries(V.countries.map((c) => [c.iso2, c])) as
  Record<string, (typeof V.countries)[number]>;
const NAME_TO_ISO: Record<string, string> = Object.fromEntries(
  V.countries.map((c) => [c.name.toLowerCase(), c.iso2]));
export const POLICY_JURISDICTIONS = V.policyJurisdictions as readonly string[];
export const MARKETS = ["EU", ...V.countries.map((c) => c.iso2)] as readonly string[];

/** capital's spelling (or an ISO2 code) -> ISO2, else undefined. */
export function isoForName(name: string): string | undefined {
  const n = name.trim();
  if (n.length === 2 && COUNTRIES[n.toUpperCase()]) return n.toUpperCase();
  return NAME_TO_ISO[n.toLowerCase()];
}

// ── plain enumerations ──────────────────────────────────────────────────────
export const DEVELOPMENT_STAGES = V.developmentStages.map((s) => s.id);

interface Entry { id: string; policyValue: string; aliases?: readonly string[] }
export const ENUMS: Record<"customerType" | "aiRole" | "aiUseCases" | "dataCategories" | "monthlyEuUsers",
  readonly Entry[]> = {
  customerType: V.customerTypes,
  aiRole: V.aiRoles,
  aiUseCases: V.aiUseCases,
  dataCategories: V.dataCategories,
  monthlyEuUsers: V.monthlyEuUsers,
};
export type EnumField = keyof typeof ENUMS;
export const ids = (f: EnumField) => ENUMS[f].map((e) => e.id);
export const policyValue = (f: EnumField, id: string) => ENUMS[f].find((e) => e.id === id)!.policyValue;
export function liftPolicyValue(f: EnumField, raw: string): string | undefined {
  const r = raw.trim();
  return ENUMS[f].find((e) => r === e.policyValue || r === e.id || (e.aliases ?? []).includes(r))?.id;
}
