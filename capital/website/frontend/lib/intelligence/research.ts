// Stage one of the memo: who else has been funded for work like this.
//
// Split out of pipeline.ts in the Phase 2 decomposition. It is the only part
// of the pipeline that reaches the open web, and the only part that is allowed
// to fail without taking the brief down with it: comparables CORROBORATE a
// brief, they are not its substance. The instrument corpus and the DB-native
// peers are local and cannot time out, so a failed search degrades to "no
// comparables" rather than an error page.
//
// That is why every call here is bounded and every failure is recorded rather
// than thrown — see recordEvent("research_degraded").
import Anthropic from "@anthropic-ai/sdk";
import { recordUsage } from "./cost";
import { recordEvent } from "./telemetry";
import { fence } from "./untrusted";
import type { CompetitorIntel, IntelligenceRequest } from "./types";

const client = new Anthropic();
const SEARCH_MODEL = "claude-sonnet-5";

function billed<T extends { model?: string; usage?: unknown }>(res: T, fallbackModel: string): T {
  recordUsage(res.model ?? fallbackModel, res.usage as never);
  return res;
}

function extractJson<T>(text: string): T {
  const block = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = block ? block[1] : text;
  const start = body.search(/[{[]/);
  if (start === -1) throw new SyntaxError("No JSON found in model response");
  return JSON.parse(body.slice(start).trim()) as T;
}

const MAX_COMPETITORS = 5;

/** One non-streaming message turn with the web-search tool available. */
// Research runs BEFORE the writer inside the same 300s route budget (see
// app/api/intelligence/route.ts maxDuration). Unbounded, a slow search pass
// can eat the whole request and leave nothing for the memo itself, so each
// call is capped and the SDK's retries are off — a retry here doubles the
// spend on the stage that matters least.
const SEARCH_TIMEOUT_MS = 60_000;

async function askWithSearch(model: string, system: string, user: string): Promise<string> {
  // Lighter web-search version (no server-side dynamic-filtering code execution)
  // and thinking disabled — both are pure latency on a search-grounded task.
  const tools = [
    { type: "web_search_20250305" as const, name: "web_search" as const, max_uses: 4 },
  ];
  const res = billed(await client.messages.create({
    model,
    max_tokens: 8000,
    thinking: { type: "disabled" },
    system,
    tools,
    messages: [{ role: "user", content: user }],
  }, { timeout: SEARCH_TIMEOUT_MS, maxRetries: 1 }), model);
  // web_search runs a server-side loop; resume once if it paused mid-search.
  let message = res;
  let guard = 0;
  while (message.stop_reason === "pause_turn" && guard++ < 1) {
    message = billed(await client.messages.create({
      model,
      max_tokens: 8000,
      thinking: { type: "disabled" },
      system,
      tools,
      messages: [
        { role: "user", content: user },
        { role: "assistant", content: message.content },
      ],
    }, { timeout: SEARCH_TIMEOUT_MS, maxRetries: 1 }), model);
  }
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

// ── Stages 1+3 merged: discover competitors AND research them in one search pass.
// Two serial web-search calls were the timeout; one pass finds the peers and
// their snapshots together, then we DB-match the names (no LLM) below.
export async function discoverAndResearch(
  req: IntelligenceRequest,
  instructions: string,
): Promise<CompetitorIntel[]> {
  const ctx = [
    `Company: ${req.company}`,
    // ── NO INTAKE ANSWER REACHES THIS PROMPT, AND NOW IT SAYS SO ──────────
    // `req.sector ? \`Sector: ...\`` was here. The route read `body.sector`,
    // the panel never sent it, so the line rendered empty on every request
    // this product has served and its removal is byte-identical (wsIK).
    // What that exposes rather than fixes: `ctx` is built from the request's
    // top-level fields only, so the comparable-company search has never been
    // told the founder's sector, ticket, stage or use of funds — the answers
    // sit in `req.eligibility` and nothing here reads them. Wiring
    // `intakeFactLines(req.eligibility)` in would change what this paid stage
    // searches for, so it is a measured change and not a tidy-up.
    req.country ? `Country: ${req.country}` : "",
    req.companyType ? `Company type: ${req.companyType}` : "",
    req.description ? fence("company description", req.description) : "",
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
    recordEvent("research_degraded", `competitor intel did not parse: ${String(err)}`,
      { chars: text.length });
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
