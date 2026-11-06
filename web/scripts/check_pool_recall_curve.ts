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
// Property 4 needs the live corpus.
//
// ── "Skipped because nobody said so" is not a state this may be in ────────
// It used to load the environment and then test `process.env.DATABASE_URL`
// itself: with credentials, four properties; without, three properties and a
// line saying the fourth did not run — exit 0 either way. That is the shape
// `check_recall_floor` was rewritten to remove, in a quieter register. A
// missing DATABASE_URL is ambiguous between "there is deliberately no
// database" and "the keys did not load", and a checkout where `.env.local` is
// gitignored produces the second while printing the first.
//
// So the two are now told apart by `requireCredentials`, which is where this
// repo keeps that distinction: `NO_PG=1` is the declaration that there is no
// database, and property 4 is skipped ON PURPOSE and says so. Anything else
// ENDS non-zero rather than reporting green on three properties out of four.
//
//   npx tsx scripts/check_pool_recall_curve.ts
//   NO_PG=1 npx tsx scripts/check_pool_recall_curve.ts   # properties 1-3 only
//   PROVE=1 npx tsx scripts/check_pool_recall_curve.ts
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
const CREDENTIALS = requireCredentials("check_pool_recall_curve", ["DATABASE_URL"]);

import {
  depthLabel, depthPhrase, POOL_RECALL_FILE, POOL_RECALL_KS, poolRecallAt, poolRecallAtDepth,
  poolRecallN, resetPoolRecall,
} from "../lib/intelligence/poolRecall";
import { generatedArtifactFailures } from "../lib/intelligence/generatedArtifact";
// SELECT_DEPTH from the LEAF module, not from `agentSelect` which re-exports
// it. Reading it through the ranker pulled the Anthropic client and the corpus
// layer in behind one number, which made this guard a reacher of VOYAGE_KEY it
// never uses — `check_env_loader` was red on exactly that, correctly.
import { SELECT_DEPTH, VERDICT_POOL } from "../lib/intelligence/caps";

/** The curve is a base rate. Below this many founders it is anecdote, and a
 *  model quoted an anecdote as a measured frequency is being misled precisely
 *  as it was before. */
const MIN_N = 200;

/**
 * PROVE THAT PROPERTY 4 CAN GO RED ON THE EVENT IT NAMES.
 *
 * ██ The old property could not, and nothing said so. ██ That is the whole
 * lesson of this file: a guard is not known to enforce anything until the
 * failure it exists to catch has been CONSTRUCTED and the guard has rejected
 * it. Until 2026-08-13 the only `PROVE` line here was a sentence asserting that
 * a different property was enforceable.
 *
 * The mutation is the real event, not a stand-in for it: 53 open leaves are
 * given a past `scheme_end_date`, which is exactly what commit `250e8a74` did
 * to `bdns_es_ayudas` on 2026-08-12. Applied IN MEMORY to the hydrated corpus —
 * `loadDbInstruments()` returns the cache by reference — so this writes nothing
 * to Postgres and restores every row it touched.
 *
 * It reports BOTH readings side by side, because the point is not that the new
 * one goes red; it is that the old one CANNOT.
 */
async function proveClosureIsCaught(): Promise<void> {
  const { corpusProvenance, loadDbInstruments } = await import("../lib/intelligence/corpus");
  const { offerableSubject, subjectDrift } = await import("./corpusSubject");

  const before = offerableSubject();
  const countBefore = corpusProvenance().instruments;

  // Rows that are open today and would close if their window had already shut.
  const rows = loadDbInstruments() as unknown as
    { id: string; schemeEndDate?: string | null; schemeEndBasis?: string | null }[];
  const open = rows.filter((r) => !r.schemeEndDate);
  const victims = open.slice(0, 53);
  const restore = victims.map((r) => [r, r.schemeEndDate, r.schemeEndBasis] as const);
  for (const r of victims) { r.schemeEndDate = "2020-12-30"; r.schemeEndBasis = "call_deadline"; }

  const after = offerableSubject();
  const countAfter = corpusProvenance().instruments;
  const drift = subjectDrift(before, after);

  for (const [r, d, b] of restore) { r.schemeEndDate = d ?? null; r.schemeEndBasis = b ?? null; }

  console.log(`  PROVE property 4: closed ${victims.length} open leaves in memory `
    + `(the 2026-08-12 event).`);
  console.log(`    OLD reading  corpusProvenance().instruments ${countBefore} -> ${countAfter}`
    + `  ${countBefore === countAfter
      ? "██ UNMOVED — this is why the guard was green on a stale curve ██"
      : "moved"}`);
  console.log(`    NEW reading  offerable ${before.n} -> ${after.n}, digest `
    + `${before.digest} -> ${after.digest}  ${drift ? "RED" : "██ UNMOVED — NOT ENFORCING ██"}`);
  // A restore that did not restore would leave every figure below measured on a
  // corpus this function invented, which is worse than the defect it proves.
  const restored = offerableSubject();
  if (restored.digest !== before.digest) {
    throw new Error("PROVE: the in-memory closure was not fully reverted — "
      + `digest ${restored.digest} != ${before.digest}. Every figure after this `
      + "point would be measured on a corpus this proof invented.");
  }
  if (!drift) {
    throw new Error("PROVE: closing 53 leaves did not move the offerable subject. "
      + "Property 4 is not enforcing the thing it names.");
  }
}

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
      + `Re-run scripts/emit_pool_recall_curve.ts on the full holdout split.`);
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
    // `AGENT_SELECT_DEPTH=all` is Infinity, and it is the ONE depth that needs
    // no coverage: the curve is measured to K=250 and is flat from K=150,
    // because 150 rows is already every row every founder has. So the terminal
    // point IS the whole-pool figure, `poolRecallAt` returns it by its stated
    // clamp rather than by extrapolating, and the sentence the model reads is
    // exactly true. Failing here would red the build on the only arm that
    // cannot quote a number nobody measured.
    if (!Number.isFinite(k)) continue;
    if (k > deepest) {
      bad.push(`${what} is ${k} rows and the curve stops at K=${deepest}. `
        + `poolRecallAt refuses to extrapolate, so the prompt would quote the `
        + `figure for ${deepest} rows while showing ${k}.`);
      continue;
    }
    // ── "COVERS" MEANT "IS IN RANGE", AND THAT IS NOT COVERAGE (wsGM) ──────
    // `poolRecallAt` is LINEAR BETWEEN MEASURED POINTS. So a seam at a depth
    // this curve never measured quotes the model a base rate nobody produced —
    // straight-line-guessed between two that were — while this check printed
    // "covers the late seam (60)" underneath it. `POOL_RECALL_KS` holds 50 and
    // 75 and nothing between them; a pool of 60 reads 77.7% because that is
    // where the line happens to pass, and recall between two measured depths is
    // not a line.
    //
    // That is the same defect as the corrected constant this whole module
    // exists to replace, one level down: a number in the prompt with no
    // measurement behind it. The fix for an uncovered depth is to MEASURE it —
    // add it to `POOL_RECALL_KS` and re-run `emit_pool_recall_curve.ts` — never to widen
    // this test.
    //
    // The property, for any depth this or any future seam takes: the figure the
    // prompt quotes must be a point on the curve, not a point on a chord of it.
    if (!POOL_RECALL_KS.includes(k)) {
      const below = [...POOL_RECALL_KS].filter((x) => x < k).pop();
      const above = POOL_RECALL_KS.find((x) => x > k);
      bad.push(`${what} is ${k} rows and the curve was never measured there — the nearest `
        + `measured points are K=${below} and K=${above}. \`poolRecallAt\` interpolates `
        + `LINEARLY between them, so the selector would be told a base rate nobody has `
        + `measured, about the exact list it is being shown. Add ${k} to POOL_RECALL_KS `
        + `and re-run scripts/emit_pool_recall_curve.ts; do not relax this.`);
    }
  }

  // 4. IT WAS MEASURED ON THIS CORPUS.
  //
  // ── WHAT "THIS CORPUS" MEANS, restated 2026-08-13 (wsGN) ─────────────────
  // ██ THIS PROPERTY COULD NOT GO RED ON THE ONE EVENT IT NAMES. ██
  //
  // It compared `corpusProvenance().instruments`, which is
  // `dbInstrumentsCache.length` — every hydrated row, including the frameworks,
  // the parents and the closed calls. The paragraph at the top of this file
  // says the property is about "a country load or a PUBLISHABILITY CHANGE", and
  // a publishability change moves that number by exactly zero.
  //
  // It happened. On 2026-08-12 commit `250e8a74` closed 53 Spanish calls whose
  // windows had shut; `publishableInstruments()` went 837 -> 784; the hydrated
  // row count stayed 1,088; this guard printed "ok"; and the selector prompt
  // went on quoting the model a base rate measured over a pool that no longer
  // existed. The curve degraded into exactly the confident false claim the top
  // of this file says it exists to remove.
  //
  // The reading is now the SUBJECT rather than a number the subject is derived
  // from: a digest of the offerable set itself, from `scripts/corpusSubject.ts`,
  // which the emitter stamps through the same function. A digest is a function
  // of everything the set is a function of — including `today()`, which the
  // offerable set reads and a row count cannot represent at all — so a filter,
  // a clock or a load that arrives later cannot be omitted from it.
  //
  // Strict identity, and NOT a tolerance band on the count. Three reasons, in
  // order of weight: this artifact's whole job is to make a sentence to a model
  // TRUE, and true is not a band; `emit_pool_recall_curve.ts` is free by construction, so
  // the red is cleared by one command rather than by a judgement; and a band
  // would be a number nobody has derived, chosen here to keep a build green,
  // which is the act this repo forbids everywhere else.
  let corpusLine: string;
  if (CREDENTIALS === "offline") {
    corpusLine = "corpus staleness NOT CHECKED — NO_PG=1, this run has DECLARED that "
      + "there is no database. Properties 1-3 ran; property 4 did not.";
  } else {
    const { hydrateDbInstruments, corpusProvenance } = await import("../lib/intelligence/corpus");
    const { loadGenerated } = await import("../lib/intelligence/generatedArtifact");
    const { formatSubject, offerableSubject, parseSubject, subjectDrift } =
      await import("./corpusSubject");
    await hydrateDbInstruments();
    if (process.env.PROVE) await proveClosureIsCaught();
    const prov = corpusProvenance();
    const doc = loadGenerated<{ corpus?: string; offerable?: string }>(POOL_RECALL_FILE, {});
    const live = offerableSubject();
    const recorded = parseSubject(String(doc.offerable ?? ""));
    corpusLine = `measured on ${doc.corpus || "(unrecorded)"} / `
      + `${doc.offerable || "(no offerable stamp)"}, live ${prov.source} `
      + `instruments=${prov.instruments} / ${formatSubject(live)}`;
    if (!recorded) {
      // NOT a pass, and not a skip. A curve carrying only the old row-count
      // stamp is a curve whose subject was never recorded, so this property
      // cannot be evaluated on it — and "cannot be evaluated" is the state this
      // file's own header refuses to report as green.
      bad.push(`the curve records no offerable-set stamp (${doc.offerable ?? "absent"}), `
        + `only the row count "${doc.corpus ?? ""}". That count cannot see a closure `
        + `pass: 53 calls closed on 2026-08-12, the offerable set moved 837 -> 784 and `
        + `the count did not move at all. Re-cut the curve so it records the set it was `
        + `measured over: npx tsx scripts/emit_pool_recall_curve.ts`);
    } else {
      const drift = subjectDrift(recorded, live);
      if (drift) {
        bad.push(`the curve was measured over a DIFFERENT set of offerable funds than `
          + `this corpus holds: ${drift}.\n      Every accessible pool is drawn from that `
          + `set, so every point on the curve is, and the selector is being told a base `
          + `rate about funds it is not ranking. Re-run scripts/emit_pool_recall_curve.ts (free by `
          + `construction — it deletes ANTHROPIC_API_KEY before importing anything).`);
      }
    }
  }

  if (process.env.PROVE) {
    console.log(`  PROVE: n=${n}, K=${POOL_RECALL_KS.join(",")}`);
    // ── WHAT A `PROVE` MODE IS FOR, and what this one used to be ───────────
    // The line here read:
    //
    //   console.log("PROVE: editing any recallAtK point downward makes property 2 red")
    //
    // which is a CLAIM ABOUT the guard printed by the guard. It proves nothing,
    // it cost nothing to keep true, and it stayed true while property 4 — the
    // one that mattered — was blind. That is the shape one level up: a reading
    // (a printed sentence) that cannot distinguish a guard that works from a
    // guard that does not.
    //
    // A property is only known to be enforceable when a mutation that ought to
    // make it red HAS BEEN RUN and did. `proveClosureIsCaught` above does that
    // for property 4 against the real event. Property 2 gets the same treatment
    // here: the monotonicity test is applied to a curve that dips, in memory,
    // and must reject it.
    const dipping = [...POOL_RECALL_KS.map((k) => poolRecallAt(k) ?? 0)];
    if (dipping.length >= 2) {
      dipping[dipping.length - 1] = 0;
      let caught = false;
      let prev2 = 0;
      for (const v of dipping) { if (v < prev2 - 1e-9) caught = true; prev2 = v; }
      console.log(`  PROVE property 2: a curve whose last point is forced to 0 is `
        + `${caught ? "REJECTED" : "██ ACCEPTED — the monotonicity test is not enforcing ██"}`);
      if (!caught) bad.push("PROVE: the monotonicity test accepted a curve that dips.");
    }
  }

  if (bad.length) {
    console.error(`\ncheck_pool_recall_curve: FAILED — ${bad.length} problem(s) with the `
      + `base rate the selector is told:\n`);
    for (const b of bad) console.error(`  - ${b}`);
    process.exit(1);
  }
  console.log(`check_pool_recall_curve: ok — n=${n} held-out founders, monotone over `
    + `K=${POOL_RECALL_KS[0]}..${deepest}, covers the late seam (${depthLabel(VERDICT_POOL)}), the early `
    + `seam (${depthLabel(SELECT_DEPTH)}) and the published table (6).`);
  console.log(`  P(won in first 6)=${((poolRecallAt(6) ?? 0) * 100).toFixed(1)}% · `
    + `${depthPhrase(VERDICT_POOL)}=${((poolRecallAtDepth(VERDICT_POOL) ?? 0) * 100).toFixed(1)}% · `
    + `${depthPhrase(SELECT_DEPTH)}=${((poolRecallAtDepth(SELECT_DEPTH) ?? 0) * 100).toFixed(1)}%`);
  console.log(`  ${corpusLine}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
