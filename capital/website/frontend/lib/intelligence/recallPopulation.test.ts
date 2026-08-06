// The recall set's population invariants — the ones a repair could silently break.
//
// The answer key was repaired on 2026-08-06 by EXCLUDING pairs whose won fund
// the product may no longer offer, rather than by deleting them. That repair is
// only safe if three things stay true, and none of them was previously tested:
//
//   1. the tune/holdout split stays by COMPANY, so no company is on both sides
//      and nothing learned on tune is graded on holdout;
//   2. the exclusion cannot CHOOSE its pairs — it is a function of the answer
//      alone, so it cannot quietly drop the queries the ranker finds hard;
//   3. the draw is the same for the gate and the harness.
//
// These are properties, tested against the real active set. No country, scheme
// code or instrument id appears here.
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import {
  ACTIVE_RECALL_SET, partitionByOfferable, sampleRecall, UNGRADED_SHARE,
  type RecallRow,
} from "../../scripts/recallSet";

const rows = JSON.parse(readFileSync(
  path.join(process.cwd(), "lib", "intelligence", ACTIVE_RECALL_SET), "utf8")) as RecallRow[];

describe("the tune/holdout split", () => {
  it("puts every company on exactly one side", () => {
    const sides = new Map<string, Set<string>>();
    for (const r of rows) {
      const s = sides.get(r.name) ?? new Set<string>();
      s.add(r.split);
      sides.set(r.name, s);
    }
    const straddling = [...sides].filter(([, s]) => s.size > 1).map(([n]) => n);
    expect(sides.size).toBeGreaterThan(1000);
    expect(straddling).toEqual([]);
  });

  // The repair removes rows; it never reassigns one. This is what makes the
  // property above survive the repair without re-splitting the set — and
  // re-splitting is the thing that would silently invalidate every published
  // number taken against the old split.
  it("survives any row-removal, because removal cannot move a company", () => {
    // An adversarial predicate: keep a pseudo-random half of the answers.
    const drop = (id: string) => [...id].reduce((a, c) => a + c.charCodeAt(0), 0) % 2 === 0;
    const { graded } = partitionByOfferable(rows, drop);
    const sides = new Map<string, Set<string>>();
    for (const r of graded) {
      const s = sides.get(r.name) ?? new Set<string>();
      s.add(r.split);
      sides.set(r.name, s);
    }
    expect([...sides].filter(([, s]) => s.size > 1)).toEqual([]);
  });
});

describe("the exclusion", () => {
  it("is a partition — nothing is lost, duplicated or reordered", () => {
    const keep = (id: string) => id.length % 3 !== 0;
    const { graded, ungraded } = partitionByOfferable(rows, keep);
    expect(graded.length + ungraded.length).toBe(rows.length);
    // Order preserved within each side, so a seeded draw over the graded rows
    // is reproducible from the file alone.
    expect(graded).toEqual(rows.filter((r) => keep(r.instrument)));
    expect(ungraded).toEqual(rows.filter((r) => !keep(r.instrument)));
  });

  // The property that stops this being a way to make the set easier: the side a
  // pair lands on depends ONLY on the fund it names. It cannot read the query,
  // the company, the sector or whether the ranker happens to get it right, so it
  // cannot select for pairs that flatter the score.
  it("depends on the answer alone, never on the query", () => {
    const keep = (id: string) => id.length % 3 !== 0;
    const { graded, ungraded } = partitionByOfferable(rows, keep);
    const gradedAnswers = new Set(graded.map((r) => r.instrument));
    const ungradedAnswers = new Set(ungraded.map((r) => r.instrument));
    // No instrument may appear on both sides: every pair naming a given fund
    // shares that fund's fate, whatever the founder asked.
    const both = [...gradedAnswers].filter((id) => ungradedAnswers.has(id));
    expect(both).toEqual([]);
  });

  it("declares a two-sided band, so drift in either direction is caught", () => {
    expect(UNGRADED_SHARE.min).toBeGreaterThan(0);
    expect(UNGRADED_SHARE.max).toBeLessThan(100);
    expect(UNGRADED_SHARE.min).toBeLessThan(UNGRADED_SHARE.max);
  });
});

describe("the draw", () => {
  it("is deterministic for a seed and different across seeds", () => {
    const a = sampleRecall(rows, 200, 20260806);
    const b = sampleRecall(rows, 200, 20260806);
    const c = sampleRecall(rows, 200, 7);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("never returns more rows than exist, and never invents one", () => {
    const s = sampleRecall(rows, rows.length + 500, 99);
    expect(s.length).toBe(rows.length);
    expect(new Set(s).size).toBe(rows.length);
  });

  // Guards the failure the shuffle was introduced to fix: a sampler that reads
  // the file's order reproduces that order's bias. The set is grouped by mode,
  // so a biased draw over-represents whichever mode leads the file.
  it("does not inherit the file's ordering", () => {
    const head = rows.slice(0, 300);
    const drawn = sampleRecall(rows, 300, 20260806);
    const shareOf = (rs: RecallRow[], m: string) =>
      rs.filter((r) => r.mode === m).length / rs.length;
    const population = shareOf(rows, rows[0].mode);
    expect(Math.abs(shareOf(drawn, rows[0].mode) - population)).toBeLessThan(0.08);
    // ...and the head of the file is measurably NOT representative, which is
    // what makes the previous assertion worth making.
    expect(Math.abs(shareOf(head, rows[0].mode) - population))
      .toBeGreaterThan(Math.abs(shareOf(drawn, rows[0].mode) - population));
  });
});
