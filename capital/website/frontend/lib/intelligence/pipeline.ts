// The four-stage intelligence pipeline. Code-orchestrated (not a free-roaming
// agent) so progress is deterministic and cost is bounded:
//   1. discover  — Claude + web search → competitor names
//   2. query_db  — local fuzzy match against the corpus (no LLM)
//   3. research  — Claude + web search → product/positioning/financing per peer
//   4. generate  — Claude + structured output → the final report
import Anthropic from "@anthropic-ai/sdk";
import { fmtEur } from "@/lib/format";
import {
  findPeersBySubsector,
  isGenericSubsector,
  loadAgentInstructions,
  loadFundProcess,
  loadFundSnapshot,
  loadSignalsDigest,
  matchCompany,
  type DigestItem,
} from "./corpus";
import {
  BORROWER_MODELS,
  CAPITAL_OPTIONS,
  TICKET_BANDS,
  type ChannelAmount,
  type EligibilityAnswers,
  type IntakeGroup,
  type CompetitorIntel,
  type CompetitorRecord,
  type CompetitorRow,
  type InstrumentRow,
  type IntakeQuestion,
  type IntelligenceReport,
  type IntelligenceRequest,
  type ProgressEvent,
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
const DEFAULT_INSTRUMENTS = ["national_dev_banks", "state_aid_satr", "eic"];

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

/**
 * Build the instrument-comparison table: the capital actually on the table for
 * this founder, side by side. Channels a peer or the founder has drawn on lead
 * (flagged usedInField); the table is topped up to a useful shortlist from the
 * universal entry points. Every figure comes from the curated fund snapshot,
 * never the model. Returns at most six rows so the memo stays a memo.
 */
function buildInstrumentTable(
  fieldChannels: Set<string>,
  ticketBand?: string,
): InstrumentRow[] {
  const codes = new Set([...fieldChannels].filter((c) => channelServesBand(c, ticketBand)));
  const idx = ticketBand ? BAND_INDEX[ticketBand] : undefined;
  if (idx !== undefined && idx >= 3) {
    for (const c of LARGE_SCALE_TOPUP) codes.add(c);
  }
  for (const c of DEFAULT_INSTRUMENTS) {
    if (codes.size >= 4) break;
    if (channelServesBand(c, ticketBand)) codes.add(c);
  }
  return [...codes]
    .map((channel) => {
      const snap = loadFundSnapshot(channel);
      if (!snap) return null;
      return {
        channel,
        instrument: INSTRUMENT_NAME[channel] ?? channelLabel(channel),
        ticket: snap.ticket,
        speed: snap.speed,
        giveUp: snap.giveUp,
        bestFor: snap.bestFor,
        usedInField: fieldChannels.has(channel),
      } as InstrumentRow;
    })
    .filter((r): r is InstrumentRow => r !== null)
    .sort((a, b) => {
      // Proven-in-field first, then the curated priority order.
      if (a.usedInField !== b.usedInField) return a.usedInField ? -1 : 1;
      return INSTRUMENT_PRIORITY.indexOf(a.channel) - INSTRUMENT_PRIORITY.indexOf(b.channel);
    })
    .slice(0, 6);
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
  const intel = extractJson<CompetitorIntel[]>(text);
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
const REPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    // NOTE: the competitor table (name / euCapital / channels / stage /
    // positioning) is NOT generated by the model. euCapital and channels are
    // filled deterministically from the DB match, and stage/positioning from
    // web colour — see buildCompetitors() below. The model only writes the
    // narrative, so it can never put a private round or a fabricated channel
    // into the funding columns.
    overview: {
      type: "object",
      additionalProperties: false,
      properties: {
        headline: { type: "string" },
        bottomLine: { type: "string" },
        yourPosition: { type: "string" },
      },
      required: ["headline", "bottomLine", "yourPosition"],
    },
    landscape: {
      type: "object",
      additionalProperties: false,
      properties: {
        outlook: { type: "string" },
        watchItems: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              item: { type: "string" },
              why: { type: "string" },
              source: { type: "string" },
              timeframe: { type: ["string", "null"] },
            },
            required: ["item", "why", "source", "timeframe"],
          },
        },
      },
      required: ["outlook", "watchItems"],
    },
    funderMap: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          funder: { type: "string" },
          comparablesUsing: { type: "array", items: { type: "string" } },
          relevanceToYou: { type: "string" },
          tradeoff: { type: "string" },
          nextStep: { type: "string" },
          nextDeadline: { type: ["string", "null"] },
        },
        required: [
          "funder", "comparablesUsing", "relevanceToYou", "tradeoff", "nextStep", "nextDeadline",
        ],
      },
    },
    todos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          priority: { type: "integer", enum: [1, 2, 3] },
          action: { type: "string" },
          rationale: { type: "string" },
          timeframe: { type: "string" },
        },
        required: ["priority", "action", "rationale", "timeframe"],
      },
    },
    caveats: { type: "string" },
  },
  required: ["overview", "landscape", "funderMap", "todos", "caveats"],
} as const;

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

async function synthesize(
  req: IntelligenceRequest,
  records: CompetitorRecord[],
  intel: CompetitorIntel[],
  dbPeers: CompetitorRecord[],
  self: SelfRecord,
  instrumentTable: InstrumentRow[],
  instructions: string,
  sectorTop: string,
): Promise<Omit<IntelligenceReport, "company" | "generatedAt">> {
  const profileBlock = eligibilityContext(req.eligibility, req.targetMarkets);
  // Current-landscape grounding: build-time export of the intelligence corpus
  // (signals_digest.json). The digest captures the FULL A-Z topic universe on
  // every build (scale capital, InvestEU, grants, state aid, industrial policy,
  // defence, the future-budget files); tailoring to THIS founder happens here,
  // at the last moment — capital sought, sector, and the channels actually used
  // in the field pick which slices the writer sees. The writer may ONLY ground
  // the `landscape` section in these lines — no invention.
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
  const digestLine = (tag: string) => (it: DigestItem) =>
    `- [${tag}] ${it.title} (${it.source}${it.date ? `, ${it.date}` : ""}): ` +
    `${it.excerpt.slice(0, 320)}`;
  const landscapeEvidence = digest
    ? [
        ...[...topics].flatMap((t) =>
          (digest.topics[t] ?? []).slice(0, 2).map(digestLine(t))),
        ...(digest.sectors[sectorTop] ?? digest.sectors["other"] ?? [])
          .slice(0, 4)
          .map(digestLine("your sector")),
      ].join("\n")
    : "";
  // The competitor table is finalised HERE, in code — funding figures and
  // channels are taken straight from the DB match. The model never sees these as
  // editable; it only writes the narrative around them. Web-found direct
  // competitors first, then same-sub-sector funded peers from the database.
  const competitors = [...buildCompetitors(records, intel), ...buildDbPeers(dbPeers)];

  // The single authoritative evidence block the model writes from. Each line is
  // already correct (DB funding + web colour), so the model cannot fabricate.
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

  // The founder's own footprint, so the BLUF can open with where THEY stand.
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
  ]
    .filter(Boolean)
    .join("\n");

  // The instrument-comparison table, already finalised in code. The model reads
  // it so its prose and per-funder trade-offs stay consistent with the table; it
  // must not restate the table row by row or alter a figure in it.
  const instruments = instrumentTable
    .map(
      (r) =>
        `- ${r.instrument}${r.usedInField ? " [used by peers in your field]" : ""}: ` +
        `ticket ${r.ticket}; speed ${r.speed}; you give up ${r.giveUp}; ` +
        `best for ${r.bestFor}`,
    )
    .join("\n");

  const res = await client.messages.create({
    model: WRITER_MODEL,
    max_tokens: 16000,
    // Sonnet 5 rejects fixed thinking budgets (400); adaptive lets the model
    // size the prioritisation judgement itself.
    thinking: { type: "adaptive" },
    system: instructions,
    output_config: { format: { type: "json_schema", schema: REPORT_SCHEMA } },
    messages: [
      {
        role: "user",
        content:
          `Write the executive funding memo for the founder.\n\n${ctx}\n\n` +
          `${profileBlock ? profileBlock + "\n\n" : ""}` +
          `## The founder's own footprint (AUTHORITATIVE)\n${selfLine}\n\n` +
          `## Comparable-company evidence (AUTHORITATIVE — already finalised)\n` +
          `Every company listed here has traced public funding; the figures are ` +
          `committed amounts from our database. Use them EXACTLY as given — ` +
          `never introduce a private round, a funding figure or a funder not ` +
          `listed here. These are comparable entities, not necessarily direct ` +
          `competitors: the point is where, for what and through which vehicles ` +
          `they received public support, and what that implies for how the ` +
          `founder positions their own applications. Never frame them as a race ` +
          `or a threat.\n` +
          `${evidence || "(no comparable companies gathered)"}\n\n` +
          `## The capital on the table (AUTHORITATIVE — already finalised)\n` +
          `These are the instruments relevant to this founder, with curated ` +
          `ticket sizes, speed and trade-offs. They render as a table; do NOT ` +
          `restate them row by row and do NOT alter a figure. Use them so your ` +
          `prose, your per-funder trade-offs and your to-dos stay consistent ` +
          `with this table.\n${instruments || "(none)"}\n\n` +
          `## Relevant funding-process briefs (use to make to-dos concrete)\n` +
          `${processes || "(none)"}\n\n` +
          `## Current landscape (curated intelligence corpus — the ONLY basis ` +
          `for the "landscape" section)\n` +
          `Recent reporting and official announcements on public-funding ` +
          `programmes, drawn from our news corpus. Ground landscape.outlook ` +
          `and every watchItem EXCLUSIVELY in these lines; never invent a ` +
          `development, date or source. Prefer the most recent and the most ` +
          `decision-shaping items. Informational register: what is changing ` +
          `and what it means for this founder's raise — never urgency about ` +
          `other companies.\n` +
          `${landscapeEvidence || "(the intelligence corpus has nothing usable — write landscape.outlook as one sentence saying current-landscape coverage is thin for this sector, and return an empty watchItems array)"}\n\n` +
          `Write, per your instructions: the headline (subject line), the ` +
          `bottomLine (the single most important takeaway, up front), the ` +
          `"your position" paragraph that compares the founder's own footprint ` +
          `above against the comparables, and the funder map. For each funder in ` +
          `the map, "tradeoff" must name in one short clause what that capital ` +
          `actually costs the founder, fund-specifically and honestly (dilution, ` +
          `repayment, co-financing, member-state sponsorship, reporting load, ` +
          `lost flexibility, slow money) drawn from the table and briefs above. ` +
          `The funder map may ONLY contain instruments that appear in the ` +
          `capital-on-the-table table above; if an instrument was excluded ` +
          `there (wrong ticket range for the stated ask), it must not appear ` +
          `in the funder map either, however familiar it is. ` +
          `Respect the scoping profile strictly: never lead with instruments ` +
          `whose ticket range cannot serve the stated ask, and when the ` +
          `borrower model is lender/originator/fund manager, route the funder ` +
          `map to the intermediary architecture (portfolio counter-guarantees, ` +
          `accreditation as financial intermediary, securitisation support, ` +
          `partner-bank paths presented as grounded leads to investigate). ` +
          `Then the "landscape" section: outlook is at most 60 words tying the ` +
          `two or three most relevant developments above to this founder's ` +
          `raise; watchItems is 2 to 4 entries, each with item (the ` +
          `development, at most 14 words), why (what it changes for this ` +
          `founder, at most 25 words), source (the outlet or institution name ` +
          `from the evidence line), timeframe (like "H2 2026" or null). ` +
          `Then prioritised to-dos. In "caveats", note in one or two sentences ` +
          `that figures are committed amounts from public registers, coverage ` +
          `varies by country, and absence from the database is not proof of no ` +
          `funding.`,
      },
    ],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  if (!text.trim()) {
    // Adaptive thinking can consume the whole budget on heavy cases — surface
    // the stop reason instead of a bare "No JSON found".
    throw new Error(`writer returned no text (stop_reason=${res.stop_reason})`);
  }
  const narrative = extractJson<{
    overview: { headline: string; bottomLine: string; yourPosition: string };
    landscape: IntelligenceReport["landscape"];
    funderMap: IntelligenceReport["funderMap"];
    todos: IntelligenceReport["todos"];
    caveats: string;
  }>(text);

  // Merge the code-built tables (competitors + instruments) into the narrative,
  // and strip em-dashes from every model-written field (house rule).
  return {
    self,
    overview: {
      headline: deDash(narrative.overview.headline),
      bottomLine: deDash(narrative.overview.bottomLine),
      yourPosition: deDash(narrative.overview.yourPosition),
      competitors,
    },
    instrumentTable,
    landscape: {
      outlook: deDash(narrative.landscape?.outlook ?? ""),
      watchItems: (narrative.landscape?.watchItems ?? []).slice(0, 4).map((w) => ({
        item: deDash(w.item),
        why: deDash(w.why),
        source: deDash(w.source),
        timeframe: w.timeframe ? deDash(w.timeframe) : null,
      })),
    },
    funderMap: narrative.funderMap.map((s) => ({
      ...s,
      funder: deDash(s.funder),
      relevanceToYou: deDash(s.relevanceToYou),
      tradeoff: deDash(s.tradeoff),
      nextStep: deDash(s.nextStep),
    })),
    todos: narrative.todos.map((t) => ({
      ...t,
      action: deDash(t.action),
      rationale: deDash(t.rationale),
      timeframe: deDash(t.timeframe),
    })),
    caveats: deDash(narrative.caveats),
  };
}

// ── Phase 1: tailored intake questions, grouped into themed screens ──────────
const INTAKE_GROUPS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    groups: {
      type: "array",
      items: {
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
                question: { type: "string" },
                options: { type: "array", items: { type: "string" } },
              },
              required: ["question", "options"],
            },
          },
        },
        required: ["theme", "questions"],
      },
    },
  },
  required: ["groups"],
} as const;

/**
 * Generate up to four tailored multiple-choice questions whose answers most change
 * which public instruments fit and how to position for them. Adaptive: only asks
 * what is still unknown from the form. Returns [] on any failure so the memo can
 * still run without the extra signal.
 */
export async function generateIntakeGroups(
  req: IntelligenceRequest,
): Promise<IntakeGroup[]> {
  const known = [
    `Company: ${req.company}`,
    req.sector ? `Sector: ${req.sector}` : "",
    req.country ? `Country: ${req.country}` : "",
    req.companyType ? `Company type (their words): ${req.companyType}` : "",
    req.description ? `What they do: ${req.description}` : "",
    capitalSoughtLabel(req.capitalSought)
      ? `Capital sought: ${capitalSoughtLabel(req.capitalSought)}`
      : "",
    eligibilityContext(req.eligibility, req.targetMarkets).replace(
      "## Scoping profile (structured intake, AUTHORITATIVE)\n", ""),
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await client.messages.create({
      model: INTAKE_MODEL,
      max_tokens: 1500,
      thinking: { type: "disabled" },
      system: loadAgentInstructions(),
      output_config: { format: { type: "json_schema", schema: INTAKE_GROUPS_SCHEMA } },
      messages: [
        {
          role: "user",
          content:
            `A founder wants a qualification memo for European public capital. ` +
            `You may ask follow-up questions before it is written, grouped into ` +
            `THEMED SCREENS the founder clicks through. Return 1 to 3 groups, ` +
            `each with a short theme title (2-4 words) and 2 to 3 multiple-choice ` +
            `questions.\n\n` +
            `Follow the funnel: first pin down WHAT they build (product nature, ` +
            `technology readiness, what makes it fundable), then WHAT the money ` +
            `is for (project shape, timeline, cheque logic), then WHAT that kind ` +
            `of funding will require of them (consortium willingness, bank ` +
            `relationships, location of the funded activity, licenses if they ` +
            `finance others).\n\n` +
            `THE ENTROPY RULE: only ask a question if its answer could move at ` +
            `least one funding instrument between fitting and not fitting for ` +
            `this company. Never ask what is already answered below, never ask ` +
            `out of curiosity, and fewer questions is better than more.\n\n` +
            `Each question: plain English, one clause, 2 to 4 mutually exclusive ` +
            `options as short founder-friendly phrases (no jargon, no acronyms ` +
            `without expansion). Do not include a "not sure" option; the ` +
            `interface adds one.\n\n` +
            `What we already know:\n${known}\n\n` +
            `Return ONLY the JSON object for the schema.`,
        },
      ],
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const parsed = extractJson<{
      groups: { theme: string; questions: { question: string; options: string[] }[] }[];
    }>(text);
    let n = 0;
    return (parsed.groups ?? [])
      .slice(0, 3)
      .map((g) => ({
        theme: deDash(String(g.theme ?? "").trim()) || "A few more things",
        questions: (g.questions ?? [])
          .filter((q) => q && q.question?.trim() && Array.isArray(q.options) && q.options.length >= 2)
          .slice(0, 3)
          .map((q) => ({
            id: `q${n++}`,
            question: deDash(q.question.trim()),
            options: q.options.map((o) => deDash(String(o).trim())).filter(Boolean).slice(0, 4),
          })),
      }))
      .filter((g) => g.questions.length > 0);
  } catch (err) {
    console.error("intake question generation failed:", err);
    return [];
  }
}

/** Run the full pipeline, emitting progress events as each stage completes. */
export async function runIntelligence(req: IntelligenceRequest, emit: Emit): Promise<void> {
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

  // The capital on the table: every channel the founder or a peer has drawn on,
  // topped up to a useful shortlist. Built in code from curated fund snapshots.
  const fieldChannels = new Set<string>([
    ...(selfRecord.matched ? selfRecord.channels : []),
    ...records.flatMap((r) => (r.matched ? r.channels : [])),
    ...dbPeers.flatMap((r) => r.channels),
  ]);
  const instrumentTable = buildInstrumentTable(fieldChannels, req.eligibility?.ticketBand);

  emit({ type: "status", step: "generating", detail: "Assembling evidence: instruments, comparables, current landscape" });
  const sectorTop =
    (selfRecord.matched && selfRecord.sectorTop) ||
    dbPeers.find((p) => p.sectorTop)?.sectorTop ||
    records.find((r) => r.matched && r.sectorTop)?.sectorTop ||
    "other";
  const body = await synthesize(
    req, records, intel, dbPeers, self, instrumentTable, instructions, sectorTop);

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
