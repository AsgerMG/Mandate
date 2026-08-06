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

import { hydrateDbInstruments, loadDbInstruments, publishableInstruments } from "../lib/intelligence/corpus";
import { computeVerdict } from "../lib/intelligence/pipeline";
import {
  assertGradablePopulation, DEFAULT_SEED, loadRecallSet, partitionByOfferable, sampleRecall,
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
/*  Measured on this build (b2273a7), n=150 tune, __recallSetComposed.json:
 *      pool 95   EXACT@5 25   REGIME@5 91
 *      REGIME@5  84 on the original join (n=63), 95 on the traced rows (n=87)
 *  Floors sit ~5 points under, the margin this gate has always used. The old
 *  floors are NOT carried over: they guarded two different files, and one of
 *  them (`__recallSet.json`) was found today to be six points below the
 *  measurement it floors because it graded a founder who typed nothing — a
 *  path the intake no longer allows. */
const FLOOR = { pool: 90, exact5: 20, regime5: 85 };
/** REGIME@5 per population — the operational number, the one a founder feels.
 *  Wider margins than the headline, and deliberately: these are subsamples of
 *  the 150, so at n=63 one standard error is already 4.6 points. Two of those
 *  is the margin, which is what stops the gate flapping on noise while still
 *  catching a population being traded away. */
const POPULATION_FLOOR: Record<string, number> = {
  "original join": 74,
  "traced:exact_attribution": 88,
};
// FIXED, and deliberately not configurable -- both of them. N was already
// pinned because the verdict must not depend on how many pairs you happened to
// run. SEED is pinned for the same reason now that the draw is a shuffle: with
// both fixed the sample is a constant, so the margin below covers a corpus
// refresh or an embedding rebuild rather than the draw. Use `measure_recall.ts`,
// which varies SEED, to find out whether a result is real.
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
  // ── Grade only what the product may offer ─────────────────────────────────
  // A pair whose won fund the register says has closed, with no successor to
  // redirect to, cannot be returned by retrieval and MUST not be: sending a
  // founder to a closed scheme costs them real time. Scoring that as a miss
  // grades the answer key, not the ranker. 21.5% of this file was in that state
  // on 2026-08-06 -- which alone put pool's ceiling at 78.5% against a floor of
  // 90 -- and the exclusion is computed from `publishableInstruments()`, the
  // same function the product ranks over, so it tracks the corpus instead of
  // going stale the way the baked-in key did. See recallSet.ts for the property.
  const offerable = new Set(publishableInstruments().map((i) => i.id));
  const pop = partitionByOfferable(all, (id) => offerable.has(id));
  // Two-sided, and fatal. This is the alarm that would have caught tonight's
  // drift the day it happened rather than as a red floor nobody could explain.
  assertGradablePopulation(pop, (id) => byId.has(id));
  // The SAME draw `measure_recall.ts` takes, from the shared helper, at the
  // pinned seed. It used to be a stride here: the set is strongly ordered by
  // mode and by whether a pair was traced, and `i % step` aliases against that
  // ordering, so the gate and the harness it floors were reading different
  // samples of one set. Sharing the draw is what makes the floors below
  // reproducible by anyone running `SPLIT=tune N=300 npx tsx
  // scripts/measure_recall.ts`. SEED is pinned for the reason N is: at n=150 the
  // draw alone moved figures by six points on identical code, and a gate whose
  // verdict depends on the draw is not a gate. Vary SEED in the harness, never
  // here.
  const tune = pop.graded.filter((r) => r.split === "tune");
  const set = sampleRecall(tune, N, SEED);

  let pool = 0, exact5 = 0, regime5 = 0;
  const byPop = new Map<string, { n: number; r5: number }>();
  for (const t of set) {
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
  console.log(`check_recall_floor: ok — ${N} tune pairs of ${file}, all floors met.`);
}

main();
