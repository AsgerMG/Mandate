// wsEC — what a rendered fact is allowed to CLAIM.
//
// THE PROPERTY, tested here rather than described in a comment:
//
//   A fact rendered on a candidate row is a fact the selector selects on, so
//   it has to say what it knows and no more. Where the measurement behind it
//   is a PLURALITY, the row states the share; a category word claims a
//   majority the reader cannot check and cannot recover the share from.
//
// The defect this pins is live and shipped. `mostly X` fires whenever the top
// sector reaches `FOCUS_SHARE` = 0.25 of a fund's awards, across a taxonomy
// with eleven tops. Measured over the live corpus by
// `scripts/_wsec_descriptor.ts`: it appears on 709 of the 743 publishable
// instruments carrying a mix (95.4%) and the sector it names is an actual
// majority on 341 of them (45.9%). The model reads it as a tag and rejects
// rows on it in its own words.
//
// ── wsFE: THE FLOOR IS PART OF THE SENTENCE, and the two arms no longer share
// one ─────────────────────────────────────────────────────────────────────
// This file used to pin "both spellings fire on exactly the same rows", so an
// arm could not confound the sentence with the selection. That was right about
// the arm and wrong about the threshold, and the wrongness was measurable: 31
// of 748 publishable instruments have no sector reaching a quarter and render
// as a bare `Grants`, one of them a fund a founder actually won. The most
// diversified funds in the corpus are exactly the ones a "focus" floor
// silences.
//
// `FOCUS_SHARE` is the point below which the WORD `mostly` becomes false. A
// clause that prints its own share has no such point, because it cannot
// overstate — the number a reader would discount it by is the number it prints.
// So the floor moves with the sentence: `category` keeps 0.25 and every shipped
// row is byte-identical, `share` gets `SHARE_FLOOR`.
//
// Fixtures are built BY HAND, never read from the corpus, so a data load
// cannot turn these red and cannot quietly make them vacuous either.
import { describe, expect, it } from "vitest";
import { FOCUS_SHARE, sectorClause, SHARE_FLOOR } from "./shortlist";

/** A plurality that is nowhere near a majority — the case `mostly` overstates. */
const PLURALITY = { software_data_ai: 30, health_life_sciences: 25, agrifood: 24, space: 21 };
/** A fund that really is about one thing. */
const SPECIALIST = { health_life_sciences: 95, software_data_ai: 5 };
/** Nothing concentrated enough to say anything about. */
const FLAT = { software_data_ai: 20, health_life_sciences: 20, agrifood: 20, space: 20, eit: 20 };

describe("sectorClause: a plurality is not a category", () => {
  it("states the share rather than a category word, under `share`", () => {
    expect(sectorClause(PLURALITY, "share")).toBe("30% software & AI");
    expect(sectorClause(SPECIALIST, "share")).toBe("95% health & life sciences");
  });

  it("is what ships today under `category`, and says `mostly` for both", () => {
    // The whole point: today these two funds render the SAME claim, and one of
    // them is a 30% plurality.
    expect(sectorClause(PLURALITY, "category")).toBe("mostly software & AI");
    expect(sectorClause(SPECIALIST, "category")).toBe("mostly health & life sciences");
  });

  it("WHEREVER `category` speaks, `share` speaks too", () => {
    // The direction that still has to hold. `share` may reach further down —
    // that is the whole of wsFE's change — but a row the overstating spelling
    // is willing to describe can never be one the honest spelling refuses.
    for (const mix of [PLURALITY, SPECIALIST, FLAT, null, undefined, {}]) {
      if (sectorClause(mix, "category")) expect(sectorClause(mix, "share")).not.toBe("");
    }
  });

  it("RED BEFORE wsFE: the diversified fund said nothing at all", () => {
    // OPZuid's real shape, `satr_nl_rnd__sa_108830`: 21/20/16/16/11 and a tail,
    // a fund an industrial-manufacturing founder actually won, whose row
    // published as a bare `Grants` because no sector reached a quarter. Written
    // as whole percentage points summing to 100 so the assertion is on the
    // sentence and not on this file's arithmetic.
    const OPZUID = {
      health_life_sciences: 21, software_data_ai: 20,
      other: 16, industrial_manufacturing: 16, agrifood: 11,
      mobility_transport: 9, space: 7,
    };
    expect(sectorClause(OPZUID, "share")).toBe("21% health & life sciences");
    // And `category` still refuses it, which is correct and is the point: at
    // 20% the word `mostly` would be false about four fifths of the awards.
    expect(sectorClause(OPZUID, "category")).toBe("");
  });

  it("says nothing when nothing reaches the floor of its own sentence", () => {
    expect(sectorClause(FLAT, "category")).toBe("");
    // The thresholds in the test are the module's, not copies of them.
    const catShare = Math.ceil(FOCUS_SHARE * 100) + 1;
    const spread = (top: number) => {
      const rest = 100 - top;
      return {
        software_data_ai: top,
        health_life_sciences: Math.floor(rest / 3),
        agrifood: Math.floor(rest / 3),
        space: rest - 2 * Math.floor(rest / 3),
      };
    };
    expect(sectorClause(spread(catShare), "share")).toBe(`${catShare}% software & AI`);
    expect(sectorClause(spread(catShare), "category")).toBe("mostly software & AI");
    // A mix under `share`'s own floor is still silence: below a tenth the top
    // sector is not the fund's shape, it is the largest of many small numbers.
    const belowShare = Math.floor(SHARE_FLOOR * 100) - 1;
    const tiny: Record<string, number> = { software_data_ai: belowShare };
    for (let i = 0; i < 100 - belowShare; i++) tiny[`filler_${i}`] = 1;
    expect(sectorClause(tiny, "share")).toBe("");
  });

  // ── wsFG: an unnameable bucket may not silence the row ────────────────────
  //
  // THE PROPERTY: the clause names the largest bucket the vocabulary CAN name,
  // if that bucket clears ITS ARM'S FLOOR. A bucket with no name is skipped
  // exactly like a bucket below the threshold — it cannot be the reason the row
  // says nothing, because it was never something the row could have said.
  //
  // The two arms have DIFFERENT floors (wsFE: FOCUS_SHARE for `category`,
  // SHARE_FLOOR for `share`), so the cases below are asserted per arm and the
  // floors are read from the module rather than written as literals.
  //
  // Written against a key that exists nowhere in the corpus, so the rule is the
  // property and not a patch for `other`: 171 of 1,088 instruments have `other`
  // as their largest bucket above FOCUS_SHARE, and 65 of them hold a NAMED
  // bucket that also clears it and was never rendered.
  //
  // Paired, both ways, because a rule that always speaks would pass the first
  // half as happily as a correct one.
  describe("a bucket the vocabulary cannot name is SKIPPED, not fatal", () => {
    it("names the largest bucket it CAN name, when that clears its floor", () => {
      const mix = { no_such_sector: 45, space: 35, agrifood: 20 };
      expect(sectorClause(mix, "category")).toBe("mostly space");
      // The share is still taken against the WHOLE mix, unnamed bucket
      // included: the claim is about the fund's entire award history, and
      // shrinking the denominator to the buckets we can spell would inflate
      // every figure on every row. 35, not 44.
      expect(sectorClause(mix, "share")).toBe("35% space");
    });

    it("still says nothing when no nameable bucket clears the floor", () => {
      // Under BOTH floors, so the case is about the naming and not about which
      // arm is looser. Read from the module: a literal here would pass by
      // coincidence the day either floor moves.
      const under = Math.max(0, Math.floor(SHARE_FLOOR * 100) - 1);
      const mix: Record<string, number> = { no_such_sector: 100 - under, space: under };
      expect(sectorClause(mix, "share")).toBe("");
      expect(sectorClause(mix, "category")).toBe("");
      // And a mix with NOTHING nameable in it at all, at any floor.
      expect(sectorClause({ no_such_sector: 100 }, "category")).toBe("");
      expect(sectorClause({ no_such_sector: 100 }, "share")).toBe("");
    });

    it("keeps the arms' ordering: what `category` will say, `share` will too", () => {
      // The direction the file asserts everywhere else, re-asserted with an
      // unnameable bucket in the mix. NOT equality — wsFE made `share` reach
      // further down on purpose, and a test demanding they fire together would
      // be re-litigating that decision from inside this one.
      const mixes: Record<string, number>[] = [
        { no_such_sector: 45, space: 35, agrifood: 20 },
        { no_such_sector: 90, space: 10 },
        { no_such_sector: 100 },
      ];
      for (const mix of mixes) {
        if (sectorClause(mix, "category")) expect(sectorClause(mix, "share")).not.toBe("");
      }
    });
  });
});
