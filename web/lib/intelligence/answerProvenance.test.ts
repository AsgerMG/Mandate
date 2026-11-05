// Inform, never remove — and the two ways an implementation of that gets it
// wrong. The first is being too weak (a fund still disappears). The second, and
// the one that would matter more, is being too strong: a request that can name
// its own late fields can switch the verdict engine off for itself.
import { describe, expect, it } from "vitest";

import {
  answersWithoutLateFields, lateAnsweredFields, softenAll, softenLateBlockers, withCoveredFields,
} from "./answerProvenance";
import { loadDbInstruments } from "./corpus";
import { openFieldsForShortlist } from "./gateReach";
import type { InstrumentAssessment, Blocker } from "./verdict";
import { FIRST_PAGE_FIELDS, type EligibilityAnswers } from "./types";

const blocker = (field: string): Blocker => ({
  requirement: `a verbatim rule about ${field}`, field, verified: true, cited: true,
  borrowed: false,
});
const assessment = (blockers: Blocker[], status: InstrumentAssessment["status"]):
  InstrumentAssessment => ({
    instrumentId: "x", status, checked: blockers.length + 1,
    passed: 1, blockers,
  });

describe("softenLateBlockers", () => {
  it("will not let a fund that was reachable before the question carry `blocked`", () => {
    const out = softenLateBlockers(
      assessment([blocker("nonEuControl"), blocker("ownerOver25")], "blocked"),
      assessment([], "unknown"));
    expect(out.status).toBe("one_blocker");
  });

  it("softens the ADDED blocker, not just the standing-alone one", () => {
    // ── The disaster, and it is the one that was live ──────────────────────
    // The rule shipped as "every blocker cites a late field". Removal in the
    // field does not look like that. It looks like this: a fund already had one
    // curable blocker on a screen-one field and stayed `one_blocker`, the
    // founder answered a follow-up question, the second blocker landed, and two
    // curable blockers are `blocked`. The old rule saw a non-late blocker and
    // declined to soften — 78 funds deleted at `accessiblePool` across the
    // twelve archetypes with the late field correctly named.
    //
    // Asking the PRIOR verdict gets it right: without the late answer this fund
    // was `one_blocker`, so the founder would have seen it, so they still do.
    const out = softenLateBlockers(
      assessment([blocker("cofinancingBand"), blocker("nonEuControl")], "blocked"),
      assessment([blocker("cofinancingBand")], "one_blocker"));
    expect(out.status).toBe("one_blocker");
  });

  it("keeps the blockers, because the obstacle is the point", () => {
    const bs = [blocker("nonEuControl"), blocker("ownerOver25")];
    const out = softenLateBlockers(assessment(bs, "blocked"), assessment([], "open"));
    expect(out.blockers).toEqual(bs);
    // A softened row publishes WITH the fund's own sentence on it. Losing the
    // requirement text would turn "informed" into "quietly shown anyway", which
    // is a different and worse product.
    expect(out.blockers[0].requirement).toContain("nonEuControl");
  });

  it("leaves a fund the founder could never have seen shut", () => {
    // A fund closed by `sector` was closed before the follow-up screen existed.
    // Nothing that happened on it may reopen the fund, and the test for that is
    // the prior verdict rather than a search through the blockers: it was
    // `blocked` without the late answer and it stays `blocked` with it.
    const out = softenLateBlockers(
      assessment([blocker("sector"), blocker("nonEuControl")], "blocked"),
      assessment([blocker("sector")], "blocked"));
    expect(out.status).toBe("blocked");
  });

  it("touches nothing that was not blocked", () => {
    for (const s of ["open", "one_blocker", "unknown"] as const) {
      const a = assessment([blocker("nonEuControl")], s);
      expect(softenLateBlockers(a, assessment([], "open"))).toBe(a);
    }
  });

  it("is identity when there is no prior assessment to appeal to", () => {
    const a = assessment([blocker("sector")], "blocked");
    expect(softenLateBlockers(a, undefined)).toBe(a);
  });
});

describe("softenAll", () => {
  it("does not compute the prior assessment when nothing is late", () => {
    // The shipped path today. A second `assessAll` over the pool is cheap but
    // not free, and "byte-identical when no follow-up question was answered" is
    // the property that makes this change additive.
    const assessments = new Map([["x", assessment([blocker("sector")], "blocked")]]);
    let calls = 0;
    const out = softenAll(assessments, new Set(), () => { calls += 1; return new Map(); });
    expect(out).toBe(assessments);
    expect(calls).toBe(0);
  });
});

describe("answersWithoutLateFields", () => {
  it("drops exactly the late fields and returns the same object when none are", () => {
    const after = { sector: "software_ai", nonEuControl: "yes" } as EligibilityAnswers;
    expect(answersWithoutLateFields(after, new Set())).toBe(after);
    const prior = answersWithoutLateFields(after, new Set(["nonEuControl"]))!;
    expect(prior.nonEuControl).toBeUndefined();
    expect(prior.sector).toBe("software_ai");
    // Not mutated: the merged answers go on to be assessed as they stand.
    expect(after.nonEuControl).toBe("yes");
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
    const stripped = {} as EligibilityAnswers;
    const after = {
      sector: "software_ai", entityCountries: ["France"], nonEuControl: "yes",
    } as EligibilityAnswers;
    const late = lateAnsweredFields(stripped, after, askable);
    expect(late.has("sector")).toBe(false);
    expect(late.has("entityCountries")).toBe(false);
    expect(late.has("nonEuControl")).toBe(true);
  });

  it("cannot make a screen-one answer late from the REAL askable set either", () => {
    // ── The disaster, and it had already happened ──────────────────────────
    // This module was written believing the intersection with `askable` did the
    // work on its own: "openFieldsForShortlist skips FIRST_PAGE_FIELDS, so
    // country and sector can never be late". Its gate-driven loop does. The
    // region block below that loop does not go through it, and `region` IS a
    // first-page field — carrying 181 encoded official region filters on 155
    // leaves, which types.ts calls the most decisive question the intake has.
    //
    // So the test builds the askable set the way the pipeline does, over the
    // real corpus, and asserts on what comes out. A hand-written `askable`
    // could not have caught this and did not: the case above passes either way.
    const ids = loadDbInstruments().map((i) => i.id);
    const before = { entityCountries: ["France"], sector: "software_data_ai" } as EligibilityAnswers;
    const open = openFieldsForShortlist(ids, before).map((f) => f.field);

    // The precondition, asserted rather than assumed. If `openFieldsForShortlist`
    // is ever fixed at its own end this line fails loudly instead of leaving the
    // test below passing vacuously.
    expect(open.filter((f) => FIRST_PAGE_FIELDS.has(f)),
      "openFieldsForShortlist no longer offers a first-page field; the hole this "
      + "pins is closed upstream and this test is now vacuous").toContain("region");

    const askableReal = withCoveredFields(open);
    const after = { ...before, region: "FRD", nonEuControl: "yes" } as EligibilityAnswers;
    const late = lateAnsweredFields(before, after, askableReal);
    expect(late.has("region")).toBe(false);
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
