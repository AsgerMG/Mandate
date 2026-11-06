// The ranker's question turn, checked where it can be checked for free.
//
// Two halves, and they are tested apart on purpose. `separatingDemands` needs
// the corpus and is exercised by scripts/_wsej_asks.ts over twelve real pools;
// what is testable hermetically is the CONTRACT ENFORCEMENT — the part that
// decides whether what a model returned may be shown to a founder. That is the
// half a bad model reply reaches, and it is the half that must hold when the
// reply is wrong rather than when it is right.
import { describe, expect, it } from "vitest";

import {
  checkAskedQuestions, liftedRun, namesACandidate, RANKER_ASK_RULE_IDS,
  type OfferedDemand,
} from "./rankerAskChecks";
import { FIELD_ENUM_HINTS } from "./types";

const FIELD = "consortium";
const OPTIONS = FIELD_ENUM_HINTS[FIELD].options;

const demand: OfferedDemand = {
  ref: "ranker::consortium",
  field: FIELD,
  requirement:
    "A consortium must include at least three independent legal entities " +
    "established in three different countries.",
  instrumentId: "inst_a",
  instrumentName: "Programme A",
  gateKey: "consortium_required",
  moves: [0, 3],
};

const candidates = [
  { instrumentId: "inst_a", name: "Programme A", rank: 1 },
  { instrumentId: "inst_b", name: "Hydrogen Valley Accelerator", rank: 2 },
];

const good = (over: Record<string, unknown> = {}) => ({
  ref: demand.ref,
  question: "Could you run this project with two or more partners, or only alone?",
  options: OPTIONS.map((o) => ({ value: o.value, label: o.label })),
  moves: [0],
  ...over,
});

describe("checkAskedQuestions", () => {
  it("keeps a question that carries its demand, its movers and the whole answer space", () => {
    const { kept, violations } = checkAskedQuestions([good()], [demand], candidates, 4);
    expect(violations).toEqual([]);
    expect(kept).toHaveLength(1);
    expect(kept[0].field).toBe(FIELD);
    // The citation rides along, or the founder is shown a question with nothing
    // behind it.
    expect(kept[0].quote).toBe(demand.requirement);
    expect(kept[0].instrumentName).toBe("Programme A");
  });

  it("RA-1: drops a question whose reference was never offered", () => {
    const { kept, violations } = checkAskedQuestions(
      [good({ ref: "ranker::region" })], [demand], candidates, 4);
    expect(kept).toEqual([]);
    expect(violations[0].ruleId).toBe("RA-1");
  });

  it("RA-1: asks one field once, however many demands quote it", () => {
    const { kept } = checkAskedQuestions([good(), good()], [demand], candidates, 4);
    expect(kept).toHaveLength(1);
  });

  it("RA-2: drops a question that names no candidate its own demand moves", () => {
    const { kept, violations } = checkAskedQuestions(
      [good({ moves: [1] })], [demand], candidates, 4);
    expect(kept).toEqual([]);
    expect(violations[0].ruleId).toBe("RA-2");
  });

  it("RA-3: drops a question whose options do not cover the field's answer space", () => {
    const { kept, violations } = checkAskedQuestions(
      [good({ options: [{ value: OPTIONS[0].value, label: "Yes" }] })],
      [demand], candidates, 4);
    expect(kept).toEqual([]);
    expect(violations[0].ruleId).toBe("RA-3");
  });

  it("RA-3: drops a question whose option was lifted out of the requirement", () => {
    const options = OPTIONS.map((o, i) => ({
      value: o.value,
      label: i === 0 ? "three independent legal entities, yes" : o.label,
    }));
    const { kept, violations } = checkAskedQuestions(
      [good({ options })], [demand], candidates, 4);
    expect(kept).toEqual([]);
    expect(violations[0].ruleId).toBe("RA-3");
  });

  it("RA-B1: drops a question that identifies a candidate", () => {
    const { kept, violations } = checkAskedQuestions(
      [good({ question: "Would you join the Hydrogen Valley Accelerator consortium?" })],
      [demand], candidates, 4);
    expect(kept).toEqual([]);
    expect(violations[0].ruleId).toBe("RA-B1");
  });

  it("an empty reply is an answer, not a failure", () => {
    const { kept, violations } = checkAskedQuestions([], [demand], candidates, 4);
    expect(kept).toEqual([]);
    expect(violations).toEqual([]);
  });

  it("the cap is enforced here rather than asked for in the prompt", () => {
    const second: OfferedDemand = { ...demand, ref: "ranker::region", field: "region" };
    const { kept } = checkAskedQuestions([good(), good({ ref: second.ref })],
      [demand, second], candidates, 1);
    expect(kept).toHaveLength(1);
  });
});

describe("the tests behind the rules", () => {
  it("liftedRun finds a four-word run and tolerates a shorter overlap", () => {
    expect(liftedRun("we would use three independent legal entities", demand.requirement))
      .toBe("three independent legal entities");
    expect(liftedRun("three independent partners", demand.requirement)).toBeNull();
  });

  it("namesACandidate works off the menu, so an unseen scheme is covered", () => {
    expect(namesACandidate("do you work with the Hydrogen Valley people?",
      candidates.map((c) => c.name))).toBe("Hydrogen Valley Accelerator");
    // An ordinary word that happens to sit in a scheme's name is not a name.
    expect(namesACandidate("what does your project build?",
      candidates.map((c) => c.name))).toBeNull();
  });

  it("every rule this module claims to enforce is one it decides", () => {
    // The register in check_contracts.ts is only as good as this list, and a
    // rule id added here without a branch above would go green everywhere.
    expect([...RANKER_ASK_RULE_IDS].sort()).toEqual(["RA-1", "RA-2", "RA-3", "RA-B1"]);
  });
});
