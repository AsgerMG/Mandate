// wsFE — every kind of money the corpus can hold says its own name.
//
// ── THE PROPERTY ───────────────────────────────────────────────────────────
//
//   EVERY CAPITAL TYPE THE COLUMN CAN HOLD RENDERS A WORD OF ITS OWN. A TYPE
//   WITH NO WORD FAILS THE BUILD.
//
// Stated as a property and not as a list, so the failure is about the NEXT type
// rather than about the one that was found. The key set is taken from
// `CAPITAL_TYPE_LABEL`, which is the same row's support-type column and already
// carries the standing claim that it "answers for every value the column can
// hold, not only the ones expected to be seen". Two registers of one fact, one
// key set — which is the half that rotted.
//
// ── THE RED PROOF ─────────────────────────────────────────────────────────
// Before this file, `CAPITAL_WORD` held five keys — grant, loan, guarantee,
// equity, blended — and `fundDescriptor` fell through to the word "Funding".
// 23 of the 748 publishable instruments in the committed snapshot carry
// `tax_credit`: the German Forschungszulage leaves, an R&D TAX CREDIT, whose
// kind of money is the single fact separating them from every grant beside
// them. All 23 published as "Funding", and one of them was in front of a
// founder who had actually won it.
//
// `scripts/check_capital_reach.ts` asks the same question of the corpus, so a
// value neither map has heard of also fails. This one is hermetic and needs no
// snapshot, which is why it can never be skipped.
import { describe, expect, it } from "vitest";

import { CAPITAL_TYPE_LABEL } from "./pipeline";
import { CAPITAL_WORD, fundDescriptor } from "./shortlist";
import type { DbInstrument } from "./corpus";

const inst = (capitalType: string): DbInstrument =>
  ({ capitalType, gates: [], sectorMix: null } as unknown as DbInstrument);

describe("CAPITAL_WORD", () => {
  it("has a word for every capital type the support-type column can label", () => {
    const missing = Object.keys(CAPITAL_TYPE_LABEL).filter((t) => !CAPITAL_WORD[t]);
    expect(missing, `capital types with no descriptor word: ${missing.join(", ")}. `
      + "Add one to CAPITAL_WORD in shortlist.ts. Do NOT let it fall through to "
      + "the generic word — that is the defect this test exists for.").toEqual([]);
  });

  it("the tax-credit rows say tax credit, not `Funding`", () => {
    expect(fundDescriptor(inst("tax_credit"))).toBe("Tax credits");
    expect(fundDescriptor(inst("tax_credit"))).not.toContain("Funding");
  });

  it("no type the column can hold renders the generic word", () => {
    for (const t of Object.keys(CAPITAL_TYPE_LABEL)) {
      expect(fundDescriptor(inst(t)), `capitalType=${t}`).not.toContain("Funding");
    }
  });

  it("a word is its OWN word: no two types that a founder must tell apart share one", () => {
    // Guarantee and counter-guarantee are one thing to a founder and are
    // allowed to share; every other pair must not. Stated as the exception it
    // is, so a future collision has to be argued for rather than merged in.
    const SHARED = new Set(["guarantee", "counter_guarantee"]);
    const byWord = new Map<string, string[]>();
    for (const [type, word] of Object.entries(CAPITAL_WORD)) {
      if (SHARED.has(type)) continue;
      byWord.set(word, [...(byWord.get(word) ?? []), type]);
    }
    const collisions = [...byWord].filter(([, types]) => types.length > 1);
    expect(collisions).toEqual([]);
  });
});
