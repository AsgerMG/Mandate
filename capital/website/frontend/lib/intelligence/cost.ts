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
 * USD per million tokens, by model.
 *
 * NOTE FOR WHOEVER READS THIS NEXT: these are list prices as of July 2026 and
 * they change. Sonnet 5 is on introductory pricing that ENDS 2026-08-31, after
 * which input goes 2 -> 3 and output 10 -> 15. A wrong price here does not
 * break anything visibly; it quietly makes the spend ceiling mean the wrong
 * number, which is the failure mode this codebase is worst at noticing.
 */
const PRICES: Record<string, { in: number; out: number }> = {
  "claude-sonnet-5": { in: 2, out: 10 },
  "claude-haiku-4-5-20251001": { in: 1, out: 5 },
};
/** Fallback for an unrecognised model: assume the expensive one. A ceiling
 *  that under-counts is worse than one that over-counts. */
const DEFAULT_PRICE = { in: 3, out: 15 };

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
  // Cache reads bill at a fraction of input, but counting them at full rate
  // only makes the ceiling more conservative, and the alternative is tracking
  // a discount that changes independently of the base price.
  const inTok = (usage.input_tokens ?? 0)
    + (usage.cache_read_input_tokens ?? 0)
    + (usage.cache_creation_input_tokens ?? 0);
  const outTok = usage.output_tokens ?? 0;
  const searches = usage.server_tool_use?.web_search_requests ?? 0;
  const usd = (inTok / 1e6) * p.in + (outTok / 1e6) * p.out + searches * WEB_SEARCH_USD;
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
