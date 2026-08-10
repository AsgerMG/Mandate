import { describe, expect, it } from "vitest";
import { FUNDS_SENTENCE_CHARS, fundsSentence } from "./schemeText";

describe("fundsSentence", () => {
  it("says nothing rather than saying nothing at length", () => {
    expect(fundsSentence(null)).toBe("");
    expect(fundsSentence("")).toBe("");
    expect(fundsSentence("   ")).toBe("");
    // A fragment shorter than a phrase is not a statement of scope.
    expect(fundsSentence("Grants.")).toBe("");
  });

  it("returns short text untouched", () => {
    const s = "Funds industrial research into hydrogen electrolysers.";
    expect(fundsSentence(s)).toBe(s);
  });

  it("takes whole sentences, never a mid-clause cut", () => {
    const out = fundsSentence(
      "Supports experimental development of rail signalling systems. " +
      "Applications are assessed twice a year by an expert panel appointed by the ministry " +
      "under the terms of the framework decision, and payment is made in arrears against " +
      "audited cost statements.");
    expect(out).toBe("Supports experimental development of rail signalling systems.");
    expect(out.length).toBeLessThanOrEqual(FUNDS_SENTENCE_CHARS);
  });

  it("marks an elision when the first clause alone exceeds the budget", () => {
    // The failure this guards: a page written as one 400-word sentence would
    // otherwise contribute an empty line, removing the field from exactly the
    // schemes whose prose is hardest to read.
    const long = `Eligible applicants ${"and their partners ".repeat(30)}may apply.`;
    const out = fundsSentence(long);
    expect(out.length).toBeGreaterThan(40);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(FUNDS_SENTENCE_CHARS + 1);
    // Cut on a word boundary: a half word reads as a word the page never used.
    expect(out.slice(0, -1).endsWith(" ")).toBe(false);
    expect(long).toContain(out.slice(0, -1));
  });

  it("never exceeds the budget it is given", () => {
    for (const cap of [40, 80, 180, 400]) {
      const out = fundsSentence(
        "Funds the deployment of charging infrastructure; funds the grid " +
        "connection works required to serve it; funds feasibility studies " +
        "preceding either, where the applicant has not previously received " +
        "support for the same site.", cap);
      expect(out.length).toBeLessThanOrEqual(cap + 1);
    }
  });

  it("collapses the whitespace a fetched page carries", () => {
    expect(fundsSentence("Funds\n\n  clean   steel\tprojects."))
      .toBe("Funds clean steel projects.");
  });
});
