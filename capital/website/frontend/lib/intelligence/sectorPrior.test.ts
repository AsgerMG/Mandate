import { describe, expect, it } from "vitest";
import { SECTOR_MATCH, sectorScorer, sectorWeight } from "./sectorPrior";
import { loadDbInstruments, publishableInstruments, type DbInstrument } from "./corpus";

/**
 * These hold the PROPERTIES of the sector chooser, not a list of funds.
 *
 * Every rule below is expressed over the shipped corpus by SHAPE — "a regime
 * whose leaves differ in specialisation", never a named regime — so a corpus
 * rebuild that changes which funds exist still fails the build if it breaks the
 * contract. The properties that matter are the DEGRADATION ones: a chooser that
 * is right on the median company and returns noise on an unusual one is worse
 * than no chooser at all, because the caller cannot tell the two apart.
 */

/** A regime whose publishable leaves genuinely differ on some sector, chosen by
 *  shape. That is the only case the scorer is allowed to speak in, so it is the
 *  case every test needs. */
function pickRegime(): { group: DbInstrument[]; sector: string } {
  const byRegime = new Map<string, DbInstrument[]>();
  for (const i of publishableInstruments()) {
    if (!i.parentId) continue;
    (byRegime.get(i.parentId) ?? byRegime.set(i.parentId, []).get(i.parentId)!).push(i);
  }
  for (const group of byRegime.values()) {
    if (group.length < 3) continue;
    const sectors = new Set(group.flatMap((i) => Object.keys(i.sectorMix ?? {})));
    for (const s of sectors) {
      const w = group.map((i) => sectorWeight(i, s)).filter((v) => v !== undefined);
      if (w.length >= 2 && new Set(w).size > 1 && w.some((v) => v! > 0)) return { group, sector: s };
    }
  }
  throw new Error("no regime whose leaves differ in sector specialisation — either "
    + "sector_mix is empty or the corpus no longer splits regimes into leaves");
}

describe("the weight says what it claims to say", () => {
  it("is undefined, never zero, when the fund has no mix on record", () => {
    // A gap in our classification is not an absence of recipients, and a caller
    // that cannot tell those apart will rank an unclassified fund last rather
    // than neutrally.
    const bare = { sectorMix: null } as unknown as DbInstrument;
    expect(sectorWeight(bare, "any_sector")).toBeUndefined();
    expect(sectorWeight({ sectorMix: {} } as unknown as DbInstrument, "any")).toBeUndefined();
  });

  it("rises with specialisation at equal evidence", () => {
    const a = { sectorMix: { x: 90, y: 10 } } as unknown as DbInstrument;
    const b = { sectorMix: { x: 50, y: 50 } } as unknown as DbInstrument;
    expect(sectorWeight(a, "x")!).toBeGreaterThan(sectorWeight(b, "x")!);
  });

  it("rises with evidence at equal specialisation", () => {
    // 60% of three hundred is a stronger claim than 60% of three, and a chooser
    // that cannot tell them apart hands slots to funds with two awards.
    const many = { sectorMix: { x: 300, y: 200 } } as unknown as DbInstrument;
    const few = { sectorMix: { x: 3, y: 2 } } as unknown as DbInstrument;
    expect(sectorWeight(many, "x")!).toBeGreaterThan(sectorWeight(few, "x")!);
  });

  it("is zero for a sector the fund has never funded, whatever its size", () => {
    const big = { sectorMix: { x: 10_000 } } as unknown as DbInstrument;
    expect(sectorWeight(big, "y")).toBe(0);
  });
});

describe("the scorer degrades to neutral rather than to noise", () => {
  const NEUTRAL = 1;

  it("returns exactly neutral when the founder's sector is unknown", () => {
    const { group } = pickRegime();
    const score = sectorScorer(group, undefined);
    for (const i of group) expect(score(i)).toBe(NEUTRAL);
  });

  it("returns exactly neutral when no leaf has ever funded the sector", () => {
    const { group } = pickRegime();
    // A sector string the corpus cannot hold, so every leaf's weight is 0.
    const score = sectorScorer(group, "__a_sector_no_fund_has_ever_paid_into__");
    for (const i of group) expect(score(i)).toBe(NEUTRAL);
  });

  it("returns exactly neutral for a leaf alone in its regime here", () => {
    const { group, sector } = pickRegime();
    const solo = group[0];
    const score = sectorScorer([solo], sector);
    expect(score(solo)).toBe(NEUTRAL);
  });

  it("leaves a leaf with no mix on record at neutral, not at the bottom", () => {
    const { group, sector } = pickRegime();
    const blind = { ...group[0], id: `${group[0].id}__no_mix`, sectorMix: null };
    const score = sectorScorer([...group, blind], sector);
    expect(score(blind)).toBe(NEUTRAL);
  });

  it("never moves a leaf further than the declared multiplier", () => {
    // The whole safety argument for a multiplicative sibling signal is that its
    // range is bounded and stated. If this fails, the signal can dominate every
    // other term in whatever sort multiplies it.
    const { group, sector } = pickRegime();
    const score = sectorScorer(group, sector);
    for (const i of group) {
      expect(score(i)).toBeGreaterThanOrEqual(1 / SECTOR_MATCH - 1e-9);
      expect(score(i)).toBeLessThanOrEqual(SECTOR_MATCH + 1e-9);
    }
  });
});

describe("the scorer compares inside one regime and never across", () => {
  it("scores a leaf identically whether or not other regimes are present", () => {
    // The measured failure this guards: folded into the CHANNEL-scoped sibling
    // reassignment, a per-regime multiplier still ranked one regime's
    // specialist against another regime's singleton and cost three points of
    // EXACT@5. Handing the scorer a wider list must not change any leaf's
    // score, so a caller cannot make that mistake silently.
    const { group, sector } = pickRegime();
    const alone = sectorScorer(group, sector);
    const others = publishableInstruments()
      .filter((i) => i.parentId && i.parentId !== group[0].parentId)
      .slice(0, 200);
    const together = sectorScorer([...group, ...others], sector);
    for (const i of group) expect(together(i)).toBeCloseTo(alone(i), 12);
  });

  it("ranks a regime's most specialised leaf above its least", () => {
    const { group, sector } = pickRegime();
    const score = sectorScorer(group, sector);
    const known = group.filter((i) => sectorWeight(i, sector) !== undefined);
    const best = known.reduce((a, b) => (sectorWeight(b, sector)! > sectorWeight(a, sector)! ? b : a));
    const worst = known.reduce((a, b) => (sectorWeight(b, sector)! < sectorWeight(a, sector)! ? b : a));
    expect(score(best)).toBeGreaterThan(score(worst));
  });
});

describe("the corpus still supports the signal at all", () => {
  it("holds a sector mix for the great majority of publishable leaves", () => {
    // If a corpus rebuild drops sector_mix, every number in sectorPrior.ts's
    // header becomes a claim about data that is no longer there, and the
    // scorer silently returns neutral for everything.
    const pub = publishableInstruments();
    const withMix = pub.filter((i) => i.sectorMix && Object.keys(i.sectorMix).length > 0);
    expect(withMix.length / pub.length).toBeGreaterThan(0.8);
  });

  it("still splits regimes into many leaves, which is why a chooser is needed", () => {
    const byRegime = new Map<string, number>();
    for (const i of publishableInstruments()) {
      if (i.parentId) byRegime.set(i.parentId, (byRegime.get(i.parentId) ?? 0) + 1);
    }
    const multi = [...byRegime.values()].filter((n) => n > 1);
    expect(multi.length).toBeGreaterThan(0);
    expect(Math.max(...multi)).toBeGreaterThan(20);
  });

  it("loads the same instruments the scorer will be handed", () => {
    expect(loadDbInstruments().length).toBeGreaterThan(publishableInstruments().length);
  });
});
