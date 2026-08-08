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
  /** This founder's OWN intake answers, derived from the register by
   *  `ETL/terms/enrich_recall_answers.py`. Every one carries its provenance for
   *  the same reason `regionSource` does: `other_scheme` cannot have been read
   *  off the award being predicted, `own_award` can, and a headline that mixes
   *  them is not a leak-free number. See ANSWERS= in measure_recall.ts. */
  answerTicketBand?: string; answerTicketSource?: string;
  answerCapital?: string[]; answerCapitalSource?: string;
  /** Set by `reattributeMissingAnswers` when the recorded answer named an
   *  instrument the corpus no longer holds. Provenance, so a re-attributed hit
   *  is never mistaken for one the key got right on its own. */
  reattributedFrom?: string;
};

/** The intake answers this founder actually gets, given how leak-free the run
 *  requires them to be.
 *
 *  ONE resolver, shared by every harness, because the population a number is
 *  measured on has to be the same population the next harness measures. The
 *  constants are the answers every replay used before this existed, and they
 *  remain the fallback: a founder we cannot derive an answer for is one who
 *  keeps the old answer, never one who is dropped, so `ANSWERS=` changes what
 *  founders are ASKED and never which founders are graded. That is what makes
 *  the before/after readable as an effect rather than as a change of sample.
 *
 *  `strict` uses only `other_scheme` values and lets the rest fall back, rather
 *  than restricting the population as `REGION=strict` does. Both are honest;
 *  this one keeps the denominator fixed, which is what a within-run comparison
 *  needs. */
export const CONSTANT_ANSWERS = {
  ticketBand: "b500k_2m5",
  capitalSought: ["grant", "loan"] as string[],
} as const;

export type AnswerMode = "off" | "real" | "strict";

export function answersFor(r: RecallRow, mode: AnswerMode): {
  ticketBand: string; capitalSought: string[]; region?: string;
  derived: { ticket: boolean; capital: boolean; region: boolean };
} {
  const ok = (source?: string) =>
    mode === "real" ? Boolean(source) : mode === "strict" ? source === "other_scheme" : false;
  const ticket = ok(r.answerTicketSource) && r.answerTicketBand;
  const capital = ok(r.answerCapitalSource) && r.answerCapital?.length ? r.answerCapital : undefined;
  const region = ok(r.regionSource) ? r.region : undefined;
  return {
    ticketBand: ticket || CONSTANT_ANSWERS.ticketBand,
    capitalSought: capital ?? CONSTANT_ANSWERS.capitalSought,
    region,
    derived: { ticket: Boolean(ticket), capital: Boolean(capital), region: Boolean(region) },
  };
}

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

/** ── The SECOND kind of stale answer, and why it is repaired not excluded ──
 *
 *  Two different defects put a pair beyond grading, and they are not the same
 *  thing:
 *
 *    CLOSED   the fund was real, was offerable, and the register says its window
 *             has shut. The award is sound; the fund is simply past. Excluding
 *             it is right — see the property above.
 *    NEVER A  the fund never existed. Workstream T established that all 16 of
 *    FUND     GB's leaves were values of GtR's `grantCategory` — competition
 *             FORMATS (Collaborative R&D, Feasibility Studies), PHASES of a
 *             retired programme, government DEPARTMENTS, and one literally
 *             called `Unknown` — mapped into `programme_name`, the column the
 *             instrument split runs on. The corpus manufactured 16 non-funds and
 *             the key recorded companies as having "won Collaborative R&D".
 *
 *  For the second kind, exclusion would be the wrong repair and would quietly
 *  cost real coverage. The AWARD happened; our object model invented the thing
 *  it was attributed to. The money came from the rollup those non-funds were
 *  split out of, that rollup is a real fund with a real quoted application
 *  route, and it is exactly what a founder should be shown. So the honest repair
 *  is RE-ATTRIBUTION, and retrieval returning the rollup is a genuine hit.
 *
 *  ── Derived, not hardcoded ────────────────────────────────────────────────
 *  The ancestor is read out of the id. The programme split names a child
 *  `<parent>__<slug>_<hash>`, so the parent is a property of the id itself.
 *  Verified against the live corpus rather than assumed: of 671 ids containing
 *  `__`, the prefix equals `parentId` for 671 and names an existing row for 671.
 *  `assertAncestorConvention` re-checks that at runtime, because a derivation
 *  this repair depends on must fail loudly if the naming ever changes.
 *
 *  No country, scheme code or instrument id appears here. A different programme
 *  split that loses its children tomorrow is repaired by the same rule. */
export const namedAncestor = (id: string): string | undefined =>
  id.includes("__") ? id.slice(0, id.indexOf("__")) : undefined;

/** Fails if the id convention `reattributeMissingAnswers` relies on has changed.
 *  Cheap, and it turns a silent mis-repair into a build failure. */
export function assertAncestorConvention(
  corpus: { id: string; parentId?: string | null }[],
): void {
  const ids = new Set(corpus.map((i) => i.id));
  const broken = corpus.filter((i) => {
    const a = namedAncestor(i.id);
    return a !== undefined && (a !== (i.parentId ?? undefined) || !ids.has(a));
  });
  if (broken.length) {
    console.error(
      `\nrecall set: the id convention <parent>__<child> no longer holds for ` +
      `${broken.length} of ${corpus.length} rows,\ne.g. ${broken[0].id} ` +
      `(parentId=${broken[0].parentId}). Re-attribution of answers whose\n` +
      "instrument was deleted derives the parent from the id, so it cannot be\n" +
      "trusted until this is resolved.");
    process.exit(1);
  }
}

export type Reattribution = { rows: RecallRow[]; reattributed: RecallRow[] };

/** Re-point answers whose instrument no longer exists at the surviving ancestor.
 *
 *  Only when the ancestor both EXISTS and is OFFERABLE — otherwise the row is
 *  left alone and falls through to the exclusion above, because re-pointing an
 *  answer at something the founder still cannot be shown repairs nothing. */
export function reattributeMissingAnswers(
  rows: RecallRow[],
  exists: (instrumentId: string) => boolean,
  isOfferable: (instrumentId: string) => boolean,
): Reattribution {
  const out: RecallRow[] = [], moved: RecallRow[] = [];
  for (const r of rows) {
    if (exists(r.instrument)) { out.push(r); continue; }
    const a = namedAncestor(r.instrument);
    if (a && exists(a) && isOfferable(a)) {
      const next = { ...r, instrument: a, reattributedFrom: r.instrument };
      out.push(next); moved.push(next);
    } else out.push(r);
  }
  return { rows: out, reattributed: moved };
}

/** The share of pairs whose answer the product may no longer offer.
 *
 *  Measured 2026-08-06 against Postgres: 1,032 of 4,796 = 21.5%, every one of
 *  them a scheme a register says has closed with NO successor to redirect to
 *  (80 Spanish, 6 French). That is the honest state of the key today.
 *
 *  This is a CEILING only, and deliberately. An earlier draft also set a floor,
 *  on the theory that a suspiciously small exclusion meant someone had pruned
 *  the set to raise a score. That was the wrong instrument for the right worry.
 *  The exclusion is a pure function of publishability, so the honest way to make
 *  the set easier is to prune the FILE — which a share cannot see, and which
 *  `MIN_PAIRS` below catches exactly. Worse, the floor would have fired on a
 *  genuine improvement: register successors for those 86 schemes and they become
 *  publishable through the existing redirect, the exclusion collapses toward
 *  zero, and CI would have failed on a corpus that got better.
 *
 *  What remains is a staleness alarm: above the ceiling, the corpus has moved
 *  out from under the key again and the key needs repairing, exactly as it did
 *  tonight. Widening this band is not a legitimate response to it firing. */
export const UNGRADED_SHARE = { max: 33 };

/** The file must not shrink. THIS is the anti-pruning guard.
 *
 *  `__recallSetComposed.json` holds 4,796 pairs and is committed, so its size is
 *  a fact about a versioned artifact rather than about the moving corpus — the
 *  kind of constant it is safe to pin. Deleting pairs is the one edit that
 *  genuinely makes the measurement easier while leaving every share and every
 *  floor looking healthy, and it is invisible to all of them.
 *
 *  Set just under today's count: a deliberate rebuild of the set updates this
 *  line as part of the same change, which is precisely the review moment the
 *  guard exists to force. */
export const MIN_PAIRS = 4700;

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
 *  purely from ABSENT — 16 instruments, 192 pairs. Under one combined number
 *  that is invisible.
 *
 *  ── Why ABSENT is REPORTED and not separately fatal ───────────────────────
 *  The first draft capped it at 2% and failed the build, to stop anyone
 *  measuring across a reload. That cap was wrong, and measurement showed it
 *  within the hour: the corpus settled at 998 with those 16 instruments
 *  genuinely gone, so 4.0% ABSENT is the state of a CORRECT corpus. A guard
 *  that fails on a correct corpus gets suppressed, and then it guards nothing.
 *
 *  A single read also cannot tell a reload in flight from a reload that
 *  finished — both look like "some answers are missing". The reliable test is
 *  temporal, not a threshold: fingerprint the corpus BEFORE and AFTER any
 *  baseline and discard the run if it moved. That practice belongs in the
 *  runbook, and it is written up in
 *  `project-mgmt/findings/answer_key_repair_wsR.md`.
 *
 *  Catastrophic divergence is still caught, because ABSENT counts toward the
 *  combined `UNGRADED_SHARE` band above — a reload that dropped a whole country
 *  pushes the total through the ceiling and fails there. What ABSENT gets here
 *  is visibility, which is what it actually lacked. */

/** Fails loudly rather than grading a population that has drifted.
 *  `inCorpus` is optional; without it only the combined band is checked.
 *  Returns the share so a caller can print it. */
export function assertGradablePopulation(
  p: GradedPopulation, inCorpus?: (instrumentId: string) => boolean,
  reattributed = 0,
): number {
  const total = p.graded.length + p.ungraded.length;
  const share = total === 0 ? 0 : (100 * p.ungraded.length) / total;
  const absent = inCorpus
    ? p.ungraded.filter((r) => !inCorpus(r.instrument)).length : 0;
  const absentShare = total === 0 ? 0 : (100 * absent) / total;
  const bad = share > UNGRADED_SHARE.max;
  const pct = (n: number) => `${((100 * n) / total).toFixed(1)}%`;
  // Every population on its own line. Two different repairs happened here and
  // netting them into one number is how the second one goes unnoticed.
  console.log(`  answer key, ${total.toLocaleString()} pairs:`);
  console.log(
    `    GRADED         ${String(p.graded.length).padStart(5)} (${pct(p.graded.length)})` +
    `  answer is a fund the product may offer`);
  if (reattributed) {
    console.log(
      `      of which RE-ATTRIBUTED ${String(reattributed).padStart(4)} ` +
      `(${pct(reattributed)})  named an instrument that was never a fund;\n` +
      "        scored against the rollup the award actually belongs to");
  }
  console.log(
    `    WITHHELD       ${String(p.ungraded.length - absent).padStart(5)} ` +
    `(${pct(p.ungraded.length - absent)})  closed with no successor — correctly ` +
    "unofferable");
  if (inCorpus) {
    console.log(
      `    ABSENT         ${String(absent).padStart(5)} (${pct(absent)})  names an ` +
      "instrument the corpus no longer holds\n                            and whose " +
      "ancestor is not offerable either");
  }
  if (bad) console.log("    <-- UNGRADED SHARE OUT OF BAND");
  if (inCorpus && absent > 0) {
    console.log(
      `    (${absentShare.toFixed(1)}% absent. If a corpus reload is in flight a ` +
      "baseline taken now is not\n     reproducible: fingerprint the corpus before " +
      "and after, and discard the run\n     if it moved.)");
  }
  if (total < MIN_PAIRS) {
    console.error(
      `\nrecall set: ${total} pairs, under the ${MIN_PAIRS} floor. The answer key ` +
      "has SHRUNK.\nDeleting pairs is the one edit that makes every score look " +
      "better while leaving\nevery share and every floor looking healthy. If the " +
      "set was rebuilt on purpose,\nupdate MIN_PAIRS in the same change and say why.");
    process.exit(1);
  }
  if (bad) {
    console.error(
      `\nrecall set: ungraded share ${share.toFixed(1)}% is over the ` +
      `${UNGRADED_SHARE.max}% ceiling.`);
    console.error(
      "The corpus has moved and the answer key is going stale: pairs now name\n" +
      "funds that can no longer be offered. Repair the key -- do NOT widen this\n" +
      "band, and do NOT lower the floors it protects.");
    process.exit(1);
  }
  return share;
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
