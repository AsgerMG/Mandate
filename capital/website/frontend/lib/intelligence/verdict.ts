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
import { fieldSeverity, type EligibilityAnswers } from "./types";

/**
 * Can this founder do anything about a failed rule?
 *
 * ── Why severity, not arithmetic ───────────────────────────────────────────
 * `blocked` used to mean "two or more filters failed". The median publishable
 * instrument carries TWO filters in total, so failing the single most
 * disqualifying rule it has — establishment, headcount, an excluded activity —
 * left the fund published with a polite note. Every out-of-scope company in
 * the red-team set got a full table that way: a US business with no European
 * entity was offered German state aid, and a 40,000-person corporate was
 * offered SME-only lanes.
 *
 * What makes a failure fatal is not how many friends it has. It is whether the
 * founder could turn up differently. Where they are established, how many
 * people they employ, what they sell, who owns them: not this quarter. Whether
 * they will run a consortium, co-finance a quarter of the cost, or open a
 * local entity: a decision, and the brief exists to put that decision in front
 * of them.
 *
 * Read off the intake field the gate is encoded against, so it holds for
 * instruments and countries nobody has looked at yet.
 *
 * The classification itself lives with the fields in types.ts, keyed so the
 * compiler demands it for every intake field. Keeping it here made it a list
 * this engine happened to hold, which a new field could quietly miss.
 */

/** True when failing this rule is a fact about the company, not a choice. */
export function isStructural(field: string): boolean {
  return fieldSeverity(field) === "structural";
}

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

  // One structural failure is conclusive. Two curable ones are a conversation.
  const structural = base.blockers.filter((b) => isStructural(b.field));
  if (base.checked === 0) base.status = "unknown";
  else if (base.blockers.length === 0) base.status = "open";
  else if (structural.length > 0) base.status = "blocked";
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

