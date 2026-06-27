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
  loadAgentInstructions,
  loadFundProcess,
  matchCompany,
} from "./corpus";
import type {
  ChannelAmount,
  CompetitorIntel,
  CompetitorRecord,
  CompetitorRow,
  IntelligenceReport,
  IntelligenceRequest,
  ProgressEvent,
  SelfRecord,
} from "./types";

// The whole pipeline runs on cheap, fast models, guided by the Opus-authored
// briefs in fund-processes/ (especially _agent_instructions.md, a strict rubric).
// The two web-search stages use Sonnet 4.6. The final report is filled into a
// strict JSON schema of short fields, so Haiku 4.5 — given the rubric — writes it
// well at a fraction of the cost and latency. No runtime Opus call, so the
// pipeline lands well under Vercel's 300s function cap (Hobby).
const SEARCH_MODEL = "claude-sonnet-4-6";
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
          nextStep: { type: "string" },
          nextDeadline: { type: ["string", "null"] },
        },
        required: ["funder", "competitorsUsing", "relevanceToYou", "nextStep", "nextDeadline"],
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
      euCapital: r.matched ? fmtEur(r.euCapitalEur) : "No public funding traced",
      channelBreakdown: r.matched ? fundingBreakdown(r.channelAmounts) : "",
      channels: r.matched ? r.channels : [],
      activeYears: r.matched ? activeYears(r.firstYear, r.lastYear) : "",
      stage: web?.lastPrivateRound || "Unknown",
      positioning: web?.positioning || "Unknown",
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
    euCapital: r.matched ? fmtEur(r.euCapitalEur) : "No public funding traced",
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

  const ctx = [
    `Founder's company: ${req.company}`,
    req.sector ? `Sector: ${req.sector}` : "",
    req.country ? `Country: ${req.country}` : "",
    req.description ? `What they do: ${req.description}` : "",
  ]
    .filter(Boolean)
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
          `## Relevant funding-process briefs (use to make to-dos concrete)\n` +
          `${processes || "(none)"}\n\n` +
          `Write, per your instructions: the headline (subject line), the ` +
          `bottomLine (the single most important takeaway, up front), the ` +
          `"your position" paragraph that compares the founder's own footprint ` +
          `above against the peers, the stakeholder map, and prioritised to-dos. ` +
          `In "caveats", note in one or two sentences that figures are committed ` +
          `amounts from public registers, coverage varies by country, and ` +
          `absence from the database is not proof of no funding.`,
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

  // Merge the code-built competitor table into the model's narrative.
  return {
    self,
    overview: { ...narrative.overview, competitors },
    stakeholderMap: narrative.stakeholderMap,
    todos: narrative.todos,
    caveats: narrative.caveats,
  };
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
  let targetSub = selfRecord.matched ? selfRecord.subsector : "";
  if (!targetSub) {
    const subs = records.filter((r) => r.matched && r.subsector).map((r) => r.subsector);
    const freq = new Map<string, number>();
    for (const s of subs) freq.set(s, (freq.get(s) ?? 0) + 1);
    targetSub = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  }
  const exclude = [req.company, ...intel.map((i) => i.name)];
  const dbPeers = targetSub
    ? findPeersBySubsector(targetSub, { country: req.country, limit: 4, exclude })
    : [];

  emit({ type: "status", step: "generating" });
  const body = await synthesize(req, records, intel, dbPeers, self, instructions);

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
