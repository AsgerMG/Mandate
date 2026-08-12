// wsGC — THE WRITER WRITES, IT DOES NOT SELECT.
//
// `worth: Boolean(note)` in `synthesize` dropped any candidate the memo writer
// returned no note for. It was never a decision: it fell out of how the memo is
// assembled, and its effect was that the last word on the published table
// belonged to whichever funds the writer happened to have something to say
// about, over the ranker that had chosen and ordered them.
//
// Measured on the 23 briefs whose funnel counts are recorded: it fired on 6,
// and on all six the published cap still had room, so not one of those drops
// was absorbed by the cut. Each was a candidate the ranker had put in the
// table, replaced by the next one down, with one line in an exclusion log as
// the only trace.
//
// ── THE PROPERTY, STATED OVER ANY REPLY RATHER THAN THE ONES WE HAVE SEEN ──
//
//   Which rows publish is decided by RANK. The reply decides what a row SAYS.
//
// The test for a case nobody has seen: take any reply at all, delete any
// subset of its notes, and assemble again. The published table must come back
// identical, key for key and in the same order. Every subset of an eight-row
// reply is swept below, not a handful of chosen ones, because the failure was
// never about which fund it was.
//
// The one thing the reply may still move is a WATCH-ONLY row, and that is
// deliberate and separate: watch-only is a signal the writer put in the copy
// and the product acts on it. Silence is not a signal. So the sweep uses copy
// with no watch-only vocabulary, and the watch-only interaction is pinned on
// its own below.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { assembleBriefRows, type WriterRowNote } from "./memoCandidates";
import { UNWRITTEN_ROW_LEAD, unwrittenRowCopy } from "./unwrittenRow";
import { WATCH_ONLY_COPY } from "./watchOnly";
import { checkBrief } from "./briefChecks";
import type { InstitutionEntry } from "./types";

const clean = (s: string) => s.replace(/\s*—\s*/g, ", ").trim();

function row(i: number, over: Partial<InstitutionEntry> = {}): InstitutionEntry {
  return {
    institution: `Scheme ${i}`,
    channel: `channel_${i}`,
    supportType: "Grant",
    ticket: "€0.5M–€2.5M",
    whyEligible: "",
    nextStep: "",
    verdict: "open",
    gatesChecked: 2 + (i % 3),
    comparableFirms: [],
    ...over,
  };
}

function note(key: string, over: Partial<WriterRowNote> = {}): WriterRowNote {
  return {
    channel: key,
    whyEligible: `A reason that belongs to ${key} and to no other row.`,
    nextStep: `Contact the body behind ${key} about the current call.`,
    blockerPlain: "",
    ...over,
  };
}

/** Every subset of `n` items, as bitmasks. n=8 is 256 cases. */
function subsets(n: number): number[] {
  return Array.from({ length: 1 << n }, (_, m) => m);
}

const CAP = 7;
const N = 8;
const rows = Array.from({ length: N }, (_, i) => row(i));
const rowKeys = rows.map((r) => r.channel);
const fullReply = rowKeys.map((k) => note(k));

const assemble = (notes: readonly WriterRowNote[]) =>
  assembleBriefRows({ rows, rowKeys, notes, cap: CAP, clean });

describe("which rows publish is decided by rank, not by what the writer wrote about", () => {
  const baseline = assemble(fullReply).published.map((r) => r.channel);

  it("publishes the top rows by rank when the writer answers in full", () => {
    expect(baseline).toEqual(rowKeys.slice(0, CAP));
  });

  it("returns the same table for every one of the 256 possible partial replies", () => {
    const differed: string[] = [];
    for (const mask of subsets(N)) {
      const kept = fullReply.filter((_, i) => (mask >> i) & 1);
      const got = assemble(kept).published.map((r) => r.channel);
      if (JSON.stringify(got) !== JSON.stringify(baseline)) {
        differed.push(`mask ${mask}: ${got.join(",")}`);
      }
    }
    expect(differed).toEqual([]);
  });

  // ── THE RED, SIMULATED ─────────────────────────────────────────────────
  // The property above is worth nothing if it would hold under the behaviour
  // it replaced, so the behaviour it replaced is reimplemented here and shown
  // to break it. This is not a second implementation of anything shipped: it
  // is the one expression that was deleted, kept as the control that says the
  // sweep is testing something. Reinstate the drop in `assembleBriefRows` and
  // the sweep goes red; delete this, and nobody can tell whether it could.
  it("the rule that was removed does NOT satisfy it, which is why the sweep matters", () => {
    const droppedByWriterSilence = (notes: readonly WriterRowNote[]) => {
      const have = new Set(notes.map((n) => n.channel));
      return rowKeys.filter((k) => have.has(k)).slice(0, CAP);
    };
    // One note missing, anywhere above the last candidate, and the founder is
    // handed a different set of funds: the row goes, and the candidate the
    // ranker put below the cap moves up into its seat.
    const substituted: number[] = [];
    for (let i = 0; i < N; i++) {
      const kept = fullReply.filter((_, j) => j !== i);
      if (JSON.stringify(droppedByWriterSilence(kept)) !== JSON.stringify(baseline)) {
        substituted.push(i);
      }
    }
    // Every position but the last, whose row the cap was cutting anyway.
    expect(substituted).toEqual([...Array(N - 1).keys()]);
    // And the table the property produces is unmoved at each of them.
    for (const i of substituted) {
      const kept = fullReply.filter((_, j) => j !== i);
      expect(assemble(kept).published.map((r) => r.channel)).toEqual(baseline);
    }
  });

  it("counts the unwritten rows rather than leaving them to be inferred", () => {
    for (const mask of subsets(N)) {
      const kept = fullReply.filter((_, i) => (mask >> i) & 1);
      const missing = rowKeys.filter((_, i) => !((mask >> i) & 1));
      expect(assemble(kept).unwritten).toEqual(missing);
    }
  });

  // Watch-only is the one thing in the reply that may still move a row, and it
  // moves it BEHIND the written rows rather than out of the table. Pinned so
  // that "the reply cannot change membership" is never read as covering it.
  it("demotes a watch-only row behind the others and never deletes it", () => {
    const flagged = fullReply.map((n, i) =>
      i === 0 ? note(n.channel, { nextStep: "Monitor the next call." }) : n);
    const got = assemble(flagged);
    expect(got.published.map((r) => r.channel)).not.toContain(rowKeys[0]);
    expect(got.watchOnly).toEqual([rowKeys[0]]);
    // Not deleted: it is the row the cap cut, and it sits last in the order.
    expect(got.cutByCap).toEqual([rowKeys[0]]);
  });
});

// ── wsGI — WHAT THE CANDIDATE CAP ACTUALLY GOVERNS ────────────────────────
//
// `WRITER_CANDIDATE_CAP` is 8 against a published 7, and the reason recorded
// for the 8 (commit 05575942) is only "7 shown against 7 published is zero
// headroom". Nobody has ever said what the one spare seat BUYS, and the funnel
// bills 14.2 points of lost recall to this cut, which reads as though the cap
// were the thing deciding it.
//
// It is not. `publishRankByKey` ranks by CANDIDATE ORDER, so the published
// table is the head of the ranked list and the only thing that can disturb that
// head is the watch-only demotion. Stated as the property, over an arbitrary
// reply rather than the ones we have seen:
//
//   A candidate at 1-based rank r publishes IFF
//        r <= candidateCap    AND    r - w(r) <= publishedCap
//   where w(r) is the number of watch-only rows strictly above it.
//
// Two consequences a reader should be able to check against the code:
//
//   With NO watch-only row, the published table is ranks 1..publishedCap for
//   EVERY candidate cap. The cap is inert. It is not a recall lever.
//
//   The cap's whole reach is BACKFILL DEPTH: rank publishedCap+1 needs one
//   watch-only row above it, +2 needs two, and so on. Measured on the 35 real
//   briefs in `brief_records`, watch-only fires 0 times on 29 of them, once on
//   4 and twice on 2 — never three times. So at today's caps nothing below
//   rank 9 has ever been reachable at any cap value.
//
// The test sweeps every watch-only PATTERN rather than a handful, because the
// failure was never about which fund it was.
describe("the candidate cap bounds the watch-only backfill, and nothing else", () => {
  const PUBLISHED = 7;
  const watchNote = (key: string) => note(key, { nextStep: "Monitor the next call." });

  /** The property, computed from the definition rather than from the code under
   *  test: which keys SHOULD publish, given which candidates are watch-only. */
  function expected(keys: readonly string[], watch: ReadonlySet<string>, cap: number) {
    const seen = keys.slice(0, cap);
    return [...seen.filter((k) => !watch.has(k)), ...seen.filter((k) => watch.has(k))]
      .slice(0, PUBLISHED);
  }

  // Wider than production so the cap has somewhere to move to. Ten candidates
  // is 1024 watch-only patterns, each assembled at four cap values.
  const N10 = 10;
  const rows10 = Array.from({ length: N10 }, (_, i) => row(i));
  const keys10 = rows10.map((r) => r.channel);

  it("publishes exactly the rank the formula names, on all 1024 patterns × 4 caps",
    () => {
      const wrong: string[] = [];
      for (let mask = 0; mask < 1 << N10; mask++) {
        const watch = new Set(keys10.filter((_, i) => (mask >> i) & 1));
        const notes = keys10.map((k) => (watch.has(k) ? watchNote(k) : note(k)));
        for (const cap of [PUBLISHED, PUBLISHED + 1, PUBLISHED + 2, N10]) {
          const got = assembleBriefRows({
            rows: rows10.slice(0, cap), rowKeys: keys10.slice(0, cap),
            notes, cap: PUBLISHED, clean,
          }).published.map((r) => r.channel);
          const want = expected(keys10, watch, cap);
          if (JSON.stringify(got) !== JSON.stringify(want)) {
            wrong.push(`mask ${mask} cap ${cap}: ${got.join(",")} != ${want.join(",")}`);
          }
        }
      }
      expect(wrong.slice(0, 5)).toEqual([]);
    });

  // The headline, isolated so it cannot be lost inside the sweep above: with
  // nothing watch-only, raising the candidate cap changes NOTHING a founder
  // reads. Anyone proposing to raise it to buy recall is proposing to buy
  // nothing, and this is the line that says so.
  it("is INERT when no candidate is watch-only, at every cap from 7 to 10", () => {
    const notes = keys10.map((k) => note(k));
    const tables = [PUBLISHED, PUBLISHED + 1, PUBLISHED + 2, N10].map((cap) =>
      assembleBriefRows({
        rows: rows10.slice(0, cap), rowKeys: keys10.slice(0, cap),
        notes, cap: PUBLISHED, clean,
      }).published.map((r) => r.channel));
    for (const t of tables) expect(t).toEqual(keys10.slice(0, PUBLISHED));
  });

  // And the converse, so "inert" is never read as "unused": one watch-only row
  // above the boundary and the spare seat is what publishes a real fund instead
  // of a row telling the founder to wait. That is what the headroom is FOR.
  it("reaches exactly one rank deeper per watch-only row above the boundary", () => {
    for (let w = 0; w <= 3; w++) {
      const watch = new Set(keys10.slice(0, w));
      const notes = keys10.map((k) => (watch.has(k) ? watchNote(k) : note(k)));
      const deepest = (cap: number) => {
        const got = assembleBriefRows({
          rows: rows10.slice(0, cap), rowKeys: keys10.slice(0, cap),
          notes, cap: PUBLISHED, clean,
        }).published.map((r) => keys10.indexOf(r.channel) + 1);
        return Math.max(...got.filter((r) => !watch.has(keys10[r - 1])));
      };
      // Unbounded, the actionable head reaches rank 7+w. Bounded at 8 it can
      // never reach past 8, whatever the demand.
      expect(deepest(N10), `w=${w} uncapped`).toBe(PUBLISHED + w);
      expect(deepest(PUBLISHED + 1), `w=${w} at cap 8`).toBe(Math.min(PUBLISHED + w, PUBLISHED + 1));
    }
  });

  // ── THE RED, SIMULATED ─────────────────────────────────────────────────
  // The sweep is worth nothing unless a plausible wrong implementation breaks
  // it, so both are built here and shown to. Neither is a second copy of
  // anything shipped: one is the rule wsGC deleted, the other is the rule
  // somebody would write if they believed the cap ranks.
  it("neither DELETING watch-only nor letting the cap reorder satisfies it", () => {
    const watch = new Set([keys10[0], keys10[1]]);
    const notes = keys10.map((k) => (watch.has(k) ? watchNote(k) : note(k)));
    const want = expected(keys10, watch, N10);

    // 1. "The cap ranks": publish the first `PUBLISHED` by rank with no
    //    demotion at all. Wrong the moment anything above the boundary is
    //    watch-only, which is the only case where the cap does anything.
    const noDemotion = keys10.slice(0, PUBLISHED);
    expect(noDemotion).not.toEqual(want);

    // 2. The pre-wsGC rule: DELETE the watch-only row instead of demoting it.
    //    It agrees with the shipped rule exactly while enough actionable rows
    //    survive to fill the cap, and diverges the moment they do not -- which
    //    is the short-table failure, and the reason the demotion exists. Stated
    //    as the boundary rather than as one example, and swept, because "they
    //    look the same on the case I tried" is how the deletion survived.
    const deleteRule = (watchSet: ReadonlySet<string>) =>
      keys10.filter((k) => !watchSet.has(k)).slice(0, PUBLISHED);
    const agreeWhenEnough: number[] = [];
    const differWhenNotEnough: number[] = [];
    for (let mask = 0; mask < 1 << N10; mask++) {
      const w = new Set(keys10.filter((_, i) => (mask >> i) & 1));
      const same = JSON.stringify(deleteRule(w)) === JSON.stringify(expected(keys10, w, N10));
      const enoughActionable = N10 - w.size >= PUBLISHED;
      if (enoughActionable && !same) agreeWhenEnough.push(mask);
      if (!enoughActionable && same) differWhenNotEnough.push(mask);
    }
    expect(agreeWhenEnough).toEqual([]);
    expect(differWhenNotEnough).toEqual([]);

    // And the shipped implementation agrees with the formula on the same input.
    const got = assembleBriefRows({
      rows: rows10, rowKeys: keys10, notes, cap: PUBLISHED, clean,
    }).published.map((r) => r.channel);
    expect(got).toEqual(want);
  });
});

// ── WHAT AN UNWRITTEN ROW SAYS ────────────────────────────────────────────
// Stated over a swept matrix of rows rather than over the ones the corpus
// happens to hold, so a fund nobody has seen yet is covered by the same rules.
describe("a row published without writer copy", () => {
  const matrix: InstitutionEntry[] = [];
  for (const verdict of ["open", "one_blocker", "unknown", undefined] as const) {
    for (const gatesChecked of [0, 1, 4]) {
      for (const stale of [false, true]) {
        for (const link of [undefined, { url: "u", kind: "apply" as const, label: "l" },
          { url: "u", kind: "programme" as const, label: "l" }]) {
          matrix.push(row(matrix.length, { verdict, gatesChecked, stale, link,
            lastAwardYear: stale ? 2019 : undefined }));
        }
      }
    }
  }

  // The contract states the word caps; reading them from it keeps this from
  // becoming a second copy that can disagree with what the writer is told.
  const contract = readFileSync(new URL("../../contracts/brief/02-funds.md", import.meta.url), "utf8");
  const capFor = (id: string) => {
    const m = new RegExp(`${id} \\(judged\\)[\\s\\S]{0,120}?at most (\\d+) words`).exec(contract);
    if (!m) throw new Error(`${id}'s word cap is not stated in the funds contract`);
    return Number(m[1]);
  };
  const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

  it("always fills both fields, whatever the row carries", () => {
    for (const r of matrix) {
      const c = unwrittenRowCopy(r);
      expect(c.whyEligible.trim(), JSON.stringify(r)).not.toBe("");
      expect(c.nextStep.trim(), JSON.stringify(r)).not.toBe("");
    }
  });

  it("stays inside the word caps the contract states for written copy", () => {
    for (const r of matrix) {
      const c = unwrittenRowCopy(r);
      expect(words(c.whyEligible)).toBeLessThanOrEqual(capFor("FUND-8"));
      expect(words(c.nextStep)).toBeLessThanOrEqual(capFor("FUND-9"));
    }
  });

  it("never gives a founder something to watch instead of something to do", () => {
    for (const r of matrix) {
      const c = unwrittenRowCopy(r);
      expect(WATCH_ONLY_COPY.test(c.nextStep), c.nextStep).toBe(false);
      expect(WATCH_ONLY_COPY.test(c.whyEligible), c.whyEligible).toBe(false);
    }
  });

  it("says it is not an assessment, so it cannot be read as one", () => {
    for (const r of matrix) {
      expect(unwrittenRowCopy(r).whyEligible.startsWith(UNWRITTEN_ROW_LEAD)).toBe(true);
    }
  });

  it("differs between two rows that differ, so a brief never repeats itself", () => {
    const distinct = new Set(matrix.map((r) => JSON.stringify(unwrittenRowCopy(r))));
    expect(distinct.size).toBeGreaterThan(1);
    // Two rows the screen reached the same conclusion about DO read alike, and
    // that is correct: the same facts are the same sentence. What must not
    // happen is every row reading alike whatever it holds.
    const sameFacts = [row(90, { verdict: "open", gatesChecked: 3 }),
      row(91, { verdict: "open", gatesChecked: 3 })];
    expect(unwrittenRowCopy(sameFacts[0])).toEqual(unwrittenRowCopy(sameFacts[1]));
  });

  it("is visible to FUND-5 on the published brief, not only in a log", () => {
    const got = assemble(fullReply.slice(1));
    const violations = checkBrief({ institutions: got.published }, undefined,
      rows.map((r) => r.institution));
    const fund5 = violations.filter((v) => v.ruleId === "FUND-5");
    expect(fund5.length).toBe(1);
    expect(fund5[0].detail).toContain(rows[0].institution);
  });
});
