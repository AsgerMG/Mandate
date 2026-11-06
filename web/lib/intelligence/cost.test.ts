import { describe, expect, it } from "vitest";
import { costOf, withCostTracking, recordUsage, currentCost } from "./cost";

/**
 * The spend ceiling is enforced in euros against these numbers. If they are
 * wrong the ceiling quietly means something other than what it says, which is
 * the failure mode this codebase is worst at noticing.
 */
describe("cost of one response", () => {
  it("prices input and output separately", () => {
    // Sonnet 5 at 2/10 USD per Mtok, converted at 0.92.
    const eur = costOf("claude-sonnet-5", { input_tokens: 1e6, output_tokens: 0 });
    expect(eur).toBeCloseTo(2 * 0.92, 5);
    const out = costOf("claude-sonnet-5", { input_tokens: 0, output_tokens: 1e6 });
    expect(out).toBeCloseTo(10 * 0.92, 5);
  });

  it("charges an unknown model at the expensive rate", () => {
    // A ceiling that under-counts is worse than one that over-counts.
    const known = costOf("claude-sonnet-5", { input_tokens: 1e6 });
    const unknown = costOf("some-future-model", { input_tokens: 1e6 });
    expect(unknown).toBeGreaterThan(known);
  });

  it("counts cache tokens and web searches", () => {
    const base = costOf("claude-haiku-4-5-20251001", { input_tokens: 1000 });
    const cached = costOf("claude-haiku-4-5-20251001", {
      input_tokens: 1000, cache_read_input_tokens: 1000,
    });
    expect(cached).toBeGreaterThan(base);
    const searched = costOf("claude-haiku-4-5-20251001", {
      input_tokens: 1000, server_tool_use: { web_search_requests: 4 },
    });
    expect(searched).toBeGreaterThan(base);
  });

  it("is zero for missing usage rather than throwing", () => {
    expect(costOf("claude-sonnet-5", undefined)).toBe(0);
    expect(costOf("claude-sonnet-5", null)).toBe(0);
  });
});

describe("per-request accumulation", () => {
  it("sums across calls inside one tracked request", async () => {
    const { eur, calls } = await withCostTracking(async () => {
      recordUsage("claude-sonnet-5", { input_tokens: 1e6 });
      recordUsage("claude-sonnet-5", { output_tokens: 1e6 });
      return "done";
    });
    expect(calls).toBe(2);
    expect(eur).toBeCloseTo((2 + 10) * 0.92, 5);
  });

  it("keeps concurrent requests separate", async () => {
    // AsyncLocalStorage is the whole reason a parameter is not threaded through
    // six call sites; if isolation broke, one request would be billed another's
    // spend and the ceiling would fire at the wrong time.
    const [a, b] = await Promise.all([
      withCostTracking(async () => { recordUsage("claude-sonnet-5", { input_tokens: 1e6 }); }),
      withCostTracking(async () => { recordUsage("claude-sonnet-5", { input_tokens: 3e6 }); }),
    ]);
    expect(a.eur).toBeCloseTo(2 * 0.92, 5);
    expect(b.eur).toBeCloseTo(6 * 0.92, 5);
  });

  it("does not throw when called outside a tracked request", () => {
    expect(() => recordUsage("claude-sonnet-5", { input_tokens: 100 })).not.toThrow();
    expect(currentCost()).toBe(0);
  });
});
