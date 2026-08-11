import { describe, expect, it } from "vitest";
import {
  beyondTitle, FUNDS_SENTENCE_CHARS, fundsFloor, fundsLineDefect, fundsSentence,
  oneLine, ROW_TITLE_CHARS,
} from "./schemeText";

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

  it("takes whole sentences, never a mid-clause cut, when they spend the budget", () => {
    const first = "Supports experimental development and industrial research on rail "
      + "signalling systems, including trackside equipment and on-board units.";
    expect(first.length).toBeGreaterThanOrEqual(fundsFloor());
    const out = fundsSentence(
      `${first} Applications are assessed twice a year by an expert panel appointed by `
      + "the ministry under the terms of the framework decision, and payment is made in "
      + "arrears against audited cost statements.");
    expect(out).toBe(first);
    expect(out.length).toBeLessThanOrEqual(FUNDS_SENTENCE_CHARS);
    expect(out.endsWith("…")).toBe(false);
  });

  it("spends the budget rather than shipping a stub when the first sentence is short", () => {
    // THE PROPERTY. A real boundary this early leaves five sixths of the budget
    // unspent while the page it came from goes on for hundreds of characters.
    // Whatever the reason a boundary rule stops early — an abbreviation in a
    // language nobody has tested, most of all — the line it leaves is short,
    // and short is what this catches without knowing the word.
    const out = fundsSentence(
      "Funds cleaner steel. The programme supports investment in electric arc furnaces, "
      + "direct reduction plants and the grid connections they require, in installations "
      + "operated by industrial undertakings established in the region.");
    expect(out.length).toBeGreaterThan(fundsFloor());
    expect(out.endsWith("…")).toBe(true);
    expect(out.startsWith("Funds cleaner steel. The programme supports")).toBe(true);
  });

  it("does not treat an initial, an ordinal or a citation as a full stop", () => {
    // The three real cases, from the three national schemes the ranker was
    // handed and could not read (wsDV). They are here as REGRESSIONS, not as
    // the rule: the rule is the shape — a lone letter, a bare number, a period
    // inside an open bracket — and each of these is one of those shapes.
    const it_ = fundsSentence(
      "Manifestazione di interesse (D.D. n. 307 del 18/03/2025) per il sostegno a "
      + "iniziative per il rafforzamento delle filiere strategiche, per la messa in rete "
      + "di forme di aggregazione tra i soggetti della ricerca.");
    expect(it_).toContain("307 del 18/03/2025");

    const de = fundsSentence(
      "EFRE-Förderrichtlinie 21+ Hessen: Förderung eines innovativen, intelligenten und "
      + "grünen wirtschaftlichen Wandels, u.a. Forschungs- und Entwicklungsvorhaben von "
      + "Unternehmen auf dem Gebiet des Landes Hessen.");
    expect(de).toContain("Forschungs- und Entwicklungsvorhaben");

    const de8 = fundsSentence(
      "Förderung von Forschungs- und Entwicklungsprojekten der angewandten "
      + "Energieforschung im Rahmen des 8. Energieforschungsprogramms, entlang der fünf "
      + "Missionen Energiesystem 2045 und Wasserstoffrepublik Deutschland.");
    expect(de8).toContain("Energieforschungsprogramms");

    // The unseen case the same shapes cover: an abbreviation followed by the
    // number it introduces. Nothing here knows what "núm." means.
    const es = fundsSentence(
      "Línea de préstamos bonificados con condiciones preferentes para empresas con "
      + "proyectos de internacionalización conforme al Reglamento (UE) núm. 651/2014 de "
      + "la Comisión, por el que se declaran ayudas compatibles.");
    expect(es).toContain("651/2014");
  });

  it("does not end a line on a colon or a semicolon", () => {
    // Both promise more of the same sentence, so a line ending on one stops
    // mid-phrase — which `fundsLineDefect` fails the build over.
    const colon = fundsSentence(
      "Le programme accompagne les industriels dans leur transition énergétique: "
      + "études de faisabilité, audits énergétiques et coaching personnalisé sur "
      + "l'ensemble du périmètre industriel du bénéficiaire.");
    expect(fundsLineDefect(colon, "x".repeat(400))).toBe("");
    const semi = fundsSentence(
      "Förderung von Schlüsseltechnologien wie Quanten-Computing, Künstlicher "
      + "Intelligenz und Robotik; Förderung von Vorhaben der industriellen Forschung "
      + "und der experimentellen Entwicklung in denselben Feldern.");
    expect(semi.endsWith(";")).toBe(false);
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
        "Funds the deployment of charging infrastructure; funds the grid "
        + "connection works required to serve it; funds feasibility studies "
        + "preceding either, where the applicant has not previously received "
        + "support for the same site.", cap);
      expect(out.length).toBeLessThanOrEqual(cap + 1);
    }
  });

  it("collapses the whitespace a fetched page carries", () => {
    expect(fundsSentence("Funds\n\n  clean   steel\tprojects."))
      .toBe("Funds clean steel projects.");
  });
});

describe("fundsLineDefect", () => {
  const long = "x".repeat(900);

  it("passes a line that spends its budget and finishes its phrase", () => {
    const line = fundsSentence(
      "Funds industrial research and experimental development in low-carbon cement, "
      + "including pilot lines up to demonstration scale. Procedure and payment terms "
      + "are set out in the annex to the framework decision.");
    expect(fundsLineDefect(line, long)).toBe("");
  });

  it("fails the stub the sentence rule used to ship", () => {
    // Not reachable through today's `fundsSentence`, which is the point: this
    // is the regression guard, and the string is the one that actually reached
    // the ranker for the University of Salerno's won fund.
    expect(fundsLineDefect("funds line that is far too short", long))
      .toMatch(/^stub: /);
  });

  it("fails a line that stops inside a bracket or on a connector", () => {
    expect(fundsLineDefect(
      `Manifestazione di interesse (D.D. ${"n ".repeat(60)}`, long)).toMatch(/unclosed/);
    expect(fundsLineDefect(`${"Förderung von Vorhaben, ".repeat(6)}u.a.,`, long))
      .toMatch(/connector/);
    expect(fundsLineDefect(`${"Subsidie voor projecten gericht op ".repeat(4)}:`, long))
      .toMatch(/connector/);
  });

  it("fails a line that ends on a lone initial but not on a number", () => {
    expect(fundsLineDefect(`${"Manifestazione di interesse ".repeat(5)}(D.D.) n.`, long))
      .toMatch(/initial/);
    // A number is what the thing IS NAMED — a section, a regulation, a budget
    // line. Ending on one is not ending mid-phrase.
    expect(fundsLineDefect(
      `${"Ayudas para proyectos empresariales innovadores ".repeat(3)}OBJETIVO 1.3.`, long))
      .toBe("");
  });

  it("exempts a line that says it is cut, and a line that is the whole page", () => {
    // Exempt from COMPLETE, never from FILL: an elided line has said it stops
    // early, which is honest, but it must still have spent the budget first.
    expect(fundsLineDefect(`${"aid for research ".repeat(9)}(unclosed…`, long)).toBe("");
    expect(fundsLineDefect(`${"aid ".repeat(4)}(unclosed…`, long)).toMatch(/^stub: /);
    const whole = "Funds hydrogen electrolysers.";
    expect(fundsLineDefect(whole, whole)).toBe("");
    expect(fundsLineDefect("", long)).toBe("");
  });
});

describe("oneLine", () => {
  it("is the one definition of how much title a row shows", () => {
    const long = "Régime exempté de notification relatif aux aides à la recherche et au "
      + "développement pour la décarbonation, la compétitivité et la sécurité du transport "
      + "aérien pour la période 2023-2029";
    expect(oneLine(long).length).toBe(ROW_TITLE_CHARS);
    expect(oneLine(long).endsWith("...")).toBe(true);
    expect(oneLine("Eurohpc")).toBe("Eurohpc");
    expect(oneLine("Two\n  lines")).toBe("Two lines");
    expect(oneLine(null)).toBe("");
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

  it("KEEPS words the row's title carries but the RENDERED title cuts off", () => {
    // wsDW's defect, verbatim. The title is 150 characters and the row shows
    // 120 of them, so "sécurité du transport aérien" was never rendered — and
    // the description that would have supplied it was deleted for repeating
    // words the model was not shown. This row is an AVIATION scheme and nothing
    // on it said so.
    const title = "Régime exempté de notification N°SA.XXXXX relatif aux aides à la "
      + "recherche et au développement pour la décarbonation, la compétitivité et la "
      + "sécurité du transport aérien";
    expect(title.length).toBeGreaterThan(ROW_TITLE_CHARS);
    const sentence = "Régime exempté de notification relatif aux aides à la recherche "
      + "et au développement pour la décarbonation, la compétitivité et la sécurité du "
      + "transport aérien.";
    expect(beyondTitle(title, sentence)).toBe(sentence);
    expect(oneLine(title)).not.toContain("aérien");
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
