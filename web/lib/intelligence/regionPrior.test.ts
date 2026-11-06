import { describe, expect, it } from "vitest";
import { deliveryRegionOf, recipientsIn, regionFootprints } from "./regionPrior";
import { regionScorer } from "./shortlist";
import { loadDbInstruments, type DbInstrument } from "./corpus";

/**
 * These hold the PROPERTIES of region routing, not a list of funds.
 *
 * The signal exists to separate leaves that share a scheme name because they
 * are one notified scheme delivered by many bodies. Every rule below is
 * expressed over the shipped artifact rather than over named instruments, so a
 * corpus rebuild that changes which funds exist still fails the build if it
 * breaks the contract.
 */
/** A real notified scheme delivered by more than one body, chosen by SHAPE and
 *  never by name: one member whose recipients sit in a single NUTS-1 region,
 *  one that pays across its whole country. That pairing is the case the whole
 *  signal exists for, and picking it from the corpus rather than pinning ids
 *  means a rebuild that changes which schemes exist still tests the contract. */
function pickScheme(): { group: DbInstrument[]; regional: DbInstrument; national: DbInstrument } {
  const fp = regionFootprints();
  const byScheme = new Map<string, DbInstrument[]>();
  for (const i of loadDbInstruments()) {
    const code = (i.schemeCode ?? "").trim();
    if (!code || !fp[i.id]) continue;
    (byScheme.get(code) ?? byScheme.set(code, []).get(code)!).push(i);
  }
  for (const group of byScheme.values()) {
    if (group.length < 2) continue;
    const regional = group.find((i) => (deliveryRegionOf(i.id) ?? "").length === 3);
    const national = group.find((i) => !deliveryRegionOf(i.id) && (fp[i.id]?.n ?? 0) >= 40);
    if (regional && national) return { group, regional, national };
  }
  throw new Error("no scheme delivered by both a regional and a national body — "
    + "either the artifact is empty or the corpus no longer splits schemes by body");
}

describe("the artifact is present and shaped as the ranker expects", () => {
  it("ships a footprint for a meaningful share of the corpus", () => {
    // Emitted by ETL/terms/emit_region_prior.py. If this is empty the scorer
    // silently degrades to neutral and the whole signal disappears without a
    // single test failing anywhere else.
    expect(Object.keys(regionFootprints()).length).toBeGreaterThan(200);
  });
  it("counts every award in n, including the ones filed at country level", () => {
    for (const [, f] of Object.entries(regionFootprints())) {
      const resolved = Object.values(f.mix).reduce((a, b) => a + b, 0);
      // n is the honest denominator, so it can only be larger.
      expect(f.n).toBeGreaterThanOrEqual(resolved);
    }
  });
});

describe("containment is hierarchical, not string equality", () => {
  it("a recipient recorded at NUTS-3 satisfies a founder answering at NUTS-1", () => {
    // The register reports recipients as far down as level 3; a founder is only
    // ever offered levels 1 and 2. Equality would score every such award as a
    // miss and the footprint would read as empty.
    const fp = regionFootprints();
    const deep = Object.entries(fp).find(([, f]) =>
      Object.keys(f.mix).some((k) => k.length >= 5));
    expect(deep).toBeDefined();
    const [id, f] = deep!;
    const code = Object.keys(f.mix).find((k) => k.length >= 5)!;
    expect(recipientsIn(id, code.slice(0, 3))).toBeGreaterThan(0);
  });
  it("a fund with no record answers undefined, never zero", () => {
    // Absent means unknown. A caller reading it as "no recipients here" would
    // punish a fund for a gap in the register.
    expect(recipientsIn("a-fund-that-does-not-exist", "FRD")).toBeUndefined();
  });
});

describe("a national body has no regional claim", () => {
  it("delivers everywhere, so its delivery region is undefined and not its country", () => {
    const { national } = pickScheme();
    expect(deliveryRegionOf(national.id)).toBeUndefined();
    // But it is still reachable from anywhere it has actually paid: a founder
    // in one of its regions must not be told this door is closed.
    const someRegion = Object.keys(regionFootprints()[national.id].mix)
      .find((k) => k.length >= 3)!;
    expect(recipientsIn(national.id, someRegion.slice(0, 3))).toBeGreaterThan(0);
  });
});

describe("the scorer only speaks when it has something to say", () => {
  it("is neutral when the founder has not been asked their region", () => {
    const { group } = pickScheme();
    const score = regionScorer(group, undefined);
    for (const l of group) expect(score(l)).toBe(1);
  });

  it("is neutral for a fund with no footprint, so a gap is never a penalty", () => {
    const { group, regional } = pickScheme();
    const orphan = { ...regional, id: "no-such-fund" } as DbInstrument;
    const score = regionScorer([...group, orphan], deliveryRegionOf(regional.id)!);
    expect(score(orphan)).toBe(1);
  });

  it("is neutral for a scheme none of whose bodies pay into that region", () => {
    // The answer separates nothing here and must not reorder anything.
    const { group } = pickScheme();
    const nowhere = group.find((l) => (recipientsIn(l.id, "IS0") ?? 0) > 0);
    expect(nowhere).toBeUndefined();
    const score = regionScorer(group, "IS0");
    for (const l of group) expect(score(l)).toBe(1);
  });

  it("never compares across notified schemes, only inside one", () => {
    // The constraint that keeps this from becoming a size prior. A leaf that
    // shares its registration with nobody on the shortlist has nothing to be
    // ranked against, so it scores neutral however large its footprint.
    const { regional } = pickScheme();
    const alone = regionScorer([regional], deliveryRegionOf(regional.id)!);
    expect(alone(regional)).toBe(1);
  });

  it("prefers the body whose recipients are actually there", () => {
    // The whole point, stated as an ordering over the real corpus: among the
    // bodies delivering ONE scheme, the one with more recipients in the
    // founder's region scores higher. This is P(fund | region) — the count —
    // and NOT that count as a share of the fund's own size, which is the
    // inversion sectorFit makes.
    const { group } = pickScheme();
    const region = deliveryRegionOf(group.find((l) => deliveryRegionOf(l.id))!.id)!;
    const score = regionScorer(group, region);
    const ranked = [...group].sort((a, b) => score(b) - score(a));
    const counts = ranked.map((l) => recipientsIn(l.id, region) ?? -1);
    for (let i = 1; i < counts.length; i++) expect(counts[i - 1]).toBeGreaterThanOrEqual(counts[i]);
  });
});
