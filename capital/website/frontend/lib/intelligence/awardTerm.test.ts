import { describe, expect, it } from "vitest";

import { AWARD_TERM, awardScorer, bandMidEur, parseAwardTerm } from "./shortlist";
import type { DbInstrument } from "./corpus";

/**
 * The award term is the only live ranking signal wsHA found pointing AGAINST the
 * answer inside the sibling cell (33.1% to 5.6%). wsHE's arms change what a
 * founder is shown, so the two things a test has to hold are:
 *
 *   1  THE DEFAULT IS PINNED. An arm that ships by accident is worse than one
 *      that never ran, because the number it moves gets attributed to whatever
 *      else changed that day. This held: when the owner flipped the default to
 *      `oneside` on 2026-08-17 the assertion failed first, which is what it was
 *      for. The shipped arm's own defect is still asserted below, by NAMING the
 *      arm rather than leaning on whatever the default happens to be.
 *   2  A MISSPELLING THROWS. `parsePoolBlend`'s own comment says why: a silent
 *      default on a typo is how an arm that never arrived is reported as
 *      "no effect" in both arms of a paired run.
 */
const inst = (p: Partial<DbInstrument>): DbInstrument => ({
  id: "x", name: "X", country: "SE", capitalType: "grant", eventCount: 40,
  totalEur: 0, companyCount: 10, sectorMix: null, awardN: 40, awardP25: null,
  awardP50: null, awardP75: null, gates: [], ...p,
} as unknown as DbInstrument);

/** The band whose geometric midpoint the arms are read against, so the numbers
 *  below are anchored to the shipped table rather than to a literal. */
const BAND = "b500k_2m5";
const MID = bandMidEur(BAND)!;

describe("AWARD_TERM", () => {
  it("defaults to `oneside` — the owner's decision, pinned so it cannot drift back", () => {
    // Flipped 2026-08-17 on wsHE, and this assertion is the reason the flip
    // could not happen by accident: it failed the moment the default moved,
    // which is exactly what it was written for. It now pins the NEW default
    // for the same reason, and the shipped arm's own behaviour is still
    // asserted below by naming the arm rather than relying on the default.
    expect(parseAwardTerm(undefined)).toBe("oneside");
    // An EMPTY string is not "unset", it is a value somebody typed — `AWARD_TERM=
    // npm run stages` — and it throws for the same reason a misspelling does.
    // Verbatim the treatment `parsePoolBlend` gives its own arms.
    expect(() => parseAwardTerm("")).toThrow(/unknown AWARD_TERM=/);
    // And the module-scope value the product actually serves is that default in
    // a normal process. A test that only checked the parser would pass with the
    // constant wired to something else.
    expect(AWARD_TERM).toBe(process.env.AWARD_TERM ?? "oneside");
  });

  it("throws on an unrecognised arm rather than reading as shipped", () => {
    expect(() => parseAwardTerm("OFF")).toThrow(/unknown AWARD_TERM=OFF/);
    expect(() => parseAwardTerm("reverse")).toThrow(/unknown AWARD_TERM=reverse/);
  });

  it("shipped: symmetric in log space — the defect, stated as an assertion", () => {
    // Two decades below the ask and two decades above it score IDENTICALLY.
    // That symmetry is what makes the term degenerate into "prefer the larger
    // payer" when almost every candidate sits below the ask, which is the
    // mechanism wsHE measured. If someone changes the shipped arm, this fails.
    const below = awardScorer([], BAND, "shipped")(inst({ awardP50: MID / 100 }));
    const above = awardScorer([], BAND, "shipped")(inst({ awardP50: MID * 100 }));
    expect(below).toBeCloseTo(above, 12);
    // And the nearer-to-the-ask fund wins, whichever side it is on.
    const near = awardScorer([], BAND, "shipped")(inst({ awardP50: MID / 4 }));
    expect(near).toBeGreaterThan(below);
  });

  it("shipped: a fund with no usable award history is neutral, not punished", () => {
    expect(awardScorer([], BAND, "shipped")(inst({ awardP50: null }))).toBe(1);
    // Below the `awardN` floor the median is not evidence yet.
    expect(awardScorer([], BAND, "shipped")(inst({ awardP50: MID, awardN: 2 }))).toBe(1);
  });
});

describe("the arms, exercised in one process", () => {
  const shipped = awardScorer([], BAND, "shipped");
  const off = awardScorer([], BAND, "off");
  const oneside = awardScorer([], BAND, "oneside");

  it("off returns 1 for every fund, and shipped does not", () => {
    for (const p50 of [MID / 1000, MID / 4, MID, MID * 30]) {
      expect(off(inst({ awardP50: p50 }))).toBe(1);
    }
    // The shipped arm is not a constant, so an accidental `off` default is
    // detectable rather than a silent no-op.
    expect(shipped(inst({ awardP50: MID }))).not.toBe(1);
  });

  it("oneside changes the BELOW side only, and only upwards", () => {
    // Above the ask: byte-identical to shipped. The arm makes no claim there.
    for (const mult of [1, 3, 30, 300]) {
      expect(oneside(inst({ awardP50: MID * mult })))
        .toBe(shipped(inst({ awardP50: MID * mult })));
    }
    // Below it: pinned at the ceiling, where shipped decays.
    const small = inst({ awardP50: MID / 1000 });
    expect(shipped(small)).toBeLessThan(1.35);
    expect(oneside(small)).toBe(1.35);
    // Which is the whole property: two schemes that both pay less than the ask
    // can no longer be ordered by how much less. wsHE measured that ordering
    // going the wrong way 69.6% of the time inside the sibling cell.
    const a = inst({ awardP50: MID / 8 }), b = inst({ awardP50: MID / 400 });
    expect(shipped(a)).toBeGreaterThan(shipped(b));
    expect(oneside(a)).toBe(oneside(b));
  });

  it("every arm leaves a fund with no usable award history neutral", () => {
    for (const s of [shipped, off, oneside]) {
      expect(s(inst({ awardP50: null }))).toBe(1);
      expect(s(inst({ awardP50: MID, awardN: 2 }))).toBe(1);
    }
  });
});
