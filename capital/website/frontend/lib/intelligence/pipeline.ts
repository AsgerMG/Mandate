// The four-stage intelligence pipeline. Code-orchestrated (not a free-roaming
// agent) so progress is deterministic and cost is bounded:
//   1. discover  — Claude + web search → competitor names
//   2. query_db  — local fuzzy match against the corpus (no LLM)
//   3. research  — Claude + web search → product/positioning/financing per peer
//   4. generate  — Claude + structured output → the final report
import Anthropic from "@anthropic-ai/sdk";
import { fmtEur } from "@/lib/format";
import {
  loadAgentInstructions,
  loadFundProcess,
  matchCompany,
} from "./corpus";
import type {
  CompetitorIntel,
  CompetitorRecord,
  IntelligenceReport,
  IntelligenceRequest,
  OverviewSection,
  ProgressEvent,
} from "./types";

// The whole pipeline runs on cheap, fast models, guided by the Opus-authored
// briefs in fund-processes/ (especially _agent_instructions.md, a strict rubric).
// The two web-search stages use Sonnet 4.6. The final report is filled into a
// strict JSON schema of short fields, so Haiku 4.5 — given the rubric — writes it
// well at a fraction of the cost and latency. No runtime Opus call, so the
// pipeline lands well under Vercel's 300s function cap (Hobby).
const SEARCH_MODEL = "claude-sonnet-4-6";
const WRITER_MODEL = "claude-haiku-4-5";
const MAX_COMPETITORS = 5;

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

type Emit = (event: ProgressEvent) => void;

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
      `[{"name": "...", "product": "...", "positioning": "...", ` +
      `"lastPrivateRound": "...", "notes": "..."}]\n` +
      `Use legal or common company names. Keep each field to one or two sentences. ` +
      `If something is unknown, say "Unknown".`,
  );
  const intel = extractJson<CompetitorIntel[]>(text);
  return intel
    .slice(0, MAX_COMPETITORS)
    .filter((i) => i && i.name && String(i.name).trim())
    .map((i) => ({
      name: String(i.name).trim(),
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
        yourPosition: { type: "string" },
      },
      required: ["headline", "yourPosition"],
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
): OverviewSection["competitors"] {
  return records.map((r, i) => {
    const web = intel[i];
    return {
      name: web?.name || r.name || "Unknown",
      euCapital: r.matched ? fmtEur(r.euCapitalEur) : "No public funding traced",
      channels: r.matched ? r.channels : [],
      stage: web?.lastPrivateRound || "Unknown",
      positioning: web?.positioning || "Unknown",
    };
  });
}

async function synthesize(
  req: IntelligenceRequest,
  records: CompetitorRecord[],
  intel: CompetitorIntel[],
  instructions: string,
): Promise<Omit<IntelligenceReport, "company" | "generatedAt">> {
  // The competitor table is finalised HERE, in code — funding figures and
  // channels are taken straight from the DB match. The model never sees these as
  // editable; it only writes the narrative around them.
  const competitors = buildCompetitors(records, intel);

  // The single authoritative evidence block the model writes from. Each line is
  // already correct (DB funding + web colour), so the model cannot fabricate.
  const evidence = competitors
    .map(
      (c) =>
        `- ${c.name}: EU/public capital ${c.euCapital}` +
        `${c.channels.length ? ` via [${c.channels.join(", ")}]` : ""}; ` +
        `positioning — ${c.positioning}; recent private round — ${c.stage}`,
    )
    .join("\n");

  // Inject only the process briefs for channels that actually appear.
  const channels = [...new Set(records.flatMap((r) => (r.matched ? r.channels : [])))];
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
          `Write the intelligence report for the founder.\n\n${ctx}\n\n` +
          `## Competitor evidence (AUTHORITATIVE — already finalised)\n` +
          `EU/public-capital figures are committed amounts from our database; ` +
          `"No public funding traced" means not found there. Use these figures ` +
          `EXACTLY as given — never restate a private round as public capital, ` +
          `and never introduce a funding figure or funder not listed here.\n` +
          `${evidence || "(no competitors gathered)"}\n\n` +
          `## Relevant funding-process briefs (use to make to-dos concrete)\n` +
          `${processes || "(none)"}\n\n` +
          `Write the overview headline and "your position" paragraph, the ` +
          `stakeholder map, and prioritised to-dos per your instructions. In ` +
          `"caveats", note in one or two sentences that figures are committed ` +
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
    overview: { headline: string; yourPosition: string };
    stakeholderMap: IntelligenceReport["stakeholderMap"];
    todos: IntelligenceReport["todos"];
    caveats: string;
  }>(text);

  // Merge the code-built competitor table into the model's narrative.
  return {
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
  const records = intel.map((i) => matchCompany(i.name));

  emit({ type: "status", step: "generating" });
  const body = await synthesize(req, records, intel, instructions);

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
