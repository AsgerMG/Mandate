// A ROW STATES EACH FACT ONCE, AND A BUDGET NEVER DELETES THE ONE THAT SEPARATES.
//
// ── The two defects this pins ─────────────────────────────────────────────
//
// 1. THE SAME FACT TWICE. `fundDescriptor` composes
//    `CAPITAL_WORD[capitalType] · region · what it mostly funds`. The candidate
//    row printed the raw `capitalType` column AND the descriptor, four fields
//    apart, so every row said the kind of capital twice — "grant" and then
//    "Grants" — and spent the characters on the repeat.
//
// 2. THE BUDGET ATE THE ONLY NEW CLAUSE. `oneLine(r.descriptor, 60)` cuts from
//    the END. The last part is what the scheme mostly funds, which is the one
//    part of that composite the row does not already carry — the line that
//    separates two rows of one body in one country. A long region name
//    therefore deleted exactly the clause that was worth printing and left the
//    row repeating itself.
//
// ── The disasters, simulated ──────────────────────────────────────────────
// A German grant scheme in a region with a long name is the case: rendered the
// old way the sector clause is gone and "grant"/"Grants" both appear. Both are
// asserted on the rendered row, which is the only artifact the model sees.
//
// FREE. `buildPrompt` is a pure function of rows and context.
import { describe, expect, it } from "vitest";

import { descriptorParts, fitDescriptor, buildPrompt } from "./agentSelect";
import type { InstrumentRow } from "./types";

const SEP = " · ";

/** A real shape: a national grant scheme whose region name is long. */
const row = (over: Partial<InstrumentRow> = {}): InstrumentRow => ({
  channel: "x", instrument: "Investitionszuschuss", ticket: "EUR 1m",
  usedInField: false, fit: "", instrumentId: "x",
  administeringBody: "Bezirksregierung",
  country: "Germany",
  capitalType: "grant",
  descriptor: ["Grants", "Nordrhein-Westfalen und angrenzende Regionen",
    "mostly software & AI"].join(SEP),
  ...over,
});

describe("the descriptor states each fact once", () => {
  it("lifts the capital word out and leaves the parts that are new to the row", () => {
    // The fact is stated once, in the corpus's own word for a reader, and it is
    // not in the budgeted text — so no region name can cost the row its kind of
    // capital.
    expect(descriptorParts(row())).toEqual({
      capital: "Grants",
      rest: ["Nordrhein-Westfalen und angrenzende Regionen", "mostly software & AI"],
    });
  });

  it("drops a region part that is only the country restated", () => {
    expect(descriptorParts(row({
      descriptor: ["Loans", "Germany", "mostly industrial manufacturing"].join(SEP),
      capitalType: "loan",
    }))).toEqual({ capital: "Loans", rest: ["mostly industrial manufacturing"] });
  });

  it("keeps a region INSIDE the country, which is a different fact", () => {
    expect(descriptorParts(row()).rest).toContain("Nordrhein-Westfalen und angrenzende Regionen");
  });

  it("falls back to the raw column when there is no descriptor at all", () => {
    expect(descriptorParts(row({ descriptor: undefined })))
      .toEqual({ capital: "grant", rest: [] });
  });

  it("a fourth clause added tomorrow needs no edit here", () => {
    // The property is stated over the parts, not over a list of three. A clause
    // `fundDescriptor` starts composing is carried; one that repeats a printed
    // field is dropped; neither case names a position.
    expect(descriptorParts(row({
      descriptor: ["Grants", "Hessen", "mostly agrifood", "open to consortia"].join(SEP),
    }))).toEqual({
      capital: "Grants", rest: ["Hessen", "mostly agrifood", "open to consortia"],
    });
  });
});

describe("the budget is spent from the last part backwards", () => {
  it("keeps what the scheme funds and drops the region, not the other way round", () => {
    const fitted = fitDescriptor(descriptorParts(row()).rest, 60);
    // The clause that separates two rows of one body in one country survives…
    expect(fitted).toContain("mostly software & AI");
    // …and the budget is respected.
    expect(fitted.length).toBeLessThanOrEqual(60);
  });

  it("THE DISASTER: cutting from the front deletes exactly the clause worth printing", () => {
    // What the row did before. Asserted so the regression is visible as a
    // behaviour and not only as a diff.
    const before = row().descriptor!.replace(/\s+/g, " ").slice(0, 57) + "...";
    expect(before).not.toContain("mostly software & AI");
    expect(fitDescriptor(descriptorParts(row()).rest, 60)).toContain("mostly software & AI");
  });

  it("keeps every part when they all fit", () => {
    const parts = ["Hessen", "mostly agrifood"];
    expect(fitDescriptor(parts, 60)).toBe(parts.join(SEP));
  });

  it("never emits a part that is an ellipsis and a syllable", () => {
    const fitted = fitDescriptor(["a very long region name indeed", "mostly agrifood"], 20);
    for (const p of fitted.split(SEP)) expect(p.replace(/\.\.\.$/, "").length).toBeGreaterThan(2);
  });
});

describe("the rendered row", () => {
  const rows = [row(), row({ instrumentId: "y", channel: "y" }),
    row({ instrumentId: "z", channel: "z" })];

  it("names the kind of capital once, not twice", () => {
    const p = buildPrompt(rows, {}, 0, 2);
    // The corpus's own word for a reader, and not the raw column beside it.
    expect(p).toContain("Grants");
    expect(p).not.toMatch(/·\s*grant\s*·/);
  });

  it("still names it when the row carries no descriptor at all", () => {
    // One statement of the fact, not fewer facts.
    const bare = rows.map((r) => ({ ...r, descriptor: undefined }));
    expect(buildPrompt(bare, {}, 0, 2)).toContain("grant");
  });
});
