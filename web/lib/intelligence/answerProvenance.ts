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
// same immunity by another route.
//
// ── AND FIRST_PAGE_FIELDS IS SUBTRACTED HERE, NOT INFERRED FROM A CALLEE ───
// This module was written believing the intersection alone was enough:
// "openFieldsForShortlist skips FIRST_PAGE_FIELDS, so country and sector can
// never be late". IT DOES NOT. The gate-driven loop skips them; the region
// block underneath it does not go through that loop at all, and `region` is a
// first-page field. Measured on the committed snapshot, `region` is in the
// open set for EVERY founder country tried -- twelve of twelve -- and it
// carries 181 encoded official region filters on 155 leaves, which types.ts
// calls the most decisive question the intake has. A request omitting `region`
// from `eligibilityBeforeRound` would have disarmed all of them.
//
// The subtraction therefore happens HERE, where the claim is made. A safety
// property that holds because another module currently behaves a certain way
// is the "keep in sync" comment this repo has paid for repeatedly: it was
// false the day it was written and nothing was watching. `lateAnsweredFields`
// now cannot name a first-page field whatever `askable` contains, and the
// tests assert it against the REAL open set rather than a hand-built one.
//
// ── A leaf ────────────────────────────────────────────────────────────────
// `verdict.ts` for the assessment shape and `types.ts` for the one declaration
// of the intake's own vocabulary -- both of which the client bundle already
// carries. No corpus, no filesystem, no `pg`. The corpus-reading half (WHICH
// fields this founder's shortlist would have asked about) is computed by the
// caller and passed in, which is also what makes both halves testable without a
// database.
import type { InstrumentAssessment } from "./verdict";
import { FIELD_ENUM_HINTS, FIRST_PAGE_FIELDS, type EligibilityAnswers } from "./types";

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
 *                 request the whole intake. FIRST_PAGE_FIELDS are subtracted
 *                 from it HERE rather than trusted to be absent -- see the
 *                 header, and `region`.
 */
export function lateAnsweredFields(
  before: EligibilityAnswers | undefined,
  after: EligibilityAnswers | undefined,
  askable: ReadonlySet<string>,
): Set<string> {
  const late = new Set<string>();
  if (!after || !before) return late;
  for (const field of Object.keys(after)) {
    // A screen-one answer keeps full force, and the ONE place that is enforced
    // is this line. Everything else about the follow-up round is a question of
    // which gates happen to be encoded; this is a question of what the founder
    // was asked before any of that was consulted.
    if (FIRST_PAGE_FIELDS.has(field)) continue;
    if (!askable.has(field)) continue;
    if (isAnswered(before, field)) continue;
    if (!isAnswered(after, field)) continue;
    late.add(field);
  }
  return late;
}

/**
 * The answers as they stood before the follow-up screen, RECONSTRUCTED from the
 * merged set by dropping the late fields.
 *
 * Not the client's `eligibilityBeforeRound`: that object is only ever used to
 * work out WHICH fields are late, through `lateAnsweredFields`, which
 * intersects with the askable set and subtracts FIRST_PAGE_FIELDS. Everything
 * else in it is discarded. So a request cannot reach the assessment engine by
 * shaping the earlier object -- the most it can do is name a late field, and
 * the two filters above decide whether that name is honoured.
 */
export function answersWithoutLateFields(
  after: EligibilityAnswers | undefined,
  lateFields: ReadonlySet<string>,
): EligibilityAnswers | undefined {
  if (!after || !lateFields.size) return after;
  const out: Record<string, unknown> = { ...after };
  for (const f of lateFields) delete out[f];
  return out as EligibilityAnswers;
}

/**
 * A FOLLOW-UP ANSWER MAY NOT PUT A FUND BEHIND A DOOR THAT WAS NOT ALREADY SHUT.
 *
 * @param a      the assessment on the merged answers -- every blocker, every
 *               gate we could evaluate, the truth as it now stands
 * @param prior  the assessment on the same instrument with the late answers
 *               removed: what the founder's pool looked like at the moment we
 *               chose to ask them a question
 *
 * If `prior` was not `blocked`, `a` may not be. It becomes `one_blocker` -- a
 * stated obstacle, which is a row the founder reads with the thing in the way
 * named on it. The blockers array is returned UNTOUCHED, so nothing downstream
 * loses the requirement text, the field or the citation.
 *
 * ── Why the trigger is the prior VERDICT and not the blockers' fields ──────
 * This was written as "every blocker cites a late field", which sounds like the
 * same rule and is measurably weaker. The removals in the field are not caused
 * by a late blocker STANDING ALONE; they are caused by a late blocker being
 * ADDED to one that was already there, because two curable blockers are
 * `blocked` where one is `one_blocker`. Over the twelve archetypes x 696
 * admissible answers, the blockers-all-late rule left 78 funds still deleted at
 * `accessiblePool` -- `innovation_fund_battery` and `innovation_fund_msp`
 * vanished from a robotics founder who answered `exclusionFlags`, with
 * `exclusionFlags` correctly named as late.
 *
 * Asking the prior verdict is not a stronger heuristic, it is the question
 * itself: "would this founder have seen this fund if we had never asked?" It
 * needs no reconstruction of the status ladder -- `assessInstrument` computes
 * it -- so there is no second copy of the open/one_blocker/blocked rule to
 * drift, which is what a re-derivation from `a.blockers` would have been.
 *
 * ── What is NOT softened, and this is deliberate ───────────────────────────
 * A late answer may still move a fund from `open` to `one_blocker`. That is a
 * DEMOTION inside the band sort and it can cost a row its seat under the
 * writer cap -- but it is also the entire value of asking, and the row still
 * carries the fund's own sentence about what is in the way. The line this draws
 * is the owner's: the answer INFORMS the ranking, and it does not REMOVE. A
 * rule that also froze the band would mean the follow-up screen changed nothing
 * a founder sees, which is the same product as not asking.
 */
export function softenLateBlockers(
  a: InstrumentAssessment,
  prior: InstrumentAssessment | undefined,
): InstrumentAssessment {
  if (a.status !== "blocked") return a;
  if (!prior || prior.status === "blocked") return a;
  return { ...a, status: "one_blocker" };
}

/**
 * `softenLateBlockers` over a whole assessment map.
 *
 * Returns the SAME map when nothing is late, so the shipped path -- a founder
 * who answered no follow-up question, and every request made before this
 * existed -- allocates nothing and is byte-identical to the one that ran
 * before. `assessAll` is injected rather than imported so this module stays a
 * leaf that the client bundle can carry: `verdict.ts`'s own `assessAll` reads
 * the corpus, and `softenLateBlockers` is the part panel.tsx needs.
 */
export function softenAll(
  assessments: Map<string, InstrumentAssessment>,
  lateFields: ReadonlySet<string> | undefined,
  priorAssessments: () => Map<string, InstrumentAssessment>,
): Map<string, InstrumentAssessment> {
  if (!lateFields || !lateFields.size) return assessments;
  const prior = priorAssessments();
  const out = new Map<string, InstrumentAssessment>();
  for (const [id, a] of assessments) out.set(id, softenLateBlockers(a, prior.get(id)));
  return out;
}
