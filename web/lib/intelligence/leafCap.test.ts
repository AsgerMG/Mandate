// The leaf-cap guard, tested on the two shapes that actually caused the defect.
//
// A guard is only worth the failure it can prove it produces, so the poison
// cases here are not synthetic: they are the two states the corpus has really
// been in, expressed as counts.
import { describe, expect, it } from "vitest";
import { leafCapGroups, leafCapVerdict } from "./leafCap";

const many = (n: number, channel: string, country: string) =>
  Array.from({ length: n }, () => ({ sourceFamilyBucket: channel, country }));

describe("leafCapGroups", () => {
  it("counts EU-wide instruments into every country's group, not beside them", () => {
    // The failure this pins: an EU instrument competes for the same per-channel
    // slots as a national one, so a count that keeps them apart reports a
    // channel as safe while the set the cap actually sees is larger.
    const groups = leafCapGroups([
      ...many(3, "eic", "EU"),
      ...many(2, "eic", "DE"),
      ...many(1, "eic", "FR"),
    ]);
    expect(groups.find((g) => g.country === "DE")?.n).toBe(5);
    expect(groups.find((g) => g.country === "FR")?.n).toBe(4);
    // And the founder whose country holds nothing in this channel still sees
    // the EU-wide ones.
    expect(groups.find((g) => g.country === "EU only")?.n).toBe(3);
  });

  it("keeps channels separate, because the cap is applied per channel", () => {
    const groups = leafCapGroups([
      ...many(4, "state_aid_satr", "DE"),
      ...many(7, "national_dev_banks", "DE"),
    ]);
    expect(groups[0]).toMatchObject({ channel: "national_dev_banks", country: "DE", n: 7 });
    expect(groups.find((g) => g.channel === "state_aid_satr")?.n).toBe(4);
  });

  it("is a total order, so the reported worst group cannot vary between runs", () => {
    const tied = [...many(5, "b_channel", "DE"), ...many(5, "a_channel", "DE")];
    expect(leafCapGroups(tied)[0].channel).toBe("a_channel");
    expect(leafCapGroups([...tied].reverse())[0].channel).toBe("a_channel");
  });
});

describe("leafCapVerdict", () => {
  const corpus = [
    ...many(87, "state_aid_satr", "ES"),
    ...many(79, "national_dev_banks", "FR"),
    ...many(72, "state_aid_satr", "DE"),
  ];

  it("passes, and reports headroom, when nothing is cut", () => {
    const v = leafCapVerdict(corpus, 90);
    expect(v.over).toHaveLength(0);
    expect(v.worst).toMatchObject({ channel: "state_aid_satr", country: "ES", n: 87 });
    expect(v.headroom).toBe(3);
  });

  it("FAILS at 40 — the cap that shipped while it was the top defect", () => {
    const v = leafCapVerdict(corpus, 40);
    expect(v.over.map((g) => g.country)).toEqual(["ES", "FR", "DE"]);
    expect(v.headroom).toBeLessThan(0);
  });

  it("FAILS at 14 — the cap that shipped for months before that", () => {
    const v = leafCapVerdict(corpus, 14);
    expect(v.over).toHaveLength(3);
  });

  it("catches a widening of exactly one instrument, which is the whole point", () => {
    // The corpus does not widen by leaps; it widens by a load. A guard that only
    // fires on a large jump would have missed both real occurrences, which crept
    // over the line the same way.
    expect(leafCapVerdict(corpus, 87).over).toHaveLength(0);
    expect(leafCapVerdict([...corpus, ...many(1, "state_aid_satr", "ES")], 87).over)
      .toHaveLength(1);
  });

  it("does not mistake a corpus-wide total for a per-founder count", () => {
    // 342 SATR instruments exist, but no single-country founder sees them all.
    // A guard written against the bucket total would fail permanently and be
    // switched off, which is worse than not having one.
    const spread = ["ES", "DE", "IT", "FR"].flatMap((c) => many(60, "state_aid_satr", c));
    expect(spread).toHaveLength(240);
    expect(leafCapVerdict(spread, 90).over).toHaveLength(0);
  });
});
