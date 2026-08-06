// WHICH ground truth a number came from — stated once, printed every time.
//
// ── Why this file exists ───────────────────────────────────────────────────
// Four recall sets accumulated in one session, each fixing a different real
// defect, and every harness named its own default. That is how "35%" and "22%"
// were quoted side by side for weeks as if they measured the same thing: they
// were the same ranker against different answer keys, and nothing on screen
// said so.
//
// One active set, named here. Every harness loads through `loadRecallSet()` and
// therefore prints the file, the pair count and what the set can name, on every
// run. A number pasted out of a terminal now carries its own provenance.
//
// ── The active set ─────────────────────────────────────────────────────────
// `__recallSetComposed.json` is the composition of all four fixes:
//   Enriched  leak-free descriptions recovered from a DIFFERENT regime
//   Repaired  260 pairs relabelled to the leaf the transparency register
//             actually confirms (`scheme_code = call_id` is not unique)
//   Plus      2,808 pairs for the 299 programme-split children no join in the
//             original set could reach
// plus the re-test a composition forces: repairing an answer re-opens every
// leak question that was closed against the old answer.
//
// ── The retired ones ───────────────────────────────────────────────────────
// Kept on disk because published numbers refer to them, and no number should
// become unreproducible. They are NOT deleted and they are NOT silent: pass
// `SET=` and the banner says the set is retired and why, so a figure taken from
// one cannot be mistaken for a figure taken from the ground truth we trust.
import { readFileSync } from "fs";
import path from "path";

export const ACTIVE_RECALL_SET = "__recallSetComposed.json";

/** file -> the defect that retired it. */
export const RETIRED_RECALL_SETS: Record<string, string> = {
  "__recallSet.json":
    "151 of its described rows sit verbatim inside the won fund's profile, and " +
    "0 of its 1,988 pairs can name a programme-split child",
  "__recallSetEnriched.json":
    "leak-free descriptions, but still 172 nameable instruments and the " +
    "unrepaired sibling attribution",
  "__recallSetRepaired.json":
    "correct labels, but still cannot name the 234 programme-split leaves — " +
    "and one row leaks under its own repaired label",
  "__recallSetPlus.json":
    "built on Enriched, so it carries the unrepaired sibling attribution: for " +
    "the 24% of pairs in a same-name group the label is close to a uniform draw",
};

export type RecallRow = {
  name: string; country: string; sector?: string;
  instrument: string; instrumentName?: string;
  description?: string; selfDescription?: string;
  mode: string; split: string;
  descriptionSource?: string; traced?: string;
  region?: string; regionSource?: string;
};

/** A row whose description may be used as a test query.
 *
 *  A leaking description is excluded from the described population rather than
 *  counted as described: it would grade retrieval on a query copied out of the
 *  answer. Defined here so no harness can disagree about the population. */
export const isDescribed = (r: RecallRow): boolean =>
  Boolean((r.description ?? "").trim())
  && r.descriptionSource !== "own_project_title_leaks";

/** ── The gradable population ───────────────────────────────────────────────
 *
 *  THE PROPERTY: a pair may be graded on retrieval only if the fund it names
 *  is one the product may currently OFFER. Retrieval that declines to return a
 *  fund the founder must not be sent to is behaving correctly; scoring that as
 *  a miss measures the answer key, not the ranker.
 *
 *  This is a property, not a register. No country, scheme code or instrument id
 *  appears here or in any caller. The test is the SAME function the product
 *  ranks over — `publishableInstruments()` — passed in as a predicate so this
 *  file stays free of the corpus and the DB. If a scheme reopens, its pairs
 *  return to the graded population on the next run with no edit here; if one
 *  closes, they leave it. That self-healing is the point: the defect this fixes
 *  was an answer key that had a fact about the corpus BAKED INTO IT, and baking
 *  the correction in the same way would only reschedule the same failure.
 *
 *  Ungraded pairs are NOT deleted from the file. They are true award history,
 *  the corpus can move back, and a set that silently shrinks is a set nobody
 *  can audit. They are reported as their own population, the way `mode` and
 *  `traced` already are, so the number is on screen rather than inferred.
 *
 *  ── Why this cannot quietly make the set easier ───────────────────────────
 *  Because the exclusion is computed, a bug that made the corpus unpublishable
 *  would shrink the graded set to whatever remains and read a flattering score
 *  over it. So the share is GUARDED, not merely reported: see
 *  `assertGradablePopulation` and its use in `check_recall_floor.ts`. The
 *  property is that the exclusion stays a correction, never a filter that
 *  chooses the pairs it likes. */
export type GradedPopulation = {
  graded: RecallRow[];
  /** Answer exists in the corpus but may not be offered — the correction. */
  ungraded: RecallRow[];
};

export function partitionByOfferable(
  rows: RecallRow[], isOfferable: (instrumentId: string) => boolean,
): GradedPopulation {
  const graded: RecallRow[] = [], ungraded: RecallRow[] = [];
  for (const r of rows) (isOfferable(r.instrument) ? graded : ungraded).push(r);
  return { graded, ungraded };
}

/** The share of pairs whose answer the product may no longer offer.
 *
 *  Measured 2026-08-06 against Postgres: 1,032 of 4,796 = 21.5%, every one of
 *  them a scheme a register says has closed with NO successor to redirect to
 *  (80 Spanish, 6 French). That is the honest state of the key today.
 *
 *  The band is wide on purpose. It is not a floor on quality — it is a
 *  staleness alarm on the ANSWER KEY, and the two failure directions are
 *  different bugs, so it is two-sided:
 *
 *    ABOVE the ceiling  the corpus has moved out from under the key again and
 *                       the key needs repairing, exactly as it did tonight;
 *    BELOW the floor    a publishability bug has started offering closed funds,
 *                       or someone has pruned the file to raise a score.
 *
 *  Either way a human looks. What it must never do is let the graded set drift
 *  quietly, because that drift is invisible in the headline. */
export const UNGRADED_SHARE = { min: 10, max: 33 };

/** A pair can fail to be gradable for two DIFFERENT reasons, and collapsing
 *  them hides the one that matters.
 *
 *    WITHHELD  the fund is in the corpus and the register says it is closed.
 *              Expected, correct, and the whole subject of this repair.
 *    ABSENT    the fund is not in the corpus at all. That is not a closed
 *              scheme, it is an answer key pointing at something that no longer
 *              exists — either the corpus lost rows or a reload is in flight.
 *
 *  Observed live: `funding_instruments` went 1,014 -> 998 rows mid-session while
 *  another workstream reloaded it, and the ungraded share moved 21.5% -> 25.5%
 *  purely from ABSENT. Under one combined number that is invisible, and a floor
 *  calibrated through it is calibrated against a corpus that no longer exists.
 *  So ABSENT is capped far tighter than the withheld band and fails the build:
 *  measuring across a truncate-and-reload is not a thing to do quietly. */
export const ABSENT_SHARE_MAX = 2;

/** Fails loudly rather than grading a population that has drifted.
 *  `inCorpus` is optional; without it only the combined band is checked.
 *  Returns the share so a caller can print it. */
export function assertGradablePopulation(
  p: GradedPopulation, inCorpus?: (instrumentId: string) => boolean,
): number {
  const total = p.graded.length + p.ungraded.length;
  const share = total === 0 ? 0 : (100 * p.ungraded.length) / total;
  const absent = inCorpus
    ? p.ungraded.filter((r) => !inCorpus(r.instrument)).length : 0;
  const absentShare = total === 0 ? 0 : (100 * absent) / total;
  const bad = share < UNGRADED_SHARE.min || share > UNGRADED_SHARE.max;
  console.log(
    `  gradable population: ${p.graded.length.toLocaleString()} of ` +
    `${total.toLocaleString()} pairs; ${p.ungraded.length.toLocaleString()} ` +
    `(${share.toFixed(1)}%) name a fund the product may not offer` +
    `${inCorpus ? ` — ${(p.ungraded.length - absent).toLocaleString()} withheld, ` +
      `${absent.toLocaleString()} absent from the corpus` : ""}` +
    `${bad ? "  <-- OUT OF BAND" : ""}`);
  if (inCorpus && absentShare > ABSENT_SHARE_MAX) {
    console.error(
      `\nrecall set: ${absent} pairs (${absentShare.toFixed(1)}%) name a fund that ` +
      `is not in the corpus at all,\nover the ${ABSENT_SHARE_MAX}% ceiling. The ` +
      "answer key points at instruments that no longer exist.\nIf a corpus reload " +
      "is in flight, wait for it and re-run: a number measured across\na " +
      "truncate-and-reload is not reproducible. If it is not, the corpus lost rows.");
    process.exit(1);
  }
  if (bad) {
    console.error(
      `\nrecall set: ungraded share ${share.toFixed(1)}% is outside ` +
      `${UNGRADED_SHARE.min}-${UNGRADED_SHARE.max}%.`);
    console.error(
      share > UNGRADED_SHARE.max
        ? "The corpus has moved and the answer key is going stale: pairs now name\n" +
          "funds that can no longer be offered. Repair the key -- do NOT widen this\n" +
          "band, and do NOT lower the floors it protects."
        : "Fewer pairs are excluded than any correct corpus should produce. Either\n" +
          "publishability has regressed and closed funds are being offered again,\n" +
          "or the set has been pruned. Both are bugs; neither is a passing build.");
    process.exit(1);
  }
  return share;
}

/** The default seed. Shared so the gate and the harness draw the SAME sample:
 *  a floor calibrated on one draw and verified on another is not a floor. */
export const DEFAULT_SEED = 20260806;

/** Deterministic seeded sample — the draw, in one place.
 *
 *  Lifted out of `measure_recall.ts` unchanged (mulberry32 + Fisher-Yates) so
 *  the gate can share it. BOTH obvious samplers are biased on this file: the
 *  set is strongly ordered by mode, by whether the pair was traced, and by
 *  instrument, so slicing takes the head of one mode and `i % step` ALIASES
 *  against that ordering — same ranker and same key measured eleven points
 *  apart at two values of N. A shuffle cannot align with an order it never
 *  consults. Vary SEED to find out whether a result is real. */
export function sampleRecall<T>(rows: T[], n: number, seed = DEFAULT_SEED): T[] {
  let s0 = seed >>> 0;
  const rnd = () => {
    s0 = (s0 + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s0 ^ (s0 >>> 15), 1 | s0);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const shuffled = rows.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.min(n, shuffled.length));
}

/**
 * Load the active recall set — or, with `SET=`, an explicitly named one.
 *
 * Always prints what it loaded. A harness that measures without saying which
 * answer key it used produces a number that cannot be compared with anything.
 */
export function loadRecallSet(note = ""): { file: string; rows: RecallRow[] } {
  const file = process.env.SET ?? ACTIVE_RECALL_SET;
  const rows = JSON.parse(readFileSync(
    path.join(process.cwd(), "lib", "intelligence", file), "utf8")) as RecallRow[];
  announceRecallSet(file, rows, note);
  return { file, rows };
}

export function announceRecallSet(file: string, rows: RecallRow[], note = ""): void {
  const nameable = new Set(rows.map((r) => r.instrument)).size;
  const described = rows.filter(isDescribed).length;
  console.log(
    `recall set: ${file}  ${rows.length.toLocaleString()} pairs, ` +
    `${nameable} instruments nameable, ${described.toLocaleString()} leak-free ` +
    `descriptions${note ? `  [${note}]` : ""}`);
  warnIfRetired(file);
}

/** For a harness that knows the set's NAME but not its rows — a fixture, say.
 *
 *  ── Why this shouts, and why it shouts TWICE ───────────────────────────────
 *  A banner printed when the set is LOADED is separated from the numbers it
 *  qualifies by the whole run — minutes of output, and on a long replay it has
 *  scrolled off the screen by the time the figure a human actually copies
 *  appears. That is the same defect this file was written to fix: a number
 *  whose provenance is technically on screen somewhere is a number that gets
 *  quoted without it, which is how "35%" and "22%" were compared for weeks.
 *
 *  So the warning is re-printed on process exit, after the results, and goes to
 *  stderr so it survives `| tail` and `> file` on the stdout the harnesses
 *  print their tables to. The property to preserve if this is ever rewritten:
 *  a retired-set figure cannot be read without its retirement notice in view.
 */
export function warnIfRetired(file: string): void {
  const why = RETIRED_RECALL_SETS[file];
  if (!why) return;
  const rule = "!".repeat(74);
  const banner = [
    rule,
    `!! RETIRED RECALL SET: ${file}`,
    `!! ${why}.`,
    `!! Numbers from it are NOT comparable with ${ACTIVE_RECALL_SET},`,
    "!! which is the one active answer key. Do not quote this run as a",
    "!! headline figure; it is reproducing a published number, nothing else.",
    rule,
  ].join("\n");
  console.error(banner);
  if (retiredNoticePending) return;
  retiredNoticePending = true;
  process.on("exit", () => console.error(banner));
}
/** Guards against registering the exit notice once per load in a harness that
 *  loads more than one set. */
let retiredNoticePending = false;
