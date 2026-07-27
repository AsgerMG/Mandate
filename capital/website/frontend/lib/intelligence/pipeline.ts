// The four-stage intelligence pipeline. Code-orchestrated (not a free-roaming
// agent) so progress is deterministic and cost is bounded:
//   1. discover  — Claude + web search → competitor names
//   2. query_db  — local fuzzy match against the corpus (no LLM)
//   3. research  — Claude + web search → product/positioning/financing per peer
//   4. generate  — Claude + structured output → the final report
import Anthropic from "@anthropic-ai/sdk";
import { fmtEur } from "@/lib/format";
import { evaluateEligibility } from "./eligibility";
import { scoreEase, whyEasyLine } from "./ease";
import { assessAll, VERDICT_RANK } from "./verdict";
import { themeRelevance, thematicChannelTopUp, RELEVANCE_FLOOR } from "./relevance";
import { semanticFundMatch } from "./semantic";
import { type OpenFieldEvidence, type ProjectGateEvidence } from "./gateReach";
import {
  findPeersBySubsector,
  isGenericSubsector,
  loadAgentInstructions,
  loadDbInstruments,
  loadFundProcess,
  loadFundSnapshot,
  loadSignalsDigest,
  matchCompany,
  toIso2,
  type DbInstrument,
  type DigestItem,
} from "./corpus";
import {
  BORROWER_MODELS,
  CAPITAL_OPTIONS,
  COMPANY_TYPE_OPTIONS,
  FIELD_ENUM_HINTS,
  TICKET_BANDS,
  type ChannelAmount,
  type EligibilityAnswers,
  type EligibilityCheck,
  type FounderFit,
  type GroundedRound,
  type CompetitorIntel,
  type CompetitorRecord,
  type CompetitorRow,
  type InstitutionEntry,
  type InstrumentRow,
  type IntelligenceReport,
  type IntelligenceRequest,
  type ProfileSignal,
  type ProgressEvent,
  type ProjectQuestion,
  type SelfRecord,
} from "./types";

// The whole pipeline runs on cheap, fast models, guided by the Opus-authored
// briefs in fund-processes/ (especially _agent_instructions.md, a strict rubric).
// The two web-search stages use Sonnet 5. The final report is filled into a
// strict JSON schema of short fields, so Haiku 4.5 — given the rubric — writes it
// well at a fraction of the cost and latency. No runtime Opus call, so the
// pipeline lands well under Vercel's 300s function cap (Hobby).
const SEARCH_MODEL = "claude-sonnet-5";
// The intake stage just selects the few questions whose answers most change the
// routing, as structured output. Haiku is fast enough that the founder barely
// waits before the questions appear.
const INTAKE_MODEL = "claude-haiku-4-5";
// The memo is the product, so the writer earns a capable model. Sonnet 5 writes
// the executive prose; with only one writer call plus one search call the run
// still lands well under Vercel's 300s cap.
const WRITER_MODEL = "claude-sonnet-5";
const MAX_COMPETITORS = 5;

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

type Emit = (event: ProgressEvent) => void;

/** Human-readable scoping profile for prompts (writer + intake conditioning). */
function eligibilityContext(e?: EligibilityAnswers, targetMarkets?: string[]): string {
  if (!e && !targetMarkets?.length) return "";
  const band = TICKET_BANDS.find((b) => b.value === e?.ticketBand);
  const model = BORROWER_MODELS.find((m) => m.value === e?.borrowerModel);
  const lines = [
    band ? `Ticket sought: ${band.label}` : "",
    model ? `Borrower model: ${model.label}` : "",
    targetMarkets?.length ? `Target markets for public capital: ${targetMarkets.join(", ")}` : "",
    e?.entityCountries?.length ? `Entities/establishments in: ${e.entityCountries.join(", ")}` : "",
    e?.wouldOpenEntity ? `Would open a local entity where required: ${e.wouldOpenEntity}` : "",
    e?.fteBand ? `Team size: ${e.fteBand} FTE` : "",
    e?.turnoverBand ? `Turnover: ${e.turnoverBand}` : "",
    e?.ownerOver25 === "yes" ? "Has an owner holding 25% or more (SME test needs the linked-enterprise check)" : "",
    e?.nonEuControl === "yes" ? "Majority non-EU controlled (defence lanes restricted)" : "",
    e?.cofinancingBand ? `Co-financing capacity: ${e.cofinancingBand} of project cost` : "",
    e?.lossesOverHalfCapital === "yes"
      ? "FLAG: accumulated losses may exceed half of share capital (undertaking-in-difficulty risk: most GBER aid blocked until equity is restored)"
      : "",
    e?.conditionality?.length ? `Accepts conditions: ${e.conditionality.join(", ")}` : "",
    e?.developmentStage ? `Development stage: ${e.developmentStage.replace(/_/g, " ")}` : "",
    e?.activityCountries?.length ? `Funded activity will sit in: ${e.activityCountries.join(", ")}` : "",
    e?.consortium ? `Consortium-ready (3+ partners): ${e.consortium}` : "",
    e?.bankRelationship ? `Bank relationship that would lend if guaranteed: ${e.bankRelationship}` : "",
    e?.institutionalBacking ? `Institutional investors aboard or anchoring: ${e.institutionalBacking}` : "",
    e?.needBy ? `Capital needed: ${e.needBy.replace(/_/g, " ")}` : "",
  ].filter(Boolean);
  return lines.length ? `## Scoping profile (structured intake, AUTHORITATIVE)\n${lines.join("\n")}` : "";
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

const channelLabel = (code: string) => CHANNEL_LABEL[code] ?? code;

/** Human phrase for the founder's selected capital types, or "" when none/all. */
function capitalSoughtLabel(values?: string[]): string {
  if (!values || values.length === 0 || values.length >= CAPITAL_OPTIONS.length) return "";
  const labels = CAPITAL_OPTIONS.filter((o) => values.includes(o.value)).map((o) => o.label);
  return labels.join(", ");
}

/**
 * House rule: no em-dashes anywhere. The writer model breaks this silently, so we
 * enforce it in code on its prose. Em-dashes become commas; en-dashes (numeric
 * ranges like €0.5M–€2.5M) are left untouched. Applied only to model-written
 * fields, never to the code-built tables.
 */
function deDash(s: string): string {
  return s
    .replace(/\s*—\s*/g, ", ")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",")
    .replace(/,\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Full instrument names for the comparison table (the short labels above are for
// the dense funding-breakdown cells). Order doubles as relevance priority: the
// everyday entry points first, the slow strategic vehicles last.
const INSTRUMENT_NAME: Record<string, string> = {
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
const INSTRUMENT_PRIORITY = Object.keys(INSTRUMENT_NAME);

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
const DEFAULT_INSTRUMENTS = [
  "national_dev_banks", "state_aid_satr", "eic", "horizon_eu_pillar_ii", "eit",
];

// Scale routing (advisory_pipeline Stage D.1, first cut): which ticket bands
// each channel realistically serves, as [min,max] indices into TICKET_BANDS.
// A €20M+ ask must never get EIC Accelerator as its headline. Coarse by
// design — the terms engine (W1) replaces this with verified ticket gates.
const CHANNEL_BANDS: Record<string, [number, number]> = {
  national_dev_banks: [0, 4],
  state_aid_satr: [0, 3],
  eic: [0, 2],
  eit: [0, 1],
  horizon_eu_pillar_ii: [1, 3],
  horizon_eu_partnership: [1, 3],
  eib: [2, 4],
  innovation_fund: [2, 4],
  edf: [1, 3],
  chips_ju: [2, 4],
  ipcei: [3, 4],
};
const BAND_INDEX: Record<string, number> = Object.fromEntries(
  TICKET_BANDS.map((b, i) => [b.value, i]));

function channelServesBand(channel: string, band?: string): boolean {
  if (!band || !(band in BAND_INDEX)) return true;
  const range = CHANNEL_BANDS[channel];
  if (!range) return true;
  const i = BAND_INDEX[band];
  return i >= range[0] && i <= range[1];
}

// Large-scale channels surfaced when the ask is €15M+ even if absent from the
// field (the field's history skews small; the ask defines the universe).
const LARGE_SCALE_TOPUP = ["eib", "innovation_fund", "ipcei"];

/** The Fit line from a channel's curated brief, "" if not yet declared. */
function fitOf(channel: string): FounderFit | "" {
  return loadFundSnapshot(channel)?.fit ?? "";
}

const FIT_FLAG: Record<Exclude<FounderFit, "startup_ready">, string> = {
  consortium_institutional:
    "Consortium required — informational for most solo-founder raises, not a target.",
  large_scale_industrial:
    "Large-scale industrial — sized well above a typical early-stage ask.",
};

// Maps the founder-facing CAPITAL_OPTIONS values to the DB's capital_type
// enum — not 1:1, "Loans & guarantees" spans three DB values.
const CAPITAL_SOUGHT_TO_DB: Record<string, string[]> = {
  grant: ["grant"],
  loan: ["loan", "guarantee", "counter_guarantee"],
  recoverable_advance: ["recoverable_advance"],
  equity: ["equity", "blended"],
  tax_credit: ["tax_credit"],
};

// Representative euro value per ticket band, for ranking real DB leaf
// instruments by proximity to the founder's stated ask, against each
// instrument's own historical total_eur/event_count average award.
const TICKET_MIDPOINT: Record<string, number> = {
  lt500k: 250_000, b500k_2m5: 1_500_000, b2m5_15m: 8_000_000,
  b15m_50m: 32_000_000, gt50m: 75_000_000,
};

/** Which countries' national instruments should be in play: explicit
 *  targetMarkets (where the founder wants to RAISE) wins when given, else
 *  HQ country + wherever an entity already exists. */
function founderCountryList(country?: string, targetMarkets?: string[], entityCountries?: string[]): string[] {
  const explicit = (targetMarkets ?? []).filter(Boolean);
  if (explicit.length) return explicit;
  return [...new Set([country, ...(entityCountries ?? [])].filter((c): c is string => Boolean(c)))];
}

function instrumentServesCountry(instrumentCountry: string, founderCountries: string[]): boolean {
  if (!founderCountries.length) return true;      // no info yet — don't over-filter
  if (instrumentCountry === "EU") return true;     // EU-wide instruments always in play
  return founderCountries.some((c) => toIso2(c) === instrumentCountry);
}

function instrumentServesCapital(instrumentCapitalType: string, capitalSought: string[]): boolean {
  if (!capitalSought.length) return true;
  const allowed = new Set(capitalSought.flatMap((c) => CAPITAL_SOUGHT_TO_DB[c] ?? []));
  return allowed.size === 0 || allowed.has(instrumentCapitalType);
}

function typicalAward(inst: DbInstrument): number | null {
  return inst.eventCount > 0 ? inst.totalEur / inst.eventCount : null;
}

let dbInstrumentsByBucketCache: Map<string, DbInstrument[]> | null = null;
function dbInstrumentsByBucket(): Map<string, DbInstrument[]> {
  if (!dbInstrumentsByBucketCache) {
    dbInstrumentsByBucketCache = new Map();
    for (const inst of loadDbInstruments()) {
      if (inst.isFramework || !inst.sourceFamilyBucket) continue;
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
/** id -> instrument, built once per warm invocation. */
function instById(): Map<string, DbInstrument> {
  if (!instByIdCache) instByIdCache = new Map(loadDbInstruments().map((i) => [i.id, i]));
  return instByIdCache;
}

/** Channels whose instruments are national by construction: every leaf belongs
 *  to one country's programme, so an out-of-country leaf is never usable. */
const NATIONAL_CHANNELS = new Set(["national_dev_banks", "state_aid_satr"]);

function selectLeafInstruments(
  channel: string,
  founderCountries: string[],
  capitalSought: string[],
  ticketBand?: string,
  description?: string,
  semantic?: Map<string, number>,
): DbInstrument[] {
  const all = dbInstrumentsByBucket().get(channel) ?? [];
  if (!all.length) return [];
  // Graded fallback. The old single fallback ("if nothing matched, take
  // everything") relaxed country AND capital type at once, which is how a
  // German founder asking for grants ended up being offered Latvian Altum
  // loans: no German NDB in this bucket served grants, so the filter emptied
  // and every country came back. Relaxing capital type is defensible;
  // relaxing country is not, so it comes last and only to avoid an empty row.
  const inCountry = all.filter((i) => instrumentServesCountry(i.country, founderCountries));
  let candidates = inCountry.filter((i) => instrumentServesCapital(i.capitalType, capitalSought));
  if (!candidates.length) candidates = inCountry;
  // For channels whose instruments are national by construction, an empty
  // in-country result means the answer is "nothing here", not "show them
  // somebody else's". The last-resort fallback handed a Danish founder the
  // Estonian Enterprise Foundation and a Lithuanian ministry — schemes no
  // Danish company can draw on — and they survived to the brief looking
  // plausible, because their country restriction is not encoded as a gate so
  // the verdict layer returned `unknown` rather than `blocked`. Country here
  // is a fact about the instrument, so it does not need a gate to be true.
  if (!candidates.length && !NATIONAL_CHANNELS.has(channel)) candidates = all;
  if (!candidates.length) return [];
  const target = ticketBand ? TICKET_MIDPOINT[ticketBand] : undefined;
  const isExactCountry = (i: DbInstrument) =>
    founderCountries.length > 0 && founderCountries.some((c) => toIso2(c) === i.country);

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
    const ra = rel(a), rb = rel(b);
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
    const rawA = relevance.get(a.id) ?? 0, rawB = relevance.get(b.id) ?? 0;
    if (rawA !== rawB) return rawB - rawA;
    return b.eventCount - a.eventCount;
  });
  return sorted.slice(0, 2);
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
const DISPLAY_CAP = 6;
// The brief's "5 institutions to target" table is deliberately tighter than
// the preliminary verdict's DISPLAY_CAP — a lean founder gets a shortlist,
// not a menu.
const BRIEF_INSTITUTION_CAP = 5;
/** Below this the brief reads as a non-answer, so the writer may not reject its
 *  way past it. The corpus itself may still supply fewer — a genuinely excluded
 *  business (tobacco, gambling, weapons) has fewer real doors, and padding the
 *  table would mean offering funds it cannot use. */
const BRIEF_INSTITUTION_MIN = 2;
/** How many distinct funding channels to put in play before leaf selection.
 *  Each contributes at most two leaves, and everything downstream only ever
 *  removes rows. */
const MIN_CHANNELS_CONSIDERED = 7;
/** How many candidates the WRITER is shown. Comfortably more than the five
 *  that ship, because the brief's shape is FIVE institutions and three
 *  successive filters thin the pool before the writer sees it: off-theme
 *  large-scale channels, duplicate institution names, conclusively blocked
 *  funds. Three of the first six real memos shipped four or three rows. More
 *  than the five that ship, so
 *  it can discard the ones it can see are hopeless and still leave a full
 *  table. Reading real memos, four of Neura Robotics' five institutions were
 *  "one thing in the way" and three told the founder to skip them — the
 *  verdict engine only counts ENCODED rules, so a fund can be plainly wrong on
 *  stage or theme and still score as one small obstacle away. The writer can
 *  see that; it just had no way to act on it. */
const WRITER_CANDIDATE_CAP = 9;
// The pool synthesize() screens before cutting to the five shown. Deliberately
// wider than DISPLAY_CAP: funds a founder cannot access are dropped AFTER
// assessment, so a pool of six meant a founder blocked on three of them got a
// three-row brief while perfectly good candidates at rank seven were never
// looked at. Dropping must be able to backfill, not shrink the table.
const VERDICT_POOL = 18;
/** How thematically plausible a large-scale channel must be before a big ticket
 *  alone earns it a place. Deliberately low: it only has to be somewhere in the
 *  semantic neighbourhood, not a top match. */
const LARGE_SCALE_RELEVANCE_FLOOR = 0.5;

export function buildInstrumentTable(
  fieldChannels: Set<string>,
  ticketBand?: string,
  consortiumOk?: boolean,
  founderCountries: string[] = [],
  capitalSought: string[] = [],
  /** Founder's free-text description, for thematic leaf selection. */
  description?: string,
  /** Semantic fund-match scores (semantic.ts). Absent/empty = lexical only. */
  semantic?: Map<string, number>,
): InstrumentRow[] {
  const codes = new Set([...fieldChannels].filter((c) => channelServesBand(c, ticketBand)));
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
        if (best < LARGE_SCALE_RELEVANCE_FLOOR) continue;
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
    if (codes.size >= MIN_CHANNELS_CONSIDERED) break;
    if (!channelServesBand(c, ticketBand)) continue;
    // Only an explicit "no" rules out consortium-heavy channels. Treating
    // "not sure" as a no silently removed Horizon and the EIT KICs for every
    // undecided founder — the same unsure-means-failure mistake fixed in the
    // evaluator. Rows still carry a fitFlag so they are never presented as
    // equivalent to a solo-applicant route.
    if (fitOf(c) === "consortium_institutional" && !fieldChannels.has(c) && !consortiumOk) continue;
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
    if (!channelServesBand(hit.channel, ticketBand)) continue;
    if (fitOf(hit.channel) === "consortium_institutional" && !consortiumOk) continue;
    thematicFirst.push(hit.channel);
    codes.add(hit.channel);
  }
  // Thematic matches lead the list. Callers slice to DISPLAY_CAP (6) before the
  // memo ever sees the table, and a top-up appended last was being truncated
  // away — so the channel was correctly identified and then silently dropped.
  const ordered = [...thematicFirst, ...[...codes].filter((c) => !thematicFirst.includes(c))];
  return ordered
    .flatMap((channel) => {
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
      const leaves = selectLeafInstruments(channel, founderCountries, capitalSought, ticketBand, description, semantic);
      if (!leaves.length) {
        return [{ ...base, instrument: INSTRUMENT_NAME[channel] ?? channelLabel(channel) } as InstrumentRow];
      }
      return leaves.map((leaf) => ({
        ...base,
        instrument: leaf.name,
        instrumentId: leaf.id,
        country: leaf.country,
        capitalType: leaf.capitalType,
        eventCount: leaf.eventCount,
        administeringBody: leaf.administeringBody ?? undefined,
        administeringBodyShare: leaf.administeringBodyShare ?? undefined,
        legalBasis: legalBasisFor(leaf),
      } as InstrumentRow));
    })
    .sort((a, b) => {
      // Proven-in-field first.
      if (a.usedInField !== b.usedInField) return a.usedInField ? -1 : 1;
      // Startup-ready capital next, unless the founder is consortium-ready
      // (then consortium/institutional rows aren't artificially demoted).
      const demote = (r: InstrumentRow) =>
        r.fit !== "" && r.fit !== "startup_ready" &&
        !(r.fit === "consortium_institutional" && consortiumOk);
      const da = demote(a), db = demote(b);
      if (da !== db) return da ? 1 : -1;
      return INSTRUMENT_PRIORITY.indexOf(a.channel) - INSTRUMENT_PRIORITY.indexOf(b.channel);
    })
    // One row per institution NAME. 322 instruments share only 143 display
    // names, and selectLeafInstruments returns up to two leaves per channel,
    // so a founder could see "Enterprise Ireland" or "Norges Forskningsrad"
    // twice in the same table — which reads as a bug even when both rows are
    // real. Deduped here rather than at the call sites so the preliminary
    // verdict table and the memo's five institutions can never disagree.
    // Keep the leaf that can actually say something: the one with the most
    // ENCODED eligibility rules. First-wins looked right but is not — the sort
    // above orders by fit and channel priority, which knows nothing about
    // encoding coverage, so it kept an Enterprise Ireland leaf with zero
    // encoded rules over a sibling that returned a real "open" verdict.
    .filter((row, i, all) => {
      const name = displayInstitutionName(row);
      const peers = all.filter((o) => displayInstitutionName(o) === name);
      if (peers.length === 1) return true;
      const encodedCount = (r: InstrumentRow) => {
        const inst = r.instrumentId ? instById().get(r.instrumentId) : undefined;
        return inst ? inst.gates.filter(
          (g) => g.valueSpec && (!g.gateRole || g.gateRole === "filter")).length : 0;
      };
      const best = peers.reduce((a, b) => (encodedCount(b) > encodedCount(a) ? b : a));
      return all.indexOf(best) === i;
    });
}

// Channels where "genuine breakthrough vs applied/incremental" actually
// changes how a founder should approach the fund — EIC/Horizon/EIT panels
// explicitly screen for technical risk; national dev banks and GBER loans do
// not. Deliberately small and easy to extend; adding a channel here is the
// only way Phase 4's profile signal ever touches a new row.
const DEPTH_SENSITIVE_CHANNELS = new Set(["eic", "horizon_eu_pillar_ii", "horizon_eu_partnership", "eit"]);

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

/** "€2.5M EIC · €1.8M dev banks" — the top doors, with figures where known. */
function fundingBreakdown(channelAmounts: ChannelAmount[]): string {
  return channelAmounts
    .slice(0, 3)
    .map((c) => (c.eur > 0 ? `${fmtEur(c.eur)} ${channelLabel(c.channel)}` : channelLabel(c.channel)))
    .join(" · ");
}

/** "2021–2024", "2023", or "" when no dated event is on file. */
function activeYears(first: number, last: number): string {
  if (!first && !last) return "";
  if (!first) return String(last);
  if (!last || first === last) return String(first);
  return `${first}–${last}`;
}

/** Pull the first fenced JSON block (or the first {...}/[...]) out of model text. */
function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.search(/[[{]/);
  if (start === -1) throw new Error("No JSON found in model response");
  // Walk to the matching closing bracket so trailing prose is ignored. Track
  // string state so braces/brackets *inside* string values don't throw off the
  // depth count (that would slice the JSON mid-string -> "unterminated string").
  const open = raw[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let end = -1;
  let inStr = false;
  let esc = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) {
      end = i + 1;
      break;
    }
  }
  const candidate = raw.slice(start, end === -1 ? undefined : end);
  try {
    return JSON.parse(candidate) as T;
  } catch {
    // The model occasionally emits raw control characters (unescaped newlines,
    // tabs) INSIDE string literals — invalid JSON. Escape them string-aware:
    // control chars between tokens are legal whitespace and must stay.
    let out = "";
    let inS = false;
    let e2 = false;
    for (const ch of candidate) {
      if (inS) {
        if (e2) e2 = false;
        else if (ch === "\\") e2 = true;
        else if (ch === '"') inS = false;
        else if (ch === "\n") { out += "\\n"; continue; }
        else if (ch === "\t") { out += "\\t"; continue; }
        else if (ch === "\r") continue;
        else if (ch.charCodeAt(0) < 0x20) continue;
      } else if (ch === '"') {
        inS = true;
      }
      out += ch;
    }
    return JSON.parse(out) as T;
  }
}

/** One non-streaming message turn with the web-search tool available. */
async function askWithSearch(model: string, system: string, user: string): Promise<string> {
  // Lighter web-search version (no server-side dynamic-filtering code execution)
  // and thinking disabled — both are pure latency on a search-grounded task.
  const tools = [
    { type: "web_search_20250305" as const, name: "web_search" as const, max_uses: 4 },
  ];
  const res = await client.messages.create({
    model,
    max_tokens: 8000,
    thinking: { type: "disabled" },
    system,
    tools,
    messages: [{ role: "user", content: user }],
  });
  // web_search runs a server-side loop; resume once if it paused mid-search.
  let message = res;
  let guard = 0;
  while (message.stop_reason === "pause_turn" && guard++ < 1) {
    message = await client.messages.create({
      model,
      max_tokens: 8000,
      thinking: { type: "disabled" },
      system,
      tools,
      messages: [
        { role: "user", content: user },
        { role: "assistant", content: message.content },
      ],
    });
  }
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

// ── Stages 1+3 merged: discover competitors AND research them in one search pass.
// Two serial web-search calls were the timeout; one pass finds the peers and
// their snapshots together, then we DB-match the names (no LLM) below.
async function discoverAndResearch(
  req: IntelligenceRequest,
  instructions: string,
): Promise<CompetitorIntel[]> {
  const ctx = [
    `Company: ${req.company}`,
    req.sector ? `Sector: ${req.sector}` : "",
    req.country ? `Country: ${req.country}` : "",
    req.companyType ? `Company type: ${req.companyType}` : "",
    req.description ? `What they do: ${req.description}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const text = await askWithSearch(
    SEARCH_MODEL,
    instructions,
    `Identify ${MAX_COMPETITORS} comparable European companies for this company, ` +
      `and for each give a short, current snapshot. Comparable means operating in ` +
      `a similar field at a similar altitude — it does NOT need to be a direct ` +
      `competitor. The goal is to understand who receives public funding and how, ` +
      `so prefer companies likely to have drawn on public support (EU programmes, ` +
      `national agencies, development banks). Private venture rounds are out of ` +
      `scope — do not report who raised what with which investor. Use web search ` +
      `to ground your answer.\n\n${ctx}\n\n` +
      `Return ONLY a JSON array, most relevant first, one object per company:\n` +
      `[{"name": "...", "country": "...", "product": "...", "positioning": "...", ` +
      `"maturity": "...", "notes": "..."}]\n` +
      `"country" is the country the company operates from (full English name, or ` +
      `"Unknown"); it helps us look up the right legal entity. Use legal or common ` +
      `company names. "maturity" is a rough label (lab-stage, scaling, established, ` +
      `listed), not a financing round. Keep each field to one or two sentences. ` +
      `If something is unknown, say "Unknown".`,
  );
  // A search-grounded model sometimes wraps its JSON in prose, or truncates
  // mid-array. Unguarded, that SyntaxError propagated all the way out and the
  // founder got an error page instead of a brief -- even though comparables
  // are CORROBORATING evidence, not the substance of the memo, which is built
  // from the instrument corpus and DB-native peers. Losing them costs some
  // supporting colour; losing the memo costs the whole request.
  let intel: CompetitorIntel[];
  try {
    intel = extractJson<CompetitorIntel[]>(text);
  } catch (err) {
    console.error("competitor intel did not parse, continuing without it:",
      String(err), { chars: text.length });
    return [];
  }
  if (!Array.isArray(intel)) return [];
  return intel
    .slice(0, MAX_COMPETITORS)
    .filter((i) => i && i.name && String(i.name).trim())
    .map((i) => ({
      name: String(i.name).trim(),
      country: i.country && i.country !== "Unknown" ? String(i.country).trim() : undefined,
      product: i.product ?? "Unknown",
      positioning: i.positioning ?? "Unknown",
      maturity: i.maturity ?? "Unknown",
      notes: i.notes ?? "",
    }));
}

// ── Stage 4: synthesise the report (structured output, no tools) ─────────────
// The schema is built per-request inside synthesize() (not a static const):
// institutionNotes.channel is constrained to an enum of the actual candidate
// channels for THIS founder, the same discipline generateGroundedRound()
// already uses for its field enum below.

/**
 * Build the comparable-companies table deterministically. euCapital and channels
 * come ONLY from the DB match (never the model, never the open web); maturity and
 * positioning are web colour. `records` is aligned 1:1 with `intel` (records =
 * intel mapped through matchCompany), so they share an index.
 *
 * HARD RULE (user, 2026-07-09): a company appears in the table ONLY if it has
 * traced public funding. Web-found names with no DB match are dropped here —
 * the study tracks public support, not the venture market, so "found on the
 * web but no public funding" is not a row, it is an absence.
 */
function buildCompetitors(
  records: CompetitorRecord[],
  intel: CompetitorIntel[],
): CompetitorRow[] {
  return records.flatMap((r, i) => {
    if (!r.matched) return [];
    const web = intel[i];
    return [{
      name: web?.name || r.name || "Unknown",
      source: "web" as const,
      country: r.country,
      euCapital: r.euCapitalEur > 0 ? fmtEur(r.euCapitalEur) : "Amount not disclosed",
      channelBreakdown: fundingBreakdown(r.channelAmounts),
      channels: r.channels,
      activeYears: activeYears(r.firstYear, r.lastYear),
      // Web colour goes into table cells, so it obeys the no-em-dash rule too.
      stage: deDash(web?.maturity || "Unknown"),
      positioning: deDash(web?.positioning || "Unknown"),
    }];
  });
}

/** Database-native peers (same sub-sector, all funded) → comparable rows. */
function buildDbPeers(peers: CompetitorRecord[]): CompetitorRow[] {
  return peers.map((r) => ({
    name: r.name,
    source: "corpus" as const,
    country: r.country,
    euCapital: fmtEur(r.euCapitalEur),
    channelBreakdown: fundingBreakdown(r.channelAmounts),
    channels: r.channels,
    activeYears: activeYears(r.firstYear, r.lastYear),
    stage: "Unknown",
    positioning: `Funded in your sub-sector (${r.subsector.replace(/_/g, " ")})`,
  }));
}

/** For one institution's channel: the 2-3 comparable companies (web-found
 *  peers + DB-native sub-sector peers, excluding the founder) that drew on
 *  exactly that channel, ranked by amount on that channel. Code-built —
 *  never the model's choice, so the brief can never name a firm that didn't
 *  actually use this door. */
function comparableFirmsForChannel(
  channel: string,
  records: CompetitorRecord[],
  dbPeers: CompetitorRecord[],
): { name: string; amount: string }[] {
  return [...records, ...dbPeers]
    .filter((r) => r.matched && r.channels.includes(channel))
    .map((r) => ({
      name: r.name,
      eur: r.channelAmounts.find((c) => c.channel === channel)?.eur ?? 0,
    }))
    .sort((a, b) => b.eur - a.eur)
    .slice(0, 3)
    .map((r) => ({ name: r.name, amount: r.eur > 0 ? fmtEur(r.eur) : "amount not disclosed" }));
}

// Capital-type -> plain-English "type of support" label. Falls back to a
// per-channel default when the row didn't resolve to a DB-native leaf with
// its own capitalType (see selectLeafInstruments).
const CAPITAL_TYPE_LABEL: Record<string, string> = {
  grant: "Grant", loan: "Loan", guarantee: "Guarantee", counter_guarantee: "Guarantee",
  recoverable_advance: "Recoverable advance", equity: "Equity stake",
  blended: "Grant + equity (blended)", tax_credit: "Tax credit",
};
const CHANNEL_SUPPORT_TYPE: Record<string, string> = {
  national_dev_banks: "Loan / guarantee",
  state_aid_satr: "Grant / tax relief",
  eic: "Grant + equity (blended)",
  eit: "Grant + venture support",
  horizon_eu_pillar_ii: "Grant",
  horizon_eu_partnership: "Grant",
  eib: "Loan / venture debt",
  innovation_fund: "Grant",
  edf: "Grant",
  chips_ju: "Grant",
  ipcei: "Grant (state aid)",
};
function supportTypeLabel(row: InstrumentRow): string {
  const base = (row.capitalType && CAPITAL_TYPE_LABEL[row.capitalType])
    || CHANNEL_SUPPORT_TYPE[row.channel]
    || "Grant";
  // state_aid_satr is a REGISTER (the State Aid Transparency Register — where
  // this data was published), not a fund. Every leaf under it is a specific
  // national scheme run by a specific government body (see
  // displayInstitutionName below); the support-type label makes that explicit
  // rather than reading like a single pan-EU vehicle called "SATR."
  return row.channel === "state_aid_satr" ? `${base} (national government, state aid)` : base;
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
const GBER_ARTICLE_LABEL: Record<string, string> = {
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
function legalBasisFor(leaf: DbInstrument): string | undefined {
  const gate = leaf.gates.find((g) => g.id === "gber_article_inferred");
  if (!gate) return undefined;
  return GBER_ARTICLE_LABEL[gate.value] ?? gate.requirement.split(" — ")[0];
}

/**
 * The brief's centrepiece table, code-built: one row per given instrument
 * row, each with its objective facts finalised here (institution, channel,
 * supportType, ticket, comparableFirms). whyEligible/nextStep start empty —
 * synthesize() fills them from the model's narrative after synthesis, keyed
 * positionally (see rowKeys there), NOT by `channel`: buildInstrumentTable
 * can legitimately emit two rows on the same channel (two DB-native leaf
 * instruments, e.g. two distinct Bpifrance schemes), so `channel` alone is
 * not a unique row identifier.
 */
function buildInstitutions(
  rows: InstrumentRow[],
  records: CompetitorRecord[],
  dbPeers: CompetitorRecord[],
): InstitutionEntry[] {
  return rows.map((row) => ({
    institution: displayInstitutionName(row),
    channel: row.channel,
    supportType: supportTypeLabel(row),
    ticket: row.ticket,
    country: row.country,
    legalBasis: row.legalBasis,
    whyEligible: "",
    comparableFirms: comparableFirmsForChannel(row.channel, records, dbPeers),
    nextStep: "",
  }));
}

/** The founder's own footprint in the corpus, formatted for the BLUF. */
function buildSelf(r: CompetitorRecord): SelfRecord {
  return {
    matched: r.matched,
    euCapital: !r.matched
      ? "No public funding traced"
      : r.euCapitalEur > 0
        ? fmtEur(r.euCapitalEur)
        : "Amount not disclosed",
    channelBreakdown: r.matched ? fundingBreakdown(r.channelAmounts) : "",
    channels: r.matched ? r.channels : [],
    activeYears: r.matched ? activeYears(r.firstYear, r.lastYear) : "",
  };
}

// Fixed, code-authored close for stateOfPlay — never model-written, so the
// claim stays controlled and on-register (public-awards-intelligence, never
// competitive-urgency framing).
const STATE_OF_PLAY_PLUG =
  "Wincent tracks Europe's state-backed capital cycles and political " +
  "priorities continuously, and helps companies align their narrative with " +
  "what is genuinely being prioritised right now, opening doors to the " +
  "people who decide.";

async function synthesize(
  req: IntelligenceRequest,
  records: CompetitorRecord[],
  intel: CompetitorIntel[],
  dbPeers: CompetitorRecord[],
  self: SelfRecord,
  instrumentTable: InstrumentRow[],
  instructions: string,
  sectorTop: string,
  emit: Emit,
): Promise<Omit<IntelligenceReport, "company" | "generatedAt">> {
  const profileBlock = eligibilityContext(req.eligibility, req.targetMarkets);
  // Stage D (v1): the deterministic eligibility screen — computed here, in
  // code, from the verified term records. The writer narrates it; the rows
  // themselves are never model-written.
  // Scoped to the shortlist. Unscoped this returns ~350 rows across all 322
  // instruments — it rendered as a 35,000-pixel wall below the memo and buried
  // the thing the founder came for. Per-instrument qualification now lives on
  // the institution rows (verdict.ts); this screen is the framework checks plus
  // the rules behind the funds actually on the table.
  const eligibilityScreen = evaluateEligibility(
    req.eligibility,
    // Head of the pool only. The pool is deliberately wide so blocked funds can
    // be backfilled, but the screen is a founder-facing table — scoping it to
    // the whole pool is what made it a 35,000-pixel wall in the first place.
    instrumentTable.slice(0, DISPLAY_CAP)
      .map((r) => r.instrumentId).filter((id): id is string => Boolean(id)),
  );
  const screenBlock = eligibilityScreen.length
    ? "## Eligibility screen (AUTHORITATIVE, code-evaluated against primary law)\n" +
      eligibilityScreen.map((r) =>
        `- ${r.check}: ${r.status.toUpperCase()} — ${r.finding}` +
        (r.cure ? ` Cure: ${r.cure}` : "") +
        ` [${r.source.file}${r.source.locator ? ", " + r.source.locator : ""}]`,
      ).join("\n") +
      "\nYour bottom-line bullets and every institution's whyEligible must be " +
      "CONSISTENT with these rows (never claim an eligibility a NOT_MET row " +
      "closes without naming the cure first; treat UNKNOWN rows as a " +
      "verification step, not a claim)."
    : "";
  // Phase 4: the model's OWN read of the founder's free-text description —
  // deliberately NOT labeled AUTHORITATIVE, unlike every block above. Only
  // present when it diverges from what the founder self-selected; the writer
  // may mention it as colour, never as fact, never overriding the founder's
  // own pick or the eligibility screen.
  const softSignalBlock =
    // Self-guarding: when the type was INFERRED rather than stated,
    // runIntelligence sets companyType to techDepthRead, so this is false and
    // no divergence note fires. It only speaks when a founder actually stated
    // a type that the description contradicts.
    req.profileSignal && req.profileSignal.techDepthRead !== req.companyType
      ? `## Free-text read (SOFT SIGNAL — not authoritative, not verified)\n` +
        `The founder's own description reads more like "${req.profileSignal.techDepthRead}" ` +
        `than the "${req.companyType ?? "unstated"}" they selected under Company type. ` +
        `Reason: ${req.profileSignal.note}\n` +
        `You may mention this as a nuance if it's genuinely useful, but never ` +
        `treat it as fact, never let it override the founder's own selection or ` +
        `the eligibility screen, and never present it with the same certainty ` +
        `as the AUTHORITATIVE blocks above.`
      : "";

  // Current-landscape grounding: build-time export of the intelligence corpus
  // (signals_digest.json). The digest captures the FULL A-Z topic universe on
  // every build; tailoring to THIS founder happens here, at the last moment —
  // capital sought, sector, and the channels actually used in the field pick
  // which slices the writer sees. "positioning" and "stateOfPlay" may ONLY be
  // grounded in these lines — no invention.
  const digest = loadSignalsDigest();
  const fieldChannels = new Set(
    instrumentTable.filter((r) => r.usedInField).map((r) => r.channel));
  const topics = new Set<string>(["competitiveness_fund", "startup_scaleup"]);
  const cap = new Set(req.capitalSought ?? []);
  const wantsEverything = cap.size === 0;
  // Scale capital: cheap, abundant financing for industrial-scale operations —
  // always on the menu for loan/equity seekers and capital-intensive sectors.
  if (wantsEverything || cap.has("loan") || cap.has("equity")) {
    topics.add("scale_capital");
    topics.add("investeu");
  }
  if (wantsEverything || cap.has("grant") || cap.has("recoverable_advance") ||
      cap.has("tax_credit")) {
    topics.add("horizon_eic");
    topics.add("national_dev_banks");
    topics.add("state_aid_reform");
  }
  const INDUSTRIAL = new Set([
    "energy_cleantech", "industrial_manufacturing", "materials_chemicals",
    "semiconductors_electronics", "mobility_transport",
  ]);
  if (INDUSTRIAL.has(sectorTop)) {
    topics.add("industrial_policy");
    topics.add("innovation_fund");
    topics.add("ipcei");
    topics.add("scale_capital");
  }
  if (sectorTop === "defense_security") topics.add("defence");
  if (sectorTop === "space") topics.add("space");
  if (sectorTop === "software_data_ai") topics.add("digital_ai");
  if (sectorTop === "semiconductors_electronics") topics.add("chips");
  if (sectorTop === "energy_cleantech") topics.add("eit_kics");
  if (req.companyType === "Deep-tech breakthrough") topics.add("step");
  const bandIdx = req.eligibility?.ticketBand ? BAND_INDEX[req.eligibility.ticketBand] : undefined;
  if (bandIdx !== undefined && bandIdx >= 3) {
    topics.add("scale_capital");
    topics.add("investeu");
    topics.add("ipcei");
    topics.add("industrial_policy");
  }
  if (req.eligibility?.borrowerModel === "balance_sheet_lender" ||
      req.eligibility?.borrowerModel === "originator") {
    topics.add("investeu");
    topics.add("scale_capital");
  }
  for (const [ch, t] of [
    ["ipcei", "ipcei"], ["edf", "defence"], ["chips_ju", "chips"],
    ["eit", "eit_kics"], ["innovation_fund", "innovation_fund"],
    ["eib", "scale_capital"],
  ] as const) {
    if (fieldChannels.has(ch)) topics.add(t);
  }
  const formatDigestItem = (it: DigestItem & { tag: string }) =>
    `- [${it.tag}] ${it.title} (${it.source}${it.date ? `, ${it.date}` : ""}): ` +
    `${it.excerpt.slice(0, 320)}`;
  // "positioning" agenda grounding: what's on the policy agenda right now,
  // relevance-ranked (same topic tailoring the old landscape section used).
  const agendaItems: (DigestItem & { tag: string })[] = digest
    ? [
        ...[...topics].flatMap((t) =>
          (digest.topics[t] ?? []).slice(0, 2).map((it) => ({ ...it, tag: t }))),
        ...(digest.sectors[sectorTop] ?? digest.sectors["other"] ?? [])
          .slice(0, 3)
          .map((it) => ({ ...it, tag: "your sector" })),
      ]
    : [];
  const agendaEvidence = agendaItems.map(formatDigestItem).join("\n");
  // "positioning" namedrop grounding: who is actually shaping that agenda
  // right now, most recent first. Plain recency join (not a similarity
  // search) — see _people() in signals_digest.py.
  const peopleEvidence = (digest?.people ?? [])
    .slice(0, 10)
    .map((p) =>
      `- ${p.person} (${p.signalType.replace(/_/g, " ")}; ${p.source}` +
      `${p.date ? `, ${p.date}` : ""}): ${p.title}. ${p.excerpt.slice(0, 220)}`)
    .join("\n");
  // "stateOfPlay" grounding: the same tailored evidence pool, re-sorted by
  // recency instead of relevance — a founder's "state of play" should lead
  // with what just happened, not merely what's on-topic.
  const recentEvidence = [...agendaItems]
    .filter((it) => it.date)
    .sort((a, b) => (a.date! < b.date! ? 1 : -1))
    .slice(0, 4)
    .map(formatDigestItem)
    .join("\n");

  // The comparable-company evidence pool: web-found direct comparables plus
  // same-sub-sector DB-native peers. Grounds bottomLine and whyEligible; the
  // per-institution comparableFirms list below is built from the same
  // records but code-finalised, never restated by the model.
  const competitors = [...buildCompetitors(records, intel), ...buildDbPeers(dbPeers)];
  const evidence = competitors
    .map((c) => {
      const where = c.country ? ` (${c.country})` : "";
      const tag = c.source === "corpus" ? " [same sub-sector, from database]" : "";
      const traced = c.channelBreakdown
        ? `${c.euCapital} — ${c.channelBreakdown}${c.activeYears ? `, ${c.activeYears}` : ""}`
        : c.euCapital;
      return (
        `- ${c.name}${where}${tag}: EU/public capital ${traced}; ` +
        `positioning — ${c.positioning}; maturity — ${c.stage}`
      );
    })
    .join("\n");

  // The founder's own footprint, so bottomLine can open with where THEY stand.
  const selfLine = self.matched
    ? `${req.company}: EU/public capital ${self.euCapital}` +
      `${self.channelBreakdown ? ` — ${self.channelBreakdown}` : ""}` +
      `${self.activeYears ? `, ${self.activeYears}` : ""}`
    : `${req.company}: no public funding traced in our database (which is not ` +
      `proof of none — coverage varies by country).`;

  // Inject only the process briefs for channels that actually appear.
  const channels = [
    ...new Set([
      ...records.flatMap((r) => (r.matched ? r.channels : [])),
      ...dbPeers.flatMap((r) => r.channels),
    ]),
  ];
  const processes = channels
    .map((c) => loadFundProcess(c))
    .filter(Boolean)
    .join("\n\n---\n\n");

  const capitalPref = capitalSoughtLabel(req.capitalSought);
  const ctx = [
    `Founder's company: ${req.company}`,
    req.sector ? `Sector: ${req.sector}` : "",
    req.country ? `Country: ${req.country}` : "",
    req.companyType ? `Company type (founder's own words): ${req.companyType}` : "",
    req.description ? `What they do: ${req.description}` : "",
    capitalPref
      ? `Capital sought (founder's preference): ${capitalPref}. Respect this as a ` +
        `filter and a ranking signal: lead with these capital types, demote and ` +
        `flag the cost of anything that conflicts (e.g. equity/blended dilution ` +
        `when they asked for non-dilutive).`
      : "",
    req.clarifications && req.clarifications.length > 0
      ? `Founder's clarifications (their own answers to targeted questions, ` +
        `AUTHORITATIVE about their situation): ` +
        req.clarifications.map((c) => `${c.question} -> ${c.answer}`).join("; ") +
        `. Use these to read archetype, ticket floor, dilution tolerance and ` +
        `consortium-willingness, and route accordingly.`
      : "",
    // brief_funnel_v2 Stage 2b. This is the block that makes the brief read
    // like it was written for THIS company: each line is the founder's own
    // answer to a question phrased from one fund's verbatim requirement.
    req.projectAnswers && req.projectAnswers.length > 0
      ? `## The founder's project, against real fund requirements (AUTHORITATIVE)\n` +
        req.projectAnswers
          .map(
            (p) =>
              `- ${p.instrumentName} requires: "${p.quote}"\n` +
              `  Asked: ${p.question}\n` +
              `  They answered: ${p.answer}`,
          )
          .join("\n") +
        `\nThese are the sharpest facts you have about what this company ` +
        `actually does. Use them concretely: name the specific requirement and ` +
        `how this company sits against it, rather than describing the fund in ` +
        `general terms. Where an answer shows a requirement is not met, say so ` +
        `plainly and give the cure. Never restate an answer as a fact the ` +
        `founder did not give.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  // The brief's centrepiece table, finalised in code (institution, channel,
  // supportType, ticket, comparableFirms) — the model only supplies
  // whyEligible/nextStep per row, keyed positionally by rowKeys below (never
  // by `channel` alone: two rows can share a channel, see buildInstitutions).
  // brief_funnel_v2 Stage 3: re-rank on EASE before cutting to five, so the
  // brief leads with the doors this company can most plausibly walk through
  // rather than simply the best-fitting ones. Fit ordering (exact country,
  // then ticket proximity, then event count) survives as the tie-break: rows
  // with no ease signal at all keep their original position.
  const comparableCounts = new Map<string, number>();
  for (const row of instrumentTable) {
    if (!row.instrumentId) continue;
    comparableCounts.set(
      row.instrumentId,
      [...records, ...dbPeers].filter((r) => r.matched && r.channels.includes(row.channel)).length,
    );
  }
  const easeById = scoreEase(
    instrumentTable.map((r) => r.instrumentId).filter((id): id is string => Boolean(id)),
    req.eligibility,
    req.projectAnswers,
    comparableCounts,
    eligibilityScreen,
    // Demote national schemes the founder cannot actually use. A German
    // company was being handed an Estonian equity scheme at rank 2, which the
    // writer then had to apologise for in the row itself.
    new Set(
      founderCountryList(req.country, req.targetMarkets, req.eligibility?.entityCountries)
        .map((c) => toIso2(c))
        .filter(Boolean)
        .map((c) => c.toUpperCase()),
    ),
  );
  // Qualification comes before ease. A door that is open, or one thing away
  // from open, outranks a door that merely scores well — and a door that is
  // conclusively shut is dropped rather than ranked, because a roster of
  // rejections is not advice.
  const assessments = assessAll(
    instrumentTable.map((r) => r.instrumentId).filter((id): id is string => Boolean(id)),
    req.eligibility,
  );
  const rankedByEase = instrumentTable
    .map((row, i) => ({
      row, i,
      ease: row.instrumentId ? easeById.get(row.instrumentId) : undefined,
      assessment: row.instrumentId ? assessments.get(row.instrumentId) : undefined,
    }))
    .sort((a, b) => {
      const ra = VERDICT_RANK[a.assessment?.status ?? "unknown"];
      const rb = VERDICT_RANK[b.assessment?.status ?? "unknown"];
      if (ra !== rb) return ra - rb;
      return (b.ease?.score ?? 0) - (a.ease?.score ?? 0) || a.i - b.i;
    });

  // Never show a founder a fund they cannot access — no exceptions, no
  // backfill. A short table of real options beats a padded one, and a fund
  // that is conclusively shut is time the founder does not get back. In
  // practice the table stays full: `unknown` counts as accessible, and most
  // instruments carry no encoded filter yet.
  // One row per institution NAME, not per instrument id. 322 instruments
  // share only 143 display names, so two leaves of the same body can both
  // survive ranking and the founder sees "Enterprise Ireland" twice in one
  // table — once open, once not assessable — which reads as a broken brief.
  // Ranking already put the better row first, so first-wins is the right rule.
  const seenNames = new Set<string>();
  const baseRows = rankedByEase
    .filter((r) => r.assessment?.status !== "blocked")
    .filter((r) => {
      const name = displayInstitutionName(r.row);
      if (seenNames.has(name)) return false;
      seenNames.add(name);
      return true;
    })
    .slice(0, WRITER_CANDIDATE_CAP)
    .map((r) => r.row);
  const institutions = buildInstitutions(baseRows, records, dbPeers).map((entry, idx) => {
    const id = baseRows[idx].instrumentId;
    const a = id ? assessments.get(id) : undefined;
    return {
      ...entry,
      whyEasy: whyEasyLine(id ? easeById.get(id) : undefined, entry.institution),
      verdict: a?.status ?? "unknown",
      // Only ever one blocker reaches the founder — a row with two or more is
      // `blocked` and was already dropped above.
      blocker: a?.blockers[0]?.requirement,
      gatesChecked: a?.checked ?? 0,
    };
  });
  // Stream what's already known, well before the writer model call below
  // resolves: self footprint, eligibility screen and the institution rows
  // (whyEligible/nextStep still "" here — the client renders those as
  // placeholders until the final "report" event replaces this).
  // Preview only the rows that could actually ship. The writer is shown more
  // candidates than are published, and streaming all of them would flash eight
  // rows that then collapse to five.
  emit({ type: "partial", data: {
    self, eligibilityScreen, institutions: institutions.slice(0, BRIEF_INSTITUTION_CAP),
  } });
  const seenRowKeys = new Set<string>();
  const rowKeys = baseRows.map((row) => {
    let key = row.instrumentId ?? row.channel;
    while (seenRowKeys.has(key)) key += "#";
    seenRowKeys.add(key);
    return key;
  });
  const institutionsEvidence = institutions
    .map((r, i) => {
      const row = baseRows[i];
      const firms = r.comparableFirms.length
        ? r.comparableFirms.map((f) => `${f.name} (${f.amount})`).join(", ")
        : "none traced yet";
      return (
        `- key "${rowKeys[i]}" (${r.institution})` +
        `${row.usedInField ? " [used by peers in your field]" : ""}` +
        `${row.fitFlag ? ` [${row.fitFlag}]` : ""}: ` +
        // The verdict, and the obstacle where there is one. Without this the
        // writer cannot see which row is blocked, so it left blockerPlain empty
        // every time and the raw statute rendered in the table instead.
        `screening says ${r.verdict === "one_blocker" ? "ONE THING IN THE WAY" : r.verdict === "open" ? "OPEN (nothing rules them out)" : "not assessable"}; ` +
        `${r.blocker ? `the obstacle, verbatim: "${r.blocker}"; ` : ""}` +
        `support ${r.supportType}; ticket ${r.ticket}; ` +
        `${r.legalBasis ? `legal basis ${r.legalBasis}; ` : ""}` +
        `comparable firms funded through it: ${firms}`
      );
    })
    .join("\n");
  const channelEnum = rowKeys;

  // Schema is built per-request (not a static const): institutionNotes must
  // cover exactly this founder's candidate rows, enum-constrained the same
  // way generateGroundedRound() constrains its field enum below. The JSON
  // property is still called "channel" on the wire, but its value is the
  // disambiguated rowKey, not necessarily the literal channel code.
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      // The API's structured-output arrays support neither minItems > 1 nor
      // maxItems — exact counts (4-5 bullets, one note per channel) are
      // enforced by the prompt instructions plus the post-merge fallback
      // below (mirrors how the old schema relied on prompt + .slice(), never
      // minItems/maxItems, for watchItems/funderMap/todos).
      bottomLine: { type: "array", items: { type: "string" } },
      institutionNotes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            channel: { type: "string", enum: channelEnum.length ? channelEnum : [""] },
            whyEligible: { type: "string" },
            nextStep: { type: "string" },
            // Plain-English restatement of a "one thing in the way" rule.
            // Rides on the writer call that already runs, so it costs no extra
            // latency — the alternative was rendering 200+ characters of raw
            // statute in a table cell.
            blockerPlain: { type: "string" },  // "" when the row has no blocker
            /** false = do not put this in front of the founder at all. */
            worthPursuing: { type: "boolean" },
          },
          // blockerPlain is REQUIRED, not optional: left optional the model
          // simply omitted it every time and the raw statute rendered instead.
          // Empty string is the documented answer for rows with no blocker.
          required: ["channel", "whyEligible", "nextStep", "blockerPlain", "worthPursuing"],
        },
      },
      positioning: { type: "string" },
      stateOfPlay: { type: "string" },
      caveats: { type: "string" },
    },
    required: ["bottomLine", "institutionNotes", "positioning", "stateOfPlay", "caveats"],
  } as const;

  // STREAMED, not create(). The budget below is large enough that the SDK
  // refuses a non-streaming request outright ("Streaming is required for
  // operations that may take longer than 10 minutes"), which killed every memo
  // the moment the budget was raised. Streaming lifts that ceiling; the awaited
  // finalMessage() has the same shape as create(), so nothing downstream
  // changes. Do not convert this back to create() without also lowering
  // max_tokens below the SDK's threshold.
  // A hung stream is worse than a failed one: with no bound, one bunq run sat
  // on an open connection for 69 minutes before the socket dropped -- for a
  // founder, an indefinite spinner.
  //
  // The SDK's own `timeout` option is not enough here. It did not stop the
  // stream (no attempt ever logged a completion), and the SDK RETRIES on
  // timeout, so the ceiling multiplies: the same run still took 42 minutes
  // before surfacing "Request timed out". So retries are off and the deadline
  // is enforced here, with an explicit abort, giving a hard worst case of two
  // attempts rather than an open-ended one.
  // Both attempts have to fit inside the route's maxDuration (300s, see
  // app/api/intelligence/route.ts) or the retry is killed by the platform
  // before it can save the memo -- which would make the fallback useless in
  // exactly the case it exists for. Research has already run by this point, so
  // the split is deliberately lopsided: a generous first attempt, then a
  // shorter one that has no thinking to pay for and needs far less.
  const WRITER_TIMEOUT_MS = 150_000;
  const WRITER_RETRY_TIMEOUT_MS = 90_000;
  const writerCall = (thinking: "adaptive" | "disabled") => client.messages.stream({
    model: WRITER_MODEL,
    // Raised from 16000 when the writer went from 5 candidates to 9: that is
    // far more structured output on top of adaptive thinking, and a GovTech run
    // truncated mid-string at ~1.9k chars of JSON, losing a three-minute memo.
    max_tokens: 24000,
    // Sonnet 5 rejects fixed thinking budgets (400); adaptive lets the model
    // size the prioritisation judgement itself — but it can also spend the
    // entire budget thinking and emit nothing, so the caller retries with it
    // off rather than losing the memo (see below).
    thinking: { type: thinking },
    system: instructions,
    output_config: { format: { type: "json_schema", schema } },
    messages: [
      {
        role: "user",
        content:
          `Write the founder's public-capital brief. The reader is a lean, ` +
          `early-stage founder or operator with no time for institutional-` +
          `affairs overhead: every sentence must earn its place. Total prose ` +
          `across bottomLine + positioning + stateOfPlay must land at or ` +
          `under ~700 words; the institutions table is separate and not ` +
          `counted toward that budget.\n\n${ctx}\n\n` +
          `${profileBlock ? profileBlock + "\n\n" : ""}` +
          `${screenBlock ? screenBlock + "\n\n" : ""}` +
          `${softSignalBlock ? softSignalBlock + "\n\n" : ""}` +
          `## The founder's own footprint (AUTHORITATIVE)\n${selfLine}\n\n` +
          `## Comparable-company evidence (AUTHORITATIVE — already finalised)\n` +
          `Every company listed here has traced public funding; the figures ` +
          `are committed amounts from our database. Use them EXACTLY as ` +
          `given, never introduce a private round, a funding figure or a ` +
          `funder not listed here. Never frame them as a race or a threat, ` +
          `only as proof that public capital actually flows into this space.\n` +
          `${evidence || "(no comparable companies gathered)"}\n\n` +
          `## The 5 institutions to target (AUTHORITATIVE — already finalised)\n` +
          `These are the ONLY institutions you may write about. institutionNotes ` +
          `must cover exactly these rows, one entry each, keyed by the exact ` +
          `"channel" field value shown after "key" below (note: two rows can ` +
          `share the same underlying fund family with different keys, they ` +
          `are still separate institutions and each needs its own note). ` +
          `Support type, ticket and comparable firms already render in the ` +
          `table, do not restate them, write only whyEligible and nextStep.\n` +
          `${institutionsEvidence || "(none)"}\n\n` +
          `## Relevant funding-process briefs (use to make nextStep concrete)\n` +
          `${processes || "(none)"}\n\n` +
          `## What's on the policy agenda right now (curated intelligence ` +
          `corpus — ground "positioning" in these lines, never invent a ` +
          `development)\n` +
          `${agendaEvidence || "(the intelligence corpus has nothing usable for this sector right now)"}\n\n` +
          `## Who is shaping that agenda (news-derived, most recent first — ` +
          `the ONLY basis for naming a person in "positioning")\n` +
          `Only name a specific person when the excerpt clearly shows them ` +
          `holding a relevant role or making a relevant decision; when the ` +
          `evidence is too thin to be sure, refer to the role or institution ` +
          `only (e.g. "the EIC Fund's leadership"), never guess a name.\n` +
          `${peopleEvidence || "(no person-level signal available right now, refer to institutions and roles only)"}\n\n` +
          `## Most recent developments (curated intelligence corpus, ` +
          `recency-sorted — the ONLY basis for "stateOfPlay")\n` +
          `${recentEvidence || "(the intelligence corpus has nothing recent for this sector, say so plainly)"}\n\n` +
          `Now write:\n` +
          `"bottomLine": 4 to 5 bullets, each AT MOST 25 words, plain ` +
          `sentences with no bullet marker in the text itself (the interface ` +
          `renders them as a list). First bullet: why this founder should ` +
          `care, opening from their own footprint above against the ` +
          `comparable evidence. Middle bullets: which of the 5 institutions ` +
          `below is the right first step and why. Final bullet: the concrete ` +
          `commercial payoff in plain terms, a grant amount, a guarantee ` +
          `that cuts cost of capital, an equity stake from a public investor, ` +
          `a tax credit, never vague "access to funding" language.\n` +
          // The verdict layer is code-computed and already rendered; the
          // writer must narrate it, never contradict or restate it.
          `EVERY institution below has been screened against its own encoded ` +
          `eligibility rules. Funds this company cannot access were already ` +
          `removed — so never write that they fail, or might not qualify, or ` +
          `should check whether they are eligible for a listed fund. Where a ` +
          `row carries "One thing in the way", treat that requirement as the ` +
          `single obstacle. Set "blockerPlain" to that rule restated in ONE ` +
          `plain sentence a founder reads once and understands: name the real ` +
          `threshold, drop the statute language. For every row that has no ` +
          `obstacle, "blockerPlain" MUST be an empty string. Make nextStep the ` +
          `action that clears the obstacle, or the best alternative route. Never ` +
          `write "you qualify" as a guarantee: the correct claim is that ` +
          `nothing in the documented rules rules them out.\n` +
          `The brief publishes UP TO FIVE institutions, and never fewer than ` +
          `two. You are shown more than five candidates so you can discard the ` +
          `genuinely unworkable ones and still leave a full table — prefer ` +
          `five, and only go below it when the remaining options really are ` +
          `not worth a founder's time.\n` +
          // Not a hard rule — but a table of five national schemes, or five
          // Brussels programmes, is a narrower answer than the corpus can
          // actually give. The two levels have different timelines, ticket
          // sizes and application burdens.
          `Where the candidates allow it, prefer a SPREAD across levels: some ` +
          `national or regional routes, some EU-level ones. This is a ` +
          `preference, not a rule — never keep a weak fund only to balance the ` +
          `mix, and never drop a strong one for it.\n` +
          `Return an entry for EVERY candidate below, ORDERED BEST FIRST — ` +
          `your ordering decides what gets published, because we take the top ` +
          `five of what you return. Ranking a fund last is how you say it is ` +
          `the weakest option; that costs the founder nothing.\n` +
          // worthPursuing was being used as a ranking device rather than a
          // qualification test: on eAgronom the writer rejected 7 of 9
          // candidates, among them the Horizon cluster for Food and
          // Bioeconomy that it had itself called a direct match for the
          // company's soil-carbon programme on the previous run. Ordering is
          // now how preference is expressed, and the flag is reserved for
          // disqualification, so a merely-weaker option can no longer be
          // deleted from the brief.
          `"worthPursuing": false is NOT a ranking device and NOT for weak or ` +
          `long-shot options — it DISQUALIFIES a row, deleting it from the ` +
          `brief entirely. Set it false only when you can name, in one ` +
          `specific sentence, why this fund is actively wrong for THIS ` +
          `company: wrong theme for what they build, wrong stage, wrong ticket ` +
          `size, a structure that conflicts with what they asked for, or an ` +
          `obstacle they genuinely cannot clear. If your reason would apply to ` +
          `most applicants rather than this one, it is not a reason — leave ` +
          `the row in and rank it last. Expect to disqualify NONE or ONE of ` +
          `the candidates; disqualifying most of them is always wrong. ` +
          `Disqualified rows are dropped, never shown, so NEVER write "skip ` +
          `this", "deprioritise" or "do not pursue" in whyEligible or ` +
          `nextStep — set the flag instead. ` +
          `Be decisive but not destructive: only the top few are published, so ` +
          `rejecting a merely-imperfect option can leave the founder with less ` +
          `than they deserve. Reject what is wrong, keep what is workable.\n` +
          // Observed on eAgronom: the writer rejected BOTH EIC routes, the
          // single best-fitting EU instrument for an Estonian agritech at
          // pilot stage, and shipped three rows out of seven candidates.
          // Competitiveness is the most common bad reason to reject — every
          // instrument worth naming is competitive, and a founder deciding
          // where to spend the next month already knows that.
          `A low acceptance rate, heavy paperwork or a long timeline are NOT ` +
          `reasons to reject: every worthwhile public instrument is ` +
          `competitive, and the founder is choosing where to spend effort, not ` +
          `being promised a win. Reject only for a concrete mismatch you can ` +
          `name in the data: wrong theme, wrong stage, wrong ticket size, a ` +
          `structure that conflicts with what they asked for, or an obstacle ` +
          `they genuinely cannot clear. If you cannot name that mismatch in ` +
          `one specific sentence, keep the row.\n` +
          `"institutionNotes": for EVERY candidate below, "whyEligible" ` +
          `(AT MOST 25 words) is a specific clause grounded in the ` +
          `eligibility screen and scoping profile above, never a generic ` +
          `claim, and must never assert an eligibility a NOT_MET row closes ` +
          `without naming the cure; "nextStep" (AT MOST 15 words) is one ` +
          `concrete action drawn from the process briefs above. Where a ` +
          `project answer above bears on that institution, whyEligible must ` +
          `use it, naming the requirement and how this company sits against ` +
          `it, rather than describing the fund generically.\n` +
          // brief_funnel_v2 Stage 4: the two grounding rules. Everything the
          // brief says is either the founder's own answer or a cited fund
          // requirement; nothing in between.
          `GROUNDING, applies to every field you write: any claim about THIS ` +
          `COMPANY'S project must trace to a project answer or their own ` +
          `description above; any claim about a FUND must trace to its ` +
          `requirement text or process brief above. If neither supports a ` +
          `sentence you want to write, cut the sentence.\n` +
          `"positioning": ONE paragraph, AT MOST 130 words, on how this ` +
          `company should frame itself to fit the current political moment: ` +
          `name the real people or institutions actually setting the agenda ` +
          `(from the evidence above, never invented) and what specifically ` +
          `in their stated priorities this founder's work maps onto. ` +
          `Advisory register, never sycophantic, never inventing a meeting ` +
          `or a relationship that doesn't exist.\n` +
          `"stateOfPlay": ONE paragraph, AT MOST 130 words, the most ` +
          `relevant recent developments and anything upcoming (a fund ` +
          `opening, a programme redesign) worth watching, grounded only in ` +
          `the recency-sorted evidence above. Do not add a sales pitch or a ` +
          `sign-off, a closing line is appended separately.\n` +
          `"caveats": ONE sentence noting figures are committed amounts from ` +
          `public registers, coverage varies by country, and absence from ` +
          `the database is not proof of no funding.`,
      },
    ],
  }, { timeout: WRITER_TIMEOUT_MS, maxRetries: 0 });

  const textOf = (m: Anthropic.Message) => m.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const timed = async (thinking: "adaptive" | "disabled") => {
    const budget = thinking === "adaptive" ? WRITER_TIMEOUT_MS : WRITER_RETRY_TIMEOUT_MS;
    const t0 = Date.now();
    const stream = writerCall(thinking);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const m = await Promise.race([
        stream.finalMessage(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            stream.abort();
            reject(new Error(`writer exceeded ${budget}ms`));
          }, budget);
        }),
      ]);
      console.log("[writer] thinking=%s %ss stop=%s out=%d chars",
        thinking, Math.round((Date.now() - t0) / 1000), m.stop_reason, textOf(m).length);
      return m;
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  let res: Anthropic.Message | null = null;
  try {
    res = await timed("adaptive");
  } catch (err) {
    // A blown deadline is not fatal on its own — the retry below runs without
    // thinking, which is both faster and unable to fail the same way.
    console.error("[writer] adaptive attempt failed:", String(err));
  }
  let text = res ? textOf(res) : "";
  // Adaptive thinking can spend almost the whole budget reasoning, leaving too
  // little for the answer. bunq -- a licensed neobank, so a case with genuinely
  // tangled sector-exclusion reasoning -- hit this twice: once emitting no text
  // at all, once emitting 1,273 characters of JSON that stopped mid-string.
  // Both are equally unusable, so the trigger is stop_reason, NOT whether any
  // text came back; an earlier version keyed on empty text and simply moved the
  // failure from "no text" to "unterminated string".
  //
  // Retrying once with thinking OFF puts the entire budget into output, which
  // cannot hit the same wall. A slightly less considered brief beats none, and
  // this costs a second call only in the rare case it fires.
  if (!res || res.stop_reason === "max_tokens") {
    console.error("writer produced nothing usable; retrying with thinking off",
      { candidates: rowKeys.length, chars: text.length, stop: res?.stop_reason ?? "timeout" });
    res = await timed("disabled");
    text = textOf(res);
  }
  if (!text.trim()) {
    throw new Error(`writer returned no text (stop_reason=${res.stop_reason})`);
  }
  // A truncated response throws deep inside JSON.parse with no context. Say
  // what actually happened, so the next occurrence is one log line to diagnose
  // rather than a mystery SyntaxError.
  if (res.stop_reason === "max_tokens") {
    console.error("writer hit max_tokens — output truncated, memo will fail to parse",
      { candidates: rowKeys.length, chars: text.length });
  }
  const narrative = extractJson<{
    bottomLine: string[];
    institutionNotes: { channel: string; whyEligible: string; nextStep: string;
                        blockerPlain?: string; worthPursuing?: boolean }[];
    positioning: string;
    stateOfPlay: string;
    caveats: string;
  }>(text);

  // Merge the model's per-row notes onto the code-built institution rows
  // (never the reverse — the model cannot add, drop or reorder a row),
  // keyed by rowKeys (positional, disambiguates same-channel rows — see
  // buildInstitutions), and strip em-dashes from every model-written field
  // (house rule).
  const notesByKey = new Map(narrative.institutionNotes.map((n) => [n.channel, n]));
  // The writer ranks by the order it returns the notes in; anything it did not
  // mention sorts last. The CUT to five happens in code, so the model can
  // express "this is the weakest" without being able to delete a usable row.
  const rankByKey = new Map(narrative.institutionNotes.map((n, i) => [n.channel, i]));
  const scored = institutions.map((row, i) => {
    const note = notesByKey.get(rowKeys[i]);
    return {
      // Absent note = DROP. This inverted when the writer started seeing more
      // candidates than ship: a row it never wrote about is one it did not
      // think worth writing about, and keeping it published the fallback
      // boilerplate instead. Nortal shipped three of five rows reading "Verify
      // eligibility directly with the fund", two of them thematic mismatches
      // (a health JU and a semiconductor JU for a govtech company) that
      // survived purely because the writer had ignored them.
      // The min-2 floor below still protects against an empty table.
      worth: Boolean(note) && note?.worthPursuing !== false,
      key: rowKeys[i],
      entry: {
        ...row,
        whyEligible: deDash(note?.whyEligible ?? "Verify eligibility directly with the fund."),
        nextStep: deDash(note?.nextStep ?? "Review the fund's current call and eligibility criteria."),
        // Prefer the plain restatement; fall back to the verbatim rule so the
        // obstacle is never silently dropped just because the writer omitted it.
        blocker: row.blocker ? deDash(note?.blockerPlain || row.blocker) : undefined,
      } as InstitutionEntry,
    };
  });
  // Always log the funnel: a brief that ships three rows from seven
  // candidates is not visible in the output itself, and this is the only
  // place the writer's rejections can be counted.
  const omitted = rowKeys.filter((k) => !notesByKey.has(k));
  const rejected = institutions
    .map((row, i) => ({ row, note: notesByKey.get(rowKeys[i]) }))
    .filter((x) => x.note?.worthPursuing === false)
    .map((x) => x.row.institution);
  console.log("[institutions] candidates=%d kept=%d rejected=%d omitted=%d%s%s",
    institutions.length, scored.filter((x) => x.worth).length, rejected.length, omitted.length,
    rejected.length ? " | rejected: " + rejected.join(", ") : "",
    omitted.length ? " | omitted: " + omitted.join(", ") : "");

  // Up to five, never fewer than two — except where two genuinely do not
  // exist. A tobacco or gambling business is excluded from most state aid by
  // law, and padding its brief back to five would mean inventing options it
  // cannot use. So the floor applies to the WRITER's judgement (it may not
  // reject its way down to one), not to the corpus: if screening only ever
  // produced one accessible fund, one is the honest answer.
  const worthwhile = scored
    .filter((x) => x.worth)
    .sort((a, b) => (rankByKey.get(a.key) ?? Infinity) - (rankByKey.get(b.key) ?? Infinity))
    .map((x) => x.entry);
  const finalInstitutions: InstitutionEntry[] = (
    worthwhile.length >= BRIEF_INSTITUTION_MIN ? worthwhile : scored.map((x) => x.entry)
  ).slice(0, BRIEF_INSTITUTION_CAP);
  if (worthwhile.length < BRIEF_INSTITUTION_MIN) {
    console.error("writer kept too few institutions; falling back to ranked order",
      { candidates: scored.length, kept: worthwhile.length });
  }

  return {
    self,
    eligibilityScreen,
    bottomLine: narrative.bottomLine.slice(0, 5).map((b) => deDash(b)),
    institutions: finalInstitutions,
    positioning: deDash(narrative.positioning),
    stateOfPlay: `${deDash(narrative.stateOfPlay)} ${STATE_OF_PLAY_PLUG}`.trim(),
    caveats: deDash(narrative.caveats),
  };
}

/**
 * Phase 3C: ONE grounded panel of up to 8 questions (not several small
 * rounds — the user's explicit call: the standard screen asks the fast,
 * universal questions, then a single tailored panel narrows the rest before
 * matching, not a drip of mini-screens). Unlike the old generateIntakeGroups
 * (retired — it invented questions from a soft "entropy rule" prompt
 * instruction with zero access to real gate data), this reads the ACTUAL
 * unresolved eligibility_gates for the founder's current candidate-instrument
 * shortlist (openFieldsForShortlist, computed by the caller) and asks the
 * model only to translate real, cited requirement text into founder-friendly
 * question phrasing — never to invent the answer options, which always come
 * from FIELD_ENUM_HINTS. Returns null when there's nothing worth asking.
 */
export async function generateGroundedRound(
  req: IntelligenceRequest,
  openFields: OpenFieldEvidence[],
): Promise<GroundedRound | null> {
  if (!openFields.length) return null;
  const top = openFields.slice(0, 8);
  const fieldNames = top.map((f) => f.field);

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      theme: { type: "string" },
      questions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            field: { type: "string", enum: fieldNames },
            question: { type: "string" },
          },
          required: ["field", "question"],
        },
      },
    },
    required: ["theme", "questions"],
  } as const;

  const evidence = top
    .map((f) => {
      const hint = FIELD_ENUM_HINTS[f.field];
      const examples = f.examples.map((e) => `  - ${e.instrument}: "${e.requirement}"`).join("\n");
      const optionsLine = hint ? `  Must resolve to one of: ${hint.options.map((o) => o.label).join(" / ")}` : "";
      return `Field "${f.field}" — still open on ${f.nInstruments} of the founder's candidate ` +
        `instruments (${f.reachPct}% of shortlist weight). Real requirement text:\n${examples}\n${optionsLine}`;
    })
    .join("\n\n");

  try {
    const res = await client.messages.create({
      model: INTAKE_MODEL,
      // Bumped from 700: up to 8 fields' worth of questions (was 3) needs
      // more room.
      max_tokens: 1600,
      thinking: { type: "disabled" },
      system: loadAgentInstructions(),
      output_config: { format: { type: "json_schema", schema } },
      messages: [
        {
          role: "user",
          content:
            `A founder is mid-qualification for European public capital. Below are ` +
            `REAL, DOCUMENTED requirements from the specific funds still on their ` +
            `shortlist that we cannot yet resolve. Write ONE themed screen (2-4 ` +
            `word theme) with EXACTLY ONE plain-English question per field below ` +
            `(never two questions tagged with the same field — if a field has ` +
            `several unrelated pieces of evidence, pick the single most decisive ` +
            `one and phrase ONE question from it) — phrase each question from ` +
            `the real requirement text given, never inventing a requirement the ` +
            `text doesn't support. Include every field below that has usable ` +
            `evidence; omit a field only if its evidence is too thin to phrase a ` +
            `fair question. Do not invent answer options — the interface renders ` +
            `the real fixed options itself.\n\n${evidence}\n\n` +
            `Return ONLY the JSON object for the schema.`,
        },
      ],
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const parsed = extractJson<{ theme: string; questions: { field: string; question: string }[] }>(text);
    const seen = new Set<string>();
    const questions = (parsed.questions ?? [])
      .filter((q) => q && fieldNames.includes(q.field) && q.question?.trim())
      // Never trust the model alone to keep one question per field (seen it
      // ask 3 differently-worded questions all tagged the same field, which
      // would render as duplicate checkbox groups with wrong-looking options)
      // — first occurrence per field wins, mechanically enforced.
      .filter((q) => (seen.has(q.field) ? false : (seen.add(q.field), true)))
      .map((q) => ({ field: q.field, question: deDash(q.question.trim()) }));
    if (!questions.length) return null;
    return { theme: deDash(String(parsed.theme ?? "").trim()) || "A few more things", questions };
  } catch (err) {
    console.error("grounded round generation failed:", err);
    return null;
  }
}

/**
 * brief_funnel_v2 Stage 2b: turn a fund's verbatim requirement text into a
 * question about the founder's actual project.
 *
 * This is the half of the panel that makes a memo specific. The model writes
 * the answer options here, which generateGroundedRound() above deliberately
 * never does — safe only because these answers land in ProjectAnswer and
 * computeVerdict() never reads them.
 */
/** Options that carry no information. The prompt bans these, this catches the
 *  ones that slip through — a "a mix of the above" answer tells the memo
 *  writer nothing, and costs the founder one of only ~5 questions. */
const TOKENS = (s: string) => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];

/**
 * A question's topic signature: every meaningful token in the question AND its
 * options, minus anything the founder already said.
 *
 * Stripping the founder's own words is what makes this work. Every project
 * question repeats the company's technology by design ("your insect protein
 * bioconversion..."), so raw text overlap is near-total between any two of
 * them. Remove that shared vocabulary and what remains is the actual topic —
 * "technology readiness level" versus "thematic area".
 *
 * Options alone were not enough: the same TRL question phrased once as bands
 * and once as a yes/no has two different answer spaces but is still the same
 * question, and a live round shipped both.
 */
function topicSignature(q: { question: string; options: string[] }, ownWords: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const t of [...TOKENS(q.question), ...q.options.flatMap(TOKENS)]) {
    if (t.length >= 4 && !ownWords.has(t)) out.add(t);
  }
  return out;
}

const VAGUE_OPTION =
  /^(other|none|not sure|unsure|n\/?a|a mix\b|mix of\b|some of\b|several\b|both\b|partly\b|all of\b|combination\b|it depends\b|other sector\b)/i;

export async function generateProjectQuestions(
  req: IntelligenceRequest,
  gates: ProjectGateEvidence[],
): Promise<ProjectQuestion[]> {
  if (!gates.length) return [];
  const byKey = new Map(gates.map((g) => [`${g.instrumentId}::${g.gateKey}`, g]));
  const keys = [...byKey.keys()];

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      questions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            key: { type: "string", enum: keys },
            question: { type: "string" },
            // No minItems/maxItems above 1: the structured-output API rejects
            // them ("For 'array' type, 'minItems' values other than 0 or 1 are
            // not supported"). The 3-5 range is enforced by the prompt and by
            // the post-processing below instead.
            options: { type: "array", items: { type: "string" } },
          },
          required: ["key", "question", "options"],
        },
      },
    },
    required: ["questions"],
  } as const;

  const evidence = [...byKey.entries()]
    .map(([key, g]) =>
      `key: ${key}\nfund: ${g.instrumentName}\nrequirement (verbatim): "${g.requirement}"`)
    .join("\n\n");

  const about = [
    req.company && `Company: ${req.company}`,
    req.description && `What they do: ${req.description}`,
    req.companyType && `Self-described type: ${req.companyType}`,
    req.country && `Incorporated in: ${req.country}`,
  ].filter(Boolean).join("\n");

  try {
    const res = await client.messages.create({
      model: INTAKE_MODEL,
      max_tokens: 2000,
      thinking: { type: "disabled" },
      system: loadAgentInstructions(),
      output_config: { format: { type: "json_schema", schema } },
      messages: [
        {
          role: "user",
          content:
            `${about}\n\nBelow are verbatim eligibility requirements from the specific funds ` +
            `still on this company's shortlist. For EACH key, write ONE plain-English ` +
            `question that establishes whether THIS company's project meets THAT ` +
            `requirement, plus 3-5 short, mutually exclusive answer options drawn from ` +
            `the requirement's own wording.\n\n` +
            `Rules:\n` +
            `- The founder must be able to answer from memory, without opening a document.\n` +
            `- Ask about their project, technology or plan, never about their legal form, ` +
            `headcount or country: those are already known.\n` +
            // Specificity rules. Without these the model produces generically
            // correct but useless options ("A mix of the above", "Other
            // sector") that tell the writer nothing about this company.
            `- Name the company's OWN technology or product in the question, in their ` +
            `words, so it reads as written for them and not for any applicant.\n` +
            `- Every option must be a substantive, checkable state of affairs. BANNED ` +
            `option styles: "a mix of the above", "other", "none", "several of these", ` +
            `"not sure", "partly" — and any option that merely restates the question.\n` +
            `- Options must be mutually exclusive and jointly cover the realistic ` +
            `cases, so exactly one is true for this company.\n` +
            `- Where the requirement names thresholds, bands or categories (TRL levels, ` +
            `percentages, activity types), make the options THOSE literal values rather ` +
            `than paraphrases of them.\n` +
            `- Never assert or imply a requirement the verbatim text does not support.\n` +
            `- Options must be concrete and distinguishable (for a TRL requirement, name ` +
            `the TRL bands; do not offer "yes / no / unsure").\n` +
            `- Do not add a "none of these" option: the interface appends its own.\n` +
            // Without this the model obeys "one question per key" over the
            // content rule above and asks things like "what is your legal
            // status?", which the first screen already settled.
            `- OMIT a key entirely if its requirement is only about legal form, ` +
            `applicant category, headcount or country. Returning four sharp ` +
            `questions is better than five with a wasted one.\n` +
            // Different funds phrase the same underlying requirement
            // differently, so the per-instrument cap upstream cannot catch it:
            // one live round asked TRL twice (two Horizon clusters) and
            // "will funds go to R&D costs" twice (two SATR tracks). The model
            // sees every key at once, so it is the right place to deduplicate.
            `- You are shown several funds at once. If two keys would produce ` +
            `the SAME question in substance (both asking technology readiness, ` +
            `both asking what the money pays for), keep only the one whose ` +
            `requirement is most specific and OMIT the other. A founder must ` +
            `never be asked the same thing twice in one screen.\n` +
            `- At most one question per key.\n\n${evidence}\n\n` +
            `Return ONLY the JSON object for the schema.`,
        },
      ],
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const parsed = extractJson<{ questions: { key: string; question: string; options: string[] }[] }>(text);
    const seen = new Set<string>();
    const questions: ProjectQuestion[] = (parsed.questions ?? [])
      .filter((q) => q?.key && byKey.has(q.key) && q.question?.trim() && Array.isArray(q.options))
      .filter((q) => (seen.has(q.key) ? false : (seen.add(q.key), true)))
      .map((q) => {
        const g = byKey.get(q.key)!;
        // Belt-and-braces on the specificity rules above: strip vague options
        // even if the model slips one through, so a founder is never asked to
        // choose "a mix of the above".
        const options = q.options
          .map((o) => deDash(String(o).trim()))
          .filter(Boolean)
          .filter((o) => !VAGUE_OPTION.test(o))
          .slice(0, 5);
        return {
          id: q.key,
          question: deDash(q.question.trim()),
          options,
          instrumentId: g.instrumentId,
          instrumentName: g.instrumentName,
          gateKey: g.gateKey,
          quote: g.requirement,
          locator: g.locator,
        };
      })
      .filter((q) => q.options.length >= 2);

    // Deterministic backstop on the dedupe instruction above. Asked to drop
    // near-duplicates the model removes some and misses others — a live round
    // still asked technology readiness twice, from two Horizon clusters.
    //
    // Two questions that ask the same thing share an ANSWER SPACE: both TRL
    // questions offer the same readiness bands. Comparing options rather than
    // wording is language-agnostic and needs no keyword list.
    const ownWords = new Set([
      ...TOKENS(req.description ?? ""), ...TOKENS(req.company ?? ""),
    ]);
    const kept: ProjectQuestion[] = [];
    for (const q of questions) {
      const sig = topicSignature(q, ownWords);
      const dup = kept.some((k) => {
        const other = topicSignature(k, ownWords);
        const shared = [...sig].filter((t) => other.has(t)).length;
        return shared / Math.max(Math.min(sig.size, other.size), 1) > 0.45;
      });
      if (!dup) kept.push(q);
    }
    return kept;
  } catch (err) {
    console.error("project question generation failed:", err);
    return [];
  }
}

const PROFILE_SIGNAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    techDepthRead: { type: "string", enum: COMPANY_TYPE_OPTIONS.map((o) => o.value) },
    note: { type: "string" },
  },
  required: ["techDepthRead", "note"],
} as const;

/**
 * Phase 4: a soft, additive read of the founder's own free-text description —
 * distinct from Phase 3C (which asks the founder MORE questions grounded in
 * real gate text). This reads what's already given and infers a signal a
 * checkbox can't capture, on the SAME 4-point scale as the founder's own
 * self-reported `companyType`, never a different or freer vocabulary. Fires
 * once per session, in parallel with the first grounded-round fetch — never
 * before or blocking computeVerdict(), which must stay instant and
 * zero-cost. Strictly softer than the weakest eligibility_gates tier
 * (inventory_inferred): not grounded in any legal text or curated brief, only
 * in the founder's own prose, and `applyProfileSignal()` is the only thing
 * allowed to act on it — never a hard verdict, never authoritative.
 */
export async function inferProfileSignal(req: IntelligenceRequest): Promise<ProfileSignal | null> {
  const desc = req.description?.trim();
  if (!desc || desc.length < 25) return null; // too thin to ground anything — no signal beats a fabricated one
  try {
    const res = await client.messages.create({
      model: WRITER_MODEL,
      max_tokens: 400,
      thinking: { type: "disabled" },
      system: loadAgentInstructions(),
      output_config: { format: { type: "json_schema", schema: PROFILE_SIGNAL_SCHEMA } },
      messages: [
        {
          role: "user",
          content:
            `A founder described their company in their own words. Read ONLY ` +
            `what is actually there — do not infer facts the text doesn't ` +
            `support. Classify how the description ITSELF reads on this scale ` +
            `(not what the founder later self-selected): ` +
            `${COMPANY_TYPE_OPTIONS.map((o) => o.value).join(" / ")}.\n\n` +
            `Description: "${desc}"\n\n` +
            `"note" must be one short sentence, in your own words, that a ` +
            `founder could immediately verify against their own description — ` +
            `quote or closely paraphrase specific language from it. Never ` +
            `assert anything about eligibility or funding fit; this is purely ` +
            `a read of how the writing itself comes across to a technical ` +
            `reviewer.\n\nReturn ONLY the JSON object for the schema.`,
        },
      ],
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const parsed = extractJson<{ techDepthRead: string; note: string }>(text);
    const validType = COMPANY_TYPE_OPTIONS.find((o) => o.value === parsed.techDepthRead)?.value;
    if (!validType || !parsed.note?.trim()) return null;
    return { techDepthRead: validType, note: deDash(parsed.note.trim()) };
  } catch (err) {
    console.error("profile signal inference failed:", err);
    return null;
  }
}

export interface VerdictResult {
  eligibilityScreen: EligibilityCheck[];
  instrumentTable: InstrumentRow[];
  selfMatched: boolean;
  /** Every real DB-native instrument id still plausibly in play (unsliced,
   *  wider than the 6-row display table) — grounds the adaptive round. */
  candidateInstrumentIds: string[];
}

/**
 * The fast path: a deterministic eligibility verdict with zero model calls,
 * so a founder sees it in well under a second instead of waiting through the
 * full memo's web research. Self-only/preliminary — DB match plus
 * same-sub-sector DB peers, no web-discovered comparables. runIntelligence()
 * later reruns buildInstrumentTable() with the richer web+DB peer evidence
 * the full memo gathers, but always with the same ticketBand/consortium
 * rules, so the fast verdict is only ever extended, never contradicted.
 */
export function computeVerdict(
  company: string,
  country: string | undefined,
  eligibility: EligibilityAnswers | undefined,
  opts: { targetMarkets?: string[]; capitalSought?: string[]; description?: string } = {},
): VerdictResult {
  const selfRecord = matchCompany(company, country);
  const targetSub =
    selfRecord.matched && !isGenericSubsector(selfRecord.subsector) ? selfRecord.subsector : "";
  const dbPeers = targetSub
    ? findPeersBySubsector(targetSub, { country, limit: 4, exclude: [company] })
    : [];
  const fieldChannels = new Set<string>([
    ...(selfRecord.matched ? selfRecord.channels : []),
    ...dbPeers.flatMap((r) => r.channels),
  ]);
  const founderCountries = founderCountryList(country, opts.targetMarkets, eligibility?.entityCountries);
  const candidates = buildInstrumentTable(
    fieldChannels,
    eligibility?.ticketBand,
    eligibility?.consortium !== "no",
    founderCountries,
    opts.capitalSought ?? [],
    opts.description,
  );
  return {
    eligibilityScreen: evaluateEligibility(
      eligibility,
      candidates.map((r) => r.instrumentId).filter((id): id is string => Boolean(id)),
    ),
    instrumentTable: candidates.slice(0, DISPLAY_CAP),
    selfMatched: selfRecord.matched,
    candidateInstrumentIds: candidates.map((r) => r.instrumentId).filter((id): id is string => Boolean(id)),
  };
}

/** Run the full pipeline, emitting progress events as each stage completes. */
export async function runIntelligence(req0: IntelligenceRequest, emit: Emit): Promise<void> {
  // The first screen stopped asking "company type" on 2026-07-26: it gated no
  // eligibility rule and inferProfileSignal already reads the same 4-point
  // scale off the founder's own description. So the model's read IS the
  // archetype now, and everything downstream (STEP topic selection, the
  // prompt's archetype line, depth-sensitive channel ordering) reads it
  // through this one resolution rather than an empty string.
  const req: IntelligenceRequest = req0.companyType
    ? req0
    : { ...req0, companyType: req0.profileSignal?.techDepthRead };
  const instructions = loadAgentInstructions();

  emit({ type: "status", step: "discovering", detail: "Searching the record and the open web for comparable companies" });
  const intel = await discoverAndResearch(req, instructions);

  emit({ type: "status", step: "querying_db", detail: `Found ${intel.length} candidates; matching against the funding record` });
  const records = intel.map((i) => matchCompany(i.name, i.country));
  const selfRecord = matchCompany(req.company, req.country);
  const self = buildSelf(selfRecord);

  // Database-native peers: target the founder's own sub-sector if we matched
  // them, else the most common sub-sector among the matched web peers. These are
  // guaranteed-funded companies in the same space, independent of web matching.
  // Only a *specific* sub-sector yields meaningful peers; catch-all buckets are
  // skipped (findPeersBySubsector returns none for them anyway, but we also avoid
  // selecting one as the target so a specific bucket among the web peers can win).
  let targetSub =
    selfRecord.matched && !isGenericSubsector(selfRecord.subsector) ? selfRecord.subsector : "";
  if (!targetSub) {
    const subs = records
      .filter((r) => r.matched && r.subsector && !isGenericSubsector(r.subsector))
      .map((r) => r.subsector);
    const freq = new Map<string, number>();
    for (const s of subs) freq.set(s, (freq.get(s) ?? 0) + 1);
    targetSub = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  }
  const exclude = [req.company, ...intel.map((i) => i.name)];
  const dbPeers = targetSub
    ? findPeersBySubsector(targetSub, { country: req.country, limit: 4, exclude })
    : [];

  // Semantic fund matching (instrument_profiles via pgvector). One Voyage query
  // embed plus one HNSW lookup, ~100ms against a pipeline that already runs for
  // ~100s. Resolves to an empty map on any failure, in which case
  // buildInstrumentTable silently falls back to the lexical index — the memo
  // must never fail because a vector query timed out.
  const semanticScores = await semanticFundMatch(req.description);

  // The capital on the table: every channel the founder or a peer has drawn on,
  // topped up to a useful shortlist. Built in code from curated fund snapshots.
  const fieldChannels = new Set<string>([
    ...(selfRecord.matched ? selfRecord.channels : []),
    ...records.flatMap((r) => (r.matched ? r.channels : [])),
    ...dbPeers.flatMap((r) => r.channels),
  ]);
  const instrumentTable = applyProfileSignal(
    buildInstrumentTable(
      fieldChannels,
      req.eligibility?.ticketBand,
      req.eligibility?.consortium !== "no",
      founderCountryList(req.country, req.targetMarkets, req.eligibility?.entityCountries),
      req.capitalSought ?? [],
      req.description,
      semanticScores,
    ).slice(0, VERDICT_POOL),
    req.profileSignal,
    req.companyType,
  );

  emit({ type: "status", step: "generating", detail: "Assembling evidence: institutions, comparables, current agenda" });
  const sectorTop =
    (selfRecord.matched && selfRecord.sectorTop) ||
    dbPeers.find((p) => p.sectorTop)?.sectorTop ||
    records.find((r) => r.matched && r.sectorTop)?.sectorTop ||
    "other";
  const body = await synthesize(
    req, records, intel, dbPeers, self, instrumentTable, instructions, sectorTop, emit);

  emit({
    type: "report",
    data: {
      company: req.company,
      generatedAt: new Date().toISOString(),
      ...body,
    },
  });
  emit({ type: "status", step: "done" });
}
