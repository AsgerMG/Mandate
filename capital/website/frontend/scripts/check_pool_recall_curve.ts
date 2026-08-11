// Is the base rate the selector is told still the base rate?
//
// ── What this guards ──────────────────────────────────────────────────────
// `poolRecallCurve.generated.json` is the one artifact in this repo whose whole
// job is to make a SENTENCE TO A MODEL true. Every other generated artifact
// degrades into a worse ranking when it goes stale; this one degrades into a
// confident false claim, which is the exact defect it was built to remove:
// four workstreams shipped a prompt saying the answer is "somewhere in this
// list about three quarters of the time" while the true figure for the list
// actually shown was 44%.
//
// A stale curve is invisible from the outside. It parses, it interpolates, it
// prints a plausible percentage, and nothing anywhere fails. So the four
// properties are checked here instead:
//
//   1. IT LOADS. Through the same loader the request path uses, so a tracing
//      miss or a bad parse is caught here rather than by a prompt that quietly
//      drops its base-rate sentence in production.
//   2. IT IS MONOTONE. Recall in K cannot fall as K grows — a curve that dips
//      is a measurement bug, and interpolation over it produces numbers that
//      were never measured.
//   3. IT COVERS THE DEPTHS THE PRODUCT USES. `poolRecallAt` refuses to
//      extrapolate above its deepest measured point, so a curve that stops
//      short of `SELECT_DEPTH` silently quotes the wrong depth's number.
//   4. IT WAS MEASURED ON THIS CORPUS. The corpus is the thing that moves: a
//      country load or a publishability change moves every accessible pool and
//      therefore every point on this curve, with nothing to say so.
//
// Property 4 needs the live corpus. Without credentials the first three still
// run and the fourth says it did not — a check that skips silently is the
// failure `check_recall_floor` was rewritten to stop.
//
//   npx tsx scripts/check_pool_recall_curve.ts
//   PROVE=1 npx tsx scripts/check_pool_recall_curve.ts
import { loadEnvLocal } from "./loadEnv";

loadEnvLocal();

import {
  POOL_RECALL_FILE, POOL_RECALL_KS, poolRecallAt, poolRecallN, resetPoolRecall,
} from "../lib/intelligence/poolRecall";
import { generatedArtifactFailures } from "../lib/intelligence/generatedArtifact";
import { SELECT_DEPTH } from "../lib/intelligence/agentSelect";
import { VERDICT_POOL } from "../lib/intelligence/caps";

/** The curve is a base rate. Below this many founders it is anecdote, and a
 *  model quoted an anecdote as a measured frequency is being misled precisely
 *  as it was before. */
const MIN_N = 200;

async function main() {
  const bad: string[] = [];
  resetPoolRecall();

  // 0. THE NAME. Spelled out once here, so `check_artifact_reachability.py`
  //    can prove this artifact is watched — it reads names, not constants —
  //    and so that a rename which moved the reader without moving the guard
  //    fails HERE, loudly, instead of leaving a committed file nothing checks.
  if (POOL_RECALL_FILE !== "poolRecallCurve.generated.json") {
    bad.push(`this guard was written for poolRecallCurve.generated.json and the request `
      + `path now reads ${POOL_RECALL_FILE}. The artifact moved and its only staleness `
      + `check did not.`);
  }

  // 1. IT LOADS.
  const n = poolRecallN();
  const failed = generatedArtifactFailures()[POOL_RECALL_FILE];
  if (failed) {
    bad.push(`${POOL_RECALL_FILE} did not load: ${failed}. The selector prompt is `
      + `currently making NO claim about how often the answer is in its list.`);
  } else if (n < MIN_N) {
    bad.push(`the curve was measured on ${n} founders, below the floor of ${MIN_N}. `
      + `Re-run scripts/_wsdr_curve.ts on the full holdout split.`);
  }

  // 2. IT IS MONOTONE.
  let prev = 0;
  for (const k of POOL_RECALL_KS) {
    const v = poolRecallAt(k);
    if (v == null) continue;
    if (v < prev - 1e-9) {
      bad.push(`recall falls from ${(prev * 100).toFixed(1)}% to ${(v * 100).toFixed(1)}% `
        + `at K=${k}. P(won fund within the first K rows) cannot decrease as K grows; `
        + `this curve is a measurement bug, not a base rate.`);
    }
    prev = v;
  }

  // 3. IT COVERS THE DEPTHS THE PRODUCT USES.
  //    Derived from the constants, never retyped: these ARE the list lengths
  //    the two seam positions show, so a cap that moves moves this check with
  //    it rather than leaving it guarding a depth nobody reads any more.
  const deepest = Math.max(...POOL_RECALL_KS);
  for (const [what, k] of [["the late seam's list", VERDICT_POOL],
    ["the early seam's list", SELECT_DEPTH], ["the published table", 6]] as [string, number][]) {
    if (k > deepest) {
      bad.push(`${what} is ${k} rows and the curve stops at K=${deepest}. `
        + `poolRecallAt refuses to extrapolate, so the prompt would quote the `
        + `figure for ${deepest} rows while showing ${k}.`);
    }
  }

  // 4. IT WAS MEASURED ON THIS CORPUS.
  let corpusLine: string;
  if (!process.env.DATABASE_URL) {
    corpusLine = "corpus staleness NOT CHECKED — no DATABASE_URL in this environment. "
      + "Properties 1-3 ran; property 4 did not.";
  } else {
    const { hydrateDbInstruments, corpusProvenance } = await import("../lib/intelligence/corpus");
    const { loadGenerated } = await import("../lib/intelligence/generatedArtifact");
    await hydrateDbInstruments();
    const live = corpusProvenance();
    const recorded = String(
      loadGenerated<{ corpus?: string }>(POOL_RECALL_FILE, {}).corpus ?? "");
    const was = Number((recorded.match(/instruments=(\d+)/) ?? [])[1] ?? NaN);
    corpusLine = `measured on ${recorded || "(unrecorded)"}, live ${live.source} `
      + `instruments=${live.instruments}`;
    if (!Number.isFinite(was)) {
      bad.push(`the curve records no corpus size (${recorded || "empty"}), so nothing can `
        + `tell whether it describes the funds this checkout ranks.`);
    } else if (was !== live.instruments) {
      bad.push(`the curve was measured on ${was} instruments and this corpus holds `
        + `${live.instruments}. Every accessible pool has moved, so every point on the `
        + `curve has, and the selector is being told a base rate about a different `
        + `corpus. Re-run scripts/_wsdr_curve.ts.`);
    }
  }

  if (process.env.PROVE) {
    console.log(`  PROVE: n=${n}, K=${POOL_RECALL_KS.join(",")}`);
    console.log(`  PROVE: editing any recallAtK point downward makes property 2 red`);
  }

  if (bad.length) {
    console.error(`\ncheck_pool_recall_curve: FAILED — ${bad.length} problem(s) with the `
      + `base rate the selector is told:\n`);
    for (const b of bad) console.error(`  - ${b}`);
    process.exit(1);
  }
  console.log(`check_pool_recall_curve: ok — n=${n} held-out founders, monotone over `
    + `K=${POOL_RECALL_KS[0]}..${deepest}, covers the late seam (${VERDICT_POOL}), the early `
    + `seam (${SELECT_DEPTH}) and the published table (6).`);
  console.log(`  P(won in first 6)=${((poolRecallAt(6) ?? 0) * 100).toFixed(1)}% · `
    + `first ${VERDICT_POOL}=${((poolRecallAt(VERDICT_POOL) ?? 0) * 100).toFixed(1)}% · `
    + `first ${SELECT_DEPTH}=${((poolRecallAt(SELECT_DEPTH) ?? 0) * 100).toFixed(1)}%`);
  console.log(`  ${corpusLine}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
