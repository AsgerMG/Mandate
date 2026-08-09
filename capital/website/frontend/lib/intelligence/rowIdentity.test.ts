// The rule for WHEN A BODY MAY BE NAMED, pinned as behaviour rather than prose.
//
// `rowIdentity.ts` argues at length that three things disqualify a body from
// appearing on a founder's page — no body, a ministry, a scattered vote — and
// an argument in a comment is green forever. Each disqualifier is exercised
// here with an input that MAKES IT FIRE, and each is paired with the nearest
// input that must NOT fire, because a predicate that rejects everything passes
// a one-sided test just as happily as a correct one.
//
// No database. These are the rules, not the corpus: a check that reaches for
// Postgres cannot run in CI, and one that reads the gitignored snapshot must
// not exist at all.
import { describe, expect, it } from "vitest";

import { BODY_SHARE_FLOOR, doorKey, nameableBody } from "./rowIdentity";

const leaf = (over: Partial<Parameters<typeof nameableBody>[0]> = {}) => ({
  administeringBody: "Caisse des Dépôts",
  administeringBodyShare: 1,
  schemeCode: "SA.111723",
  ...over,
});

describe("nameableBody — the evidence standard for printing a body", () => {
  it("names a body the register backs with a decisive vote", () => {
    expect(nameableBody(leaf())).toBe("Caisse des Dépôts");
  });

  // ── Disqualifier 1: there is no body ──────────────────────────────────────
  it("says nothing when no body was ever recorded", () => {
    expect(nameableBody(leaf({ administeringBody: null }))).toBeNull();
    expect(nameableBody(leaf({ administeringBody: "   " }))).toBeNull();
  });

  // ── Disqualifier 2: a ministry notifies, it does not take applications ────
  // Both halves, because "rejects ministries" is only meaningful if the
  // agencies beside them survive. `Ministero`/`Ministerie` are deliberately
  // included: the predicate is on the WORD, not on a list of countries.
  it.each([
    "Ministry of Finance",
    "Ministère de l'Économie",
    "Ministerio de Ciencia e Innovación",
    "Department for Business and Trade",
    "Dipartimento per le politiche di coesione",
    "Direction générale des entreprises",
  ])("refuses to send a founder to %s", (body) => {
    expect(nameableBody(leaf({ administeringBody: body }))).toBeNull();
  });

  it.each([
    "Caisse des Dépôts",
    "Bpifrance",
    "Thüringer Aufbaubank",
    "Region Normandie",
    "Vinnova",
    // Reads like a ministry to a human skim and is an agency: the predicate is
    // anchored at the START of the name, so this must survive.
    "Agentschap Innoveren & Ondernemen",
  ])("still names %s, which does take applications", (body) => {
    expect(nameableBody(leaf({ administeringBody: body }))).toBe(body);
  });

  // ── Disqualifier 3: the vote is too scattered to be a door ────────────────
  it("refuses a plurality that is merely the busiest agency in a system", () => {
    expect(nameableBody(leaf({ administeringBodyShare: 0.15 }))).toBeNull();
    expect(nameableBody(leaf({ administeringBodyShare: 0.6 }))).toBeNull();
  });

  it("admits exactly at the floor and refuses just under it", () => {
    expect(nameableBody(leaf({ administeringBodyShare: BODY_SHARE_FLOOR })))
      .toBe("Caisse des Dépôts");
    expect(nameableBody(leaf({ administeringBodyShare: BODY_SHARE_FLOOR - 1e-9 })))
      .toBeNull();
  });

  // The one place this file departs from the repo's "a gap in our data is never
  // evidence against" convention, and the departure is the point: elsewhere a
  // missing value decides whether a fund is RANKED, here it decides whether we
  // PRINT A CLAIM about who grants the money.
  it("treats an unmeasured vote as no licence to print, not as neutral", () => {
    expect(nameableBody(leaf({ administeringBodyShare: null }))).toBeNull();
    expect(nameableBody(leaf({ administeringBodyShare: undefined }))).toBeNull();
    expect(nameableBody(leaf({ administeringBodyShare: NaN }))).toBeNull();
  });
});

describe("doorKey — a door needs a scheme AND a body, and gets no credit without both", () => {
  it("is the scheme via the body when the register supports both", () => {
    expect(doorKey("satr_fr_rnd__sa_111723__cdc", "satr_fr_rnd", leaf()))
      .toBe("door::SA.111723::caisse des dépôts");
  });

  it("groups two leaves of one scheme reached through one body", () => {
    const a = doorKey("leaf_a", "satr_fr_rnd", leaf());
    const b = doorKey("leaf_b", "satr_fr_rnd", leaf());
    expect(a).toBe(b);
  });

  it("keeps siblings of one scheme APART when the body differs", () => {
    // The measured shape of the whole corpus: every multi-leaf notified scheme
    // holds exactly one leaf per body (SA.111723 is 12 leaves and 12 bodies).
    // So this branch, not the one above, is the one the register exercises —
    // and it is why a door-level row recovers none of the sibling gap.
    // See scripts/measure_door_recovery.ts.
    const a = doorKey("leaf_a", "satr_fr_rnd", leaf());
    const b = doorKey("leaf_b", "satr_fr_rnd", leaf({ administeringBody: "Region Normandie" }));
    expect(a).not.toBe(b);
  });

  // Each disqualifier again, at the key rather than at the label: a leaf that
  // may not name its body must fall back to its OWN id, so it can never be
  // credited by a sibling it was never shown beside.
  it.each([
    ["no scheme code", leaf({ schemeCode: null })],
    ["an empty scheme code", leaf({ schemeCode: "" })],
    ["a ministry", leaf({ administeringBody: "Ministry of Finance" })],
    ["a scattered vote", leaf({ administeringBodyShare: 0.15 })],
    ["no body", leaf({ administeringBody: null })],
  ])("falls back to its own id given %s", (_why, x) => {
    expect(doorKey("leaf_a", "satr_fr_rnd", x)).toBe("leaf::leaf_a");
  });

  // The failure the first cut of this shipped: with no notified code it fell
  // back to the PARENT REGIME, which merged 75 distinctly named ADEME calls —
  // bicycle tourism to biomass heat — into one row and scored it as +22 points.
  it("never uses the parent regime as the scheme half", () => {
    const a = doorKey("ademe_bicycles", "ademe_aid", leaf({ schemeCode: "" }));
    const b = doorKey("ademe_biomass", "ademe_aid", leaf({ schemeCode: "" }));
    expect(a).not.toBe(b);
    expect(a).not.toContain("ademe_aid");
  });
});
