/**
 * The usage log: every tool call a brain makes becomes one row in
 * mandate.tool_calls (mandate/db/tool_calls.sql), written through mandate-api's
 * POST /usage/tool_calls (mandate/usage.py checks the shape).
 *
 * ONE PLACE. `toolCallRow` is the only code that turns a call into a row. The
 * agent loop reaches it through `loggedLoop` (each runLoop's onToolResult), and
 * the bench (web/scripts/brain_tool.ts) calls it around the same handlers, so
 * a bench run and a production mission are counted the same way.
 *
 * Best-effort: a logging failure never fails the call it records.
 */
import { createHash } from "crypto";

export type Brain = "mandate" | "wincent" | "regina";
export type Caller = "agent" | "bench" | "search" | "eval";

export interface ToolCallRow {
  mission_id: string | null; brain: Brain; tool: string; caller: Caller;
  args_sha256: string; args_summary: string; ok: boolean;
  result_count: number | null; citations: number;
  tables: string[]; sources: string[]; ms: number; error: string | null;
}

/** What each tool reads, so "what brains use" can be answered per table. A tool
 *  missing here would log with no tables; usage.test.ts fails the build when a
 *  specialist tool is not mapped. */
export const TOOL_TABLES: Record<string, string[]> = {
  find_instruments: ["capital.funding_instruments", "capital.eligibility_gates"],
  assess_instrument: ["capital.funding_instruments", "capital.eligibility_gates", "capital.eligibility_grounding", "grounding.document_versions"],
  fund_requirements: ["capital.eligibility_embeddings"],
  application_route: ["capital.instrument_application"],
  find_precedents: ["capital.public_funding_events", "capital.public_equity_stakes", "capital.companies", "capital.funding_instrument_sources"],
  read_agenda: ["capital.signals_articles", "capital.signals_article_signals", "capital.signals_article_entities"],
  search_law: ["grounding.passage_embeddings", "grounding.passages", "policy.documents"],
  document: ["policy.documents", "grounding.passages"],
  consultations: ["policy.documents"],
  actors: ["policy.actors", "policy.document_actor"],
  research: ["grounding.document_versions"],
  actors_register_find: ["mandate.actor_organisations"],
  actors_register_add: ["mandate.actor_organisations"],
  suggest_email: ["mandate.actor_email_formats"],
  profile_get: ["mandate.profiles"],
  profile_append: ["mandate.profiles"],
};

/** sha256 of canonical JSON (sorted keys, no spaces): mandate/usage.py's args_hash. */
export function argsHash(args: unknown): string {
  const canon = (v: unknown): unknown => Array.isArray(v) ? v.map(canon)
    : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])]))
      : v;
  return createHash("sha256").update(JSON.stringify(canon(args ?? {}))).digest("hex");
}

function summary(input: Record<string, unknown>): string {
  const parts = Object.entries(input).filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`);
  return parts.join("; ").slice(0, 240);
}

/** The rows a result carries: the first array among its top-level values (or the result itself). */
function resultCount(result: unknown): number | null {
  if (Array.isArray(result)) return result.length;
  if (result && typeof result === "object") {
    for (const v of Object.values(result)) if (Array.isArray(v)) return v.length;
  }
  return null;
}

/** Citation ids ([cN]) and row sources anywhere in the result. */
function walk(result: unknown): { citations: number; sources: Set<string> } {
  const ids = new Set<string>();
  const sources = new Set<string>();
  const visit = (v: unknown, depth: number) => {
    if (depth > 6 || !v || typeof v !== "object") return;
    if (Array.isArray(v)) { v.forEach((x) => visit(x, depth + 1)); return; }
    for (const [k, x] of Object.entries(v)) {
      if (k === "citation" && typeof x === "string" && /^c\d+$/.test(x)) ids.add(x);
      else if (k === "source" && typeof x === "string" && x.length <= 60 && !x.includes(" ")) sources.add(x);
      else visit(x, depth + 1);
    }
  };
  visit(result, 0);
  return { citations: ids.size, sources };
}

export function toolCallRow(call: {
  brain: Brain; tool: string; input: Record<string, unknown>; result?: unknown; error?: string;
  ms: number; missionId?: string | null; caller?: Caller;
}): ToolCallRow {
  const w = call.error ? { citations: 0, sources: new Set<string>() } : walk(call.result);
  return {
    mission_id: call.missionId ?? null, brain: call.brain, tool: call.tool, caller: call.caller ?? "agent",
    args_sha256: argsHash(call.input), args_summary: summary(call.input), ok: !call.error,
    result_count: call.error ? 0 : resultCount(call.result), citations: w.citations,
    tables: TOOL_TABLES[call.tool] ?? [], sources: [...w.sources].sort().slice(0, 50),
    ms: Math.round(call.ms), error: call.error ? call.error.slice(0, 500) : null,
  };
}

export type UsageSink = (rows: ToolCallRow[]) => Promise<unknown>;

/** Record one row; never throws, never waits longer than `ms`. */
export async function logRow(sink: UsageSink | undefined, row: ToolCallRow, ms = 3000): Promise<void> {
  if (!sink) return;
  try {
    await Promise.race([sink([row]), new Promise((res) => setTimeout(res, ms))]);
  } catch (e) {
    console.warn("[mandate/usage] tool call not logged:", String(e).slice(0, 160));
  }
}

/** The runLoop hook for one brain in one mission. */
export function loggedLoop(sink: UsageSink | undefined, brain: Brain, missionId: string, caller: Caller = "agent") {
  return (r: { name: string; input: Record<string, unknown>; result?: unknown; error?: string; ms: number }) =>
    logRow(sink, toolCallRow({ brain, tool: r.name, input: r.input, result: r.result, error: r.error, ms: r.ms, missionId, caller }));
}
