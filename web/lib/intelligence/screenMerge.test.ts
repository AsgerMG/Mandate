// NO SCREEN PRESENTS TWO QUESTIONS KEYED ON ONE INTAKE FIELD (Q-16).
//
// ── The disaster simulated ─────────────────────────────────────────────────
// The merger is handed two questions on one field — which is exactly what the
// two stages that write this screen produce, because they run in one
// `Promise.all` and cannot see each other's output. If the merge stops
// deduping, the founder is asked for one fact twice, answers it twice, and one
// of the two answers is silently overwritten by whichever loop ran last.
//
// The second half of the file is the same disaster handed to `checkScreenFields`
// directly, so the CHECK is proven able to fire and not only the merge. A
// property enforced by code and asserted by a check that has never been shown
// to go red is one mechanism, not two.
//
// ── And the harm this whole module exists for ──────────────────────────────
// The last case is the one that was live: one ranker question replacing six
// planner gate-closers. It asserts the planner's questions SURVIVE, because
// their answers reach the encoded gates and the arithmetic scorers, and losing
// them removes an answer surface from the founder.
import { describe, expect, it } from "vitest";

import { checkScreenFields } from "./questionChecks";
import { mergeGenericQuestions } from "./screenMerge";
import type { GroundedQuestion } from "./types";

const q = (field: string, question: string, ref?: string): GroundedQuestion =>
  ({ field, question, options: [{ value: "a", label: "A" }], ...(ref ? { ref } : {}) });

describe("mergeGenericQuestions", () => {
  it("collapses two questions on one field to one", () => {
    const merged = mergeGenericQuestions(
      [q("organisationType", "How is the company set up?", "ranker::organisationType")],
      [q("organisationType", "What legal form does the company take?")],
      6);
    expect(merged).toHaveLength(1);
    expect(checkScreenFields(merged)).toEqual([]);
  });

  it("keeps the ranker's wording when both stages ask about one field", () => {
    // Its question was chosen by simulating every admissible answer against
    // THIS founder's candidates. That is the more specific claim, so it keeps
    // the slot.
    const merged = mergeGenericQuestions(
      [q("organisationType", "RANKER", "ranker::organisationType")],
      [q("organisationType", "PLANNER")],
      6);
    expect(merged[0].question).toBe("RANKER");
    expect(merged[0].ref).toBe("ranker::organisationType");
  });

  it("does NOT discard the planner's other questions", () => {
    // The live harm, in one assertion. One ranker question used to replace the
    // planner's whole half.
    const merged = mergeGenericQuestions(
      [q("organisationType", "RANKER", "ranker::organisationType")],
      [q("region", "Where?"), q("sector", "What?"), q("stage", "How far?")],
      6);
    expect(merged.map((m) => m.field))
      .toEqual(["organisationType", "region", "sector", "stage"]);
  });

  it("drops a question with no field, because its answer has nowhere to land", () => {
    expect(mergeGenericQuestions([], [q("", "no home")], 6)).toEqual([]);
  });

  it("is a NO-OP on the screen that ships, which is the arm-off path", () => {
    // The shipped configuration has no ranker questions, and this merge now
    // stands between the planner and the founder on every single call. So the
    // claim that the arm-off screen is unchanged is a claim about THIS
    // function, and it is asserted rather than assumed.
    //
    // It holds because each of the three things the merge does has nothing to
    // do upstream: the planner has already deduped on `ref`, every question it
    // returns carries a field drawn from `genericFields`, and `genericFields`
    // is itself sliced to the same cap. Same objects, same order — identity,
    // not equality, because a merge that rebuilt the objects would drop `stake`
    // and the panel renders it.
    const planner = [q("region", "Where?"), q("sector", "What?"), q("stage", "How far?")];
    const merged = mergeGenericQuestions([], planner, 6);
    expect(merged).toHaveLength(planner.length);
    merged.forEach((m, i) => expect(m).toBe(planner[i]));
  });

  it("applies the screen's budget last, so the cut falls on the least specific", () => {
    const merged = mergeGenericQuestions(
      [q("a", "ranker a")],
      [q("b", "b"), q("c", "c"), q("d", "d")],
      2);
    expect(merged.map((m) => m.field)).toEqual(["a", "b"]);
  });
});

describe("checkScreenFields decides Q-16", () => {
  it("fires when one field carries two questions", () => {
    const v = checkScreenFields([
      q("organisationType", "How is the company set up?"),
      q("organisationType", "What legal form does the company take?"),
    ]);
    expect(v.map((x) => x.ruleId)).toEqual(["Q-16"]);
    expect(v[0].detail).toContain("organisationType");
  });

  it("is silent on a screen where every field is asked once", () => {
    // The positive control. Without it, the assertion above would pass on a
    // check that had been deleted.
    expect(checkScreenFields([q("a", "one"), q("b", "two")])).toEqual([]);
  });

  it("says nothing about a question with no field, which is a different rule", () => {
    expect(checkScreenFields([{ question: "x" }, { question: "y" }])).toEqual([]);
  });
});
