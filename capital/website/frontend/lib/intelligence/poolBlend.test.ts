// The blended pool score: what it promises the caller, and the two guards that
// have to be able to FAIL.
//
// Nothing here re-derives the fitted weights or re-measures the blend. Those
// live on the tune/holdout split (`scripts/fit_signal_blend.ts`) and a unit
// test that reproduced them would only be asserting that a number was typed
// correctly. What is tested here is everything the fit assumed and the
// production caller now depends on: that a column's weight is attached to it by
// NAME, that a candidate's score is defined only against its own pool, that the
// output lands on the scale the row sort multiplies into, and that both guards
// throw when they should rather than being green because nobody has tried.
import { describe, expect, it } from "vitest";

import type { DbInstrument } from "./corpus";
import {
  assertOneOrdering, BLEND_SIGNALS, BLEND_WEIGHTS, blendPoolScores, homeFirstScores,
  parsePoolBlend, parseRowProximity, proximityFit, rankNormalise, reconcileBlendColumns,
  shuffleScores,
  type BlendContext,
} from "./poolBlend";

const inst = (id: string, over: Partial<DbInstrument> = {}): DbInstrument => ({
  id, parentId: null, name: id, country: "DE", capitalType: "grant",
  isFramework: false, eventCount: 10, companyCount: 5, totalEur: 1_000_000,
  sourceFamilyBucket: null, sampleProjectTitles: null, administeringBody: null,
  administeringBodyShare: null, lastYear: 2025, gates: [],
  ...(over as object),
} as DbInstrument);

const ctx = (over: Partial<BlendContext> = {}): BlendContext => ({
  founderSector: "deeptech",
  founderCountries: ["DE"],
  ticketBand: "b500k_2m5",
  theme: new Map(),
  eligibility: undefined,
  peerRank: new Map(),
  year: 2026,
  ...over,
});

describe("the weights are bound to the columns by name", () => {
  it("has one fitted weight per signal and no orphans", () => {
    expect(() => reconcileBlendColumns(
      Object.keys(BLEND_SIGNALS), Object.keys(BLEND_WEIGHTS))).not.toThrow();
    expect(Object.keys(BLEND_SIGNALS).length).toBe(14);
  });

  // The guard, watched failing. A renamed column is the realistic mistake: the
  // signal still computes, the weight still exists, and without this the score
  // silently loses a term while every published figure keeps its old name.
  it("throws when a column is renamed", () => {
    const renamed = Object.keys(BLEND_SIGNALS)
      .map((k) => (k === "proximity (home country)" ? "proximity" : k));
    expect(() => reconcileBlendColumns(renamed, Object.keys(BLEND_WEIGHTS)))
      .toThrow(/proximity/);
  });

  it("throws when a signal is added without a refit", () => {
    expect(() => reconcileBlendColumns(
      [...Object.keys(BLEND_SIGNALS), "brand new idea"], Object.keys(BLEND_WEIGHTS)))
      .toThrow(/brand new idea/);
  });

  it("throws when a weight survives the signal it belonged to", () => {
    expect(() => reconcileBlendColumns(
      Object.keys(BLEND_SIGNALS).filter((k) => k !== "total EUR"),
      Object.keys(BLEND_WEIGHTS))).toThrow(/total EUR/);
  });
});

describe("the arm flag", () => {
  it("defaults to off and reads the three arms", () => {
    expect(parsePoolBlend(undefined)).toBe("off");
    expect(parsePoolBlend("off")).toBe("off");
    expect(parsePoolBlend("on")).toBe("on");
    expect(parsePoolBlend("pure")).toBe("pure");
    expect(parsePoolBlend("shuffle")).toBe("shuffle");
  });

  // An arm that silently falls back to shipped reports "no effect" and cannot
  // be told from a flag that never arrived. That is the shape of every false
  // null in this project's history, so the misspelling has to be loud.
  it("reads the null arm too, so a misspelt null cannot read as `off`", () => {
    expect(parsePoolBlend("shuffle")).toBe("shuffle");
    expect(() => parsePoolBlend("shuffled")).toThrow(/unknown POOL_BLEND=shuffled/);
  });

  it("throws on anything else rather than reading as off", () => {
    expect(() => parsePoolBlend("ON")).toThrow(/unknown POOL_BLEND=ON/);
    expect(() => parsePoolBlend("true")).toThrow(/unknown POOL_BLEND/);
    expect(() => parsePoolBlend("")).toThrow(/unknown POOL_BLEND/);
  });
});

describe("proximity, the term the shipped row score does not contain", () => {
  it("separates home, EU-wide and unreachable into three values", () => {
    const home = proximityFit(inst("a", { country: "DE" }), ["DE"]);
    const eu = proximityFit(inst("b", { country: "EU" }), ["DE"]);
    const away = proximityFit(inst("c", { country: "LV" }), ["DE"]);
    expect(home).toBeGreaterThan(eu);
    expect(eu).toBeGreaterThan(away);
  });

  // Production hands this whatever the intake supplied -- `founderCountryList`
  // returns target markets and entity countries verbatim, and those are
  // sometimes names. Comparing a name against an ISO2 code is the exact defect
  // wsCT found in `entityCountries`, where `["Denmark"]` was false for `["DK"]`
  // and 51 of 58 apparent deletions were an artefact of it.
  it("normalises the FOUNDER's side, so a country name is not a miss", () => {
    expect(proximityFit(inst("a", { country: "DK" }), ["Denmark"])).toBe(1);
    expect(proximityFit(inst("a", { country: "DK" }), ["DK"])).toBe(1);
  });

  it("is not a home-country match when the founder has no country at all", () => {
    expect(proximityFit(inst("a", { country: "DE" }), [])).toBe(0);
  });
});

describe("rank normalisation", () => {
  it("puts ties on the same value", () => {
    // A feature that cannot tell two candidates apart must not order them
    // through an artefact of the sort.
    const out = rankNormalise([5, 5, 1, 9]);
    expect(out[0]).toBe(out[1]);
    expect(out[2]).toBeLessThan(out[0]);
    expect(out[3]).toBeGreaterThan(out[0]);
  });

  it("spans [0,1] and gives a constant column no opinion", () => {
    expect(rankNormalise([3, 1, 2])).toEqual([1, 0, 0.5]);
    expect(rankNormalise([7, 7, 7])).toEqual([0.5, 0.5, 0.5]);
  });
});

describe("blendPoolScores", () => {
  it("scores every member of the pool and nothing else", () => {
    const pool = [inst("a"), inst("b", { country: "LV" }), inst("c", { country: "EU" })];
    const out = blendPoolScores(pool, ctx());
    expect([...out.keys()].sort()).toEqual(["a", "b", "c"]);
  });

  // The contract the row sort depends on. `ticketFit` MULTIPLIES this score,
  // and a multiplier below 1 applied to a negative number promotes the row
  // instead of demoting it -- so a raw conditional-logit sum, which is signed,
  // could not be handed to the shipped machinery at all.
  it("returns values in [0,1], never negative", () => {
    const pool = ["a", "b", "c", "d", "e"].map((id, k) =>
      inst(id, { country: k % 2 ? "LV" : "DE", eventCount: k * 7, totalEur: k * 1e6 }));
    for (const v of blendPoolScores(pool, ctx()).values()) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("gives a pool of one the neutral rather than the top", () => {
    expect(blendPoolScores([inst("a")], ctx()).get("a")).toBe(0.5);
    expect(blendPoolScores([], ctx()).size).toBe(0);
  });

  // The largest fitted weight, end to end through the whole vector: on a pool
  // that differs in nothing else, the founder's own country outranks EU-wide
  // and EU-wide outranks a country they cannot draw on.
  it("ranks the founder's own country above EU-wide above unreachable", () => {
    const pool = [inst("away", { country: "LV" }), inst("eu", { country: "EU" }),
      inst("home", { country: "DE" })];
    const s = blendPoolScores(pool, ctx());
    expect(s.get("home")!).toBeGreaterThan(s.get("eu")!);
    expect(s.get("eu")!).toBeGreaterThan(s.get("away")!);
  });

  // POOL-RELATIVE BY CONSTRUCTION, which is why the caller computes it once per
  // request over the whole pool and must never cache one across requests. The
  // weights were fitted on within-pool percentile ranks; a score carried
  // between two pools is a number about a population it was not measured on.
  it("is defined only against its own pool", () => {
    const home = inst("home", { country: "DE" });
    const alone = blendPoolScores([home, inst("x", { country: "DE" })], ctx()).get("home")!;
    const crowded = blendPoolScores(
      [home, ...["p", "q", "r"].map((id) => inst(id, { country: "DE", eventCount: 900 }))],
      ctx()).get("home")!;
    expect(alone).not.toBe(crowded);
  });

  it("uses the founder's own semantic scores where it has them", () => {
    const pool = [inst("a"), inst("b")];
    const hot = blendPoolScores(pool, ctx({ theme: new Map([["a", 0.99], ["b", 0.01]]) }));
    const cold = blendPoolScores(pool, ctx({ theme: new Map([["a", 0.01], ["b", 0.99]]) }));
    expect(hot.get("a")!).toBeGreaterThan(hot.get("b")!);
    expect(cold.get("a")!).toBeLessThan(cold.get("b")!);
  });

  // A signal with no opinion takes the pool's median of the candidates it does
  // have one about, so a gap in our data neither buries nor promotes a row.
  // Here nothing in the pool differs at all, so every column is constant and
  // the whole blend must tie -- the answer that says "this score separated
  // nothing", which `scoreSeats` downstream reads as zero seats.
  it("ties a pool it cannot separate rather than inventing an order", () => {
    const pool = [inst("a"), inst("b"), inst("c")];
    const s = blendPoolScores(pool, ctx());
    expect(new Set(s.values()).size).toBe(1);
  });
});

// ── THE ISOLATED PROXIMITY ARM ─────────────────────────────────────────────
//
// `homeFirstScores` exists to attribute the blend's largest weight, so what it
// has to guarantee is exactly two things: that the stratum is STRICT (no base
// score, however good, lifts an EU-wide row past a home one) and that it is a
// tie-break and nothing more inside each stratum. Both are asserted here, and
// so is the throw that protects the first one.
describe("homeFirstScores", () => {
  const de = (id: string) => inst(id, { country: "DE" });
  const eu = (id: string) => inst(id, { country: "EU" });

  it("puts every home row above every EU-wide row, whatever the base score says", () => {
    const pool = [eu("eu_best"), de("de_worst"), eu("eu_ok"), de("de_ok")];
    const base = new Map([["eu_best", 1], ["eu_ok", 0.9], ["de_ok", 0.2], ["de_worst", 0]]);
    const s = homeFirstScores(pool, ["DE"], (id) => base.get(id) ?? 0);
    expect(s.get("de_worst")!).toBeGreaterThan(s.get("eu_best")!);
    expect(s.get("de_ok")!).toBeGreaterThan(s.get("de_worst")!);
    expect(s.get("eu_best")!).toBeGreaterThan(s.get("eu_ok")!);
  });

  it("keeps the shipped order inside a stratum", () => {
    const pool = [de("a"), de("b"), de("c")];
    const base = new Map([["a", 0.1], ["b", 0.9], ["c", 0.5]]);
    const s = homeFirstScores(pool, ["DE"], (id) => base.get(id) ?? 0);
    expect(s.get("b")!).toBeGreaterThan(s.get("c")!);
    expect(s.get("c")!).toBeGreaterThan(s.get("a")!);
  });

  // The stratum term is 1 and only dominates a base inside the unit interval.
  // A base outside it would make this a WEIGHTING wearing the word
  // "stratification", which is the claim the finding rests on.
  it("refuses a base score it cannot dominate", () => {
    expect(() => homeFirstScores([de("a")], ["DE"], () => 4.2))
      .toThrow(/outside \[0,1\]/);
  });

  it("throws rather than defaulting to off on a misspelling", () => {
    expect(() => parseRowProximity("FIRST")).toThrow(/unknown ROW_PROXIMITY=FIRST/);
    expect(() => parseRowProximity("on")).toThrow(/unknown ROW_PROXIMITY/);
    expect(parseRowProximity(undefined)).toBe("off");
  });

  // Two arms that both REPLACE the base score do not compose: one would win and
  // the run would be reported under both names.
  it("refuses two orderings on one table", () => {
    expect(() => assertOneOrdering("on", "first")).toThrow(/do not compose/);
    expect(() => assertOneOrdering("pure", "first")).toThrow(/do not compose/);
    expect(() => assertOneOrdering("off", "first")).not.toThrow();
    expect(() => assertOneOrdering("on", "off")).not.toThrow();
  });
});


/** The null arm has to be a NULL: a real permutation, stable enough to
 *  reproduce and different enough between seeds to be a distribution. A null
 *  that quietly returned the incoming order would make every arm look good, and
 *  nothing else in the file would notice. */
describe("the shuffle arm, which is the null `on` is judged against", () => {
  const pool = Array.from({ length: 40 }, (_, k) => inst(`i${k}`));

  it("returns one percentile per candidate, on the same [0,1] scale as the blend", () => {
    const out = shuffleScores(pool, 1);
    expect(out.size).toBe(pool.length);
    const vals = [...out.values()].sort((a, b) => a - b);
    expect(vals[0]).toBe(0);
    expect(vals[vals.length - 1]).toBe(1);
    // A permutation, not a heap of ties: every candidate gets its own rank.
    expect(new Set(vals).size).toBe(pool.length);
  });

  it("is reproducible for one seed and different for another", () => {
    const a = shuffleScores(pool, 1);
    const b = shuffleScores(pool, 1);
    const c = shuffleScores(pool, 2);
    expect([...a.entries()]).toEqual([...b.entries()]);
    expect([...a.entries()]).not.toEqual([...c.entries()]);
  });

  it("does not simply hand back the order it was given", () => {
    const out = shuffleScores(pool, 1);
    const asGiven = pool.map((_, k) => k / (pool.length - 1));
    expect(pool.map((i) => out.get(i.id))).not.toEqual(asGiven);
  });

  it("depends on the pool's membership, not on the order it arrives in", () => {
    const forward = shuffleScores(pool, 1);
    const backward = shuffleScores([...pool].reverse(), 1);
    // Same pool, same seed, same score per candidate however it was presented:
    // a null correlated with the incoming order would be a null for nothing.
    for (const i of pool) expect(backward.get(i.id)).toBe(forward.get(i.id));
  });
});
