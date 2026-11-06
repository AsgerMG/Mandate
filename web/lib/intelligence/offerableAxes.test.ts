// The declarations in offerableAxes.ts are read by the PRODUCT, not only by a
// check — `publishableInstruments()` withholds rows on the strength of them.
// So they are claims, and these pin the ones a future edit could quietly break.
//
// What is deliberately NOT tested here is the corpus. "How many rows carry a
// stranded value" is a question about data, it moves whenever the ETL improves,
// and it belongs to `scripts/check_capital_reach.ts` where it is ratcheted.
// These test the SHAPE of the declaration, which must hold on any corpus.
import { describe, expect, it } from "vitest";
import type { DbInstrument } from "./corpus";
import { OFFERABLE_AXES, isWithheldByPolicy, withheldValues } from "./offerableAxes";
import { KNOWN_CAPITAL_TYPES } from "./shortlist";

describe("every unofferable value is declared, and every declaration is true", () => {
  it("declares nothing that a founder can in fact reach", () => {
    // A stale declaration is worse than none: it withholds a row the product
    // could offer, and it reads as deliberate. If somebody maps `non_financial`
    // to an intake option tomorrow, this fails rather than leaving the rows
    // hidden behind a declaration nobody rechecked.
    for (const axis of OFFERABLE_AXES) {
      for (const value of Object.keys(axis.declared)) {
        expect(axis.reachable(value),
          `${axis.key}="${value}" is declared unofferable but IS reachable — ` +
          `the declaration is stale and is hiding a fund`).toBe(false);
      }
    }
  });

  it("gives every declaration a reason someone can act on", () => {
    for (const axis of OFFERABLE_AXES) {
      for (const [value, d] of Object.entries(axis.declared)) {
        expect(d.reason.length, `${axis.key}="${value}" has no reason`).toBeGreaterThan(40);
        expect(["withhold", "gap"]).toContain(d.policy);
      }
    }
  });

  it("keeps `withhold` and `gap` doing different things", () => {
    // The distinction is the whole design: a decision removes the row at the
    // corpus boundary, a collection failure leaves it counted so the debt stays
    // visible. Collapsing them would let a gap be closed by declaring it.
    const capital = OFFERABLE_AXES.find((a) => a.key === "capital_type")!;
    const held = withheldValues(capital);
    expect(held.has("non_financial")).toBe(true);
    expect(held.has("undetermined")).toBe(true);
    expect(held.has("unknown")).toBe(false);
    const inst = (capitalType: string) =>
      ({ id: "x", country: "EU", capitalType, gates: [] } as unknown as DbInstrument);
    expect(isWithheldByPolicy(inst("non_financial"))).toBe(true);
    expect(isWithheldByPolicy(inst("undetermined"))).toBe(true);
    // Withholding `unknown` would make the gap invisible instead of closing it.
    expect(isWithheldByPolicy(inst("unknown"))).toBe(false);
    expect(isWithheldByPolicy(inst("grant"))).toBe(false);
  });

  it("still refuses a value nobody has classified", () => {
    // The case the whole file exists for. A new source introducing `mezzanine`
    // must be neither reachable nor declared, so the check fails loudly rather
    // than the funds going quietly missing.
    const unseen = "a_capital_type_nobody_has_classified";
    const capital = OFFERABLE_AXES.find((a) => a.key === "capital_type")!;
    expect(capital.reachable(unseen)).toBe(false);
    expect(capital.declared[unseen]).toBeUndefined();
  });

  it("asks reachability of the shipping filter, one answer at a time", () => {
    // `blended` is in no intake option's mapped values and is admitted by all
    // of them. A registry that recomputed the map instead of calling the filter
    // would report the corpus's largest debt programme as stranded from every
    // founder on the same day the filter began admitting it — which is exactly
    // what happened to an earlier version of this check.
    const capital = OFFERABLE_AXES.find((a) => a.key === "capital_type")!;
    expect(capital.reachable("blended")).toBe(true);
    expect(capital.declared["blended"]).toBeUndefined();
    // Every value the CORPUS side can carry and some option maps to. Note this
    // is NOT `CAPITAL_OPTIONS`: an intake answer and a capital_type are two
    // vocabularies joined by CAPITAL_SOUGHT_TO_DB, and `recoverable_advance` is
    // an answer with no corpus value of its own — it maps to `loan`, because
    // the state-aid register does not separate the two. Probing this axis with
    // an ANSWER would assert that a value no instrument carries is reachable,
    // which is the same category error that put an unrecorded fact and a
    // refused preference in one bucket.
    for (const v of KNOWN_CAPITAL_TYPES) expect(capital.reachable(v)).toBe(true);
  });

  it("treats a blank as a value, so it cannot hide", () => {
    for (const axis of OFFERABLE_AXES) {
      const blank = axis.valueOf({ capitalType: "", country: "" } as unknown as DbInstrument);
      expect(blank).toBe("(empty)");
      expect(axis.declared[blank]?.policy).toBe("gap");
    }
  });
});
