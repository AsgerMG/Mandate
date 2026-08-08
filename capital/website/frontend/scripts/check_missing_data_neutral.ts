// Fails the build when the stand-in for missing data stops being neutral.
//
// ── What this guards, and the defect it exists to prevent a second of ──────
// `sectorFit` is the one ranking term on the founder's table that is ADDED
// rather than multiplied. Its no-data value was the constant 0.5, under a
// docstring calling that neutral. Over the corpus of 2026-08-08 the funds that
// DO carry sector history score mean 0.256 and median 0.084, so 0.5 sat at the
// 79th percentile: every fund we held no funding history for was scored above
// four fifths of the funds we held history for, on the one component built
// entirely from funding history.
//
// It was invisible for three reasons worth stating, because all three recur:
//
//   1. It is a PROMOTION granted for an ABSENCE, so nothing looks broken. The
//      fund appears on the table with a plausible name.
//   2. The rows it lands on are exactly the rows the answer key cannot grade.
//      The recall set is built from awards that were made, so a leaf with zero
//      awards can never be an answer under any ranker — 0 of 88 against 297 of
//      714 (`scripts/probe_standalone_pool.ts`). EXACT@5 can neither reward the
//      promotion nor punish it.
//   3. It concentrated in one market. 94 leaves carry no sector history and 88
//      of them are Spanish, so no corpus-wide average ever moved.
//
// `lib/intelligence/sectorNeutral.test.ts` holds the property against a change
// to the CODE. This holds it against a change to the CORPUS, which is the half
// a hand-built fixture cannot see.
//
// ── What is measured ──────────────────────────────────────────────────────
// The stand-in is the mean of the candidates whose history we do hold. Mean, not
// median, and the choice is a real one: mean-imputation leaves the fund's
// EXPECTED SCORE equal to the population's, which is unbiased; the MEDIAN is
// what would leave its expected RANK equal. On a symmetric population they
// coincide. This population is heavily right-skewed — most funds have almost
// none of their history in any one sector, a few have nearly all of it — so they
// do not, and the mean sits above the median.
//
// That is acceptable while the gap is moderate and it is exactly what can drift.
// So this prints the stand-in's percentile among the scores it stands in for, on
// every run, and fails when it leaves the band. Leaving the band does not mean
// the code is wrong; it means the mean has stopped being a defensible stand-in
// for this corpus and the mean-versus-median choice has to be made again with
// the new numbers. The message says so.
//
// Do NOT satisfy this check by narrowing the corpus, by excluding a country, or
// by hardcoding the stand-in. A literal fails the unit test above.
import { loadEnvLocal } from "./loadEnv";
loadEnvLocal();

import { sectorFit, sectorFitScorer } from "../lib/intelligence/fit";
import { SECTOR_OPTIONS } from "../lib/intelligence/types";

/** How far from the middle the stand-in may sit among the scores it replaces.
 *  Wide on purpose. A tight band on a corpus statistic with no correct value is
 *  a guard that cries wolf on routine data work, and a guard that cries wolf
 *  gets bumped by one and forgotten — which is how POOL_LEAVES_PER_CHANNEL
 *  became the top defect three times. This fires on a REGIME CHANGE in the
 *  corpus, not on a Tuesday. */
const BAND: [number, number] = [0.15, 0.85];
/** Where the constant this replaced sat. Printed, never compared against: the
 *  point is not to be better than 0.5, it is to be solved rather than stated. */
const OLD_CONSTANT = 0.5;

async function main() {
  // The committed snapshot, never a laptop's DATABASE_URL — the same reason
  // check_leaf_cap.ts does it, and the same dependency: this is deterministic
  // only because check_corpus_currency asserts the snapshot and Postgres agree,
  // and `npm run check` runs that first.
  delete process.env.DATABASE_URL;
  const { publishableInstruments } = await import("../lib/intelligence/corpus");
  const pubs = publishableInstruments();

  const rows: { sector: string; known: number; blind: number; neutral: number; pctile: number }[] = [];
  for (const { value: sector } of SECTOR_OPTIONS) {
    const known: number[] = [];
    for (const i of pubs) {
      const s = sectorFit(i.sectorMix, sector);
      if (s !== null) known.push(s);
    }
    if (!known.length) continue;
    // The scorer's own answer, never a second implementation of it here. Two
    // computations of one quantity is the duplication this repo keeps finding
    // as a defect; the check must fail when the SHIPPED function drifts.
    const neutral = sectorFitScorer(pubs, sector)(null);
    known.sort((a, b) => a - b);
    // Midrank, so a population with mass exactly at the stand-in is not counted
    // entirely on one side of it.
    const below = known.filter((x) => x < neutral).length;
    const equal = known.filter((x) => x === neutral).length;
    rows.push({
      sector, known: known.length, blind: pubs.length - known.length, neutral,
      pctile: (below + equal / 2) / known.length,
    });
  }

  const worst = rows.slice().sort(
    (a, b) => Math.abs(b.pctile - 0.5) - Math.abs(a.pctile - 0.5))[0];
  const out = rows.filter((r) => r.pctile < BAND[0] || r.pctile > BAND[1]);

  console.log(
    `check_missing_data_neutral: ${rows.length} founder sector(s) over ` +
    `${pubs.length} publishable leaves.`);
  for (const r of rows.sort((a, b) => b.pctile - a.pctile)) {
    console.log(`  ${r.sector.padEnd(24)} stand-in ${r.neutral.toFixed(3)}` +
      `  at percentile ${(100 * r.pctile).toFixed(0).padStart(3)}` +
      `  of ${String(r.known).padStart(4)} scored leaves` +
      `  (${r.blind} have no history)`);
  }

  if (out.length) {
    console.error(
      `\ncheck_missing_data_neutral: THE STAND-IN FOR MISSING DATA IS NO LONGER ` +
      `NEUTRAL.\n` +
      out.map((r) => `    ${r.sector}: ${r.neutral.toFixed(3)} sits at the ` +
        `${(100 * r.pctile).toFixed(0)}th percentile of the leaves we DO hold ` +
        `history for`).join("\n") +
      `\n\n  A fund we know nothing about is being ranked as if we knew ` +
      `something.\n` +
      `  The code is not necessarily wrong — the MEAN is only a defensible ` +
      `stand-in\n  while the population is not too skewed, and this says it now ` +
      `is. Re-make the\n  mean-versus-median choice in \`sectorFitScorer\` ` +
      `against these numbers and\n  record it there. Do not narrow the corpus, ` +
      `do not exclude a country, and do\n  not hardcode the value: a literal ` +
      `fails lib/intelligence/sectorNeutral.test.ts.`);
    process.exit(1);
  }

  console.log(
    `  ok — furthest from the middle: ${worst.sector} at the ` +
    `${(100 * worst.pctile).toFixed(0)}th percentile, band ` +
    `${100 * BAND[0]}-${100 * BAND[1]}. ` +
    `(The constant this replaced, ${OLD_CONSTANT}, sat at the 79th.)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
