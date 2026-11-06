// The mechanically checkable half of contracts/ranker/asks.md.
//
// Sibling of questionChecks.ts and briefChecks.ts. It exists separately because
// the thing being checked is different in kind: the round-2 planner's questions
// are checked for grounding in SOME fund's requirement, and these are checked
// for grounding in a demand that a simulation has already shown to move a
// candidate on THIS founder's list. The reference the model carries back is
// what ties the two together, so most of this module is about that reference
// surviving the trip.
//
// Rule ids are declared in contracts/ranker/asks.md and checked against this
// module by scripts/check_contracts.ts, same as the brief and the round-2
// screen. A check enforcing a rule no contract declares fails the build, and so
// does a rule nothing enforces and nothing declares unenforceable.
import { FIELD_ENUM_HINTS, type EligibilityAnswers } from "./types";

/** Marks a question as written by the stage that picks, rather than by the
 *  round-2 planner. Same argument as the commercial and open prefixes in
 *  types.ts: the split matters at READ time, because these answers are ordinary
 *  intake values and their provenance is otherwise invisible. */
export const RANKER_ASK_PREFIX = "ranker::";

/** The rules this module decides. Read by scripts/check_contracts.ts, which
 *  fails the build if any id here is not declared by a contract. */
export const RANKER_ASK_RULE_IDS = ["RA-1", "RA-2", "RA-3", "RA-B1"] as const;

export interface AskViolation {
  ruleId: string;
  detail: string;
}

/** One question as the founder will see it. The answer SPACE is the intake
 *  field's own, so an answer lands in `EligibilityAnswers` and reaches the
 *  stage that ranks — which is the whole reason this shape and not a prose
 *  question: a fact the ranker cannot read cannot change what it picks. */
export interface AskedQuestion {
  field: string;
  question: string;
  options: { value: string; label: string }[];
  /** Grounding, carried for the citation and for the audit. */
  ref: string;
  instrumentId: string;
  instrumentName: string;
  gateKey: string;
  quote: string;
  locator?: string;
}

/** What a question must be checked against: the demand it claims, and the
 *  candidates that demand was shown to move. Structural only — this module
 *  never re-derives the three legs, it only asserts the model stayed inside
 *  what they produced. */
export interface OfferedDemand {
  ref: string;
  field: string;
  requirement: string;
  instrumentId: string;
  instrumentName: string;
  gateKey: string;
  locator?: string;
  /** Menu index numbers this demand moves. */
  moves: number[];
}

const TOKENS = (s: string) => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];

/**
 * A run of words an option shares unbroken with the requirement it came from.
 *
 * RA-3 states a property — an option is written in words the founder already
 * uses — and this is the test that decides it without a register of forbidden
 * phrases. Four words is the threshold because shorter overlaps are
 * unavoidable: an option about research will legitimately contain the ordinary
 * words for research. A four-word verbatim run means the sentence was carried
 * over rather than translated, and the founder is being shown a phrase out of
 * an administrative document.
 *
 * The same threshold and the same argument as `liftedPhrase` in
 * questionChecks.ts, which decides the identical property for the planner's
 * options.
 */
export function liftedRun(option: string, quote: string, minRun = 4): string | null {
  const o = TOKENS(option);
  const q = TOKENS(quote);
  if (o.length < minRun || q.length < minRun) return null;
  const haystack = ` ${q.join(" ")} `;
  for (let i = 0; i + minRun <= o.length; i += 1) {
    const run = o.slice(i, i + minRun).join(" ");
    if (haystack.includes(` ${run} `)) return run;
  }
  return null;
}

/** The distinctive words of a scheme's shown name. Short and generic tokens are
 *  dropped: a question about what a company builds may legitimately contain the
 *  ordinary word for a fund or a programme, and a check that fires on those is
 *  a check people learn to ignore. */
function nameTokens(name: string): string[] {
  return TOKENS(name).filter((t) => t.length >= 5);
}

/**
 * RA-B1, as a test rather than a list of scheme names.
 *
 * The property is that a question collects a fact about the company and never
 * points at a fund. A question is pointing at a fund when it repeats enough of
 * that fund's own shown name to identify it — so the test is asked against the
 * names on THIS founder's menu, which means it works for a scheme nobody here
 * has seen.
 */
export function namesACandidate(
  question: string, candidateNames: string[],
): string | null {
  const words = new Set(TOKENS(question));
  for (const name of candidateNames) {
    const toks = nameTokens(name);
    if (!toks.length) continue;
    const hit = toks.filter((t) => words.has(t));
    // Two distinctive tokens of one name, or a single long one, identifies it.
    if (hit.length >= 2 || hit.some((t) => t.length >= 8)) return name;
  }
  return null;
}

/**
 * Everything the contract can decide mechanically, applied to what the model
 * returned.
 *
 * A question that fails any hard rule is DROPPED rather than repaired. The
 * precedent is the adaptive round's: a question and its options are one
 * artifact, and keeping half of a broken one is what produced a tailored
 * sentence sitting above the wrong answer set. And dropping is cheap here in a
 * way it is not elsewhere — this stage is allowed to ask nothing, so the floor
 * of dropping every question is the stage's own valid output.
 */
export function checkAskedQuestions(
  raw: unknown[],
  demands: OfferedDemand[],
  candidates: { instrumentId: string; name: string; rank: number }[],
  cap: number,
  answers?: EligibilityAnswers,
): { kept: AskedQuestion[]; violations: AskViolation[] } {
  const byRef = new Map(demands.map((d) => [d.ref, d]));
  const names = candidates.map((c) => c.name);
  const kept: AskedQuestion[] = [];
  const violations: AskViolation[] = [];
  const seenField = new Set<string>();

  for (const item of raw) {
    if (kept.length >= cap) break;
    const q = item as {
      ref?: unknown; question?: unknown;
      options?: unknown; moves?: unknown;
    };
    const ref = typeof q.ref === "string" ? q.ref.trim() : "";
    const text = typeof q.question === "string" ? q.question.trim() : "";

    // RA-1. The reference is the whole grounding: without it there is no fund,
    // no requirement and no evidence that anything would move.
    const demand = byRef.get(ref);
    if (!demand || !text) {
      violations.push({ ruleId: "RA-1", detail: `question with no offered demand behind it (ref "${ref}")` });
      continue;
    }
    // One question per field. Two demands can be two sentences about one
    // answer, and asking twice spends two of a founder's few questions on one
    // fact.
    if (seenField.has(demand.field)) {
      violations.push({ ruleId: "RA-1", detail: `${demand.field} asked twice` });
      continue;
    }

    // RA-2. The model must still be pointing at candidates the simulation said
    // this demand moves. A question that has drifted onto something else is a
    // question whose answer we have no evidence changes anything.
    const moves = (Array.isArray(q.moves) ? q.moves : [])
      .filter((m): m is number => Number.isInteger(m));
    if (!moves.some((m) => demand.moves.includes(m))) {
      violations.push({ ruleId: "RA-2", detail: `${demand.field} names no candidate its own demand moves` });
      continue;
    }

    // RA-B1. Never a fund's name in a question a founder reads.
    const named = namesACandidate(text, names);
    if (named) {
      violations.push({ ruleId: "RA-B1", detail: `the question identifies ${named}` });
      continue;
    }

    // RA-3. The answer space is the field's own and the labels are the model's.
    // All or nothing, for the same reason the adaptive round makes it all or
    // nothing: whoever writes the question writes what sits under it, or the
    // two can disagree.
    const hint = FIELD_ENUM_HINTS[demand.field];
    const allowed = hint
      ? (hint.optionsFor ? hint.optionsFor(answers ?? {}) : hint.options)
      : [];
    const valid = new Set(allowed.map((o) => o.value));
    const labelled = (Array.isArray(q.options) ? q.options : [])
      .map((o) => o as { value?: unknown; label?: unknown })
      .filter((o) => typeof o?.value === "string" && valid.has(o.value)
        && typeof o?.label === "string" && o.label.trim())
      .map((o) => ({ value: String(o.value), label: String(o.label).trim() }));
    const covers = labelled.length === allowed.length
      && new Set(labelled.map((o) => o.value)).size === valid.size;
    if (!covers) {
      violations.push({ ruleId: "RA-3", detail: `${demand.field} options do not cover its answer space` });
      continue;
    }
    const lifted = labelled
      .map((o) => liftedRun(o.label, demand.requirement))
      .find((r): r is string => Boolean(r));
    if (lifted) {
      violations.push({ ruleId: "RA-3", detail: `an option repeats the requirement verbatim ("${lifted}")` });
      continue;
    }

    seenField.add(demand.field);
    kept.push({
      field: demand.field,
      question: text,
      options: labelled,
      ref: demand.ref,
      instrumentId: demand.instrumentId,
      instrumentName: demand.instrumentName,
      gateKey: demand.gateKey,
      quote: demand.requirement,
      locator: demand.locator,
    });
  }
  return { kept, violations };
}
