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
// Both spellings must fire on exactly the same rows: an arm that also moved
// the threshold would confound the sentence with the selection, and the run
// that measured it would be measuring two things.
//
// Fixtures are built BY HAND, never read from the corpus, so a data load
// cannot turn these red and cannot quietly make them vacuous either.
import { describe, expect, it } from "vitest";
import { FOCUS_SHARE, sectorClause } from "./shortlist";

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

  it("FIRES ON THE SAME ROWS under both spellings", () => {
    for (const mix of [PLURALITY, SPECIALIST, FLAT, null, undefined, {}]) {
      expect(Boolean(sectorClause(mix, "share")))
        .toBe(Boolean(sectorClause(mix, "category")));
    }
  });

  it("says nothing when nothing reaches FOCUS_SHARE", () => {
    expect(sectorClause(FLAT, "share")).toBe("");
    expect(sectorClause(FLAT, "category")).toBe("");
    // And the threshold in the test is the module's, not a copy of it: a mix
    // sitting one award above it must speak under both spellings.
    const share = Math.ceil(FOCUS_SHARE * 100) + 1;
    const rest = 100 - share;
    const atFloor = {
      software_data_ai: share,
      health_life_sciences: Math.floor(rest / 3),
      agrifood: Math.floor(rest / 3),
      space: rest - 2 * Math.floor(rest / 3),
    };
    expect(sectorClause(atFloor, "share")).toBe(`${share}% software & AI`);
    expect(sectorClause(atFloor, "category")).toBe("mostly software & AI");
  });

  it("says nothing for a sector the descriptor vocabulary cannot name", () => {
    expect(sectorClause({ no_such_sector: 90, space: 10 }, "share")).toBe("");
  });
});
