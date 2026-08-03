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
import { regionNameFor } from "./regions.generated";
import { hydrateGatesFor } from "./corpus";
import { isAttributable, isCited } from "./verdict";
import { loadDbInstruments, loadFundSnapshot, publishableInstruments, toIso2, type DbInstrument } from "./corpus";
import { themeRelevance, thematicChannelTopUp, RELEVANCE_FLOOR } from "./relevance";
import { TICKET_BANDS } from "./types";
import type { FounderFit, InstrumentRow, ProfileSignal } from "./types";
import type { ExclusionLog } from "./exclusions";
import { accessMode, passesCapitalPreference } from "./accessMode";
import { sectorFit } from "./fit";
import { NOT_AN_APPLYABLE_BODY } from "./briefChecks";

/** How many instruments each channel may contribute. Named because it is one
 *  link in the chain that decides how many rows a brief can hold at all
 *  (channels considered x leaves per channel -> pool -> published), and a bare
 *  `slice(0, 2)` mid-function hid it from that arithmetic. */
export const LEAVES_PER_CHANNEL = 2;
/** Ceiling when a channel's leaves are genuinely distinct funds rather than
 *  near-duplicates. Four, not seven: the table has six rows in total, and one
 *  channel taking more than four of them stops being a shortlist. */
export const MAX_LEAVES_PER_CHANNEL = 4;
/** How close to the channel's best a leaf must score to earn an extra slot. */
export const NEAR_TIE_RATIO = 0.9;
/** Share of the ranking score from thematic match; the rest is sector intake. */
export const THEME_WEIGHT = 0.6;

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

/** The Fit line from a channel's curated brief, "" if not yet declared. */
export function fitOf(channel: string): FounderFit | "" {
  return loadFundSnapshot(channel)?.fit ?? "";
}

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

// Scale routing (advisory_pipeline Stage D.1, first cut): which ticket bands
// each channel realistically serves, as [min,max] indices into TICKET_BANDS.
// A €20M+ ask must never get EIC Accelerator as its headline. Coarse by
// design — the terms engine (W1) replaces this with verified ticket gates.
export const CHANNEL_BANDS: Record<string, [number, number]> = {
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

/**
 * RETIRED as a filter. Ticket size is now a continuous component of the fit
 * score (scaleFit), measured against each instrument's own average award
 * rather than a hand-set band per channel.
 *
 * The old rule removed a whole channel when the founder's ask fell outside a
 * range someone typed once: a large ask deleted the startup-scaled routes
 * outright, a small one deleted the large-scale lane, and neither left a
 * trace. Its own comment described it as a stopgap pending real ticket gates.
 *
 * Always true now. Kept as a function so the call sites read honestly rather
 * than being deleted in a way that hides that this check ever existed.
 */
export function channelServesBand(_channel: string, _band?: string): boolean {
  return true;
}

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
  equity: ["equity", "blended"],
  tax_credit: ["tax_credit"],
};

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
  const allowed = new Set(capitalSought.flatMap((c) => CAPITAL_SOUGHT_TO_DB[c] ?? []));
  return allowed.size === 0 || allowed.has(instrumentCapitalType);
}

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
function distinguishRowNames(rows: InstrumentRow[]): void {
  const byName = new Map<string, InstrumentRow[]>();
  for (const r of rows) {
    const n = displayInstitutionName(r);
    byName.set(n, [...(byName.get(n) ?? []), r]);
  }
  for (const [name, peers] of byName) {
    if (peers.length < 2) continue;
    const ids = peers.map((p) => p.instrumentId ?? "");
    // The shared prefix is the agency; what follows identifies the programme.
    let prefix = ids[0] ?? "";
    for (const id of ids) {
      let i = 0;
      while (i < prefix.length && i < id.length && prefix[i] === id[i]) i++;
      prefix = prefix.slice(0, i);
    }
    for (const r of peers) {
      const token = r.schemeCode
        || (r.instrumentId ?? "").slice(prefix.length).replace(/^_+/, "").replace(/_/g, " ")
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
  log?: ExclusionLog;
}

export function selectLeafInstruments(input: LeafSelectionInput): DbInstrument[] {
  const { channel, founderCountries, capitalSought, ticketBand, description, semantic, founderSector, log } = input;
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
  const score = (i: DbInstrument) =>
    THEME_WEIGHT * rel(i) + (1 - THEME_WEIGHT) * sectorFit(i.sectorMix, founderSector);

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
    const ra = score(a), rb = score(b);
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
  // The cap is relevance-aware, because a "channel" is two different things.
  //
  // For national development banks it holds near-duplicates -- two Altum loans
  // that differ by measure code -- and keeping both wastes a row. For
  // horizon_eu_pillar_ii it holds SEVEN thematically distinct funds (CL1 health,
  // CL4 digital and industry, CL5 climate and energy, CL6 bioeconomy), and a
  // flat cap of two means five of them can never be considered at all.
  //
  // Measured by replaying 80 real recipients through the pipeline: the fund a
  // company ACTUALLY won was absent from the pool 25% of the time, and the
  // misses were dominated by Horizon clusters and Joint Undertakings -- funds
  // eliminated here before ranking ever saw them.
  //
  // So keep the extra leaf only when it is nearly as good a thematic match as
  // the best one in its channel. Near-duplicates score alike and gain nothing;
  // genuinely distinct programmes only survive when the founder's own
  // description actually points at them. The hard ceiling still stops one
  // channel flooding the table.
  const bestRel = sorted.length ? (relevance.get(sorted[0].id) ?? 0) : 0;
  const keep = sorted.filter((i, idx) =>
    idx < LEAVES_PER_CHANNEL ||
    (idx < MAX_LEAVES_PER_CHANNEL && bestRel > 0 &&
     (relevance.get(i.id) ?? 0) >= bestRel * NEAR_TIE_RATIO));
  for (const i of sorted.filter((x) => !keep.includes(x))) {
    log?.record("SEL-LEAF-CAP", i.id,
      `ranked below its channel's limit (${LEAVES_PER_CHANNEL} by default, up to ` +
      `${MAX_LEAVES_PER_CHANNEL} when a leaf is within ${Math.round((1 - NEAR_TIE_RATIO) * 100)}% ` +
      `of the channel's best thematic match)`);
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
    fieldChannels, ticketBand, consortiumOk, description, semantic, log,
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
  const codes = new Set([...fieldChannels].filter((c) => channelServesBand(c, ticketBand)));
  for (const c of fieldChannels) {
    if (!channelServesBand(c, ticketBand)) {
      log?.record("SEL-BAND", c, `ticket band ${ticketBand} outside the hardcoded range for this channel`);
    }
  }
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
    if (!channelServesBand(c, ticketBand)) {
      log?.record("SEL-BAND", c, `ticket band ${ticketBand} outside the hardcoded range for this channel`);
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
    if (!channelServesBand(hit.channel, ticketBand)) {
      log?.record("SEL-BAND", hit.channel,
        `thematic match ${hit.score.toFixed(2)} discarded: ticket band ${ticketBand} outside the hardcoded range`);
      continue;
    }

    thematicFirst.push(hit.channel);
    codes.add(hit.channel);
  }
  // Thematic matches lead the list. Callers slice to DISPLAY_CAP (6) before the
  // memo ever sees the table, and a top-up appended last was being truncated
  // away — so the channel was correctly identified and then silently dropped.
  const ordered = [...thematicFirst, ...[...codes].filter((c) => !thematicFirst.includes(c))];
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
        founderSector: input.founderSector, log,
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
export function materialiseInstrumentTable(
  selections: RowSelection[],
  input: InstrumentTableInput,
): InstrumentRow[] {
  const { consortiumOk, log } = input;
  return selections
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
        judgementCriteria: judgementCriteria(leaf),
        structuringNotes: structuringNotes(leaf),
      } as InstrumentRow;
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
      // Names are disambiguated first, so this only drops rows that genuinely
      // cannot be told apart rather than rows that merely share a body.
      if (i === 0) distinguishRowNames(all);
      const name = displayInstitutionName(row);
      const peers = all.filter((o) => displayInstitutionName(o) === name);
      if (peers.length === 1) return true;
      const encodedCount = (r: InstrumentRow) => {
        const inst = r.instrumentId ? instById().get(r.instrumentId) : undefined;
        return inst ? inst.gates.filter(
          (g) => g.valueSpec && (!g.gateRole || g.gateRole === "filter")).length : 0;
      };
      const best = peers.reduce((a, b) => (encodedCount(b) > encodedCount(a) ? b : a));
      const keep = all.indexOf(best) === i;
      if (!keep) {
        log?.record("SEL-DUPE-NAME", row.instrumentId ?? row.channel,
          `another instrument renders under the same institution name with more encoded rules`);
      }
      return keep;
    });
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
