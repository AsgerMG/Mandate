import { describe, expect, it } from "vitest";
import { evaluateSpec, matchesAny, NON_ANSWERS, type ValueSpec } from "./comparator";
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
    // developmentStage has no BAND_ORDERS entry, so the spec's own list is the
    // only order there is and must keep working.
    const order = ["research", "prototype", "pilot_customers", "scaling_revenue"];
    const s: ValueSpec = { op: "band_max", field: "developmentStage", maxAllowed: "prototype", order };
    expect(evaluateSpec(s, "research")).toBe(true);
    expect(evaluateSpec(s, "scaling_revenue")).toBe(false);
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
