// wsCM — the seat split between the two ranking signals, and the one property
// every arm of it must keep.
//
// `applyPeerPrecedence` returns the array `computeVerdict` derives
// `candidateInstrumentIds` from. So a row that leaves it is a fund the writer
// can never mention, no log can report and no founder can be told about — the
// exact defect this function's own history records twice (pool recall 97% ->
// 83% when the scheme dedupe was a filter, 97% -> 16% when the sibling collapse
// was). Every arm here is a PERMUTATION or it is a regression, and this file is
// what makes that a test rather than a comment.
//
// The first test is the invariant and it is arm-agnostic on purpose: a fourth
// arm added later without reading this file still has to pass it.
import { describe, expect, it } from "vitest";
import { applyPeerPrecedence, PEER_FILL, peerPrior, scoreSeats } from "./shortlist";
import type { InstrumentRow } from "./types";

/** A cell the peer prior actually HOLDS.
 *
 *  Every test in this file used to pass `"DE", "deeptech"`. There is no
 *  `deeptech` sector: `peerPrior` returned an empty list, `applyPeerPrecedence`
 *  took its `!ranked.length` early return, and the permutation invariant, the
 *  winner-not-blocked check and every arm sweep were asserting that a function
 *  which returns its argument returns its argument. The suite was green because
 *  it never reached the code it names. Asserted below, so it cannot silently
 *  become vacuous again when the artifact is regenerated. */
const CELL: [string, string] = ["DE", "software_data_ai"];
const PRIOR = peerPrior(CELL[0], CELL[1]);

/** A row carrying only what this function reads: its id and its scheme code. */
const row = (id: string, schemeCode = ""): InstrumentRow =>
  ({ instrumentId: id, schemeCode, channel: "x", instrument: id } as InstrumentRow);

const ids = (rs: InstrumentRow[]) => rs.map((r) => r.instrumentId);

/** A descending score, since these functions are only ever handed a table the
 *  comparator has already sorted. Supplied on every call so the two `confident`
 *  arms run the SAME invariant tests as the fixed ones -- an arm exempt from
 *  the permutation check is an arm that can quietly drop a fund. */
const order = new Map(["a", "b", "c", "d", "e", "f", "p", "q", "r", "s", "t", "u"]
  .map((id, i) => [id, 1 - i / 20]));
const score = (r: InstrumentRow) => order.get(r.instrumentId ?? "") ?? 0;

describe("applyPeerPrecedence: the seat split", () => {
  // Every arm reorders the SAME rows. Written against the shipped module rather
  // than a stub, so if PEER_FILL gains an arm that filters, this fails.
  it("NEVER loses a row, on any arm and on any input shape", () => {
    const shapes: InstrumentRow[][] = [
      // Plain, no scheme codes.
      [row("a"), row("b"), row("c"), row("d"), row("e"), row("f")],
      // Two rows of one notified scheme — the case the dedupe demotes.
      [row("a", "SA.1"), row("b", "SA.1"), row("c", "SA.2"), row("d"), row("e")],
      // Every row one scheme: the dedupe's worst case, where a filter would
      // leave a one-row table.
      [row("a", "SA.9"), row("b", "SA.9"), row("c", "SA.9"), row("d", "SA.9")],
    ];
    for (const input of shapes) {
      for (const specific of [true, false]) {
        const out = applyPeerPrecedence(input, CELL[0], CELL[1], specific, score);
        expect(out.length).toBe(input.length);
        expect(ids(out).slice().sort()).toEqual(ids(input).slice().sort());
        expect(new Set(ids(out)).size).toBe(input.length);
      }
    }
  });

  // THE WINNER-NOT-BLOCKED CHECK. Not "the order is nice" — the question a
  // demotion actually raises is whether the fund a founder would have won can
  // still be reached. Since the pool is what the writer sees, "reachable" means
  // "present", and the test asserts it for the row in EVERY position, because a
  // rule that only ever loses the last row passes a test that checks the first.
  it("keeps a fund reachable whatever position it started in", () => {
    const base = [row("p", "SA.1"), row("q", "SA.1"), row("r", "SA.2"),
      row("s", "SA.2"), row("t"), row("u")];
    for (let i = 0; i < base.length; i++) {
      const winner = base[i].instrumentId!;
      for (const specific of [true, false]) {
        const out = applyPeerPrecedence(base, CELL[0], CELL[1], specific, score);
        expect(ids(out)).toContain(winner);
      }
    }
  });

  // The test above is worthless if it cannot fail, and "cannot fail" is the
  // state every green guard in this repo has to be argued out of. So the
  // failure mode is constructed and the assertion is run against it: this is
  // what the function did before the demotion fix, and what a reader
  // simplifying it would write again.
  it("FAILS on the filter the fix replaced — proved, not assumed", () => {
    const asFilter = (rows: InstrumentRow[]): InstrumentRow[] => {
      const seen = new Set<string>();
      return rows.filter((r) => {
        const c = (r.schemeCode ?? "").trim();
        if (c && seen.has(c)) return false;
        if (c) seen.add(c);
        return true;
      });
    };
    const input = [row("p", "SA.1"), row("q", "SA.1"), row("r", "SA.2"),
      row("s", "SA.2"), row("t"), row("u")];
    const out = asFilter(input);
    // The invariant test would catch it,
    expect(out.length).not.toBe(input.length);
    // and so would the winner-not-blocked one, for the funds it dropped.
    expect(ids(out)).not.toContain("q");
    expect(ids(out)).not.toContain("s");
  });

  it("returns the rows untouched when there is nothing to fill from", () => {
    // No peer prior for this cell, so no arm has any basis to reorder.
    const input = [row("a"), row("b"), row("c"), row("d")];
    expect(ids(applyPeerPrecedence(input, "ZZ", "no_such_sector", false, score)))
      .toEqual(ids(input));
    // And a table too short to have a tail is returned as-is.
    expect(ids(applyPeerPrecedence([row("a"), row("b")], CELL[0], CELL[1], false, score)))
      .toEqual(["a", "b"]);
  });
});

// ── wsCS: the seat count as a function of the score, not a constant ────────
describe("scoreSeats: the score keeps what it separated", () => {
  it("gives a detached leader its seat and a flat pack none", () => {
    // One row clear of a tight pack: the score has an opinion about first
    // place and none about the rest, so it keeps exactly one seat.
    expect(scoreSeats([1.0, 0.30, 0.29, 0.28, 0.27, 0.26])).toBe(1);
    // A ladder with no step bigger than the average step. Nothing is
    // separated in the sense that matters, so the peer prior takes the table.
    expect(scoreSeats([0.5, 0.4, 0.3, 0.2, 0.1])).toBe(0);
    // Two clear leaders, then a pack.
    expect(scoreSeats([1.0, 0.7, 0.2, 0.19, 0.18, 0.17])).toBe(2);
  });

  it("is 0 when every row scores the same — no seat is earned by a tie", () => {
    expect(scoreSeats([0.4, 0.4, 0.4, 0.4])).toBe(0);
    expect(scoreSeats([0, 0, 0])).toBe(0);
  });

  it("is invariant to rescaling, which is what makes it threshold-free", () => {
    const v = [0.9, 0.31, 0.30, 0.29, 0.28];
    expect(scoreSeats(v.map((x) => x * 7))).toBe(scoreSeats(v));
    // Not invariant to a SHIFT, and must not be: adding a constant to every
    // score changes the mean gap's denominator relationship to the top row,
    // which is the same reason the comparator subtracts rather than divides.
    expect(scoreSeats(v)).toBe(1);
  });

  it("rounds to the comparator's own precision, so the two score stores agree", () => {
    // Live pgvector and the committed 6dp cache differ in the last places. A
    // gap statistic on raw floats would hand one founder different seat counts
    // depending on which store answered.
    expect(scoreSeats([0.4, 0.4 - 1e-12, 0.4 - 2e-12, 0.4 - 3e-12])).toBe(0);
  });

  it("degenerate tables do not throw", () => {
    expect(scoreSeats([])).toBe(0);
    expect(scoreSeats([0.5])).toBe(1);
  });
});

describe("PEER_FILL=confident refuses to run without the score", () => {
  // THE GUARD, run rather than asserted. An arm that silently falls back to
  // `head` reports "no effect" and is indistinguishable from a flag that never
  // arrived, which is the shape of every false null in this project's history.
  // Under a fixed arm the same call is legal, and that is asserted too, so this
  // test says something under whichever arm the runner set.
  it("throws under a confident arm and does not under a fixed one", () => {
    const input = [row("a"), row("b"), row("c"), row("d"), row("e")];
    const call = () => applyPeerPrecedence(input, CELL[0], CELL[1], false);
    if (PEER_FILL === "confident" || PEER_FILL === "confident-both") {
      expect(call).toThrow(/needs the row score/);
    } else {
      expect(call).not.toThrow();
    }
  });
});

// ── The suite must actually reach the fill ────────────────────────────────
// Everything above this line ran against a cell the peer prior does not hold
// until wsCS, and therefore against the early return. These tests are the
// non-vacuity: they assert the prior is there, that the flat branch REORDERS a
// table built from it, and then re-run the permutation invariant on that same
// table — under whichever arm the runner set.
describe("the seat split, on rows the peer prior actually knows", () => {
  /** Rows named after real prior entries, handed over in REVERSE peer order so
   *  any arm that consults the prior must visibly move them. */
  const known = PRIOR.slice(0, 6).reverse();
  const table = [...known.map((id, i) => row(id, i % 2 ? "SA.1" : "")),
    row("unknown-1"), row("unknown-2")];
  const desc = (r: InstrumentRow) =>
    1 - table.findIndex((x) => x.instrumentId === r.instrumentId) / 20;

  it("has a peer prior to test against at all", () => {
    expect(PRIOR.length).toBeGreaterThan(5);
  });

  it("REORDERS the table — the code under test is reached", () => {
    const out = applyPeerPrecedence(table, CELL[0], CELL[1], false, desc);
    expect(ids(out)).not.toEqual(ids(table));
  });

  it("still never loses or duplicates a row once it is doing work", () => {
    for (const specific of [true, false]) {
      const out = applyPeerPrecedence(table, CELL[0], CELL[1], specific, desc);
      expect(out.length).toBe(table.length);
      expect(ids(out).slice().sort()).toEqual(ids(table).slice().sort());
      expect(new Set(ids(out)).size).toBe(table.length);
    }
  });

  it("keeps every fund reachable, whatever position it started in", () => {
    for (const specific of [true, false]) {
      const out = ids(applyPeerPrecedence(table, CELL[0], CELL[1], specific, desc));
      for (const r of table) expect(out).toContain(r.instrumentId);
    }
  });
});
