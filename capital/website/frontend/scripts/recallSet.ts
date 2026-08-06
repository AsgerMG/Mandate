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
