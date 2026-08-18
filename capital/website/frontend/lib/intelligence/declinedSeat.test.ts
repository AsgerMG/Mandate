// A DECLINED SEAT IS NOT AN EMPTY SEAT: `atMost` MAY NOT SHORTEN THE TABLE.
//
// ── The question this settles, and why it was worth settling ───────────────
// wsHW proposed flipping `AGENT_SELECT_COUNT_MODE` to `atMost` so the model can
// return fewer than `SELECT_COUNT` picks. The obvious worry about that arm is
// downstream and it is a PRODUCT worry, not a typing one: if the selector
// returns four where `WRITER_CANDIDATE_CAP` is seven, does the founder get a
// four-row brief? Three rows short of a table is a visibly broken page, and a
// lever that can produce one must not be flipped by an environment variable.
//
// It cannot. `agentSelectRows` returns a PERMUTATION of the pool it was handed:
// the chosen rows move to the front in the model's order and every other row
// keeps its shipped relative position behind them. So declining a seat does not
// empty it — it HANDS IT BACK to the empirical ranker, the order that ships
// without any model at all. The founder's table is the same length either way,
// and the rows that fill the declined seats are the free score's own choice.
//
// That is written in three comments in `agentSelect.ts` and `caps.ts` and it was
// pinned by nothing. This repo's dominant failure mode is a comment that is no
// longer true, and this particular comment is the entire safety argument for a
// lever somebody is about to be asked to buy.
//
// ── Why a property and not a case ──────────────────────────────────────────
// The assertion is not "a four-pick reply yields seven rows". It is, for EVERY
// reply length the `atMost` contract admits — 1 to SELECT_COUNT — that the
// output is a permutation of the input AND that the rows the model did not pick
// appear in their original relative order. A count nobody has tried yet is
// covered, and so is a future repair that "helpfully" drops a row it dislikes:
// dropping anything breaks the multiset, reordering the remainder breaks the
// subsequence, and both fail here without anyone remembering this file.
//
// The same sweep runs under `exactly`, where a short reply is a DEFECT rather
// than an answer, because the founder-facing guarantee must not depend on which
// mode is set — the mode decides how the reply is COUNTED, never how much of
// the table survives.
//
// ── The disaster it simulates ──────────────────────────────────────────────
// Change the return in `agentSelectRows` from `[...frozen, ...chosen, ...rest]`
// to `[...frozen, ...chosen]` — the shape somebody reaches for when they read
// "the model returns the list" — and every case here fails with a table shorter
// than the pool, which is exactly the brief a founder would have received.
//
// FREE. `@anthropic-ai/sdk` is a scripted stub, so nothing reaches the network
// and nothing can spend. `demandRetrieval` is stubbed for the same reason.
import { describe, expect, it, afterEach, beforeEach, vi } from "vitest";
import type { InstrumentRow } from "./types";
import { SELECT_COUNT } from "./caps";

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

const answered = (picks: number[]): unknown => ({
  model: "claude-sonnet-5",
  stop_reason: "end_turn",
  content: [{ type: "text", text: JSON.stringify({ picks, unsure: [] }) }],
  usage: { input_tokens: 9000, output_tokens: 40, output_tokens_details: { thinking_tokens: 0 } },
});

/** No `instrumentId`, deliberately: the lookup path maps indices to ids and
 *  skips retrieval when none resolve, so this test needs no corpus. `channel`
 *  is the identity everything below compares on. */
const row = (id: string): InstrumentRow => ({
  channel: id, instrument: `Scheme ${id}`, ticket: "EUR 1m",
  usedInField: false, fit: "", instrumentId: undefined,
});
const POOL = Array.from({ length: 20 }, (_, i) => row(`i${i}`));
const CTX = { country: "DK", sector: "energy_cleantech", description: "A founder." };
const ids = (rows: InstrumentRow[]) => rows.map((r) => r.channel);

async function armed(mode: "exactly" | "atMost") {
  vi.resetModules();
  process.env.AGENT_SELECT = "adviser";
  process.env.ANTHROPIC_API_KEY = "sk-ant-test-not-a-real-key";
  process.env.AGENT_SELECT_COUNT_MODE = mode;
  return import("./agentSelect");
}

const SAVED = { ...process.env };
beforeEach(() => { script.replies = []; });
afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in SAVED)) delete process.env[k];
  Object.assign(process.env, SAVED);
  vi.resetModules();
});

/** Is `sub` a subsequence of `whole`, i.e. did those rows keep their relative
 *  order? This is the half of the guarantee a multiset check cannot see: a
 *  shuffle of the unpicked tail preserves the multiset and destroys the
 *  empirical ranker's order, which is the thing the declined seat reverts to. */
function isSubsequence(sub: string[], whole: string[]): boolean {
  let i = 0;
  for (const x of whole) if (i < sub.length && sub[i] === x) i++;
  return i === sub.length;
}

/** The picks a reply of length `n` names. Spread across the pool rather than
 *  taken off the front so that "kept their shipped order" is a real constraint
 *  on the remainder and not satisfied by the identity permutation. */
const pickList = (n: number) => Array.from({ length: n }, (_, k) => (k * 3) % POOL.length);

describe.each(["exactly", "atMost"] as const)(
  "a reply of any admissible length returns the whole table (%s)", (mode) => {
    for (let n = 1; n <= SELECT_COUNT; n++) {
      it(`${n} pick(s): the founder still receives every row, unpicked ones in shipped order`, async () => {
        const m = await armed(mode);
        m.resetAgentSelectTally();
        const picks = pickList(n);
        script.replies = [answered(picks)];

        const out = await m.agentSelectRows(POOL, CTX);

        // 1. NOTHING IS LOST. The table handed to the writer is the same rows.
        expect(out).toHaveLength(POOL.length);
        expect([...ids(out)].sort()).toEqual([...ids(POOL)].sort());

        // 2. THE PICKS LEAD, IN THE MODEL'S OWN ORDER.
        expect(ids(out).slice(0, n)).toEqual(picks.map((i) => POOL[i].channel));

        // 3. THE DECLINED SEATS REVERT TO THE EMPIRICAL RANKER, IN ITS ORDER.
        //    This is the whole safety argument for `atMost`: the seat is not
        //    empty and it is not re-sorted, it is the order that ships without
        //    any model at all.
        const picked = new Set(picks.map((i) => POOL[i].channel));
        const rest = ids(POOL).filter((c) => !picked.has(c));
        expect(ids(out).slice(n)).toEqual(rest);
        expect(isSubsequence(rest, ids(out))).toBe(true);
      });
    }
  });

describe("the mode changes how a short reply is COUNTED, never what is published", () => {
  it("atMost reports declined seats and exactly reports a short reply, on the same table", async () => {
    const short = pickList(SELECT_COUNT - 3);

    const lenient = await armed("atMost");
    lenient.resetAgentSelectTally();
    script.replies = [answered(short)];
    const outLenient = await lenient.agentSelectRows(POOL, CTX);
    const lineLenient = lenient.agentSelectTallyLine();

    const strict = await armed("exactly");
    strict.resetAgentSelectTally();
    script.replies = [answered(short)];
    const outStrict = await strict.agentSelectRows(POOL, CTX);
    const lineStrict = strict.agentSelectTallyLine();

    // THE PROPERTY: the founder cannot tell the modes apart from the table.
    expect(ids(outLenient)).toEqual(ids(outStrict));
    expect(outLenient).toHaveLength(POOL.length);

    // The REPORT can, and must: three seats declined under the licence, versus
    // one short reply under the contract that forbids it. A run that cannot
    // tell "the model used the licence" from "the model broke the rule" cannot
    // interpret its own headline.
    expect(lineLenient).toContain("DECLINED 3 seat(s) on 1 brief(s)");
    expect(lineLenient).toContain("count=<=");
    expect(lineStrict).toContain("1 short reply");
    expect(lineStrict).not.toContain("DECLINED");
  });
});
