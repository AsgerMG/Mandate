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
import { computeVerdict } from "../lib/intelligence/pipeline";
import type { InstrumentRow } from "../lib/intelligence/types";
import { DEFAULT_SEED, sampleRecall } from "./recallSample";
import {
  assertAncestorConvention, assertGradablePopulation, loadRecallSet,
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
const FLOOR = { pool: 89, exact5: 15, regime5: 69 };
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
const POPULATION_FLOOR: Record<string, number> = {
  "original join": 70,
  "traced:exact_attribution": 88,
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
const SEED = DEFAULT_SEED;

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
  const byPop = new Map<string, { n: number; r5: number }>();
  // Cold corpus per pair, same as measure_recall.ts. A gate whose verdict
  // depends on how far into the run a pair sat is not a gate.
  {
    const prov = corpusProvenance();
    console.log(`  corpus=${prov.source} instruments=${prov.instruments}`);
  }
  resetGateHydration();
  for (const t of set) {
    resetGateHydration();
    const v = await computeVerdict("TestCo", t.country, {
      entityCountries: [t.country], sector: t.sector ?? "other", activities: ["none"],
      borrowerModel: "operating", ticketBand: "b500k_2m5", consortium: "yes",
      useOfFunds: ["industrial_research", "experimental_development"],
    } as never, {
      targetMarkets: [t.country], capitalSought: ["grant", "loan"],
      // Same query `measure_recall.ts` builds, including the sector template
      // fallback. Passing nothing modelled a founder who typed a description
      // and left it blank, which the intake no longer permits -- and it made
      // this gate grade itself on a path that does not ship, reading EXACT@5
      // six points below the measurement it is supposed to floor.
      description: t.description || t.selfDescription || undefined,
    } as never);
    const top5 = (v.instrumentTable ?? []).slice(0, 5)
      .map((r: InstrumentRow) => r.instrumentId).filter(Boolean) as string[];
    const wantRegime = byId.get(t.instrument)?.parentId ?? t.instrument;
    const r5 = top5.some((id) => (byId.get(id)?.parentId ?? id) === wantRegime);
    if ((v.candidateInstrumentIds ?? []).includes(t.instrument)) pool++;
    if (top5.includes(t.instrument)) exact5++;
    if (r5) regime5++;
    const key = t.traced ? `traced:${t.traced}` : "original join";
    const p = byPop.get(key) ?? { n: 0, r5: 0 };
    p.n++; if (r5) p.r5++;
    byPop.set(key, p);
  }

  const got = {
    pool: (100 * pool) / set.length,
    exact5: (100 * exact5) / set.length,
    regime5: (100 * regime5) / set.length,
  };
  const failed = (Object.keys(FLOOR) as (keyof typeof FLOOR)[])
    .filter((k) => got[k] < FLOOR[k]);

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
    regime5: Number(got.regime5.toFixed(1)),
    floorPool: FLOOR.pool, floorExact5: FLOOR.exact5, floorRegime5: FLOOR.regime5,
  };
  for (const [key, m] of byPop) {
    metrics[`regime5:${key}`] = Number(((100 * m.r5) / m.n).toFixed(1));
  }
  await publishVerdict(GUARD, {
    status: anyFailed ? "failed" : "ok",
    summary: `pool ${got.pool.toFixed(0)}% (floor ${FLOOR.pool}), ` +
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
