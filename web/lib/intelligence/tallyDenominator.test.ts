// THE TRUNCATION COUNTER'S DENOMINATOR, PINNED BY DRIVING THE SEAM.
//
// ── The failure this pins ──────────────────────────────────────────────────
// `truncated`, `thoughtOn` and `toolAsked` are incremented inside `ask()`, once
// per API CALL. `calls` is incremented in `agentSelectRows`, once per FOUNDER.
// The published tally line divided the first by the second and printed
// `thought on 210/148 call(s)` — a ratio above 1, which is not a rounding error
// but a rate that cannot be read at all.
//
// It mattered in exactly one direction. wsGA's `4 CUT OFF at max_tokens` was
// 4-in-210 and read as 4-in-148, a 42% overstatement of the truncation rate on
// the number whose being non-zero VOIDED the run. wsGS fixed the arithmetic;
// nothing tested it, and a truncation counter nobody can check is worse than
// none, because the next run clears its own abort condition on its say-so.
//
// ── Why this test and not a reading of the code ────────────────────────────
// The brief for wsHI asked that the fix be proven "by a means that does not
// rely on reading the same code again". So this drives `agentSelectRows` with a
// scripted client and reads the LINE — the artefact a pre-registration is
// judged on — rather than the counters. If someone swaps the denominator back,
// no comment protects them.
//
// ── The case nobody had seen ───────────────────────────────────────────────
// One founder, two API calls, one of them truncated. The old code prints
// `1/1 CUT OFF` — 100%, from a run that truncated half its calls. The new code
// prints `1/2`. Both numbers are wrong about something if the denominator is
// wrong, and only a second API call on one founder separates them: a test with
// one call per founder passes under both.
//
// FREE. `@anthropic-ai/sdk` is replaced by a scripted stub, so nothing can
// reach the network and nothing can spend. `demandRetrieval` is stubbed for the
// same reason — it is the only other module on this path that opens anything.
import { describe, expect, it, afterEach, beforeEach, vi } from "vitest";
import type { InstrumentRow } from "./types";

/** The replies the fake client will hand back, in order. Hoisted so the
 *  `vi.mock` factory below — which vitest lifts above the imports — can close
 *  over it. */
const script = vi.hoisted(() => ({ replies: [] as unknown[] }));

vi.mock("@anthropic-ai/sdk", () => {
  class FakeAnthropic {
    messages = {
      create: async (): Promise<unknown> => {
        const next = script.replies.shift();
        if (!next) throw new Error("the seam made more API calls than the test scripted");
        return next;
      },
    };
  }
  return { default: FakeAnthropic };
});
vi.mock("./demandRetrieval", () => ({ retrieveDemands: async () => [] }));

/** A reply that parses to picks. `stop_reason` is what the counter reads. */
const answered = (picks: number[]): unknown => ({
  model: "claude-sonnet-5",
  stop_reason: "end_turn",
  content: [{ type: "text", text: JSON.stringify({ picks, unsure: [] }) }],
  usage: { input_tokens: 9000, output_tokens: 40, output_tokens_details: { thinking_tokens: 5 } },
});
/** A reply the API cut off at max_tokens: no text block at all, which is
 *  exactly why it is indistinguishable downstream from a model that declined
 *  and exactly why the counter has to exist. */
const truncated = (): unknown => ({
  model: "claude-sonnet-5",
  stop_reason: "max_tokens",
  content: [{ type: "thinking", thinking: "", signature: "x" }],
  usage: {
    input_tokens: 9000, output_tokens: 34816,
    output_tokens_details: { thinking_tokens: 34816 },
  },
});
/** A reply asking for the lookup tool — the ONLY way to make one founder cost
 *  two API calls without retrieval returning anything. */
const askedForTool = (picks: number[]): unknown => ({
  model: "claude-sonnet-5",
  stop_reason: "tool_use",
  content: [
    { type: "text", text: JSON.stringify({ picks, unsure: [] }) },
    { type: "tool_use", id: "toolu_1", name: "lookup_requirements", input: { indices: [0, 1] } },
  ],
  usage: { input_tokens: 9000, output_tokens: 60, output_tokens_details: { thinking_tokens: 9 } },
});

/** Rows with NO `instrumentId`, deliberately: the tool path maps indices to ids
 *  and skips retrieval entirely when none resolve, so round two fires on the
 *  model's request alone and this test needs no corpus. */
const row = (id: string): InstrumentRow => ({
  channel: id, instrument: `Scheme ${id}`, ticket: "EUR 1m",
  usedInField: false, fit: "", instrumentId: undefined,
});
const POOL = Array.from({ length: 12 }, (_, i) => row(`i${i}`));
const CTX = { country: "DK", sector: "energy_cleantech", description: "A founder." };

async function armed(env: Record<string, string>) {
  vi.resetModules();
  process.env.AGENT_SELECT = "adviser";
  process.env.ANTHROPIC_API_KEY = "sk-ant-test-not-a-real-key";
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  return import("./agentSelect");
}

const SAVED = { ...process.env };
beforeEach(() => { script.replies = []; });
afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in SAVED)) delete process.env[k];
  Object.assign(process.env, SAVED);
  vi.resetModules();
});

/** `N/M CUT OFF at max_tokens`, read off the line the way a reader would. */
function cutOff(line: string): { n: number; of: number } {
  const m = line.match(/(\d+)\/(\d+) CUT OFF at max_tokens/);
  if (!m) throw new Error(`the tally line states no truncation ratio: ${line}`);
  return { n: Number(m[1]), of: Number(m[2]) };
}

describe("the truncation counter's denominator", () => {
  it("reports per API CALL, not per founder, when one founder costs two calls", async () => {
    const m = await armed({ AGENT_SELECT_UNSURE: "tool", AGENT_SELECT_EFFORT: "medium" });
    m.resetAgentSelectTally();
    // Round one asks for the tool; round two is cut off at max_tokens.
    script.replies = [askedForTool([0, 1, 2, 3, 4, 5, 6]), truncated()];

    await m.agentSelectRows(POOL, CTX);
    const line = m.agentSelectTallyLine();

    expect(line).toContain("2 API call(s) over 1 brief(s)");
    // ── THE ASSERTION THE OLD CODE FAILS ──────────────────────────────────
    // One truncation out of two API calls. Over `calls` it reads 1/1 — a
    // hundred per cent — and an arm that fires the seam twice for one founder
    // would report a truncation rate double its real one.
    expect(cutOff(line)).toEqual({ n: 1, of: 2 });
    expect(line).not.toContain("1/1 CUT OFF");
  });

  it("does not report zero when a run truncates once", async () => {
    const m = await armed({ AGENT_SELECT_EFFORT: "medium" });
    m.resetAgentSelectTally();
    // Three founders, one API call each, the middle one cut off.
    script.replies = [answered([0, 1, 2, 3, 4, 5, 6]), truncated(), answered([1, 2, 3, 4, 5, 6, 7])];

    for (let i = 0; i < 3; i++) await m.agentSelectRows(POOL, CTX);
    const line = m.agentSelectTallyLine();

    expect(cutOff(line)).toEqual({ n: 1, of: 3 });
    expect(line).toContain("3 API call(s) over 3 brief(s)");
  });

  it("reports a clean run as zero over the calls it actually made", async () => {
    const m = await armed({ AGENT_SELECT_UNSURE: "tool", AGENT_SELECT_EFFORT: "medium" });
    m.resetAgentSelectTally();
    // Two founders: one costs two calls, one costs one. Three calls, no cut.
    script.replies = [
      askedForTool([0, 1, 2, 3, 4, 5, 6]), answered([0, 1, 2, 3, 4, 5, 6]),
      answered([2, 3, 4, 5, 6, 7, 8]),
    ];

    for (let i = 0; i < 2; i++) await m.agentSelectRows(POOL, CTX);
    const line = m.agentSelectTallyLine();

    expect(cutOff(line)).toEqual({ n: 0, of: 3 });
    expect(line).toContain("3 API call(s) over 2 brief(s)");
  });

  it("puts every per-call counter over the same denominator", async () => {
    const m = await armed({ AGENT_SELECT_UNSURE: "tool", AGENT_SELECT_EFFORT: "medium" });
    m.resetAgentSelectTally();
    script.replies = [askedForTool([0, 1, 2, 3, 4, 5, 6]), answered([0, 1, 2, 3, 4, 5, 6])];

    await m.agentSelectRows(POOL, CTX);
    const line = m.agentSelectTallyLine();

    // THE PROPERTY, not a list of counters: every `x/y` ratio on the line whose
    // numerator is incremented inside `ask()` shares one denominator. Stated
    // this way so a counter added tomorrow is covered without anyone
    // remembering to come back here.
    const ratios = [...line.matchAll(/(\d+)\/(\d+) (?:API call|CUT OFF)/g)];
    const denominators = new Set(ratios.map((r) => r[2]));
    expect(ratios.length).toBeGreaterThanOrEqual(2);
    expect(denominators).toEqual(new Set(["2"]));
    // …and none of them may exceed it, which is the shape of the impossible
    // `thought on 210/148` the old line printed.
    for (const r of ratios) expect(Number(r[1])).toBeLessThanOrEqual(Number(r[2]));
  });
});

describe("the menu the line reports", () => {
  it("states the rows actually shown, not the depth lever", async () => {
    const m = await armed({ AGENT_SELECT_EFFORT: "medium", AGENT_SELECT_DEPTH: "40" });
    m.resetAgentSelectTally();
    script.replies = [answered([0, 1, 2, 3, 4, 5, 6])];

    await m.agentSelectRows(POOL, CTX);          // a 12-row pool, a depth of 40
    const line = m.agentSelectTallyLine();

    // The exact confusion that resized a ceiling on the wrong evidence: the
    // lever says 40, the model saw 12, and only one of those is a measurement.
    expect(line).toContain("menu=12 rows");
    expect(line).toContain("depth=40");
  });

  it("reports a range when the menu varies between founders", async () => {
    const m = await armed({ AGENT_SELECT_EFFORT: "medium" });
    m.resetAgentSelectTally();
    script.replies = [answered([0, 1, 2, 3, 4, 5, 6]), answered([0, 1, 2, 3, 4, 5, 6])];

    await m.agentSelectRows(POOL, CTX);              // 12 rows
    await m.agentSelectRows(POOL.slice(0, 9), CTX);  // 9 rows — a short pool

    // The MAX is what a ceiling has to survive, so both ends are printed and
    // the guard reads the upper one.
    expect(m.agentSelectTallyLine()).toContain("menu=9-12 rows");
  });
});
