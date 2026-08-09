// The door label, pinned on the two properties that make it safe to ship:
// it says nothing the register did not, and it never says it twice.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./corpus", () => ({
  // SA.111723 has twelve leaves in the real register; two is enough to make it
  // ambiguous. SA.99999 stands alone and must therefore be left untouched.
  loadDbInstruments: () => ([
    { schemeCode: "SA.111723" }, { schemeCode: "SA.111723" }, { schemeCode: "SA.99999" },
  ]),
}));

import { doorLabel, __resetAmbiguousSchemes } from "./doorLabel";

const CDC = { administeringBody: "Caisse des Dépôts", administeringBodyShare: 1 };

describe("doorLabel", () => {
  beforeEach(__resetAmbiguousSchemes);

  it("qualifies a scheme whose title does not identify a fund", () => {
    expect(doorLabel("Régime cadre RDI 2024-2026", { ...CDC, schemeCode: "SA.111723" }))
      .toBe("Régime cadre RDI 2024-2026 · via Caisse des Dépôts");
  });

  // Ambiguity is a property of the REGISTER, not of the five rows drawn. A
  // scheme with one leaf names a fund already, so qualifying it adds noise.
  it("leaves a scheme that stands alone exactly as it was", () => {
    expect(doorLabel("Innov Eau", { ...CDC, schemeCode: "SA.99999" })).toBe("Innov Eau");
  });

  it("leaves a row with no notified scheme exactly as it was", () => {
    expect(doorLabel("ADEME call", { ...CDC, schemeCode: "" })).toBe("ADEME call");
    expect(doorLabel("ADEME call", { ...CDC, schemeCode: null })).toBe("ADEME call");
  });

  // The three refusals are `nameableBody`'s and are tested there; what matters
  // here is that a refusal reaches this function as "change nothing", never as
  // a dangling connective or an empty body.
  it.each([
    ["a ministry", { administeringBody: "Ministry of Finance", administeringBodyShare: 1 }],
    ["a scattered vote", { administeringBody: "Bpifrance", administeringBodyShare: 0.15 }],
    ["an unmeasured vote", { administeringBody: "Bpifrance", administeringBodyShare: null }],
    ["no body at all", { administeringBody: null, administeringBodyShare: null }],
  ])("says nothing extra when the register does not support naming %s", (_why, body) => {
    expect(doorLabel("Régime cadre RDI", { ...body, schemeCode: "SA.111723" }))
      .toBe("Régime cadre RDI");
  });

  // `distinguishRowNames` already appends the body when two siblings collide in
  // one table, and it runs first. Both firing is the normal case, not the edge.
  it("does not append a body the name already carries", () => {
    const once = doorLabel("Régime cadre RDI · Caisse des Dépôts",
      { ...CDC, schemeCode: "SA.111723" });
    expect(once).toBe("Régime cadre RDI · Caisse des Dépôts");
  });

  it("is idempotent, so a second pass cannot double the claim", () => {
    const x = { ...CDC, schemeCode: "SA.111723" };
    const once = doorLabel("Régime cadre RDI", x);
    expect(doorLabel(once, x)).toBe(once);
  });

  // "via" and not "apply to": the register publishes the granting authority on
  // each AWARD, so this is award history and never a claim about intake.
  it("uses the connective that keeps the claim inside the evidence", () => {
    expect(doorLabel("Régime cadre RDI", { ...CDC, schemeCode: "SA.111723" }))
      .toContain("· via ");
  });
});
