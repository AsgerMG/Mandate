import { describe, expect, it } from "vitest";
import { gateFitScorer } from "./shortlist";
import type { DbGate, DbInstrument } from "./corpus";

/**
 * `gateFitScorer` is a WITHIN-REGIME tie-breaker, and a fund with no siblings
 * is therefore untouched by its own rules. WS-AU spent a workstream encoding
 * 596 gates onto 88 parent-less Spanish calls and measured bit-identical
 * recall on three seeds; WS-AW measured the two alternatives (score across the
 * channel pool, add an absolute term) and both are flat or worse.
 *
 * These tests exist so that conclusion is a PROPERTY of the code rather than a
 * paragraph in a finding nobody reads. Fixtures are built by hand: a test that
 * breaks on a corpus refresh teaches people to ignore it.
 */
const gate = (allowed: string[], id = "g1"): DbGate => ({
  id, gateFamily: "G1", gateRole: "filter", intakeFieldResolved: undefined,
  requirement: "A documented requirement", value: "",
  valueSpec: { op: "in", field: "sector", allowed } as never,
  intakeField: "none", quote: "", source: { file: "", locator: "" },
  verificationLevel: "llm_cited", verified: false,
} as DbGate);

const leaf = (id: string, parentId: string | null, gates: DbGate[]): DbInstrument => ({
  id, parentId, name: id, country: "ES", capitalType: "grant",
  isFramework: false, eventCount: 10, companyCount: 5, totalEur: 1e6,
  sourceFamilyBucket: "state_aid_satr", sampleProjectTitles: null,
  administeringBody: null, administeringBodyShare: null, lastYear: 2026, gates,
} as DbInstrument);

const answers = { sector: "software_data_ai" } as never;

describe("a fund with no siblings", () => {
  // THE PROPERTY, stated so an unseen case is decided by it rather than by a
  // list: a leaf that is the only member of its regime is scored 1 whatever
  // its own rules say, because this function ranks leaves against SIBLINGS and
  // a group of one has none. Anything else here is a channel-wide prior.
  it("scores 1 whether it passes its rules or fails them", () => {
    const passes = leaf("alone_pass", null, [gate(["software_data_ai"])]);
    const fails = leaf("alone_fail", null, [gate(["agrifood"])]);
    // Scored together, so this cannot pass merely because the pool was empty:
    // two standalone leaves whose fit differs as much as it possibly can.
    const score = gateFitScorer([passes, fails], answers);
    expect(score(passes)).toBe(1);
    expect(score(fails)).toBe(1);
  });

  // The same leaves in a channel that also holds a real regime: the regime is
  // reordered and the standalone leaves are still untouched. This is the case
  // a Spanish founder actually gets -- 88 parent-less convocatorias sharing
  // `state_aid_satr` with the sibling-grouped leaves that answer the query.
  it("is untouched even when siblings elsewhere in the channel ARE ranked", () => {
    const alone = leaf("alone_fail", null, [gate(["agrifood"])]);
    const sibA = leaf("sib_pass", "regime_1", [gate(["software_data_ai"])]);
    const sibB = leaf("sib_fail", "regime_1", [gate(["agrifood"])]);
    const score = gateFitScorer([alone, sibA, sibB], answers);
    expect(score(alone)).toBe(1);
    expect(score(sibA)).toBeGreaterThan(1);
    expect(score(sibB)).toBeLessThan(1);
  });

  // A leaf with NOTHING encoded is also 1, and it must not be confused with
  // the above: absence of evidence is not evidence of a bad fit, and the two
  // reasons for scoring 1 are different reasons.
  it("shares its score of 1 with a leaf that has no rules at all", () => {
    const unencoded = leaf("sib_none", "regime_1", []);
    const sibA = leaf("sib_pass", "regime_1", [gate(["software_data_ai"])]);
    const sibB = leaf("sib_fail", "regime_1", [gate(["agrifood"])]);
    const score = gateFitScorer([unencoded, sibA, sibB], answers);
    expect(score(unencoded)).toBe(1);
  });
});

describe("a regime the founder cannot be told apart on", () => {
  it("is left alone rather than reordered on a tie", () => {
    const a = leaf("sib_a", "regime_1", [gate(["software_data_ai"])]);
    const b = leaf("sib_b", "regime_1", [gate(["software_data_ai"])]);
    const score = gateFitScorer([a, b], answers);
    expect(score(a)).toBe(1);
    expect(score(b)).toBe(1);
  });

  it("says nothing at all without intake answers", () => {
    const a = leaf("sib_a", "regime_1", [gate(["software_data_ai"])]);
    const b = leaf("sib_b", "regime_1", [gate(["agrifood"])]);
    const score = gateFitScorer([a, b], undefined);
    expect(score(a)).toBe(1);
    expect(score(b)).toBe(1);
  });
});
