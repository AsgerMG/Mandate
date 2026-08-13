// CAN PRODUCTION PUT A VALUE IN THIS FIELD FOR A REAL FOUNDER, TODAY?
//
// ── The defect this exists to remove ───────────────────────────────────────
// `FIELD_REACH` already knows the answer and nothing asked it. On 2026-08-12,
// 215 cited, STRUCTURAL `organisationType` filter gates were encoded, and the
// same night the recall harness lost 4.0 points of accessible-pool recall. The
// two facts are one fact: the harness answered `organisationType` for every
// founder whose registered name carries a legal-form designator, while the
// control that collects it renders only when its arm is on — and the arm is
// off. The exclusions were real gates correctly evaluated against an answer NO
// REAL FOUNDER CAN GIVE, so the points charged to them were an artefact of the
// test, and every stage below that field inherited the error.
//
// The harness was not lying about the field. `INTAKE_SOURCE` declared it
// `derived`, with a sound leak argument that is still sound: the input is the
// company's own name string, and no award can reach it. LEAK-FREENESS AND
// PRODUCTION REACH ARE TWO INDEPENDENT QUESTIONS, and conflating them is what
// made this invisible — the taxonomy answered "where would this answer come
// from" carefully, and nobody asked "does production ever have one".
//
// ── THE PROPERTY, with a test for a field nobody has added yet ─────────────
//
//     A replayed founder may carry a value for an intake field only if
//     production can put a value in that field for a real founder.
//
//   TEST for an unseen field F. Read `FIELD_REACH[F]`, which every intake
//   field must carry because the Record is keyed on `keyof EligibilityAnswers`:
//
//     (1) IS THERE A PATH?  A control on a screen, a question the adaptive
//         round may ask, a server-side derivation, or a constant the product
//         pins. If there is none — `unreachable` — nothing production does
//         will ever put a value here, so a harness that does is inventing an
//         applicant. That is a coding mistake, not a configuration, and it is
//         refused rather than suppressed.
//
//     (2) IS THE PATH SWITCHED ON?  A `staged` field is fully wired and held
//         behind a default-off arm; while that arm is off the control is not
//         rendered and the field is never populated. The answer is legitimate
//         and the timing is wrong, so it is suppressed and counted, and it
//         flows the moment the arm goes on with no edit anywhere.
//
//   A `staged` field with no `armEnv` FAILS CLOSED: an exemption with no
//   expiry date is how a guard rots, and `check_answer_reach` already refuses
//   the same declaration for the same reason.
//
// Nothing here names a field, a fund, a country or a sector. The rule is read
// off the production reach table, so a field added next month is covered on
// the next compile and a field whose arm flips is covered on the next run.
//
// Client-safe by construction: one pure function over one exported Record, no
// fs, no pg, no network.
import { FIELD_ENUM_HINTS, FIELD_REACH } from "./types";
import type { EligibilityAnswers } from "./types";
import { VOCABULARY } from "./vocabulary";

/** Why production leaves a field empty. `null` from the predicate below means
 *  production can populate it and a replay may answer it. */
export type UnpopulatedReason =
  /** No path exists at all. A harness value here is invented, not early. */
  | { why: "unreachable" }
  /** The path exists and is switched off. `armEnv` is the switch. */
  | { why: "staged_off"; armEnv: string }
  /** Declared `staged` with no arm named, so the exemption can never expire.
   *  Refused in the same direction as a missing path: fail closed. */
  | { why: "staged_unnamed" }
  /** The FIELD is asked and this ANSWER is not on the menu. Same defect one
   *  level down: a gate that fires on it fires on something no founder could
   *  have said. */
  | { why: "unofferable_value"; values: string[] };

/** Just the shape a predicate about switches needs. Deliberately NOT
 *  `NodeJS.ProcessEnv`, whose required `NODE_ENV` makes a one-key literal
 *  unassignable — and a rule whose failing case is awkward to write is a rule
 *  that ends up untested. */
export type ArmEnv = Readonly<Record<string, string | undefined>>;

/**
 * The predicate. `null` when production can populate `field`; a reason when it
 * cannot.
 *
 * `env` is a parameter and not a module-load constant on purpose. An arm read
 * once at import cannot be exercised by a test, and a rule whose failing case
 * nobody has seen is a rule nobody can trust.
 */
export function productionCannotPopulate(
  field: keyof EligibilityAnswers,
  env: ArmEnv = process.env,
): UnpopulatedReason | null {
  const reach = FIELD_REACH[field];
  if (!reach) return { why: "unreachable" };
  if (reach.via === "unreachable") return { why: "unreachable" };
  if (reach.via !== "staged") return null;
  if (!reach.armEnv) return { why: "staged_unnamed" };
  return env[reach.armEnv] === "on" ? null : { why: "staged_off", armEnv: reach.armEnv };
}

/**
 * THE SAME RULE ONE LEVEL DOWN: is this ANSWER on the menu?
 *
 * A field production asks can still be handed a value its control cannot
 * produce, and the effect is identical — an encoded gate fires on something no
 * founder could have said, and the exclusion is charged to the founder. The
 * case that motivated this: 10 of 715 replayed `region` answers were codes
 * `regionOptions` never offers for that founder's country (a bare country code
 * where the control lists regions, and NUTS-1 codes where it lists NUTS-2).
 *
 * The menu is production's own, in production's order of authority:
 *   1. `optionsFor(answers)` where the options depend on earlier answers —
 *      region is the one field where a fixed list is wrong;
 *   2. the hint's fixed `options`, which is what the adaptive round offers;
 *   3. the vocabulary contract, which is what `sanitizeEligibility` accepts.
 *
 * A field with NO enumerable menu — free text, country lists, numbers —
 * returns `[]`, meaning "cannot judge". That is deliberately not the same as
 * "fine": this predicate makes a claim only where production can be asked what
 * it would have offered.
 */
export function unofferableValues(
  field: keyof EligibilityAnswers,
  value: unknown,
  answers: EligibilityAnswers,
): string[] {
  const hint = FIELD_ENUM_HINTS[field as string];
  const menu = hint?.optionsFor?.(answers).map((o) => o.value)
    ?? (hint?.options.length ? hint.options.map((o) => o.value)
      : VOCABULARY[field as string]?.values ?? []);
  if (!menu.length) return [];
  return (Array.isArray(value) ? value : [value])
    .filter((v): v is string => typeof v === "string")
    .filter((v) => !menu.includes(v));
}

/** One line a run can print about a field it had to hold back. */
export function unpopulatedNote(field: string, r: UnpopulatedReason): string {
  if (r.why === "unofferable_value") {
    return `${field} was answered ${r.values.map((v) => `"${v}"`).join(", ")}, which the `
      + "control never offers for this founder — production cannot produce that answer";
  }
  if (r.why === "staged_off") {
    return `${field} is STAGED behind ${r.armEnv}, which is not "on" — the control is `
      + "not rendered and production never populates it";
  }
  if (r.why === "staged_unnamed") {
    return `${field} is declared \`staged\` with no \`armEnv\`, an exemption that cannot `
      + "expire — treated as never populated until it names its arm";
  }
  return `${field} is declared \`unreachable\` — no control, no adaptive hint, no derivation`;
}

/** The fields production leaves empty right now, for a run to disclose. Derived
 *  from the same predicate, so the list and the rule cannot disagree. */
export function unpopulatedFields(
  env: ArmEnv = process.env,
): { field: keyof EligibilityAnswers; reason: UnpopulatedReason }[] {
  return (Object.keys(FIELD_REACH) as (keyof EligibilityAnswers)[])
    .sort()
    .map((field) => ({ field, reason: productionCannotPopulate(field, env) }))
    .filter((x): x is { field: keyof EligibilityAnswers; reason: UnpopulatedReason } =>
      x.reason !== null);
}
