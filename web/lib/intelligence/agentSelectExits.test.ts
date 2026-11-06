// EVERY EXIT FROM `agentSelectRows` INCREMENTS EXACTLY ONE TALLY.
//
// ── The failure this pins ──────────────────────────────────────────────────
// Two returns in that function counted nothing: a pool no longer than
// `SELECT_COUNT`, and a menu no longer than the seats on offer. Both are
// ordinary on a founder with a short accessible pool, and both publish the
// shipped order. So a paid run that hit them on a third of its founders
// reported "no difference" and could not say whether the model had judged and
// agreed, or had never been asked at all. That is not a missing diagnostic; it
// is a result nobody can interpret, and it was a precondition for spending.
//
// ── Why this is a property and not five assertions ─────────────────────────
// The test does not check that a NAMED counter moved. It checks that the TOTAL
// across every exit reason moved by exactly one, per call. So an exit added
// tomorrow with no counter fails this file without anybody remembering to come
// back to it — and an exit that increments two counters fails it too, which is
// the other half of "exactly one".
//
// ── The disaster it simulates ──────────────────────────────────────────────
// Delete any `leave(...)` in `agentSelectRows` — return `rows` directly, the
// state the two silent exits were in — and the corresponding case here fails
// with the total unmoved.
//
// FREE. The paths exercised below make no model call: three return before the
// client is ever constructed, and the fourth is the `dry` arm, whose whole
// purpose is to run the identical path without calling Anthropic. Nothing here
// needs a key and nothing here can spend.
import { describe, expect, it, afterEach, beforeEach, vi } from "vitest";

// Read once, statically, so the arrangement below can be computed BEFORE the
// arm-scoped re-import. Same constant either way — `caps.ts` has no arm in it.
import { SELECT_COUNT } from "./caps";
import type { InstrumentRow } from "./types";

const row = (id: string): InstrumentRow => ({
  channel: id,
  instrument: `Scheme ${id}`,
  ticket: "EUR 1m",
  usedInField: false,
  fit: "",
  instrumentId: id,
});

/** The arm is read once at module scope, so every arrangement needs a fresh
 *  import — the same discipline `openQuestions.test.ts` follows for its own
 *  arm, and the same reason: a lever that could change mid-run is a lever a
 *  measurement cannot describe. */
async function armed(arm: string, env: Record<string, string> = {}) {
  vi.resetModules();
  process.env.AGENT_SELECT = arm;
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  return import("./agentSelect");
}

const SAVED = { ...process.env };
beforeEach(() => {
  delete process.env.AGENT_SELECT;
  delete process.env.AGENT_SELECT_KEEP;
});
afterEach(() => {
  for (const k of ["AGENT_SELECT", "AGENT_SELECT_KEEP"]) {
    if (SAVED[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED[k];
  }
  vi.resetModules();
});

const total = (exits: Record<string, number>) =>
  Object.values(exits).reduce((a, b) => a + b, 0);

/** One call, and the exits it produced. Asserting on the DELTA rather than on
 *  an absolute count is what makes this independent of anything else in the
 *  process having called the seam. */
async function exitOf(
  mod: typeof import("./agentSelect"),
  rows: InstrumentRow[],
): Promise<{ delta: number; moved: string[] }> {
  const before = mod.agentSelectExits();
  await mod.agentSelectRows(rows, {});
  const after = mod.agentSelectExits();
  return {
    delta: total(after) - total(before),
    moved: Object.keys(after).filter((k) => after[k as keyof typeof after]
      > before[k as keyof typeof before]),
  };
}

describe("every exit from agentSelectRows increments exactly one tally", () => {
  it("the arm being off is an exit and is counted", async () => {
    const mod = await armed("off");
    const { delta, moved } = await exitOf(mod, [row("a"), row("b")]);
    expect(delta).toBe(1);
    expect(moved).toEqual(["armOff"]);
  });

  it("a pool no longer than SELECT_COUNT is counted, not silent", async () => {
    const mod = await armed("rows");
    // Exactly SELECT_COUNT rows: there is nothing for a model to choose
    // between, and this used to return with no trace at all.
    const rows = Array.from({ length: mod.SELECT_COUNT }, (_, i) => row(`r${i}`));
    const { delta, moved } = await exitOf(mod, rows);
    expect(delta).toBe(1);
    expect(moved).toEqual(["poolNotLongerThanCount"]);
  });

  it("a menu no longer than the seats on offer is counted, not silent", async () => {
    // `assist` cuts the frozen leaders off the menu, so a pool that WAS long
    // enough can leave a menu that is not. The second of the two silent exits.
    //
    // Freezing every seat is the arrangement that makes it fire on the shortest
    // qualifying pool, and it reaches no client: this file must not be able to
    // spend on a machine where a key happens to be exported.
    const mod = await armed("assist", { AGENT_SELECT_KEEP: String(SELECT_COUNT) });
    const rows = Array.from({ length: mod.SELECT_COUNT + 1 }, (_, i) => row(`r${i}`));
    const { delta, moved } = await exitOf(mod, rows);
    expect(delta).toBe(1);
    expect(moved).toEqual(["menuNotLongerThanWant"]);
  });

  it("the reversal diagnostic is an exit and is counted", async () => {
    const mod = await armed("reverse");
    const { delta, moved } = await exitOf(mod, [row("a"), row("b"), row("c")]);
    expect(delta).toBe(1);
    expect(moved).toEqual(["reversed"]);
  });

  it("pricing without calling is an exit and is counted", async () => {
    const mod = await armed("dry");
    const rows = Array.from({ length: mod.SELECT_COUNT + 4 }, (_, i) => row(`r${i}`));
    // No description and no answers, so `dry` skips retrieval: this test must
    // reach no store and no network.
    const { delta, moved } = await exitOf(mod, rows);
    expect(delta).toBe(1);
    expect(moved).toEqual(["dryPriced"]);
  });

  it("the tally line names every exit that fired", async () => {
    const mod = await armed("off");
    await mod.agentSelectRows([row("a")], {});
    // Not a snapshot of the sentence: what matters is that a reader is told
    // which exit was taken, which is the whole point of counting them.
    expect(mod.agentSelectExitLine()).toMatch(/arm off/);
  });
});
