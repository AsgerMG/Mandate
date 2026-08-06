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

import { hydrateDbInstruments, loadDbInstruments } from "../lib/intelligence/corpus";
import { computeVerdict } from "../lib/intelligence/pipeline";

/** TWO sets, because one of them cannot see a third of the funds we show.
 *
 *  `__recallSet.json` was traced with joins that can never reach a
 *  programme-split child, so 234 instruments are named by none of its pairs
 *  (see ETL/terms/extend_recall_set.py). Guarding only on it would enshrine
 *  that blind spot in CI: any change that helps those funds costs slots here
 *  and reads as a regression. `__recallSetPlus.json` names 407 instruments and
 *  is where the population the old set cannot see is protected.
 *
 *  Both are guarded, and a regression on EITHER fails the build. Neither is
 *  allowed to be the only opinion.
 *
 *  Floors sit just under the measured numbers, never at an aspiration. The pool
 *  floor is the one correctness floor here rather than a ranking score -- a fund
 *  the writer never sees cannot be advised on at all -- so it is set hard;
 *  EXACT@5 and REGIME@5 sit further below because both carry real sampling
 *  noise.
 *
 *  `__recallSet.json`'s regime floor came DOWN from 85 with the corrected
 *  peer-prior join (bf3056d). That is a deliberate, argued cost: the join gives
 *  the programme children slots this set cannot credit, and the same change
 *  takes the plus set's regime from 74% to 89%. The floor below it is what
 *  stops that cost being paid twice. */
const SETS = [
  // Measured on this build, n=150 tune, with the corrected query below:
  //   __recallSet.json      pool 91  EXACT@5 36  REGIME@5 85
  //   __recallSetPlus.json  pool 83  EXACT@5 26  REGIME@5 91
  // Floors sit ~5 points under, the same margin the single-set gate used.
  { file: "__recallSet.json", floor: { pool: 85, exact5: 30, regime5: 80 } },
  { file: "__recallSetPlus.json", floor: { pool: 78, exact5: 21, regime5: 85 } },
];
// FIXED, and deliberately not configurable. At n=120 this same build measures
// 97/31/68 and at n=150 it measures 97/37/75 -- six points of binomial noise on
// the same code. A gate whose verdict depends on how many pairs you happened to
// run is not a gate, so the sample is pinned and the floors are calibrated to
// it. Use `measure_recall.ts` to explore at other sizes.
const N = 150;

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
  for (const { file, floor: FLOOR } of SETS) {
  const all = JSON.parse(readFileSync(
    path.join(process.cwd(), "lib", "intelligence", file), "utf8")) as any[];
  // Stride, not slice. The set is grouped by mode, so the first N pairs are
  // nearly all `project` -- which measures 63% exact against `profile`'s 22%,
  // and the first draft of this gate read 70% where the true figure is 49%. A
  // floor that samples the easy half is worse than no floor: it passes while
  // the population it was written to protect regresses. Deterministic, so the
  // number is comparable between runs.
  const tune = all.filter((r) => r.split === "tune");
  const step = Math.max(1, Math.floor(tune.length / N));
  const set = tune.filter((_, i) => i % step === 0).slice(0, N);

  let pool = 0, exact5 = 0, regime5 = 0;
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
    if ((v.candidateInstrumentIds ?? []).includes(t.instrument)) pool++;
    if (top5.includes(t.instrument)) exact5++;
    if (top5.some((id) => (byId.get(id)?.parentId ?? id) === wantRegime)) regime5++;
  }

  const got = {
    pool: (100 * pool) / set.length,
    exact5: (100 * exact5) / set.length,
    regime5: (100 * regime5) / set.length,
  };
  const failed = (Object.keys(FLOOR) as (keyof typeof FLOOR)[])
    .filter((k) => got[k] < FLOOR[k]);

  console.log(`  ${file}`);
  for (const k of Object.keys(FLOOR) as (keyof typeof FLOOR)[]) {
    const bad = got[k] < FLOOR[k];
    console.log(`    ${bad ? "FAIL" : "ok  "} ${k.padEnd(8)} ${got[k].toFixed(0)}% ` +
                `(floor ${FLOOR[k]}%)`);
  }
  if (failed.length) {
    console.error(`\ncheck_recall_floor: FAILED on ${failed.join(", ")} over ` +
                  `${set.length} tune pairs of ${file}.`);
    console.error("A ranking change that loses the fund a company actually won is");
    console.error("a regression even when every other check is green.");
    anyFailed = true;
  }
  }
  if (anyFailed) process.exit(1);
  console.log(`check_recall_floor: ok — ${N} tune pairs per set, all floors met.`);
}

main();
