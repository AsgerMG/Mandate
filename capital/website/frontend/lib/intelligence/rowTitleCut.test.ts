// The suite is INVENTED, on purpose.
//
// A suite built out of the four Spanish loan lines that provoked this file
// would pass forever and catch nothing that arrives next year. What has to hold
// is the property, so the cases are constructed to attack it: a divergence one
// character before the cut and one character after it, a divergence 300
// characters in, a group that diverges twice at two different depths, a
// non-Latin script, two names that are genuinely equal, and a pair that cannot
// be separated inside the budget at all.
import { describe, expect, it } from "vitest";
import { cutTitlesApart, cutTitles, ELISION } from "./rowTitleCut";
import { oneLine, ROW_TITLE_CHARS } from "./schemeText";

const rep = (s: string, n: number) => s.repeat(Math.ceil(n / s.length)).slice(0, n);
const shared = rep("Régime cadre exempté de notification relatif aux aides ", 140);

describe("cutTitlesApart — THE PROPERTY: a cut may not merge two names that differ", () => {
  it("separates names whose only difference is past the cut", () => {
    const a = `${shared} Reglamento (UE) núm. 651/2014.`;
    const b = `${shared} Reglamento (UE) núm. 1408/2013.`;
    expect(oneLine(a)).toBe(oneLine(b)); // the defect, stated
    const { titles, merged } = cutTitlesApart([a, b]);
    expect(titles[0]).not.toBe(titles[1]);
    expect(merged).toEqual([]);
  });

  it("keeps every output inside the budget", () => {
    const names = [0, 1, 2, 3].map((i) => `${rep("x", 400)} variant ${i}`);
    for (const t of cutTitles(names)) expect(t.length).toBeLessThanOrEqual(ROW_TITLE_CHARS);
  });

  it("resolves a group that diverges at two different depths", () => {
    // A and B part company at the end; C parts from both far earlier. One pass
    // cannot fix both, which is what MAX_PASSES is for.
    const a = `${shared} area 1: desarrollo de proyectos`;
    const b = `${shared} area 2: nuevas empresas`;
    const c = `${shared.slice(0, 130)}DIFFERENT ${rep("y", 200)}`;
    const { titles, merged } = cutTitlesApart([a, b, c]);
    expect(new Set(titles).size).toBe(3);
    expect(merged).toEqual([]);
  });

  it("is blind to script — the divergence may be in Greek or Cyrillic", () => {
    const gr = rep("Καθεστώς ενίσχυσης έρευνας και ανάπτυξης για μικρομεσαίες ", 150);
    const { titles, merged } = cutTitlesApart([`${gr} Α`, `${gr} Β`]);
    expect(titles[0]).not.toBe(titles[1]);
    expect(merged).toEqual([]);
  });
});

describe("cutTitlesApart — THE OTHER HALF: equal names must stay equal", () => {
  it("does not manufacture a difference between two identical names", () => {
    const n = rep("Innovasjon Norge grants for regional development ", 300);
    const { titles, merged } = cutTitlesApart([n, n]);
    expect(titles[0]).toBe(titles[1]);
    // Two rows under one name are a CORPUS defect and belong to the collapse,
    // not to this file. It must not disguise them as two options.
    expect(merged).toEqual([]);
  });

  it("reaches a difference at ANY depth — 400 characters in, one character wide", () => {
    // This is the strong form of the property and it is worth stating: because
    // the tail starts AT the divergence, one character of budget is enough
    // however deep the divergence is. There is no "too far in".
    const a = `${rep("z", 400)}A${rep("z", 40)}`;
    const b = `${rep("z", 400)}B${rep("z", 40)}`;
    const { titles, merged } = cutTitlesApart([a, b]);
    expect(titles[0]).not.toBe(titles[1]);
    expect(merged).toEqual([]);
  });

  it("reports what it could not resolve rather than shipping a merge silently", () => {
    // Ten divergence depths nested inside each other. Each pass peels one, so a
    // bounded number of passes cannot reach the last of them -- and the answer
    // to that is a REPORT, never a wrong string and never a hang.
    const names = Array.from({ length: 10 }, (_, i) =>
      `${rep("q", 200)}${rep("m", i * 40)}END${i}${rep("q", 60)}`);
    const { titles, merged } = cutTitlesApart(names);
    const collided = titles.length - new Set(titles).size;
    expect(collided).toBeGreaterThan(0);
    // Every unseparated group is named, so a caller can fail on it.
    expect(merged.reduce((n, g) => n + g.length - 1, 0)).toBe(collided);
  });
});

describe("cutTitlesApart — what it costs a row with no colliding peer", () => {
  it("is byte-identical to oneLine for a lone name, long or short", () => {
    for (const n of ["Eurohpc", shared, `${shared}${shared}`, "Two\n  lines", ""]) {
      expect(cutTitles([n])[0]).toBe(oneLine(n));
    }
  });

  it("is byte-identical to oneLine for a group that the plain cut already separates", () => {
    const names = ["EIC Accelerator", "EIC Pathfinder", `Vinnova ${rep("q", 300)}`];
    expect(cutTitles(names)).toEqual(names.map((n) => oneLine(n)));
  });

  it("leaves a name that fits the budget completely alone", () => {
    const names = ["Short one", `Short one${rep("!", 300)}`];
    expect(cutTitles(names)[0]).toBe("Short one");
  });

  it("does not elide a divergence the plain cut already shows", () => {
    const names = [`${rep("a", 30)}ONE${rep("b", 300)}`, `${rep("a", 30)}TWO${rep("b", 300)}`];
    expect(cutTitles(names)).toEqual(names.map((n) => oneLine(n)));
  });
});

describe("cutTitlesApart — the elided form", () => {
  it("marks the skip, and the marker is not oneLine's trailing stop", () => {
    const t = cutTitles([`${shared} alpha`, `${shared} beta`])[0];
    expect(t).toContain(ELISION);
    expect(t.endsWith("...")).toBe(false);
    // The head is still the fund's own opening words, not a stub.
    expect(t.startsWith("Régime cadre exempté")).toBe(true);
  });

  it("never spends more of the budget on the tail than the difference needs", () => {
    const [a] = cutTitles([`${shared}A`, `${shared}B`]);
    // One character of difference buys one character of tail, so the head keeps
    // everything else the budget allows.
    expect(a.indexOf(ELISION)).toBe(ROW_TITLE_CHARS - ELISION.length - 1);
  });
});
