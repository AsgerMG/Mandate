/** The SME derivation, and the claim that the merge is worth doing.
 *
 *  Regina asks a founder to self-declare micro/small/medium/large and its own
 *  docstring says that status "gates many obligations". Wincent asks the three
 *  facts the EU definition is made of. If this function is right, one engine
 *  stops guessing at something the other already knows — which is the whole
 *  argument for one profile instead of two.
 *
 *  So the tests are about the PROPERTY, not a table of cases I happened to
 *  think of: exhaustive over every combination the vocabularies admit, plus the
 *  two monotonicity rules the statute implies. */
import { describe, expect, it } from "vitest";
import { deriveSmeStatus, PROFILE, crossFeed, type SmeStatus } from "./companyProfile";

const FTE = ["1-9", "10-49", "50-249", "250+"] as const;
const TURN = [undefined, "<2M", "2-10M", "10-50M", ">50M"] as const;
const BAL = [undefined, "<2M", "2-43M", ">43M"] as const;
const RANK: Record<SmeStatus, number> = { micro: 0, small: 1, medium: 2, large: 3 };

const all = () => FTE.flatMap((f) => TURN.flatMap((t) => BAL.map((b) =>
  ({ fteBand: f, turnoverBand: t, balanceBand: b,
     out: deriveSmeStatus({ fteBand: f, turnoverBand: t, balanceBand: b }) }))));

describe("EU SME status is derived, not asked", () => {
  it("never invents a status it cannot support", () => {
    // Headcount alone proves only LARGE. Anything else needs a financial answer.
    for (const c of all()) {
      if (c.fteBand !== "250+" && !c.turnoverBand && !c.balanceBand) {
        expect(c.out, JSON.stringify(c)).toBeUndefined();
      }
    }
  });

  it("calls 250+ staff large whatever the money says", () => {
    for (const c of all()) if (c.fteBand === "250+") expect(c.out).toBe("large");
  });

  it("is monotone in headcount — more staff never makes you smaller", () => {
    for (const t of TURN) for (const b of BAL) {
      let prev = -1;
      for (const f of FTE) {
        const o = deriveSmeStatus({ fteBand: f, turnoverBand: t, balanceBand: b });
        if (o === undefined) continue;
        expect(RANK[o], `fte=${f} turnover=${t} balance=${b}`).toBeGreaterThanOrEqual(prev);
        prev = RANK[o];
      }
    }
  });

  it("is monotone in money — a bigger company is never a smaller class", () => {
    for (const f of FTE) for (const b of BAL) {
      let prev = -1;
      for (const t of TURN) {
        if (t === undefined) continue;
        const o = deriveSmeStatus({ fteBand: f, turnoverBand: t, balanceBand: b });
        if (o === undefined) continue;
        expect(RANK[o], `fte=${f} turnover=${t} balance=${b}`).toBeGreaterThanOrEqual(prev);
        prev = RANK[o];
      }
    }
  });

  it("lets EITHER financial test satisfy a tier, as the statute says", () => {
    // Article 2 is "turnover OR balance sheet". A tiny balance sheet is enough
    // even on large turnover, and the reverse.
    expect(deriveSmeStatus({ fteBand: "1-9", turnoverBand: ">50M", balanceBand: "<2M" }))
      .toBe("micro");
    expect(deriveSmeStatus({ fteBand: "1-9", turnoverBand: "<2M", balanceBand: ">43M" }))
      .toBe("micro");
  });

  it("errs toward the larger class where the bands cannot resolve it", () => {
    // The documented limit: no €10m rung on the balance ladder, so at the SMALL
    // tier only turnover can satisfy the test. Reading MEDIUM costs a founder
    // nothing — SME schemes still admit it — and claiming SMALL wrongly would.
    expect(deriveSmeStatus({ fteBand: "10-49", balanceBand: "2-43M" })).toBe("medium");
  });
});

describe("the profile earns its place", () => {
  it("every field says who consumes it and what it changes", () => {
    for (const [k, f] of Object.entries(PROFILE)) {
      expect(f.why, k).not.toBe("");
      expect(["funding", "policy", "both"]).toContain(f.consumer);
      if (f.source !== "derived") expect(f.ask, k).not.toBe("");
    }
  });

  it("carries facts each engine lacks — otherwise merging buys nothing", () => {
    const { toFunding, toPolicy } = crossFeed();
    // Regina knows about AI role, personal data and who you sell to; Wincent
    // never asked. Wincent knows what you want the money for; Regina never did.
    expect(toFunding.length, "nothing new reaches the funding engine").toBeGreaterThan(0);
    expect(toPolicy.length, "nothing new reaches the policy engine").toBeGreaterThan(0);
  });
});
