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
  matchCompany,
} from "./corpus";
import {
  CAPITAL_OPTIONS,
  type ChannelAmount,
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
// The two web-search stages use Sonnet 4.6. The final report is filled into a
// strict JSON schema of short fields, so Haiku 4.5 — given the rubric — writes it
// well at a fraction of the cost and latency. No runtime Opus call, so the
// pipeline lands well under Vercel's 300s function cap (Hobby).
const SEARCH_MODEL = "claude-sonnet-4-6";
// The intake stage just selects the few questions whose answers most change the
// routing, as structured output. Haiku is fast enough that the founder barely
// waits before the questions appear.
const INTAKE_MODEL = "claude-haiku-4-5";
// The memo is the product, so the writer earns a capable model. Sonnet 4.6 writes
// the executive prose; with only one writer call plus one search call the run
// still lands well under Vercel's 300s cap.
const WRITER_MODEL = "claude-sonnet-4-6";
const MAX_COMPETITORS = 5;

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

type Emit = (event: ProgressEvent) => void;

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

/**
 * Build the instrument-comparison table: the capital actually on the table for
 * this founder, side by side. Channels a peer or the founder has drawn on lead
 * (flagged usedInField); the table is topped up to a useful shortlist from the
 * universal entry points. Every figure comes from the curated fund snapshot,
 * never the model. Returns at most six rows so the memo stays a memo.
 */
function buildInstrumentTable(fieldChannels: Set<string>): InstrumentRow[] {
  const codes = new Set(fieldChannels);
  for (const c of DEFAULT_INSTRUMENTS) {
    if (codes.size >= 4) break;
    codes.add(c);
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
  return JSON.parse(raw.slice(start, end === -1 ? undefined : end)) as T;
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
    `Identify the ${MAX_COMPETITORS} most relevant European competitors or direct ` +
      `peers of this company, and for each give a short, current snapshot. Prefer ` +
      `companies operating in Europe, since the goal is to compare public-funding ` +
      `access. Use web search to ground your answer.\n\n${ctx}\n\n` +
      `Return ONLY a JSON array, most relevant first, one object per company:\n` +
      `[{"name": "...", "country": "...", "product": "...", "positioning": "...", ` +
      `"lastPrivateRound": "...", "notes": "..."}]\n` +
      `"country" is the country the company operates from (full English name, or ` +
      `"Unknown"); it helps us look up the right legal entity. Use legal or common ` +
      `company names. Keep each field to one or two sentences. If something is ` +
      `unknown, say "Unknown".`,
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
      lastPrivateRound: i.lastPrivateRound ?? "Unknown",
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
    stakeholderMap: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          funder: { type: "string" },
          competitorsUsing: { type: "array", items: { type: "string" } },
          relevanceToYou: { type: "string" },
          tradeoff: { type: "string" },
          nextStep: { type: "string" },
          nextDeadline: { type: ["string", "null"] },
        },
        required: [
          "funder", "competitorsUsing", "relevanceToYou", "tradeoff", "nextStep", "nextDeadline",
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
  required: ["overview", "stakeholderMap", "todos", "caveats"],
} as const;

/**
 * Build the competitor table deterministically. euCapital and channels come ONLY
 * from the DB match (never the model, never the open web); stage and positioning
 * are web colour. `records` is aligned 1:1 with `intel` (records = intel mapped
 * through matchCompany), so they share an index.
 */
function buildCompetitors(
  records: CompetitorRecord[],
  intel: CompetitorIntel[],
): CompetitorRow[] {
  return records.map((r, i) => {
    const web = intel[i];
    return {
      name: web?.name || r.name || "Unknown",
      source: "web" as const,
      country: r.matched ? r.country : "",
      euCapital: !r.matched
        ? "No public funding traced"
        : r.euCapitalEur > 0
          ? fmtEur(r.euCapitalEur)
          : "Amount not disclosed",
      channelBreakdown: r.matched ? fundingBreakdown(r.channelAmounts) : "",
      channels: r.matched ? r.channels : [],
      activeYears: r.matched ? activeYears(r.firstYear, r.lastYear) : "",
      // Web colour goes into table cells, so it obeys the no-em-dash rule too.
      stage: deDash(web?.lastPrivateRound || "Unknown"),
      positioning: deDash(web?.positioning || "Unknown"),
    };
  });
}

/** Database-native peers (same sub-sector, all funded) → competitor rows. */
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
): Promise<Omit<IntelligenceReport, "company" | "generatedAt">> {
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
        `positioning — ${c.positioning}; recent private round — ${c.stage}`
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
    max_tokens: 8000,
    // Haiku 4.5 supports neither adaptive thinking nor the effort param; use a
    // small fixed thinking budget (< max_tokens) for the prioritisation judgement.
    thinking: { type: "enabled", budget_tokens: 2000 },
    system: instructions,
    output_config: { format: { type: "json_schema", schema: REPORT_SCHEMA } },
    messages: [
      {
        role: "user",
        content:
          `Write the executive funding memo for the founder.\n\n${ctx}\n\n` +
          `## The founder's own footprint (AUTHORITATIVE)\n${selfLine}\n\n` +
          `## Competitor evidence (AUTHORITATIVE — already finalised)\n` +
          `EU/public-capital figures are committed amounts from our database; ` +
          `"No public funding traced" means not found there. Use these figures ` +
          `EXACTLY as given — never restate a private round as public capital, ` +
          `and never introduce a funding figure or funder not listed here. Rows ` +
          `tagged "[same sub-sector, from database]" are not necessarily direct ` +
          `competitors — they are funded companies in the founder's sub-sector, ` +
          `useful as evidence of what peers in the space have raised.\n` +
          `${evidence || "(no competitors gathered)"}\n\n` +
          `## The capital on the table (AUTHORITATIVE — already finalised)\n` +
          `These are the instruments relevant to this founder, with curated ` +
          `ticket sizes, speed and trade-offs. They render as a table; do NOT ` +
          `restate them row by row and do NOT alter a figure. Use them so your ` +
          `prose, your per-funder trade-offs and your to-dos stay consistent ` +
          `with this table.\n${instruments || "(none)"}\n\n` +
          `## Relevant funding-process briefs (use to make to-dos concrete)\n` +
          `${processes || "(none)"}\n\n` +
          `Write, per your instructions: the headline (subject line), the ` +
          `bottomLine (the single most important takeaway, up front), the ` +
          `"your position" paragraph that compares the founder's own footprint ` +
          `above against the peers, and the stakeholder map. For each funder in ` +
          `the map, "tradeoff" must name in one short clause what that capital ` +
          `actually costs the founder, fund-specifically and honestly (dilution, ` +
          `repayment, co-financing, member-state sponsorship, reporting load, ` +
          `lost flexibility, slow money) drawn from the table and briefs above. ` +
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
  const narrative = extractJson<{
    overview: { headline: string; bottomLine: string; yourPosition: string };
    stakeholderMap: IntelligenceReport["stakeholderMap"];
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
    stakeholderMap: narrative.stakeholderMap.map((s) => ({
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

// ── Phase 1: tailored intake questions ───────────────────────────────────────
const INTAKE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
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
  required: ["questions"],
} as const;

/**
 * Generate up to four tailored multiple-choice questions whose answers most change
 * which public instruments fit and how to position for them. Adaptive: only asks
 * what is still unknown from the form. Returns [] on any failure so the memo can
 * still run without the extra signal.
 */
export async function generateIntakeQuestions(
  req: IntelligenceRequest,
): Promise<IntakeQuestion[]> {
  const known = [
    `Company: ${req.company}`,
    req.sector ? `Sector: ${req.sector}` : "",
    req.country ? `Country: ${req.country}` : "",
    req.companyType ? `Company type (their words): ${req.companyType}` : "",
    req.description ? `What they do: ${req.description}` : "",
    capitalSoughtLabel(req.capitalSought)
      ? `Capital sought: ${capitalSoughtLabel(req.capitalSought)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await client.messages.create({
      model: INTAKE_MODEL,
      max_tokens: 1500,
      thinking: { type: "disabled" },
      system: loadAgentInstructions(),
      output_config: { format: { type: "json_schema", schema: INTAKE_SCHEMA } },
      messages: [
        {
          role: "user",
          content:
            `A founder wants a public-funding memo. Before writing it, ask up to ` +
            `FOUR short multiple-choice questions whose answers would most change ` +
            `which instruments fit and how to position for them. Ask ONLY what is ` +
            `still unknown or ambiguous from what they gave you below; if a thing ` +
            `is already clear, do not ask it.\n\n` +
            `Prioritise the high-signal routing forks: (1) archetype, i.e. genuine ` +
            `deep-tech breakthrough vs applied innovation vs application-layer ` +
            `software on existing tech, since it decides EIC and deep-tech ` +
            `eligibility; (2) technology readiness (rough TRL band); (3) minimum ` +
            `useful cheque size, e.g. would they bother below 100k; (4) dilution ` +
            `tolerance / capital preference if not already given; (5) willingness ` +
            `to join a cross-border consortium; (6) stage and runway. Pick the ` +
            `four that matter most for THIS company.\n\n` +
            `Each question: plain English, one clause, and 2 to 4 mutually ` +
            `exclusive options written as short founder-friendly phrases (not ` +
            `jargon). Do not include a "not sure" option; the interface adds one.\n\n` +
            `What we already know:\n${known}\n\n` +
            `Return ONLY the JSON object for the schema.`,
        },
      ],
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const parsed = extractJson<{ questions: { question: string; options: string[] }[] }>(text);
    return (parsed.questions ?? [])
      .filter((q) => q && q.question?.trim() && Array.isArray(q.options) && q.options.length >= 2)
      .slice(0, 4)
      .map((q, i) => ({
        id: `q${i}`,
        question: deDash(q.question.trim()),
        options: q.options.map((o) => deDash(String(o).trim())).filter(Boolean).slice(0, 4),
      }));
  } catch (err) {
    console.error("intake question generation failed:", err);
    return [];
  }
}

/** Run the full pipeline, emitting progress events as each stage completes. */
export async function runIntelligence(req: IntelligenceRequest, emit: Emit): Promise<void> {
  const instructions = loadAgentInstructions();

  emit({ type: "status", step: "discovering" });
  const intel = await discoverAndResearch(req, instructions);

  emit({ type: "status", step: "querying_db", detail: `${intel.length} peers` });
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
  const instrumentTable = buildInstrumentTable(fieldChannels);

  emit({ type: "status", step: "generating" });
  const body = await synthesize(req, records, intel, dbPeers, self, instrumentTable, instructions);

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
