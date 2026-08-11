// WHEN the founder told us something, and what that licenses us to do with it.
//
// ── The owner's binding decision ──────────────────────────────────────────
//   SECOND-SCREEN ANSWERS INFORM THE RANKER AND NEVER REMOVE A FUND.
//
// The follow-up screen exists to make the brief sharper. It was making it
// SMALLER: an answer given there could fail an encoded filter, `assessInstrument`
// would return `blocked`, and `accessiblePool` dropped the row before the prompt
// was ever built. So the founder never saw the fund AND never saw the answer
// that killed it -- the one shape SELECT-4 rules out in as many words: "A doubt
// is not a rejection... a fund set aside on a doubt is a fund the founder never
// sees and never learns exists."
//
// A screen-one answer keeps full force. That asymmetry is the whole point and
// it is not squeamishness about our own gates: the first screen asks what is
// needed to build a shortlist at all -- where you are, what you build, how big
// you are -- and a fund that excludes a German company is not a fund a German
// company should read about. The follow-up round is different in kind. It is
// chosen at runtime from whichever gates happen to be encoded on whichever rows
// happen to have made this founder's pool, so what it can ask about is a fact
// about OUR ENCODING COVERAGE, not about the founder. Letting that decide
// publication means the funds we have documented best are the funds we are most
// able to hide.
//
// ── What softening is, and what it is not ────────────────────────────────
// The blockers SURVIVE. Nothing is hidden, nothing is softened in words: the
// row still carries its verbatim requirement and still renders the obstacle.
// What changes is that a stated obstacle is a thing the founder reads, rather
// than a deletion they cannot see. `blocked` is the one status that never
// reaches the founder; every other status does.
//
// ── PROVENANCE IS DERIVED SERVER-SIDE. NEVER ACCEPT A LIST ────────────────
// The request carries two ANSWER OBJECTS -- `eligibility` (merged) and
// `eligibilityBeforeRound` -- and the server takes the difference itself. It
// must never accept a `lateFields` list from a client, and this module cannot
// be handed one: `lateAnsweredFields` only ever returns fields it computed. A
// client that could name the late fields could mark every field late and switch
// the verdict engine off for its own request, which is a worse defect than the
// one this fixes.
//
// The difference is then INTERSECTED with `askable` -- the fields this
// founder's own shortlist would really have generated a question about,
// re-derived on the server from `openFieldsForShortlist`. Without that a
// request could simply omit `sector` from `eligibilityBeforeRound` and buy the
// same immunity by another route. `openFieldsForShortlist` skips
// FIRST_PAGE_FIELDS, so country and sector can never be late however the two
// objects are shaped, and `check_late_fields_are_askable.ts` pins that.
//
// ── A leaf ────────────────────────────────────────────────────────────────
// `verdict.ts` for the assessment shape and `types.ts` for the one declaration
// of the intake's own vocabulary -- both of which the client bundle already
// carries. No corpus, no filesystem, no `pg`. The corpus-reading half (WHICH
// fields this founder's shortlist would have asked about) is computed by the
// caller and passed in, which is also what makes both halves testable without a
// database.
import type { InstrumentAssessment } from "./verdict";
import { FIELD_ENUM_HINTS, type EligibilityAnswers } from "./types";

/** The same emptiness test the question builder uses: `undefined`, `null`, an
 *  empty string, an empty array and the literal "unsure" are all SILENCE. A
 *  founder who ticked "not sure" has not answered, and treating that as an
 *  answer is how "unsure" came to look like a fact about the company. */
export function isAnswered(
  answers: EligibilityAnswers | undefined,
  field: string,
): boolean {
  if (!answers) return false;
  const v = (answers as Record<string, unknown>)[field];
  if (v === undefined || v === null || v === "" || v === "unsure") return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/**
 * The askable set, closed over the fields one question ALSO answers.
 *
 * `openFieldsForShortlist` deliberately refuses to offer a field whose fact is
 * already an option on another field's question -- `coveredBy` in
 * FIELD_ENUM_HINTS, and `lossesOverHalfCapital` under `exclusionFlags` is the
 * live case. That refusal is right for the SCREEN (a founder should not be
 * asked about accumulated losses twice) and wrong for PROVENANCE: the founder
 * did answer it, on the follow-up screen, inside the exclusions question, and
 * `sanitizeEligibility` derives the field from that answer. Without this
 * closure the derived answer is the one thing on that screen that can still
 * remove a fund, which is the decision inverted by an implementation detail.
 *
 * Derived from the hint table, so a field that gains a `coveredBy` tomorrow is
 * covered with no edit here.
 */
export function withCoveredFields(open: Iterable<string>): Set<string> {
  const out = new Set(open);
  // One pass is not enough if a covered field is itself a cover; iterate to a
  // fixed point rather than assuming the table is only ever one deep.
  for (;;) {
    let grew = false;
    for (const [field, hint] of Object.entries(FIELD_ENUM_HINTS)) {
      if (!hint.coveredBy || out.has(field)) continue;
      if (!out.has(hint.coveredBy)) continue;
      out.add(field);
      grew = true;
    }
    if (!grew) return out;
  }
}

/**
 * Fields the founder FIRST answered on the follow-up screen.
 *
 * @param before   the answers as they stood when the follow-up round was built.
 *                 ABSENT MEANS NOTHING IS LATE, not "everything is". A caller
 *                 that does not run the two-screen funnel -- every harness,
 *                 every recorded replay, and any client that has not been
 *                 taught to send it -- gets the behaviour that existed before
 *                 this module, and a request that omits the field cannot buy
 *                 immunity by omission.
 * @param after    the merged answers the memo is written from
 * @param askable  fields this founder's own shortlist would have generated a
 *                 question about, re-derived server-side. Required, and
 *                 required to be non-optional: an implementation that treated
 *                 a missing `askable` as "everything" would hand a crafted
 *                 request the whole intake.
 */
export function lateAnsweredFields(
  before: EligibilityAnswers | undefined,
  after: EligibilityAnswers | undefined,
  askable: ReadonlySet<string>,
): Set<string> {
  const late = new Set<string>();
  if (!after || !before) return late;
  for (const field of Object.keys(after)) {
    if (!askable.has(field)) continue;
    if (isAnswered(before, field)) continue;
    if (!isAnswered(after, field)) continue;
    late.add(field);
  }
  return late;
}

/**
 * An assessment whose blockers ALL cite fields the founder first answered on
 * the follow-up screen may not carry `status: "blocked"`.
 *
 * It becomes `one_blocker` -- a stated obstacle, which is a row the founder
 * reads with the thing in the way named on it. The blockers array is returned
 * untouched, so nothing downstream loses the requirement text, the field or the
 * citation.
 *
 * A blocker citing a screen-one field keeps FULL FORCE, and it only takes one:
 * a row blocked by `sector` and by a late `nonEuControl` is still blocked,
 * because the sector rule alone would have closed it before the follow-up
 * screen existed.
 */
export function softenLateBlockers(
  a: InstrumentAssessment,
  lateFields: ReadonlySet<string>,
): InstrumentAssessment {
  if (a.status !== "blocked") return a;
  if (!a.blockers.length) return a;
  if (!lateFields.size) return a;
  if (!a.blockers.every((b) => lateFields.has(b.field))) return a;
  return { ...a, status: "one_blocker" };
}

/** `softenLateBlockers` over a whole assessment map. Returns the SAME map when
 *  there is nothing to soften, so the shipped path -- a founder who answered no
 *  follow-up question, and every request made before this existed -- allocates
 *  nothing and is byte-identical to the one that ran before. */
export function softenAll(
  assessments: Map<string, InstrumentAssessment>,
  lateFields: ReadonlySet<string> | undefined,
): Map<string, InstrumentAssessment> {
  if (!lateFields || !lateFields.size) return assessments;
  const out = new Map<string, InstrumentAssessment>();
  for (const [id, a] of assessments) out.set(id, softenLateBlockers(a, lateFields));
  return out;
}
