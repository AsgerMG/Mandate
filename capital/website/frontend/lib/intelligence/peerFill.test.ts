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
//
// wsCW closed the arms -- the whole seat axis was swept on a 600-pair tape,
// twice, and the shipped split is its maximum, so `PEER_FILL` and `scoreSeats`
// are gone and the tests that exercised them went with them. Every INVARIANT
// test below stays and is unchanged: they are about the function being a
// permutation, which is a property of the fill and not of any arm.
import { describe, expect, it } from "vitest";
import { applyPeerPrecedence, interleaveWithPeer, peerPrior } from "./shortlist";
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

describe("applyPeerPrecedence: the seat split", () => {
  // Every arm reorders the SAME rows. Written against the shipped module rather
  // than a stub, so if the fill ever becomes a filter again, this fails.
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
        const out = applyPeerPrecedence(input, CELL[0], CELL[1], specific);
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
        const out = applyPeerPrecedence(base, CELL[0], CELL[1], specific);
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
    expect(ids(applyPeerPrecedence(input, "ZZ", "no_such_sector", false)))
      .toEqual(ids(input));
    // And a table too short to have a tail is returned as-is.
    expect(ids(applyPeerPrecedence([row("a"), row("b")], CELL[0], CELL[1], false)))
      .toEqual(["a", "b"]);
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
  it("has a peer prior to test against at all", () => {
    expect(PRIOR.length).toBeGreaterThan(5);
  });

  it("REORDERS the table — the code under test is reached", () => {
    const out = applyPeerPrecedence(table, CELL[0], CELL[1], false);
    expect(ids(out)).not.toEqual(ids(table));
  });

  it("still never loses or duplicates a row once it is doing work", () => {
    for (const specific of [true, false]) {
      const out = applyPeerPrecedence(table, CELL[0], CELL[1], specific);
      expect(out.length).toBe(table.length);
      expect(ids(out).slice().sort()).toEqual(ids(table).slice().sort());
      expect(new Set(ids(out)).size).toBe(table.length);
    }
  });

  it("keeps every fund reachable, whatever position it started in", () => {
    for (const specific of [true, false]) {
      const out = ids(applyPeerPrecedence(table, CELL[0], CELL[1], specific));
      for (const r of table) expect(out).toContain(r.instrumentId);
    }
  });
});

// ── wsEC: the round robin ────────────────────────────────────────────────
// `POOL_ORDER` is read once at module scope, so a test that reassigned the env
// would be testing a second instance of this module rather than the shipped
// one. The ordering is therefore exported pure and exercised directly, and the
// invariant tests above are re-run against it: a second arm that is not a
// permutation is the same regression as a first arm that is not.
describe("interleaveWithPeer: the round robin", () => {
  const known = PRIOR.slice(0, 4);
  it("NEVER loses or duplicates a row, on any input shape", () => {
    const shapes: InstrumentRow[][] = [
      [row("a"), row("b"), row("c"), row("d"), row("e")],
      [row("a", "SA.1"), row("b", "SA.1"), row("c", "SA.2"), row("d")],
      [row("a", "SA.9"), row("b", "SA.9"), row("c", "SA.9")],
      // Rows the prior knows, handed over in reverse peer order.
      [...known.slice().reverse().map((id) => row(id)), row("z")],
    ];
    for (const input of shapes) {
      const out = interleaveWithPeer(input, PRIOR);
      expect(out.length).toBe(input.length);
      expect(ids(out).slice().sort()).toEqual(ids(input).slice().sort());
      expect(new Set(ids(out)).size).toBe(input.length);
    }
  });

  it("gives the score the first seat and alternates after it", () => {
    // `z` scores first and the prior has never seen it; the four after it are
    // handed over in REVERSE peer order, so an alternation must visibly pull
    // the prior's own first entry into seat two.
    const input = [row("z"), ...known.slice().reverse().map((id) => row(id))];
    const out = ids(interleaveWithPeer(input, PRIOR));
    expect(out[0]).toBe("z");
    expect(out[1]).toBe(known[0]);
  });

  it("is the identity when the prior knows nothing in the table", () => {
    const input = [row("a"), row("b"), row("c")];
    expect(ids(interleaveWithPeer(input, []))).toEqual(["a", "b", "c"]);
  });
});
