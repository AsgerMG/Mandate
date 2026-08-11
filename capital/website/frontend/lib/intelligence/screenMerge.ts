// ONE SCREEN, TWO AUTHORS, ONE QUESTION PER INTAKE FIELD.
//
// ── What this replaced ─────────────────────────────────────────────────────
// The intake route wrote the fixed-answer half of the screen like this:
//
//     questions: rankerQuestions.length ? rankerQuestions : (screen?.questions ?? [])
//
// With `RANKER_ASKS=on`, ONE question from the stage that picks discarded up to
// six from the planner. Those are not decoration: their answers land in
// `EligibilityAnswers`, and the arithmetic scorers and the encoded gates read
// them. Replacing therefore REMOVED AN ANSWER SURFACE from the founder, which
// is what the owner's inform-never-remove decision forbids — arriving through
// the one door that decision was not pointed at, because nothing about it looks
// like dropping a fund.
//
// It also threw away work already paid for. Both stages run in one
// `Promise.all`, so the planner's call is billed whether its output is used or
// not.
//
// ── Why this is a module and not four lines in the route ───────────────────
// A route file cannot export a helper — Next.js rejects exports it does not
// recognise — so a merge written inline is a merge that can never be handed two
// questions on one field by a test. That is not a small thing here: the merge
// IS the enforcement of Q-16, and the two stages that feed it cannot see each
// other by design. It is a leaf: it imports one type and nothing else, so
// nothing about testing it requires a database, a key or a route.
import type { GroundedQuestion } from "./types";

/**
 * The fixed-answer half of one screen, from every stage that writes into it.
 *
 * RANKER FIRST, and that is the ordering claim rather than a convenience: the
 * stage that picks chose its questions by simulating every admissible answer
 * against the candidates actually in front of THIS founder, where the planner
 * chose its own by a field's reach across the shortlist. When the budget binds,
 * the more specific claim keeps the slot.
 *
 * DEDUPED ON `field`, because `field` is the storage key — the panel writes the
 * answer to `elig[q.field]`. Two questions on one field are two answers
 * overwriting each other, the founder answers twice, and which answer survives
 * is decided by the order of a loop (Q-16). First wins, so a ranker question
 * suppresses the planner's on the same field rather than the other way round,
 * which is the only shape in which "ranker first" means anything.
 *
 * A question with no `field` is dropped rather than kept: the field is where
 * the answer goes, so a question without one is a question whose answer has
 * nowhere to land.
 *
 * @param cap the screen's own budget for this half. Applied last, so the cut
 *            falls on the least specific questions rather than on whichever
 *            stage happened to return more.
 */
export function mergeGenericQuestions(
  ranker: GroundedQuestion[],
  planner: GroundedQuestion[],
  cap: number,
): GroundedQuestion[] {
  const byField = new Map<string, GroundedQuestion>();
  for (const q of [...ranker, ...planner]) {
    if (!q.field || byField.has(q.field)) continue;
    byField.set(q.field, q);
  }
  return [...byField.values()].slice(0, cap);
}
