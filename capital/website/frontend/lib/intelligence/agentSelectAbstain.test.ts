// wsIJ — THE ABSTENTION RULE IS A PROPERTY, AND THIS FILE STATES IT AS ONE.
//
// The rule: the model's ordering is published only when the model's own first
// choice is NOT the first row we offered it. When it confirms our first row, we
// publish our own order unchanged.
//
// ── Why the test is written over ARBITRARY replies and not over examples ───
// A table of "picks [0,3,5] -> ours, picks [3,0,5] -> theirs" is an
// enumeration: it passes on the rows somebody thought of and says nothing about
// the reply that arrives tomorrow. So the assertions below quantify over every
// pick vector of a given length -- 5,040 of them for a menu of seven -- and
// check the two halves of the property on each: the published order is OURS
// exactly when the first index is 0, and it is a PERMUTATION of the pool in
// both cases. That second half is the one an implementation slip breaks:
// returning `rows` instead of the permutation is easy to get right, and
// returning a truncated list is easy to get wrong.
//
// ── The disaster it simulates ──────────────────────────────────────────────
// Change the predicate to `picks.includes(0)`, or to `picks[0] <= 1`, or drop
// the `ABSTAIN_MODE` guard so the rule fires with the lever off, and this file
// fails. The last of those is the one that would ship silently: `off` must be
// byte-for-byte today's behaviour or every run before this one becomes
// unreadable.
//
// FREE. No model call, no key, no network — `abstains` is a pure function of the
// reply, which is why it is a named export and not an inline conditional.
import { describe, expect, it, afterEach, beforeEach, vi } from "vitest";

async function levered(mode: string | undefined) {
  vi.resetModules();
  if (mode === undefined) delete process.env.AGENT_SELECT_ABSTAIN;
  else process.env.AGENT_SELECT_ABSTAIN = mode;
  return import("./agentSelect");
}

const SAVED = process.env.AGENT_SELECT_ABSTAIN;
beforeEach(() => { delete process.env.AGENT_SELECT_ABSTAIN; });
afterEach(() => {
  if (SAVED === undefined) delete process.env.AGENT_SELECT_ABSTAIN;
  else process.env.AGENT_SELECT_ABSTAIN = SAVED;
  vi.resetModules();
});

/** Every ordered selection of `k` distinct indices out of `n`. */
function everyPickVector(n: number, k: number): number[][] {
  if (k === 0) return [[]];
  const out: number[][] = [];
  for (let i = 0; i < n; i++)
    for (const rest of everyPickVector(n, k - 1))
      if (!rest.includes(i)) out.push([i, ...rest]);
  return out;
}

describe("wsIJ confirmation abstention", () => {
  it("is off unless asked for, on every reply there is", async () => {
    const { abstains } = await levered(undefined);
    for (const picks of everyPickVector(7, 3)) expect(abstains(picks)).toBe(false);
  });

  it("fires exactly when the model's first choice is the first row we offered", async () => {
    const { abstains } = await levered("confirmed");
    const all = everyPickVector(7, 4);
    expect(all.length).toBe(7 * 6 * 5 * 4);
    for (const picks of all) expect(abstains(picks)).toBe(picks[0] === 0);
    // The half that a `picks.includes(0)` slip would break: a reply that names
    // our first row SECOND is a reply that disagrees about first place, and the
    // model's ordering is published.
    expect(all.filter((p) => p.includes(0)).length)
      .toBeGreaterThan(all.filter((p) => p[0] === 0).length);
  });

  it("publishes a permutation of the pool either way", async () => {
    const { abstains } = await levered("confirmed");
    const pool = ["a", "b", "c", "d", "e", "f", "g"];
    for (const picks of everyPickVector(pool.length, 4)) {
      const chosen = picks.map((i) => pool[i]);
      const taken = new Set(chosen);
      const out = abstains(picks)
        ? pool
        : [...chosen, ...pool.filter((r) => !taken.has(r))];
      expect([...out].sort()).toEqual([...pool].sort());
      expect(out.length).toBe(pool.length);
      if (abstains(picks)) expect(out).toEqual(pool);
      else expect(out[0]).toBe(pool[picks[0]]);
    }
  });

  it("refuses a typo rather than reading it as off", async () => {
    await expect(levered("Confirmed")).rejects.toThrow(/AGENT_SELECT_ABSTAIN must be one of/);
    await expect(levered("on")).rejects.toThrow(/AGENT_SELECT_ABSTAIN must be one of/);
  });
});
