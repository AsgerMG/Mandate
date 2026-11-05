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

/** The measurement window, deliberately TIGHTER than anything that ships.
 *
 *  `applyPeerPrecedence` fills the table from the front of the cell, so an
 *  answer sitting at rank 40 is in the artifact and not on the founder's page.
 *  Both are measured; only the second is floored, because it is the one that
 *  moved when the artifact broke.
 *
 *  ── Why this is 5 while the product now shows 6 ───────────────────────────
 *  It read "the founder's five", which was true of the memo and never true of
 *  the instant screen (`DISPLAY_CAP` has been 6 throughout), and is now true of
 *  neither: `BRIEF_LIMITS.institutionsMax` is 6.
 *
 *  It stays 5, and the floors below are NOT re-derived, for a reason that is
 *  the opposite of inertia. Widening the window can only ADD hits, so every
 *  floor here would pass more easily at 6 than at 5 — a canary re-derived onto
 *  a wider window is a canary loosened without a single number moving, which is
 *  precisely the "floor that moves to accommodate" this file already warns
 *  about. Read it as: the artifact must keep the answer inside FIVE slots, and
 *  the sixth the product publishes is headroom this guard refuses to spend. */
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
 *  regeneration.
 *
 *  ── A THIRD population, 2026-08-09, and what it caught on arrival ────────
 *  `childless_family` is the answer key's new coverage of the 199 offerable
 *  leaves that are a family nobody split -- CDTI, Innovate UK, Bpifrance's
 *  innovation line. It arrived wearing `exact_attribution`'s label, and this
 *  check is what said so: that population read 98.3 -> 70.5 against a floor of
 *  95, on an artifact nobody had touched. Nothing had regressed. A different
 *  population had inherited a floor calibrated on another one. The pairs now
 *  carry their own `traced` value and `exact_attribution` reads 98.0 again.
 *
 *  This is the case for floors PER POPULATION rather than a headline, made by
 *  the check itself, on its first encounter with a population that did not
 *  exist when it was written.
 *
 *  ── It also priced the leak, which is the number worth remembering ───────
 *  The new key adds 2,018 companies no fitted artifact had ever excluded, and
 *  `ETL/lib/recall_holdout.py` discovers recall sets by glob -- so the fix is
 *  to REBUILD, and this check prices what the rebuild was worth:
 *
 *                              in cell        regime@5      (tune split)
 *      childless_family      88.4 -> 63.3   29.9 -> 24.7
 *      exact_attribution     39.8 -> 39.7   98.0 -> 99.5
 *      original join         66.9 -> 66.9   81.3 -> 78.9
 *
 *  Twenty-five points of in-cell share on the new population was the test
 *  companies voting for their own answers. Measuring the new key against the
 *  old artifact would have published that as coverage.
 *
 *  ── Why 24.7 is not a bad number ─────────────────────────────────────────
 *  It looks like a collapse next to 99.5 and it is not comparable to it. A
 *  childless family IS its own regime, so regime@5 and exact@5 are the same
 *  question for it and there is no sibling credit to be had: read against the
 *  EXACT column, which is the like-for-like one, these funds land 24.7 where
 *  `exact_attribution` lands 14.4. The population the key was blind to is the
 *  one the prior places best. */
/*  ── RE-DERIVED 2026-08-09 (workstream BS), against the ARTIFACT THAT NOW
 *     SHIPS: `__recallSetDoors.json` is the active key and the prior is
 *     regenerated on workstream BR's attribution rebuild ──────────────────
 *
 *  ██ ONE FLOOR HERE GOES DOWN. Read this before quoting it as a loosening. ██
 *
 *  Both inputs to this check changed at once, so nothing below is a comparison
 *  with a number measured last week:
 *    the KEY     Composed -> Doors. 4,796 pairs -> 7,095, and `childless_family`
 *                is now a POPULATION OF THE ACTIVE KEY rather than something
 *                only reachable with `SET=`.
 *    the ARTIFACT rendered from an attribution layer that placed awards on 241
 *                leaves in 7 countries -> one that places them on 671 in 22.
 *
 *                      OLD artifact      NEW artifact (ships)
 *                      regime@5 / in cell   regime@5 / in cell
 *      exact_attribution   99.5 / 39.7        88.0 / 64.4    n=1263
 *      original join       78.9 / 66.9        79.7 / 77.8    n= 818
 *      childless_family    24.7 / 63.3        27.6 / 64.8    n= 855
 *
 *  Containment rose on every population, by 25 points on the one whose
 *  regime@5 fell. Exact@5 rose on two of three. ONE number went down, and it is
 *  the one that pays sibling-group-size credit.
 *
 *  ── Why regime@5 on `exact_attribution` fell, measured rather than argued ──
 *  Of the 145 pairs in that population that lost their regime hit, 127 are ONE
 *  CELL: `FR|energy_cleantech`, where `ademe_aid` moved from rank 0 to rank 6.
 *  `ademe_aid` has 75 leaves in the key, so a single arbitrary ADEME child in
 *  the visible five credited every ADEME pair in that cell. 10.1 of the 11.5
 *  points hung on whether one family held one slot in one cell. That is what
 *  the 95 floor was guarding in operation. Zero pairs were gained, and the
 *  cell's new top five is five specific French R&D schemes rather than four
 *  ADEME siblings.
 *
 *  ── And the acceptance test prices the whole move at ONE CASE ─────────────
 *  This file's header says plainly that it is the smoke alarm and
 *  `check_recall_floor` is the acceptance test. The two artifacts were run
 *  against it side by side — same key, same pinned seed 20260806, N=300, tune,
 *  Postgres asserted, 1,088 instruments on both:
 *
 *                          OLD prior      NEW prior
 *      pool                282/300        282/300
 *      EXACT@5              74/300         76/300
 *      REGIME@5            229/300        228/300
 *      CHANNEL@5           281/300        283/300
 *      regime5 on exact_attribution  97%      96%    (n=136: 132 -> 131)
 *
 *  An 11.5-point move here is ONE graded case there. So the floor of 95 was not
 *  tracking the thing it says it tracks, on this population — the header's
 *  stated reason for flooring regime@5 rather than exact@5 ("it is the one that
 *  tracks REGIME@5, which is what check_recall_floor actually grades") is the
 *  claim these two runs falsify, for `exact_attribution` specifically.
 *
 *  ── So the check is made STRONGER in the same change ──────────────────────
 *  A regime@5 floor moved down on its own would be accommodation, whatever the
 *  reasoning. It is not moved on its own. `IN_CELL_FLOOR` below is new, and it
 *  floors the quantity that actually moved correctly — and this file's own
 *  header records that on the 2026-08-08 regression it is named after, the
 *  plain in-cell share fell 69% -> 47% while the floored regime@5 fell only
 *  97.4 -> 92.7. TWENTY-TWO POINTS against 4.7. The new floor catches the
 *  named regression with four times the sensitivity of the one being
 *  re-derived, on every population rather than one.
 *
 *  ██ AND THE NET EFFECT IS STRICTER, WHICH WAS MEASURED, NOT ASSERTED. ██
 *  The artifact this replaces — the one that passed every floor in force
 *  yesterday — was run against the floor set below. IT FAILS: in cell 39.7%
 *  against 61 on `exact_attribution`, and 66.9% against 74 on `original join`.
 *  Twenty-one points and seven points below. A floor set that REJECTS the
 *  artifact its predecessor accepted is not a loosened one, whatever happened
 *  to the digit on line one.
 *
 *  Raise them when the measurement rises. Never lower them to accommodate a
 *  regeneration — which is why the reduction above is spelled out at this
 *  length rather than committed as a changed digit. */
const FLOOR: Record<string, number> = {
  // RE-DERIVED DOWN, 95 -> 85: 3 under the 88.0 that ships, the same margin the
  // other two carry. The evidence for the reduction is the block above, and the
  // short form is that 10.1 of the 11.5 points were one family in one cell and
  // the acceptance test moved by one case in 136.
  "exact_attribution": 85,
  // HELD at 78, not re-derived. The measurement ROSE (78.9 -> 79.7), so the
  // convention's 3-under lands at 76 and taking it there would be lowering a
  // floor under a rising number. The margin is therefore 1.7 rather than 3 and
  // this is the tightest thing in the file; that is the correct direction to
  // be wrong in.
  "original join": 78,
  // RAISED 21 -> 24: 3 under the 27.6 that ships, and the measurement rose
  // (24.7 -> 27.6). Same margin as the others, which is a wider RELATIVE margin
  // here and appropriately so — these funds' award history has been inside a
  // fitted artifact for four days.
  "childless_family": 24,
};

/** Is the answer in its cell AT ALL, before any question of rank.
 *
 *  New in the same change that re-derives `FLOOR`, and the reason that
 *  re-derivation is not a loosening: this floors the quantity that a broken
 *  regeneration actually destroys. On the 2026-08-08 merge this file is named
 *  after, in-cell fell 69% -> 47% while the floored regime@5 fell 97.4 -> 92.7.
 *
 *  It is also the only metric here that cannot be bought with sibling-group
 *  size: containing the won fund means containing THAT fund, so a family with
 *  seventy-five leaves gets no more credit than a standalone one.
 *
 *  Three under the shipped measurement, the same convention as `FLOOR`.
 *  Shipped: exact_attribution 64.4, original join 77.8, childless_family 64.8. */
const IN_CELL_FLOOR: Record<string, number> = {
  "exact_attribution": 61,
  "original join": 74,
  "childless_family": 61,
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
    const cellFloor = split === "tune" ? IN_CELL_FLOOR[pop] : undefined;
    const got = pct(m.regimeVisible);
    const gotCell = pct(m.inCell);
    const bad = floor !== undefined && got < floor;
    // Floored separately, and reported on the same line, because they fail for
    // different reasons: regime@5 falls when the answer's FAMILY leaves the
    // visible five, in-cell falls when the artifact stops carrying the answer
    // at all. The second is the one a broken regeneration destroys.
    const badCell = cellFloor !== undefined && gotCell < cellFloor;
    if (bad) failed.push(key);
    if (badCell) failed.push(`in cell on ${key}`);
    console.log(
      `    ${bad ? "FAIL" : "ok  "} regime@${VISIBLE} ${got.toFixed(1)}% `
      + `(floor ${floor ?? "-"})  ${key}, n=${m.n}`
      + `   [exact@${VISIBLE} ${pct(m.visible).toFixed(1)}%, `
      + `${badCell ? "FAIL " : ""}in cell ${gotCell.toFixed(1)}% `
      + `(floor ${cellFloor ?? "-"})]`);
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
