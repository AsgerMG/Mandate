import { describe, expect, it } from "vitest";
import {
  evaluateSpec, frozenOrderRisk, matchesAny, NON_ANSWERS, type ValueSpec,
} from "./comparator";
import { BAND_ORDERS } from "./vocabulary";
import { TICKET_BANDS, bandFloorEur, bandForEur } from "./types";
import { LARGE_SCALE_MIN_EUR, opensLargeScaleLane } from "./shortlist";

/**
 * This module replaced TWO implementations that were meant to stay in step and
 * did not. These tests are what makes one implementation safe: every operator,
 * both answer shapes, and the null-not-false asymmetry that stops a missing
 * answer becoming a false blocker.
 */
describe("the divergence that motivated this module", () => {
  it("equals is case-insensitive", () => {
    // verdict.ts normalised, eligibility.ts did not, so the same rule passed on
    // one path and failed on the other. A rule hinging on capitalisation is a
    // rule nobody intended to write.
    const spec: ValueSpec = { op: "equals", field: "sector", value: "agrifood" };
    expect(evaluateSpec(spec, "agrifood")).toBe(true);
    expect(evaluateSpec(spec, "AgriFood")).toBe(true);
    expect(evaluateSpec(spec, " AGRIFOOD ")).toBe(true);
    expect(evaluateSpec(spec, "software_data_ai")).toBe(false);
  });
});

describe("null is never false", () => {
  const spec: ValueSpec = { op: "in", field: "sector", allowed: ["agrifood"] };
  it.each([...NON_ANSWERS])('"%s" is unanswered, not a failure', (v) => {
    expect(evaluateSpec(spec, v)).toBeNull();
  });
  it.each([undefined, null, "", "   ", 42, {}, []])("%p is unanswered", (v) => {
    expect(evaluateSpec(spec, v)).toBeNull();
  });
});

describe("both answer shapes", () => {
  it("matches a string answer and an array answer identically", () => {
    const spec: ValueSpec = { op: "in", field: "entityCountries", allowed: ["Spain"] };
    expect(evaluateSpec(spec, "Spain")).toBe(true);
    expect(evaluateSpec(spec, ["Spain"])).toBe(true);
    expect(evaluateSpec(spec, ["France", "Spain"])).toBe(true);
    expect(evaluateSpec(spec, ["France"])).toBe(false);
  });
  it("ignores non-answers inside a list but keeps real ones", () => {
    expect(matchesAny(["unsure", "Spain"], ["Spain"])).toBe(true);
    expect(matchesAny(["unsure"], ["Spain"])).toBeNull();
  });
});

describe("every operator", () => {
  const order = ["research", "prototype", "pilot_customers", "scaling_revenue"];
  it("band_max is inclusive of the ceiling", () => {
    const s: ValueSpec = { op: "band_max", field: "developmentStage", maxAllowed: "prototype", order };
    expect(evaluateSpec(s, "prototype")).toBe(true);
    expect(evaluateSpec(s, "research")).toBe(true);
    expect(evaluateSpec(s, "scaling_revenue")).toBe(false);
    expect(evaluateSpec(s, "not-a-band")).toBeNull();
  });
  it("band_min is inclusive of the floor", () => {
    const s: ValueSpec = { op: "band_min", field: "developmentStage", minAllowed: "pilot_customers", order };
    expect(evaluateSpec(s, "pilot_customers")).toBe(true);
    expect(evaluateSpec(s, "scaling_revenue")).toBe(true);
    expect(evaluateSpec(s, "research")).toBe(false);
  });
  it("not_in inverts only a decided match", () => {
    const s: ValueSpec = { op: "not_in", field: "activities", allowed: ["tobacco"] };
    expect(evaluateSpec(s, ["tobacco"])).toBe(false);
    expect(evaluateSpec(s, ["financial_services"])).toBe(true);
    expect(evaluateSpec(s, ["unsure"])).toBeNull();
  });
  it("booleans read yes/no and nothing else", () => {
    const t: ValueSpec = { op: "boolean_true", field: "consortium" };
    const f: ValueSpec = { op: "boolean_false", field: "consortium" };
    expect(evaluateSpec(t, "yes")).toBe(true);
    expect(evaluateSpec(t, "no")).toBe(false);
    expect(evaluateSpec(t, "unsure")).toBeNull();
    expect(evaluateSpec(f, "no")).toBe(true);
    expect(evaluateSpec(f, "yes")).toBe(false);
  });
  it("numeric comparisons require a number", () => {
    const gte: ValueSpec = { op: "numeric_gte", field: "foundedYear", threshold: 2020 };
    expect(evaluateSpec(gte, 2021)).toBe(true);
    expect(evaluateSpec(gte, 2019)).toBe(false);
    expect(evaluateSpec(gte, "2021")).toBeNull();
  });
  it("an unknown operator is unanswerable, not a failure", () => {
    expect(evaluateSpec({ op: "sideways" } as unknown as ValueSpec, "x")).toBeNull();
  });
});

/**
 * The band order is the vocabulary's, not the spec's.
 *
 * Every band comparator in the corpus used to embed the band list as it stood
 * when the rule was encoded. Rebanding `ticketBand` made all 33 of those copies
 * stale at once, and the failure is silent in the worst way: an unrecognised
 * band yields null, null renders as "not assessable", and the rule is inert for
 * every founder forever. wsAX found `region` in exactly that state, and the
 * inertness is what let 41 of its rules be filed against the wrong field
 * without anything contradicting them.
 *
 * These tests state the property rather than the current band list, so they
 * still hold the next time the bands move.
 */
describe("a stale frozen band order cannot disable a rule", () => {
  it("evaluates a band the spec's own frozen order predates", () => {
    // The spec was encoded when `lt500k` was one band; the founder answers on
    // the scale that replaced it. The live vocabulary knows both bounds.
    const s: ValueSpec = {
      op: "band_max", field: "ticketBand", maxAllowed: "b500k_2m5",
      order: ["lt500k", "b500k_2m5", "b2m5_15m", "b15m_50m", "gt50m"],
    };
    expect(evaluateSpec(s, "b25k_100k")).toBe(true);
    expect(evaluateSpec(s, "b2m5_15m")).toBe(false);
  });

  it("needs no frozen order at all", () => {
    const s: ValueSpec = { op: "band_min", field: "ticketBand", minAllowed: "b500k_2m5" };
    expect(evaluateSpec(s, "lt25k")).toBe(false);
    expect(evaluateSpec(s, "b500k_2m5")).toBe(true);
    expect(evaluateSpec(s, "gt50m")).toBe(true);
  });

  it("still honours a frozen order for a field the vocabulary does not band", () => {
    // The premise here USED to name developmentStage as "a field the vocabulary
    // does not band". It does band it — BAND_ORDERS has carried a
    // developmentStage entry for some time — so this test passed while
    // exercising the live-order path and asserting nothing about the fallback
    // it is named for. A field the vocabulary genuinely does not band is the
    // only way to reach `frozen`, so the case is built from one.
    const order = ["seed", "series_a", "series_b"];
    const s: ValueSpec = { op: "band_max", field: "roundBand", maxAllowed: "series_a", order };
    expect(BAND_ORDERS.roundBand).toBeUndefined();
    expect(evaluateSpec(s, "seed")).toBe(true);
    expect(evaluateSpec(s, "series_b")).toBe(false);
  });
});

/**
 * The frozen band order, and the only two states of it worth failing a build on.
 *
 * `check_gate_field_reach` used to fail on the mere PRESENCE of an `order` key
 * and was red on 222 comparators, every one of them on a field with a live
 * order and byte-identical to it — unread by `bandOrderFor` and correct anyway.
 * These are the cases that replaced it, and they are here rather than in the
 * check so the property is proved without a database.
 */
describe("frozenOrderRisk", () => {
  it("is silent when the snapshot agrees with the live vocabulary", () => {
    // Dead bytes: bandOrderFor prefers BAND_ORDERS, so this copy is never read
    // and deleting it changes no founder's answer. This is all 222 of them.
    expect(frozenOrderRisk({
      op: "band_max", field: "fteBand", order: [...BAND_ORDERS.fteBand],
    })).toBeNull();
  });

  it("fails a snapshot that is LOAD-BEARING — no live order for the field", () => {
    // Nothing maintains it, and a value it predates makes the rule unassessable
    // for every founder forever. `region`'s shape.
    expect(frozenOrderRisk({
      op: "band_min", field: "roundBand", order: ["seed", "series_a"],
    })).toBe("load-bearing");
  });

  it("fails a snapshot that CONTRADICTS the live order", () => {
    // The live order wins, so the rule is judged on a scale its author did not
    // write it against. `lt500k`'s shape: rebanding tightened a rule twentyfold.
    expect(frozenOrderRisk({
      op: "band_max", field: "fteBand", order: ["1-9", "10-49"],
    })).toBe("contradicts");
    // Same members, different order, is still a different scale.
    expect(frozenOrderRisk({
      op: "band_max", field: "fteBand", order: [...BAND_ORDERS.fteBand].reverse(),
    })).toBe("contradicts");
  });

  it("says nothing about specs that carry no order, or no band", () => {
    expect(frozenOrderRisk({ op: "band_max", field: "fteBand" })).toBeNull();
    expect(frozenOrderRisk({ op: "in", field: "fteBand", order: ["x"] })).toBeNull();
  });
});

describe("the ticket bands partition the number line", () => {
  it("puts every amount in exactly one band, with no gap at an edge", () => {
    // Boundaries are exclusive upper bounds, so the edge value belongs to the
    // band ABOVE. Asserted on the edges themselves because that is the only
    // place a partition can be wrong.
    for (const b of TICKET_BANDS) {
      const lo = bandFloorEur(b.value)!;
      expect(bandForEur(lo)).toBe(b.value);
      if (b.maxEur != null) expect(bandForEur(b.maxEur - 1)).toBe(b.value);
    }
    expect(bandForEur(0)).toBe(TICKET_BANDS[0].value);
    expect(bandForEur(1e12)).toBe(TICKET_BANDS[TICKET_BANDS.length - 1].value);
  });

  it("opens the large-scale lane on a euro threshold, not a list position", () => {
    // This shipped as `BAND_INDEX[band] >= 3`, which meant "EUR 15M and up"
    // only while the list had five entries. Splitting the low end into three
    // would have redefined it as "EUR 500K and up" and handed every EUR 600k
    // grant applicant IPCEI Cloud.
    for (const b of TICKET_BANDS) {
      expect(opensLargeScaleLane(b.value))
        .toBe((bandFloorEur(b.value) ?? 0) >= LARGE_SCALE_MIN_EUR);
    }
    expect(opensLargeScaleLane(undefined)).toBe(false);
  });
});

describe("a country field compares COUNTRIES, not spellings", () => {
  // THE BUG this closes. Every country-valued filter in the corpus is encoded
  // with the English name (307 `in` filters on 248 instruments, plus 29
  // `not_in`), and every producer of an answer on that field other than the
  // panel's own select emits ISO2. Compared as strings, "Denmark" is false for
  // "DK" — and `entityCountries` is structural and those gates are cited, so
  // ONE false is conclusive: `blocked`, and blocked never reaches the founder.
  // The fund is deleted for exactly the founders it admits.
  //
  // The same shape as the `region`/"Sweden" bug check_comparator_admits was
  // written for, and invisible to it, because that check draws a field's
  // candidate answers from the values the spec itself names.
  const inDenmark: ValueSpec = { op: "in", field: "entityCountries", allowed: ["Denmark"] };

  it("accepts the same country under either designation", () => {
    expect(evaluateSpec(inDenmark, ["Denmark"])).toBe(true);
    expect(evaluateSpec(inDenmark, ["DK"])).toBe(true);
    expect(evaluateSpec(inDenmark, ["dk"])).toBe(true);
    expect(evaluateSpec(inDenmark, "DK")).toBe(true);
  });

  it("works in the other direction too, so the encoder's choice cannot matter", () => {
    const iso: ValueSpec = { op: "in", field: "entityCountries", allowed: ["DK"] };
    expect(evaluateSpec(iso, ["Denmark"])).toBe(true);
    expect(evaluateSpec(iso, ["DK"])).toBe(true);
  });

  it("still rejects a DIFFERENT country — this widens, it does not open", () => {
    expect(evaluateSpec(inDenmark, ["SE"])).toBe(false);
    expect(evaluateSpec(inDenmark, ["Sweden"])).toBe(false);
    expect(evaluateSpec(inDenmark, ["Sweden", "DK"])).toBe(true);
  });

  it("tightens not_in symmetrically, because that is the same fix", () => {
    // A rule saying "not established in the United Kingdom" must catch a
    // founder who answered "GB". Getting this wrong is the opposite harm —
    // publishing a fund the founder is excluded from — and one fix closes both.
    const notGb: ValueSpec = { op: "not_in", field: "entityCountries", allowed: ["United Kingdom"] };
    expect(evaluateSpec(notGb, ["GB"])).toBe(false);
    expect(evaluateSpec(notGb, ["United Kingdom"])).toBe(false);
    expect(evaluateSpec(notGb, ["FR"])).toBe(true);
  });

  it("equals is the single-valued form of the same comparison", () => {
    const eq: ValueSpec = { op: "equals", field: "entityCountries", value: "Estonia" };
    expect(evaluateSpec(eq, "EE")).toBe(true);
    expect(evaluateSpec(eq, "Estonia")).toBe(true);
    expect(evaluateSpec(eq, "LV")).toBe(false);
  });

  it("a NON-country field is untouched, and that is the point of the domain", () => {
    // The unsafe version of this fix is "try toIso2 on every value". toIso2
    // uppercases any two-letter string, so "no" becomes NO becomes Norway: a
    // yes/no answer would start satisfying an allowed value of "Norway". The
    // domain is declared per field precisely so this cannot happen.
    const yn: ValueSpec = { op: "in", field: "consortium", allowed: ["Norway"] };
    expect(evaluateSpec(yn, "no")).toBe(false);
    const sector: ValueSpec = { op: "in", field: "sector", allowed: ["Ireland"] };
    expect(evaluateSpec(sector, "IE")).toBe(false);
  });

  it("an unresolvable value keeps exactly its old behaviour", () => {
    // "Ukraine non-government controlled" is a real allowed value in the
    // corpus and names no ISO2. It must still compare as a string rather than
    // silently becoming a match for nothing or for everything.
    const odd: ValueSpec = {
      op: "in", field: "entityCountries", allowed: ["Ukraine non-government controlled"],
    };
    expect(evaluateSpec(odd, ["Ukraine non-government controlled"])).toBe(true);
    expect(evaluateSpec(odd, ["UA"])).toBe(false);
    expect(evaluateSpec(odd, ["Ukraine"])).toBe(false);
  });

  it("a non-answer is still unanswered, never a failure", () => {
    expect(evaluateSpec(inDenmark, ["unsure"])).toBeNull();
    expect(evaluateSpec(inDenmark, [])).toBeNull();
  });
});
