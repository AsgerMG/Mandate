// Inform, never remove — and the two ways an implementation of that gets it
// wrong. The first is being too weak (a fund still disappears). The second, and
// the one that would matter more, is being too strong: a request that can name
// its own late fields can switch the verdict engine off for itself.
import { describe, expect, it } from "vitest";

import { lateAnsweredFields, softenLateBlockers } from "./answerProvenance";
import type { InstrumentAssessment, Blocker } from "./verdict";
import type { EligibilityAnswers } from "./types";

const blocker = (field: string): Blocker => ({
  requirement: `a verbatim rule about ${field}`, field, verified: true, cited: true,
});
const assessment = (blockers: Blocker[], status: InstrumentAssessment["status"]):
  InstrumentAssessment => ({
    instrumentId: "x", status, checked: blockers.length + 1,
    passed: 1, blockers,
  });

describe("softenLateBlockers", () => {
  it("will not let an all-late assessment carry `blocked`", () => {
    const out = softenLateBlockers(
      assessment([blocker("nonEuControl"), blocker("ownerOver25")], "blocked"),
      new Set(["nonEuControl", "ownerOver25"]));
    expect(out.status).toBe("one_blocker");
  });

  it("keeps the blockers, because the obstacle is the point", () => {
    const bs = [blocker("nonEuControl"), blocker("ownerOver25")];
    const out = softenLateBlockers(assessment(bs, "blocked"), new Set(
      ["nonEuControl", "ownerOver25"]));
    expect(out.blockers).toEqual(bs);
    // A softened row publishes WITH the fund's own sentence on it. Losing the
    // requirement text would turn "informed" into "quietly shown anyway", which
    // is a different and worse product.
    expect(out.blockers[0].requirement).toContain("nonEuControl");
  });

  it("leaves a screen-one blocker at full force, and one is enough", () => {
    // `sector` is a first-page field. A fund closed by sector was closed before
    // the follow-up screen existed, so nothing that happened on it may reopen
    // the fund — not even when a second, late blocker joins the first.
    const out = softenLateBlockers(
      assessment([blocker("sector"), blocker("nonEuControl")], "blocked"),
      new Set(["nonEuControl"]));
    expect(out.status).toBe("blocked");
  });

  it("touches nothing that was not blocked", () => {
    for (const s of ["open", "one_blocker", "unknown"] as const) {
      const a = assessment([blocker("nonEuControl")], s);
      expect(softenLateBlockers(a, new Set(["nonEuControl"]))).toBe(a);
    }
  });

  it("is identity when nothing is late", () => {
    const a = assessment([blocker("sector")], "blocked");
    expect(softenLateBlockers(a, new Set())).toBe(a);
  });
});

describe("lateAnsweredFields", () => {
  const askable = new Set(["nonEuControl", "ownerOver25", "consortium"]);
  const before = { sector: "software_ai" } as EligibilityAnswers;

  it("names a field the founder first answered on the follow-up screen", () => {
    const after = { sector: "software_ai", nonEuControl: "yes" } as EligibilityAnswers;
    expect([...lateAnsweredFields(before, after, askable)]).toEqual(["nonEuControl"]);
  });

  it("refuses a field this founder's shortlist would not have asked about", () => {
    // The second route to immunity, and the one a set difference alone cannot
    // close: a request controls BOTH answer objects, so it can omit anything it
    // likes from the earlier one. `askable` is re-derived server-side from the
    // founder's own open-gate evidence, and it is what makes the difference
    // mean something.
    const after = { sector: "software_ai", turnoverBand: "<2M" } as EligibilityAnswers;
    expect([...lateAnsweredFields(before, after, askable)]).toEqual([]);
  });

  it("cannot make a screen-one answer late, however the objects are shaped", () => {
    // `askable` comes from `openFieldsForShortlist`, which skips
    // FIRST_PAGE_FIELDS — so `sector` and `entityCountries` are absent from it
    // by construction, and a request that simply omits them from
    // `eligibilityBeforeRound` buys nothing.
    const stripped = {} as EligibilityAnswers;
    const after = {
      sector: "software_ai", entityCountries: ["France"], nonEuControl: "yes",
    } as EligibilityAnswers;
    const late = lateAnsweredFields(stripped, after, askable);
    expect(late.has("sector")).toBe(false);
    expect(late.has("entityCountries")).toBe(false);
    expect(late.has("nonEuControl")).toBe(true);
  });

  it("treats an ABSENT earlier object as `nothing is late`", () => {
    // Fail closed. Every harness, every recorded replay and any client that has
    // not been taught to send the second object lands here, and every one of
    // them must get the behaviour that existed before this module — otherwise a
    // request buys immunity by omitting a field.
    const after = { nonEuControl: "yes", ownerOver25: "yes" } as EligibilityAnswers;
    expect([...lateAnsweredFields(undefined, after, askable)]).toEqual([]);
  });

  it("does not count `unsure`, or a field the founder already answered", () => {
    const after = {
      sector: "software_ai", nonEuControl: "unsure", consortium: "yes",
    } as EligibilityAnswers;
    const withConsortium = { ...before, consortium: "yes" } as EligibilityAnswers;
    expect([...lateAnsweredFields(withConsortium, after, askable)]).toEqual([]);
  });
});
