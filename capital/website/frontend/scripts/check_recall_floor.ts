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
import { ENV_FILES, loadEnvLocal } from "./loadEnv";

// Repo root AND frontend, from the one loader. This script's own copy read only
// ./.env.local, so in a fresh worktree -- where the file is gitignored and
// therefore absent, while the repo-root one is right there -- it took the
// SKIPPED branch below and exited 0. The floors are the last line in
// `npm run check`; a green build that never evaluated them is the failure this
// whole file exists to prevent, happening to the file itself.
loadEnvLocal();

import {
  corpusProvenance, hydrateDbInstruments, loadDbInstruments, publishableInstruments,
  requireLiveCorpus, resetGateHydration,
} from "../lib/intelligence/corpus";
import { computeVerdict } from "../lib/intelligence/pipeline";
import { DEFAULT_SEED, sampleRecall } from "./recallSample";
import {
  assertAncestorConvention, assertGradablePopulation, loadRecallSet,
  partitionByOfferable, reattributeMissingAnswers,
} from "./recallSet";

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
const FLOOR = { pool: 93, exact5: 22, regime5: 80 };
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
const POPULATION_FLOOR: Record<string, number> = {
  "original join": 70,
  "traced:exact_attribution": 84,
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
  // Semantic ranking needs both. Without them this would grade the LEXICAL
  // fallback -- a different system from the one that ships -- and report a
  // number that looks like a pass. Skipping loudly is the honest failure mode;
  // the check runs wherever credentials exist, which is every developer machine
  // and the deploy path.
  if (!process.env.DATABASE_URL || !process.env.VOYAGE_KEY) {
    console.log("check_recall_floor: SKIPPED — no DATABASE_URL/VOYAGE_KEY.");
    // Name the files it looked in. The skip is legitimate in CI, which has
    // neither; on a developer machine it almost always meant the credentials
    // were sitting in the OTHER .env.local, and the message gave no way to
    // tell those two cases apart.
    console.log(`  looked in: ${ENV_FILES.join(", ")} (relative to ${process.cwd()})`);
    console.log("  Floors NOT verified. Run with credentials before shipping a");
    console.log("  ranking change; lexical fallback would grade the wrong system.");
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
  assertGradablePopulation(pop, (id) => inCorpus.has(id), fixed.reattributed.length);
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
      .map((r: any) => r.instrumentId).filter(Boolean) as string[];
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
  if (anyFailed) process.exit(1);
  console.log(`check_recall_floor: ok — ${N} tune pairs of ${file} at seed ${SEED}, all floors met.`);
}

main();
