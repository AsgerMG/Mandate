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
import { withDoor } from "./rowIdentity";

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

  // ── ONE SCREEN NAMES ONE LEAF ONE WAY ────────────────────────────────────
  // Two places print a body: the table (`distinguishRowNames`, which fires when
  // two DRAWN rows collide) and the question underneath it (`gateReach`, which
  // fires on the register's own ambiguity). They used to spell it differently —
  // "X · Body" against "X · via Body" — so one screen named one leaf two ways
  // even with both firing. The fix is that neither builds the string: both call
  // `withDoor`. This test fails the moment either grows its own spelling.
  it("prints a body in exactly the spelling the table prints", () => {
    expect(doorLabel("Régime cadre RDI", { ...CDC, schemeCode: "SA.111723" }))
      .toBe(withDoor("Régime cadre RDI", "Caisse des Dépôts"));
  });

  // `distinguishRowNames` runs FIRST, so the row reaching this function may
  // already carry its body. Both firing is the normal case, not the edge.
  it("does not append a body the name already carries", () => {
    const fromTheTable = withDoor("Régime cadre RDI", "Caisse des Dépôts");
    expect(doorLabel(fromTheTable, { ...CDC, schemeCode: "SA.111723" }))
      .toBe(fromTheTable);
  });

  // Found by rendering a real French shortlist, not by reading the code. When
  // the table's body branch does not fire, its fallback token is an id
  // fragment — the same body, flattened — and a literal containment test does
  // not recognise it. The row then read "· caisse des depots · via Caisse des
  // Dépôts": the same claim twice, in two spellings.
  it("does not append a body the name already carries in a FLATTENED spelling", () => {
    expect(doorLabel("Régime cadre RDI · caisse des depots",
      { ...CDC, schemeCode: "SA.111723" }))
      .toBe("Régime cadre RDI · caisse des depots");
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
