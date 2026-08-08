// What a ranking term must score for a fund we hold no data about.
//
// THE PROPERTY, stated once and tested here rather than described in a comment:
//
//   A stand-in for data we do not hold must not move the fund's rank against
//   the candidates it is competing with. For a MULTIPLIED term that is the
//   constant 1, the identity of the operation, and it is exact. For an ADDED
//   term there is no constant that satisfies it, because the value has to sit
//   inside the population's own range — so the stand-in must be SOLVED from the
//   candidates, and any implementation that returns a literal fails.
//
// The defect this pins was live and shipped. `sectorFit` returned 0.5 for a
// fund with no sector history, under a docstring calling 0.5 "neutral". Over
// the live corpus the funds that DO carry history score mean 0.256, median
// 0.084 — so 0.5 was the 79th percentile, and the absence of the evidence the
// term exists to read was worth more than four fifths of the evidence.
//
// Fixtures are built BY HAND, never read from the corpus, so a data load cannot
// turn these red and cannot quietly make them vacuous either.
import { describe, expect, it } from "vitest";

import { FALLBACK_UNKNOWN, hasSectorHistory, sectorFit, sectorFitScorer } from "./fit";

/** A candidate is only ever `{ sectorMix }` here — the scorer must not need
 *  anything else, or it could not be applied to a row that has no instrument. */
const leaf = (mix: Record<string, number> | null) => ({ sectorMix: mix });

const SECTOR = "software_data_ai";
const OTHER = "health_life_sciences";

describe("sectorFit reports that it cannot tell, rather than guessing", () => {
  it("returns null — not a number — when there is no mix", () => {
    // The type is the guard. Anyone reintroducing a constant inside this
    // function has to change the signature, and the five call sites that took
    // the old 0.5 by accident stop compiling.
    expect(sectorFit(null, SECTOR)).toBeNull();
    expect(sectorFit(undefined, SECTOR)).toBeNull();
    expect(sectorFit({}, SECTOR)).toBeNull();
  });

  it("returns null when the mix exists but records nothing", () => {
    // A row of zeroes is not a fund with no recipients in this sector; it is a
    // fund whose recipients we have not classified. Dividing by it produced
    // NaN before the total was checked, and NaN sorts unpredictably.
    expect(sectorFit({ [SECTOR]: 0, [OTHER]: 0 }, SECTOR)).toBeNull();
    expect(hasSectorHistory({ [SECTOR]: 0 })).toBe(false);
  });

  it("returns null when the FOUNDER has no sector, not a default", () => {
    expect(sectorFit({ [SECTOR]: 10 }, undefined)).toBeNull();
  });

  it("still scores a real mix on its own evidence", () => {
    // 4 of 40 is a 10% share against a 25% full-match share: 0.4.
    expect(sectorFit({ [SECTOR]: 4, [OTHER]: 36 }, SECTOR)).toBeCloseTo(0.4, 6);
    expect(sectorFit({ [SECTOR]: 36, [OTHER]: 4 }, SECTOR)).toBe(1);
  });
});

describe("the stand-in is solved from the candidates, not stated", () => {
  it("scores the mean of the candidates whose history we DO hold", () => {
    const pool = [
      leaf({ [SECTOR]: 0, [OTHER]: 100 }),   // 0.0
      leaf({ [SECTOR]: 5, [OTHER]: 95 }),    // 0.2
      leaf({ [SECTOR]: 10, [OTHER]: 90 }),   // 0.4
      leaf({ [SECTOR]: 60, [OTHER]: 40 }),   // 1.0  (clipped)
      leaf(null),                            // the fund we know nothing about
    ];
    const score = sectorFitScorer(pool, SECTOR);
    expect(score(pool[4])).toBeCloseTo((0.0 + 0.2 + 0.4 + 1.0) / 4, 6);
  });

  it("MOVES WITH THE POPULATION — which no constant can do", () => {
    // This is the property in one assertion. The unknown leaf is byte-identical
    // in both pools; only its competition differs. An implementation returning
    // any literal makes these two equal and fails.
    const unknown = leaf(null);
    const narrow = sectorFitScorer(
      [leaf({ [SECTOR]: 0, [OTHER]: 100 }), leaf({ [SECTOR]: 1, [OTHER]: 99 }), unknown], SECTOR);
    const broad = sectorFitScorer(
      [leaf({ [SECTOR]: 90, [OTHER]: 10 }), leaf({ [SECTOR]: 80, [OTHER]: 20 }), unknown], SECTOR);
    expect(narrow(unknown)).not.toBeCloseTo(broad(unknown), 3);
    expect(narrow(unknown)).toBeLessThan(broad(unknown));
  });

  it("does not outrank a pool that is uniformly worse than the old constant", () => {
    // THE REGRESSION, in the shape it shipped in. Every candidate here scores
    // below 0.5 on real evidence, which is the ordinary case: the live corpus's
    // median is 0.084. Under the old constant the fund with no record at all
    // sorted above every one of them.
    const known = [
      leaf({ [SECTOR]: 1, [OTHER]: 99 }),
      leaf({ [SECTOR]: 2, [OTHER]: 98 }),
      leaf({ [SECTOR]: 5, [OTHER]: 95 }),
    ];
    const unknown = leaf(null);
    const score = sectorFitScorer([...known, unknown], SECTOR);
    expect(score(unknown)).toBeLessThan(FALLBACK_UNKNOWN);
    expect(known.some((k) => score(k) >= score(unknown))).toBe(true);
  });

  it("does not bury the unknown either, when the pool scores high", () => {
    // The opposite failure, and the one the original 0.5 was defending against.
    // Zeroing an unknown is as wrong as promoting it; the mean is between.
    const known = [
      leaf({ [SECTOR]: 90, [OTHER]: 10 }),
      leaf({ [SECTOR]: 80, [OTHER]: 20 }),
    ];
    const unknown = leaf(null);
    const score = sectorFitScorer([...known, unknown], SECTOR);
    expect(score(unknown)).toBe(1);
  });

  it("cannot reorder anything when NO candidate has a history", () => {
    // Every row gets the same value, so the term is constant across the sort
    // and drops out. Which constant it is therefore cannot matter, and the
    // fallback exists only so the number is stable between runs.
    const pool = [leaf(null), leaf({}), leaf({ [SECTOR]: 0 })];
    const score = sectorFitScorer(pool, SECTOR);
    expect(new Set(pool.map(score)).size).toBe(1);
    expect(score(pool[0])).toBe(FALLBACK_UNKNOWN);
  });

  it("cannot reorder anything when the founder gave no sector", () => {
    const pool = [leaf({ [SECTOR]: 90, [OTHER]: 10 }), leaf(null)];
    const score = sectorFitScorer(pool, undefined);
    expect(new Set(pool.map(score)).size).toBe(1);
  });

  it("scores a row with no instrument at all, without throwing", () => {
    // `rowRelevance` scores channel-level rows, whose instrument is undefined.
    // Those are unknowns like any other and must take the same stand-in.
    const pool = [leaf({ [SECTOR]: 10, [OTHER]: 90 }), leaf({ [SECTOR]: 30, [OTHER]: 70 })];
    const score = sectorFitScorer(pool, SECTOR);
    expect(score(null)).toBeCloseTo((0.4 + 1.0) / 2, 6);
    expect(score(undefined)).toBe(score(null));
  });
});
