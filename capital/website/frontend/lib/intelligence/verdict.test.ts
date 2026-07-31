import { describe, expect, it } from "vitest";
import { assessInstrument, VERDICT_RANK, type VerdictStatus } from "./verdict";
import type { DbGate, DbInstrument } from "./corpus";

/**
 * Each block names the production bug it would have caught. Fixtures are built
 * by hand rather than loaded from the corpus, so these cannot start failing
 * because the data changed — a test that breaks on a data refresh teaches
 * people to ignore it.
 */
const gate = (valueSpec: unknown, id = "g1"): DbGate => ({
  id, gateFamily: "G1", gateRole: "filter", intakeFieldResolved: undefined,
  requirement: "A documented requirement", value: "", valueSpec: valueSpec as never,
  intakeField: "none", quote: "", source: { file: "", locator: "" },
  verificationLevel: "llm_cited", verified: false,
} as DbGate);

const instrument = (gates: DbGate[]): DbInstrument => ({
  id: "test", parentId: null, name: "Test", country: "EU", capitalType: "grant",
  isFramework: false, eventCount: 10, companyCount: 5, totalEur: 1e6,
  sourceFamilyBucket: "eic", sampleProjectTitles: null, administeringBody: null,
  administeringBodyShare: null, lastYear: 2026, gates,
} as DbInstrument);

describe("non-answers", () => {
  // THE BUG: every yes/no field offers "Not sure", and the comparator matched
  // it literally — so hedging on a question read as FAILING it. False blocker
  // on 12 of 12 archetypes, hiding funds from founders who had not decided.
  it.each(["unsure", "not sure", "unknown", "n/a", "depends", ""])(
    '"%s" never produces a blocker', (answer) => {
      const inst = instrument([gate({ op: "in", field: "sector", allowed: ["agrifood"] })]);
      const a = assessInstrument(inst, { sector: answer } as never);
      expect(a.blockers).toHaveLength(0);
      expect(a.status).toBe("unknown"); // nothing evaluable, not a pass
    });

  it("a real answer that fails IS a blocker", () => {
    const inst = instrument([gate({ op: "in", field: "sector", allowed: ["agrifood"] })]);
    const a = assessInstrument(inst, { sector: "software_data_ai" } as never);
    // sector is structural: a software company cannot become an agritech one
    // before the deadline, so one failure is conclusive.
    expect(a.status).toBe("blocked");
    expect(a.blockers[0].requirement).toContain("documented requirement");
  });
});

describe("list-valued answers", () => {
  // THE BUG: `equals` against a multi-value field compares a string to an
  // array and silently reads "unknown" for everyone, so the rule stops gating.
  it("matches when any selected value is allowed", () => {
    const inst = instrument([gate({ op: "in", field: "activities", allowed: ["tobacco"] })]);
    expect(assessInstrument(inst, { activities: ["tobacco", "none"] } as never).passed).toBe(1);
  });

  it("not_in fails only when a listed value is present", () => {
    const inst = instrument([gate({ op: "not_in", field: "activities", allowed: ["tobacco"] })]);
    expect(assessInstrument(inst, { activities: ["financial_services"] } as never).status).toBe("open");
    expect(assessInstrument(inst, { activities: ["tobacco"] } as never).status).toBe("blocked");
  });

  it("an empty list is unanswered, not a pass", () => {
    const inst = instrument([gate({ op: "not_in", field: "activities", allowed: ["tobacco"] })]);
    expect(assessInstrument(inst, { activities: [] } as never).status).toBe("unknown");
  });
});

describe("banded comparators", () => {
  const order = ["1-9", "10-49", "50-249", "250+"];
  const spec = (op: string, bound: string) => ({
    op, field: "fteBand", order,
    ...(op === "band_max" ? { maxAllowed: bound } : { minAllowed: bound }),
  });

  it("band_max passes at or below the ceiling", () => {
    const inst = instrument([gate(spec("band_max", "50-249"))]);
    expect(assessInstrument(inst, { fteBand: "10-49" } as never).status).toBe("open");
    expect(assessInstrument(inst, { fteBand: "50-249" } as never).status).toBe("open");
    expect(assessInstrument(inst, { fteBand: "250+" } as never).status).toBe("blocked");
  });

  it("band_min passes at or above the floor", () => {
    const inst = instrument([gate(spec("band_min", "50-249"))]);
    expect(assessInstrument(inst, { fteBand: "250+" } as never).status).toBe("open");
    expect(assessInstrument(inst, { fteBand: "1-9" } as never).status).toBe("blocked");
  });

  it("a value outside the band order is unanswerable, not a failure", () => {
    const inst = instrument([gate(spec("band_max", "50-249"))]);
    expect(assessInstrument(inst, { fteBand: "not-a-band" } as never).status).toBe("unknown");
  });
});

describe("what counts as a filter", () => {
  it("ignores obligations and programme facts", () => {
    // Half the corpus is obligations ("works must not start before the grant
    // decision") and programme facts ("aid intensity capped at 20%"). Neither
    // says anything about who qualifies, and gating on them would invent
    // blockers.
    const g = { ...gate({ op: "in", field: "sector", allowed: ["agrifood"] }), gateRole: "obligation" } as DbGate;
    expect(assessInstrument(instrument([g]), { sector: "software_data_ai" } as never).checked).toBe(0);
  });

  it("honours untriaged gates, so coverage can grow safely", () => {
    const g = { ...gate({ op: "in", field: "sector", allowed: ["agrifood"] }), gateRole: undefined } as DbGate;
    expect(assessInstrument(instrument([g]), { sector: "software_data_ai" } as never).checked).toBe(1);
  });
});

describe("status thresholds", () => {
  it("two or more failures is blocked, and blocked never reaches a founder", () => {
    const inst = instrument([
      gate({ op: "in", field: "sector", allowed: ["agrifood"] }, "a"),
      gate({ op: "not_in", field: "activities", allowed: ["tobacco"] }, "b"),
    ]);
    const a = assessInstrument(inst, { sector: "software_data_ai", activities: ["tobacco"] } as never);
    expect(a.status).toBe("blocked");
    expect(VERDICT_RANK.blocked).toBeGreaterThan(VERDICT_RANK.unknown);
  });

  it("ranks open, one_blocker, unknown, blocked in that order", () => {
    const order: VerdictStatus[] = ["open", "one_blocker", "unknown", "blocked"];
    const ranks = order.map((s) => VERDICT_RANK[s]);
    expect(ranks).toEqual([...ranks].sort((x, y) => x - y));
  });
});

describe("severity: what failed, not how many", () => {
  // THE BUG: `blocked` required two failing filters, while the median
  // instrument carries about two filters in total. A company failing "must be
  // established in a member state" — the most disqualifying rule there is —
  // scored one_blocker and published with a footnote. All six out-of-scope
  // red-team companies were shown six confident rows each.
  it("one structural failure disqualifies on its own", () => {
    const inst = instrument([gate({ op: "in", field: "fteBand", allowed: ["1-9"] })]);
    expect(assessInstrument(inst, { fteBand: "250+" } as never).status).toBe("blocked");
  });

  it("one failure the founder could still change stays a named obstacle", () => {
    const inst = instrument([gate({ op: "in", field: "consortium", allowed: ["yes"] })]);
    const a = assessInstrument(inst, { consortium: "no" } as never);
    expect(a.status).toBe("one_blocker");
    expect(a.blockers).toHaveLength(1);
  });

  // The register this replaced lived in the verdict engine, so a field added
  // to the intake later would default to "choice" without anyone deciding —
  // and default in the permissive direction. Severity now sits with the field
  // definition, where the compiler demands it.
  it("classifies by the field, so an unknown field cannot disqualify", () => {
    const inst = instrument([gate({ op: "in", field: "fieldWeHaveNotDefined", allowed: ["x"] })]);
    expect(assessInstrument(inst, { fieldWeHaveNotDefined: "y" } as never).status)
      .toBe("one_blocker");
  });
});

describe("citation: narrow, but do not condemn", () => {
  // THE RISK this guards: most instruments outside state aid carry a generic
  // five-rule stub inferred rather than read off a document. Encoding those
  // stubs is what made 130 development banks assessable at all — ADEME's
  // "must be registered or operating in France" had never once filtered
  // anyone. But closing a fund on a sentence we cannot show the founder is a
  // worse failure than leaving it open, so an uncited rule may only narrow.
  const uncited = (valueSpec: unknown): DbGate =>
    ({ ...gate(valueSpec), verificationLevel: "llm_classified" }) as DbGate;

  it("an uncited structural failure is an obstacle, not a disqualification", () => {
    const inst = instrument([uncited({ op: "in", field: "sector", allowed: ["agrifood"] })]);
    const a = assessInstrument(inst, { sector: "software_data_ai" } as never);
    expect(a.status).toBe("one_blocker");
    expect(a.blockers[0].cited).toBe(false);
  });

  it("the same rule, cited, does disqualify", () => {
    const inst = instrument([gate({ op: "in", field: "sector", allowed: ["agrifood"] })]);
    expect(assessInstrument(inst, { sector: "software_data_ai" } as never).status)
      .toBe("blocked");
  });
});

describe("region: hierarchical, and never flattened to the country", () => {
  // THE BUG: a rule reading "the applicant must be located in Ile-de-France"
  // was encoded as `in entityCountries ["FR"]`, because entityCountries was
  // the only field that existed for it. That is not a weaker version of the
  // rule, it is the opposite: it PASSES every company the rule excludes, with
  // the confidence of an encoded filter behind it.
  const idf = { op: "region_within", field: "region", allowed: ["FR1"] };

  it("a company in the named region passes", () => {
    const inst = instrument([gate(idf)]);
    expect(assessInstrument(inst, { region: "FR10" } as never).status).toBe("open");
  });

  it("a company elsewhere in the same country is blocked, not passed", () => {
    const inst = instrument([gate(idf)]);
    // Provence-Alpes-Cote d'Azur. Same country, wrong region.
    expect(assessInstrument(inst, { region: "FRL0" } as never).status).toBe("blocked");
  });

  it("answering at a different NUTS level still matches", () => {
    // Normandie is NUTS-1 (FRD); its sub-regions are FRD1/FRD2. A rule written
    // at either level must be satisfied by an answer at the other.
    const inst = instrument([gate({ op: "region_within", field: "region", allowed: ["FRD"] })]);
    expect(assessInstrument(inst, { region: "FRD1" } as never).status).toBe("open");
    const inst2 = instrument([gate({ op: "region_within", field: "region", allowed: ["FRD1"] })]);
    expect(assessInstrument(inst2, { region: "FRD" } as never).status).toBe("open");
  });

  it("no region on record is unknown, never a pass", () => {
    const inst = instrument([gate(idf)]);
    expect(assessInstrument(inst, {} as never).status).toBe("unknown");
  });
});
