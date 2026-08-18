/**
 * PROVE THE GUARD CAN FAIL, ON EVERY CLAUSE, BEFORE IT IS TRUSTED TO SAY
 * ANYTHING IS FINE.
 *
 * A guard whose own detector is broken is worse than no guard, because it is
 * green — and this one exists precisely because a green nobody reads is what
 * let seven checks stay red for a week. So it runs the judgement over synthetic
 * records, one per failure mode, and refuses to judge the real tree if any of
 * them come out wrong. Same arrangement as `selfTest()` in
 * `check_published_figures.ts` and `check_rendered_numbers.ts`.
 *
 * Every case below is a way the mechanism could quietly stop working. The three
 * that matter most are the last three: they are the ways an acceptance becomes
 * a mute button.
 */
import { judgeSuite, MAX_HELD_DAYS, type TierDecl } from "./suiteStatus";
import type { Accepted } from "./acceptance";

const DAY = 86_400_000;
const NOW = Date.parse("2026-08-18T12:00:00Z");
const iso = (d: number) => new Date(NOW - d * DAY).toISOString();
const date = (d: number) => new Date(NOW + d * DAY).toISOString().slice(0, 10);

const SUITE = ["alpha", "beta"];
const obs = (code: number, ageDays: number, summary: string) =>
  ({ label: "", argv: "npx tsx x.ts", code, summary, at: iso(ageDays), ms: 1 });

function rec(rows: Record<string, ReturnType<typeof obs>>) {
  return { suite: SUITE, observations: rows };
}

const GREEN = rec({ alpha: obs(0, 1, "ok"), beta: obs(0, 1, "ok") });
const RED = rec({ alpha: obs(1, 1, "FAIL — 64 inert comparators"), beta: obs(0, 1, "ok") });

/** A well-formed acceptance of alpha's failure. Every bad case below is this
 *  with exactly one thing wrong, so each case tests one clause and not five. */
const GOOD: Accepted = {
  class: "defect",
  owner: "the encoder",
  since: date(-2),
  review: date(+5),
  failure: "inert comparators",
  reason: "the encoder writes them; queued.",
};
const with_ = (o: Partial<Accepted>): Record<string, Accepted> =>
  ({ alpha: { ...GOOD, ...o } as Accepted });

/** Both checks tiered, both founder-facing, both with a sentence. */
const TIERS: Record<string, TierDecl> = {
  alpha: { tier: "founder", protects: "a founder is handed a fund that is shut" },
  beta: { tier: "founder", protects: "a founder is handed no table at all" },
};

const CASES: [string, () => number][] = [
  // ── The tier, which is the question a new check must answer ───────────
  ["an untiered check fails — nothing said who is hurt when it breaks",
   () => 1 - Math.min(1, judgeSuite(
     SUITE, GREEN, {}, NOW, { alpha: TIERS.alpha }).problems.length)],

  ["a tier with no `protects` sentence fails",
   () => 1 - Math.min(1, judgeSuite(
     SUITE, GREEN, {}, NOW,
     { ...TIERS, alpha: { tier: "founder", protects: "  " } }).problems.length)],

  ["a REPORT-tier red is reported and fails nothing",
   () => judgeSuite(SUITE, RED, {}, NOW,
     { ...TIERS, alpha: { tier: "report", protects: "an internal ratchet" } }).problems.length
       + (judgeSuite(SUITE, RED, {}, NOW,
         { ...TIERS, alpha: { tier: "report", protects: "an internal ratchet" } })
         .reported.length === 1 ? 0 : 1)],

  ["a FOUNDER-tier red still fails, tier or no tier",
   () => 1 - Math.min(1, judgeSuite(SUITE, RED, {}, NOW, TIERS).problems.length)],

  // The latch. A reflexive row is written by the command that reads it, so
  // judging it makes a failure self-sustaining: red row -> guard fails -> the
  // command that hosts the guard fails -> red row. Observed once, on the run
  // after this mechanism was built.
  ["an acceptance over a REPORT-tier check fails — it can never be read",
   () => 1 - Math.min(1, judgeSuite(
     SUITE, RED, with_({}), NOW,
     { ...TIERS, alpha: { tier: "report", protects: "an internal ratchet" } }).problems.length)],

  ["a REFLEXIVE red is reported and does not latch",
   () => {
     const t = { ...TIERS, alpha: { ...TIERS.alpha, reflexive: true } };
     const j = judgeSuite(SUITE, RED, {}, NOW, t);
     return j.problems.length + (j.reported.length === 1 ? 0 : 1);
   }],

  ["a REFLEXIVE row is still judged STALE — reflexive is not exempt",
   () => 1 - Math.min(1, judgeSuite(
     SUITE, rec({ alpha: obs(0, 99, "ok"), beta: obs(0, 1, "ok") }), {}, NOW,
     { ...TIERS, alpha: { ...TIERS.alpha, reflexive: true } }).problems.length)],

  ["a clean green tree passes",
   () => judgeSuite(SUITE, GREEN, {}, NOW, TIERS).problems.length],

  ["a red with no acceptance fails",
   () => 1 - Math.min(1, judgeSuite(SUITE, RED, {}, NOW, TIERS).problems.length)],

  ["a red with a good acceptance is HELD, not a problem",
   () => judgeSuite(SUITE, RED, with_({}), NOW, TIERS).problems.length
       + (judgeSuite(SUITE, RED, with_({}), NOW, TIERS).held.length === 1 ? 0 : 1)],

  ["no record at all fails",
   () => 1 - Math.min(1, judgeSuite(SUITE, null, {}, NOW, TIERS).problems.length)],

  ["a check the record never saw fails",
   () => 1 - Math.min(1, judgeSuite(SUITE, rec({ alpha: obs(0, 1, "ok") }), {}, NOW, TIERS).problems.length)],

  ["an observation past the age cap fails, green though it is",
   () => 1 - Math.min(1, judgeSuite(
     SUITE, rec({ alpha: obs(0, 99, "ok"), beta: obs(0, 1, "ok") }), {}, NOW, TIERS).problems.length)],

  ["an acceptance over a GREEN check fails — it pre-authorises the next regression",
   () => 1 - Math.min(1, judgeSuite(SUITE, GREEN, with_({}), NOW, TIERS).problems.length)],

  ["an acceptance naming a check the suite does not run fails",
   () => 1 - Math.min(1, judgeSuite(
     SUITE, GREEN, { gamma: GOOD } as Record<string, Accepted>, NOW, TIERS).problems.length)],

  // ── The three ways a hold becomes a mute button ────────────────────────
  ["an EXPIRED acceptance stops applying",
   () => 1 - Math.min(1, judgeSuite(SUITE, RED, with_({ review: date(-1) }), NOW, TIERS).problems.length)],

  ["an acceptance bound to a DIFFERENT failure stops applying",
   () => 1 - Math.min(1, judgeSuite(
     SUITE, RED, with_({ failure: "something else entirely" }), NOW, TIERS).problems.length)],

  [`a hold longer than ${MAX_HELD_DAYS} days from the day it went red is refused`,
   () => 1 - Math.min(1, judgeSuite(
     SUITE, RED, with_({ since: date(-1), review: date(MAX_HELD_DAYS + 5) }), NOW, TIERS).problems.length)],

  ["an acceptance with no owner does not apply",
   () => 1 - Math.min(1, judgeSuite(SUITE, RED, with_({ owner: "" }), NOW, TIERS).problems.length)],

  ["an acceptance with no class does not apply — the three take opposite work",
   () => 1 - Math.min(1, judgeSuite(
     SUITE, RED, with_({ class: undefined }), NOW, TIERS).problems.length)],
];

/** Throws on the first wrong answer. Callers run it BEFORE judging the tree. */
export function selfTest(): void {
  const wrong = CASES.filter(([, f]) => f() !== 0).map(([label]) => label);
  if (wrong.length) {
    throw new Error(
      "check_red_debt SELF-TEST FAILED, so it is not fit to judge anything:\n  "
      + wrong.join("\n  "));
  }
}

export const SELF_TEST_CASES = CASES.map(([label]) => label);
