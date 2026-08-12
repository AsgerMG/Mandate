// Does retrieval still find the fund a company actually won?
//
// The suite has 115 tests, 12 archetypes, contract, payload and parity checks,
// and not one of them can see a ranking regression: every row can be well-formed
// and correctly cited while the right fund sits at rank nine. Twice this session
// a change cost double-digit recall and the whole suite stayed green -- a
// per-channel signal in the row sort cost 24 points and was caught only because
// the number was being watched by hand.
//
// So the floors are here, on the TUNE split, alongside everything else that
// fails the build.
//
// Floors sit just under the measured numbers, not at an aspiration. A gate set
// where we wish we were fails on day one, gets ignored, and then protects
// nothing. Raise them when the real number rises.
import { loadEnvLocal, requireCredentials } from "./loadEnv";

// Repo root AND frontend, from the one loader, and then a DECLARED credential
// contract rather than a skip.
//
// This script's own copy of the env preamble read only ./.env.local, so in a
// fresh worktree -- where the file is gitignored and therefore absent, while
// the repo-root one is right there -- it found nothing and took a SKIPPED
// branch that returned 0. The floors are the last line in `npm run check`; a
// green build that had never evaluated them is the failure this whole file
// exists to prevent, happening to the file itself.
//
// Fixing the path alone would only have made that rarer. `requireCredentials`
// is what makes it impossible: without the keys, and without NO_PG to say the
// run is deliberately offline, this ENDS NON-ZERO. There is no longer a state
// in which the floors go unevaluated and the build is green.
loadEnvLocal();
const CREDENTIALS = requireCredentials(
  "check_recall_floor", ["DATABASE_URL", "VOYAGE_KEY"]);

import {
  corpusProvenance, hydrateDbInstruments, loadDbInstruments, publishableInstruments,
  requireLiveCorpus, resetGateHydration,
} from "../lib/intelligence/corpus";
import { accessiblePool } from "../lib/intelligence/memoCandidates";
import { computeVerdict } from "../lib/intelligence/pipeline";
import type { InstrumentRow } from "../lib/intelligence/types";
import { rankerTallyLine, resetRankerTally } from "../lib/intelligence/semantic";
import { founderIntake, founderPolicyFromEnv, IntakeTally } from "./founderIntake";
import { DEFAULT_SEED, sampleRecall } from "./recallSample";
import {
  assertAncestorConvention, assertGradablePopulation, isDescribed, loadRecallSet,
  partitionByOfferable, reattributeMissingAnswers, REGIME_AT_5_NOT_COMPARABLE,
} from "./recallSet";
// ── The skip below is now survivable, and only because of this ─────────────
// Skipping loudly and exiting 0 was still exiting 0: `npm run check` reported a
// green build with the floors never evaluated, and CI -- which has no
// credentials and never will -- has never once run them. Handing GitHub a
// DATABASE_URL would fix that by widening a compromised workflow from "can read
// our code" to "can read and write every award we hold".
//
// So this publishes what it measured, bound to a hash of the code it graded,
// and check_verdicts.ts fails when the ranking code in a checkout is not the
// code the last published floors were measured on. The skip stays legitimate
// where it is legitimate; what it can no longer do is let a ranking change
// merge unmeasured.
import { publishVerdict, startTape } from "./guardVerdict";

const GUARD = "recall_floor";
const tape = startTape();

/** ONE set, and the two populations inside it guarded separately.
 *
 *  This used to guard `__recallSet.json` and `__recallSetPlus.json` together,
 *  because the first cannot name a programme-split child and guarding on it
 *  alone would enshrine that blind spot in CI. That reasoning stands; the two
 *  files do not. Both carried the unrepaired sibling attribution, under which
 *  the answer for 24% of pairs is close to a uniform draw over the delivering
 *  bodies of one notified scheme -- a floor over a random label is a floor over
 *  noise. The active set fixes the labels, adds the children AND carries the
 *  leak-free descriptions, so one file now covers what two did.
 *
 *  The blind-spot protection is kept, and made stricter: the two populations
 *  live inside the one set and are floored SEPARATELY, so a change that buys
 *  programme children with SATR leaves — or the reverse — fails here instead of
 *  netting out to a flat headline. That is the trade bf3056d made explicit, and
 *  it is now measured on one sample rather than inferred across two files.
 *
 *  Floors sit just under the measured numbers, never at an aspiration. A gate
 *  set where we wish we were fails on day one, gets ignored, and protects
 *  nothing. Pool is the one correctness floor rather than a ranking score -- a
 *  fund the writer never sees cannot be advised on at all -- so it is set
 *  hard; EXACT@5 and REGIME@5 sit further below because both carry real
 *  sampling noise, and the per-population figures carry more of it at n<100. */
/*  ── RE-DERIVED against the REPAIRED answer key, 2026-08-07 ───────────────
 *
 *  ██ The pool collapse was the answer key, not the ranker. ██
 *
 *  The block this replaces recorded pool falling 94-96 -> 78 on the identical
 *  pinned sample, called the cause unestablished, and held the floor at 90 with
 *  the build red. Holding it was right. The cause is now established, and it was
 *  not a regression: tonight's corpus work correctly withdrew 86 closed schemes,
 *  and the key still graded retrieval on returning them. 1,032 of 4,796 pairs
 *  (21.5%) named an answer that had become unofferable, which put pool's CEILING
 *  at 78.5%. Pool did not fall TO 78 -- it was CLAMPED at 78. Retrieval was
 *  finding 75/78.5 = 95.5% of everything it was allowed to find, and no ranking
 *  change could have moved it, which is exactly why rebuilding the index with
 *  and without the holdout read 78 both ways.
 *
 *  A second, different staleness was folded in with workstream T: 192 pairs
 *  named one of 16 GB "instruments" that were never funds -- GtR competition
 *  formats mapped into `programme_name`. Those are RE-ATTRIBUTED to the rollup
 *  the award actually belongs to, not excluded, because the award is real and
 *  only the object it was attributed to was invented. Both repairs are reported
 *  on their own line every run; see recallSet.ts for both properties.
 *
 *  Measured on the repaired key, tune split, pinned seed and N, Postgres held,
 *  and the corpus fingerprinted IDENTICAL before and after every run quoted:
 *
 *                          PINNED (what these floors guard)   seed 7   seed 99*
 *      pool                          98                          97      96
 *      EXACT@5                       32                          29      28
 *      REGIME@5                      87                          83      83
 *      REGIME@5 original join        85  (n=151)                 79      76
 *      REGIME@5 traced               90  (n=149)                 89      91
 *
 *      * seed 99 straddled a corpus change and is reported, not calibrated on.
 *
 *  ── How the margins were chosen ───────────────────────────────────────────
 *  SEED and N are pinned, so sampling noise inside the margin is ZERO -- the
 *  same 300 pairs every run. The margin therefore buys exactly one thing: room
 *  for the CORPUS and the INDEX to move. That is not theoretical. Across
 *  tonight's two corpus states, on this same pinned sample, the traced
 *  population moved 98 -> 90 (eight points) and REGIME@5 moved 90 -> 87, while
 *  pool did not move at all. So the margins are not uniform: they are widest
 *  where the measurement has actually been seen to move.
 *
 *  pool     5 under, and 3 under the lowest figure any seed produced. Pool is
 *           the correctness floor -- a fund the writer never sees cannot be
 *           advised on -- and it is also the most stable thing here.
 *  EXACT@5  10 under, the widest. It swings hardest on an index rebuild: this
 *           file recorded 20 on the previous index and measures 32 now.
 *  REGIME@5 7 under, and UNCHANGED at 80. It could have been raised to 82; it
 *           was not, because 83 is the lowest a seed produced and two points is
 *           not a margin.
 *
 *  EVERY floor here is RAISED or unchanged against the block it replaces
 *  (90/15/80, 68/82). Nothing was lowered. The build is green because the
 *  question the set asks became answerable again, not because the bar moved. */
/*  ── RE-DERIVATION, 2026-08-07 18:00 UTC: the answer is NO RAISE ──────────
 *
 *  The block above was calibrated while a load was in flight and
 *  `check_corpus_currency` was red, and a raise to 95 / 25 / 83 was left
 *  outstanding for when both cleared. Both have cleared -- currency green,
 *  snapshot and Postgres agreeing on every liveness verdict, 1,084 instruments
 *  on both sides -- so it was re-derived properly. Three seeds, tune split,
 *  N=300, Postgres asserted, corpus 1,084 and printed on every run,
 *  17:23-17:49 UTC. Every figure below was measured twice, side by side, on
 *  either side of a full regeneration of `semanticCache.generated.json`, and
 *  the two sets are byte-identical on every metric and every stratum:
 *
 *                          PINNED (what these floors guard)   seed 7   seed 99
 *      pool                          98  (293/300)              96      96
 *      EXACT@5                       30  ( 91/300)              31      28
 *      REGIME@5                      87  (262/300)              82      83
 *      REGIME@5 original join        83  (n=151)                76      77
 *      REGIME@5 traced               91  (n=149)                89      89
 *
 *  Against the block above: pool and REGIME@5 UNMOVED on the pinned sample
 *  (98, 87), EXACT@5 DOWN two (32 -> 30), original join DOWN two (85 -> 83),
 *  traced UP one (90 -> 91). Nothing rose. So there is nothing to raise a
 *  floor onto: the margin convention this file has always used, applied to
 *  today's numbers, lands on the numbers that are already here.
 *
 *      pool      5 under pinned = 93, and 3 under the lowest seed (96) = 93.
 *      EXACT@5  10 under pinned = 20, which is BELOW the 22 in force. Held at
 *                22, never lowered -- but note it is now the tightest thing in
 *                this file at 8 points, not the 10 it specifies, because the
 *                pinned measurement fell rather than the floor rising.
 *      REGIME@5  7 under pinned = 80. Unchanged, for the same reason as last
 *                time and more so: the lowest seed is now 82, and 80 is
 *                already only two under it.
 *
 *  ── Why 95 / 25 / 83 is NOT supportable, on the numbers rather than on
 *     caution ────────────────────────────────────────────────────────────────
 *      pool 95     3 under pinned and ONE under the lowest seed. The stated
 *                  margin is 5 and 3.
 *      EXACT@5 25  5 under pinned, half the stated margin, on the metric this
 *                  file itself records swinging 20 -> 32 across a single index
 *                  rebuild -- a twelve-point move against a five-point margin.
 *      REGIME@5 83 ABOVE the lowest seed. It would have FAILED on seed 7 today
 *                  (82). A floor that a legitimate reseed fails is the thing
 *                  the paragraph above was written to prevent.
 *
 *  Nothing is lowered and nothing is raised. A floor that moves to accommodate
 *  a regression is not a floor; a floor that moves onto a measurement that did
 *  not rise is not a floor either, it is a coin flip with a comment. */
/*  ── RE-DERIVED AGAINST DOORS, 2026-08-09 (workstream BS) ─────────────────
 *
 *  ██ ALL THREE NUMBERS BELOW GO DOWN, AND NONE OF THEM IS A LOOSENING. ██
 *  Read this block before quoting one of them as a lowered bar.
 *
 *  `ACTIVE_RECALL_SET` is now `__recallSetDoors.json`. The floors these replace
 *  (93 / 22 / 80) were calibrated against `__recallSetComposed.json`, WHICH NO
 *  LONGER SHIPS. Keeping them would not be strictness, it would be a gate
 *  measured on one exam applied to a different one.
 *
 *  ── What changed about the exam ───────────────────────────────────────────
 *  Measured out of Postgres today, both keys against the same corpus:
 *  Composed names 390 of the 895 funds the product may offer, in 9 countries;
 *  Doors names 611, in 28. The funds it adds are the ones `Split.leaf_for`
 *  could never return — a FAMILY NOBODY SPLIT is the fund, and it has no child
 *  to be returned as. CDTI, Innovate UK, Bpifrance.
 *
 *  ── The two metrics move in OPPOSITE directions, and that is the finding ──
 *  Same corpus, same peer prior, same three seeds, tune split, N=300, live
 *  Postgres asserted, 1,088 instruments printed on every run:
 *
 *                        seed 20260806   seed 7   seed 99
 *      pool     Composed       97           99       97
 *               DOORS          94           95       95
 *      EXACT@5  Composed       20           21       22
 *               DOORS          25           24       25
 *      REGIME@5 Composed       91           92       90
 *               DOORS          76           76       72
 *
 *  EXACT@5 IS THE COMPARABLE METRIC AND IT WENT UP, on every seed, while the
 *  key got harder. Retrieval is BETTER on the 221 funds the old key was blind
 *  to than on the ones it could see. REGIME@5 fell 15-18 points and that fall
 *  is the point, not a regression: a childless family is its own regime, so for
 *  those pairs REGIME@5 and EXACT@5 are the same question and there is no
 *  sibling credit to be had. See `REGIME_AT_5_NOT_COMPARABLE` in recallSet.ts,
 *  and see it in this run's own output — `regime 1 (alone)` reads exact5 ==
 *  regime5 to the case, `regime 51+` reads exact5 14% against regime5 99%.
 *
 *  So a REGIME@5 floor of 80 under Doors would not be a strict version of the
 *  old gate. It would be a gate that fails on arithmetic, every run, forever,
 *  for a reason that has nothing to do with ranking — and a gate that cannot
 *  pass gets muted, which is this file's own stated failure mode.
 *
 *  ── The margins, by the convention this file has always used ──────────────
 *  Unchanged convention, new measurements. Pinned figures first, then the
 *  lowest any of the three seeds produced.
 *
 *  pool 89   5 under pinned (94), and 3 under the lowest seed (94) would give
 *            91; the convention requires BOTH, so the binding one is 89. Pool
 *            is still the one correctness floor — a fund the writer never sees
 *            cannot be advised on — and it is still the most stable thing here,
 *            spanning 94-95 across three seeds.
 *  exact5 15 10 under pinned (25), the widest, unchanged in width and for the
 *            unchanged reason: this metric swings hardest on an index rebuild,
 *            and this file records it moving 20 -> 32 across one. The three
 *            seeds span 24-25, so 15 is 9 under the lowest.
 *  regime5 69 7 under pinned (76), and 3 under the lowest seed (72). Both
 *            constraints the convention states are satisfied at 69, which is
 *            why it is 69 and not 70.
 *
 *  ── Why the old floors are not simply kept as a stricter bar ──────────────
 *  Because two of the three would be FALSE, not strict. `regime5 80` fails on
 *  every seed for the arithmetic reason above. `exact5 22` looks survivable at
 *  24-25 — and it is the floor whose margin this session was asked to
 *  investigate, so it gets its own block below rather than a clause here. */
/*  ── `exact5` after the brief began publishing SIX rows ────────────────────
 *
 *  Not re-derived, and the "5" in the name is not now stale. These floors are
 *  measured on `computeVerdict().instrumentTable` — the INSTANT SCREEN, whose
 *  `DISPLAY_CAP` was 6 before this change and is 6 after it. Nothing this file
 *  reads moved when `BRIEF_LIMITS.institutionsMax` went 5 -> 6, because the
 *  memo's published table is a DIFFERENT ordering over a DIFFERENT pool and
 *  this guard has never touched it (wsCR measured the two side by side: they
 *  agree on the won leaf's rank in 11 of 41 pairs that contain it).
 *
 *  So the honest statement of what `exact5` floors is "the ranker still puts
 *  the won leaf in the screen's first five", which is a claim about the SORT
 *  and not about a promise to a founder. Re-deriving it onto six rows would
 *  widen the window and could only raise the number — a loosening dressed as
 *  an update. The floor stays where it was measured, on the population it was
 *  measured on. What the change does expose is that no floor in this repo
 *  guards the memo's own row order at all; that gap is wsCR's finding to
 *  report, not a number to invent here. */
/*  ── RE-DERIVED AGAINST THE REAL FOUNDER, 2026-08-09 (workstream CQ) ──────
 *
 *  ██ THE EXAM DID NOT GET EASIER. THE CANDIDATE STOPPED BEING FICTIONAL. ██
 *
 *  Every floor above was calibrated on a founder called `"TestCo"` who asked
 *  for grants-or-loans and left 18 of the 23 askable intake fields blank,
 *  because this file inlined eight constants instead of calling the shared
 *  resolver. `scripts/founderIntake.ts` replaces that literal: the founder is
 *  now the real company, with their OWN award history withheld so the tier-1
 *  `usedInField` signal cannot be set by the award being predicted, and
 *  `capitalSought` is withheld rather than pinned to a two-value FILTER.
 *
 *  ── What actually moved, and it is one metric ─────────────────────────────
 *  Three seeds, tune split, N=300, live Postgres, 1,088 instruments, and
 *  `ranker: all N request(s) on EMBEDDING` on every one of the twelve runs
 *  below (`project-mgmt/findings/real_founder_wsCQ/`):
 *
 *                    REAL FOUNDER (what ships)      "TestCo" + pinned filter
 *                  20260806    s7     s99         20260806    s7     s99
 *      pool           97       98      97            94       95      95
 *      EXACT@5        26       23      25            26       24      26
 *      REGIME@5       73       71      72            73       72      72
 *
 *  POOL IS THE ONLY THING THAT MOVED, and it moved because the harness stopped
 *  removing funds. `capitalSought: ["grant","loan"]` runs through
 *  `instrumentServesCapital`, which removes every tax-credit and every equity
 *  instrument BEFORE anything ranks. That was not a preference a founder
 *  stated; it was the test declining funds on its own behalf, and it was
 *  reported to the owner as a corpus gap.
 *
 *  EXACT@5 and REGIME@5 are flat to the seed. That is the finding, not a
 *  disappointment: the real founder is a bigger pool and the same ranking.
 *
 *  ── The margins, by the convention this file has always used ──────────────
 *  pool 92   RAISED from 89. 5 under pinned (97) = 92; 3 under the lowest seed
 *            (97) = 94; the convention requires BOTH, so the binding one is 92.
 *            Pool is still the one correctness floor -- a fund the writer never
 *            sees cannot be advised on -- and it is still the most stable thing
 *            here, spanning 97-98 across three seeds against 94-95 before.
 *  exact5 15 HELD, and nothing was lowered. 10 under pinned (26) would be 16,
 *            but the seed spread widened DOWNWARD (24-26 before, 23-26 now) and
 *            the Doors derivation spaced this floor 9 under its lowest seed;
 *            23 - 9 = 14, which is BELOW the 15 in force. So 15 stands, and it
 *            is now 8 points under the pinned figure rather than the 10 the
 *            convention specifies -- the same note the previous block had to
 *            write, for the same reason: the floor did not rise, the spread
 *            moved under it.
 *  regime5 69 HELD. 7 under pinned (73) = 66 and 3 under the lowest seed (71) =
 *            68, both BELOW the 69 in force, so the convention lands under the
 *            floor and the floor stays. ██ IT IS NOW ONLY 2 UNDER THE LOWEST
 *            SEED, where the convention asks for 3. ██ That is not this
 *            workstream's doing -- the old harness reads 73/72/72 on the same
 *            three seeds, so REGIME@5 is indifferent to the whole change -- it
 *            is the corpus moving under the Doors block's pinned 76. Watch it.
 *
 *  ── Why the pool raise is not a ratchet onto a lucky run ──────────────────
 *  Because the OLD harness also rises on today's corpus (94/95/95 against the
 *  Doors block's 94/95/95 -- unmoved), so the three points are attributable to
 *  the harness change and to nothing else. The A/B is on file: withholding
 *  `capitalSought` alone, with everything else held at the old values, moves
 *  pool 94 -> 97 on the pinned seed and EXACT@5 not at all (26 -> 25).
 *
 *  ── The one number that is NOT a floor and matters more ───────────────────
 *  The oracle cap -- the share of pairs whose won leaf is in the pool at all,
 *  the bound no question can beat -- is 94.0% under the old harness and 96.4%
 *  under the real founder on the same tune draw. wsCK's 91.6% was the holdout
 *  version of the same quantity, measured on the fictional founder. See
 *  `_wsci_autopsy.ts`, which prints it beside the intake disclosure so the cap
 *  and the founder it belongs to can never again be read apart. */
/*  ── RE-MEASURED AGAINST THE DESCRIBED KEY, 2026-08-10 (workstream DH) ────
 *
 *  ██ NOTHING IS RAISED AND NOTHING IS LOWERED, BECAUSE NOTHING MOVED. ██
 *
 *  `ACTIVE_RECALL_SET` is now `__recallSetDescribed.json`: the same 7,095 pairs
 *  as Doors, with 532 of the 5,729 blank ones given a real, leak-free
 *  description recovered from the company's own award prose under a DIFFERENT
 *  regime. Same corpus, same seed, same N, same commit, both runs attested
 *  `ranker: all 294 request(s) on EMBEDDING`, 1,088 instruments on both:
 *
 *                  BEFORE (Doors)   AFTER (Described)
 *      pool              97               97
 *      EXACT@5           27               26
 *      EXACT@6           31               30
 *      REGIME@5          73               72
 *
 *      described   n= 75  exact5 32%   n= 93  exact5 30%
 *      blank       n=225  exact5 26%   n=207  exact5 25%
 *
 *  ██ THE FINDING IS THAT IT DID NOT MOVE. ██ The worry this run existed to
 *  test — that every figure this repo has quoted was measured on a founder who
 *  said nothing, and would collapse or leap once they spoke — is not supported.
 *  Eighteen of the 300 sampled founders acquired a genuine description and the
 *  headline moved one point, in the direction of noise, on a pinned draw.
 *
 *  Read the two sub-populations rather than the headline, because they are the
 *  actual answer. A described founder does score better than a blank one (32
 *  against 26 before, 30 against 25 after) — but the newly described eighteen
 *  scored like the blank ones, which is why the described figure fell as its n
 *  rose. So the description gap is largely SELECTION: the pairs that already
 *  had prose are the pairs whose funds are easiest to retrieve (EU programme
 *  awards, which is where per-award summaries exist at all), not evidence that
 *  prose is worth six points to an arbitrary founder.
 *
 *  What this does NOT license is the reverse claim. 5,197 pairs are still blank
 *  and cannot be described from anything this corpus holds (see recallSet.ts
 *  for the 10.1% ceiling and why relaxing the guard buys nothing), so "the
 *  description is worth little" is measured on 93 described founders, not on a
 *  described key. The honest statement is: the ranker's headline is stable
 *  across this change, and a described-founder headline must be quoted over
 *  `isDescribed()` with its n on screen. Both are now printed every run. */
/*  ── RE-DERIVED AFTER 53 SPANISH CALLS WERE CORRECTLY CLOSED, 2026-08-12 ──
 *
 *  ██ REGIME@5 GOES DOWN 69 -> 58 AND IT IS NOT A LOOSENING. READ THIS BEFORE
 *  QUOTING IT AS ONE, AND BEFORE PROPOSING THAT THE CORPUS BE PUT BACK. ██
 *
 *  ── WHAT HAPPENED ────────────────────────────────────────────────────────
 *  Commit `250e8a74` wrote a past `scheme_end_date` onto 53 `bdns_es_ayudas`
 *  leaves whose date was NULL. NULL read as open, so all 53 were being offered
 *  to founders as live guidance; their windows had shut between 2020-12-30 and
 *  2026-06-29 and not one was future-dated. The publish was correct.
 *
 *  ── WHY A CORRECT CLOSURE MOVED A RANKING FLOOR SEVEN POINTS ─────────────
 *  Not the ranker, and not the seat collapse. THE EXAM WAS REPLACED.
 *
 *    publishableInstruments()   837 -> 784
 *    graded answer key        6,083 -> 5,447        (pairs whose answer is
 *                                                    still offerable)
 *    `sampleRecall` draws from `pop.graded`, so a shorter array RE-DRAWS
 *    WHOLESALE at the same pinned seed:
 *    pairs common to both 300-pair draws   157       48% OF THE EXAM CHANGED
 *
 *  THE SEED PINS THE DRAW, NOT THE POPULATION — the block below this one has
 *  said so for weeks, and this is that hazard at full scale. `wsFK` measured it
 *  by exact counterfactual (`_wsfk_partition.ts`): restore nothing but those 53
 *  rows' offerability and four independent numbers snap back to the pre-break
 *  tape simultaneously — graded 6,083, original join 103, childless 87,
 *  exact_attribution 110.
 *
 *  ── AND THE 251 PAIRS THAT LEFT WERE THE BEST ONES ───────────────────────
 *  All 251 departing pairs are `traced:exact_attribution`; `childless_family`
 *  lost NOT ONE. exact_attribution scored 88.2% REGIME@5 against a 72.0%
 *  headline, so removing them shrank the share of the BEST population (110 ->
 *  99) and raised the share of the WORST (childless 87 -> 103, scoring 35.6%) —
 *  the one population where REGIME@5 CANNOT pay sibling credit, because a
 *  childless family is its own regime. Weighting the pre-break per-population
 *  rates by the post-break mix gives 69.2%: ██ MIX ALONE IS 2.8 OF THE 7.0
 *  POINTS ██, and the remaining 4.2 is exact_attribution's own rate on a
 *  48%-different sample, 88.2 -> 80.8, inside the 7.9-point 2 SE at n=99.
 *
 *  Two hypotheses were ruled out by measurement, not by reasoning:
 *    THE SEAT COLLAPSE   bisected. HEAD with it and 54bbea37 without it, on the
 *                        same live corpus minutes apart, both read pool 98 /
 *                        exact5 27 / regime5 65. It owns NONE of the drop.
 *    TIE-BREAK JITTER    semantic.ts orders with no tiebreak and IS
 *                        non-deterministic. Bounded rather than dismissed: 39
 *                        runs across two settled corpus states put the widest
 *                        within-state spread at 0.6 on regime5. It can account
 *                        for at most 0.6 of the 7, and no run on either side
 *                        lands in the gap.
 *
 *  ── WHY THE ANSWER IS NOT TO PUT THE CORPUS BACK ─────────────────────────
 *  ██ Reverting would mean putting 53 dead calls back in front of founders in
 *  order to green a number. ██ That is the whole argument, and it is enough on
 *  its own. The confirming evidence is that the change moved the ranker's own
 *  metrics UP, not down: over the same publish, pool ROSE 96.7 -> 98 and
 *  EXACT@5 ROSE 26 -> 27. A ranking regression does not move those upward.
 *
 *  One thing this cannot separate, stated rather than glossed: the same publish
 *  also rebuilt `instrument_profiles`, the primary semantic ranking signal, so
 *  the 4.2-point rate half is confounded between the re-drawn pairs and the
 *  re-embed. It cannot be un-confounded — Postgres cannot be rolled back, so no
 *  commit run today can read the old corpus. What can be said is that the
 *  re-embed moved both comparable metrics up.
 *
 *  ── THREE SEEDS, AS THE wsCQ BLOCK BELOW REQUIRES ────────────────────────
 *  That block's standing instruction is that a re-derivation must be made with
 *  three fresh seeds and never off the red run. `SPLIT=tune N=300 SEED=…
 *  measure_recall.ts`, settled corpus, live Postgres, `__recallSetDescribed`
 *  7,095 pairs / 5,447 graded on all three, `ranker: all request(s) on
 *  EMBEDDING`, every run free (cache replay, 0 live calls):
 *
 *                     PINNED (20260806)   seed 7   seed 99    LOWEST
 *      pool                  98              97       96        96
 *      EXACT@5               27              22       23        22
 *      REGIME@5              65              67       67        65
 *
 *  The pinned run reproduces the failing tape to the point (98 / 27 / 65), so
 *  these three seeds are measuring the same corpus the guard is failing on.
 *
 *  ── THE MARGINS, BY THE CONVENTION THIS FILE HAS ALWAYS USED ─────────────
 *  Both constraints are required and the BINDING one is the lower.
 *
 *  pool 93     RAISED from 92. 5 under pinned (98) = 93; 3 under the lowest
 *              seed (96) = 93. Both land on the same number. Pool is still the
 *              one CORRECTNESS floor — a fund the writer never sees cannot be
 *              advised on at all — and it is still the most stable thing here.
 *
 *  exact5 15   HELD, and NOT RAISED — this is where this derivation departs
 *              from the diagnosis that proposed it. wsFK proposed 17 on "10
 *              under pinned (27)", having measured only the pinned seed. The
 *              pinned seed turns out to be the HIGHEST of the three: the spread
 *              is 27 / 22 / 23, so 17 would sit 5 points under the lowest seed
 *              on the metric this file records swinging 20 -> 32 across a
 *              single index rebuild. The 2026-08-07 block refused a raise for
 *              exactly that arithmetic ("5 under pinned, half the stated
 *              margin"). The convention's other constraint — 9 under the lowest
 *              seed, the spacing the Doors derivation used — gives 22 - 9 = 13,
 *              BELOW the 15 in force, so the binding constraint lands under the
 *              floor and the floor stays. Nothing is lowered; 15 is now 7 under
 *              the lowest seed rather than the 9 the convention specifies.
 *
 *  regime5 58  LOWERED from 69. 7 under pinned (65) = 58; 3 under the lowest
 *              seed (65) = 62; the convention requires BOTH, so the binding one
 *              is 58. This is the number that needs everything above sitting
 *              permanently in this file, because lowering a floor is the same
 *              CLASS of act as `coverage_gate --accept` and must never be done
 *              on the strength of "it went red and we want it green". It is
 *              done here because the exam changed underneath the floor, the
 *              cause is established by exact counterfactual, the only way to
 *              restore the old number is to re-offer dead calls, and the
 *              ranker's own two comparable metrics both improved.
 *
 *  ── THIS FLOOR WILL DO IT AGAIN, AND THAT IS A DESIGN QUESTION ───────────
 *  REGIME@5's headline is a weighted average over three populations that are
 *  ALREADY floored separately below. Its only unique content is the MIX, and
 *  the mix is a corpus fact rather than a ranking fact — every future closure
 *  pass that retires dead calls moves it again, and re-baselining after each one
 *  is a ratchet walked backwards on a schedule. Two durable options: floor a
 *  composition-STANDARDISED REGIME@5 at fixed population weights, or retire the
 *  headline floor and keep the three per-population ones, which are immune to
 *  the mix and are what actually detect a ranking trade. RECORDED, NOT TAKEN:
 *  it is the owner's decision and not a number to invent here.
 *
 *  Related and under-scoped: `REGIME_AT_5_NOT_COMPARABLE` warns only about
 *  comparing across a recall-SET switch. The same arithmetic bites on any move
 *  in population mix INSIDE one set, which is what happened here — the active
 *  set was byte-identical on both sides of the break.
 *
 *  ── THE ANSWER KEY HAS BURNED MOST OF ITS HEADROOM ───────────────────────
 *  ██ The ungraded share went 14.3% -> 23.2% against `UNGRADED_SHARE.max` of
 *  33, whose own docstring says widening the band is NOT a legitimate response
 *  to it firing. Another closure pass of this size trips it. ██ The response
 *  when it does is to repair the key — extend the recall set onto funds that
 *  are still offerable — not to touch that constant and not to touch these
 *  floors. Flagged here because the trip will look like a data problem and is
 *  actually this measurement running out of room. */
/*  ── WHAT `pool` IS, since every block above calls it something else ──────
 *
 *  Read the derivations above with this in hand: each one justifies the pool
 *  floor as "the correctness floor — a fund the writer never sees cannot be
 *  advised on". `pool` does not measure that and never has. It counts
 *  `candidateInstrumentIds`, which `computeVerdict` returns BEFORE
 *  `accessiblePool` drops a conclusively blocked row, and the writer is shown
 *  the list after that drop.
 *
 *  The two are twenty points apart (wsGE, holdout, one founder per company:
 *  100% reach the candidate table, 77.5% survive the drop), so the floors above
 *  are calibrated on a retrieval metric while their prose claims a delivery
 *  one. `accessible` below is the delivery metric, measured on the same replay
 *  and reported unfloored until it has three seeds behind it. The history
 *  blocks are left as they were written — they are a record of what was
 *  believed at the time, and rewriting them would erase the mistake rather
 *  than name it. */
/*  ── `accessible` IS NOW FLOORED, 2026-08-13 (wsGN) ───────────────────────
 *
 *  ██ THE CORRECTNESS CLAIM MOVES OFF `pool` AND ONTO `accessible`. NOTHING IS
 *  LOWERED, AND NO EXISTING NUMBER MOVES. ██
 *
 *  The block above named the defect and left the fix to "the next
 *  re-derivation", with an instruction: floor it against `accessible` rather
 *  than moving `pool`, because the two are different claims and both are worth
 *  watching. That is what this is. It also says the floor waits for three seeds,
 *  and the reason it waited is worth recording: THE THREE SEEDS COULD NOT BE
 *  PRODUCED. `measure_recall.ts` is the harness that varies SEED and it does not
 *  compute `accessible`; this file computes `accessible` and pinned its seed. The
 *  convention's own precondition was unreachable, so `SEED=` was made an override
 *  here (it forfeits the right to publish a verdict) and the three seeds were run.
 *
 *  Same corpus, same commit, tune split, N=300, live Postgres, 1,088 hydrated
 *  rows / 771 offerable, `__recallSetDescribed.json`:
 *
 *                     PINNED (20260806)   seed 7   seed 99    LOWEST
 *      pool                  98              98       97        97
 *      accessible            90              91       90        90
 *      EXACT@5               25              22       22        22
 *      REGIME@5              68              62       63        62
 *
 *  ██ `accessible` is the most stable number this file has ever measured: 90 /
 *  91 / 90, a one-point spread against pool's own two. ██ That is not luck. The
 *  eight points between pool and accessible are the eligibility gates, and the
 *  gates are a property of the CORPUS rather than of the draw, so they do not
 *  move when the sample does.
 *
 *  ── THE MARGIN, BY THE CONVENTION THIS FILE HAS ALWAYS USED ──────────────
 *  Both constraints are required and the BINDING one is the lower.
 *
 *  accessible 85   5 under pinned (90) = 85; 3 under the lowest seed (90) = 87.
 *                  The convention requires BOTH, so the binding one is 85. Set
 *                  by the same arithmetic that set `pool 93` in the block above,
 *                  applied to a metric measured on the same three seeds.
 *
 *  ── WHAT THIS RESTATES, and it is a restatement rather than a regression ──
 *  `pool` keeps its number (93) and LOSES ITS SENTENCE. Every derivation above
 *  justifies it as "the one correctness floor — a fund the writer never sees
 *  cannot be advised on", and that sentence was never true of it: it counts the
 *  candidate table, which `accessiblePool` then filters, and the writer reads
 *  the list after the filter. The sentence now sits on the metric that means it.
 *
 *  What `pool` floors, stated honestly, is RETRIEVAL: did the ranker reach the
 *  won fund at all, before eligibility got a vote. That is a real thing to
 *  guard and it is why the floor is kept rather than deleted — a retrieval
 *  collapse and a gate collapse are different failures with different fixes,
 *  and a single number cannot tell them apart. They are now two.
 *
 *  ── WHAT IS STILL NOT FLOORED, AND IS THE NEXT ONE ───────────────────────
 *  This run's own intake tally prints, in its own block: `organisationType`
 *  answered for 146/300 founders while NEXT_PUBLIC_ORGANISATION_TYPE_ARM is
 *  OFF, worth a measured 4.0 points of accessible-pool recall. So 90 is a
 *  figure for a founder production does not construct. The floor at 85 has room
 *  for that correction; the NUMBER should not be quoted without the sentence. */
const FLOOR = { pool: 93, accessible: 85, exact5: 15, regime5: 58 };

/*  ── THE `exact5` ZERO-MARGIN FLAG, ANSWERED FROM THE VERDICT TABLE ───────
 *
 *  Workstream BR left this open: `exact5` passed at 22 against a floor of 22,
 *  no margin at all, and asked whether that was the rebuild's cost or noise.
 *
 *  ██ NEITHER. It is the graded POPULATION growing by 39% in one step. ██
 *
 *  `guard_verdicts` in Postgres holds twelve consecutive `recall_floor` runs
 *  from that night, all on the Composed key at the pinned seed, all N=300.
 *  Sorted by the size of the graded population rather than by time, they are
 *  perfectly bimodal:
 *
 *      GRADED 3,452 (72.0%)   seven runs, 00:11-02:00   pool 98   exact5 29, 29,
 *                                                       29, 29, 29, 29, 28.7
 *      GRADED 4,796 (100.0%)  five runs,  02:11-02:34   pool 97   exact5 22, 22,
 *                                                       22, 22, 22.3
 *
 *  Within a population the number is a CONSTANT to the decimal across repeated
 *  runs. Across the boundary it moves seven points. What crossed that boundary
 *  was not the ranker: 1,344 pairs — 28% of the key — stopped being WITHHELD as
 *  "closed with no successor" and became gradable, because BR's rebuild made
 *  their answers offerable again. pool moved 98 -> 97 and REGIME@5 moved
 *  91.3 -> 91.7 across the same instant.
 *
 *  So the exam got 39% longer and the newly admitted questions are harder on
 *  EXACT@5 specifically. That is the hazard the block below this one already
 *  names — "the seed pins the draw, not the population" — happening at full
 *  scale: the pinned draw is a constant only while the set it draws FROM is.
 *  The 10-point margin was licensed by "the same 300 pairs every run", and that
 *  premise had quietly stopped holding.
 *
 *  ██ THE PLAIN VERDICT: the zero-margin pass was green by luck, and it was
 *  never evidence about the ranker. A floor calibrated on 3,452 pairs was being
 *  read against a measurement on 4,796. ██
 *
 *  It also did not stay green. On today's corpus the same Composed key at the
 *  pinned seed reads EXACT@5 20 — BELOW the floor of 22 that it passed at
 *  02:34. Nothing about the ranker moved; the population moved again. That is
 *  the closing argument for re-deriving rather than inheriting: a floor whose
 *  denominator drifts is not a floor, and the answer is a floor derived on the
 *  population that actually ships, which is what `FLOOR` above now is. */
/** REGIME@5 per population — the operational number, the one a founder feels.
 *  Wider margins than the headline, and deliberately: these are subsamples of
 *  the 300, so at n~130 one standard error is already 4 points of the spread a
 *  legitimate refresh can produce. Two of those is the margin, which is what
 *  stops the gate flapping while still catching a population being traded away.
 *
 *  RE-DERIVED 2026-08-07 with the headline, against the repaired key. Both are
 *  RAISED again (68 -> 70, 82 -> 84) and both keep a wider margin than the
 *  headline floors, for a reason this session demonstrated rather than assumed:
 *  on the SAME pinned sample, across tonight's two corpus states, the traced
 *  population moved 98 -> 90. Eight points, with the sample held constant. A
 *  margin narrower than that would fail the build on the next correct reload.
 *
 *  Pinned measurements these sit under: original join 85 (n=151), traced 90
 *  (n=149). Lowest either produced across three seeds: 76 and 89.
 *
 *  RE-DERIVED AGAIN 2026-08-07 18:00 UTC on three seeds, and again UNCHANGED.
 *  Pinned now reads original join 83 (n=151) and traced 91 (n=149); lowest
 *  across the three seeds 76 and 89 -- the same two numbers as before. Raising
 *  either would take the margin below the EIGHT-POINT move this same pinned
 *  sample was seen to make across one corpus state, which is the one figure
 *  these two floors are set against.
 *
 *  `original join` keeps the widest margin of anything here. It is the smaller,
 *  older population and it is the one a change is most likely to trade away for
 *  the traced rows — which is precisely why the two are floored separately
 *  rather than netted into the headline. */
/*  ── THE SEED PINS THE DRAW, NOT THE POPULATION ───────────────────────────
 *
 *  Worth stating because the block above leans on "the same 300 pairs every
 *  run" and these two floors do not get that guarantee. The 300 are pinned. How
 *  they DIVIDE between these two populations is not: `partitionByOfferable` and
 *  `reattributeMissingAnswers` decide which pairs are gradable at all, and both
 *  are functions of `publishableInstruments()` and therefore of `today()`. A
 *  fund closing overnight moves pairs out of the graded set without touching
 *  the seed.
 *
 *  It has already happened, by six pairs each way: these floors were calibrated
 *  on 149 traced / 151 original join, and today's identical seed and N produce
 *  143 / 157. So a per-population percentage here is a ratio whose DENOMINATOR
 *  drifts, and at n~150 six pairs is four points of headline movement available
 *  without any ranking change at all. The margins above are wide enough to
 *  absorb that -- they were set against an eight-point corpus move -- but a
 *  reader comparing today's n to the calibration block's n should expect them
 *  to differ, and should not read a moved percentage as a moved ranker until
 *  the n is checked. */
/*  ── RE-DERIVED AGAINST DOORS, 2026-08-09 — and here ONE GOES UP ──────────
 *
 *  THREE populations now, because Doors carries one the old key could not name
 *  at all. Measured with the headline above, same runs:
 *
 *      regime5 by population       seed 20260806   seed 7   seed 99
 *      original join                   83 (n=92)   85 (81)  79 (89)
 *      traced:exact_attribution        96 (136)    99 (135) 93 (130)
 *      traced:childless_family         31 (72)     31 (84)  31 (81)
 *
 *  Margin convention, unchanged: two standard errors at THIS population's n,
 *  which is what stops the gate flapping on a legitimate reseed, taken against
 *  the lowest seed rather than the pinned one.
 *
 *  original join 70   UNCHANGED. Lowest seed 79 at n=89; 1 SE is 4.3 points, so
 *                     two is 8.6 and the convention lands on 70 — the number
 *                     already in force. It is not raised: n has fallen from
 *                     ~131 to ~89 because Doors moves pairs into the two traced
 *                     populations, and a smaller n is a wider SE, not a tighter
 *                     one. Widest relative margin of the three, as before.
 *  traced:exact_attribution 88  RAISED from 84. Lowest seed 93 at n=130, 1 SE
 *                     is 2.2 points; 5 under the lowest seed is the same
 *                     spacing the previous derivation used (floor 84 under a
 *                     lowest seed of 89). This is the population whose canary
 *                     floor was re-derived DOWN today, and raising the
 *                     acceptance floor on it is the counterweight: the cheap
 *                     check got a better metric, and the expensive check got a
 *                     higher bar on the same rows.
 *  traced:childless_family 21  NEW, and provisional. 31 on all three seeds — the
 *                     most stable figure in this file — but n~78 makes 1 SE 5.2
 *                     points, so the convention's two lands on 21. That is the
 *                     widest relative margin here and it is deliberate: these
 *                     funds entered a fitted ranking artifact four days ago and
 *                     there is no history of how they move under a corpus
 *                     reload. TIGHTEN IT once there is. Do not read 21 as a
 *                     statement that 21 would be acceptable.
 *
 *  Note what this population is: a childless family IS its own regime, so its
 *  regime5 and its exact5 are the same number to the case (31 and 31 on all
 *  three seeds). It is the only population here whose floor cannot be passed
 *  with a sibling. */
/*  ── RE-DERIVED AGAINST THE REAL FOUNDER, 2026-08-09 (workstream CQ) ──────
 *
 *  Same twelve runs as the headline block, read per population. Pinned seed
 *  first, then the lowest any of the three produced, then the old harness's
 *  lowest on the identical draws — because the question for every one of these
 *  is whether the number moved because of the harness or because of the corpus,
 *  and only the third column answers it.
 *
 *      regime5 by population      pinned  lowest of 3   OLD harness, lowest
 *      original join                86        86 (n=90)       85
 *      traced:exact_attribution     89        89 (n=110)      88
 *      traced:childless_family      38        28 (n=81)       28
 *
 *  original join 78   RAISED from 70. Two standard errors at this population's
 *                     n, against the lowest seed, exactly as before: at 86 on
 *                     n=90, 1 SE is 3.7 points, so two is 7.3 and the
 *                     convention lands on 78.7. Cross-checked against the one
 *                     thing wider than the SE — this file records the traced
 *                     population moving EIGHT points across a single corpus
 *                     state — and 86 - 8 is 78 as well, so both constraints
 *                     agree. Note the old harness reads 85 on the same draws:
 *                     the rise from the Doors block's 79 is the CORPUS, not
 *                     this workstream, and the floor is being raised onto a
 *                     measurement that rose for a reason nobody here caused.
 *  traced:exact_attribution 88  HELD, and this is the entry to watch.
 *                     ██ The convention would put it at 83 (2 SE = 6.0 at 89 on
 *                     n=110), which is BELOW the 88 in force, so nothing is
 *                     lowered and 88 stands — with NO MARGIN AT ALL. ██ It was
 *                     raised to 88 when the lowest seed was 93; the lowest seed
 *                     is now 89, and TWO CONSECUTIVE RUNS OF THIS GATE on the
 *                     identical commit, seed and corpus read 89 and then 88.
 *                     The floor is sitting on its own measurement.
 *
 *                     The old harness reads 88 on the same draws, so the
 *                     closure is a corpus move and not the founder change —
 *                     indeed the real founder is a point BETTER on this
 *                     population. Recorded rather than fixed, because the two
 *                     available fixes are both wrong: lowering it is what this
 *                     file exists to refuse, and re-deriving it upward on a
 *                     measurement that fell would be the coin flip with a
 *                     comment that the 2026-08-07 block names. When this goes
 *                     red — and on that spread it will — the finding is that
 *                     the canary population has drifted, not that the ranker
 *                     regressed, and the next re-derivation has to be made with
 *                     three fresh seeds rather than off the red run.
 *  traced:childless_family 21  HELD. 2 SE is 10 points at 28 on n=81, which
 *                     lands on 18, below the 21 in force. Held, and therefore
 *                     tighter than the convention by 3. The pinned seed reads
 *                     38 and the other two read 28 — a ten-point spread on the
 *                     population the previous block called "the most stable
 *                     figure in this file" at 31/31/31. It is not stable any
 *                     more, and the instruction that block left ("TIGHTEN IT
 *                     once there is history") is hereby withdrawn: there is
 *                     history now and it says the opposite. */
/*  ── RE-DERIVED WITH THE HEADLINE, 2026-08-12 ─────────────────────────────
 *
 *  ██ THE CANARY WENT OFF EXACTLY AS ITS OWN DOCSTRING PREDICTED. ██
 *  The block above `traced:exact_attribution 88` reads: "When this goes red —
 *  and on that spread it will — the finding is that the canary population has
 *  drifted, not that the ranker regressed, and the next re-derivation has to be
 *  made with three fresh seeds rather than off the red run." It went red, the
 *  finding IS that the population drifted, and this is that re-derivation.
 *
 *  What drifted, and it is not a ranking change: 53 closed Spanish calls were
 *  correctly withdrawn from the offerable pool, and all 251 answer-key pairs
 *  that left the tune pool with them were `traced:exact_attribution` — this
 *  population, and only this one. `childless_family` lost none. See the wsFM
 *  block above `FLOOR` for the full mechanism; the short form is that this
 *  population's n and its membership both moved, so its rate is measured on
 *  different pairs and not on a re-scored sample.
 *
 *  Same three seeds as the headline, tune split, N=300, settled corpus:
 *
 *      regime5 by population      pinned      seed 7      seed 99    LOWEST
 *      original join              86 (n= 98)  86 (n=123)  88 (n=112)   86
 *      traced:exact_attribution   81 (n= 99)  80 (n= 86)  77 (n=103)   77
 *      traced:childless_family    30 (n=103)  30 (n= 91)  26 (n= 85)   26
 *
 *  Margin convention, unchanged: two standard errors at THIS population's n,
 *  taken against the LOWEST seed rather than the pinned one. That second half
 *  is the part that matters here — see `traced:exact_attribution` below.
 *
 *  original join 78   HELD. Lowest seed 86 at n=98; 1 SE is 3.5 points, so two
 *                     is 7.0 and the convention lands on 79.0. That is one
 *                     point above the floor in force, and the measurement did
 *                     NOT rise — the lowest seed was 86 at the wsCQ derivation
 *                     too. A floor that moves onto a measurement that did not
 *                     rise is the coin flip with a comment the 2026-08-07 block
 *                     names, so 78 stands. This population is untouched by the
 *                     closure: it lost no pairs.
 *
 *  traced:exact_attribution 68  LOWERED from 88, and this departs from the
 *                     73 the diagnosis proposed. wsFK computed 2 SE at the
 *                     PINNED seed (7.9 at 80.8 on n=99, giving 73) because the
 *                     pinned seed was all it had measured. The convention takes
 *                     the LOWEST of three, and the lowest is 77 at n=103: 1 SE
 *                     is 4.1, two is 8.3, and the convention lands on 68.7.
 *                     73 would sit FOUR points under the lowest seed measured —
 *                     less than one standard error — on the one population in
 *                     this file that has already been red for precisely that
 *                     reason. Setting it there would repeat the zero-margin
 *                     mistake twenty points lower down.
 *
 *                     ██ SAID PLAINLY: at n~100 the convention's own margin is
 *                     eight points wide, so a floor of 68 cannot detect a real
 *                     eight-point regression on this population. ██ That is a
 *                     limit of the sample size, not a decision made here, and
 *                     the fix is more graded pairs rather than a tighter number
 *                     — a tighter number on this n is a gate that flaps and
 *                     then gets muted, which is this file's stated failure
 *                     mode.
 *
 *  traced:childless_family 21  HELD. Lowest seed 26 at n=85; 1 SE is 4.8, two
 *                     is 9.5, and the convention lands on 16.5 — BELOW the 21
 *                     in force, so nothing is lowered and 21 stands, tighter
 *                     than the convention by 4. Note this population GREW as a
 *                     share of the draw (87 -> 103 pairs across the break)
 *                     without losing a single pair, which is the arithmetic
 *                     that pulled the headline down: it is the worst-scoring
 *                     population and it cannot pay sibling credit, because a
 *                     childless family is its own regime. */
const POPULATION_FLOOR: Record<string, number> = {
  "original join": 78,
  "traced:exact_attribution": 68,
  "traced:childless_family": 21,
};
// FIXED, and deliberately not configurable — both of them.
//
// N was already pinned, because under STRIDE the verdict depended on how many
// pairs you happened to run. The shuffle removes that (19% at N=200, 19% at
// N=250, 20% at N=600 on the same build), so N is now pinned for a different
// reason: a gate and its calibration must describe the same sample.
//
// SEED is pinned for the reason N no longer needs to be. At n=150 the draw
// alone moved REGIME@5 across 75 / 79 / 83 on three seeds of identical code —
// six points of pure noise, which is more than any margin worth setting. Both
// pinned, and the sample is then a constant. Use `measure_recall.ts`, which
// varies SEED, to find out whether a result is real.
const N = 300;
// ── `SEED=` OVERRIDES THE DRAW, AND THEN THIS RUN MAY NOT SPEAK FOR MAIN ──
//
// The convention every derivation block above states -- "a re-derivation must
// be made with three fresh seeds and never off the red run" -- was NOT
// executable for anything this file alone measures. `measure_recall.ts` varies
// SEED and does not compute `accessible`, so the three seeds behind a floor on
// the delivered pool could not be produced by any harness in the repo. That is
// how `accessible` sat reported-and-unfloored: not because nobody wanted the
// floor, but because the convention's own precondition was unreachable.
//
// The obvious hazard of an env-settable seed is that a red run gets reseeded
// until it is green. That is closed HERE rather than by asking people not to:
// an overridden seed cannot publish a verdict, so a reseeded pass cannot become
// the figure the feed carries or the fingerprint a merge is judged against. It
// can only inform a derivation that a human writes down, which is the one use
// the convention has for it.
const SEED = Number(process.env.SEED ?? DEFAULT_SEED);
if (SEED !== DEFAULT_SEED) {
  // Through the channel that already exists for exactly this claim, rather than
  // a second one beside it: `GUARD_NO_PUBLISH` is how this repo says "these
  // figures are real and they do not speak for main", and it says so loudly on
  // the same screen as the numbers.
  process.env.GUARD_NO_PUBLISH = `SEED=${SEED} overrides the pinned draw ${DEFAULT_SEED}`;
  console.log(`  SEED=${SEED} (pinned draw is ${DEFAULT_SEED}) — this run informs a `
    + `derivation and cannot publish a verdict.`);
}

async function main() {
  // Semantic ranking needs DATABASE_URL and VOYAGE_KEY, and the contract for
  // both was declared at the top of the file: a run missing either never
  // reaches here. That is what changed -- this used to print SKIPPED and exit
  // 0, which is how `npm run check` went green with the floors never evaluated.
  //
  // What IS still reachable is the deliberate offline run, and it cannot floor
  // anything: the lexical fallback is a different system from the one that
  // ships, so a number taken off it would not be about the ranker these floors
  // guard. That is a refusal, not a pass. The skip that remains is the one
  // somebody TYPED, the same precedent check_degradation and
  // check_hydration_parity already set -- and `npm run check` does not set
  // NO_PG, so the default path either floors or dies.
  if (CREDENTIALS === "offline") {
    console.log("check_recall_floor: skipped — NO_PG=1, so ranking would come "
      + "from the lexical fallback, which is a different system from the one "
      + "these floors guard. Run without NO_PG to evaluate them.");
    // NO verdict is published, deliberately. A verdict saying nothing went
    // wrong, from a run that measured nothing, is the failure this whole file
    // exists to prevent. check_verdicts.ts reports recall_floor as SILENT,
    // STALE or DRIFTED until a run with credentials publishes real numbers.
    return;
  }

  await hydrateDbInstruments();
  // A run that asked for Postgres and silently got the committed snapshot grades a
  // corpus where nothing is closed -- which is exactly how pool read 97% one
  // minute and 77% the next. Exit rather than report.
  requireLiveCorpus("check_recall_floor");
  const byId = new Map(loadDbInstruments().map((i) => [i.id, i]));
  let anyFailed = false;
  const { file, rows: all } = loadRecallSet("recall floor");
  // The SAME sampler measure_recall.ts uses, from the same file, at the pinned
  // seed. It used to be a stride here: the set is grouped by mode and by
  // whether the pair was traced, and `i % step` aliases against that ordering,
  // so this gate and the harness it floors were reading different samples of
  // one set. Sharing the draw is what makes the floors below reproducible by
  // anyone who runs `SPLIT=tune N=300 npx tsx scripts/measure_recall.ts`.
  // ── The answer key, repaired against the corpus that actually ships ───────
  // Two different kinds of stale answer, repaired two different ways, and
  // reported separately because they mean different things (see recallSet.ts):
  //
  //   NEVER A FUND  the instrument was deleted because it was never a fund --
  //                 GtR competition formats mapped into `programme_name`. The
  //                 award is real; the object it was attributed to was invented.
  //                 RE-ATTRIBUTED to the rollup it was split out of, which is a
  //                 real fund with a real application route.
  //   CLOSED        the register says the window has shut and there is no
  //                 successor. Retrieval is correct to withhold it, so grading
  //                 it as a miss grades the key. EXCLUDED, not deleted.
  const corpus = loadDbInstruments();
  assertAncestorConvention(corpus);
  const inCorpus = new Set(corpus.map((i) => i.id));
  const offerable = new Set(publishableInstruments().map((i) => i.id));
  const fixed = reattributeMissingAnswers(
    all, (id) => inCorpus.has(id), (id) => offerable.has(id));
  const pop = partitionByOfferable(fixed.rows, (id) => offerable.has(id));
  assertGradablePopulation(pop, (id) => inCorpus.has(id), fixed.reattributed.length, file);
  const tune = pop.graded.filter((r) => r.split === "tune");
  const set = sampleRecall(tune, N, SEED);

  let pool = 0, exact5 = 0, regime5 = 0;
  // ── ACCESSIBLE, reported and NOT floored (wsGE, 2026-08-12) ──────────────
  //
  // ██ `pool` IS NOT THE LIST ANYONE IS SHOWN, AND FOUR BLOCKS ABOVE SAY IT IS.
  //
  // Every derivation in this file justifies the pool floor as "the correctness
  // floor — a fund the writer never sees cannot be advised on". That sentence
  // is about the memo pool. `candidateInstrumentIds` is NOT the memo pool: it
  // is the candidate table BEFORE `accessiblePool` removes a conclusively
  // blocked row, and that filter is the single largest loss in the funnel.
  //
  // Measured by wsGE on the holdout split, one founder per company: 100% of won
  // funds reach `candidateInstrumentIds` and 77.5% survive `accessiblePool`.
  // `poolRecallCurve.generated.json` has been reading 77.5% since 2026-08-11
  // while this gate read 98%, and nobody could tell whether the two disagreed
  // or measured different things. They measure different things. Both are now
  // on one screen, off one replay, so the question cannot be asked again.
  //
  // Unfloored on purpose, exactly as `exact6` is. This file's own convention is
  // that a floor sits under a measurement taken on three seeds; this number has
  // one run behind it, and a gate calibrated on a single seed is the zero-margin
  // mistake the `traced:exact_attribution` block above is a monument to. Floor
  // it at the next re-derivation, and floor it against `accessible` rather than
  // moving `pool`: the two are different claims and both are worth watching.
  let accessible = 0;
  // ── EXACT@6, reported and NOT floored ────────────────────────────────────
  // The brief publishes SIX rows and this gate reads the instant screen, whose
  // DISPLAY_CAP is 6. `exact5` stays the floored metric on the population it
  // was calibrated on -- re-deriving it onto a wider window could only raise it,
  // which would be a loosening dressed as an update -- so the sixth row is
  // reported alongside instead. The gap between them is how much the last slot
  // is worth, which is a fact nobody here had.
  let exact6 = 0;
  // ── The split that is the whole point of workstream DH ───────────────────
  // Four founders in five carry no description at all and query with one of
  // eleven canned sector sentences. `semanticFundMatch` and `themeRelevance`
  // both read the description, so a headline averaged over both populations is
  // an average over two different questions. Reported separately, always: if
  // the described founders score differently, then every figure this repo has
  // published was measured on a founder who said nothing.
  const byDesc = new Map<boolean, { n: number; pool: number; e5: number; e6: number; r5: number }>();
  const byPop = new Map<string, { n: number; r5: number }>();
  // Cold corpus per pair, same as measure_recall.ts. A gate whose verdict
  // depends on how far into the run a pair sat is not a gate.
  {
    const prov = corpusProvenance();
    console.log(`  corpus=${prov.source} instruments=${prov.instruments}`);
  }
  // WHICH RANKER produced these numbers, counted rather than assumed.
  //
  // This gate returned `regime5 87%` (FAILED, floor 88) and then `regime5 96%`
  // (ok) on the SAME commit, the same seed and the same corpus on 2026-08-09.
  // The first run shared the machine with another 250-pair harness.
  // `semanticFundMatch` has a 3s connect and a 3s statement timeout and returns
  // an empty map on any failure, at which point every `rankerUsed` call site
  // drops to the lexical index -- so a run can average two ranking systems and
  // print one number. `requireLiveCorpus` and `requireCredentials` cannot see
  // it: both were satisfied in both runs.
  //
  // Reported, and deliberately NOT made a failure condition. Turning it into
  // one would put a new red light in `npm run check` in the same commit that
  // discovered the phenomenon, before anyone knows how often it fires on a
  // quiet machine -- and a gate nobody can predict is the gate that gets
  // scrolled past. The line is on screen at the moment somebody reads the
  // verdict, which is what a red build needs in order to be attributable.
  resetRankerTally();
  resetGateHydration();
  // ── WHO this gate replays, and why it is no longer written here ──────────
  //
  // This literal used to be eight constants inlined at this call site, and the
  // shared resolver was one import away and unreachable from it. That is how a
  // gate that fails the build came to grade a founder who does not exist:
  // `"TestCo"` matches nothing, so `usedInField` — TIER 1 OF THE ROW SORT —
  // was false on every row of every run this repo has published, while
  // `capitalSought: ["grant","loan"]` removed every tax-credit and equity fund
  // before ranking and that exclusion was reported to the owner as a corpus
  // gap. See scripts/founderIntake.ts for the field-by-field leak argument.
  //
  // `check_harness_intake.ts` now fails the build if this call site grows its
  // own intake literal again.
  const policy = founderPolicyFromEnv();
  const tally = new IntakeTally();
  for (const t of set) {
    resetGateHydration();
    const f = founderIntake(t, policy);
    tally.add(f);
    const v = await computeVerdict(f.company, f.country, f.eligibility as never, {
      ...f.opts,
      // Same query `measure_recall.ts` builds, including the sector template
      // fallback. Passing nothing modelled a founder who typed a description
      // and left it blank, which the intake no longer permits -- and it made
      // this gate grade itself on a path that does not ship, reading EXACT@5
      // six points below the measurement it is supposed to floor.
    } as never);
    const table = (v.instrumentTable ?? [])
      .map((r: InstrumentRow) => r.instrumentId).filter(Boolean) as string[];
    const top5 = table.slice(0, 5);
    const wantRegime = byId.get(t.instrument)?.parentId ?? t.instrument;
    const r5 = top5.some((id) => (byId.get(id)?.parentId ?? id) === wantRegime);
    const candidateIds = v.candidateInstrumentIds ?? [];
    const inPool = candidateIds.includes(t.instrument);
    // PRODUCTION'S OWN FUNCTION, not a second predicate that agrees with it
    // today. `accessiblePool` reads `instrumentId` and, only for a log subject,
    // `channel`; handing it the ids is therefore the same call the memo path
    // makes over the same rows. Free: the gates for exactly these instruments
    // were fetched by `buildInstrumentTableHydrated` inside `computeVerdict`.
    const accessibleIds = accessiblePool(
      candidateIds.map((id) => ({ instrumentId: id, channel: "" }) as InstrumentRow),
      f.eligibility as never).map((r) => r.instrumentId);
    const inAccessible = accessibleIds.includes(t.instrument);
    const e5 = top5.includes(t.instrument);
    const e6 = table.slice(0, 6).includes(t.instrument);
    if (inPool) pool++;
    if (inAccessible) accessible++;
    if (e5) exact5++;
    if (e6) exact6++;
    if (r5) regime5++;
    {
      const d = isDescribed(t);
      const m = byDesc.get(d) ?? { n: 0, pool: 0, e5: 0, e6: 0, r5: 0 };
      m.n++;
      if (inPool) m.pool++;
      if (e5) m.e5++;
      if (e6) m.e6++;
      if (r5) m.r5++;
      byDesc.set(d, m);
    }
    const key = t.traced ? `traced:${t.traced}` : "original join";
    const p = byPop.get(key) ?? { n: 0, r5: 0 };
    p.n++; if (r5) p.r5++;
    byPop.set(key, p);
  }

  const got = {
    pool: (100 * pool) / set.length,
    accessible: (100 * accessible) / set.length,
    exact5: (100 * exact5) / set.length,
    regime5: (100 * regime5) / set.length,
  };
  const failed = (Object.keys(FLOOR) as (keyof typeof FLOOR)[])
    .filter((k) => got[k] < FLOOR[k]);

  console.log(`  ${rankerTallyLine()}`);
  // WHICH FOUNDER produced these numbers, field by field, on the same screen as
  // the verdict. A floor is a claim about a population, and a reader who cannot
  // see what that population was asked cannot check the claim.
  for (const line of tally.lines(policy)) console.log(line);
  console.log(`  ${file}  ${set.length} tune pairs`);
  for (const k of Object.keys(FLOOR) as (keyof typeof FLOOR)[]) {
    const bad = got[k] < FLOOR[k];
    console.log(`    ${bad ? "FAIL" : "ok  "} ${k.padEnd(8)} ${got[k].toFixed(0)}% ` +
                `(floor ${FLOOR[k]}%)`);
    // The caveat travels with the number, on the same screen and in the
    // `detail` this run publishes to `guard_verdicts`. Every REGIME@5 in that
    // table before today was measured on a different key, and a reader
    // comparing rows has no other way to find that out.
    if (k === "regime5") console.log(`         ^ ${REGIME_AT_5_NOT_COMPARABLE}`);
    // The two are printed adjacently and the gap between them named, because
    // that gap IS the eligibility layer and reading either number alone is how
    // this file came to justify a retrieval floor with a delivery sentence.
    if (k === "accessible") {
      console.log(`         ^ what the writer is shown. The ` +
        `${(got.pool - got.accessible).toFixed(0)} points between pool and this are ` +
        `the eligibility gates.`);
    }
  }
  // EXACT@6 immediately under EXACT@5, unfloored and labelled as such, so the
  // sixth slot's worth is on the same screen as the metric it is not.
  console.log(`         exact6   ${((100 * exact6) / set.length).toFixed(0)}% ` +
              "(no floor — reported; the screen publishes six rows and exact5 " +
              "is floored on five)");
  // WHAT THESE FOUNDERS SAID, and what it bought them.
  for (const d of [true, false]) {
    const m = byDesc.get(d);
    if (!m) continue;
    console.log(
      `         ${d ? "DESCRIBED" : "BLANK    "} n=${String(m.n).padStart(3)}  ` +
      `pool ${((100 * m.pool) / m.n).toFixed(0)}%  ` +
      `exact5 ${((100 * m.e5) / m.n).toFixed(0)}%  ` +
      `exact6 ${((100 * m.e6) / m.n).toFixed(0)}%  ` +
      `regime5 ${((100 * m.r5) / m.n).toFixed(0)}%` +
      (d ? "" : "  <- queries with one of eleven canned sector sentences"));
  }
  // Per population, because a change that buys one with the other nets out to
  // a flat headline and this gate exists to catch exactly that.
  for (const [key, m] of [...byPop].sort()) {
    const f = POPULATION_FLOOR[key];
    const pct = (100 * m.r5) / m.n;
    const bad = f !== undefined && pct < f;
    if (bad) failed.push(`regime5 on ${key}` as never);
    console.log(`    ${bad ? "FAIL" : "ok  "} regime5  ${pct.toFixed(0)}% ` +
                `(floor ${f ?? "-"}%)  ${key}, n=${m.n}`);
  }
  if (failed.length) {
    console.error(`\ncheck_recall_floor: FAILED on ${failed.join(", ")} over ` +
                  `${set.length} tune pairs of ${file}.`);
    console.error("A ranking change that loses the fund a company actually won is");
    console.error("a regression even when every other check is green.");
    anyFailed = true;
  }

  // The measured numbers travel with the verdict, not just the pass/fail. A
  // reader without credentials can then see the margin closing before it closes
  // -- which is the whole point of floors that sit just under the measurement.
  const metrics: Record<string, unknown> = {
    n: set.length, seed: SEED, set: file,
    pool: Number(got.pool.toFixed(1)), exact5: Number(got.exact5.toFixed(1)),
    accessible: Number(((100 * accessible) / set.length).toFixed(1)),
    exact6: Number(((100 * exact6) / set.length).toFixed(1)),
    regime5: Number(got.regime5.toFixed(1)),
    floorPool: FLOOR.pool, floorAccessible: FLOOR.accessible,
    floorExact5: FLOOR.exact5, floorRegime5: FLOOR.regime5,
  };
  for (const d of [true, false]) {
    const m = byDesc.get(d);
    if (!m) continue;
    const k = d ? "described" : "blank";
    metrics[`n:${k}`] = m.n;
    metrics[`exact5:${k}`] = Number(((100 * m.e5) / m.n).toFixed(1));
    metrics[`exact6:${k}`] = Number(((100 * m.e6) / m.n).toFixed(1));
  }
  for (const [key, m] of byPop) {
    metrics[`regime5:${key}`] = Number(((100 * m.r5) / m.n).toFixed(1));
  }
  await publishVerdict(GUARD, {
    status: anyFailed ? "failed" : "ok",
    summary: `pool ${got.pool.toFixed(0)}% (floor ${FLOOR.pool}), ` +
             `accessible ${got.accessible.toFixed(0)}% (floor ${FLOOR.accessible}), ` +
             `EXACT@5 ${got.exact5.toFixed(0)}% (floor ${FLOOR.exact5}), ` +
             `REGIME@5 ${got.regime5.toFixed(0)}% (floor ${FLOOR.regime5}) ` +
             `over ${set.length} tune pairs` +
             (anyFailed ? ` — FAILED on ${failed.join(", ")}` : ""),
    metrics,
    detail: tape(),
  });

  if (anyFailed) process.exit(1);
  console.log(`check_recall_floor: ok — ${N} tune pairs of ${file} at seed ${SEED}, all floors met.`);
}

main().catch(async (err) => {
  console.error("check_recall_floor: FAILED to run —", err);
  await publishVerdict(GUARD, {
    status: "error", summary: `the guard could not complete: ${err}`, detail: tape(),
  });
  process.exit(1);
});
