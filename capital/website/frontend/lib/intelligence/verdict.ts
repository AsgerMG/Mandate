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
// 146 instruments carry at least one encoded filter (88.2% of corpus euros),
// but the median instrument has only TWO. That makes the two directions of
// evidence very different in strength:
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
import type { EligibilityAnswers } from "./types";

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
}

export interface InstrumentAssessment {
  instrumentId: string;
  status: VerdictStatus;
  /** Filters we could actually evaluate (spec present AND answer given). */
  checked: number;
  passed: number;
  blockers: Blocker[];
}

function isFilter(g: DbGate): boolean {
  // Untriaged gates (gateRole undefined) are still honoured, so the system
  // degrades safely while encoding coverage grows.
  return (!g.gateRole || g.gateRole === "filter") && Boolean(g.valueSpec);
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
    else base.blockers.push({ requirement: gate.requirement, field: spec.field, verified: gate.verified });
  }

  if (base.checked === 0) base.status = "unknown";
  else if (base.blockers.length === 0) base.status = "open";
  else if (base.blockers.length === 1) base.status = "one_blocker";
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

