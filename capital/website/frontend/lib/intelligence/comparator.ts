// The ONE evaluator: does this founder's answer satisfy this encoded rule?
//
// ── Why this module exists ────────────────────────────────────────────────
// There were two of these. verdict.ts carried a copy of eligibility.ts's
// comparator under a comment reading "the two must stay in step — if an
// operator is added there, add it here". They did not stay in step:
//
//   eligibility.ts  equals →  answer === spec.value          case-SENSITIVE
//   verdict.ts      equals →  norm(answer) === norm(value)    case-INSENSITIVE
//
// So the same rule could pass on the fast verdict path and fail on the
// eligibility screen, for no reason a founder or a developer could see. That
// is the identical failure mode as the intake vocabulary kept in three places
// and the country map kept in eight: a hand-maintained duplicate always drifts,
// and here it drifts silently into a wrong eligibility answer.
//
// Case-insensitive wins, because every other operator already normalises and a
// rule that hinges on capitalisation is a rule nobody intended to write.
//
// Nothing here does IO or logging. It is pure so it can be unit-tested
// exhaustively, which is the only reason to trust a component this small and
// this load-bearing.

/** Every op the encoder may emit. Adding one here is the ONLY place it needs
 *  adding — that is the point of this file existing. */
import { regionsOverlap } from "./regions.generated";

export type ValueSpec =
  | { op: "band_max"; field: string; maxAllowed: string; order: string[] }
  | { op: "band_min"; field: string; minAllowed: string; order: string[] }
  | { op: "in"; field: string; allowed: string[] }
  | { op: "not_in"; field: string; allowed: string[] }
  /** Region containment. NUTS ids are hierarchical, so a rule naming Normandie
   *  (FRD) is satisfied by a company in Basse-Normandie (FRD1). Never encode a
   *  sub-national rule as `in entityCountries`: that passes everyone in the
   *  country, which is the opposite of what the rule says. */
  | { op: "region_within"; field: string; allowed: string[] }
  | { op: "equals"; field: string; value: string }
  | { op: "boolean_true" | "boolean_false"; field: string }
  | { op: "numeric_gte" | "numeric_lte"; field: string; threshold: number };

/**
 * Values that mean "I don't know", not an answer. They MUST evaluate to null.
 *
 * Every yes/no intake field offers "Not sure", and comparing it literally
 * returned false — so hedging on a question read as FAILING it. That single
 * behaviour produced a false blocker on 12 of 12 test archetypes: the honest
 * answer was punished, and funds were hidden from founders who had simply not
 * decided yet.
 */
export const NON_ANSWERS: ReadonlySet<string> = new Set([
  "unsure", "not sure", "unknown", "n/a", "na", "depends",
]);

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Does the founder's answer hit any of `allowed`?
 *
 * Handles both shapes an answer arrives in. Several intake fields are
 * multi-value (entityCountries, activities, exclusionFlags), and an earlier
 * version handled only strings — which made the single most common encoded
 * gate, "must be established in <country>", silently return "unknown" for
 * every founder, because their answer is an array.
 */
export function matchesAny(answer: unknown, allowed: readonly string[]): boolean | null {
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
}

/** Position of `answer` in an ordered band list, or null if either end is
 *  unrecognised — an unknown band is unanswerable, never a failure. */
function comparePosition(
  order: readonly string[], answer: unknown, bound: string | undefined,
): { a: number; b: number } | null {
  if (typeof answer !== "string" || !bound || !order?.length) return null;
  const a = order.indexOf(answer);
  const b = order.indexOf(bound);
  return a === -1 || b === -1 ? null : { a, b };
}

/**
 * Evaluate one encoded rule against one founder's answer.
 *
 * Returns null when the rule cannot be decided from what we hold — a missing
 * answer, a non-answer, an unrecognised band. Null is NOT a failure: it renders
 * as "not assessable" upstream and never as a blocker. That asymmetry is the
 * whole safety property of this function, because a false blocker hides a fund
 * from someone entitled to it, invisibly to them and to us.
 */
export function evaluateSpec(spec: ValueSpec, answer: unknown): boolean | null {
  switch (spec.op) {
    case "band_max": {
      const p = comparePosition(spec.order, answer, spec.maxAllowed);
      return p ? p.a <= p.b : null;
    }
    case "band_min": {
      const p = comparePosition(spec.order, answer, spec.minAllowed);
      return p ? p.a >= p.b : null;
    }
    case "in":
      return spec.allowed ? matchesAny(answer, spec.allowed) : null;
    case "region_within": {
      if (!spec.allowed?.length) return null;
      const vals = (Array.isArray(answer) ? answer : [answer])
        .filter((v): v is string => typeof v === "string" && v.trim() !== "");
      if (!vals.length) return null;
      return vals.some((v) => spec.allowed!.some((a) => regionsOverlap(v, a)));
    }
    case "not_in": {
      if (!spec.allowed) return null;
      const hit = matchesAny(answer, spec.allowed);
      return hit === null ? null : !hit;
    }
    case "equals":
      return typeof answer === "string" && spec.value !== undefined
        ? norm(answer) === norm(spec.value)
        : null;
    case "boolean_true":
      return answer === "yes" ? true : answer === "no" ? false : null;
    case "boolean_false":
      return answer === "no" ? true : answer === "yes" ? false : null;
    case "numeric_gte":
      return typeof answer === "number" && spec.threshold !== undefined
        ? answer >= spec.threshold : null;
    case "numeric_lte":
      return typeof answer === "number" && spec.threshold !== undefined
        ? answer <= spec.threshold : null;
    default:
      return null;
  }
}
