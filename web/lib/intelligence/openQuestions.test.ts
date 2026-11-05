// The four properties that stop a wrong judgement from hiding a fund.
//
// A wrongly-judged gate hides a fund from someone who qualifies — the harm
// that hid Innovate UK from every founder who answered the ticket-size
// question. `openFitScorer` is where that could happen, so its neutrality is
// pinned here rather than asserted in a docstring.
//
// Each neutrality test is paired with a POSITIVE case built from the same
// fixture, so none of them can pass vacuously. A test that says "this returns
// 1" is worthless unless something in the same file makes it return something
// else.
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

type Gate = { requirement: string; gateRole?: string };
type Leaf = { id: string; parentId?: string | null; gates?: Gate[] };

// Long enough to clear MIN_SUBSTANTIVE_LEN (60), and deliberately not about
// any country, sector or named scheme.
const R_ADVANCE =
  "The project must advance the technology beyond the current state of the art rather than apply existing methods";
const R_OBJECTIVE =
  "The proposed work must fit the objective of the programme and demonstrate a credible route to deployment";

const leaf = (id: string, parentId: string | null, gates: string[]): Leaf =>
  ({ id, parentId, gates: gates.map((r) => ({ requirement: r, gateRole: "filter" })) });

/** The arm is read at module load, so every arrangement needs a fresh import.
 *  That is the same discipline SECTOR_NEUTRAL_ARM follows: a measurement must
 *  not be able to drift mid-run. */
async function scorerWith(arm: "on" | "off") {
  vi.resetModules();
  process.env.OPEN_QUESTION_ARM = arm;
  const mod = await import("./openQuestions");
  return mod.openFitScorer as typeof import("./openQuestions").openFitScorer;
}

const ORIGINAL = process.env.OPEN_QUESTION_ARM;
beforeEach(() => {
  delete process.env.OPEN_QUESTION_ARM;
});
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.OPEN_QUESTION_ARM;
  else process.env.OPEN_QUESTION_ARM = ORIGINAL;
  vi.resetModules();
});

describe("openFitScorer", () => {
  // Two siblings of one regime; one carries the requirement, the other does
  // not. This is the ONLY arrangement in which the scorer may say anything.
  const siblings: Leaf[] = [
    leaf("a", "regime", [R_ADVANCE]),
    leaf("b", "regime", [R_OBJECTIVE]),
  ];
  const key = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);

  it("SEPARATES two siblings when one meets and the other confidently fails", async () => {
    // The positive control. Everything below asserts a 1; without this, all of
    // it would pass on a scorer that had been deleted.
    const openFitScorer = await scorerWith("on");
    const score = openFitScorer(siblings, [
      { key: key(R_ADVANCE), verdict: "meets" },
      { key: key(R_OBJECTIVE), verdict: "fails" },
    ]);
    expect(score(siblings[0])).toBeGreaterThan(1);
    expect(score(siblings[1])).toBeLessThan(1);
  });

  it("says nothing at all when every verdict is unknown", async () => {
    const openFitScorer = await scorerWith("on");
    const score = openFitScorer(siblings, [
      { key: key(R_ADVANCE), verdict: "unknown" },
      { key: key(R_OBJECTIVE), verdict: "unknown" },
    ]);
    // An absence, not a zero. A judge that cannot tell leaves the ranking
    // exactly as it found it — which is what "prefer unknown to a false block"
    // means once it is a property of the code rather than of a prompt.
    expect(score(siblings[0])).toBe(1);
    expect(score(siblings[1])).toBe(1);
  });

  it("does not demote a sibling whose answer came back unknown", async () => {
    // ── THE TEST THAT WAS MISSING, AND WHY ───────────────────────────────
    // The all-unknown case above passes even on a scorer that counts
    // `unknown` as a failure: every leaf then scores 0, min-max sees no
    // spread, and the group is skipped. Verified by mutating the scorer to
    // `if (v === undefined) continue` — all seven of the other tests stayed
    // green over the exact defect they exist to catch.
    //
    // The defect only shows when ONE sibling settles and another does not,
    // which is the common case in a real round: a founder answers about the
    // fund in front of them and says nothing that settles the other's rule.
    // If silence is scored as a failure, THAT is the fund that gets hidden.
    const openFitScorer = await scorerWith("on");
    const score = openFitScorer(siblings, [
      { key: key(R_ADVANCE), verdict: "meets" },
      { key: key(R_OBJECTIVE), verdict: "unknown" },
    ]);
    // One leaf is settled and the other is not, so there is nothing to
    // compare: the settled one has no counterpart and the group is left
    // alone. Neither may move.
    expect(score(siblings[0])).toBe(1);
    expect(score(siblings[1])).toBe(1);
  });

  it("scores a leaf with no judged requirement at exactly 1", async () => {
    const openFitScorer = await scorerWith("on");
    const three = [...siblings, leaf("c", "regime", ["Something else entirely that nobody was asked about here"])];
    const score = openFitScorer(three, [
      { key: key(R_ADVANCE), verdict: "meets" },
      { key: key(R_OBJECTIVE), verdict: "fails" },
    ]);
    // a and b move; c does not. Not being asked is never a penalty.
    expect(score(three[0])).toBeGreaterThan(1);
    expect(score(three[2])).toBe(1);
  });

  it("never touches a leaf standing alone in its regime", async () => {
    const openFitScorer = await scorerWith("on");
    const alone = [leaf("solo", null, [R_ADVANCE]), leaf("other", "elsewhere", [R_OBJECTIVE])];
    const score = openFitScorer(alone, [
      { key: key(R_ADVANCE), verdict: "fails" },
      { key: key(R_OBJECTIVE), verdict: "fails" },
    ]);
    // Cross-channel promotion is the failure mode that sank the channel prior
    // and the standalone-gate arm. This scorer can only ever reorder siblings,
    // so a fund with no siblings is untouchable by it — even by a judgement
    // that says it fails everything.
    expect(score(alone[0])).toBe(1);
    expect(score(alone[1])).toBe(1);
  });

  it("is inert with the arm off, on the very input that moves it when on", async () => {
    const judgements = [
      { key: key(R_ADVANCE), verdict: "meets" as const },
      { key: key(R_OBJECTIVE), verdict: "fails" as const },
    ];
    const off = await scorerWith("off");
    expect(off(siblings, judgements)(siblings[0])).toBe(1);
    expect(off(siblings, judgements)(siblings[1])).toBe(1);
    // Same fixture, same judgements, arm on: it moves. So the arm is what is
    // being tested, not an empty input.
    const on = await scorerWith("on");
    expect(on(siblings, judgements)(siblings[0])).not.toBe(1);
  });

  it("leaves a ONE-SIDED SPLIT alone, and never promotes the silent sibling", async () => {
    // ── The structural limit, pinned so it cannot be quietly worked around ─
    // A question is chosen because it SPLITS a regime: some siblings demand
    // it, others do not. When the founder's answer settles it, only the
    // demanding side has a judgement — so there is one scored leaf, no
    // comparison, and the group is left exactly as it was. The signal cannot
    // act on the split it was selected for, and wsCD2 measured that: 235 of
    // 235 settled verdicts landed here, EXACT@5 +0.0 at every budget.
    //
    // The obvious unblock — score the SILENT sibling as "not ruled out" — was
    // built as `OPEN_ABSENCE_ARM=pass` and deleted. The same run returned 213
    // confident `fails` against 22 `meets`, so it would have promoted a fund
    // whose rules were merely never encoded, 213 times per 120 briefs. This
    // test is the guard: the silent sibling must never come out above 1.
    const split: Leaf[] = [
      leaf("demands", "regime", [R_ADVANCE]),
      leaf("silent", "regime", ["A rule about something nobody was asked about in this round at all"]),
    ];
    const judgements = [{ key: key(R_ADVANCE), verdict: "fails" as const }];

    const score = await scorerWith("on");
    const s = score(split, judgements);
    expect(s(split[0])).toBe(1);
    expect(s(split[1])).toBe(1);
  });

  it("ignores judgements about a gate that is not a filter", async () => {
    const openFitScorer = await scorerWith("on");
    const obligations: Leaf[] = [
      { id: "a", parentId: "regime", gates: [{ requirement: R_ADVANCE, gateRole: "obligation" }] },
      { id: "b", parentId: "regime", gates: [{ requirement: R_OBJECTIVE, gateRole: "programme_fact" }] },
    ];
    const score = openFitScorer(obligations, [
      { key: key(R_ADVANCE), verdict: "meets" },
      { key: key(R_OBJECTIVE), verdict: "fails" },
    ]);
    // Only a filter may decide who qualifies. An obligation is a real fact
    // about the fund and says nothing about whether this founder is eligible.
    expect(score(obligations[0])).toBe(1);
    expect(score(obligations[1])).toBe(1);
  });

  it("ignores a requirement too short to have been a question", async () => {
    const openFitScorer = await scorerWith("on");
    const short = "Must be an SME";
    const pair: Leaf[] = [leaf("a", "regime", [short]), leaf("b", "regime", [R_OBJECTIVE])];
    const score = openFitScorer(pair, [
      { key: key(short), verdict: "meets" },
      { key: key(R_OBJECTIVE), verdict: "fails" },
    ]);
    // One judged leaf is not a comparison. Below the length floor the text is
    // a restatement of an enum, and the enum path already owns it.
    expect(score(pair[0])).toBe(1);
    expect(score(pair[1])).toBe(1);
  });
});
