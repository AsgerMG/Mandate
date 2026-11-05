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
// ── What is measured, and how the statistic was chosen ────────────────────
// WS-BB shipped the MEAN and left the choice open here, in the correct terms:
// mean-imputation leaves the fund's EXPECTED SCORE equal to the population's,
// which is unbiased; the MEDIAN leaves its expected RANK equal; they coincide on
// a symmetric population and this one is heavily right-skewed. It said the check
// would fire if the skew grew, and that the answer would then be to re-make the
// choice against the new numbers rather than to widen the band.
//
// IT FIRED, on the corpus of 2026-08-09, and the choice has been re-made:
//
//     space             mean 0.020 → 91st percentile of 673 scored leaves
//     defense_security  mean 0.029 → 88th
//
// That is the original defect at one tenth the size. Where nine leaves in ten
// have never funded anything in a sector, the handful of specialists drag the
// mean above the entire mode, and a fund we hold no history for is promoted over
// the funds we do. So the statistic is now the MEDIAN, which is rank-preserving
// by construction, and every sector sits at the 44th-50th percentile.
//
// A median of zero does NOT bury the unknown, and the reason is ties: it scores
// what the 91% score, so the term takes the same value for all of them and drops
// out of the comparison, which is neutrality for an added term.
//
// ── Why the band is ASYMMETRIC, which is the finding in one line ───────────
// The two ways to be non-neutral are not equally harmful and not equally likely.
//
//   ABOVE the middle is the failure that shipped, twice — a PROMOTION granted
//   for an ABSENCE, on the one component built entirely from funding history.
//   Nothing looks broken when it happens. Bounded tightly.
//
//   BELOW the middle is the tie artifact above, and mostly benign: in a sector
//   where most leaves score zero the median IS zero and midrank puts it near
//   0.45 by arithmetic, not by defect. Bounded loosely — but bounded, because a
//   stand-in at the 2nd percentile would be zeroing an unknown, which is the
//   opposite error and the one the original 0.5 was written to avoid.
//
// The upper bound is what catches a regression: the mean arm fails it on the two
// sectors above, and a constant fails it almost everywhere.
//
// Do NOT satisfy this check by narrowing the corpus, by excluding a country, or
// by hardcoding the stand-in. A literal fails the unit test above.
import { loadEnvLocal } from "./loadEnv";
loadEnvLocal();

import { SECTOR_NEUTRAL_ARM, sectorFit, sectorFitScorer } from "../lib/intelligence/fit";
import { SECTOR_OPTIONS } from "../lib/intelligence/types";

/** Where the stand-in may sit among the scores it replaces. Asymmetric, for the
 *  reason set out at the head of this file: above the middle is the defect,
 *  below it is mostly the tie artifact.
 *
 *  Observed on 2026-08-09 with the median: 0.44 to 0.50 across all eleven
 *  sectors. The upper bound is therefore ten points of headroom above the widest
 *  observed value, not a number chosen to make today pass — and it is still
 *  tight enough to fail the mean (0.91, 0.88) and a constant. The lower bound is
 *  set where "tied with the mode" ends and "buried beneath it" begins.
 *
 *  A guard that cries wolf gets bumped by one and forgotten — which is how
 *  POOL_LEAVES_PER_CHANNEL became the top defect three times. This one cannot
 *  drift on routine data work, because the median is rank-neutral whatever the
 *  corpus does; it fires when the CODE changes. */
const BAND: [number, number] = [0.20, 0.60];
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
    const high = out.filter((r) => r.pctile > BAND[1]);
    console.error(
      `\ncheck_missing_data_neutral: THE STAND-IN FOR MISSING DATA IS NO LONGER ` +
      `NEUTRAL.\n` +
      `  (arm: ${SECTOR_NEUTRAL_ARM})\n` +
      out.map((r) => `    ${r.sector}: ${r.neutral.toFixed(3)} sits at the ` +
        `${(100 * r.pctile).toFixed(0)}th percentile of the leaves we DO hold ` +
        `history for`).join("\n") +
      (high.length
        ? `\n\n  ABOVE THE MIDDLE, which is the direction that has shipped as a ` +
          `defect twice.\n  A fund we hold no funding history for is outranking ` +
          `the funds we do, on the\n  one component built entirely from funding ` +
          `history — a promotion granted for\n  an absence. Nothing on the ` +
          `founder's table will look wrong.\n` +
          `\n  The likeliest cause is that \`sectorFitScorer\` has been changed ` +
          `back to a MEAN\n  or to a literal. The median is rank-preserving ` +
          `whatever the corpus does, so\n  routine data work cannot produce this.`
        : `\n\n  BELOW the middle, far enough that this is no longer the tie ` +
          `artifact: an\n  unknown is being BURIED rather than tied with the ` +
          `mode. That is the opposite\n  error and the one the original 0.5 was ` +
          `written to avoid. Check that the\n  population really is mostly ` +
          `zeroes before concluding the code is wrong.`) +
      `\n\n  Do not narrow the corpus, do not exclude a country, and do not ` +
      `hardcode the\n  value: a literal fails lib/intelligence/sectorNeutral.test.ts. ` +
      `Do not widen the\n  band — WS-BB left that instruction and WS-BB2 followed ` +
      `it by changing the\n  statistic instead, which is what fixed it.`);
    process.exit(1);
  }

  console.log(
    `  ok — furthest from the middle: ${worst.sector} at the ` +
    `${(100 * worst.pctile).toFixed(0)}th percentile, band ` +
    `${100 * BAND[0]}-${100 * BAND[1]}. ` +
    `(The constant this replaced, ${OLD_CONSTANT}, sat at the 79th.)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
