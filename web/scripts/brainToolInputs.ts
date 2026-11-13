/**
 * The bench's two inputs, read so that a brain never works on a silently broken
 * premise (web/scripts/brain_tool.ts):
 *
 * 1. The scratch ledger (--run). The file may start as `{}` (an editor or a
 *    harness creating it "empty"), `[]`, an empty file, or not exist: all mean
 *    "no citations yet". Anything else that is not an array of entries is an
 *    error with a plain message, never a crash deep in the ledger.
 *
 * 2. The profile (--profile). The brains write it from the founder's words, so
 *    a sector arrives as "industrial technology" and a stage as "scale-up".
 *    validateProfile rejects anything off-vocabulary, the screen then fails, and
 *    find_instruments fell back to name matches only: the brain saw fewer rows
 *    and was never told why. Here a value is mapped to its vocabulary id when the
 *    mapping is unambiguous (an id, a label, one part of a label, a subsector
 *    named as the sector, a country name, or a short alias list), and otherwise
 *    the field is DROPPED and named in `warnings`, which brain_tool puts in every
 *    tool result. The screen then runs on what is known, and the brain sees what
 *    was not.
 */
import { FIELDS, ProfileError, validateProfile, type CompanyProfile } from "../lib/mandate/profile";
import { DEVELOPMENT_STAGES, ENUMS, FAMILY, SUBSECTOR, SUBSECTOR_FAMILY, VOCABULARY, isoForName } from "../lib/mandate/vocabulary";

// ── the ledger ──────────────────────────────────────────────────────────────

export function parsePriorLedger<T>(text: string | undefined | null): T[] {
  const t = (text ?? "").trim();
  if (!t) return [];
  let v: unknown;
  try {
    v = JSON.parse(t);
  } catch (e) {
    throw new Error(`the --run ledger is not JSON (${e instanceof Error ? e.message : String(e)}); delete it or start a new run`);
  }
  if (Array.isArray(v)) return v as T[];
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (Object.keys(o).length === 0) return [];
    if (Array.isArray(o.entries)) return o.entries as T[];
  }
  throw new Error("the --run ledger must be a JSON array of citations (or {} / [] / empty for a new run)");
}

// ── the profile ─────────────────────────────────────────────────────────────

const key = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
  .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();

/** Free text that names exactly one vocabulary id. A word that could mean two
 *  (hardware, tech, deep tech, seed, series a) is deliberately absent: it warns. */
const SECTOR_ALIASES: Record<string, string> = {
  "industrial technology": "industrial_manufacturing", "industrial tech": "industrial_manufacturing",
  "industrial": "industrial_manufacturing", "manufacturing": "industrial_manufacturing",
  "industrial automation": "industrial_manufacturing", "automation": "industrial_manufacturing",
  "intralogistics": "industrial_manufacturing", "machinery": "industrial_manufacturing",
  "software": "software_data_ai", "saas": "software_data_ai", "ai": "software_data_ai",
  "artificial intelligence": "software_data_ai", "fintech": "software_data_ai", "edtech": "software_data_ai",
  "climate tech": "energy_cleantech", "climatetech": "energy_cleantech", "cleantech": "energy_cleantech",
  "energy": "energy_cleantech", "greentech": "energy_cleantech",
  "health": "health_life_sciences", "healthcare": "health_life_sciences", "medtech": "health_life_sciences",
  "biotech": "health_life_sciences", "life sciences": "health_life_sciences", "pharma": "health_life_sciences",
  "semiconductors": "semiconductors_electronics", "electronics": "semiconductors_electronics", "photonics": "semiconductors_electronics",
  "logistics": "mobility_transport", "mobility": "mobility_transport", "transport": "mobility_transport", "automotive": "mobility_transport",
  "agritech": "agrifood", "agtech": "agrifood", "foodtech": "agrifood", "food": "agrifood",
  "defence": "defense_security", "defense": "defense_security",
  "chemicals": "materials_chemicals", "materials": "materials_chemicals",
};
const STAGE_ALIASES: Record<string, string> = {
  "scale up": "scaling_revenue", "scaleup": "scaling_revenue", "scaling": "scaling_revenue", "growth": "scaling_revenue",
  "revenue": "scaling_revenue", "commercial": "scaling_revenue", "scaling revenue": "scaling_revenue",
  "pilot": "pilot_customers", "pilots": "pilot_customers", "pilot customers": "pilot_customers",
  "prototype": "prototype", "mvp": "prototype", "r and d": "research", "rd": "research",
};
const CUSTOMER_ALIASES: Record<string, string> = {
  "business": "b2b", "businesses": "b2b", "enterprise": "b2b", "enterprises": "b2b", "smes": "b2b", "sme": "b2b",
  "consumer": "b2c", "consumers": "b2c", "b2b2c": "both", "b2b and b2c": "both", "b2c and b2b": "both",
};
/** Fields a brain writes under another name. */
const FIELD_ALIASES: Record<string, string> = { stage: "developmentStage", customer_type: "customerType", customers: "customerType", subsector: "subsectors" };

type Lookup = Map<string, string>;

function lookup(entries: { id: string; label?: string; aliases?: readonly string[] }[], aliases: Record<string, string>): Lookup {
  const m: Lookup = new Map();
  const put = (k: string, id: string) => { if (k && !m.has(k)) m.set(k, id); };
  for (const e of entries) {
    put(key(e.id), e.id);
    if (e.label) {
      put(key(e.label), e.id);
      // one part of a label ("Industrial manufacturing, robotics or machinery" -> "robotics")
      for (const part of e.label.split(/,| or | and /i)) put(key(part), e.id);
    }
    for (const a of e.aliases ?? []) put(key(a), e.id);
  }
  for (const [k, id] of Object.entries(aliases)) m.set(key(k), id);
  return m;
}

const V = VOCABULARY as unknown as {
  sectors: { id: string; label: string; subsectors: { id: string; label: string }[] }[];
  developmentStages: { id: string; label: string }[];
};
const SECTORS = lookup(V.sectors, SECTOR_ALIASES);
const SUBSECTORS = lookup(V.sectors.flatMap((s) => s.subsectors), {});
const STAGES = lookup(V.developmentStages, STAGE_ALIASES);
const CUSTOMERS = lookup(ENUMS.customerType as never, CUSTOMER_ALIASES);

export interface NormalisedProfile {
  profile: CompanyProfile;
  /** what was rewritten, so the brain can check the reading */
  mapped: string[];
  /** what could not be read and was dropped: the screen ran without it */
  warnings: string[];
}

function mapOne(field: string, raw: string, out: Record<string, unknown>, mapped: string[]): string | undefined {
  const k = key(raw);
  if (field === "sector") {
    if (FAMILY[raw]) return raw;
    const sub = SUBSECTOR[raw] ? raw : SUBSECTORS.get(k);
    const fam = SECTORS.get(k) ?? (sub ? SUBSECTOR_FAMILY[sub] : undefined);
    if (fam && sub && !SECTORS.has(k)) {
      const subs = new Set([...(Array.isArray(out.subsectors) ? out.subsectors as string[] : []), sub]);
      out.subsectors = [...subs];
      mapped.push(`subsectors += ${JSON.stringify(sub)} (named as the sector)`);
    }
    return fam;
  }
  if (field === "subsectors") return SUBSECTOR[raw] ? raw : SUBSECTORS.get(k);
  if (field === "developmentStage") return (DEVELOPMENT_STAGES as readonly string[]).includes(raw) ? raw : STAGES.get(k);
  if (field === "customerType") return CUSTOMERS.get(k);
  if (field === "incorporationCountry" || field === "entityCountries") return isoForName(raw);
  if (field === "markets") return raw.trim().toUpperCase() === "EU" || k === "european union" ? "EU" : isoForName(raw);
  return undefined;
}

/** The profile as the vocabulary reads it, plus what was mapped and what was dropped. */
export function normaliseProfile(raw: unknown): NormalisedProfile {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ProfileError("a profile is a JSON object");
  const mapped: string[] = [];
  const warnings: string[] = [];
  const out: Record<string, unknown> = {};
  for (const [k0, v] of Object.entries(raw as Record<string, unknown>)) {
    const k = k0 in FIELDS ? k0 : FIELD_ALIASES[k0];
    if (!k) { warnings.push(`profile field ${JSON.stringify(k0)} is not a profile field: ignored (fields: ${Object.keys(FIELDS).join(", ")})`); continue; }
    if (k !== k0) mapped.push(`${k0} -> ${k}`);
    out[k] = k === "subsectors" && typeof v === "string" ? [v] : v;
  }
  // subsectors first, so a subsector named as the sector joins any listed ones
  const order = Object.keys(out).sort((a, b) => (a === "subsectors" ? -1 : b === "subsectors" ? 1 : 0));
  for (const field of order) {
    const [kind, allowed] = FIELDS[field as keyof typeof FIELDS];
    const v = out[field];
    if (kind === "enum" && typeof v === "string" && v !== "" && !allowed!.includes(v)) {
      const id = mapOne(field, v, out, mapped);
      if (id) { out[field] = id; mapped.push(`${field}: ${JSON.stringify(v)} -> ${JSON.stringify(id)}`); }
      else {
        delete out[field];
        warnings.push(`${field}: ${JSON.stringify(v)} is not in the vocabulary and has no unambiguous reading; DROPPED, so the eligibility screen ran without it. Use one of: ${allowed!.join(", ")}`);
      }
    } else if (kind === "enum[]" && Array.isArray(v)) {
      const keep: string[] = [];
      for (const x of v) {
        if (typeof x === "string" && allowed!.includes(x)) { keep.push(x); continue; }
        const id = typeof x === "string" ? mapOne(field, x, out, mapped) : undefined;
        if (id) { keep.push(id); mapped.push(`${field}: ${JSON.stringify(x)} -> ${JSON.stringify(id)}`); }
        else warnings.push(`${field}: ${JSON.stringify(x)} is not in the vocabulary; DROPPED from the list${allowed!.length <= 60 ? `. Use one of: ${allowed!.join(", ")}` : ""}`);
      }
      out[field] = [...new Set(keep)];
    }
  }
  try {
    return { profile: validateProfile(out), mapped, warnings };
  } catch (e) {
    // anything still unreadable (a wrong type, no name): say so; the tools then run on the name alone
    warnings.push(`the profile could not be read (${e instanceof Error ? e.message : String(e)}); the tools ran on the name alone, and the eligibility screen saw none of the company's facts`);
    return { profile: { name: typeof out.name === "string" && out.name.trim() ? out.name.trim() : "bench" }, mapped, warnings };
  }
}
