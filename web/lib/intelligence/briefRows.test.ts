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
// ── wsGK — AND NEITHER DOES ITS WORDING ────────────────────────────────────
//
// The paragraph that stood here read: "the one thing the reply may still move
// is a WATCH-ONLY row, and that is deliberate and separate". It was not
// separate, and by the time it was written it was not deliberate either.
//
// `assembleBriefRows` sorted rows whose copy matched a vocabulary of eleven
// phrasings behind rows whose copy did not. The writer is shown
// WRITER_CANDIDATE_CAP (8) candidates and the brief publishes institutionsMax
// (7), so ONE match anywhere in the eight makes the seven non-matching rows
// exactly the published seven: the matching fund is cut and the rank-8 fund
// takes its seat. At rank 8 that is a no-op. At rank 1 it is the model's first
// choice, removed from the founder's brief by a regex over a different model's
// prose. Both are the same expression; nothing in it read the rank.
//
// Rate, from `brief_records` in Postgres (35 briefs) rather than the committed
// ledger export (ids 2-20, nothing after 2026-07-30): 8 matches in 128
// candidate rows over the 19 briefs to 2026-07-30, and 0 in the 107 rows over
// the 14 since. The last match is the day FUND-4 — "nextStep is an action the
// founder can start" — entered the writer's contract, so this is a hazard
// currently held shut by a model's good behaviour, not one firing weekly. At
// 0/107 the 95% upper bound is still 2.8% of rows.
//
// So the property is strengthened from "the reply's SILENCE cannot move a row"
// to "nothing in the reply can", and it is swept over both: every subset of
// the notes, times every position the watch-only vocabulary can appear at.
// The signal is not thrown away — `watchOnly` still names every match for the
// exclusion log, FUND-4 still raises it, and the sentence that matched is the
// row's own next step, which the founder reads.
import { describe, expect, it } from "vitest";

import { assembleBriefRows, type WriterRowNote } from "./memoCandidates";
import { WATCH_ONLY_COPY } from "./watchOnly";
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

  // ── TOTALITY: NOTHING IN A REPLY MAY SHORTEN THE CANDIDATE SET ──────────
  // Stated as a permutation rather than as a count, because a row duplicated
  // into both halves would satisfy a count and is just as wrong. It is the
  // property `measure_funnel.ts` needs to be able to say the row cuts are a
  // reordering of `toWriter` and not a different set of funds.
  it("keeps every candidate somewhere, for every reply including all-watch-only", () => {
    const sorted = [...rowKeys].sort();
    const partitionsAll = (notes: readonly WriterRowNote[]) => {
      const got = assemble(notes);
      return [...got.published.map((r) => r.channel), ...got.cutByCap].sort();
    };
    for (const mask of subsets(N)) {
      expect(partitionsAll(fullReply.filter((_, i) => (mask >> i) & 1))).toEqual(sorted);
    }
    const allWatch = fullReply.map((n) => note(n.channel, { nextStep: "Monitor the next call." }));
    expect(partitionsAll(allWatch)).toEqual(sorted);
    expect(assemble(allWatch).published.map((r) => r.channel)).toEqual(rowKeys.slice(0, CAP));
  });

  // ── THE FAILURE THIS CHANGE IS ABOUT, AT THE RANK THAT MATTERS ──────────
  // Named on its own as well as swept above, because the sweep proves the
  // property and this proves the property is about something.
  it("publishes the model's rank-one fund even when the writer hedged about it", () => {
    const hedged = fullReply.map((n, i) =>
      i === 0 ? note(n.channel, { nextStep: "Monitor the next call." }) : n);
    const got = assemble(hedged);
    expect(got.published.map((r) => r.channel)).toEqual(baseline);
    expect(got.published[0].channel).toBe(rowKeys[0]);
    // Still carried out of here, so the count reaches the exclusion log and the
    // brief's record. Reported, never acted on.
    expect(got.watchOnly).toEqual([rowKeys[0]]);
    // And the fund the demotion used to promote into its seat is still cut.
    expect(got.cutByCap).toEqual([rowKeys[N - 1]]);
    // The founder is told, in the writer's own sentence, on the row itself.
    expect(got.published[0].nextStep).toMatch(WATCH_ONLY_COPY);
  });

  // The vocabulary at every position, crossed with every subset of the notes:
  // 8 positions x 256 replies. Nothing in the reply — presence, absence or
  // wording — may change the table.
  it("holds when the watch-only vocabulary appears at any rank, on any reply", () => {
    const differed: string[] = [];
    for (let at = 0; at < N; at++) {
      const hedged = fullReply.map((n, i) =>
        i === at ? note(n.channel, { nextStep: "Monitor the next call." }) : n);
      for (const mask of subsets(N)) {
        const kept = hedged.filter((_, i) => (mask >> i) & 1);
        const got = assemble(kept).published.map((r) => r.channel);
        if (JSON.stringify(got) !== JSON.stringify(baseline)) {
          differed.push(`hedge at ${at}, mask ${mask}: ${got.join(",")}`);
        }
      }
    }
    expect(differed).toEqual([]);
  });

  // ── THE RED, SIMULATED: THE DEMOTION, REINSTATED ───────────────────────
  // The deleted expression, kept as a control exactly like the drop above it.
  // If this passed the property, the property would be pinning nothing.
  it("the demotion that was removed does NOT satisfy it, at every rank but the last", () => {
    const demotedByProse = (notes: readonly WriterRowNote[]) => {
      const byKey = new Map(notes.map((n) => [n.channel, n]));
      const waits = (k: string) => WATCH_ONLY_COPY.test(String(byKey.get(k)?.nextStep ?? ""));
      // `[...ranked.filter(actionable), ...ranked.filter(!actionable)]`, cut.
      return [...rowKeys.filter((k) => !waits(k)), ...rowKeys.filter(waits)].slice(0, CAP);
    };
    const substituted: number[] = [];
    for (let at = 0; at < N; at++) {
      const hedged = fullReply.map((n, i) =>
        i === at ? note(n.channel, { nextStep: "Monitor the next call." }) : n);
      if (JSON.stringify(demotedByProse(hedged)) !== JSON.stringify(baseline)) {
        substituted.push(at);
      }
      // And the property is unmoved at the same position.
      expect(assemble(hedged).published.map((r) => r.channel)).toEqual(baseline);
    }
    // Every rank but the eighth, whose row the cap was cutting anyway — which
    // is why "it only fires on the last row" would have been the wrong reading.
    expect(substituted).toEqual([...Array(N - 1).keys()]);
    // The rank-one case spelled out: the fund the model put first is gone, and
    // the one it put eighth is in the table.
    const hedgedFirst = fullReply.map((n, i) =>
      i === 0 ? note(n.channel, { nextStep: "Monitor the next call." }) : n);
    expect(demotedByProse(hedgedFirst)).not.toContain(rowKeys[0]);
    expect(demotedByProse(hedgedFirst)).toContain(rowKeys[N - 1]);
  });
});

// ── wsGI — WHAT THE CANDIDATE CAP ACTUALLY GOVERNS ────────────────────────
//
// `WRITER_CANDIDATE_CAP` is 8 against a published 7, and the reason recorded
// for the 8 (commit 05575942) is only "7 shown against 7 published is zero
// headroom". Nobody has ever said what the one spare seat BUYS, and the funnel
// bills double-digit points of lost recall to this cut, which reads as though
// the cap were the thing deciding it.
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
//   watch-only row above it, +2 needs two, and so on. Measured on the 33 real
//   briefs in `brief_records` that reached a writer, watch-only fires 0 times
//   on 27 of them, once on 4 and twice on 2 — never three times. So nothing
//   below rank 9 has ever been reachable at any cap value, and `npm run stages`
//   prices the whole of it at 0.12 points against a +/-3.2 half-width.
//
// The test sweeps every watch-only PATTERN rather than a handful, because the
// failure was never about which fund it was.
// ── THE BACKFILL BLOCK THAT STOOD HERE IS GONE, AND SO IS THE BACKFILL ────
// wsGI measured `WRITER_CANDIDATE_CAP` under the watch-only demotion and
// concluded it is inert -- the founder reads ranks 1-7 at a cap of 8, 12 or 18,
// and its only reach was how far a demotion could backfill past the published
// count. That argument was right, and wsGK then removed the demotion on the
// same night, so the mechanism the block pinned no longer exists: publication
// is `rows.slice(0, cap)` and nothing in the reply reaches it.
//
// The conclusion SURVIVES and is stronger -- the cap is now unconditionally
// inert for publication rather than inert-in-practice -- so `caps.ts` keeps
// wsGI's measured argument for leaving it at 8. What is deleted is three tests
// asserting a backfill that can no longer happen. A test that pins a removed
// mechanism does not fail loudly later; it quietly certifies the wrong thing.
//
// The property that replaces all three is the sweep above: for every reply,
// `published` is `rows.slice(0, cap)`. It covers the backfill case by making it
// impossible rather than by describing it.
//
// ── AND THEN THE SPARE SEAT WENT TOO (wsHR, 2026-08-18) ──────────────────
// `WRITER_CANDIDATE_CAP` is 7 now, equal to the published cap, so every
// sentence above about "8 against a published 7" is history. The block reads
// the cap as INERT, which is what made it look free; it is inert for
// PUBLICATION and was never inert for the WRITER, which was being handed a
// fund the founder could not be shown and gave one a verdict and a blocker in
// a real brief. `check_contracts.ts` ties the two caps, in both directions.
// The sweep above is unaffected: it is stated over an arbitrary cap.
