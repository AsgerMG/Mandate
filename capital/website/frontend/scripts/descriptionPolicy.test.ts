// wsIT — the `DESCRIPTION=` arm, tested before it is run.
//
// wsIR's first null was not a null, and a unit test written in the same commit
// caught it before it burned a fourteen-minute run. This is that discipline
// applied to an arm that changes the QUERY: a cap that silently returned the
// full string, or an empty string where the founder had text, would produce a
// dose-response curve that looked flat for a reason that has nothing to do with
// descriptions.
import { describe, expect, it } from "vitest";

import { capAtWord, describeDescriptionPolicy, parseDescriptionPolicy } from "./founderIntake";
import type { FounderPolicy } from "./founderIntake";

const policy = (d: FounderPolicy["description"]): FounderPolicy =>
  ({ identity: "real", ownHistory: "withheld", capital: "withheld",
     answers: "strict", description: d });

describe("parseDescriptionPolicy", () => {
  it("defaults to the shipped value, so a harness that sets nothing is unchanged", () => {
    expect(parseDescriptionPolicy(undefined)).toBe("full");
    expect(parseDescriptionPolicy("full")).toBe("full");
  });
  it("reads a character cap", () => {
    expect(parseDescriptionPolicy("120")).toEqual({ capChars: 120 });
  });
  it("reads the skipped-the-box arm", () => {
    expect(parseDescriptionPolicy("template")).toBe("template");
  });
  it("refuses anything else rather than falling back to full", () => {
    // A typo that silently ran the shipped arm would label a baseline as a
    // length arm, which is the one mistake this file cannot detect afterwards.
    for (const bad of ["0", "-1", "60.5", "sixty", ""]) {
      expect(() => parseDescriptionPolicy(bad)).toThrow(/DESCRIPTION/);
    }
  });
});

describe("capAtWord", () => {
  const text = "A platform that recovers lithium from spent batteries at industrial scale.";
  it("leaves a string already inside the cap alone", () => {
    expect(capAtWord(text, 1000)).toBe(text);
  });
  it("actually shortens — the failure mode that would flatten the curve", () => {
    expect(capAtWord(text, 30).length).toBeLessThanOrEqual(30);
    expect(capAtWord(text, 30).length).toBeGreaterThan(0);
  });
  it("cuts at a word boundary, never mid-word", () => {
    const out = capAtWord(text, 30);
    expect(text.startsWith(out)).toBe(true);
    expect(text[out.length] === " " || text[out.length] === undefined).toBe(true);
  });
  it("still returns text when there is no space near the cut", () => {
    const long = "a".repeat(500);
    expect(capAtWord(long, 20)).toHaveLength(20);
  });
  it("never returns a string longer than the cap", () => {
    for (const n of [12, 60, 120, 300, 600]) {
      expect(capAtWord(text, n).length).toBeLessThanOrEqual(n);
    }
  });
});

describe("describeDescriptionPolicy", () => {
  it("names every arm, so no run can be read without knowing which it was", () => {
    expect(describeDescriptionPolicy(policy("full"))).toBe("full");
    expect(describeDescriptionPolicy(policy("template"))).toMatch(/canned/);
    expect(describeDescriptionPolicy(policy({ capChars: 60 }))).toMatch(/60/);
  });
});
