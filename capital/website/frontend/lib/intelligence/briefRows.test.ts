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
// Rate, counted twice and independently: 8 matches in 128 candidate rows over
// the 19 recorded briefs (6.3%), 8 in 168 rows over 30 memo-bench tapes
// (4.8%). At 8 candidates that is a match in roughly a third of briefs.
//
// So the property is strengthened from "the reply's SILENCE cannot move a row"
// to "nothing in the reply can", and it is swept over both: every subset of
// the notes, times every position the watch-only vocabulary can appear at.
// The signal is not thrown away — `watchOnly` still names every match for the
// exclusion log, FUND-4 still raises it, and the sentence that matched is the
// row's own next step, which the founder reads.
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

  // ── THE FAILURE THIS CHANGE IS ABOUT, AT THE RANK THAT MATTERS ──────────
  // Named on its own as well as swept below, because the sweep proves the
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
