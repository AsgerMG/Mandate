// The funnel constants, in one leaf module, so a check can read them without
// reaching a database.
//
// ── Why this module exists, and why it imports nothing ─────────────────────
// Four caps stand between the corpus and the published table and they only
// work as a funnel if each is strictly wider than the next:
//
//     VERDICT_POOL -> WRITER_CANDIDATE_CAP -> BRIEF_LIMITS.institutionsMax
//
// Nothing asserted that ordering until `check_contracts.ts` did, and that
// check is HERMETIC by design: no DATABASE_URL, no VOYAGE_KEY, so it runs on
// CI and on a fresh worktree. Importing the constants from `shortlist.ts` and
// `memoCandidates.ts` to compare them dragged the whole corpus layer in behind
// them and `check_env_loader` failed the build for exactly that, correctly —
// a check that silently acquires a credential dependency is a check that
// silently stops running.
//
// The alternative was to retype the numbers in the check, which is the defect
// the check exists to catch. So the constants moved to a module with NO
// imports at all, and their old homes re-export them: every existing caller is
// unchanged, and there is still exactly one definition of each.
//
// `institutionsMax` deliberately stays in `briefChecks.ts` next to the rule
// that enforces it; that module is already hermetic.
//
// ── THERE ARE TWO FUNNELS, AND THAT IS THE OPEN DEFECT (wsDO) ──────────────
// The chain above is the MEMO's. The founder's instant screen runs a second,
// shorter one out of `computeVerdict`: the same `buildInstrumentTableHydrated`
// pool, cut straight to `DISPLAY_CAP = 6`, with no blocked-row drop, no
// display-name collapse and no re-sort. So the two surfaces of one request
// disagree about which funds are in the table, not merely about their order,
// and every recall figure this repo publishes is measured on the short funnel
// while the founder acts on the long one.
//
// The design that merges them into one path with one ranker -- and the prefix
// property that makes the merge checkable ("screen one's six rows are the
// first six of the memo's order") -- is written down in
// project-mgmt/findings/dead_ranker_wsDO.md §4, together with the order of
// operations. Read it before changing any constant in this file: after the
// merge, VERDICT_POOL stops being a second cut and becomes how deep the
// selector is allowed to read.

/** The pool `synthesize()` screens before cutting to the published cap.
 *
 *  Deliberately wider than `DISPLAY_CAP`: funds a founder cannot access are
 *  dropped AFTER assessment, so a pool of six meant a founder blocked on three
 *  of them got a three-row brief while perfectly good candidates at rank seven
 *  were never looked at. Dropping must be able to backfill, not shrink the
 *  table. */
export const VERDICT_POOL = 18;

/** How many candidates the WRITER is shown, ahead of the cut to
 *  `BRIEF_LIMITS.institutionsMax`.
 *
 *  Lowered from 9. The writer must return a note per candidate, and a
 *  candidate it never mentions is dropped silently -- it cannot be published
 *  without model-written copy, and filling that in from a template is what put
 *  three "Verify eligibility directly with the fund" rows in one brief. At 9 it
 *  started omitting: one company came back covering 5 of 9, losing two Horizon
 *  clusters and two Innovation Fund routes with no judgement attached.
 *
 *  ── The headroom this leaves, which the published cap consumes ────────────
 *  This is an UPSTREAM cap and the published row count is the DOWNSTREAM one,
 *  so their difference is the number of candidates the writer may reject
 *  before the table gets short. At 7 candidates and 5 published that was two;
 *  at 7 and 6 it was one; at 8 and 7 it is one again.
 *
 *  ── Why it moved with the row cap this time, having not moved last time ───
 *  Last time it deliberately did not, and that was right: 6 published against
 *  7 shown still left a candidate in hand. 7 published against 7 shown leaves
 *  NONE -- every candidate would have to land, and the writer declines
 *  candidates routinely (`WRT-NO-NOTE`, `WRT-WATCH-ONLY`). That is not a
 *  headroom of one narrowing, it is the funnel ceasing to be a funnel, so
 *  `check_contracts.ts` now reds the build if this cap ever fails to exceed
 *  the published one.
 *
 *  8 is not 9. The omission measured at 9 was one company covering 5 of 9 --
 *  four candidates dropped, the writer effectively re-selecting rather than
 *  writing. 8 is one step from a cap that has never omitted, and it is the
 *  smallest value that keeps the headroom the product shipped with. It is not
 *  a free move and it is the risk this workstream took knowingly; the bench
 *  render at the new caps is the measurement, and a rise in `WRT-NO-NOTE` is
 *  what would send it back to 7 and the row cap back to 6. */
export const WRITER_CANDIDATE_CAP = 8;
