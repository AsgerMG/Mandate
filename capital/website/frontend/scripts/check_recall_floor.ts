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
import { readFileSync } from "fs";
import path from "path";

try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* rely on the process environment */ }

import {
  hydrateDbInstruments, loadDbInstruments, publishableInstruments, resetGateHydration,
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
/*  ── RE-DERIVED against the seeded sampler (2026-08-06) ───────────────────
 *  The previous floors — pool 90, EXACT@5 20, REGIME@5 85, and 74/88 per
 *  population — were calibrated against a measurement this file took by
 *  STRIDE, on a set whose ordering stride aliases against. 95f5fce replaced
 *  the harness's sampler and did not reach this file, so the gate and the
 *  measurement it floors were sampling differently: the numbers those floors
 *  sat five points under (pool 95 / EXACT 25 / REGIME 91) are not reproducible
 *  by any unbiased draw. They are not lowered here so much as re-measured.
 *
 *  Measured on the leak-free corpus, tune split, seeded shuffle, n=300 at the
 *  pinned seed, __recallSetComposed.json — with the three-seed spread at n=600
 *  beside it, which is what says how much of the margin is noise:
 *
 *                        n=300 pinned      n=600, seeds 20260806 / 7 / 99
 *      pool                    (see below)        96  94  95
 *      EXACT@5                                    20  18  17
 *      REGIME@5                                   80  79  80
 *
 *  Floors sit ~5 points under the pinned measurement, the margin this gate has
 *  always used, and the seed and N are both pinned so the residual sampling
 *  noise inside that margin is ZERO — the same sample every run. The margin
 *  therefore covers a corpus refresh or an embedding rebuild, not the draw.
 *
 *  Pool is the one correctness floor rather than a ranking score — a fund the
 *  writer never sees cannot be advised on at all — so it is set hard; EXACT@5
 *  and REGIME@5 sit further below because a real ranking change moves them by
 *  more than it moves pool.
 *
 *  ── RE-MEASURED 2026-08-06 21:24 UTC, workstream K ────────────────────────
 *  Same pinned sample (tune, n=300, SEED=20260806), against the rebuilt
 *  leak-free semantic index:
 *
 *                        n=300 pinned    floor    margin
 *      pool                      78        72         6
 *      EXACT@5                   24        15         9
 *      REGIME@5                  88        80         8
 *      original join             80        68        12   (n=131)
 *      traced:exact_attribution  94        82        12   (n=169)
 *
 *  EXACT@5 and REGIME@5 ROSE against the numbers above (20 -> 24, 80 -> 88) on
 *  the same sample, so those floors are raised, not relaxed. The gate is
 *  strictly harder to pass on both ranking numbers than it was an hour ago.
 *
 *  ██ THE POOL FLOOR STAYS AT 90 AND THE BUILD STAYS RED. ██
 *
 *  Pool measured 94-96 at dac300a and measures 78 on the identical pinned
 *  sample now. Workstream K lowered this floor 90 -> 72 to get CI green, said
 *  in as many words that doing so enshrines a 16-point fall whose cause is not
 *  established, and asked for the decision to be reviewed. It was, and it is
 *  reversed.
 *
 *  A floor that moves to accommodate an unexplained regression is not a floor.
 *  This one is doing exactly the job it exists for: something took a fifth of
 *  the candidate pool away tonight, nobody can yet say what, and EXACT@5 cannot
 *  exceed P(in pool) however perfect the ranking. A red build that says so is
 *  worth more than a green one that does not.
 *
 *  The argument for lowering it was real — leaving it at 90 fails every build
 *  for a defect the branch did not cause and could not fix, since it lives in
 *  `shortlist.ts` / `corpus.ts`. That is a cost worth paying for the few hours
 *  it takes to find the cause. It is not worth paying by forgetting.
 *
 *  What is RULED OUT: the recall holdout in the semantic index. An index built
 *  --include-recall-set and one built holdout-clean, at the same moment on the
 *  same corpus, both read pool 78 on this sample.
 *
 *  What is NOT ruled out: a stale-index effect, and a wholesale gate-layer
 *  rewrite that wrote all 6,368 gate rows in the 18:00 UTC hour. They could not
 *  be separated because the previous index was overwritten and is
 *  unrecoverable. Note the same signature was seen from the other side: an
 *  identical tree, rule and seed read pool 97% at 21:09Z and 77% at 21:16Z with
 *  `funding_instruments` byte-identical across both.
 *
 *  Evidence and the settling experiment: project-mgmt/findings/leak_audit_wsK.md.
 *  EXACT@5 and REGIME@5 floors ROSE (15 -> from 20-ish, 80) on the same sample
 *  once the index was leak-free, so removing the leak improved ranking; only
 *  pool fell. */
const FLOOR = { pool: 90, exact5: 15, regime5: 80 };
/** REGIME@5 per population — the operational number, the one a founder feels.
 *  Wider margins than the headline, and deliberately: these are subsamples of
 *  the 300, so at n~130 one standard error is already 4 points of the spread a
 *  legitimate refresh can produce. Two of those is the margin, which is what
 *  stops the gate flapping while still catching a population being traded away.
 *
 *  Both were re-derived with the headline: 74 and 88 were stride-era numbers,
 *  and the traced population in particular does not measure 88 under any
 *  unbiased draw of this set.
 *
 *  RE-MEASURED 2026-08-06 21:24 UTC on the rebuilt index, same pinned sample.
 *  Both populations ROSE (original join 78 -> 80, traced 88 -> 94), so both
 *  floors are RAISED. A 12-point margin on each, which is three standard
 *  errors at these subsample sizes — wide enough not to flap on a corpus
 *  refresh, narrow enough to catch one population being traded for the other,
 *  which is the trade this split exists to catch. */
const POPULATION_FLOOR: Record<string, number> = {
  "original join": 68,
  "traced:exact_attribution": 82,
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
    console.log("  Floors NOT verified. Run with credentials before shipping a");
    console.log("  ranking change; lexical fallback would grade the wrong system.");
    return;
  }

  await hydrateDbInstruments();
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
