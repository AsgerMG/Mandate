// The ruler's property, proved on sectors that exist nowhere in this repo.
//
// Every case below uses the keys `alpha`, `beta`, `gamma`, `delta` and a
// synthetic corpus. That is the point: the rule may not know which real sectors
// are near each other, because a rule that knows is an enumeration and the next
// sector the taxonomy adds would not be in it. `check_contracts.ts` fails the
// build over exactly this shape elsewhere and it should apply to an instrument
// as much as to a contract rule.
import { describe, expect, it } from "vitest";

import {
  awardMedian, awardMismatch, categoryError, menuRows, neighbourhood,
  resolveTitle, sectorNeighbourhood, themeMismatch, titleIndex,
} from "./_ruler";

/** A corpus in which `alpha` and `beta` are routinely funded together, `gamma`
 *  is funded on its own, and `delta` is rare everywhere. Nothing here names a
 *  sector the product has. */
const CORPUS = [
  ...Array.from({ length: 20 }, (_, n) => ({ id: `ab${n}`, name: `ab${n}`, sectorMix: { alpha: 10, beta: 10 } })),
  ...Array.from({ length: 20 }, (_, n) => ({ id: `g${n}`, name: `g${n}`, sectorMix: { gamma: 20 } })),
  ...Array.from({ length: 4 }, (_, n) => ({ id: `d${n}`, name: `d${n}`, sectorMix: { delta: 1, gamma: 19 } })),
];

describe("sectorNeighbourhood", () => {
  const near = sectorNeighbourhood(CORPUS);

  it("is reflexive: a sector is in its own neighbourhood", () => {
    for (const s of ["alpha", "beta", "gamma", "delta"]) {
      expect(near.get(s)?.has(s)).toBe(true);
    }
  });

  it("finds the pair that is co-funded above chance, without being told it", () => {
    expect(near.get("alpha")?.has("beta")).toBe(true);
    expect(near.get("beta")?.has("alpha")).toBe(true);
  });

  it("does not make a sector a neighbour of one it is never co-funded with", () => {
    expect(near.get("alpha")?.has("gamma")).toBe(false);
    expect(near.get("gamma")?.has("alpha")).toBe(false);
  });

  it("answers for a sector nobody has added yet, on the day its first award lands", () => {
    const extended = [...CORPUS, { id: "new", name: "new", sectorMix: { epsilon: 5, alpha: 5 } }];
    const n2 = sectorNeighbourhood(extended);
    expect(n2.get("epsilon")?.has("alpha")).toBe(true);
    expect(n2.get("epsilon")?.has("gamma")).toBe(false);
  });

  it("is empty rather than throwing on a corpus with no mixes at all", () => {
    expect(sectorNeighbourhood([{ sectorMix: null }, { sectorMix: {} }]).size).toBe(0);
  });
});

describe("categoryError", () => {
  const nb = neighbourhood(CORPUS);

  it("is false when the fund has funded the founder's own sector", () => {
    expect(categoryError({ alpha: 1, gamma: 99 }, "alpha", nb)).toBe(false);
  });

  it("is false when the fund has funded a NEIGHBOUR of it — the whole point", () => {
    // Nothing in `alpha`, plenty in `beta`. The old strict test would call this
    // a category error; the corpus says the two are funded together.
    expect(categoryError({ beta: 100 }, "alpha", nb)).toBe(false);
  });

  it("is true when a long history holds nothing in the sector or its neighbours", () => {
    expect(categoryError({ gamma: 500 }, "alpha", nb)).toBe(true);
  });

  it("is null when the history is too short for its silence to mean anything", () => {
    // Two awards, both gamma. The rule of three puts the upper bound on alpha's
    // true share at 1.5, which is above any base rate: this fund has said
    // nothing about alpha and must not be graded as if it had.
    expect(categoryError({ gamma: 2 }, "alpha", nb)).toBe(null);
  });

  it("is null, never false, when the fund has no mix on record", () => {
    expect(categoryError(null, "alpha", nb)).toBe(null);
    expect(categoryError({}, "alpha", nb)).toBe(null);
  });

  it("is null for a founder sector this corpus never classifies", () => {
    expect(categoryError({ gamma: 500 }, "omega", nb)).toBe(null);
    expect(categoryError({ gamma: 500 }, undefined, nb)).toBe(null);
  });

  it("cannot be more severe than the old test on any row", () => {
    // The property that makes the replacement safe to swap in: wherever the
    // corpus can speak, a row the strict test kept is never one this kills for
    // a founder whose sector the fund has funded.
    const kept: Record<string, number>[] = [{ alpha: 5, gamma: 5 }, { beta: 3 }, { alpha: 1 }];
    for (const mix of kept) {
      expect(categoryError(mix, "alpha", nb)).not.toBe(true);
    }
  });
});

describe("awardMismatch", () => {
  it("is null when the band is unknown or the row prints no median", () => {
    expect(awardMismatch(1000, "no_such_band")).toBe(null);
    expect(awardMismatch(null, "b500k_2m5")).toBe(null);
  });
  it("fires an order of magnitude below the floor of the band and not above it", () => {
    expect(awardMismatch(49_000, "b500k_2m5")).toBe(true);
    expect(awardMismatch(51_000, "b500k_2m5")).toBe(false);
    expect(awardMismatch(900_000_000, "b500k_2m5")).toBe(false);
  });
  it("takes the divisor from its caller so a sensitivity can be swept", () => {
    expect(awardMismatch(49_000, "b500k_2m5", 100)).toBe(false);
  });
});

describe("menu parsing", () => {
  const prompt = [
    "preamble", "", "CANDIDATES",
    "[0] First scheme",
    "     DE · Grants · typical award EUR 503k over 35 real awards · mostly alpha",
    "",
    "[1] Second scheme · disambiguator",
    "     FR · Grants · typical award EUR 2.5M over 8 real awards",
    "",
  ].join("\n");
  const rows = menuRows(prompt);

  it("recovers each row, its index, its title and its indented block", () => {
    expect(rows.map((r) => r.i)).toEqual([0, 1]);
    expect(rows[0].title).toBe("First scheme");
    expect(rows[1].title).toBe("Second scheme · disambiguator");
    expect(rows[0].block).toContain("mostly alpha");
  });

  it("reads the award median in every unit the row can print", () => {
    expect(awardMedian(rows[0].block)).toBe(503_000);
    expect(awardMedian(rows[1].block)).toBe(2_500_000);
    expect(awardMedian("no median here")).toBe(null);
  });

  it("returns nothing for a prompt with no candidate block", () => {
    expect(menuRows("just prose")).toEqual([]);
  });
});

describe("the title join", () => {
  const byName = titleIndex([
    { id: "a", name: "A scheme with a very long name that the row will have to cut short somewhere", sectorMix: null },
    { id: "b", name: "Short name", sectorMix: null },
    { id: "c", name: "Short name", sectorMix: null },
  ]);

  it("resolves a title the row printed whole", () => {
    expect(resolveTitle("Short name", byName).sort()).toEqual(["b", "c"]);
  });
  it("resolves a title the row truncated with an ellipsis", () => {
    expect(resolveTitle("A scheme with a very long name that the row will...", byName)).toEqual(["a"]);
  });
  it("resolves a title the row disambiguated with a suffix", () => {
    expect(resolveTitle("Short name · grant innovation", byName).sort()).toEqual(["b", "c"]);
  });
  it("returns nothing rather than guessing for a title it does not hold", () => {
    expect(resolveTitle("Nothing like this", byName)).toEqual([]);
  });
});

describe("themeMismatch, the retired test", () => {
  it("is null on a row with no descriptor and for a founder with no label", () => {
    expect(themeMismatch("[0] x", "alpha")).toBe(null);
    expect(themeMismatch("[0] x · mostly alpha", undefined)).toBe(null);
  });
  it("is exactly string equality, which is why it was retired", () => {
    expect(themeMismatch("[0] x · mostly alpha", "alpha")).toBe(false);
    expect(themeMismatch("[0] x · mostly beta", "alpha")).toBe(true);
  });
});
