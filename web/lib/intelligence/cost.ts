// What a brief actually costs, in euros, measured rather than assumed.
//
// The spend ceiling used to be a count — 200 briefs a day — which is a proxy
// for the thing that matters and a bad one: a brief whose writer thinks for
// 150 seconds costs several times one that returns in 24, and the count cannot
// tell them apart. Capping on money means the limit says what it means.
//
// Usage is read from each response rather than estimated from string lengths:
// the API reports exactly what it billed, including cache reads and the
// thinking tokens that adaptive mode can spend without emitting.
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * USD per million tokens, by model: input, output, and the two cache rates.
 *
 * NOTE FOR WHOEVER READS THIS NEXT: list prices from Anthropic's model table as
 * cached 2026-10-06 (the claude-api skill); they change. A wrong price here does
 * not break anything visibly; it quietly makes the spend ceiling mean the wrong
 * number, which is the failure mode this codebase is worst at noticing.
 *
 * Cache rates are their own column now (Nov 2026). They used to be charged at
 * the full input rate "to stay conservative", which was harmless while every
 * call here was a one-shot brief. The advisor's agent loop re-sends a cached
 * prefix on every turn, and at the full rate a mission's measured cost read
 * several times what was billed: a ceiling that refuses missions it could
 * afford, and a reported cost per mission nobody could reconcile with the
 * invoice. Cache WRITES are billed above input (1.25x for the 5-minute TTL),
 * so they now count MORE than before, not less.
 */
interface Price { in: number; out: number; cacheRead: number; cacheWrite: number }
const price = (input: number, output: number, cacheRead = input * 0.1): Price =>
  ({ in: input, out: output, cacheRead, cacheWrite: input * 1.25 });
const PRICES: Record<string, Price> = {
  // the advisor: orchestrator and specialists (web/lib/mandate/agent/models.ts)
  "claude-opus-5-5": price(4, 20, 0.2),
  "claude-sonnet-5-5": price(2, 10, 0.2),
  "claude-haiku-5-5": price(0.1, 0.5, 0.01),
  // the brief pipeline
  "claude-sonnet-5": price(2, 10),
  "claude-haiku-4-5-20251001": price(1, 5),
  "claude-haiku-4-5": price(1, 5),
};
/** Fallback for an unrecognised model: assume an expensive one. A ceiling
 *  that under-counts is worse than one that over-counts. */
const DEFAULT_PRICE = price(5, 25);

/** USD per server-side web search. Each research pass allows up to 4. */
const WEB_SEARCH_USD = 0.01;

/**
 * Fixed conversion. Deliberately not a live FX lookup: a spend guard must not
 * acquire a network dependency, and a few percent of drift is irrelevant to a
 * ceiling whose job is to bound a runaway, not to do accounting.
 */
const USD_TO_EUR = 0.92;

export interface Usage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number | null } | null;
}

/** Cost of one API response, in euros. */
export function costOf(model: string, usage: Usage | undefined | null): number {
  if (!usage) return 0;
  const p = PRICES[model] ?? DEFAULT_PRICE;
  const searches = usage.server_tool_use?.web_search_requests ?? 0;
  const usd = ((usage.input_tokens ?? 0) / 1e6) * p.in
    + ((usage.cache_read_input_tokens ?? 0) / 1e6) * p.cacheRead
    + ((usage.cache_creation_input_tokens ?? 0) / 1e6) * p.cacheWrite
    + ((usage.output_tokens ?? 0) / 1e6) * p.out
    + searches * WEB_SEARCH_USD;
  return usd * USD_TO_EUR;
}

/**
 * Per-request accumulator.
 *
 * AsyncLocalStorage rather than threading a parameter through every call site:
 * the pipeline makes six model calls across four modules, and a parameter that
 * must be passed everywhere is one somebody eventually forgets to pass — which
 * would silently under-count and quietly raise the real ceiling. Here a call
 * that forgets to record simply is not counted, and the wiring lives in one
 * place.
 */
const store = new AsyncLocalStorage<{ eur: number; calls: number }>();

/** Run `fn` with a fresh cost accumulator; returns the result and the total. */
export async function withCostTracking<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; eur: number; calls: number }> {
  const ctx = { eur: 0, calls: 0 };
  const result = await store.run(ctx, fn);
  return { result, eur: ctx.eur, calls: ctx.calls };
}

/** Record one API response against the current request, if any. */
export function recordUsage(model: string, usage: Usage | undefined | null): void {
  const ctx = store.getStore();
  if (!ctx) return; // called outside a tracked request (a script, a bench run)
  ctx.eur += costOf(model, usage);
  ctx.calls += 1;
}

/** Cost so far on the current request. */
export function currentCost(): number {
  return store.getStore()?.eur ?? 0;
}
