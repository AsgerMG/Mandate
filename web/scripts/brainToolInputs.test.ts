import { describe, expect, it } from "vitest";
import { normaliseProfile, parsePriorLedger } from "./brainToolInputs";

describe("parsePriorLedger", () => {
  it("reads {}, [], an empty file and a missing file as no citations", () => {
    for (const t of ["{}", "[]", "", "  \n", null, undefined]) expect(parsePriorLedger(t)).toEqual([]);
  });
  it("keeps an array of entries, and an {entries: [...]} wrapper", () => {
    expect(parsePriorLedger('[{"id":"c1"}]')).toEqual([{ id: "c1" }]);
    expect(parsePriorLedger('{"entries":[{"id":"c1"}]}')).toEqual([{ id: "c1" }]);
  });
  it("fails with a plain message on anything else", () => {
    expect(() => parsePriorLedger('{"a":1}')).toThrow(/JSON array/);
    expect(() => parsePriorLedger("not json")).toThrow(/not JSON/);
  });
});

describe("normaliseProfile", () => {
  it("leaves a vocabulary profile untouched, with no warnings", () => {
    const r = normaliseProfile({ name: "X", sector: "industrial_manufacturing", developmentStage: "scaling_revenue", customerType: "b2b", markets: ["DE"] });
    expect(r.warnings).toEqual([]);
    expect(r.mapped).toEqual([]);
    expect(r.profile.sector).toBe("industrial_manufacturing");
  });

  it("maps common free text to vocabulary ids where unambiguous", () => {
    const r = normaliseProfile({ name: "X", sector: "industrial technology", developmentStage: "scale-up", customerType: "B2B",
      incorporationCountry: "Denmark", markets: ["Germany", "EU"] });
    expect(r.profile).toMatchObject({ sector: "industrial_manufacturing", developmentStage: "scaling_revenue", customerType: "b2b",
      incorporationCountry: "DK", markets: ["DE", "EU"] });
    expect(r.warnings).toEqual([]);
    expect(r.mapped.length).toBeGreaterThanOrEqual(5);
  });

  it("reads a label, a part of a label, and a subsector named as the sector", () => {
    expect(normaliseProfile({ name: "X", sector: "Robotics" }).profile.sector).toBe("industrial_manufacturing");
    expect(normaliseProfile({ name: "X", sector: "Energy, cleantech or environment" }).profile.sector).toBe("energy_cleantech");
    const sub = normaliseProfile({ name: "X", sector: "robotics_automation" });
    expect(sub.profile.sector).toBe("industrial_manufacturing");
    expect(sub.profile.subsectors).toEqual(["robotics_automation"]);
  });

  it("drops an ambiguous value and says so, instead of failing the screen silently", () => {
    const r = normaliseProfile({ name: "X", sector: "hardware", developmentStage: "Series A", customerType: "b2b" });
    expect(r.profile.sector).toBeUndefined();
    expect(r.profile.developmentStage).toBeUndefined();
    expect(r.profile.customerType).toBe("b2b");
    expect(r.warnings.join("\n")).toMatch(/sector: "hardware".*DROPPED/);
    expect(r.warnings.join("\n")).toMatch(/developmentStage: "Series A".*DROPPED/);
  });

  it("drops a bad list item and an unknown field, keeps the rest, and names both", () => {
    const r = normaliseProfile({ name: "X", markets: ["DE", "Atlantis"], hq: "Aarhus", stage: "pilot" });
    expect(r.profile.markets).toEqual(["DE"]);
    expect(r.profile.developmentStage).toBe("pilot_customers");
    expect(r.warnings.some((w) => w.includes("Atlantis"))).toBe(true);
    expect(r.warnings.some((w) => w.includes('"hq"'))).toBe(true);
  });

  it("warns, never throws, when the profile is still unreadable", () => {
    const r = normaliseProfile({ name: "X", usesAi: "yes" });
    expect(r.profile).toEqual({ name: "X" });
    expect(r.warnings.join(" ")).toMatch(/could not be read/);
  });
});
