import { describe, it, expect } from "vitest";
import { meetsDataFloor } from "./accessMode";
import { SCHEME_END_BASIS } from "./liveness";
import type { DbInstrument } from "./corpus";

const N = SCHEME_END_BASIS.notifiedDuration;
const C = SCHEME_END_BASIS.callDeadline;

// Only the four fields the floor reads. Everything else is irrelevant to it,
// and spelling out a whole instrument would hide which field did the work.
const inst = (o: Partial<DbInstrument>): DbInstrument =>
  ({ totalEur: 0, lastYear: null, ...o }) as DbInstrument;

describe("meetsDataFloor", () => {
  it("keeps out a row the corpus knows nothing measurable about", () => {
    // The population the floor was written for: we hold events, so we know it
    // exists, and nothing else. Scale and liveness could only be guessed, and a
    // guess scored at its midpoint outranks a fund we measured.
    expect(meetsDataFloor(inst({}))).toBe(false);
  });

  it("admits on award amounts, or on an award date, as it always did", () => {
    expect(meetsDataFloor(inst({ totalEur: 1 }))).toBe(true);
    expect(meetsDataFloor(inst({ lastYear: 2021 }))).toBe(true);
  });

  // ── The register clause ────────────────────────────────────────────────
  it("admits a fund whose application window is open, with no awards at all", () => {
    // A Spanish convocatoria published today. It has paid nothing and cannot
    // have — its window has not even shut. Before this clause, Spain could only
    // offer funds that had already paid out, which is to say only funds whose
    // calls had already closed.
    expect(meetsDataFloor(inst({
      schemeEndDate: "2099-01-01", schemeEndBasis: C,
    }))).toBe(true);
  });

  it("does NOT admit on a notified duration, however far in the future", () => {
    // A State-aid notification's expiry is a registration fact about a measure,
    // routinely prolonged, and says nothing about whether anyone may apply. If
    // this ever passes, the floor has started reading the two dates as one
    // thing — the confusion liveness.ts exists to prevent.
    expect(meetsDataFloor(inst({
      schemeEndDate: "2099-01-01", schemeEndBasis: N,
    }))).toBe(false);
  });

  it("does NOT admit on a call deadline that has passed", () => {
    // The clause can never resurrect anything. A past call deadline is
    // permanent closure, `isClosed()` drops the row anyway, and the floor
    // agreeing with it is what keeps the two from drifting apart.
    expect(meetsDataFloor(inst({
      schemeEndDate: "2000-01-01", schemeEndBasis: C,
    }))).toBe(false);
  });

  it("does NOT admit on an unlabelled end date", () => {
    // Basis is required, not inferred. An undated-basis row could be either
    // kind, and admitting it would let a SATR notification expiry in through
    // the back door on every row written before the basis column existed.
    expect(meetsDataFloor(inst({ schemeEndDate: "2099-01-01" }))).toBe(false);
  });

  it("grants nothing on scale — the clause is about liveness only", () => {
    // The row still carries no award median, so `awardScorer` gives it 1.0,
    // exactly the neutral the corpus already gives the 98 instruments without
    // one. This test exists so a later change that quietly writes a budget into
    // `totalEur` to "fix" ranking has to delete an assertion that says not to.
    const open = inst({ schemeEndDate: "2099-01-01", schemeEndBasis: C });
    expect(open.totalEur).toBe(0);
    expect(open.lastYear).toBeNull();
  });
});
