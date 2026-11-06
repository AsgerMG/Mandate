// The money block is the last thing between the writer and the arithmetic
// wsHE removed from the score. These assertions are about what it SAYS, not
// about how it is worded, so a rewrite that keeps the meaning keeps them green
// and a rewrite that drops the direction goes red.
import { describe, expect, it } from "vitest";

import {
  ANSWER_BASIS, AWARD_RELATION, isQuantityValue, MONEY_BASIS, moneyBasisBlock,
  ROW_QUANTITIES, withAnswerBasis,
} from "./money";
import { IDENTITY_AXES, WRITER_AXES } from "./rowNovelty";

describe("withAnswerBasis — the founder's own quantity, with its subject", () => {
  it("keeps the rendered line and adds what the number is a quantity of", () => {
    const line = withAnswerBasis("ticketBand", "how much they are looking for: €15M – €50M");
    expect(line).toContain("how much they are looking for: €15M – €50M");
    expect(line).toMatch(/ONE figure for the whole/i);
  });

  it("does not resolve an ambiguity the intake never asked about", () => {
    // The intake asks "how much are you looking for?" and offers one band.
    // Nothing on that screen separates a round from a project cost, so this
    // may not assert either. wsHE flagged splitting the QUESTION as the clean
    // fix; until that happens the prompt states what we hold.
    const line = withAnswerBasis("ticketBand", "x");
    expect(line).toMatch(/not a project budget/i);
    expect(line).toMatch(/not what any single scheme pays/i);
  });

  it("leaves a field that is not a quantity exactly as rendered", () => {
    expect(withAnswerBasis("sector", "what they build: Software & AI"))
      .toBe("what they build: Software & AI");
  });

  it("names a share as a share, so it is not read as an amount", () => {
    expect(ANSWER_BASIS.cofinancingBand).toMatch(/SHARE of project cost/);
    expect(ANSWER_BASIS.cofinancingBand).toMatch(/not an amount/);
  });
});

describe("AWARD_RELATION — one-sided, the same shape as AWARD_TERM=oneside", () => {
  it("says paying less than the stated amount is ordinary", () => {
    expect(AWARD_RELATION).toMatch(/ORDINARY case/);
  });

  it("keeps the one direction that does bear on a row", () => {
    expect(AWARD_RELATION).toMatch(/far larger than the founder's entire stated need/i);
  });

  it("forbids the sentence the recorded briefs actually wrote", () => {
    // "Innovation Fund SSP is the standout first move: ... matching your €15M
    // to €50M ask directly", on a row whose measured median is €4.0M.
    expect(AWARD_RELATION).toMatch(/never write that a row matches, fits or is sized to/i);
    expect(AWARD_RELATION).toMatch(/never prefer one row to another on how close its money is/i);
  });

  it("states no rate — these strings are identical on every corpus", () => {
    expect(AWARD_RELATION).not.toMatch(/\d\s*%/);
    expect(AWARD_RELATION).not.toMatch(/of the (time|founders|companies|cases)\b/i);
  });
});

describe("ROW_QUANTITIES — every quantity declared, no third state", () => {
  it("declares the four bases that were being printed bare", () => {
    for (const axis of ["ticket", "typicalAward", "comparableFirms", "structuringNotes"]) {
      expect(ROW_QUANTITIES[axis]?.money).toBe(true);
    }
  });

  it("declares the numbers that are NOT money, so they stay out of the block", () => {
    expect(ROW_QUANTITIES.aidIntensity.money).toBe(false);
    expect(ROW_QUANTITIES.gatesChecked.money).toBe(false);
    expect(MONEY_BASIS.aidIntensity).toBeUndefined();
    expect(MONEY_BASIS.gatesChecked).toBeUndefined();
  });

  it("never declares a field the model wrote or a row identifies itself by", () => {
    // A basis for `whyEligible` would be labelling the model's own paraphrase
    // as evidence, which is the defect `rowNovelty` excludes them for.
    for (const axis of Object.keys(ROW_QUANTITIES)) {
      expect(WRITER_AXES.has(axis)).toBe(false);
      expect(IDENTITY_AXES.has(axis)).toBe(false);
    }
  });
});

describe("isQuantityValue — a test, not a list of remembered fields", () => {
  it("finds a euro amount inside prose and inside a list of prose", () => {
    expect(isQuantityValue("ticket", "Grant up to €2.5M; equity €0.5M–€10M")).toBe(true);
    expect(isQuantityValue("structuringNotes", ["Grant funding is capped at EUR 2.5 million"])).toBe(true);
    expect(isQuantityValue("comparableFirms", [{ name: "x", amount: "€5.4M" }])).toBe(true);
  });

  it("finds a bare number, and refuses to guess whether it is money", () => {
    // Both are positive integers. Only ROW_QUANTITIES knows which is euros.
    expect(isQuantityValue("typicalAward", 4_043_400)).toBe(true);
    expect(isQuantityValue("gatesChecked", 7)).toBe(true);
  });

  it("reads rowNovelty's own naming conventions rather than a second set", () => {
    expect(isQuantityValue("lastAwardYear", 2026)).toBe(false);
    expect(isQuantityValue("typicalAwardN", 57)).toBe(false);
  });

  it("says nothing about prose that carries no figure", () => {
    expect(isQuantityValue("descriptor", "Grants · mostly industrial manufacturing")).toBe(false);
  });
});

describe("moneyBasisBlock — what the writer receives", () => {
  it("names only the bases the table actually carries", () => {
    const block = moneyBasisBlock(["typicalAward", "ticket"]);
    expect(block).toContain(MONEY_BASIS.typicalAward);
    expect(block).toContain(MONEY_BASIS.ticket);
    expect(block).not.toContain(MONEY_BASIS.comparableFirms);
  });

  it("states the relationship even when a table carries no figures at all", () => {
    // A corpus with no medians is exactly the table on which the model has
    // least to go on and most room to invent a comparison.
    expect(moneyBasisBlock([])).toContain(AWARD_RELATION);
  });

  it("says the quartiles once, not twice, when both are present", () => {
    const block = moneyBasisBlock(["awardP25", "awardP75"]);
    const occurrences = block.split(MONEY_BASIS.awardP25).length - 1;
    expect(occurrences).toBe(1);
  });
});
