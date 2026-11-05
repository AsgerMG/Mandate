// The name collapse, tested on the shapes that actually caused the defects.
//
// The first test is the one that matters: it is the INVARIANT, not an example.
// Turning this back into a `.filter()` — which is what it was, and which is the
// obvious "simplification" for anyone reading the collapse without the history
// — fails it immediately, whatever labels or corpus are involved.
import { describe, expect, it } from "vitest";
import { resolveNameCollisions } from "./nameCollision";

interface Row { id: string; label: string; own: number }

const label = (r: Row) => r.label;
// The caller's real preference, in miniature: evidence of its own first, then a
// total order on id so nothing depends on arrival sequence.
const prefer = (a: Row, b: Row) => (b.own - a.own) || a.id.localeCompare(b.id);

const rows = (...spec: [string, string, number][]): Row[] =>
  spec.map(([id, l, own]) => ({ id, label: l, own }));

describe("resolveNameCollisions", () => {
  it("NEVER loses a row: visible + demoted is always exactly the input", () => {
    // The invariant. A display rule may not delete from the universe — this
    // array is the one `candidateInstrumentIds` is derived from, so a row that
    // leaves it is a fund the writer can never mention and no log can report.
    const input = rows(
      ["a", "Shared Title", 3], ["b", "Shared Title", 1], ["c", "Shared Title", 0],
      ["d", "Alone", 9], ["e", "Twin", 2], ["f", "Twin", 2],
    );
    const { visible, demoted } = resolveNameCollisions(input, label, prefer);

    expect(visible.length + demoted.length).toBe(input.length);
    expect([...visible, ...demoted].map((r) => r.id).sort())
      .toEqual(input.map((r) => r.id).sort());
    // And no row is in both halves.
    expect(visible.filter((r) => demoted.includes(r))).toHaveLength(0);
  });

  it("shows one row per label, and demotes every other peer", () => {
    const input = rows(
      ["a", "Shared Title", 3], ["b", "Shared Title", 1], ["c", "Shared Title", 0],
      ["d", "Alone", 9],
    );
    const { visible, demoted, collisions } = resolveNameCollisions(input, label, prefer);

    expect(visible.map((r) => r.id)).toEqual(["a", "d"]);
    expect(demoted.map((r) => r.id)).toEqual(["b", "c"]);
    // Both losers report the row shown INSTEAD of them, not merely that a
    // collision happened: whether the two rows were really indistinguishable is
    // the only question that decides if this rule still earns its place.
    expect(collisions.map((c) => [c.row.id, c.kept.id, c.label]))
      .toEqual([["b", "a", "Shared Title"], ["c", "a", "Shared Title"]]);
  });

  it("keeps the better row when the WORSE one sorted first", () => {
    // The Enterprise Ireland defect: the caller's sort orders by fit and channel
    // priority, which knows nothing about encoding coverage, so first-wins kept
    // a leaf with zero encoded rules over a sibling that returned a real
    // verdict. The survivor must come from `prefer`, never from position.
    const input = rows(["poor", "Enterprise Ireland", 0], ["rich", "Enterprise Ireland", 7]);
    const { visible, demoted } = resolveNameCollisions(input, label, prefer);

    expect(visible.map((r) => r.id)).toEqual(["rich"]);
    expect(demoted.map((r) => r.id)).toEqual(["poor"]);
  });

  it("is a total order: reversing the input cannot change who survives", () => {
    // Peers tie on `own` in ~70% of SATR cases — siblings inherit their regime's
    // gates, so the counts are identical — and the old reduce then kept whichever
    // happened to arrive first, which made the result depend on hydration
    // sequence.
    const tied = rows(["z_id", "Twin", 2], ["a_id", "Twin", 2]);
    expect(resolveNameCollisions(tied, label, prefer).visible.map((r) => r.id))
      .toEqual(["a_id"]);
    expect(resolveNameCollisions([...tied].reverse(), label, prefer).visible.map((r) => r.id))
      .toEqual(["a_id"]);
  });

  it("preserves the caller's order within each half", () => {
    // The visible half must stay byte-identical to the version that dropped the
    // losers, or the change moves the table while claiming not to.
    const input = rows(
      ["1", "A", 1], ["2", "Dup", 0], ["3", "B", 1], ["4", "Dup", 5], ["5", "C", 1],
    );
    const { visible, demoted } = resolveNameCollisions(input, label, prefer);

    expect(visible.map((r) => r.id)).toEqual(["1", "3", "4", "5"]);
    expect(demoted.map((r) => r.id)).toEqual(["2"]);
  });

  it("does nothing when the labels are already distinct", () => {
    // The state the corpus is actually in: `administering_body` separates
    // siblings, so the disambiguator running before this leaves nothing to
    // collapse. Measured live across 23 markets, SEL-DUPE-NAME fires zero times.
    const input = rows(["a", "Fund · Body One", 0], ["b", "Fund · Body Two", 0]);
    const { visible, demoted, collisions } = resolveNameCollisions(input, label, prefer);

    expect(visible).toHaveLength(2);
    expect(demoted).toHaveLength(0);
    expect(collisions).toHaveLength(0);
  });

  it("survives an empty input without special-casing it", () => {
    const { visible, demoted, collisions } = resolveNameCollisions([], label, prefer);
    expect(visible).toHaveLength(0);
    expect(demoted).toHaveLength(0);
    expect(collisions).toHaveLength(0);
  });
});
