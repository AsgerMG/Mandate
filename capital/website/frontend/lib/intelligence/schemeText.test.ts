import { describe, expect, it } from "vitest";
import { FUNDS_SENTENCE_CHARS, beyondTitle, fundsSentence } from "./schemeText";

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

describe("beyondTitle", () => {
  it("drops a sentence that only says the row's own title back", () => {
    // Measured shape: 95 of 338 described rows. The page's opening line is the
    // programme name with a colon after it, or a gazette citation of the same
    // name, and the row already renders that name on the line above.
    expect(beyondTitle(
      "Technologietransfer-Programm Leichtbau (TTP LB)",
      "Technologietransfer-Programm Leichtbau (TTP LB):")).toBe("");
  });

  it("KEEPS a sentence whose only new word is the one that separates siblings", () => {
    // The case a similarity threshold gets wrong. Two children of one national
    // programme render the SAME title; each description is that title plus one
    // word, and that word is the entire distinction between them. An 80%
    // overlap rule deletes both and the pair goes blind.
    const title = "Bundesförderung für Energie- und Ressourceneffizienz in der Wirtschaft";
    const a = "Bundesförderung für Energie- und Ressourceneffizienz in der Wirtschaft, Zuschussvariante.";
    const b = "Bundesförderung für Energie- und Ressourceneffizienz in der Wirtschaft, Kreditvariante.";
    expect(beyondTitle(title, a)).toBe(a);
    expect(beyondTitle(title, b)).toBe(b);
    expect(beyondTitle(title, a)).not.toBe(beyondTitle(title, b));
  });

  it("ignores case, punctuation and function words", () => {
    expect(beyondTitle("Green Steel Fund", "The green steel fund.")).toBe("");
  });

  it("passes an ordinary description through untouched", () => {
    const s = "Funds pilot lines for low-carbon cement, up to demonstration scale.";
    expect(beyondTitle("Innovation Fund", s)).toBe(s);
  });

  it("is a no-op on an empty sentence and on a missing title", () => {
    expect(beyondTitle("Anything", "")).toBe("");
    expect(beyondTitle(null, "Funds hydrogen electrolysers.")).toBe("Funds hydrogen electrolysers.");
  });
});
