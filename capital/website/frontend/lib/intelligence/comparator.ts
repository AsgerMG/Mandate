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
import { BAND_ORDERS } from "./vocabulary";

export type ValueSpec =
  /** `order` is a STALE SNAPSHOT, kept only for specs written before the band
   *  list became the single source. The live order comes from `BAND_ORDERS`;
   *  see `bandOrderFor`. */
  | { op: "band_max"; field: string; maxAllowed: string; order?: string[] }
  | { op: "band_min"; field: string; minAllowed: string; order?: string[] }
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

/** The band order to compare on: the LIVE vocabulary for a field that has one,
 *  and only otherwise whatever the spec froze into itself.
 *
 *  Every `band_max`/`band_min` spec in the corpus carries its own copy of the
 *  band list, written at encode time. That copy is a snapshot, and rebanding
 *  `ticketBand` — splitting the old `lt500k`, which held 706 of 892 instruments
 *  — turned all 33 of them stale at once. The failure is silent and it is the
 *  wrong kind of silent: `indexOf` returns -1 for a band the snapshot predates,
 *  `comparePosition` returns null, and the rule reads as "not assessable" for
 *  every founder forever. That is the exact shape wsAX found `region` in, where
 *  193 rules on 163 instruments had been inert long enough for the encodings
 *  underneath them to quietly go wrong, because a rule that never fires is a
 *  rule nothing can prove wrong.
 *
 *  So the vocabulary wins over the snapshot. `check_vocabularies.ts` fails the
 *  build if a spec's frozen order disagrees with the live one, rather than
 *  letting the two coexist. */
function bandOrderFor(field: string, frozen?: readonly string[]): readonly string[] {
  return BAND_ORDERS[field] ?? frozen ?? [];
}

/**
 * WHEN a frozen band order can still change how a rule evaluates — which is the
 * only thing about it worth failing a build over.
 *
 * `bandOrderFor` above already decided this and the answer is derived from it
 * rather than restated, so the guard and the evaluator cannot drift. There are
 * exactly two dangerous states and one harmless one:
 *
 *   "load-bearing"  the vocabulary has NO order for this field, so the frozen
 *                   snapshot IS the order the rule is judged on, and nothing
 *                   maintains it. This is `region`'s shape: inert or wrong, and
 *                   no way to tell which.
 *   "contradicts"   the vocabulary HAS an order and the snapshot disagrees with
 *                   it. The live order wins, so the rule is now judged on a
 *                   scale its author did not write it against and its bound may
 *                   have moved meaning underneath it. This is `lt500k`'s shape,
 *                   where rebanding silently tightened a rule twentyfold.
 *   null            the vocabulary has an order and the snapshot agrees with it.
 *                   Dead bytes. `bandOrderFor` never reads them, and deleting
 *                   them changes no founder's answer.
 *
 * ── Why this is not "no spec may carry an order" ──────────────────────────
 * That is what `check_gate_field_reach` asserted until 2026-08-09, and it was
 * red on 222 comparators — every one of them on a field WITH a live order and
 * byte-identical to it, i.e. provably unread and provably correct. The remedy
 * it printed, `reband_ticket_gates.py`, filters to `field = 'ticketBand'` and
 * could never have cleared a single one of them; a check whose stated fix
 * cannot make it pass is a check that gets deleted by the next person to see it
 * red. And the property it was reaching for had already been TRUE for months:
 * the danger was real when the snapshot was the only order there was, and it
 * stopped being real the day `bandOrderFor` learned to prefer the vocabulary.
 *
 * Nothing that could mis-evaluate a founder's answer stops failing here. Two
 * states that could and were being conflated with the harmless one now fail
 * separately, with the reasons that tell them apart. Note in particular that
 * comparator.ts's own docstring claimed `check_vocabularies.ts` fails the build
 * on a disagreeing snapshot: it does not, and never has — that claim is why
 * "contradicts" was believed to be covered.
 */
export type FrozenOrderRisk = "load-bearing" | "contradicts";

export function frozenOrderRisk(spec: {
  op?: string; field?: string; order?: unknown;
}): FrozenOrderRisk | null {
  if (spec.op !== "band_max" && spec.op !== "band_min") return null;
  const frozen = spec.order;
  if (!Array.isArray(frozen)) return null;
  const live = BAND_ORDERS[spec.field ?? ""];
  if (!live) return "load-bearing";
  return live.length === frozen.length
    && live.every((b, i) => b === frozen[i]) ? null : "contradicts";
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
      const p = comparePosition(
        bandOrderFor(spec.field, spec.order), answer, spec.maxAllowed);
      return p ? p.a <= p.b : null;
    }
    case "band_min": {
      const p = comparePosition(
        bandOrderFor(spec.field, spec.order), answer, spec.minAllowed);
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
