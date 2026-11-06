// THE SUBJECT OF A CLAIM ABOUT THE CORPUS, IN ONE IMPLEMENTATION.
//
// ── The defect this closes, and it was found three times in one day ────────
// A guard asserts a property over a READING of the thing it protects. On
// 2026-08-13 three guards were found whose reading could not distinguish two
// states their own claim distinguishes:
//
//   check_recall_floor       floored `candidateInstrumentIds` while its prose
//                            said "a fund the writer never sees cannot be
//                            advised on". The writer is shown the list AFTER
//                            `accessiblePool`, and that filter is the largest
//                            single loss in the funnel.
//   check_pool_recall_curve  asserted the curve "WAS MEASURED ON THIS CORPUS"
//                            by comparing `corpusProvenance().instruments` --
//                            `dbInstrumentsCache.length`. The 53 Spanish
//                            closures of 2026-08-12 moved the offerable set
//                            837 -> 784 and moved that number NOT AT ALL.
//   check_corpus_currency    compared 5 of the 37 fields the committed snapshot
//                            carries, while claiming to hold it against
//                            Postgres. It was green with the snapshot 2,292
//                            eligibility rules behind.
//
// ── What the three have in common, stated as a property ───────────────────
//
//     A GUARD'S READING MUST SEPARATE THE STATES ITS CLAIM SEPARATES.
//
// In all three the reading is a lossy projection of the subject, and the loss
// is always the same KIND: the reading omits an argument the subject depends
// on. `publishableInstruments()` is a function of (rows, clock); the count is a
// function of (rows) alone and is structurally incapable of seeing the second.
// The delivered table is a function of (candidates, gates, founder); the
// candidate list is not a function of the gates. The degraded brief is a
// function of all 37 fields; the comparison was a function of 5.
//
// THE TEST FOR AN UNSEEN CASE, which is the part that generalises: name two
// states of the subject that this guard's claim calls different and its reading
// calls the same. If you can name one, the reading is a projection. If you
// cannot CONSTRUCT one -- if no mutation of the input can turn the guard red on
// the property it names -- the reading is not merely lossy, it is blind, and
// that is what `PROVE=1` in check_pool_recall_curve now executes rather than
// asserts in a printed sentence.
//
// ── Why this file exists rather than three fixes ──────────────────────────
// Because the reading that cannot drift is a FINGERPRINT OF THE DELIVERED
// VALUE. A hash of the whole subject is, by construction, a function of
// everything the subject is a function of, so a dependency that arrives later
// -- a filter, a clock, a field -- cannot be omitted from it. A count can. That
// is the whole of the durable answer, and it is one line at each call site
// provided the two sides compute it the same way, which is what this module is
// for: `emit_pool_recall_curve.ts` stamps it and `check_pool_recall_curve.ts` compares it,
// through ONE function. A second implementation would drift the first time
// either side learned about a new filter -- the defect one level up.
import { createHash } from "crypto";

import { publishableInstruments } from "../lib/intelligence/corpus";
import { today } from "../lib/intelligence/liveness";

/** The offerable set, reduced to something an artifact can carry and a guard
 *  can compare. */
export interface CorpusSubject {
  /** How many funds the product may currently offer. */
  n: number;
  /** sha256 over the sorted ids. The part a count cannot do: two sets of the
   *  same size are the same number and different digests. */
  digest: string;
  /** The date offerability was decided at. `publishableInstruments()` reads
   *  `today()`, so the offerable set moves with the CLOCK and not only with a
   *  write to Postgres -- which is precisely the dependency a row count is
   *  structurally unable to carry. Recorded so a drift can be attributed. */
  asOf: string;
}

/** The subject of every claim in this repo of the form "measured on this
 *  corpus": THE SET OF FUNDS THE PRODUCT MAY OFFER, by content.
 *
 *  Not `loadDbInstruments()` and not `corpusProvenance().instruments`. Those
 *  count hydrated rows, which includes every framework, every parent with
 *  children and every closed call -- 1,088 rows against 771 offerable funds on
 *  the day this was written. Nothing a founder is ever shown comes from the
 *  difference, and a closure pass moves the second by 53 while moving the first
 *  by zero. */
export function offerableSubject(): CorpusSubject {
  const ids = publishableInstruments().map((i) => i.id).sort();
  return {
    n: ids.length,
    // The ids joined by a character that cannot occur in one, so no two
    // different sets can produce the same input string by concatenation.
    digest: createHash("sha256").update(ids.join("\n")).digest("hex").slice(0, 16),
    asOf: today(),
  };
}

/** The stamp an artifact carries. One format, parsed by the same module that
 *  writes it, so a change to the shape cannot land on one side only. */
export function formatSubject(s: CorpusSubject): string {
  return `offerable=${s.n} ids=${s.digest} asOf=${s.asOf}`;
}

export function parseSubject(recorded: string): CorpusSubject | null {
  const m = /offerable=(\d+)\s+ids=([0-9a-f]+)\s+asOf=(\S+)/.exec(recorded ?? "");
  if (!m) return null;
  return { n: Number(m[1]), digest: m[2], asOf: m[3] };
}

/**
 * How the artifact's subject differs from the live one, or null when it does
 * not. The message says what MOVED rather than only that something did,
 * because a guard that reports "stale" without saying how far gets muted.
 */
export function subjectDrift(recorded: CorpusSubject, live: CorpusSubject): string | null {
  if (recorded.digest === live.digest) return null;
  const delta = live.n - recorded.n;
  const size = delta === 0
    // The case a count cannot see AT ALL, and the reason this is a digest: the
    // set was replaced member-for-member. One fund withdrawn and one published
    // between two runs produces exactly this.
    ? `the same ${live.n} funds by count, but NOT the same funds`
    : `${recorded.n} funds -> ${live.n} (${delta > 0 ? "+" : ""}${delta})`;
  return `${size}; measured asOf ${recorded.asOf}, live asOf ${live.asOf}`;
}
