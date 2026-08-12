// The vocabulary of a next step that is a thing to WAIT FOR rather than DO.
//
// ── IT REPORTS. IT DOES NOT SELECT. (wsGK, 2026-08-13) ────────────────────
// Two readers, both of which write a line and neither of which moves a fund:
// `briefChecks` raises FUND-4 against a published row whose next step reads as
// waiting, and `pipeline` records `WRT-WATCH-ONLY` against it so the count
// lands in every brief's own record. The founder still sees the row, still in
// the rank the model gave it, still carrying the writer's sentence — which is
// the sentence that tells them to wait, in the writer's own words.
//
// The header this replaces said the pipeline "drops these rows" and that "a
// brief never shows a fund that is deprioritised or not relevant". Both were
// already false when they were read: the drop had become a demotion, and a
// demoted row published whenever fewer actionable rows existed than the cap.
// What the demotion actually did is measured in `memoCandidates.ts` above
// `assembleBriefRows` — with eight candidates cut to seven, one match anywhere
// in the table evicted the fund it matched on, whatever rank the model had
// given it.
//
// ── WHY AN ENUMERATION IS TOLERATED HERE AND WOULD NOT BE ANYWHERE ELSE ───
// The pattern is a list of eleven phrasings. That is a register, not a
// property, and a register's defining weakness is the case it does not list:
// "hold until the consortium forms" is the same instruction in words it does
// not hold. It is admissible ONLY because both readers report. A false
// positive costs a line on a scoreboard; a false negative costs a line that is
// not there. Neither costs a founder a fund.
//
// The test for whether it may keep this shape: point at what changes when it
// fires. If the answer names a row's presence, its order, or a gate it must
// pass, this has to be a property with a test for cases nobody has seen before
// it may run at all. If the answer is "a counter", the list is fine.
export const WATCH_ONLY_COPY =
  /\b(monitor|deprioriti[sz]e|informational|watch|wait for|only pursue if|act if|revisit|keep an eye|fall ?back|longer[- ]horizon)\b/i;

/**
 * True when the row's own published copy reads as a thing to wait for.
 *
 * Reads the copy that PUBLISHES, not the writer's raw reply, and reads both
 * fields: the hedge lands in `whyEligible` about as often as in `nextStep`.
 *
 * The `actionableNow` flag this used to take first is gone with the flag
 * itself. `WRT-NOT-WORTH` was deleted in wsDO and no schema has carried the
 * field since, so every call site passed `undefined` into a branch that could
 * not fire — an argument whose only remaining job was to make the signature
 * describe a channel the writer no longer has.
 */
export function isWatchOnly(
  nextStep: string | undefined,
  whyEligible?: string | undefined,
): boolean {
  return WATCH_ONLY_COPY.test(String(nextStep ?? "")) ||
    WATCH_ONLY_COPY.test(String(whyEligible ?? ""));
}
