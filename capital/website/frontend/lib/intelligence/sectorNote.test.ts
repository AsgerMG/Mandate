// THE PROPOSED LEGEND LINE IS OFF, AND OFF MEANS THE PROMPT IS UNCHANGED.
//
// `AGENT_SELECT_SECTOR_NOTE` is wsIB's proposal and it changes the bytes a paid
// model reads, so the thing that has to be pinned is not what `explain` says —
// it is that the DEFAULT sends exactly what was sent before. A lever whose
// "off" setting alters the prompt silently invalidates every tape on disk and
// every arm measured against them, and this file's own header calls that the
// defect its levers exist to prevent.
//
// The test captures the real prompt out of the real seam under both settings
// and compares them, so it cannot be satisfied by a ternary that looks right.
import { describe, expect, it, afterEach, beforeEach, vi } from "vitest";
import type { InstrumentRow } from "./types";

const script = vi.hoisted(() => ({
  replies: [] as unknown[], sent: [] as string[],
}));

vi.mock("@anthropic-ai/sdk", () => {
  class FakeAnthropic {
    messages = {
      create: async (body: { messages?: { content?: unknown }[] }): Promise<unknown> => {
        const first = body?.messages?.[0]?.content;
        script.sent.push(typeof first === "string" ? first : JSON.stringify(first));
        const next = script.replies.shift();
        if (!next) throw new Error("the seam made more API calls than the test scripted");
        return next;
      },
    };
  }
  return { default: FakeAnthropic };
});
vi.mock("./demandRetrieval", () => ({ retrieveDemands: async () => [] }));

const answered = (picks: number[]): unknown => ({
  model: "claude-sonnet-5",
  stop_reason: "end_turn",
  content: [{ type: "text", text: JSON.stringify({ picks, unsure: [] }) }],
  usage: { input_tokens: 9000, output_tokens: 40, output_tokens_details: { thinking_tokens: 0 } },
});

const row = (id: string): InstrumentRow => ({
  channel: id, instrument: `Scheme ${id}`, ticket: "EUR 1m",
  usedInField: false, fit: "", instrumentId: undefined,
});
const POOL = Array.from({ length: 20 }, (_, i) => row(`i${i}`));
const CTX = { country: "DK", sector: "energy_cleantech", description: "A founder." };

const SAVED = { ...process.env };
beforeEach(() => { script.replies = []; script.sent = []; });
afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in SAVED)) delete process.env[k];
  Object.assign(process.env, SAVED);
  vi.resetModules();
});

async function promptUnder(note?: string): Promise<string> {
  vi.resetModules();
  // Reset the capture, not just the replies: two calls in one test would
  // otherwise both read the FIRST prompt and the comparison would pass by
  // comparing a string to itself.
  script.sent = [];
  process.env.AGENT_SELECT = "adviser";
  process.env.ANTHROPIC_API_KEY = "sk-ant-test-not-a-real-key";
  if (note === undefined) delete process.env.AGENT_SELECT_SECTOR_NOTE;
  else process.env.AGENT_SELECT_SECTOR_NOTE = note;
  const mod = await import("./agentSelect");
  // The seam may make a second call (the adaptive round). Script enough
  // replies for either shape and grade the FIRST prompt, which is the one the
  // legend lives in.
  script.replies = [answered([0, 1, 2, 3, 4, 5, 6]), answered([0, 1, 2, 3, 4, 5, 6])];
  await mod.agentSelectRows(POOL, CTX);
  expect(script.sent.length).toBeGreaterThan(0);
  // The untrusted-description delimiter carries a fresh random nonce on every
  // request, by design. It is the one byte-range that is SUPPOSED to differ
  // between two identical prompts, so it is normalised out rather than the
  // comparison being weakened to a substring check.
  return script.sent[0].replace(/description id="[a-z0-9]+"/g, 'description id="NONCE"');
}

describe("AGENT_SELECT_SECTOR_NOTE", () => {
  it("defaults to off", async () => {
    const mod = await import("./agentSelect");
    expect(mod.SECTOR_NOTE).toBe("off");
  });

  it("throws on a value it does not know, so a typo cannot read as off", async () => {
    vi.resetModules();
    process.env.AGENT_SELECT_SECTOR_NOTE = "expalin";
    await expect(import("./agentSelect")).rejects.toThrow(/AGENT_SELECT_SECTOR_NOTE/);
  });

  it("sends a byte-identical prompt when unset and when explicitly off", async () => {
    const unset = await promptUnder(undefined);
    const off = await promptUnder("off");
    expect(off).toBe(unset);
  });

  it("adds the legend line ONLY under explain, and changes nothing else", async () => {
    const off = await promptUnder("off");
    const on = await promptUnder("explain");
    expect(off).not.toContain("largest single sector");
    expect(on).toContain("largest single sector");
    // The whole of the difference is one contiguous insertion: strip it and the
    // two prompts are the same bytes. Anything else moving is a regression that
    // a substring assertion would never see.
    const added = on.length - off.length;
    expect(added).toBeGreaterThan(0);
    const at = on.indexOf("\n  * where a row says");
    expect(at).toBeGreaterThan(0);
    expect(on.slice(0, at) + on.slice(at + added)).toBe(off);
  });
});
