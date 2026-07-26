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

type ValueSpec = {
  op: string;
  field: string;
  allowed?: string[];
  value?: string;
  maxAllowed?: string;
  minAllowed?: string;
  order?: string[];
  threshold?: number;
};

/**
 * Values that mean "I don't know", not an answer. They MUST evaluate to null.
 *
 * Every yes/no intake field offers "Not sure", and comparing it literally
 * returned false — so hedging on one question read as FAILING it. That single
 * behaviour produced a false blocker on 12 of 12 test archetypes: the honest
 * answer was punished, and funds were hidden from founders who simply had not
 * decided yet.
 */
const NON_ANSWERS = new Set(["unsure", "not sure", "unknown", "n/a", "na", "depends"]);

const norm = (s: string) => s.trim().toLowerCase();

/** Mirrors eligibility.ts's evalComparator. Kept here rather than imported so
 *  the verdict layer has no dependency on the framework-check module; the two
 *  must stay in step — if an operator is added there, add it here. */
function evaluate(spec: ValueSpec, answer: unknown): boolean | null {
  const matchesAny = (allowed: string[]): boolean | null => {
    const wanted = new Set(allowed.map(norm));
    if (typeof answer === "string") {
      if (!answer.trim() || NON_ANSWERS.has(norm(answer))) return null;
      return wanted.has(norm(answer));
    }
    if (Array.isArray(answer)) {
      const vals = answer.filter(
        (a): a is string => typeof a === "string" && Boolean(a.trim()) && !NON_ANSWERS.has(norm(a)),
      );
      return vals.length ? vals.some((a) => wanted.has(norm(a))) : null;
    }
    return null;
  };
  const band = (target: string | undefined, dir: "max" | "min"): boolean | null => {
    if (typeof answer !== "string" || !target || !spec.order?.length) return null;
    const ai = spec.order.indexOf(answer);
    const ti = spec.order.indexOf(target);
    if (ai === -1 || ti === -1) return null;
    return dir === "max" ? ai <= ti : ai >= ti;
  };
  switch (spec.op) {
    case "band_max": return band(spec.maxAllowed, "max");
    case "band_min": return band(spec.minAllowed, "min");
    case "in": return spec.allowed ? matchesAny(spec.allowed) : null;
    case "not_in": {
      if (!spec.allowed) return null;
      const hit = matchesAny(spec.allowed);
      return hit === null ? null : !hit;
    }
    case "equals":
      return typeof answer === "string" && spec.value !== undefined
        ? norm(answer) === norm(spec.value) : null;
    case "boolean_true": return answer === "yes" ? true : answer === "no" ? false : null;
    case "boolean_false": return answer === "no" ? true : answer === "yes" ? false : null;
    case "numeric_gte":
      return typeof answer === "number" && spec.threshold !== undefined
        ? answer >= spec.threshold : null;
    case "numeric_lte":
      return typeof answer === "number" && spec.threshold !== undefined
        ? answer <= spec.threshold : null;
    default: return null;
  }
}

function isFilter(g: DbGate): boolean {
  // Untriaged gates (gateRole undefined) are still honoured, so the system
  // degrades safely while encoding coverage grows.
  return (!g.gateRole || g.gateRole === "filter") && Boolean(g.valueSpec);
}

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
    const result = evaluate(spec, answer);
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

/** Founder-facing label. Deliberately never says "you qualify" — see the
 *  asymmetry note at the top of this file. */
export function verdictLabel(status: VerdictStatus): string {
  switch (status) {
    case "open": return "Open to you";
    case "one_blocker": return "One thing in the way";
    case "unknown": return "Not yet assessable";
    case "blocked": return "Ruled out";
  }
}
