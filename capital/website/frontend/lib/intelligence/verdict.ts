// Per-instrument qualification: can THIS founder actually walk through THIS
// door, and if not, what is the one thing in the way?
//
// Runs on the curated gate layer written by ETL/terms/encode_gates.py — only
// gates triaged as `filter` and carrying a machine-readable `valueSpec`.
// Obligations ("works must not start before the grant decision") and programme
// facts ("aid intensity capped at 20%") are excluded: together they are half
// the corpus, and neither says anything about who qualifies.
//
// ── The asymmetry this is built around ────────────────────────────────────
// 1,018 of 1,088 instruments carry at least one encoded filter (99.7% of
// corpus euros, Postgres 2026-08-13), and the median one carries THREE. Those
// figures have moved a long way — the line here read "146 instruments, 88.2%
// of euros, median TWO" from an encoding pass seven times smaller — and the
// asymmetry below is unaffected, because it is about what a HANDFUL of rules
// can and cannot prove, and three is still a handful against a real rulebook:
//
//   * Failing a filter is CONCLUSIVE. "Must be a Swedish startup" fails a
//     German company no matter how few other rules we happen to have encoded.
//   * Passing the filters we happen to hold is NOT proof of qualification.
//     Two passed rules out of a real rulebook of thirty means "nothing we can
//     check rules you out" — which is a genuinely useful thing to say, but it
//     is not "you qualify".
//
// So the vocabulary is deliberately asymmetric: we say a door is OPEN (nothing
// disqualifies you), never that you are approved. Overclaiming here is the one
// failure that would cost a founder months.
import { loadDbInstruments, type DbGate, type DbInstrument } from "./corpus";
import { evaluateSpec, type ValueSpec } from "./comparator";
import { type EligibilityAnswers } from "./types";
// The two predicates that decide whether one rule may end the conversation —
// `isCited` and `isStructural` — stood HERE, and this module imports corpus.ts.
// That put them out of reach of corpus.ts itself, which is where gate
// inheritance is decided and is exactly a place that has to ask the question.
// They now live in a leaf that imports neither, and are re-exported so that
// every caller reaches ONE definition whichever name it uses.
import {
  isAttributable, isCited, isConclusive, isFilter, isStructural,
} from "./evidenceTier";

export { isAttributable, isCited, isConclusive, isFilter, isStructural };

export type VerdictStatus =
  /** Nothing we can check rules this founder out. */
  | "open"
  /** Exactly one filter fails, and it is curable. Worth showing WITH the fix. */
  | "one_blocker"
  /** Conclusively out. Never shown to the founder. */
  | "blocked"
  /** No encoded filter could be evaluated — we have nothing to say either way. */
  | "unknown";

export interface Blocker {
  /** Verbatim requirement text, for the "what would change it" line. */
  requirement: string;
  field: string;
  /** True only for llm_2pass/human_verified gates: assertable as fact. */
  verified: boolean;
  /** Traceable to the fund's own text. Only a cited rule may disqualify. */
  cited: boolean;
}

export interface InstrumentAssessment {
  instrumentId: string;
  status: VerdictStatus;
  /** Filters we could actually evaluate (spec present AND answer given). */
  checked: number;
  passed: number;
  blockers: Blocker[];
}

/** Exported for unit tests: this is the real decision boundary, and testing
 *  it through assessAll would require loading the whole corpus. */
export function assessInstrument(
  inst: DbInstrument,
  answers: EligibilityAnswers | undefined,
): InstrumentAssessment {
  const base: InstrumentAssessment = {
    instrumentId: inst.id, status: "unknown", checked: 0, passed: 0, blockers: [],
  };
  if (!answers) return base;

  for (const gate of inst.gates) {
    if (!isFilter(gate)) continue;
    const spec = gate.valueSpec as ValueSpec | null;
    if (!spec?.field) continue;
    const answer = (answers as Record<string, unknown>)[spec.field];
    const result = evaluateSpec(spec, answer);
    if (result === null) continue; // unanswered or unevaluable — never a failure
    base.checked += 1;
    if (result) base.passed += 1;
    else base.blockers.push({
      requirement: gate.requirement, field: spec.field,
      verified: gate.verified, cited: isCited(gate),
    });
  }

  // One structural failure is conclusive. Two curable ones are a conversation.
  //
  // ── "TWO" MEANS TWO THINGS IN THE WAY, NOT TWO GATE ROWS (wsGE) ──────────
  //
  // The arithmetic clause counted BLOCKERS, and a blocker is one gate row. An
  // instrument that encodes one requirement twice therefore produced two
  // blockers off one requirement and condemned itself, and the founder was
  // told nothing because `accessiblePool` deletes a blocked row.
  //
  // The property: the ladder counts how many DISTINCT THINGS stand between
  // this founder and this fund, and the unit of a "thing" is the intake field.
  // It is the unit the founder answers in, the unit "what would change it" is
  // written in, and the unit they could turn up differently on. A founder
  // cannot fix their ticket band twice.
  //
  // The test for a case nobody has seen: an instrument carrying three
  // `entityCountries` gates, all failing for a founder established elsewhere,
  // is ONE thing in the way — where they are established — not three. It still
  // blocks, on severity, because establishment is structural and cited; what
  // changes is that it no longer blocks BY COUNTING.
  //
  // ── What it costs and what it buys, measured ─────────────────────────────
  // 820 held-out described founders, one per company, replayed through the
  // shipped build (scripts/_wsge_attribution.ts, arms in
  // scripts/_wsge_counterfactual.ts). The won fund was in the accessible pool
  // for 74.8% of them. 105 of the 184 losses were ONE field encoded twice with
  // both encodings failing, and nothing else against the fund:
  //
  //     as-is (count gate rows)      74.8%
  //     by-field (this change)       87.6%
  //     severity only (delete the
  //       arithmetic clause)         88.7%   — 9 more founders, and it would
  //                                            let five unrelated failures pass
  //
  // ██ 96 OF THOSE 105 ARE ONE FUND. ██ `innovate_uk` carries `G3-01` and
  // `G3-02`, byte-identical ticketBand specs, and it is the re-attribution
  // target for the whole GtR population — 109 of 820 founders, none of whom
  // could be recalled. Deleting that one duplicated row in Postgres would earn
  // most of the same points. This is the code half deliberately: the duplicate
  // is a shape the corpus PRODUCES rather than one bad row, and a ladder that
  // miscounts it will keep costing funds nobody has replayed yet.
  //
  // Re-derived against Postgres 2026-08-13, and the residue is still there:
  // 1,312 surplus same-field filter rows across 397 instruments, of which 606
  // are BYTE-IDENTICAL value specs across 265 instruments and the remaining 706
  // are two different specs on one field. Only the identical ones are
  // unambiguously deletable; the rest need a human to say whether they are one
  // requirement written twice or two the encoder should have merged. wsGE's
  // "668 across ~470" counted differently and is not comparable — the query
  // that produced these three numbers is in the wsGL evidence file.
  //
  // What would prove this wrong: an instrument where two gates on ONE field
  // encode two INDEPENDENT requirements a founder could satisfy separately.
  // Two `activities` exclusions — coal and tobacco — look like that case, and
  // are not: the founder gives one `activities` answer and it either clears
  // the fund's exclusions or it does not. If such a case is ever found, the
  // repair is to split the field, not to go back to counting rows.
  const structural = base.blockers.filter((b) => isStructural(b.field) && b.cited);
  const fieldsInTheWay = new Set(base.blockers.map((b) => b.field)).size;
  if (base.checked === 0) base.status = "unknown";
  else if (base.blockers.length === 0) base.status = "open";
  else if (structural.length > 0) base.status = "blocked";
  else if (fieldsInTheWay === 1) base.status = "one_blocker";
  else base.status = "blocked";
  return base;
}

export function assessAll(
  instrumentIds: string[],
  answers: EligibilityAnswers | undefined,
): Map<string, InstrumentAssessment> {
  const ids = new Set(instrumentIds);
  const out = new Map<string, InstrumentAssessment>();
  for (const inst of loadDbInstruments()) {
    if (ids.has(inst.id)) out.set(inst.id, assessInstrument(inst, answers));
  }
  return out;
}

/** Display order: doors that are open, then doors with one thing in the way,
 *  then instruments we cannot assess. `blocked` never reaches the founder. */
export const VERDICT_RANK: Record<VerdictStatus, number> = {
  open: 0, one_blocker: 1, unknown: 2, blocked: 3,
};

