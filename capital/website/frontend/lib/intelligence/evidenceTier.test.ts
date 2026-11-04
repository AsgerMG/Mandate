import { describe, expect, it } from "vitest";
import { assessInstrument, isAttributable, isCited } from "./verdict";
import { judgementCriteria, structuringNotes } from "./shortlist";
import type { DbGate, DbInstrument } from "./corpus";

/**
 * THE BUG THIS PINS: 274 per-scheme GBER article rules were seeded from the
 * SATR register and reached no founder-facing surface at all — not cited, so
 * judgementCriteria and structuringNotes skipped them; no valueSpec, so the
 * verdict engine skipped them too. The fix introduced a third evidence tier,
 * and a third tier is exactly the kind of thing that quietly widens until it
 * can disqualify someone. These tests are the fence.
 *
 * Fixtures are hand-built, so a data refresh cannot make them pass or fail.
 */
const g = (over: Partial<DbGate>): DbGate => ({
  id: "gber_article_inferred", gateFamily: "G3_financial", gateRole: "programme_fact",
  intakeFieldResolved: "none",
  requirement: "R&D project aid (GBER Art. 25) — aid intensity capped by research category.",
  value: "StateAidObjectiveGberArt25", valueSpec: null as never, intakeField: "cofinancingBand",
  quote: "", source: { file: "", locator: "" },
  verificationLevel: "register_derived", verified: false, ...over,
} as DbGate);

const inst = (gates: DbGate[]): DbInstrument => ({
  id: "satr_x__child", parentId: "satr_x", name: "Child", country: "FR", capitalType: "grant",
  isFramework: false, eventCount: 10, companyCount: 5, totalEur: 1e6,
  sourceFamilyBucket: "state_aid_satr", sampleProjectTitles: null, administeringBody: null,
  administeringBodyShare: null, lastYear: 2026, gates,
} as DbInstrument);

describe("register_derived is attributable but not cited", () => {
  it("is not cited — it is a majority vote across awards, not the fund's words", () => {
    expect(isCited(g({}))).toBe(false);
  });

  it("is attributable — the granting authority filed the article itself", () => {
    expect(isAttributable(g({}))).toBe(true);
  });

  it("reaches structuring notes", () => {
    expect(structuringNotes(inst([g({})]))).toEqual([
      "R&D project aid (GBER Art. 25) — aid intensity capped by research category.",
    ]);
  });

  it("never reaches judgement criteria, which are the fund's own words", () => {
    // Even forced to look like a filter, the tier alone must keep it out.
    expect(judgementCriteria(inst([g({ gateRole: "filter" })]))).toEqual([]);
  });

  it("cannot decide a verdict even carrying an aid_intensity spec", () => {
    // The tier DOES carry a valueSpec now (the statutory ceiling), so "no spec"
    // is no longer what keeps it out of verdicts -- gateRole is. An aid_intensity
    // spec describes the money, not the applicant, and must never become a
    // filter: doing so would disqualify a founder on a majority-vote article.
    const withSpec = g({ valueSpec: { op: "aid_intensity", cap: 80 } as never });
    const a = assessInstrument(inst([withSpec]), { sector: "agrifood" } as never);
    expect(a.blockers).toHaveLength(0);
    expect(a.status).toBe("unknown");
  });

  it("an aid_intensity spec stays out of judgement criteria", () => {
    expect(judgementCriteria(inst([g({ valueSpec: { op: "aid_intensity" } as never })]))).toEqual([]);
  });

  it("a genuinely uncited model inference stays out of structuring notes", () => {
    // The tier must not become a synonym for "uncited". inventory_inferred is
    // an extraction, and it is still inadmissible everywhere.
    expect(structuringNotes(inst([g({ verificationLevel: "inventory_inferred" })]))).toEqual([]);
  });
});
