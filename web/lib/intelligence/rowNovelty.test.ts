// "The same thing said again", pinned as behaviour rather than as prose.
//
// The whole of wsDE rests on one claim: that a row which follows a sibling
// still carries a fact no earlier row carried, so the tail can be fixed by
// SAYING it rather than by dropping rows. A predicate that answered "yes, it
// differs" to everything would make that claim vacuous and would pass a
// one-sided test just as happily as a correct one. So every case below is
// paired: an input that makes the predicate fire, and the nearest input that
// must not.
//
// FUND-3's new half is green on every founder measured. A guard that has never
// been seen red is not a guard, so the failing case is constructed here and
// asserted to fail.
//
// No database, no corpus: these are the rules, not the data.
import { describe, expect, it } from "vitest";

import { checkBrief } from "./briefChecks";
import {
  distinguisherPhrases, distinguishers, distinguishersWithin, framingKey, rowGroups,
} from "./rowNovelty";
import type { InstitutionEntry } from "./types";

const row = (over: Partial<InstitutionEntry> = {}): InstitutionEntry => ({
  institution: "A programme",
  channel: "some_channel",
  supportType: "Grant",
  ticket: "Typically 0.5M to 5M per partner",
  familyName: "A regime",
  legalBasis: "GBER Art. 25 (R&D aid)",
  applicationChannel: "The portal",
  comparableFirms: [],
  whyEligible: "",
  nextStep: "",
  ...over,
});

describe("distinguishers — what a row carries that the rows above it did not", () => {
  it("finds nothing when a row repeats an earlier one under another name", () => {
    const a = row({ institution: "First door", schemeCode: "SA.1" });
    const b = row({ institution: "Second door", schemeCode: "SA.2" });
    expect(distinguishers(b, [a])).toEqual([]);
  });

  // The paired case. Identity is excluded on purpose -- a different name and a
  // different scheme code are what the reader can already see -- so the row
  // has to differ on what it OFFERS for the predicate to fire.
  it("finds the fact when the row's own measured award differs", () => {
    const a = row({ typicalAward: 150_000 });
    const b = row({ institution: "Second door", typicalAward: 713_442 });
    expect(distinguishers(b, [a])).toEqual(["typicalAward"]);
  });

  it("compares list-valued facts piece by piece, not block by block", () => {
    const a = row({ judgementCriteria: ["shared term", "another shared term"] });
    const b = row({ judgementCriteria: ["shared term", "a term of its own"] });
    expect(distinguishers(b, [a])).toEqual(["judgementCriteria"]);
    const c = row({ judgementCriteria: ["shared term"] });
    expect(distinguishers(c, [a])).toEqual([]);
  });

  it("never counts the writer's own prose as evidence that a row differs", () => {
    const a = row();
    const b = row({ whyEligible: "A completely different sentence.", nextStep: "Something else." });
    expect(distinguishers(b, [a])).toEqual([]);
  });

  it("separates a new KIND of door from a new instance of the same kind", () => {
    const a = row();
    const sameKind = row({ typicalAward: 1 });
    const newKind = row({ familyName: "Another regime", typicalAward: 1 });
    expect(distinguishersWithin(sameKind, [a])).toEqual(["typicalAward"]);
    expect(distinguishers(newKind, [a])).toContain("familyName");
    expect(distinguishersWithin(newKind, [a])).toEqual(["typicalAward"]);
  });
});

describe("rowGroups — consecutive rows that are the same kind of door", () => {
  it("groups a run and leaves a lone row as a run of one", () => {
    const t = [
      row({ institution: "one" }),
      row({ institution: "two" }),
      row({ institution: "three", familyName: "Another regime" }),
    ];
    expect(rowGroups(t).map((g) => [g.start, g.size])).toEqual([[0, 2], [2, 1]]);
  });

  // Ordering is not this module's to change: wsDD owns selection and order.
  // Two rows of one kind separated by a third are TWO groups of one, and the
  // module must not quietly reorder them into one group of two.
  it("never reaches past an intervening row to build a bigger group", () => {
    const t = [
      row({ institution: "one" }),
      row({ institution: "two", familyName: "Another regime" }),
      row({ institution: "three" }),
    ];
    expect(rowGroups(t).map((g) => g.size)).toEqual([1, 1, 1]);
  });

  it("keys the group on the framing only, so instances of one kind still group", () => {
    expect(framingKey(row({ typicalAward: 1 }))).toBe(framingKey(row({ typicalAward: 2 })));
    expect(framingKey(row({ supportType: "Loan" }))).not.toBe(framingKey(row()));
  });
});

describe("distinguisherPhrases — what the writer is told separates a row", () => {
  it("says the measured award with the count behind it, never the count alone", () => {
    const a = row({ typicalAward: 150_000, typicalAwardN: 1_087 });
    const b = row({ institution: "b", typicalAward: 713_442, typicalAwardN: 86 });
    expect(distinguisherPhrases(b, [a])).toEqual(["typical award: 713,442 over 86 awards"]);
  });

  it("reads a year as a year and a fraction as a share", () => {
    const a = row();
    const b = row({ institution: "b", lastAwardYear: 2025, aidIntensity: 0.45, aidIntensityN: 12 });
    // Order follows the row's own key order, which is the type's declaration
    // order: the walk never imposes a ranking of its own on the facts.
    expect(distinguisherPhrases(b, [a])).toEqual([
      "last recorded award: 2025",
      "share of project cost covered: 45% over 12 awards",
    ]);
  });

  // The gate-coverage line may never reach a reader (BRIEF-4 / VOI-B1), so it
  // may not be offered to the writer as the thing that makes a row special.
  it("never offers the product's own reading of a row as a difference", () => {
    const a = row();
    const b = row({ institution: "b", whyEasy: "Your answers speak to 5 of its 9 documented eligibility rules.",
      verdict: "open", gatesChecked: 5 });
    expect(distinguisherPhrases(b, [a])).toEqual([]);
  });
});

describe("FUND-3 on the row itself", () => {
  // The failing case, constructed. The check is green on every founder
  // measured and a guard nobody has seen red is not a guard.
  it("fires on a row that carries no fact an earlier row did not", () => {
    const institutions = [row({ institution: "First door" }), row({ institution: "Second door" })];
    const v = checkBrief({ institutions } as never, undefined, []);
    expect(v.filter((x) => x.ruleId === "FUND-3").map((x) => x.detail))
      .toContain("row 2 carries no fact an earlier row did not: Second door");
  });

  it("stays silent once that row carries one measured fact of its own", () => {
    const institutions = [
      row({ institution: "First door", typicalAward: 150_000 }),
      row({ institution: "Second door", typicalAward: 713_442 }),
    ];
    const v = checkBrief({ institutions } as never, undefined, []);
    expect(v.filter((x) => x.ruleId === "FUND-3")).toEqual([]);
  });
});
