// `RANKER_ASKS=on` WITH `AGENT_SELECT=off` IS REFUSED AT IMPORT.
//
// ── The disaster simulated ─────────────────────────────────────────────────
// The cell is set the way a sweep would set it: the asking stage on, the
// ranking stage it asks FOR turned off. (Until wsGB that cell was also reached
// by OMISSION, because `off` was the default; it no longer is, and the case
// below that used to assert a throw on an unset variable now asserts the
// property that survived the flip instead.) Nothing about that combination
// errors on its own — the questions get written, the founder answers them, the
// answers land in `EligibilityAnswers` and the arithmetic scorers read them.
// What comes out is a real number for the deterministic ranker given six extra
// answers, published under the name of an arm whose model was never in the
// seat. This repo has retracted a figure for exactly that shape once already.
//
// So the refusal is asserted here rather than left to a reader of the module:
// delete the `throw` in `rankerAsks.ts` and this file goes red with "the
// combination was accepted", which is the only evidence that the guard is a
// guard.
//
// ── Why it must be AT IMPORT, and why that shape is tested ────────────────
// The asker calls Anthropic once per founder. A refusal at the end of a run
// costs the whole run; a refusal at import costs nothing. `check_contracts` and
// its siblings cannot catch it either — they run in their own process with
// their own environment, so they grade the defaults while the swept flag grades
// something else. Same argument, same shape, as the funnel invariant at the
// bottom of `caps.ts`.
//
// FREE. Every case here fails or succeeds during module evaluation. No client
// is constructed, no request is made, and nothing can spend.
import { describe, expect, it, afterEach, beforeEach, vi } from "vitest";

const KEYS = ["RANKER_ASKS", "AGENT_SELECT"] as const;
const SAVED = { ...process.env };

beforeEach(() => {
  for (const k of KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of KEYS) {
    if (SAVED[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED[k];
  }
  vi.resetModules();
});

/** Import the module under one setting of the two arms. Fresh every time,
 *  because both are read once at module scope — which is the property that
 *  makes the refusal possible at all. */
async function importUnder(env: Record<string, string>): Promise<Error | null> {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  try {
    await import("./rankerAsks");
    return null;
  } catch (err) {
    return err as Error;
  }
}

describe("the asking stage refuses to run without the stage it asks for", () => {
  it("throws when the ranker asks and nothing ranks", async () => {
    const err = await importUnder({ RANKER_ASKS: "on", AGENT_SELECT: "off" });
    expect(err, "the combination was accepted").not.toBeNull();
    // The reason, not just the refusal. A throw whose message does not say what
    // the run would have measured leaves the person who trips it to guess.
    expect(err!.message).toMatch(/RANKER_ASKS is "on" and AGENT_SELECT is "off"/);
    expect(err!.message).toMatch(/deterministic ranker published under the ranker-asks name/);
  });

  it("reads the RESOLVED arm, not the raw variable — omission is not a third state", async () => {
    // ── THE PREMISE THIS USED TO REST ON IS GONE (wsGB) ───────────────────
    // It read: "nobody sets the ranker off, they just do not set it at all. The
    // default IS off, so this is the same cell reached by omission" — and it
    // asserted a THROW. `AGENT_SELECT` now defaults to `adviser`, so an unset
    // variable is a ranking arm and refusing it would refuse the shipped
    // configuration.
    //
    // What the case is FOR survives the flip, and it is not the throw: an unset
    // `AGENT_SELECT` must behave exactly as the same arm spelled out. Written
    // against `AGENT_SELECT_ARM` rather than against a literal, so it states the
    // property for whatever the default becomes next and cannot go stale the way
    // its predecessor did.
    vi.resetModules();
    const { AGENT_SELECT_ARM } = await import("./caps");
    const omitted = await importUnder({ RANKER_ASKS: "on" });
    const spelled = await importUnder({ RANKER_ASKS: "on", AGENT_SELECT: AGENT_SELECT_ARM });
    expect(
      omitted === null,
      `omitting AGENT_SELECT behaved differently from spelling out its default `
      + `("${AGENT_SELECT_ARM}"): the interlock is reading the environment rather `
      + `than the resolved arm`,
    ).toBe(spelled === null);
  });

  it("does not throw with both off, which is the control arm", async () => {
    // The positive control. Without it, the assertions above would pass on a
    // module that threw for some unrelated reason — a missing key, a bad
    // import — and the refusal would never have been tested at all.
    expect(await importUnder({ RANKER_ASKS: "off", AGENT_SELECT: "off" })).toBeNull();
  });

  it("does not throw when both are on, which is what ships plus the asker", async () => {
    expect(await importUnder({ RANKER_ASKS: "on", AGENT_SELECT: "adviser" })).toBeNull();
  });

  it("allows the two diagnostics, because neither can be read as a ranking", async () => {
    // `dry` is how the combined arm's prompt is priced without calling
    // Anthropic, and `reverse` is how the pool's order is shown to reach the
    // memo. Refusing them would close the only route by which this arm gets
    // read for free — and neither produces a table anybody could mistake for a
    // result.
    expect(await importUnder({ RANKER_ASKS: "on", AGENT_SELECT: "dry" })).toBeNull();
  });
});
