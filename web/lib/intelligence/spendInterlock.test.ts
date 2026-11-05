// A HARNESS THAT DECLARED NO ANTHROPIC KEY CANNOT MAKE A MODEL CALL.
//
// ── The disaster simulated ─────────────────────────────────────────────────
// `AGENT_SELECT` defaulted to `off` until 2026-08-12, so a `scripts/` harness
// could declare `requireCredentials("x", ["DATABASE_URL", "VOYAGE_KEY"])`, load
// a `.env.local` carrying ANTHROPIC_API_KEY, walk into `agentSelectMemoPool` and
// get its argument back by reference. It cost nothing and its contract was true.
//
// The default is `adviser` now. The same harness, unchanged, makes one paid call
// per founder while its own declaration says it is free — and a run of a few
// hundred replayed founders is the size at which that is noticed on an invoice
// rather than in a diff. Eight harnesses in `scripts/` are shaped exactly that
// way today.
//
// ── Why the guard refuses instead of falling back ─────────────────────────
// Every other exit in `agentSelectRows` returns the shipped order, which is
// right for a model that failed. This is a run that should not have STARTED, and
// returning the control's order under the treatment's name is the failure this
// repo has retracted figures for. So it throws, and the case below asserts the
// message names the harness and offers the free arms rather than merely
// refusing.
//
// ── The property, not an enumeration ───────────────────────────────────────
// The subject is the CREDENTIAL CONTRACT, not a list of script names: any run
// whose declared keys omit ANTHROPIC_API_KEY may not call a model, including a
// harness nobody has written yet. `requireCredentials` publishes the
// declaration; this is the one place that reads it.
//
// FREE. Both cases return or throw before a client is constructed. Nothing here
// needs a key and nothing here can spend.
import { describe, expect, it, afterEach, beforeEach, vi } from "vitest";

import { NO_SPEND_ENV, requireCredentials } from "../../scripts/loadEnv";
import type { InstrumentRow } from "./types";

const KEYS = ["AGENT_SELECT", NO_SPEND_ENV, "ANTHROPIC_API_KEY", "DATABASE_URL", "NO_PG"];
const SAVED = { ...process.env };

beforeEach(() => { for (const k of KEYS) delete process.env[k]; });
afterEach(() => {
  for (const k of KEYS) {
    if (SAVED[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED[k];
  }
  vi.resetModules();
});

const row = (id: string): InstrumentRow => ({
  channel: id,
  instrument: `Scheme ${id}`,
  ticket: "EUR 1m",
  usedInField: false,
  fit: "",
  instrumentId: id,
});

/** The arm is read once at module scope, so every arrangement needs a fresh
 *  import. */
async function armed(arm: string) {
  vi.resetModules();
  process.env.AGENT_SELECT = arm;
  return import("./agentSelect");
}

/** A pool long enough to reach the call: every early exit above it is a length
 *  test, so a short pool would prove nothing about the interlock. */
async function longPool(mod: typeof import("./agentSelect")) {
  return Array.from({ length: mod.SELECT_COUNT + 4 }, (_, i) => row(`r${i}`));
}

describe("the ranking seam refuses to spend for a run that declared it would not", () => {
  it("throws when a declared-free harness reaches the call", async () => {
    // Declared exactly as the free harnesses declare themselves. NO_PG keeps
    // this off a database; the declaration is what is under test.
    process.env.NO_PG = "1";
    requireCredentials("a_free_harness", ["DATABASE_URL", "VOYAGE_KEY"]);
    expect(process.env[NO_SPEND_ENV],
      "requireCredentials did not publish the declaration, so nothing downstream "
      + "can read it").toBe("a_free_harness");

    const mod = await armed("adviser");
    await expect(mod.agentSelectRows(await longPool(mod), {}))
      .rejects.toThrow(/a_free_harness/);
    // The fix, in the message. A refusal that does not say which arm to name
    // leaves the person who trips it to guess, and the guesses are all paid.
    await expect(mod.agentSelectRows(await longPool(mod), {}))
      .rejects.toThrow(/AGENT_SELECT=off/);
  });

  it("does not throw once the harness declares the key", async () => {
    // The positive control. Without it the case above would pass on a seam that
    // threw for some unrelated reason — a missing pool, a bad import — and the
    // interlock would never have been tested at all.
    //
    // With no ANTHROPIC_API_KEY in the environment the lazy client throws and
    // `agentSelectRows` returns the shipped order, which is its documented
    // fallback. What must NOT happen is the refusal above.
    process.env.NO_PG = "1";
    process.env.ANTHROPIC_API_KEY = "not-a-real-key";
    requireCredentials("a_paid_harness",
      ["DATABASE_URL", "VOYAGE_KEY", "ANTHROPIC_API_KEY"]);
    expect(process.env[NO_SPEND_ENV],
      "a harness that declared the key was still marked as free").toBeUndefined();

    const mod = await armed("off");
    const rows = await longPool(mod);
    await expect(mod.agentSelectRows(rows, {})).resolves.toBe(rows);
  });
});
