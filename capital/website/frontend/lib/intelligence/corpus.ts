// Server-side corpus access for the intelligence agent: loads the company index
// and the fund-process briefs from disk, caches them across warm invocations,
// and fuzzy-matches competitor names against the corpus.
import { readFileSync } from "fs";
import { meetsDataFloor } from "./accessMode";
import {
  isClosed, today, unconfirmedOpen,
  type LivenessObservation,
} from "./liveness";
import { hasOfferRoute } from "./offerRoute";
import path from "path";
import type { CompetitorRecord, FundSnapshot } from "./types";
// Re-exported so existing callers (shortlist, pipeline, scripts) are unchanged.
import { toIso2 } from "./countryCodes";
export { toIso2 };

// Index row layout (positional, written by website/build/companies_index.py):
//   0 name, 1 normalized-name(s), 2 country, 3 sector, 4 totalEur,
//   5 per-channel EUR [[channel, eur], ...] (desc), 6 firstYear, 7 lastYear,
//   8 sector_top, 9 subsector (two-tier taxonomy; drive DB-native peer discovery),
//   10 entity_type (keep research orgs / public bodies out of peer lists)
type IndexRow = [
  string, string, string, string, number, [string, number][], number, number,
  string, string, string,
];

interface IndexFile {
  generatedAt: string;
  companies: number;
  rows: IndexRow[];
}

// Legal-form / connective tokens that should not drive a name match on their own.
const STOP_TOKENS = new Set([
  "gmbh", "ag", "ug", "sa", "sas", "sarl", "srl", "spa", "ltd", "limited",
  "plc", "llc", "inc", "corp", "co", "company", "bv", "nv", "oy", "ab", "as",
  "aps", "se", "the", "and", "of", "group", "holding", "holdings",
  "international", "technologies", "technology", "labs", "systems", "solutions",
]);

let indexCache: IndexFile | null = null;
const fundCache = new Map<string, string>();
let instructionsCache: string | null = null;

function normalize(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function loadIndex(): IndexFile {
  if (!indexCache) {
    const file = path.join(process.cwd(), "public", "data", "companies_index.json");
    indexCache = JSON.parse(readFileSync(file, "utf8")) as IndexFile;
  }
  return indexCache;
}

/** Read one fund-process brief by channel code, or "" if none exists. */
export function loadFundProcess(channel: string): string {
  if (!fundCache.has(channel)) {
    try {
      const file = path.join(process.cwd(), "fund-processes", `${channel}.md`);
      fundCache.set(channel, readFileSync(file, "utf8"));
    } catch {
      fundCache.set(channel, "");
    }
  }
  return fundCache.get(channel) ?? "";
}

const snapshotCache = new Map<string, FundSnapshot | null>();

/**
 * Parse the `## At a glance` block of a fund brief into structured trade-off
 * fields. This is the only source for the instrument-comparison table: the
 * figures are curated in the brief, never written by the model, so the table
 * cannot be fabricated. Returns null when a brief has no snapshot block.
 */
export function loadFundSnapshot(channel: string): FundSnapshot | null {
  if (!snapshotCache.has(channel)) {
    snapshotCache.set(channel, parseSnapshot(loadFundProcess(channel)));
  }
  return snapshotCache.get(channel) ?? null;
}

function parseSnapshot(md: string): FundSnapshot | null {
  const idx = md.indexOf("## At a glance");
  if (idx === -1) return null;
  // Read only to the next heading so a later section can't leak in.
  const next = md.indexOf("\n## ", idx + 1);
  const block = md.slice(idx, next === -1 ? undefined : next);
  const field = (key: string): string => {
    const m = block.match(new RegExp(`^- ${key}:\\s*(.+)$`, "m"));
    return m ? m[1].trim() : "";
  };
  const ticket = field("Ticket");
  if (!ticket) return null;
  const fitRaw = field("Fit");
  const fit: FundSnapshot["fit"] = fitRaw.startsWith("Startup-ready")
    ? "startup_ready"
    : fitRaw.startsWith("Consortium/institutional")
      ? "consortium_institutional"
      : fitRaw.startsWith("Large-scale industrial")
        ? "large_scale_industrial"
        : "";
  return {
    ticket,
    speed: field("Speed"),
    giveUp: field("You give up"),
    bestFor: field("Best for"),
    // The channel's own official page, curated beside the other At-a-glance
    // facts. Used only when an instrument has nothing more specific: a
    // programme's front door beats no link, and is never presented as the
    // scheme's own application form.
    applyUrl: /^https?:\/\//.test(field("Apply")) ? field("Apply") : "",
    fit,
  };
}

// ── DB-native instrument inventory (funding_instruments/eligibility_gates,
// exported by website/build/eligibility_export.py) ─────────────────────────
/** Levels we may assert as fact. Shared by both hydration phases so they
 *  cannot disagree about which gates are quotable. */
const ASSERTABLE_LEVELS = new Set(["llm_2pass", "human_verified"]);

export interface DbGate {
  id: string;
  gateFamily?: string;
  /** Curated by ETL/terms/encode_gates.py: filter | obligation |
   *  programme_fact | vague. Only 'filter' may decide a verdict — the other
   *  roles are real information but say nothing about who qualifies. Absent
   *  on gates not yet triaged. */
  gateRole?: string;
  /** The intake field whose answer actually decides this gate. Prefer this
   *  over `intakeField`, which is extractor-owned and was measured wrong on
   *  roughly half to two-thirds of a sample. */
  intakeFieldResolved?: string;
  requirement: string;
  value: string;
  valueSpec?: unknown | null;
  intakeField: string;
  quote: string;
  source: { file: string; locator: string };
  verificationLevel?: string;
  verified: boolean;
  /** Set only on gates merged down from a parent, so a consumer can prefer an
   *  instrument's OWN evidence. Absent means the gate belongs to the
   *  instrument itself. */
  inherited?: boolean;
}

export interface DbInstrument {
  id: string;
  parentId: string | null;
  name: string;
  country: string;
  capitalType: string;
  isFramework: boolean;
  eventCount: number;
  companyCount: number;
  totalEur: number;
  sourceFamilyBucket: string | null;
  /** WRITE-ONLY. Loaded and `JSON.parse`d for every instrument on every corpus
   *  load, and read by nothing in the frontend — not the ranker, not the memo,
   *  not the brief. Kept, with this label on it, for two reasons.
   *
   *  Its exclusion from ranking is DELIBERATE and measured, not an oversight:
   *  see the note in relevance.ts. In this corpus the titles are mostly
   *  national regulation boilerplate rather than project descriptions, so
   *  indexing them adds vocabulary that matches everything.
   *
   *  And it is load-bearing in the OTHER direction: it was the field the old
   *  leak guard checked, against SQLite, while retrieval scored against
   *  `instrument_profiles.profile_text` in Postgres — which is how 46% of
   *  holdout project rows leaked their answer into their own query undetected.
   *  Anything that starts reading this for matching must re-open that question
   *  first (`scripts/check_recall_leaks.ts`).
   *
   *  Do not "wire it up" because it looks unused. Either give it a consumer
   *  deliberately, with that measurement redone, or drop it from the SELECT. */
  sampleProjectTitles: string[] | null;
  /** Real per-fund granting authority (majority vote across events' raw
   *  granting_authority field), e.g. "Bundesamt für Wirtschaft und
   *  Ausfuhrkontrolle" — null when no dominant authority is on record.
   *  Prefer this over `name` for display when `name` is a generic
   *  auto-prettified bucket label (see pipeline.ts's displayInstitutionName). */
  administeringBody: string | null;
  /** Fraction of this instrument's awards actually made by administeringBody.
   *  It is a PLURALITY vote, and for the SATR country rollups it can be very
   *  thin (satr_de_rnd's top body covers 15.3% of 419 authorities), so the
   *  name is only safe to display above a threshold — see
   *  displayInstitutionName. Null for instruments with no authority data. */
  administeringBodyShare: number | null;
  /** Last year this instrument is recorded as having awarded anything. Null
   *  when we have no dated award at all — which is itself a staleness signal,
   *  not a clean slate. See STALE_AFTER_YEARS in pipeline.ts. */
  lastYear: number | null;
  /** The notified aid scheme this instrument sits under (e.g. "SA.111723").
   *  Present on the per-authority children of a state-aid rollup: it is the
   *  legal identity of the money and what makes a row traceable back to a
   *  primary document. */
  schemeCode?: string | null;
  /** A declared end date for this instrument. What it MEANS depends on
   *  `schemeEndBasis`, and that is not a detail: read without it, a routinely
   *  renewed State-aid notification looks identical to a call that has shut.
   *  Never compare it to today directly — use `isClosed()` in ./liveness. */
  schemeEndDate?: string | null;
  /** Which register supplied `schemeEndDate`, hence whether its expiry closes
   *  anything: "notified_duration" (renewable) or "call_deadline" (final). */
  schemeEndBasis?: string | null;
  /** Does the register that publishes this row state an application window for
   *  it? Recorded at ETL time from the SOURCE, never from whether a value
   *  reached us — which is what lets it survive on a copy that has fallen
   *  behind. Never read it directly: `unconfirmedOpen()` in ./liveness is the
   *  only consumer, and the three values are `SOURCE_WINDOW_POLICY` there. */
  sourceWindowPolicy?: string | null;
  /** Whether an application route is known to EXIST for this row — a separate
   *  question from whether the window has shut. "none" means the source says
   *  there is no way in (aid fixed to a named beneficiary list, or a row whose
   *  identity is a register artefact); "unrecorded" means we have not sourced
   *  the route, which is a gap in our collection and NOT grounds to withhold.
   *  Never test it directly — use `hasOfferRoute()` in ./offerRoute. */
  routeStatus?: string | null;
  /** The official source establishing `routeStatus = "none"`. Required for that
   *  value and only that value: a row is not removed from the offer by
   *  assertion. `check_offer_route.ts` fails on an unsourced withholding. */
  routeStatusSource?: string | null;
  /** A linked scheme that is still running, where the closed one was prolonged
   *  under a new SA number rather than simply ending. */
  successorScheme?: string | null;
  successorTitle?: string | null;
  /** Where a founder actually applies. Deliberately NOT the source URL on the
   *  underlying events: those point at the EU competition-case register, which
   *  records that a scheme exists and says nothing about how to approach it. A
   *  register link published as an application link is worse than none. */
  applicationUrl?: string | null;
  /** How a founder applies, curated from the scheme's own document and
   *  inherited from the parent regime when a child has none of its own. The
   *  one thing on a published row that is an instruction rather than a fact. */
  application?: { channel: string | null; timeline: string | null; url: string | null } | null;
  /** Funded-company sector counts, e.g. {health_life_sciences: 812, ...}.
   *  What this instrument has ACTUALLY funded, as opposed to what its prose
   *  sounds like. */
  sectorMix?: Record<string, number> | null;
  /** Bodies that actually disburse under this instrument's scheme, by volume.
   *  A department notifies a regime; agencies run it. */
  schemeOperators?: string[] | null;
  /** What this instrument typically AWARDS — p25/p50/p75 of its own real
   *  awards, with the n behind them. Distinct from totalEur, which is the size
   *  of the SCHEME: IPCEI Hy2infra has a median award of EUR 127.5M and OKTE
   *  EUR 275, and before this they were indistinguishable rows. Null below
   *  five priced awards, where a "typical" award is one or two events wearing
   *  a statistic's clothing. */
  awardP25?: number | null;
  awardP50?: number | null;
  awardP75?: number | null;
  awardN?: number;
  /** Median share of project cost this instrument actually covered, over
   *  single-beneficiary awards. Null where the ratio is not meaningful —
   *  consortium programmes pay one partner against the whole project's cost,
   *  which measures their share of the work, not the funder's rate. */
  intensityP50?: number | null;
  intensityN?: number;
  /** The NUTS region this instrument's own awards actually went to, and the
   *  share of them that did. Null for a body that delivers nationally, which
   *  is a different statement from "unknown" and must not be read as one.
   *
   *  Why it exists: 119 publishable leaves share a scheme NAME with a sibling,
   *  at mean cosine 0.947 between their profiles, because they are ONE notified
   *  regime (SA.111723 alone is fourteen of them) delivered by many granting
   *  bodies. No text can separate them — the text is legitimately identical.
   *  The applicant's region can, and it is the one thing a founder can answer
   *  without looking anything up.
   *
   *  Measured from the transparency register's per-award beneficiary region,
   *  so it is a PROGRAMME FACT: it says where money has gone, never who is
   *  barred. The legal restriction, where one exists, is the `region_within`
   *  filter gate the Commission's own registration produces. */
  deliveryRegion?: string | null;
  deliveryRegionShare?: number | null;
  gates: DbGate[];
}

let dbInstrumentsCache: DbInstrument[] | null | undefined;

/** WHICH corpus this process is actually ranking on.
 *
 *  ── Why a request cannot be allowed to hide this ──────────────────────────
 *  `hydrateDbInstruments()` degrades to the committed snapshot on any Postgres
 *  failure and continues, which is right for a founder mid-request and wrong
 *  for anything that produces a NUMBER. Until this existed there was no way to
 *  ask, after the fact, which corpus a run had used, and the difference is not
 *  cosmetic: measured on the pinned 150-pair tune sample on 2026-08-06, the
 *  Postgres corpus reads pool 72% and the snapshot reads 95%, because the
 *  snapshot predates 86 loaded application deadlines and carries no
 *  `schemeEndBasis` at all. Two harnesses spent a night reporting the two
 *  numbers as if they measured the same system.
 *
 *  So the fallback stays — and becomes observable. `requireLiveCorpus()` is
 *  what turns "observable" into "cannot be measured through". */
export interface CorpusProvenance {
  /** "postgres" | "snapshot" | "none" — where the rows in the cache came from. */
  source: "postgres" | "snapshot" | "none";
  /** True when DATABASE_URL was set and Postgres was still not the source: the
   *  run asked for live data, did not get it, and was not told. */
  degraded: boolean;
  instruments: number;
  hydratedAt: string;
  /** WHEN the store's answer was taken, as opposed to when we read it. For
   *  Postgres the two are the same instant; for the snapshot it is the
   *  artifact's `generatedAt`, which is the only thing that distinguishes a
   *  copy made minutes ago from one made a day before 86 deadlines landed.
   *  Empty when the artifact carries no stamp — itself a reason not to trust
   *  an inference drawn from it. */
  observedAt: string;
  /** The Postgres error, when there was one. */
  error?: string;
}

let provenance: CorpusProvenance = {
  source: "none", degraded: false, instruments: 0, hydratedAt: "", observedAt: "",
};

/** What corpus the current process hydrated, and whether it is the one it asked
 *  for. Safe to call before hydration (reports "none"). */
export function corpusProvenance(): CorpusProvenance {
  return { ...provenance };
}

/**
 * Refuse to produce a number on a corpus the run did not ask for.
 *
 * THE RULE: a harness that grades whatever it happens to get is the same defect
 * as a harness that grades a different system on purpose. If DATABASE_URL is
 * set, the run wanted live data; getting the snapshot instead must end the run,
 * not decorate its header.
 *
 * Deliberately NOT called from the request path — a founder mid-brief is better
 * served by a slightly stale table than by an error, and that trade is the whole
 * reason the fallback exists. It is called by every harness that prints a
 * figure. Running with no DATABASE_URL at all is still allowed and still
 * honest: the run then knows it is on the snapshot and says so.
 */
export function requireLiveCorpus(context = "this run"): void {
  const p = corpusProvenance();
  if (p.source === "none") {
    throw new Error(
      `${context}: corpus not hydrated. Call hydrateDbInstruments() before measuring.`);
  }
  if (!p.degraded) return;
  throw new Error(
    `${context}: DATABASE_URL is set but the corpus came from the committed ` +
    `snapshot (public/data/instrument_terms.json), not Postgres.\n` +
    `  Postgres said: ${p.error ?? "(no error recorded)"}\n` +
    `  The two corpora do NOT agree about which funds are open — on 2026-08-06 ` +
    `they differed by 20 points of pool recall — so a figure taken here would ` +
    `not be a figure about the shipping system.\n` +
    `  Fix the connection, or run deliberately without DATABASE_URL and say so.`);
}

/** When the loaded snapshot was cut, from its own `generatedAt`. "" if the
 *  artifact is unstamped or was never read. */
let snapshotGeneratedAt = "";

/**
 * Which committed snapshot the fallback reads. The shipped one, unless a
 * harness names another.
 *
 * HARNESS ONLY, and it announces itself on stderr every time it is used, so it
 * can never be the quiet reason a number is wrong.
 *
 * It exists because the degradation policy's entire claim is about a copy that
 * has fallen BEHIND the register, and until this there was no way to run the
 * product against one. The committed snapshot is republished on every corpus
 * change, so testing against it only ever asks "does the policy hold when the
 * two stores already agree" — which is the case that cannot fail. The cases
 * that can are built by `scripts/probe_stale_snapshot.ts`, which strips the
 * copy back to the states the incident actually passed through.
 */
function snapshotPath(): string {
  const override = process.env.SNAPSHOT_FILE;
  if (override) {
    console.error(`corpus: reading the fallback snapshot from ${override} ` +
      `(SNAPSHOT_FILE), NOT the committed one. Any number from this process is ` +
      `about that file.`);
    return override;
  }
  return path.join(process.cwd(), "public", "data", "instrument_terms.json");
}

function loadDbInstrumentsFromJson(): DbInstrument[] | null {
  try {
    const file = snapshotPath();
    const parsed = JSON.parse(readFileSync(file, "utf8")) as {
      generatedAt?: string; records: DbInstrument[];
    };
    snapshotGeneratedAt = parsed.generatedAt ?? "";
    return parsed.records;
  } catch {
    return null;
  }
}

/** Postgres-first hydration of the module-level cache, called once at the
 *  top of each API route before any pipeline logic runs (see route.ts,
 *  verdict/route.ts, intake/route.ts) — NOT on every loadDbInstruments()
 *  call, so the rest of the codebase (eligibility.ts, pipeline.ts,
 *  gateReach.ts) keeps reading the cache synchronously, unchanged.
 *
 *  Tries DATABASE_URL with a short statement_timeout; on any failure
 *  (unset, unreachable, slow) falls back to the JSON export in the SAME
 *  call, never a second round-trip later — matches the fast, code-only
 *  guarantee of /api/intelligence/verdict, which must not become slow just
 *  because Railway had a blip. A Railway outage degrades to "last-published
 *  snapshot," never a broken request. No-ops if already hydrated this
 *  invocation (dbInstrumentsCache !== undefined). */
export async function hydrateDbInstruments(): Promise<void> {
  if (dbInstrumentsCache !== undefined) return;
  const url = process.env.DATABASE_URL;
  if (!url) {
    dbInstrumentsCache = resolveInheritedGates(loadDbInstrumentsFromJson() ?? []);
    provenance = {
      source: "snapshot", degraded: false,
      instruments: dbInstrumentsCache.length, hydratedAt: new Date().toISOString(),
      observedAt: snapshotGeneratedAt,
    };
    return;
  }
  try {
    const { Client } = await import("pg");
    // statement_timeout can't be set at connection time here: neither the
    // plain Client() constructor key (sent as a raw wire-protocol startup
    // parameter, rejected outright) nor libpq's `options: "-c ..."` syntax
    // (also rejected — Railway's Postgres proxy doesn't forward startup
    // options at all) work through Railway's connection path. A plain `SET`
    // query immediately after connect() is the one approach that's just a
    // normal runtime command, not part of the connection handshake, so nothing
    // in the proxy path has grounds to reject it.
    const client = new Client({ connectionString: url, connectionTimeoutMillis: 2000 });
    await client.connect();
    await client.query("SET statement_timeout = 2000");
    try {
      const [instRes, gateRes, appRes] = await Promise.all([
        client.query(
          `SELECT id, parent_id, name, country, capital_type, is_framework,
                  event_count, company_count, total_eur, source_family_bucket,
                  sample_project_titles, administering_body,
                  administering_body_share, last_year,
                  scheme_code, scheme_end_date, scheme_end_date_basis,
                  source_window_policy,
                  route_status, route_status_source,
                  successor_scheme, successor_title,
                  application_url, sector_mix, scheme_operators,
                  award_p25, award_p50, award_p75, award_n,
                  intensity_p50, intensity_n, delivery_region, delivery_region_share
           FROM funding_instruments
           -- Ordered for the same reason the gates are: selection breaks ties
           -- on array order, so two stores returning the same instruments in a
           -- different order publish different rows. COLLATE "C" to match the
           -- export's byte-order sort rather than a locale's.
           ORDER BY id COLLATE "C"`,
        ),
        // PHASE ONE: everything needed to RANK and to reach a verdict, and
        // nothing else. `quote` and `source_*` are 39% of the gate payload and
        // are read only for the handful of instruments that reach the brief —
        // gateReach's adaptive questions and the eligibility screen's
        // citations, both scoped to the shortlist. Loading them for all 327
        // instruments on every request paid for 320 instruments nobody will
        // see. Phase two is hydrateGatesFor() below.
        client.query(
          // ORDER BY is load-bearing, not tidiness. judgementCriteria and
          // structuringNotes publish the FIRST THREE gates they match, and
          // cite() takes the first match; with no ordering the row a founder
          // reads depends on whatever order the store happened to return,
          // which differs between Postgres and the SQLite-derived JSON.
          // FRAMEWORK GATES ONLY. Everything else arrives in phase two, for
          // the handful of instruments that reach a brief.
          //
          // Framework records are the exception because they are the one thing
          // lazy hydration can never reach: eligibility.ts's cite() reads
          // gates on eu_sme_definition, eu_de_minimis and four siblings, and
          // publishableInstruments() excludes them, so they never appear in a
          // shortlist and would never be fetched. 56 gates, 46 KB, and without
          // them every framework citation silently loses its source and drops
          // to "verify:".
          // WITH quote and source: these records are never in a shortlist, so
          // phase two would never fetch their citation, and cite() would render
          // every framework check sourceless.
          `SELECT g.instrument_id, g.gate_key, g.gate_family, g.requirement,
                  g.value, g.value_spec, g.intake_field, g.gate_role,
                  g.intake_field_resolved, g.verification_level,
                  g.quote, g.source_file, g.source_locator
             FROM eligibility_gates g
             JOIN funding_instruments i ON i.id = g.instrument_id
            WHERE i.is_framework
            ORDER BY g.instrument_id, g.gate_key COLLATE "C"`,
        ),
        // Curated application routes. Its own table because
        // funding_instruments is truncated on every publish; joining here
        // keeps the Postgres path carrying the same fields as the JSON
        // fallback, which is the only way the two can be trusted to rank
        // identically.
        client.query(
          `SELECT instrument_id, channel, timeline, url FROM instrument_application`),
      ]);
      const gatesByInstrument = new Map<string, DbGate[]>();
      for (const g of gateRes.rows) {
        const list = gatesByInstrument.get(g.instrument_id) ?? [];
        list.push({
          id: g.gate_key,
          gateFamily: g.gate_family ?? undefined,
          gateRole: g.gate_role ?? undefined,
          intakeFieldResolved: g.intake_field_resolved ?? undefined,
          requirement: g.requirement,
          value: g.value ?? "",
          valueSpec: g.value_spec ? JSON.parse(g.value_spec) : null,
          intakeField: g.intake_field ?? "none",
          // Framework records carry theirs from phase one (they are never in a
          // shortlist, so nothing would fetch it later); everything else gets
          // it with its gates in phase two.
          quote: g.quote ?? "",
          source: { file: g.source_file ?? "", locator: g.source_locator ?? "" },
          verificationLevel: g.verification_level ?? undefined,
          verified: ASSERTABLE_LEVELS.has(g.verification_level),
        });
        gatesByInstrument.set(g.instrument_id, list);
      }
      const appByInstrument = new Map<string, { channel: string | null; timeline: string | null; url: string | null }>(
        (appRes.rows as { instrument_id: string; channel: string | null; timeline: string | null; url: string | null }[])
          .map((r) => [r.instrument_id, { channel: r.channel, timeline: r.timeline, url: r.url }]));
      dbInstrumentsCache = resolveInheritedGates(instRes.rows.map((inst): DbInstrument => ({
        id: inst.id,
        parentId: inst.parent_id,
        name: inst.name,
        country: inst.country ?? "EU",
        capitalType: inst.capital_type,
        isFramework: Boolean(inst.is_framework),
        eventCount: inst.event_count,
        companyCount: inst.company_count,
        totalEur: Number(inst.total_eur),
        sourceFamilyBucket: inst.source_family_bucket,
        sampleProjectTitles: inst.sample_project_titles ? JSON.parse(inst.sample_project_titles) : null,
        administeringBody: inst.administering_body ?? null,
        administeringBodyShare: inst.administering_body_share ?? null,
        lastYear: inst.last_year ?? null,
        schemeCode: inst.scheme_code ?? null,
        schemeEndDate: inst.scheme_end_date ?? null,
        schemeEndBasis: inst.scheme_end_date_basis ?? null,
        sourceWindowPolicy: inst.source_window_policy ?? null,
        routeStatus: inst.route_status ?? null,
        routeStatusSource: inst.route_status_source ?? null,
        successorScheme: inst.successor_scheme ?? null,
        successorTitle: inst.successor_title ?? null,
        schemeOperators: (() => {
          const raw = inst.scheme_operators;
          if (!raw) return null;
          try { return typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return null; }
        })(),
        applicationUrl: inst.application_url ?? null,
        // Stored as JSON text in both stores. Parsed here rather than at every
        // read site so the shape is identical on the Postgres and JSON paths;
        // the two diverging silently is how a scored component ends up neutral
        // in production and correct on a laptop.
        // Inherited from the parent regime, same rule as the JSON export.
        application: appByInstrument.get(inst.id) ?? (inst.parent_id ? appByInstrument.get(inst.parent_id) : undefined) ?? null,
        sectorMix: (() => {
          const raw = inst.sector_mix;
          if (!raw) return null;
          try { return typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return null; }
        })(),
        awardP25: inst.award_p25 ?? null,
        awardP50: inst.award_p50 ?? null,
        awardP75: inst.award_p75 ?? null,
        awardN: inst.award_n ?? 0,
        intensityP50: inst.intensity_p50 ?? null,
        intensityN: inst.intensity_n ?? 0,
        deliveryRegion: inst.delivery_region ?? null,
        deliveryRegionShare: inst.delivery_region_share ?? null,
        gates: gatesByInstrument.get(inst.id) ?? [],
      })));
      provenance = {
        source: "postgres", degraded: false,
        instruments: dbInstrumentsCache.length, hydratedAt: new Date().toISOString(),
        // The register answered just now; the observation IS the read.
        observedAt: new Date().toISOString(),
      };
    } finally {
      await client.end();
    }
  } catch (err) {
    console.error("Postgres hydration failed, falling back to instrument_terms.json:", err);
    dbInstrumentsCache = resolveInheritedGates(loadDbInstrumentsFromJson() ?? []);
    // DEGRADED, and recorded as such. The request still succeeds — that is the
    // point of the fallback — but anything that turns this corpus into a
    // published figure can now be made to stop. See requireLiveCorpus().
    provenance = {
      source: "snapshot", degraded: true,
      instruments: dbInstrumentsCache.length, hydratedAt: new Date().toISOString(),
      observedAt: snapshotGeneratedAt,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Instruments whose OWN gate rows have been fetched. A parent is fetched to
 *  serve a child and lands here without ever being "resolved". */
const gatesFetched = new Set<string>();
/** Instruments whose parent's gates have been merged in. Separate from
 *  gatesFetched so a second shortlist containing a sibling cannot merge a
 *  parent's rules into the same child twice — which would duplicate gates and
 *  inflate the encodedCount that decides the name-dedupe. */
const gatesResolved = new Set<string>();

/** The gates each instrument held after PHASE ONE, kept so a harness can put
 *  the module back the way a fresh request finds it. See resetGateHydration. */
let phaseOneGates: Map<string, DbGate[]> | undefined;

/** Return the module to its post-phase-one state: the state EVERY production
 *  request starts from.
 *
 *  ── The defect this exists for ────────────────────────────────────────────
 *  Phase two mutates the cached instruments in place, and the cache is
 *  module-level. In production that is exactly right and costs nothing: each
 *  request is a fresh invocation, `dbInstrumentsCache` is undefined, and the
 *  hydration comment above says so.
 *
 *  A harness is not a request. `measure_recall.ts` replays hundreds of pairs in
 *  ONE process, so instrument N+1 is ranked against a corpus that has been
 *  accumulating real gate rows for N pairs — and an instrument that has its
 *  gates can be screened OUT, where one still holding the phase-one empty list
 *  assesses as `unknown` and survives. Recall therefore DECAYS along the run.
 *  Measured on the tune split, same 300 pairs, same seed, same corpus:
 *
 *      replayed first          exact5 26%   regime5 91%
 *      replayed after 300 others   9%           70%
 *
 *  Seventeen points, from position in the run alone. That made every figure
 *  N-dependent in a way no sampler fix could reach: N=300 read 24/89 and N=600
 *  read 17/80 on identical code, because the larger run spends more of itself
 *  in the degraded state. It is the same class of defect as the stride
 *  sampler — a number that is a property of how it was measured — and it is
 *  larger.
 *
 *  So a harness calls this between pairs and grades what a founder gets: a cold
 *  corpus, every time. Phase one is NOT undone, because production does not
 *  redo it per request either; only the lazy phase-two state is. */
export function resetGateHydration(): void {
  if (!dbInstrumentsCache) return;
  // First call captures the baseline. It must happen after phase one and
  // before any phase two, which is what "call it once before the loop" means.
  if (!phaseOneGates) {
    phaseOneGates = new Map(dbInstrumentsCache.map((i) => [i.id, i.gates]));
    return;
  }
  for (const inst of dbInstrumentsCache) {
    const base = phaseOneGates.get(inst.id);
    if (base) inst.gates = base;
  }
  gatesFetched.clear();
  gatesResolved.clear();
}

/**
 * PHASE TWO of hydration: fetch the full gate rows for a handful of
 * instruments and merge them into the cached corpus.
 *
 * Must be awaited before anything that reads gates — the verdict engine, the
 * adaptive round (gateReach.ts), the eligibility screen's citations, and the
 * per-row criteria in shortlist.ts. All of them run only over the shortlist,
 * which is why this can be deferred at all.
 *
 * ── The parent expansion is the whole point ───────────────────────────────
 * A child of a state-aid rollup is judged on its REGIME's rules, not on the
 * two of its own. Fetching only the ids asked for would give
 * satr_ie_rnd__sa_111046__enterprise_ireland its 2 gates instead of the
 * regime's 34, and would give the 146 children that hold no gates at all
 * nothing whatsoever. assessInstrument returns `unknown` when it can evaluate
 * nothing, so the failure is a fund that quietly stops being assessable — no
 * exception, no log, exactly the shape of the inheritance bug this codebase
 * already paid for once.
 *
 * Mutates the cached objects in place rather than returning copies: instById(),
 * dbInstrumentsByBucket() and the built rows all hold references to them, so a
 * copy would hydrate a snapshot nobody reads.
 *
 * Never throws: on failure gates stay as they were, which degrades a verdict to
 * `unknown` rather than failing a brief outright. A no-op on the JSON path,
 * which ships every gate already.
 */
export async function hydrateGatesFor(instrumentIds: string[]): Promise<void> {
  if (!dbInstrumentsCache) return;
  const url = process.env.DATABASE_URL;
  if (!url) return; // JSON fallback shipped the gates already

  const byId = new Map(dbInstrumentsCache.map((i) => [i.id, i]));
  const requested = instrumentIds.filter((id) => id && byId.has(id));
  // Every requested id, plus the regime each one inherits from.
  const wanted = new Set<string>();
  for (const id of requested) {
    wanted.add(id);
    const parent = byId.get(id)?.parentId;
    if (parent && byId.has(parent)) wanted.add(parent);
  }
  const toFetch = [...wanted].filter((id) => !gatesFetched.has(id));
  const toResolve = requested.filter((id) => !gatesResolved.has(id));
  if (!toFetch.length && !toResolve.length) return;

  try {
    if (toFetch.length) {
      const { Client } = await import("pg");
      const client = new Client({ connectionString: url, connectionTimeoutMillis: 2000 });
      await client.connect();
      try {
        await client.query("SET statement_timeout = 2000");
        const res = await client.query(
          `SELECT instrument_id, gate_key, gate_family, requirement, value,
                  value_spec, intake_field, gate_role, intake_field_resolved,
                  verification_level, quote, source_file, source_locator
             FROM eligibility_gates WHERE instrument_id = ANY($1::text[])
             -- COLLATE "C" is byte order, matching Python's sort in the export.
             -- Locale collation puts "framework_..." before "G1-...", so the
             -- two stores disagreed about which three criteria a row publishes.
             ORDER BY instrument_id, gate_key COLLATE "C"`,
          [toFetch],
        );
        const own = new Map<string, DbGate[]>();
        for (const r of res.rows) {
          const list = own.get(r.instrument_id) ?? [];
          list.push({
            id: r.gate_key,
            gateFamily: r.gate_family ?? undefined,
            gateRole: r.gate_role ?? undefined,
            intakeFieldResolved: r.intake_field_resolved ?? undefined,
            requirement: r.requirement,
            value: r.value ?? "",
            valueSpec: r.value_spec ? JSON.parse(r.value_spec) : null,
            intakeField: r.intake_field ?? "none",
            quote: r.quote ?? "",
            source: { file: r.source_file ?? "", locator: r.source_locator ?? "" },
            verificationLevel: r.verification_level ?? undefined,
            verified: ASSERTABLE_LEVELS.has(r.verification_level),
          });
          own.set(r.instrument_id, list);
        }
        for (const id of toFetch) {
          const inst = byId.get(id);
          if (!inst) continue;
          inst.gates = own.get(id) ?? [];
          gatesFetched.add(id);
        }
      } finally {
        await client.end();
      }
    }

    for (const id of toResolve) {
      const inst = byId.get(id);
      if (!inst) continue;
      const parent = inst.parentId ? byId.get(inst.parentId) : undefined;
      inst.gates = mergeInheritedGates(inst.gates, parent?.gates);
      gatesResolved.add(id);
    }
  } catch (err) {
    const { recordEvent } = await import("./telemetry");
    recordEvent("hydration_degraded",
      "gate hydration failed; verdicts degrade to unknown rather than failing",
      { stage: "gates", error: err instanceof Error ? err.message : String(err) });
  }
}

/** The full 320+-row instrument inventory. Reads whatever hydrateDbInstruments()
 *  already populated (Postgres or the JSON fallback); if that was never
 *  called (a call site that predates this, or a code path that doesn't need
 *  live data badly enough to pay for hydration), falls back to a synchronous
 *  JSON read so this function's original "never throws, always returns an
 *  array" contract holds regardless. Cached once per warm invocation either
 *  way. eligibility.ts reads through this rather than parsing the file or
 *  querying Postgres a second time. */
export function loadDbInstruments(): DbInstrument[] {
  if (dbInstrumentsCache === undefined) {
    dbInstrumentsCache = resolveInheritedGates(loadDbInstrumentsFromJson() ?? []);
    // The THIRD way to end up on the snapshot without asking for it: never
    // calling hydrateDbInstruments() at all. Recorded like the other two, and
    // degraded whenever DATABASE_URL was available and simply not used — that
    // is a caller reading a day-old corpus while believing it is live.
    provenance = {
      source: "snapshot", degraded: Boolean(process.env.DATABASE_URL),
      instruments: dbInstrumentsCache.length, hydratedAt: new Date().toISOString(),
      observedAt: snapshotGeneratedAt,
      error: "hydrateDbInstruments() was never called; read straight from the snapshot",
    };
  }
  return dbInstrumentsCache ?? [];
}

/** A leaf/sub-track instrument (e.g. eic_pathfinder) has no curated "At a
 *  glance" prose of its own — it inherits its family's brief via
 *  sourceFamilyBucket, which always resolves to one of the 11
 *  fund-processes/*.md files. */
export function fundSnapshotFor(instrumentId: string): FundSnapshot | null {
  const inst = loadDbInstruments().find((r) => r.id === instrumentId);
  if (!inst?.sourceFamilyBucket) return null;
  return loadFundSnapshot(inst.sourceFamilyBucket);
}

/** The shared agent-instructions brief, injected into every stage. */
export interface DigestItem {
  title: string;
  source: string;
  tier: string;
  date: string | null;
  url: string;
  excerpt: string;
  similarity: number;
}

/** A recency-ordered stakeholder_appointment/programme_policy_change hit
 *  naming a real person, for the brief's positioning section. Plain SQL join
 *  (no similarity search) — see _people() in signals_digest.py. */
export interface PersonDigestItem {
  title: string;
  source: string;
  tier: string;
  date: string | null;
  url: string;
  person: string;
  signalType: string;
  excerpt: string;
}

/** A dated policy development attached to ONE fund, not to a topic. */
export interface InstrumentSignal {
  type: string;
  date: string;
  summary: string;
  impact: string | null;
  confidence: number;
  title: string;
  url: string;
}

interface SignalsDigest {
  generatedAt: string;
  topics: Record<string, DigestItem[]>;
  sectors: Record<string, DigestItem[]>;
  people: PersonDigestItem[];
  /** Keyed by instrument_id. The topic and sector slices say what is moving in
   *  a part of the landscape; this says what is moving about the fund on the
   *  founder's own table, which the digest could not express until
   *  article_instrument_links existed. Optional: an older digest has none. */
  instruments?: Record<string, InstrumentSignal[]>;
}

let digestCache: SignalsDigest | null | undefined;

/** The build-time export of the public-capital-intelligence corpus
 *  (website/build/signals_digest.py). null = not generated yet — the brief
 *  then simply omits the landscape grounding rather than failing. */
export function loadSignalsDigest(): SignalsDigest | null {
  if (digestCache === undefined) {
    try {
      const file = path.join(process.cwd(), "public", "data", "signals_digest.json");
      digestCache = JSON.parse(readFileSync(file, "utf8")) as SignalsDigest;
    } catch {
      digestCache = null;
    }
  }
  return digestCache;
}

/**
 * Instruments a founder could actually be shown.
 *
 * Excludes frameworks, and excludes any instrument that has been split into
 * children. A rollup with children is a container: it is the SUM of them, so
 * leaving it in the pool lets a parent and its own children compete as if they
 * were different money, and the parent wins on volume every time. The split
 * would then surface nothing while doubling the row count.
 *
 * Shared rather than reimplemented per call site, because the ranking path and
 * the shortlist path each need it and the two disagreeing would be invisible:
 * one would publish a container, the other its children, for the same founder.
 */
/**
 * Give every child its parent regime's gates, LAYERED under its own.
 *
 * A child of a state-aid rollup is a granting body operating under that
 * regime, so the regime's encoded rules are its rules. They are stored once
 * against the parent and resolved here rather than copied into each child by
 * the exporter: copying was the largest single cost in the per-request
 * payload, and duplicating an audited layer hundreds of times is how it
 * eventually drifts apart.
 *
 * ── Inherit-or-replace was the wrong shape ────────────────────────────────
 * This used to hand down the parent's gates only to children that had NONE of
 * their own. That reads as a reasonable default and is a trapdoor: a child
 * that gains a single rule silently loses its whole regime. The eligibility a
 * fund is judged on then depends on an accident of how much we happened to
 * encode against that specific body.
 *
 * It fired the moment one framework-level exclusion was seeded across the
 * state-aid channel. Every one of 453 split children went from inheriting its
 * regime — 1,302 encoded rules for the French R&D regime alone — to holding
 * exactly that one gate, and the whole channel became unassessable at once.
 *
 * A child's own gates now OVERRIDE the parent's by key and add to the rest,
 * which is what "operating under a regime" actually means: specific rules
 * refine the general ones, they do not repeal them.
 */
/** The merge rule itself, so the eager and lazy paths cannot diverge on it.
 *  A child's own gates override the parent's by key and add to the rest. */
export function mergeInheritedGates(own: DbGate[], inherited: DbGate[] | undefined): DbGate[] {
  if (!inherited?.length) return own;
  // Marked, not shared: the parent's gate objects are referenced by the parent
  // itself and by every other child, so the flag has to go on a copy. Callers
  // that read a handful of fields per gate pay a shallow clone for the ability
  // to tell "this scheme says so" from "its regime says so".
  const mark = (g: DbGate): DbGate => (g.inherited ? g : { ...g, inherited: true });
  if (!own.length) return inherited.map(mark);
  const keys = new Set(own.map((g) => g.id));
  return [...own, ...inherited.filter((g) => !keys.has(g.id)).map(mark)];
}

function resolveInheritedGates(all: DbInstrument[]): DbInstrument[] {
  const byId = new Map(all.map((i) => [i.id, i]));
  return all.map((i) => {
    const inherited = i.parentId ? byId.get(i.parentId)?.gates : undefined;
    if (!inherited?.length) return i;
    return { ...i, gates: mergeInheritedGates(i.gates, inherited) };
  });
}

/**
 * The corpus this process is judging liveness against, in the form the rule
 * wants. Exported so a harness can ask the same question the request path does.
 */
export function livenessObservation(): Pick<LivenessObservation, "source"> {
  return { source: provenance.source };
}

/*
 * `registerPopulation()` stood here and grouped rows by source family and
 * country, so `populationRecordsDeadlines()` could work out which registers
 * publish application windows by counting how many of their rows carried one.
 * Both are gone. The grouping was never the problem — the counting was: it
 * derived a property of the REGISTER from the contents of the COPY, so the
 * staler the copy the more registers it read as publishing nothing, which is
 * backwards. The fact now arrives on the row as `sourceWindowPolicy`, written
 * by ETL/terms/assign_source_window_policy.py from the sources themselves.
 *
 * Worth keeping the reason the key was that shape, because the next person to
 * need a population key will meet it again: not `parentId`, because 301
 * development-bank leaves have no parent and would land in one bucket with
 * everything else rootless.
 */

/** One row withheld because its openness could not be confirmed. */
export interface SuppressedRow {
  id: string;
  name: string;
  country: string;
  reason: string;
}

let suppressed: SuppressedRow[] = [];

/**
 * Ids `publishableInstruments()` must withhold whatever corpus it is reading.
 *
 * HARNESS ONLY — the `__` prefix is the same signal `__archetypes` and the
 * dump's `__corpus` key carry, and the sole caller is `scripts/dump_verdicts.ts`
 * under an env var no request path sets.
 *
 * It exists for one question, which `check_hydration_parity` cannot otherwise
 * ask. Subtracting the withheld rows from the live ranking AFTER the fact is
 * not what the fallback did: withholding a row frees a slot under the
 * per-channel leaf cap, so a fund at rank 7 is promoted into view, and that
 * fund was never in the live pool to be subtracted from. Comparing the two
 * that way reports a legitimate promotion as a parity failure, and the only
 * ways out are to delete the assertion or to give Postgres the same handicap.
 * This is the handicap: rank the live corpus with these rows out of
 * CONSIDERATION, and the fallback must then reproduce it exactly, promotions
 * included. That is a stronger claim than the subtraction it replaces, because
 * it asserts the backfill too.
 */
export function __forceSuppressedForParity(ids: readonly string[]): void {
  forcedSuppression = new Set(ids);
}
let forcedSuppression: ReadonlySet<string> = new Set();

/**
 * Rows the last `publishableInstruments()` call withheld under the degradation
 * policy, and why.
 *
 * Read by the request path so the founder can be told the count, and by
 * `scripts/check_degradation.ts` so the policy's cost is a measured number
 * rather than a claim. Empty on the Postgres path, always — that is the
 * intended steady state and it should be visible as zero rather than absent.
 */
export function suppressedForUnconfirmedLiveness(): readonly SuppressedRow[] {
  return suppressed;
}

/**
 * What the founder is told, when anything was withheld from THEIR table.
 *
 * The count is per request, not the corpus total: 73 of tonight's 80 withheld
 * rows are French, and telling a German founder that 80 funds are missing
 * would be both untrue and unreadable. `selectInstrumentRows` records the ones
 * that would have been in play for this founder and the count comes from that
 * log, so the sentence and the funnel can never disagree.
 *
 * Executive register: a fact and its consequence, no apology, no hedge. It is
 * NOT a "this list may be out of date" warning — the rows we cannot confirm
 * are gone from the table, and this says how many. Null when nothing was
 * withheld, which is the state the Postgres path is always in.
 */
export function withheldNotice(count: number): { count: number; note: string } | undefined {
  if (count <= 0) return undefined;
  // Says "a published copy" rather than "the register was down", because both
  // are true of the fallback and only one of them is true of a deliberate
  // offline run. The founder-facing claim has to hold in both.
  return {
    count,
    note: `${count === 1 ? "One fund is" : `${count} funds are`} not shown: ` +
      `this brief was built from a published copy of the fund register rather ` +
      `than the register itself, and ` +
      `${count === 1 ? "its application window" : "their application windows"} ` +
      `could not be confirmed against it. We withhold a fund we cannot confirm ` +
      `is open.`,
  };
}

export function publishableInstruments(): DbInstrument[] {
  const all = loadDbInstruments();
  const hasChildren = new Set(
    all.map((i) => i.parentId).filter((id): id is string => Boolean(id)));
  // ONE liveness test, imported. This used to be an inline
  // `schemeEndDate < today`, which read a SATR NOTIFICATION expiry as a scheme
  // closure and hid 306 leaves — `Fondo di garanzia per le PMI` among them.
  // See lib/intelligence/liveness.ts for the property and its evidence.
  const asOf = today();
  const closed = (i: DbInstrument) => isClosed(i, asOf);
  // Scheme codes an OPEN leaf already offers. A closed scheme whose successor is
  // one of these needs no redirect: the successor is already its own row, and
  // reviving the predecessor under the same code would just duplicate it.
  const liveCodes = new Set(all
    .filter((i) => !i.isFramework && !hasChildren.has(i.id) && !closed(i) && i.schemeCode)
    .map((i) => i.schemeCode as string));
  // ── The successor redirect ────────────────────────────────────────────────
  // `successor_scheme` / `successor_title` are populated by the register itself
  // and, until now, read by nothing at all: a designed data field with no
  // consumer, sitting on the largest single filter in the funnel.
  //
  // 40 closed instruments carry one. 29 of them name a successor we ALREADY
  // hold as an open leaf -- for those, dropping the predecessor is right and
  // nothing changes. The other 11 name a successor that is not in the corpus at
  // all: the register says the fund continues under a new SA number, we hold its
  // whole award history and its administering body, and the row is deleted, so
  // a founder is never shown a fund that is open today. Austria's aws ERP
  // Kredite, Bavaria's BayVFP Digitalisierung and BayTP+, Baden-Wurttemberg's
  // Start-up BW Pre-Seed are among them.
  //
  // Those 11 are republished under the SUCCESSOR's identity -- its scheme code
  // and its registered title -- because that is the registration a founder would
  // actually apply under, and presenting the expired number would be wrong in a
  // way a founder could act on. The award history stays attached to the row
  // because it is the same fund; only the legal identity moved.
  const redirect = (i: DbInstrument): DbInstrument =>
    (closed(i) && i.successorScheme && !liveCodes.has(i.successorScheme)
      ? { ...i,
          schemeCode: i.successorScheme,
          name: i.successorTitle?.trim() || i.name,
          // Cleared, not carried forward: the end date belonged to the
          // registration that expired. We do not know the successor's, and a
          // stale one here would delete the row again on the next run.
          schemeEndDate: null }
      : i);
  const withheld: SuppressedRow[] = [];
  const rows = all.filter((i) =>
    !i.isFramework && !hasChildren.has(i.id) &&
    // A row that is not an OFFER cannot be proposed, whatever its dates say.
    // This is a different question from closure and it is asked separately
    // because collapsing the two is how eleven IPCEI approval decisions came
    // to be reported as a closed fund rather than as not a fund. See
    // lib/intelligence/offerRoute.ts.
    hasOfferRoute(i) &&
    // A scheme the Commission's register says has closed to new applications
    // cannot be PROPOSED, however recently it paid. Measured: 220 of 453 state
    // aid children sit under a closed scheme and 130 still looked current,
    // because payments run for years past closure -- 'Italy - Support to
    // electricity from renewable sources' ended 2021-12-30 and shows 2024
    // awards. Sending a founder there costs them real time.
    //
    // They stay in the corpus deliberately: a closed scheme is still evidence
    // of what a country funded and who received it, which is what the peer
    // tracing reads. This filter governs what may be PROPOSED, nothing else.
    (!closed(i) || (Boolean(i.successorScheme) && !liveCodes.has(i.successorScheme as string))) &&
    // No amounts and no dates means every scale and liveness judgement about
    // it is a guess, and a guess scored at its midpoint was outranking funds
    // we had actually measured. See meetsDataFloor.
    meetsDataFloor(i))
    .map(redirect)
    // ── THE DEGRADATION POLICY ────────────────────────────────────────────
    // Everything above answers "what does this corpus say about this fund".
    // This answers "and can we confirm it", which is a different question the
    // moment the corpus is a copy rather than the register.
    //
    // A 2-second statement timeout on a loaded database drops a real founder's
    // request onto the committed snapshot. On 2026-08-06 that path showed 26%
    // of founders at least one fund whose application deadline had passed,
    // against 0% on Postgres, because 86 deadlines had been loaded since the
    // snapshot was cut and the snapshot still read `schemeEndDate: null` for
    // every one of them.
    //
    // So a row whose openness cannot be confirmed is WITHHELD. The founder
    // gets fewer funds, never a dead call: recall degrades on a blip,
    // correctness does not. It is a filter and not a warning label because a
    // caveat under a table does not stop anyone applying to the fund above it.
    //
    // Suppression is recorded, not silent — `suppressedForUnconfirmedLiveness`
    // is what lets the brief say how many are missing and lets
    // check_degradation.ts measure what the policy costs. On the Postgres path
    // `unconfirmedOpen` returns null for every row and this whole clause is a
    // no-op; the cost on today's corpus, through the snapshot, is in
    // project-mgmt/findings/degradation_policy_wsX.md.
    .filter((i) => {
      const why = forcedSuppression.has(i.id)
        // Only ever set by the parity harness, and never on a request path.
        ? "withheld by the parity harness, so the live corpus is ranked with " +
          "exactly the rows the fallback could not confirm out of consideration"
        // Nothing about the corpus in hand is passed in. The one fact this
        // needs beyond the row is where the row is being read FROM; the rest
        // travels on the row, because a fact computed here would be computed
        // from the copy under suspicion.
        : unconfirmedOpen(i, { source: provenance.source }, asOf);
      if (!why) return true;
      withheld.push({ id: i.id, name: i.name, country: i.country, reason: why });
      return false;
    });
  suppressed = withheld;
  return rows;
}

const bodyUrlCache = new Map<string, Map<string, string>>();

/**
 * Per-body application URLs from a channel brief's `## Bodies` table.
 *
 * Exists for channels that have no single portal — the national development
 * banks are twenty-four different national institutions, and pointing all of
 * them at one page would be wrong for twenty-three of them. Curated beside
 * the rest of that channel's brief so it is editable without touching code.
 */
export function loadBodyUrls(channel: string): Map<string, string> {
  const cached = bodyUrlCache.get(channel);
  if (cached) return cached;
  const out = new Map<string, string>();
  try {
    const md = loadFundProcess(channel);
    const idx = md.indexOf("## Bodies");
    if (idx !== -1) {
      const block = md.slice(idx, md.indexOf("\n## ", idx + 1) === -1
        ? undefined : md.indexOf("\n## ", idx + 1));
      for (const line of block.split("\n")) {
        const m = line.match(/^\|\s*(.+?)\s*\|\s*(https?:\/\/\S+?)\s*\|$/);
        if (m) {
          out.set(m[1].normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
            .toLowerCase().replace(/[^a-z0-9]/g, ""), m[2]);
        }
      }
    }
  } catch { /* no brief for this channel — no per-body table */ }
  bodyUrlCache.set(channel, out);
  return out;
}

export function loadAgentInstructions(): string {
  if (instructionsCache === null) {
    try {
      const file = path.join(process.cwd(), "fund-processes", "_agent_instructions.md");
      instructionsCache = readFileSync(file, "utf8");
    } catch {
      instructionsCache = "";
    }
  }
  return instructionsCache;
}

/**
 * Fuzzy-match one company name against the corpus. Returns a record either way:
 * `matched: false` with zeroed funding when the name is not found, so callers
 * can faithfully report "no public funding traced" rather than implying zero.
 *
 * An optional `countryHint` (web-researched, any spelling or ISO2) raises recall
 * safely: it lets a single distinctive token resolve to one entity in that
 * country instead of being rejected as ambiguous, and breaks ties between
 * equally-scored homonyms in different countries.
 */
export function matchCompany(name: string, countryHint?: string): CompetitorRecord {
  const q = normalize(name);
  const unmatched: CompetitorRecord = {
    name,
    country: "",
    sector: "",
    sectorTop: "",
    subsector: "",
    euCapitalEur: 0,
    channels: [],
    channelAmounts: [],
    firstYear: 0,
    lastYear: 0,
    matched: false,
  };
  if (!q) return unmatched;

  const iso = toIso2(countryHint);
  const qTokens = q.split(" ").filter((t) => t.length >= 3 && !STOP_TOKENS.has(t));
  const qSet = new Set(qTokens);
  const { rows } = loadIndex();

  // A lone short token ("GMV", "EOS") is an acronym: an exact name hit on it is
  // almost worthless without corroboration, because dozens of unrelated entities
  // share three letters across the corpus.
  const acronym = qSet.size === 1 && qTokens[0].length <= 3;

  let best: IndexRow | null = null;
  let bestScore = 0;
  for (const row of rows) {
    const rq = row[1];
    // Rows whose names are non-Latin normalize to an empty/tiny string and are
    // unmatchable by a Latin query — skip them outright.
    if (rq.length < 3) continue;
    const sameCountry = iso !== "" && row[2] === iso;
    const countryConflict = iso !== "" && row[2] !== "" && row[2] !== iso;
    let score = 0;
    if (rq === q) {
      score = 1;
    } else if (qSet.size) {
      // Token-boundary matching only — never raw substring. Substring matching
      // produced dangerous false positives ("Futura" -> "Futurasun",
      // "PyxiScience" -> "ENCE", "Alice" -> "Alice & Bob") which then attributed
      // an unrelated company's public funding. Bias hard towards precision: a
      // wrong match is worse than a miss, so prefer "no public funding traced".
      const rqTokens = rq
        .split(" ")
        .filter((t) => t.length >= 3 && !STOP_TOKENS.has(t));
      const rqSet = new Set(rqTokens);
      let overlap = 0;
      for (const t of qSet) if (rqSet.has(t)) overlap++;
      const extra = rqSet.size - overlap; // corpus tokens absent from the query
      if (overlap === qSet.size) {
        // Every query token is present as a whole token in the corpus name.
        if (qSet.size >= 2) {
          score = 0.9 - 0.05 * extra; // multi-token name: confident
        } else if (extra === 0) {
          score = 0.9; // single-token query, and the corpus name is just that token
        } else {
          // A lone token ("Vyoma") sitting inside a larger corpus name
          // ("Vyoma Space GmbH"). Trust it only when the web-researched country
          // pins it to this entity, or the token is very distinctive (long).
          const t = qTokens[0];
          if (sameCountry && t.length >= 5) score = 0.8 - 0.02 * extra;
          else if (t.length >= 8) score = 0.75 - 0.02 * extra;
        }
      } else if (qSet.size >= 2) {
        score = (overlap / qSet.size) * 0.5; // partial multi-token: stays sub-threshold
      }
    }
    // Country guards. A web-researched country that contradicts the corpus row
    // means we matched the wrong entity — kill a single-token match outright
    // (a multinational's multi-token name can legitimately sit in another
    // country, so only the ambiguous single-token case is killed). An acronym
    // is trusted only when the country actively confirms it.
    if (countryConflict && qSet.size === 1) score = 0;
    if (acronym && !sameCountry) score = 0;
    // Nudge a country-confirmed row above an equally-scored homonym elsewhere.
    if (score > 0 && sameCountry) score += 0.03;
    if (score > bestScore) {
      bestScore = score;
      best = row;
      if (score >= 1) break;
    }
  }

  if (!best || bestScore < 0.6) return unmatched;
  return {
    name: best[0],
    country: best[2],
    sector: best[3],
    sectorTop: best[8] ?? "",
    subsector: best[9] ?? "",
    euCapitalEur: best[4],
    channels: best[5].map(([c]) => c),
    channelAmounts: best[5].map(([channel, eur]) => ({ channel, eur })),
    firstYear: best[6],
    lastYear: best[7],
    matched: true,
  };
}

/**
 * Catch-all taxonomy buckets ("other", "software_general", "industrial_general",
 * etc.) hold tens of thousands of unrelated companies. The most-funded names in
 * them are giant state-aid recipients with no real relation to the founder, so
 * "peers" drawn from them destroy the memo's credibility (a €370M chip fab as a
 * space-startup peer). Treat these buckets as "no meaningful peers".
 */
export function isGenericSubsector(subsector: string): boolean {
  const s = subsector.trim().toLowerCase();
  return s === "" || s === "other" || s === "general" || s === "unclassified" ||
    s.endsWith("_general");
}

/**
 * Database-native peer discovery. Given a sub-sector (and optionally a country to
 * prefer), return the most-funded corpus companies in that bucket — guaranteed to
 * carry a real public-funding signal, unlike web-found names that may not match.
 * Excludes any names in `exclude` (the founder + web peers already gathered).
 * Returns none for catch-all buckets, where "peers" would be unrelated giants.
 */
export function findPeersBySubsector(
  subsector: string,
  opts: { country?: string; limit?: number; exclude?: string[] } = {},
): CompetitorRecord[] {
  if (!subsector || isGenericSubsector(subsector)) return [];
  const { rows } = loadIndex();
  const iso = toIso2(opts.country);
  const limit = opts.limit ?? 5;
  const skip = new Set((opts.exclude ?? []).map((n) => normalize(n)));

  // Universities / institutes are not peers. entity_type catches the labelled
  // ones; the name pattern catches unmerged sisters still typed "unknown"
  // (e.g. "NORCE RESEARCH" sitting next to the labelled "Norwegian Research
  // Centre" row — surfaced by the Cenotian test memo).
  const RESEARCH_NAME =
    /\b(RESEARCH|UNIVERSIT|INSTITUT|FRAUNHOFER|CNRS|LABORATOR|ACADEM|HOCHSCHULE|POLYTECH)\w*\b/i;
  const hits = rows.filter(
    (r) =>
      r[9] === subsector &&
      r[4] > 0 &&
      r[10] !== "research_org" &&
      !(r[10] !== "company" && RESEARCH_NAME.test(r[0])) &&
      !skip.has(normalize(r[0])),
  );
  // Prefer same-country peers, then rank by traced public capital (desc).
  hits.sort((a, b) => {
    if (iso) {
      const ac = a[2] === iso ? 1 : 0;
      const bc = b[2] === iso ? 1 : 0;
      if (ac !== bc) return bc - ac;
    }
    return b[4] - a[4];
  });
  return hits.slice(0, limit).map((r) => ({
    name: r[0],
    country: r[2],
    sector: r[3],
    sectorTop: r[8] ?? "",
    subsector: r[9] ?? "",
    euCapitalEur: r[4],
    channels: r[5].map(([c]) => c),
    channelAmounts: r[5].map(([channel, eur]) => ({ channel, eur })),
    firstYear: r[6],
    lastYear: r[7],
    matched: true,
  }));
}
