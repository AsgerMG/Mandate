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
import { applyPeerPrecedence } from "./shortlist";
import type { InstrumentRow } from "./types";

/** A row carrying only what this function reads: its id and its scheme code. */
const row = (id: string, schemeCode = ""): InstrumentRow =>
  ({ instrumentId: id, schemeCode, channel: "x", instrument: id } as InstrumentRow);

const ids = (rs: InstrumentRow[]) => rs.map((r) => r.instrumentId);

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
        const out = applyPeerPrecedence(input, "DE", "deeptech", specific);
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
        const out = applyPeerPrecedence(base, "DE", "deeptech", specific);
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
    expect(ids(applyPeerPrecedence([row("a"), row("b")], "DE", "deeptech", false)))
      .toEqual(["a", "b"]);
  });
});
