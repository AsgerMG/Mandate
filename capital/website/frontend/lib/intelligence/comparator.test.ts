import { describe, expect, it } from "vitest";
import { evaluateSpec, matchesAny, NON_ANSWERS, type ValueSpec } from "./comparator";

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
