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
// ── The active set, and the one it reverts to ──────────────────────────────
// ACTIVE is `__recallSetDoors.json`, switched on 2026-08-09 by PM decision
// after workstream BR's attribution rebuild cleared the last hold. STAGED is
// `__recallSetComposed.json` — what every figure published before that date was
// measured against, and what the switch reverses to. Everything below describes
// Doors, because it is the set that now grades everything.
//
// ██ ONE METRIC CHANGED MEANING ACROSS THAT SWITCH AND DID NOT CHANGE NAME. ██
// REGIME@5 is not comparable with any figure from before it. See
// `REGIME_AT_5_NOT_COMPARABLE` below; EXACT@5 is the metric to quote across it,
// and it went UP.
//
// `__recallSetDoors.json` is `__recallSetComposed.json` — itself the
// composition of
//   Enriched  leak-free descriptions recovered from a DIFFERENT regime
//   Repaired  260 pairs relabelled to the leaf the transparency register
//             actually confirms (`scheme_code = call_id` is not unique)
//   Plus      2,808 pairs for the 299 programme-split children no join in the
//             original set could reach
// plus the re-test a composition forces (repairing an answer re-opens every
// leak question that was closed against the old answer) — extended once more
// with the population all four of those still could not name:
//   Doors     2,299 pairs for 255 funds the four above could not name —
//             2,035 pairs on 233 leaves that are a FAMILY WITH NO CHILDREN,
//             plus 264 on 22 children the extender had simply not reached yet.
//
// ── Why that last one is not a fifth patch on the same join ───────────────
// Every fix above widened which CHILD an award could be credited to.
// `Split.leaf_for` builds its lookups from rows that HAVE a parent, so it can
// only ever return a child — and a family that was never split is not a rollup
// above the funds, it IS the fund. CDTI's six programmes, Innovate UK,
// Bpifrance's innovation line, Innovationsfonden's Erhvervsforsker: all
// childless families, all offered to founders every day, and no join in any of
// the four sets could name one of them.
//
// Workstream BB2 found it from the other end, by measuring what a Spanish
// founder is actually shown: every standalone row-slot on their table was a
// CDTI programme and the key named none of them. 17 of the 18 standalone leaves
// a founder sees carried 21,632 awards between them and were never an answer
// anywhere in the active set. `EXACT@5 30%` was a statement about 278 nameable
// instruments while the product offered 782.
//
// The trap that makes this worth a paragraph: while the key was blind, ANY
// change that suppressed standalone funds read as a free accuracy win — and it
// would have taken CDTI Neotec off a Spanish founder's table. Two workstreams
// went hunting for a "crowding out" defect before BB2 established the funds
// were right and the key was blind.
//
// Coverage of the population the product actually offers, from
// `ETL/terms/audit_answer_key_reach.py` against live Postgres, 2026-08-09:
//   782 offerable leaves
//   499  63.8%  the key can name it        (was 278, 35.5%)
//   195  24.9%  awards exist, none placeable on this leaf — see below
//    88  11.3%  no award in the corpus names it at all
//
// ── What remains unmeasurable, and why it is not a to-do ──────────────────
// Those two remainders are different, and neither is closed by more effort on
// the key.
//
// NO AWARD NAMES IT (88). The key is built from awards that were made. A leaf
// with zero awards on record cannot be an answer under any ranker, so its
// absence carries no information about retrieval. 88 of these are the BDNS
// convocatorias — open Spanish calls we hold before anyone has won one.
//
// AWARDS, NO EXACT DOOR (195). The larger one, and the one to state plainly.
// `populate_funding_instruments.py` only creates a child above
// `MIN_CHILD_EVENTS`, so most awards under a split regime have no child of
// their own: measured over 309,926 non-duplicate awards, only 11.4% resolve to
// an exact child and another 43.1% to a childless family. 32.0% resolve no
// further than the NOTIFIED SCHEME, which one register shares across as many as
// eighteen delivering bodies. A test pair needs exactly one right answer, and
// "one of these eighteen" is not one. Those 195 leaves are gradable at REGIME
// level and are not gradable at EXACT level, and that is a fact about what the
// registers publish rather than a gap in this file. It is the same fact behind
// the 10-case ranking regression on 2026-08-08.
//
// A key that covers 499 of 782 with the other 283 named and explained is worth
// more than one that quietly implies it covers all of them.
//
// ── The retired ones ───────────────────────────────────────────────────────
// Kept on disk because published numbers refer to them, and no number should
// become unreproducible. They are NOT deleted and they are NOT silent: pass
// `SET=` and the banner says the set is retired and why, so a figure taken from
// one cannot be mistaken for a figure taken from the ground truth we trust.
import { readFileSync } from "fs";
import path from "path";

/** ── HELD, not chosen: this is still `Composed`, and `Doors` is on disk ────
 *
 *  `__recallSetDoors.json` is built, leak-checked, measured on three seeds and
 *  committed. It is NOT active, by a coordinator decision taken while workstream
 *  BQ was establishing that the child-attribution layer is stale: the rebuild
 *  step has been failing since 2026-08-07 (`corpus_census` rows 7, 8 and 9 all
 *  read `failed at rebuild instruments`), so only 241 of 697 child rows are
 *  still valid keys, and a key extended onto that layer would measure the
 *  rebuild as churn.
 *
 *  That reasoning binds 22 of the 255 leaves Doors adds. It does not bind the
 *  other 233, and this was measured rather than argued: replaying the ETL's own
 *  split against today's events, exactly ONE of the 233 childless families
 *  Doors names would acquire a child under the rebuild and stop being an
 *  offerable leaf. The other 232 are unaffected, because the reason `leaf_for`
 *  cannot reach them is that they have no children for the split to key on --
 *  which is the one property a child rebuild cannot change.
 *
 *  So the switch below is one line, the evidence for flipping it is in
 *  `project-mgmt/findings/answer_key_coverage_wsBP.md`, and the honest cost of
 *  NOT flipping it is that every number this repo publishes about EXACT@5 keeps
 *  describing 278 of the 782 funds the product offers. */
/*  ── THE HOLD LIFTED, 2026-08-09 (workstream BS) ──────────────────────────
 *
 *  ACTIVE is now Doors. The PM approved the switch on the evidence above and
 *  on one blocker clearing: workstream BR's attribution rebuild (8523da9f)
 *  took placement 11.5% -> 41.9%, leaves 241 -> 671, and countries with a
 *  placeable leaf 7 -> 22, while leaving instruments at 1,088 and gates at
 *  7,471. The 22 leaves the paragraph above says BQ's staleness argument binds
 *  are no longer stale, so nothing is left holding the line at Composed.
 *
 *  ██ REGIME@5 IS NOT COMPARABLE ACROSS THIS SWITCH. ██  See the block on
 *  `REGIME_AT_5_NOT_COMPARABLE` below before quoting any REGIME figure against
 *  one measured before today.
 *
 *  Composed is NOT retired. It is the set every published figure before today
 *  was measured on, so it stays loadable by name via `SET=` and is deliberately
 *  absent from `RETIRED_RECALL_SETS` — a retired set prints a defect, and
 *  Composed's coverage is a limit, not a defect. `STAGED_RECALL_SET` now names
 *  it, which keeps the switch a one-line reversal in the direction it came
 *  from: swap the two constants and every harness follows. */
export const ACTIVE_RECALL_SET = "__recallSetDoors.json";
/** The set `ACTIVE_RECALL_SET` reverts TO, and previously the one it became.
 *  Named rather than written into a comment, so the other side of the switch is
 *  discoverable by grep and so nothing has to be remembered about which file
 *  was meant. Reversibility is the point of having this constant at all. */
export const STAGED_RECALL_SET = "__recallSetComposed.json";

/** ── REGIME@5 MEANS SOMETHING DIFFERENT UNDER DOORS ───────────────────────
 *
 *  Stated at the definition, because every REGIME@5 figure quoted in this repo
 *  before 2026-08-09 was measured against `__recallSetComposed.json`, and a
 *  number that changes meaning without saying so is how a metric stops being
 *  read.
 *
 *  REGIME@5 credits a hit when any of the top five rows shares the won fund's
 *  named ancestor. Under Composed, the key could only name 278 of 782 offerable
 *  funds, and it named them almost entirely as programme-split CHILDREN —
 *  `Split.leaf_for` only ever returned a child. A child's regime is its family,
 *  so the metric was asking "did we return any sibling of the winner?", and the
 *  answer got easier the more siblings the winner had. Sibling-group size was
 *  therefore a large part of what the 91% measured, and every hit on a
 *  many-child family was substantially free.
 *
 *  Doors adds the 233 offerable leaves that are a FAMILY NOBODY SPLIT — CDTI,
 *  Innovate UK, Bpifrance's innovation line. A childless family IS its own
 *  regime. For those pairs REGIME@5 and EXACT@5 are the SAME QUESTION, there is
 *  no sibling credit available, and the free hits are gone.
 *
 *  So REGIME@5 falls ~21 points on the switch and THE FALL IS THE POINT. It is
 *  not a ranking regression and no ranking change caused it: the metric stopped
 *  paying for sibling-group size. Two consequences for anyone reading a number:
 *
 *    1. NEVER compare a REGIME@5 measured under Doors with one measured under
 *       Composed. They are different questions. The comparison is not "worse",
 *       it is undefined.
 *    2. EXACT@5 IS comparable, and is the metric to quote across the switch. It
 *       asks the same question of both keys; what changed is only how much of
 *       the product it can ask it about — 278 funds, now 499.
 *
 *  The floors in `check_recall_floor.ts` are re-derived against Doors for this
 *  reason and carry the same note. */
export const REGIME_AT_5_NOT_COMPARABLE =
  "REGIME@5 under __recallSetDoors.json is not comparable with any figure " +
  "measured under __recallSetComposed.json: a childless family is its own " +
  "regime, so the metric no longer pays sibling-group-size credit. Quote " +
  "EXACT@5 across the switch. See recallSet.ts.";

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

/** ── Why a mode per FIELD, and why `real` no longer includes capital ──────
 *
 *  `real` used to turn on every derived answer at once, and it moved the
 *  candidate pool four points. Four points of pool is a hard ceiling on
 *  EXACT@5, so which field spent them is not a detail — and an all-or-nothing
 *  switch cannot answer it. The two fields cannot even cost the pool in the
 *  same way: `capitalSought` is a FILTER (`instrumentServesCapital` removes
 *  instruments before anything ranks them), while `ticketBand` is a SCORE and
 *  nothing else, since `channelServesBand` was retired to `return true` and
 *  deleted and `awardScorer`/`scaleFit` only reorder.
 *
 *  Measured, three seeds, holdout, 250 pairs (workstream AR):
 *
 *    in pool     seed 20260806   seed 7   seed 99
 *    off               234         233      234
 *    ticket            234         233      234     <- costs exactly zero
 *    capital           224         221      226
 *    real              224         221      226     <- capital is all of it
 *
 *  ── capitalSought is DISQUALIFIED as an answer, not merely expensive ──────
 *  Two thirds of that loss is this derivation being wrong rather than the
 *  filter. `capital_kind` reads `satr_staging.aid_instrument_text`, and
 *  `funding_instruments.capital_type` is derived from the SAME column one hop
 *  away — the circularity `useOfFunds` was excluded for. Worse, the
 *  `other_scheme` guard does not make the answer NEUTRAL about the won fund,
 *  it makes it ANTI-CORRELATED: a kind of capital a company took only from the
 *  fund it won is guaranteed absent from its derived answer, which guarantees
 *  the filter removes exactly the fund the pair exists to find. And a tax
 *  credit is not a preference — a company that claimed an R&D credit is
 *  derived as "wants tax credits" and cut off from every grant programme in
 *  Europe.
 *
 *  So `real` now supplies ticket and region only. `capital` is KEPT as its own
 *  mode rather than deleted, and the derivation is still written to the set, so
 *  the finding stays reproducible: a disqualified experiment that can no longer
 *  be run is one nobody can check.
 *  See project-mgmt/findings/workstream_ar_capital_filter.md. */
export type AnswerMode = "off" | "real" | "strict" | "ticket" | "capital";

export function answersFor(r: RecallRow, mode: AnswerMode): {
  ticketBand: string; capitalSought: string[]; region?: string;
  derived: { ticket: boolean; capital: boolean; region: boolean };
} {
  const ok = (source?: string) =>
    mode === "real" || mode === "ticket" || mode === "capital" ? Boolean(source)
      : mode === "strict" ? source === "other_scheme" : false;
  const ticket = mode !== "capital" && ok(r.answerTicketSource) && r.answerTicketBand;
  // Only `capital` supplies it now. `real` and `strict` deliberately do not:
  // see the disqualification above. A run that wants the disqualified answer
  // has to ask for it by name.
  const capital = mode === "capital" && ok(r.answerCapitalSource) && r.answerCapital?.length
    ? r.answerCapital : undefined;
  // Region rides with the whole-founder modes only. It is neither of the two
  // fields under test, and leaving it on in a single-field mode would put a
  // third difference inside a comparison built to isolate one.
  const region = (mode === "real" || mode === "strict") && ok(r.regionSource) ? r.region : undefined;
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
 *  guard exists to force.
 *
 *  It tracks whichever set is ACTIVE. It went to 7,000 with the doors extension
 *  and back to 4,700 when that extension was held, and both moves are the review
 *  moment working: the number is not a fact about the corpus, it is a pin under
 *  one committed artifact, and the artifact changed.
 *
 *  2026-08-09: Doors is active and holds 7,095 pairs, so this goes to 7,000 in
 *  the same commit as the switch — which is the line above being honoured, not
 *  a floor being moved. */
export const MIN_PAIRS = 7000;

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
 *  Returns the share so a caller can print it.
 *
 *  ── `file`, and the guard that ate the thing it was protecting ────────────
 *  `MIN_PAIRS` is pinned to the ACTIVE set's committed size, and this function
 *  applied it to whatever set it was handed. So the moment the active set grew,
 *  every `SET=` replay of a retired one exited 1 — 4,796 pairs "under the 7,000
 *  floor, the answer key has SHRUNK" — and the retired sets exist for exactly
 *  one purpose, which is that a published number stays reproducible. The
 *  anti-pruning guard had made four published baselines unreproducible in a
 *  single edit, and it did it by working as written.
 *
 *  The size floor is a claim about ONE artifact: the active key must not be
 *  quietly pruned. A retired set is already frozen at a size its own retirement
 *  notice records, and nobody raises a score by pruning a file no headline comes
 *  from. So the floor is scoped to the active set and the retired ones are
 *  reported and let through — which is also the honest reading of the rule this
 *  repo works to, since lowering `MIN_PAIRS` to let a replay run would have been
 *  weakening a floor to go green.
 *
 *  `file` defaults to the active set so a caller that does not pass one gets the
 *  strict behaviour, never the lenient one. */
export function assertGradablePopulation(
  p: GradedPopulation, inCorpus?: (instrumentId: string) => boolean,
  reattributed = 0, file: string = ACTIVE_RECALL_SET,
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
    if (file !== ACTIVE_RECALL_SET) {
      console.log(
        `    (${total.toLocaleString()} pairs, under the ${MIN_PAIRS} floor — ` +
        `expected: ${file} is not the active key\n     and is frozen at its own ` +
        "size. The floor guards the ACTIVE key against pruning.)");
    } else {
      console.error(
        `\nrecall set: ${total} pairs, under the ${MIN_PAIRS} floor. The answer key ` +
        "has SHRUNK.\nDeleting pairs is the one edit that makes every score look " +
        "better while leaving\nevery share and every floor looking healthy. If the " +
        "set was rebuilt on purpose,\nupdate MIN_PAIRS in the same change and say why.");
      process.exit(1);
    }
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
