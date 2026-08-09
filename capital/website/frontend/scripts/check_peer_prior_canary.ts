// Does the peer prior still contain the funds companies actually won?
//
// ── The merge this exists to have caught ───────────────────────────────────
// On 2026-08-08 `peerPrior.generated.json` was regenerated. The generator was
// unchanged, the corpus was live, and the new artifact was a correct rendering
// of it -- `emit_peer_prior.py --write` reproduces the committed file to 254 of
// 260 cells. It still cost ten graded cases: `check_recall_floor` fell to 81.8%
// on `traced:exact_attribution` against an 84 floor, and stayed red for a day.
//
// Nothing in the merge ritual could see it. Compile and typecheck ran on some
// fifteen merges; the floor ran on none of them, because it needs DATABASE_URL
// and VOYAGE_KEY, takes three and a half minutes, and CI must never hold those
// credentials. A signal that expensive gets skipped, and a skipped signal
// protects nothing.
//
// This is the cheap one. TWO COMMITTED JSON FILES, no database, no model call,
// no network: for every pair in the answer key, is the fund that company won
// present in its own `country|sector` cell of the prior, and how early? On the
// merge above the plain in-cell share moved 69% -> 47%, and the number floored
// below moved 97.4 -> 92.7 on the population that regressed. Three times the
// floor's signal, in under a second, and it runs in `npm run check` and in CI.
//
// ── What it does NOT measure, stated so nobody mistakes it ─────────────────
// This is not recall. It asks only whether the answer is IN the cell and how
// early -- `applyPeerPrecedence` reorders the rows the founder's screen already
// admitted, so a prior that contains the right fund can still lose it to the
// pool, the gates or the ranker. `check_recall_floor` remains the acceptance
// test. This is the smoke alarm that fires before anyone opens the door.
//
//   npx tsx scripts/check_peer_prior_canary.ts
import { readFileSync } from "fs";
import path from "path";
import { ACTIVE_RECALL_SET, namedAncestor, type RecallRow } from "./recallSet";

const DIR = path.join(__dirname, "..", "lib", "intelligence");
const PRIOR = "peerPrior.generated.json";

/** The visible slots. `applyPeerPrecedence` fills the table from the front of
 *  the cell, so an answer sitting at rank 40 is in the artifact and not in the
 *  founder's five. Both are measured; only the second is floored, because it is
 *  the one that moved when the artifact broke. */
const VISIBLE = 5;

/** Regime, by the SAME derivation `reattributeMissingAnswers` uses -- the id
 *  convention `<parent>__<child>`, one definition, imported rather than
 *  restated. `check_recall_floor` asserts that convention against the live
 *  corpus every run, so this file inherits that guarantee instead of needing
 *  a corpus of its own. That is what keeps it credential-free. */
const regime = (id: string) => namedAncestor(id) ?? id;

/** Floors, per population, on the REGIME of the won fund inside the cell's
 *  visible slots. Tune split only; holdout is printed and not floored, because
 *  a floor on a holdout is how a holdout stops being one.
 *
 *  ── Calibration, four artifacts, one command each ────────────────────────
 *  Every figure below is this file's own output. There is no sampling in it:
 *  the whole split is scored from two committed files, so the same input gives
 *  the same number to the decimal, every time, on any machine.
 *
 *                                     exact_attribution   original join
 *      pre-merge artifact                    97.4              71.9
 *      the regression (blended counts)       92.7              79.3
 *      exact leaves first, inferred after    98.7              69.3
 *      SHIPPED (interleaved)                 98.3              81.3
 *
 *  ── Why regime and not the exact instrument ──────────────────────────────
 *  The exact-id share reads 65.6 / 33.0 / 39.0 across the first, second and
 *  fourth of those. It falls on the regression and does NOT come back on the
 *  fix, because the corpus genuinely no longer places those awards on the
 *  leaves the key names -- no ranking can restore an id the split cannot
 *  produce. The regime share is the one that tracks `REGIME@5`, which is what
 *  `check_recall_floor` actually grades, so it is the one floored. The exact
 *  share is printed on every line anyway: it is the loudest description of the
 *  corpus fact underneath all of this.
 *
 *  ── The margins ─────────────────────────────────────────────────────────
 *  Three points under the shipped measurement, and the first floor is set so
 *  that IT WOULD HAVE CAUGHT THE MERGE IT IS NAMED AFTER: 92.7 is below 95.
 *  A margin derived from the size of that move instead (4.7 points, so a floor
 *  at 93) would have sat under the regression and let it through, which is the
 *  trap a margin convention can walk into when the only movement on record is
 *  the failure itself.
 *
 *  Three is defensible on its own terms, and only because of the generator
 *  change that ships with this file: a cell's visible slots now alternate
 *  between placed and inferred evidence, so their composition no longer depends
 *  on what share of the corpus happens to be placeable. That was the quantity
 *  that moved 34% -> 44% under this artifact and took ten graded cases with it.
 *  With it out of the loop, a legitimate refresh has no known mechanism for
 *  moving these numbers several points, and if one appears it is worth a human
 *  rather than a wider margin.
 *
 *  Raise them when the measurement rises. Never lower them to accommodate a
 *  regeneration. */
const FLOOR: Record<string, number> = {
  "exact_attribution": 95,   // measured 98.3 on the shipped artifact
  "original join": 78,       // measured 81.3
};

type Cell = Record<string, string[]>;

function main() {
  const prior = JSON.parse(readFileSync(path.join(DIR, PRIOR), "utf8")) as Cell;
  const rows = JSON.parse(
    readFileSync(path.join(DIR, ACTIVE_RECALL_SET), "utf8")) as RecallRow[];

  // The TUNE split, the same population `check_recall_floor` grades, so the two
  // numbers can be read against each other. Holdout is reported and not
  // floored -- floors on a holdout are how a holdout stops being one.
  const seen = new Map<string, {
    n: number; inCell: number; visible: number; regimeVisible: number;
  }>();
  for (const r of rows) {
    const key = `${r.split}:${r.traced ?? "original join"}`;
    const m = seen.get(key)
      ?? { n: 0, inCell: 0, visible: 0, regimeVisible: 0 };
    const cell = prior[`${r.country}|${r.sector ?? "other"}`] ?? [];
    const top = cell.slice(0, VISIBLE);
    m.n++;
    if (cell.includes(r.instrument)) m.inCell++;
    if (top.includes(r.instrument)) m.visible++;
    if (top.some((id) => regime(id) === regime(r.instrument))) m.regimeVisible++;
    seen.set(key, m);
  }

  const cells = Object.keys(prior).length;
  const entries = Object.values(prior).reduce((a, v) => a + v.length, 0);
  console.log(`peer prior canary: ${PRIOR} — ${cells} cells, ${entries} entries`);
  console.log(`  graded against ${ACTIVE_RECALL_SET}, ${rows.length} pairs, `
    + "no corpus and no credentials");

  const failed: string[] = [];
  for (const [key, m] of [...seen].sort()) {
    const pct = (x: number) => (100 * x) / m.n;
    const [split, pop] = key.split(/:(.*)/);
    const floor = split === "tune" ? FLOOR[pop] : undefined;
    const got = pct(m.regimeVisible);
    const bad = floor !== undefined && got < floor;
    if (bad) failed.push(key);
    console.log(
      `    ${bad ? "FAIL" : "ok  "} regime@${VISIBLE} ${got.toFixed(1)}% `
      + `(floor ${floor ?? "-"})  ${key}, n=${m.n}`
      + `   [exact@${VISIBLE} ${pct(m.visible).toFixed(1)}%, `
      + `in cell ${pct(m.inCell).toFixed(1)}%]`);
  }

  if (failed.length) {
    console.error(
      `\ncheck_peer_prior_canary: FAILED on ${failed.join(", ")}.\n`
      + "The peer prior no longer carries the funds these companies actually\n"
      + "won into the slots a founder sees. That is a ranking regression even\n"
      + "when the artifact is a CORRECT rendering of today's corpus — a correct\n"
      + "rendering is exactly what caused the one this check is named after.\n\n"
      + "  rebuild:  python3 ETL/terms/emit_peer_prior.py --exclude-recall-set --write\n"
      + "  confirm:  npx tsx scripts/check_recall_floor.ts   (needs credentials)\n");
    process.exit(1);
  }
  console.log("check_peer_prior_canary: ok — every floored population is above "
    + "its floor.");
}

main();
