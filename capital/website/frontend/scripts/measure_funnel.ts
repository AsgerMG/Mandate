// ONE FUNNEL. ONE POPULATION. ONE DENOMINATOR.
//
// ── The defect this exists to close ────────────────────────────────────────
// On 2026-08-12 four figures were quoted to the owner in one conversation, each
// true and each about a different population:
//
//   "the ranker scores 51%"     98 founders, and only those whose answer was
//                               already inside the 18-row pool
//   "we find the right fund      check_recall_floor's `pool`, 300 TUNE pairs,
//    98% of the time"           measured on the instrument TABLE, before the
//                               encoded gates have removed anything
//   "the model sees it 37%"     the head-to-head's own draw of 773, split=all,
//                               cross-regime descriptions only, country-capped
//   "the ceiling is 77.5%"      poolRecallCurve, 846 HELD-OUT founders, one per
//                               company, measured AFTER the gates
//
// Four numbers, four populations, four denominators. Two were compared to each
// other and a wrong conclusion drawn both times. None of that is a bug in any
// of the four harnesses -- each measures what it says it measures. The bug is
// that no instrument measures ALL of them on ONE population, so the only way to
// read them together is to assume they are comparable, and they are not.
//
// This is that instrument. Every row below is the SAME founders, drawn once,
// carried down the ladder, and a stage's loss is the difference between two
// adjacent counts over the same denominator. A figure quoted anywhere in this
// repo should be findable here as a row, or as a row with a stated difference
// in population -- and where it disagrees, the disagreement is the finding.
//
// ── THE PROPERTY, and its test for unseen cases ────────────────────────────
// A funnel is a chain of NESTED survivor sets. `assertNested` enforces exactly
// that, per founder, over whatever stage list `STAGES` happens to hold: a stage
// may never revive a founder an earlier stage lost. That is a property, not an
// enumeration -- insert a stage anywhere, in any order, and it is checked with
// no edit here. A stage that CANNOT be evaluated returns `null` and is carried
// as UNMEASURED; it may never be silently carried as "lost nothing", because
// this repo has shipped both a check that printed `ok -- every value carried by
// the 0 publishable instruments is reachable` and a counter whose pattern
// matched nothing and returned zero on every run ever made.
//
// ── FREE, BUT NOT OFFLINE. THE TWO ARE NOT THE SAME THING ──────────────────
// ANTHROPIC_API_KEY is deleted before anything that could reach it is imported,
// the same guarantee `_wsdr_curve.ts` makes and for the same reason: a
// measurement that must run on every change cannot be one somebody has to
// decide to afford. What remains is the Voyage embedding behind
// `semanticFundMatch`, which IS the shipped ranker -- measuring the lexical
// fallback instead would be a number about a system no founder is served by.
//
// ██ WHAT THAT DISTINCTION COST, ON THIS FILE'S OWN PUBLISHED RUN ██
// The reference run committed on 2026-08-12 (9c022bcc) was taken with no
// database: its header says `corpus snapshot instruments=1088` and
// `805 FELL BACK TO LEXICAL`, and the 25.8% under it was planned from for a day.
// Both halves of that came from ONE cause -- `NO_PG=1`, which deletes
// DATABASE_URL, so hydration served the committed snapshot and
// `semanticFundMatch` fell through to a score cache cut for the archetypes and
// missing every real founder's description. Neither existing guard could see it:
// `requireCredentials` accepts NO_PG as a legitimate declaration, and
// `requireLiveCorpus` is blind by construction to a run that never asked
// Postgres for anything (provenance records `snapshot, degraded: false`).
//
// So the two banners at the top of the report are now ENFORCED, not decorated:
//
//   NO_PG is refused here          -- an offline funnel measures neither the
//                                     corpus a founder reads nor the ranker
//                                     that orders it, so it is not a weaker
//                                     version of this measurement, it is a
//                                     different one
//   the corpus must be postgres    -- `requireLiveCorpus` plus the source
//                                     itself, below
//   the ranker must be clean       -- `requireCleanRanker`, immediately before
//                                     anything is written to disk
//
// ── WHICH STORE, AND WHY IT IS POSTGRES ────────────────────────────────────
// A founder's request calls `hydrateDbInstruments()`, which is Postgres-first
// and falls back to `public/data/instrument_terms.json` only when Postgres
// fails. The snapshot is therefore the DEGRADATION path, not the product, and
// the two stores do not agree about what is publishable: measured on this
// worktree's corpus on 2026-08-13, Postgres offers 771 instruments with 0
// suppressed, the committed snapshot 735 with 36 suppressed for unconfirmed
// liveness. Measuring the snapshot would attribute 36 rows of a stale copy to
// the corpus stage of the funnel.
//
// This does NOT overrule the population argument at `main()` below. That
// argument is about WHICH FOUNDERS are drawn -- before the offerability cut
// rather than after it -- and it is orthogonal to which store answers the
// question for them. Both are printed in the run header, because the last time
// a figure from this harness was wrong, the header said which store it came
// from and nobody read it.
//
// The LAST stage involves a model and is therefore not measured here at all. It
// is ESTIMATED from the last paid head-to-head's own tape, re-derived from that
// run's per-founder rows rather than copied out of its prose, and printed on a
// line that says ESTIMATED with the tape's fingerprint beside it.
//
//   npm run stages                 # THE REFERENCE RUN — the whole held-out
//                                  # population, exact, ~2h
//   N=200 npm run stages           # the routine run, ~25 min, +/-7 points at
//                                  # the widest row; the interval is printed
//   SPLIT=tune npm run stages      # the split the floors are calibrated on
//   N=30 npm run stages            # a smoke run
//
// The cost is one Voyage embedding and one gate hydration per founder, and
// neither parallelises safely: `semanticFundMatch` has a 3s statement timeout
// and returns an empty map on any failure, at which point every ranking call
// site drops to the lexical index and the run averages two ranking systems
// while printing one number. `requireCleanRanker` now REFUSES to write such a
// run to disk, which is why this stays sequential — a parallel run would trip
// the timeout, and the penalty is no longer a banner but a lost two hours.
import { createHash } from "crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
// Free by construction, not by intention.
delete process.env.ANTHROPIC_API_KEY;
if (requireCredentials("measure_funnel", ["DATABASE_URL", "VOYAGE_KEY"]) === "offline") {
  // `NO_PG=1` is this repo's honest declaration that there is no database, and
  // for a CHECK it is a legitimate state that should skip and say so. Here it is
  // not a weaker version of this measurement: it changes both stores the funnel
  // is about at once -- the corpus becomes the committed snapshot and the ranker
  // becomes the lexical fallback -- so the run would print every stage of a
  // system nobody is served by, under this file's name. It is refused rather
  // than skipped because a harness invoked deliberately must not exit 0 having
  // measured nothing.
  throw new Error(
    "measure_funnel: NO_PG is set. This instrument measures the corpus a "
    + "founder's request actually reads and the ranker that actually orders it, "
    + "and NO_PG replaces both — the committed snapshot for Postgres (771 "
    + "publishable against 735 on 2026-08-13) and the lexical index for the "
    + "embedding ranker. That is what produced the snapshot/lexical reference "
    + "run of 2026-08-12. Unset NO_PG and run against the live stores.");
}

import { meetsDataFloor } from "../lib/intelligence/accessMode";
import { BRIEF_LIMITS } from "../lib/intelligence/briefChecks";
import { VERDICT_POOL, WRITER_CANDIDATE_CAP } from "../lib/intelligence/caps";
import {
  corpusProvenance, type DbInstrument, findPeersBySubsector, hydrateDbInstruments,
  isGenericSubsector, loadDbInstruments, matchCompany, publishableInstruments,
  requireLiveCorpus, resetGateHydration, suppressedForUnconfirmedLiveness,
} from "../lib/intelligence/corpus";
import { evaluateEligibility } from "../lib/intelligence/eligibility";
import { ExclusionLog } from "../lib/intelligence/exclusions";
import { isClosed } from "../lib/intelligence/liveness";
import { accessiblePool, orderMemoCandidates } from "../lib/intelligence/memoCandidates";
import { registerNamesTheRow } from "../lib/intelligence/nameEvidence";
import { isWithheldByPolicy } from "../lib/intelligence/offerableAxes";
import { hasOfferRoute } from "../lib/intelligence/offerRoute";
import { POOL_RECALL_KS, poolRecallAt, poolRecallN } from "../lib/intelligence/poolRecall";
import {
  rankerTally, rankerTallyLine, requireCleanRanker, resetRankerTally, semanticFundMatch,
} from "../lib/intelligence/semantic";
import {
  applyProfileSignal, buildInstrumentTableHydrated, founderCountryList,
  tableInputFromAnswers,
} from "../lib/intelligence/shortlist";
import type { InstrumentRow } from "../lib/intelligence/types";
import { founderIntake, founderPolicyFromEnv, IntakeTally, type FounderPolicy } from "./founderIntake";
import { DEFAULT_SEED, halfWidth, sampleRecall } from "./recallSample";
import {
  assertAncestorConvention, assertGradablePopulation, isDescribed, loadRecallSet,
  partitionByOfferable, reattributeMissingAnswers, type RecallRow,
} from "./recallSet";

const PUBLISH_CAP = BRIEF_LIMITS.institutionsMax;
/** The rank the head-to-head, the recall floor and every EXACT@K figure in this
 *  repo are quoted at. Kept as its own constant because the model-stage estimate
 *  and the disagreement table below both have to compare like with like. */
const TOP = 5;

/** ── THE ROW COUNTS THE BRIEF IS READ AT ───────────────────────────────────
 *
 *  The memo publishes `institutionsMax`. The owner reads the table at SIX, and
 *  every EXACT@K figure this repo has ever quoted is at five. All three are the
 *  same question asked of the same ordering, so they are one list rather than
 *  three hand-written stages: add a fourth and it is a number here, not a stage
 *  body, a mechanism string and a nesting argument.
 *
 *  Nesting is automatic and that is the point. Sorted strictly descending and
 *  de-duplicated, the first N rows of an ordering are a subset of the first M
 *  for every N < M, so `assertNested` cannot fail on a cut this list generates
 *  however many are added. A hand-written stage has no such guarantee.
 *
 *  Six is NOT a smaller seven. `briefChecks.ts` carries the measured marginal
 *  gain per row: the sixth moves EXACT by ~+3 points and REGIME and CHANNEL by
 *  nothing on any split -- it is almost always another sibling of a programme
 *  already shown -- while the seventh is the largest single mover of REGIME and
 *  CHANNEL above rank five, the row that puts a NEW programme through a NEW
 *  channel in front of the founder. Cutting to six is cheap on the metric this
 *  ladder reports and expensive on the one it does not, which is exactly why
 *  both rows are now on the page instead of one. */
const ROW_CUTS: number[] = [...new Set([PUBLISH_CAP, 6, TOP])].sort((a, b) => b - a);

/** Stable stage id for a row cut. The brief's own cap keeps the name every
 *  earlier run of this harness wrote, so two reports can be diffed. */
const rowCutId = (n: number) => (n === PUBLISH_CAP ? "published" : `top_${n}`);

const num = (v: string | undefined, d: number) =>
  (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : d);

/** ── ONE FOUNDER'S PASSAGE DOWN THE FUNNEL ─────────────────────────────────
 *
 *  Everything a stage can ask about a founder, computed once. A stage is a pure
 *  function of this record, which is what makes the stage list re-orderable and
 *  extendable without touching the driver -- and what stops a stage quietly
 *  recomputing a definition another stage already owns. */
interface Trace {
  company: string;
  country: string;
  /** The fund they actually won, after re-attribution. */
  won: string;
  /** Does the corpus still hold it. */
  inCorpus: boolean;
  /** `publishableInstruments()` returned it. */
  offerable: boolean;
  /** The degradation policy withheld it: it passed every corpus-fact predicate
   *  and was then removed because its openness could not be CONFIRMED. */
  degraded: boolean;
  /** 1-based rank in the founder's full instrument table, or null. This array
   *  is what `computeVerdict` publishes as `candidateInstrumentIds`, so this is
   *  exactly the quantity `check_recall_floor` calls `pool`. */
  rankTable: number | null;
  /** 1-based rank in the accessible pool -- the table with rows whose encoded
   *  eligibility gates conclusively fail removed. This is the quantity
   *  `poolRecallCurve` measures. */
  rankAccessible: number | null;
  /** 1-based rank in `orderMemoCandidates().toWriter`, the <=8 candidates the
   *  writer is shown. This is the head-to-head's `rankControl`. */
  rankWriter: number | null;
  /** ── THE SAME RANK, UNCAPPED (wsGI) ────────────────────────────────────
   *
   *  1-based rank in `orderMemoCandidates().ordered` -- the whole candidate
   *  order, the array `toWriter` is the head of. `rankWriter` is DERIVED from
   *  it, so the two cannot disagree, and there is still one call to
   *  `orderMemoCandidates` per founder.
   *
   *  It exists because `rankWriter` alone cannot answer the question the cap
   *  raises. A founder lost at the cap is lost somewhere in ranks 9..18 and
   *  `null` says only "past 8", so the ladder can report the loss and not what
   *  raising the cap would recover. That distinction is the whole of the cap
   *  question, and it was unanswerable from this instrument's own record. */
  rankOrdered: number | null;
  tableLen: number;
  accessibleLen: number;
}

/** ── A STAGE ───────────────────────────────────────────────────────────────
 *
 *  `alive` returns `true` (still here), `false` (this stage lost them) or
 *  `null` (THIS INSTRUMENT CANNOT SEE THIS STAGE). The third case is not a
 *  convenience: a stage reported as zero loss because nothing evaluated it is
 *  the failure mode this repo has shipped twice. */
interface Stage {
  id: string;
  question: string;
  alive: (t: Trace) => boolean | null;
  /** Set on a stage that is DECLARED unmeasurable here, with the reason. Kept
   *  distinct from an `alive` that happens to return null so a reader can tell
   *  "we know we cannot see this" from "this founder had no value". */
  unmeasured?: string;
}

/** ── THE LADDER ────────────────────────────────────────────────────────────
 *
 *  Derived from the code, not from a sketch. Every entry names the function
 *  that does the cut, because a stage whose mechanism cannot be pointed at is a
 *  story about the funnel rather than a measurement of it. */
const STAGES: Stage[] = [
  {
    id: "answer_key",
    question: "the answer key names a fund this company actually won",
    alive: () => true,
  },
  {
    id: "in_corpus",
    question: "... and the corpus still holds that fund",
    alive: (t) => t.inCorpus,
  },
  {
    id: "publishable",
    question: "... and it is publishable on the corpus's own facts",
    // `publishableInstruments()` MINUS its trailing degradation clause. The two
    // are separated because they answer different questions -- "what does this
    // corpus say about this fund" and "and can we confirm it" -- and only the
    // second moves when the database is slow.
    alive: (t) => t.offerable || t.degraded,
  },
  {
    id: "liveness_confirmed",
    question: "... and its openness could be CONFIRMED (the degradation policy)",
    alive: (t) => t.offerable,
  },
  {
    id: "founder_screen",
    question: "... and this founder's screen keeps it (country, capital, channel + leaf caps)",
    // `buildInstrumentTableHydrated`. THE SAME ARRAY `computeVerdict` publishes
    // as `candidateInstrumentIds`, which is the quantity check_recall_floor
    // floors under the name `pool`.
    alive: (t) => t.rankTable != null,
  },
  {
    id: "gates_pass",
    question: "... and its encoded eligibility gates do not conclusively fail (accessiblePool)",
    // `accessiblePool` -> VER-BLOCKED. The curve's `inPoolAtAll`.
    alive: (t) => t.rankAccessible != null,
  },
  {
    id: "pool_cut",
    question: `... and it survives the cut to VERDICT_POOL (${VERDICT_POOL} rows)`,
    alive: (t) => t.rankAccessible != null && t.rankAccessible <= VERDICT_POOL,
  },
  {
    id: "writer_cap",
    question: `... and it survives the cut to the writer's candidates (${WRITER_CANDIDATE_CAP})`,
    // `orderMemoCandidates().toWriter`. Also applies the name-collision
    // DEMOTION, which can push a row over the cap without deleting it.
    //
    // ── READ THIS BEFORE BILLING ANYTHING TO THE CAP (wsGI) ────────────────
    // This row is a real cut -- the rows past it never reach the writer -- but
    // it is NOT what decides the published table, and the loss printed against
    // it is not a loss the cap causes. `assembleBriefRows` publishes by
    // CANDIDATE ORDER, so with nothing watch-only the founder reads ranks
    // 1..PUBLISH_CAP whatever this constant is, and a fund at rank 9 is lost at
    // the PUBLISHED cap two rows down however wide the writer's list gets.
    //
    // What the cap really governs is BACKFILL DEPTH: rank PUBLISH_CAP+k
    // publishes only where k rows above it demoted as watch-only. So the
    // reachable part of this loss is bounded by the watch-only budget printed
    // below the table, and on the recorded distribution it is a fraction of a
    // point. Whatever this row prints belongs to the ORDER -- the ranker, the
    // pool and what reaches it -- not to a number in `caps.ts`. (Deliberately
    // no figure here: it moves with the run, and the run prints it. A funnel
    // loss quoted in a comment is the fifth incomparable number in the file
    // written to stop the first four.)
    alive: (t) => t.rankWriter != null,
  },
  {
    id: "watch_only",
    question: "... and the writer's own prose does not demote it behind the actionable rows",
    // `isWatchOnly(actionableNow, nextStep, whyEligible)` in `assembleBriefRows`
    // reads text only the writer can produce. Measuring it means paying for a
    // memo per founder, which is the one thing this instrument may not do.
    alive: () => null,
    unmeasured:
      "WRT-WATCH-ONLY reads the writer's `nextStep` and `whyEligible` prose, so it "
      + "cannot be evaluated without a paid memo per founder. It is a DEMOTION, not a "
      + "deletion (`assembleBriefRows`: actionable rows first, the rest behind them in "
      + "rank order), so it moves every row's position in BOTH directions and the rows "
      + "below are neither an upper nor a lower bound. It is nonetheless BOUNDED, and "
      + "free: `dropped_watch_only` on every brief this product has published gives the "
      + "rate where this population cannot give the verdict. A row reads watch-only 3.4% "
      + "of the time, so the effect on `published` is at most ~11 founders (1.2 points).",
  },
  // ── THE ROW CUTS, GENERATED ────────────────────────────────────────────────
  // `published` keeps its name because the brief's own cap is what it is; the
  // rest are `top_<n>`. One `alive` body for all of them, so a cut cannot be
  // added with a subtly different definition of "in the first n rows".
  ...ROW_CUTS.map((n): Stage => ({
    id: rowCutId(n),
    question: n === PUBLISH_CAP
      ? `... and it is one of the ${n} rows the brief publishes`
      : `... and it is in the first ${n} of them`,
    // Rank in `toWriter`. At n = TOP this is the head-to-head's
    // `rankControl <= 5`: our own scoring, no model.
    alive: (t) => t.rankWriter != null && t.rankWriter <= n,
  })),
  {
    id: "model",
    // ── WHERE THE MODEL ACTUALLY SITS, AND WHY IT IS THE LAST ROW ANYWAY ────
    // `agentSelectMemoPool` runs in `pipeline.ts`'s ranking seam, on the pool ALREADY cut
    // to VERDICT_POOL and BEFORE `orderMemoCandidates` cuts to 8 and
    // `assembleBriefRows` cuts to 7. So it belongs three rows above this one.
    //
    // It is placed last because it REMOVES NOTHING -- every failure path in
    // `agentSelectRows` returns the incoming rows untouched, and the successful
    // path returns a permutation. A permutation has no survivor set of its own,
    // so it cannot be a row in a nested ladder; what it does is CHANGE WHICH
    // FOUNDERS THE THREE CUTS BELOW IT LOSE. Its effect is therefore only
    // observable at the end, which is where it is reported, and the rows
    // between `pool_cut` and here are the code's own order with no model in it.
    question: `... and the MODEL, which re-orders the ${VERDICT_POOL} before the cuts below, `
      + `still leaves it in the first ${TOP}`,
    alive: () => null,
    unmeasured:
      "one Anthropic call per founder. It re-orders the pool ABOVE the writer cap rather "
      + "than removing anything, so it has no survivor set of its own and cannot be a row "
      + "in a nested ladder; its effect is estimated below from the last paid head-to-head's "
      + "own tape, at the end where it becomes observable, and is never measured here.",
  },
];

/** THE PROPERTY. A funnel is nested: a stage may not revive a founder an
 *  earlier stage lost. Stated over an arbitrary stage list rather than over the
 *  stages that happen to exist today, so a stage added, removed or re-ordered
 *  is checked with no edit here.
 *
 *  Distinct from `check_contracts`'s funnel check, which proves the CAPS narrow
 *  strictly (VERDICT_POOL > WRITER_CANDIDATE_CAP >= institutionsMax). That is a
 *  statement about the levers; this is a statement about the founders who pass
 *  through them, and a correct set of caps can still be traversed by a stage
 *  list that measures them out of order. Neither subsumes the other and there
 *  should not be a third. */
function assertNested(t: Trace, verdicts: (boolean | null)[]): void {
  let dead = false;
  for (let i = 0; i < verdicts.length; i++) {
    const v = verdicts[i];
    if (v === null) continue;
    if (dead && v === true) {
      throw new Error(
        `measure_funnel: stage \`${STAGES[i].id}\` says the won fund is still present for `
        + `${t.company}, but an earlier stage had already removed it. A funnel whose survivor `
        + `sets are not nested is not a funnel, and its per-stage losses do not add up to the `
        + `total. Fix the ladder, do not relax this.`);
    }
    if (v === false) dead = true;
  }
}

/** ── WHY A FUND IS NOT PUBLISHABLE, from the predicates themselves ─────────
 *
 *  Each line CALLS the one definition rather than restating it, so a predicate
 *  that changes meaning changes here too. What this cannot do is notice a
 *  predicate being ADDED -- so it does not pretend to: a lost pair that none of
 *  these explains is counted as `unattributed` and printed. That count going
 *  above zero is the signal that `publishableInstruments` grew a clause this
 *  list has not been told about, which is the only failure mode a reason list
 *  has and the one it must not be silent about.
 *
 *  Reasons OVERLAP by design. A row with no offer route and no data floor fails
 *  both, and forcing a partition would require an order of precedence that the
 *  filter itself does not have. */
function whyNotPublishable(i: DbInstrument, hasChildren: ReadonlySet<string>): string[] {
  const why: string[] = [];
  if (i.isFramework) why.push("a framework record, not a fund");
  if (hasChildren.has(i.id)) why.push("a parent with leaves — the leaves are offered instead");
  if (!hasOfferRoute(i)) why.push("no application route on record");
  if (!registerNamesTheRow(i)) why.push("nothing outside its own id names the row");
  if (isWithheldByPolicy(i)) why.push("withheld by editorial policy");
  if (isClosed(i)) why.push("the register says the window has shut");
  if (!meetsDataFloor(i)) why.push("no amounts and no dates — below the data floor");
  return why;
}

async function main() {
  const startedAt = new Date().toISOString();
  await hydrateDbInstruments();
  // A run that asked for Postgres and silently got the committed snapshot grades
  // a corpus where nothing is closed, which is exactly how `pool` read 97% one
  // minute and 77% the next.
  requireLiveCorpus("measure_funnel");
  // ...and the case `requireLiveCorpus` cannot see, which is the one that
  // actually happened. It compares what was ASKED FOR with what arrived, so a
  // run that never asked (no DATABASE_URL, by NO_PG or otherwise) records
  // `snapshot, degraded: false` and passes. The store is a DECISION here — see
  // the header of this file — so it is asserted as one rather than inferred
  // from an absence.
  const store = corpusProvenance().source;
  if (store !== "postgres") {
    throw new Error(
      `measure_funnel: the corpus came from ${store}, not Postgres. This ladder `
      + "measures what a founder's request reads, and a request reads Postgres — "
      + "the snapshot is `hydrateDbInstruments`'s degradation path, and on "
      + "2026-08-13 the two disagreed by 36 instruments on publishability alone. "
      + "The snapshot is worth measuring, but as its own labelled run, not as "
      + "this one wearing its name.");
  }
  resetRankerTally();

  const corpus = loadDbInstruments();
  assertAncestorConvention(corpus);
  const byId = new Map(corpus.map((i) => [i.id, i]));
  const hasChildren = new Set(
    corpus.map((i) => i.parentId).filter((id): id is string => Boolean(id)));
  const inCorpus = new Set(corpus.map((i) => i.id));
  const offerableRows = publishableInstruments();
  const offerable = new Set(offerableRows.map((i) => i.id));
  // Read IMMEDIATELY after the call that populates it: `suppressedForUnconfirmedLiveness`
  // reports the LAST `publishableInstruments()` run, so anything that calls it
  // again between here and the read would silently reassign this list.
  const degradedRows = suppressedForUnconfirmedLiveness();
  const degraded = new Set(degradedRows.map((r) => r.id));

  const { file: setFile, rows: all } = loadRecallSet("one funnel");
  const fixed = reattributeMissingAnswers(
    all, (id) => inCorpus.has(id), (id) => offerable.has(id));
  const pop = partitionByOfferable(fixed.rows, (id) => offerable.has(id));
  assertGradablePopulation(pop, (id) => inCorpus.has(id), fixed.reattributed.length, setFile);

  // ── THE POPULATION, STATED ────────────────────────────────────────────────
  // ██ IT IS DRAWN BEFORE `partitionByOfferable`, AND THAT IS THE POINT. ██
  // Every other harness in this repo measures on `pop.graded` -- the pairs whose
  // answer is STILL OFFERABLE -- because a fund the product must not offer
  // cannot fairly be graded as a retrieval miss. That is right for a floor and
  // wrong for a funnel: the corpus stages below are precisely the ones
  // `pop.graded` has already applied, so drawing from it would make the first
  // four rows read 100% by construction and hide the largest loss in the
  // product behind a denominator.
  //
  // So this draws from `fixed.rows` -- the whole set, after the never-a-fund
  // re-attribution -- and reports the offerability cut as the stage it is.
  // `pop` is still computed above, because `assertGradablePopulation` is the
  // guard that stops a corpus bug reading as a flattering score, and it is not
  // this instrument's business to switch that off.
  const split = process.env.SPLIT ?? "holdout";
  const seed = num(process.env.SEED, DEFAULT_SEED);
  // Held out AND described, and ONE FOUNDER PER COMPANY. The same three
  // restrictions `_wsdr_curve.ts` applies, so this instrument's pool rows are
  // comparable with the committed curve to the founder rather than to the
  // rounding. A founder with no description cannot be read by the ranker at
  // all, and a company with many awards would otherwise carry the funnel.
  let population = fixed.rows.filter((r) =>
    (split === "all" || r.split === split) && isDescribed(r));
  {
    const seen = new Set<string>();
    population = [...population].sort((a, b) => a.name.localeCompare(b.name))
      .filter((r) => (seen.has(r.name) ? false : (seen.add(r.name), true)));
  }
  if (!population.length) {
    throw new Error(
      `measure_funnel: no rows match split=${split} with a description. A harness that `
      + "reports 0/0 instead of failing is how a defect survives.");
  }
  // `N=0` (the default) is the WHOLE population. A funnel measured on a sample
  // is a funnel with a confidence interval on every row, and the interval is
  // printed either way -- but the default should be the exact answer.
  const n = num(process.env.N, 0);
  const drawn = n > 0 ? sampleRecall(population, n, seed) : population;

  // ── THE DRAW FINGERPRINT ──────────────────────────────────────────────────
  // The seed pins the DRAW, not the POPULATION. Publishing 53 correctly closed
  // Spanish calls once shrank the graded key so the same seed drew a different
  // 300 pairs and 48% of the exam was replaced, with nothing on screen saying
  // so. Two runs quoting different fingerprints measured different founders,
  // whatever seed they name.
  const fingerprint = createHash("sha256")
    .update(drawn.map((r) => `${r.name}::${r.instrument}`).join("\n"))
    .digest("hex").slice(0, 16);

  const policy: FounderPolicy = founderPolicyFromEnv();
  const tally = new IntakeTally();
  const traces: Trace[] = [];
  const lostReasons = new Map<string, number>();
  let unattributed = 0;

  console.log(
    `one funnel · set=${setFile} split=${split} · ${drawn.length} founder(s)`
    + `${n > 0 ? ` sampled of ${population.length}` : " (the whole population)"}`
    + ` · draw ${fingerprint}\n`);

  for (const t of drawn as RecallRow[]) {
    resetGateHydration();
    const f = founderIntake(t, policy);
    tally.add(f);
    const won = t.instrument;

    const heldByCorpus = inCorpus.has(won);
    const isOfferable = offerable.has(won);
    const wasDegraded = degraded.has(won);
    // Attribution for the corpus stage, computed only where something was lost.
    if (heldByCorpus && !isOfferable && !wasDegraded) {
      const why = whyNotPublishable(byId.get(won) as DbInstrument, hasChildren);
      if (!why.length) unattributed++;
      for (const w of why) lostReasons.set(w, (lostReasons.get(w) ?? 0) + 1);
    }

    let rankTable: number | null = null;
    let rankAccessible: number | null = null;
    let rankWriter: number | null = null;
    let rankOrdered: number | null = null;
    let tableLen = 0;
    let accessibleLen = 0;

    // The founder stages are only asked of a founder whose answer survived the
    // corpus stages. Asking them of the rest would cost a Voyage call per
    // founder to establish a `false` the ladder already knows, and the nesting
    // property is what makes that sound rather than a shortcut.
    if (isOfferable) {
      const selfRecord = matchCompany(f.company, f.country);
      const targetSub = selfRecord.matched && !isGenericSubsector(selfRecord.subsector)
        ? selfRecord.subsector : "";
      // The self record's own channels are WITHHELD -- for a founder replayed
      // against the fund they actually won, their history CONTAINS THE ANSWER
      // and `fieldChannels` is tier 1 of the row sort. Peers are kept, which is
      // what production does for a founder who is not in the corpus.
      const dbPeers = targetSub
        ? findPeersBySubsector(targetSub, { country: f.country, limit: 4, exclude: [f.company] })
        : [];
      const semantic = await semanticFundMatch(f.opts.description ?? "");
      const log = new ExclusionLog();
      const hydrated = await buildInstrumentTableHydrated({
        fieldChannels: new Set<string>(dbPeers.flatMap((r) => r.channels)),
        founderCountries: founderCountryList(
          f.country, f.opts.targetMarkets, f.eligibility.entityCountries),
        capitalSought: f.opts.capitalSought,
        description: f.opts.description,
        semantic,
        ...tableInputFromAnswers(f.eligibility),
        log,
      } as never);
      tableLen = hydrated.length;
      const iTable = hydrated.map((r: InstrumentRow) => r.instrumentId).indexOf(won);
      rankTable = iTable < 0 ? null : iTable + 1;

      const accessible = applyProfileSignal(
        accessiblePool(hydrated, f.eligibility as never, log), undefined, undefined);
      accessibleLen = accessible.length;
      const iAcc = accessible.map((r) => r.instrumentId).indexOf(won);
      rankAccessible = iAcc < 0 ? null : iAcc + 1;

      // The writer's candidates, through production's own function on
      // production's own cut. `orderMemoCandidates` no longer sorts -- it
      // carries the incoming order and applies the name-collision demotion and
      // the writer cap -- so this is the published ordering minus the model.
      const poolCut = accessible.slice(0, VERDICT_POOL);
      const poolIds = poolCut.map((r) => r.instrumentId)
        .filter((id): id is string => Boolean(id));
      // `ordered`, not `toWriter`: the cut is `.slice(0, WRITER_CANDIDATE_CAP)`
      // of this array, so taking the head here and the rank below cannot
      // disagree, and the ranks past the cap stay readable. Two calls to read
      // one order would be two orders the first time either drifted.
      const ordered = orderMemoCandidates({
        instrumentTable: poolCut,
        req: {
          company: f.company, country: f.country, description: f.opts.description,
          capitalSought: f.opts.capitalSought, eligibility: f.eligibility,
          targetMarkets: undefined,
        } as never,
        records: [], dbPeers,
        eligibilityScreen: evaluateEligibility(f.eligibility as never, poolIds),
        log: new ExclusionLog(),
      }).ordered.map((x) => x.row.instrumentId ?? x.row.channel);
      const iO = ordered.indexOf(won);
      rankOrdered = iO < 0 ? null : iO + 1;
      rankWriter = rankOrdered != null && rankOrdered <= WRITER_CANDIDATE_CAP
        ? rankOrdered : null;
    }

    const trace: Trace = {
      company: t.name, country: t.country, won,
      inCorpus: heldByCorpus, offerable: isOfferable, degraded: wasDegraded,
      rankTable, rankAccessible, rankWriter, rankOrdered, tableLen, accessibleLen,
    };
    assertNested(trace, STAGES.map((s) => s.alive(trace)));
    traces.push(trace);
    if (traces.length % 50 === 0) console.log(`  ${traces.length}/${drawn.length}`);
  }

  // ── THE TABLE ─────────────────────────────────────────────────────────────
  const N = traces.length;
  interface Row {
    stage: Stage; remaining: number | null; share: number | null;
    loss: number | null; lossShare: number | null;
  }
  const rows: Row[] = [];
  let prev = N;
  for (const s of STAGES) {
    const verdicts = traces.map((t) => s.alive(t));
    const anyMeasured = verdicts.some((v) => v !== null);
    if (!anyMeasured) {
      rows.push({ stage: s, remaining: null, share: null, loss: null, lossShare: null });
      continue;
    }
    // A stage that is measured for SOME founders and not others would make
    // `remaining` a count over two different denominators. Refuse rather than
    // average: no stage in this ladder is partial today, and one that became
    // partial would need its own denominator printed, not a silent blend.
    if (verdicts.some((v) => v === null)) {
      throw new Error(
        `measure_funnel: stage \`${s.id}\` is measurable for some founders and not others. `
        + "A count mixing the two is a ratio with two denominators, which is the whole "
        + "class of defect this instrument exists to remove.");
    }
    const remaining = verdicts.filter(Boolean).length;
    rows.push({
      stage: s, remaining, share: (100 * remaining) / N,
      loss: prev - remaining, lossShare: (100 * (prev - remaining)) / N,
    });
    prev = remaining;
  }

  const prov = corpusProvenance();
  const L: string[] = [];
  const p = (s = "") => L.push(s);
  const pad = (v: string, w: number) => v.padStart(w);

  p("# One funnel — every stage, one population, one denominator");
  p();
  p("```");
  p(`started            ${startedAt}`);
  // The STORE is a decision, not an accident of which credentials happened to
  // load, so it is printed as one. `observedAt` is the instant the store's
  // answer was taken; on Postgres it is the read itself, and it is the only
  // thing that separates a copy made minutes ago from one cut before 86
  // deadlines landed.
  p(`corpus             ${prov.source} instruments=${prov.instruments} at ${prov.hydratedAt}`);
  p(`store              POSTGRES BY DECISION, not by which credentials loaded. `
    + `It is the corpus a`);
  p(`                   founder's request reads; the committed snapshot is `
    + `\`hydrateDbInstruments\`'s`);
  p(`                   degradation path, offers strictly fewer instruments, and `
    + `a run that took it`);
  p(`                   is REFUSED rather than labelled. observedAt `
    + `${prov.observedAt || "(unstamped)"}`);
  p(rankerTallyLine());
  p(`set                ${setFile}  split=${split}  seed=${seed}`);
  p(`population         ${N} founder(s)` + (n > 0 ? ` sampled of ${population.length}` : "")
    + ` — one per company, described, drawn BEFORE the offerability cut`);
  p(`draw fingerprint   ${fingerprint}  <- two runs quoting different fingerprints`);
  p(`                   measured different founders, whatever seed they name`);
  // WHICH leak bar this population clears, on the same screen as the numbers.
  // `isDescribed` -- the curve's filter, so the pool rows below are comparable
  // with the committed curve to the founder. It is a WEAKER bar than the
  // head-to-head's `cross_regime`-only draw, and deliberately: that stricter bar
  // exists because a MODEL reads the query text, and no model reads anything
  // here. Every row is our own deterministic scoring.
  p(`leak bar           isDescribed — `
    + `\`own_project_title_leaks\` excluded, exact / 8-gram / sibling cleared by`);
  p(`                   check_recall_leaks. NOT the head-to-head's stricter`);
  p(`                   cross-regime-only draw, which exists because a model reads`);
  p(`                   the query text and nothing here does.`);
  p(`levers             pool=${VERDICT_POOL} writer_cap=${WRITER_CANDIDATE_CAP} `
    + `published_cap=${PUBLISH_CAP} top=${TOP}`);
  p("```");
  p();
  for (const line of tally.lines(policy)) p(line.trim());
  p();

  // The mean pool a founder is ranked over, printed with the table because a
  // stage loss is unreadable without the size of the list it cut from.
  const meanOf = (pick: (t: Trace) => number) => {
    const vals = traces.filter((t) => t.offerable).map(pick);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };
  p(`Mean instrument table **${meanOf((t) => t.tableLen).toFixed(1)}** rows, mean accessible `
    + `pool **${meanOf((t) => t.accessibleLen).toFixed(1)}** rows, over the `
    + `${traces.filter((t) => t.offerable).length} founders whose answer reached the founder stages.`);
  p();
  p("`+/-` is the 95% binomial half-width on this run's own n. A move smaller than it");
  p("is not a move.");
  p();
  p("| stage | founders | of start | lost here | mechanism |");
  p("|---|---:|---:|---:|---|");
  for (const r of rows) {
    const mech = MECHANISM[r.stage.id] ?? "";
    if (r.remaining === null) {
      p(`| ${r.stage.question} | ? | ? | **UNMEASURED** | ${mech} |`);
      continue;
    }
    p(`| ${r.stage.question} | ${r.remaining} | ${r.share!.toFixed(1)}% `
      + `+/-${halfWidth(r.remaining, N).toFixed(1)} | `
      + `${r.loss ? `-${r.loss} (${r.lossShare!.toFixed(1)} pts)` : "0"} | ${mech} |`);
  }
  p();

  // ── THE ASSUMPTION UNDER EVERY ROW-CUT NUMBER, STATED WHERE IT IS USED ────
  // Printed here rather than left in a code comment, because the rows above are
  // what gets quoted and a caveat one file away is a caveat nobody reads.
  const wo = await watchOnlyRate();
  p(`██ The ${ROW_CUTS.join(", ")}-row cuts are rank within \`toWriter\`, and they assume `
    + "`assembleBriefRows`");
  p("carries that order into the published table. IT DOES NOT: it puts every actionable row");
  p("ahead of every watch-only one, after the ranker (`memoCandidates.ts`). The effect is");
  p("TWO-SIDED, so these rows are not a bound in either direction — a won fund that is");
  p("actionable is PROMOTED past any watch-only row above it and can enter a cut it is shown");
  p("outside of, and a won fund whose own copy reads as watch-only is pushed behind every");
  if (wo) {
    p(`actionable row and can leave one it is shown inside. Measured on the ${wo.briefs} `
      + `real briefs in`);
    p(`\`brief_records\`: ${wo.withDemotion} of them (${(100 * wo.share).toFixed(0)}%) `
      + `demoted at least one row, ${wo.rows} rows in total. It is a small`);
    p("perturbation of a table this size, and it is not zero.");
  } else {
    p("actionable row and can leave one it is shown inside. ██ `brief_records` was");
    p("UNREACHABLE, so how often this fires in production is not quoted here rather than");
    p("quoted from memory. It is not zero: the counter exists because it fired.");
  }
  p();

  // ── THE ESTIMATED STAGE, RE-DERIVED FROM THE PAID RUN'S OWN TAPE ──────────
  const est = estimateModelStage();
  const measuredTop = rows.find((r) => r.stage.id === rowCutId(TOP))!;
  p("## The model stage — ESTIMATED, not measured");
  p();
  if (!est) {
    p("██ NO ESTIMATE. ██ No head-to-head tape was found under");
    p("`project-mgmt/findings/headtohead_wsGA/`, so the model stage is UNMEASURED and");
    p("UNESTIMATED. It is not zero loss and it is not zero gain; it is unknown.");
  } else {
    const ratio = est.rankerRate / (est.controlRate || 1);
    const projected = (measuredTop.remaining ?? 0) * ratio;
    p("```");
    p(`tape               ${est.file}`);
    p(`draw fingerprint   ${est.fingerprint}  <- a DIFFERENT population from the one above`);
    p(`graded on          ${est.n} founder(s), conditioned on the won fund being in the ${VERDICT_POOL}-row pool`);
    p(`control EXACT@${TOP}   ${est.controlHits}/${est.n} = ${(100 * est.controlRate).toFixed(1)}%`);
    p(`ranker  EXACT@${TOP}   ${est.rankerHits}/${est.n} = ${(100 * est.rankerRate).toFixed(1)}%`);
    p(`ratio              ${ratio.toFixed(3)}`);
    p("```");
    p();
    p(`Applied to this run's own ${measuredTop.remaining} founders at \`${rowCutId(TOP)}\`, the model `
      + `stage projects to **~${projected.toFixed(0)} founders `
      + `(${((100 * projected) / N).toFixed(1)}% of the start)**.`);
    p();
    p(`██ ESTIMATED. ██ The ratio comes from ${est.n} founders of a different draw, and that `
      + "run's own McNemar put the difference inside its noise. Read it as a scale, not as a");
    p("measurement, and do not quote the projected count without this sentence.");
  }
  p();

  // ── WHAT THIS CANNOT SEE ──────────────────────────────────────────────────
  p("## What this cannot see");
  p();
  for (const s of STAGES.filter((x) => x.unmeasured)) {
    p(`- **${s.id}** — ${s.unmeasured}`);
  }
  p("- **the intake.** Every founder here answers 23 fields resolved from their own "
    + "register history, not from the first screen a real founder fills in. A ceiling "
    + "measured on these answers bounds THIS harness, not the product.");
  p("- **`discoverAndResearch`, `judgeOpenAnswers` and the `ProfileSignal`** are model "
    + "calls on the live request path. They are absent here, so `applyProfileSignal` "
    + "attaches nothing and the adaptive round's `lateFields` is empty.");
  p("- **REGIME@5 is deliberately not a row.** It credits a SIBLING of the won fund, so "
    + "a founder can be lost at one stage and credited at a later one — which breaks the "
    + "nesting property this whole ladder rests on. It is a different question (did we "
    + "send them to the right funder) and it needs its own ladder, not a row in this one.");
  p();

  // ── WHAT A WIDER WRITER CAP COULD BUY ─────────────────────────────────────
  //
  // The `writer_cap` row prints a loss and says nothing about whether the cap
  // caused it. It did not: `assembleBriefRows` publishes by candidate order, so
  // the cap's only reach into the published table is BACKFILL against the
  // watch-only demotion. That makes the reachable part of its loss the product
  // of two things this instrument can now both read for free -- the rank the
  // won fund actually arrives at, and how often a row demotes.
  //
  // Printed as a table over depths rather than as a verdict on today's 8, so a
  // reader can see the shape rather than take a sentence for it.
  const budget = await watchOnlyBudget();
  p(`## What a wider \`WRITER_CANDIDATE_CAP\` could buy`);
  p();
  p("A candidate at 1-based rank `r` in the candidate order publishes **iff**");
  p("`r <= WRITER_CANDIDATE_CAP` **and** `r - w(r) <= " + PUBLISH_CAP + "`, where `w(r)` is the");
  p("number of watch-only rows above it (`assembleBriefRows`, pinned by");
  p("`briefRows.test.ts`). So rank " + (PUBLISH_CAP + 1) + "+k needs k rows to demote, and with nothing");
  p("watch-only this constant changes NOTHING a founder reads, at any value.");
  p();
  if (budget) {
    const share = (k: number) => {
      let n = 0;
      for (const [wo, c] of budget.byCount) if (wo >= k) n += c;
      return n / budget.briefs;
    };
    p("```");
    p(`watch-only budget  brief_records, ${budget.briefs} published brief(s), `
      + `${budget.from} .. ${budget.to}`);
    p(`                   production's own dropped_watch_only — real writer prose, no `
      + `model call here`);
    const keys = [...budget.byCount.keys()].sort((a, b) => a - b);
    p(`                   ${keys.map((k) => `${k} -> ${budget.byCount.get(k)}`).join("   ")}`
      + `   (mean ${budget.meanPerBrief.toFixed(2)} of ${budget.meanCandidates.toFixed(2)} candidates)`);
    p("```");
    p();
    p("██ A DIFFERENT POPULATION from the ladder above, and it is not a row in it. These");
    p("are the briefs this product has actually published, not these founders. It bounds");
    p("the ladder's last rows; it may never be blended into them.");
    p();
    p(`| cap | ranks it admits | founders whose fund is there | needs w >= | P(w >=) here | reachable |`);
    p("|---:|---|---:|---:|---:|---:|");
    const atRank = (r: number) => traces.filter((t) => t.rankOrdered === r).length;
    // The deepest rank any founder's fund actually reached, NOT `VERDICT_POOL`:
    // that constant takes `all` (Infinity), and a loop bounded by a lever is a
    // loop that hangs the day somebody sweeps it. This bound is a fact about
    // the run and is finite by construction.
    const deepest = Math.max(0, ...traces.map((t) => t.rankOrdered ?? 0));
    for (let cap = WRITER_CANDIDATE_CAP + 1; cap <= deepest && cap <= 12; cap++) {
      const k = cap - PUBLISH_CAP;
      const n = atRank(cap);
      const ps = share(k);
      p(`| ${cap} | rank ${cap} | ${n} (${((100 * n) / N).toFixed(1)}%) | ${k} | `
        + `${(100 * ps).toFixed(1)}% | ${((100 * n * ps) / N).toFixed(2)} pts |`);
    }
    // The total, because a reader deciding whether to spend a workstream here
    // needs the sum and not a column to add up.
    let total = 0;
    for (let cap = WRITER_CANDIDATE_CAP + 1; cap <= deepest; cap++) {
      total += (atRank(cap) * share(cap - PUBLISH_CAP)) / N;
    }
    const capRow = rows.find((r) => r.stage.id === "writer_cap");
    p();
    p(`**Raising the cap to the whole pool (deepest rank reached: ${deepest}) is worth `
      + `${(100 * total).toFixed(2)} points**`
      + (capRow?.remaining != null
        ? `, against a +/-${halfWidth(capRow.remaining, N).toFixed(1)} half-width on this row.`
        : "."));
    p("The loss printed at `writer_cap` is the ORDER, not the cap: a fund at rank "
      + (PUBLISH_CAP + 1) + "+ is cut");
    p(`by the published cap of ${PUBLISH_CAP} however wide the writer's list is. It belongs to the`);
    p("ranker and to what reaches it, and it will not be recovered by a constant.");
    p();
    // ── AND THE UNMEASURED STAGE, BOUNDED ────────────────────────────────────
    // Not a survivor count -- it cannot be, on this population -- but the two
    // directions are computable from the same distribution, and leaving the row
    // blank invites the reading that the unknown is large. It is not.
    const perRow = budget.meanPerBrief / budget.meanCandidates;
    const pubRow = rows.find((r) => r.stage.id === "published");
    const pub = pubRow?.remaining ?? 0;
    const demotedMax = Math.round(pub * perRow);
    // THE GAIN AT TODAY'S CAP, which is not `total`. `total` is what RAISING
    // the cap would add -- ranks past it -- and using it here would credit the
    // present funnel with founders the present funnel cannot reach. What the
    // demotion buys today is the ranks between the published cap and the
    // writer's, each needing its own number of demotions above it.
    let promoted = 0;
    for (let r = PUBLISH_CAP + 1; r <= WRITER_CANDIDATE_CAP; r++) {
      promoted += atRank(r) * share(r - PUBLISH_CAP);
    }
    p("The same distribution bounds the UNMEASURED `watch_only` row in BOTH directions,");
    p("which is what the row's own caveat cannot do — it names only the losing one.");
    p();
    p(`A row reads watch-only ${(100 * perRow).toFixed(1)}% of the time `
      + `(${budget.meanPerBrief.toFixed(2)} of ${budget.meanCandidates.toFixed(2)} candidates). So:`);
    p();
    p(`- **it LOSES at most ${demotedMax} of the ${pub} founders at \`published\`** — that is every one`);
    p("  whose own row reads watch-only, and it is an over-count, because a demoted row");
    p("  still publishes wherever fewer actionable rows exist to fill the cap.");
    p(`- **it GAINS about ${promoted.toFixed(1)}** — the founders whose fund sits at `
      + (WRITER_CANDIDATE_CAP > PUBLISH_CAP + 1
        ? `ranks ${PUBLISH_CAP + 1}-${WRITER_CANDIDATE_CAP}, inside the`
        : `rank ${WRITER_CANDIDATE_CAP}, the one seat inside the`));
    p("  writer's cap but past the published one, and is carried in by a demotion above");
    p("  it. This is what today's headroom actually buys, and it is the whole of it.");
    p();
    p(`So \`published\`'s ${pub} is an upper bound by AT MOST ${demotedMax} founders `
      + `(${((100 * demotedMax) / N).toFixed(1)} points), not by an`);
    p("open-ended unknown, and the same holds for every row beneath it. Measuring it");
    p("exactly still needs a paid memo per founder; bounding it did not.");
    p();
  } else {
    p("██ THE WATCH-ONLY BUDGET WAS UNREADABLE. `brief_records` could not be reached, so");
    p("this run cannot say what a wider cap would buy or bound the `watch_only` row. The");
    p("figure is NOT remembered from a previous run: a rate quoted from a comment stops");
    p("moving on the day the writer's behaviour does, which is the day it matters.");
    p();
  }

  // ── THE CORPUS LOSS, BY REASON ────────────────────────────────────────────
  p("## Why the corpus stage loses a fund");
  p();
  p("Reasons OVERLAP — a row can fail several — so these do not sum to the stage loss.");
  p();
  p("```");
  for (const [why, count] of [...lostReasons].sort((a, b) => b[1] - a[1])) {
    p(`${pad(String(count), 6)}  ${why}`);
  }
  if (!lostReasons.size) p("     0  nothing was lost at this stage");
  p(`${pad(String(unattributed), 6)}  ██ UNATTRIBUTED — no known predicate explains the loss`);
  p("```");
  p();
  if (unattributed > 0) {
    p("██ `publishableInstruments()` has grown a clause `whyNotPublishable` has not been");
    p("told about. The stage COUNT above is still correct; only this breakdown is short.");
    p();
  }

  // ── THE DISAGREEMENTS ─────────────────────────────────────────────────────
  const floor = await lastRecallFloor();
  p("## Where this disagrees with an existing published figure");
  p();
  p("| published figure | its population | this run's row | this run |");
  p("|---|---|---|---:|");
  const at = (id: string) => rows.find((r) => r.stage.id === id);
  const pctOfStart = (id: string) => {
    const r = at(id);
    return r?.share == null ? "?" : `${r.share.toFixed(1)}%`;
  };
  // Conditional forms, so a figure quoted as a conditional rate is compared
  // with a conditional rate rather than with a share of the start.
  const cond = (id: string, givenId: string) => {
    const a = at(id)?.remaining, b = at(givenId)?.remaining;
    return a == null || !b ? "?" : `${((100 * a) / b).toFixed(1)}%`;
  };
  if (floor) {
    p(`| \`check_recall_floor\` pool **${floor.pool.toFixed(1)}%** | ${floor.n} ${floor.split} pairs `
      + `of ${floor.set}, answer already offerable, published ${floor.takenAt.slice(0, 10)} | `
      + `\`founder_screen\` given \`liveness_confirmed\` | ${cond("founder_screen", "liveness_confirmed")} |`);
    p(`| \`check_recall_floor\` EXACT@5 **${floor.exact5.toFixed(1)}%** | same, and on the INSTANT `
      + `SCREEN's six rows, not the memo's | \`${rowCutId(TOP)}\` given \`liveness_confirmed\` | `
      + `${cond(rowCutId(TOP), "liveness_confirmed")} |`);
  } else {
    p("| `check_recall_floor` pool | ██ THE GUARD FEED WAS UNREACHABLE ██ — no figure is "
      + "quoted rather than a remembered one | `founder_screen` given `liveness_confirmed` | "
      + `${cond("founder_screen", "liveness_confirmed")} |`);
  }
  // The curve's whole-pool figure, read from the curve rather than copied out
  // of it. `check_pool_recall_curve` establishes that the terminal K IS the
  // whole-pool figure: the curve is flat from K=150 because 150 rows is already
  // every row every founder has. A literal 77.5 here would be a fifth number
  // with no producer, which is the disease.
  const curveWholePool = poolRecallAt(Math.max(...POOL_RECALL_KS)) ?? 0;
  p(`| \`poolRecallCurve\` inPoolAtAll ${(100 * curveWholePool).toFixed(1)}% | ${poolRecallN()} held-out, `
    + `answer already offerable | \`gates_pass\` given \`liveness_confirmed\` | `
    + `${cond("gates_pass", "liveness_confirmed")} |`);
  p(`| \`poolRecallCurve\` at K=${VERDICT_POOL} `
    + `${((poolRecallAt(VERDICT_POOL) ?? 0) * 100).toFixed(1)}% | same | `
    + `\`pool_cut\` given \`liveness_confirmed\` | ${cond("pool_cut", "liveness_confirmed")} |`);
  if (est) {
    p(`| head-to-head control EXACT@${TOP} ${(100 * est.controlRate).toFixed(1)}% | `
      + `${est.n}, split=all, cross-regime only, in-pool | \`${rowCutId(TOP)}\` given \`pool_cut\` | `
      + `${cond(rowCutId(TOP), "pool_cut")} |`);
    p(`| head-to-head ranker EXACT@${TOP} ${(100 * est.rankerRate).toFixed(1)}% | same | `
      + `\`model\` — UNMEASURED here | ? |`);
  }
  p(`| "we find the right fund 98% of the time" | no population — the sentence has none | `
    + `\`${rowCutId(TOP)}\` as a share of the START | ${pctOfStart(rowCutId(TOP))} |`);
  p();
  p(`The last row is the one the four figures were being read as. It is the only one a`);
  p(`founder experiences: of every company that won a fund we hold, this share would have`);
  p(`seen that fund in the first ${TOP} rows of their brief.`);
  p();

  const out = L.join("\n") + "\n";
  console.log(`\n${out}`);

  // ── NOTHING IS WRITTEN BY A RUN THAT RANKED ON THE FALLBACK ──────────────
  // Last, and after the report has been printed to the terminal, because the
  // person who just paid two hours for this run should still see what it found
  // — but it does not reach `latest.md`, which is the file that gets quoted,
  // planned from and committed. The banner was already on the page on
  // 2026-08-12 and the number was planned from anyway; a warning that can be
  // read past is not a guard.
  requireCleanRanker("measure_funnel");

  const dir = path.join(process.cwd(), "..", "..", "project-mgmt", "findings", "one_funnel");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "latest.md"), out);
  // ── ONE RECORD, WRITTEN TWICE ────────────────────────────────────────────
  // `latest.json` is a SNAPSHOT of the newest run and is overwritten every
  // time. `runs/<startedAt>.json` is HISTORY and is never overwritten. They are
  // the same bytes on purpose: a series built from a second, thinner shape
  // would be a second definition of what a run is, and the first thing to
  // diverge would be which store and which ranker it used — the two fields the
  // whole series depends on to mean anything.
  //
  // AGGREGATE ONLY. No company name and no won-fund id leaves this process: the
  // answer key is 1.7 MB of real winning project titles and this instrument must
  // not become a second copy of it in a directory nothing guards.
  const record = {
    startedAt, set: setFile, split, seed, n: N, drawFingerprint: fingerprint,
    // ── WHAT THIS RUN ACTUALLY USED, NOT WHAT IT INTENDED ──────────────────
    // Both guards above make a bad value unreachable today. They are recorded
    // anyway, and as BOOLEANS rather than left to be parsed out of prose,
    // because the series is only comparable if every point in it can be asked
    // "were you measuring the shipped system" without a human reading a
    // sentence. A run whose header said `snapshot` and `FELL BACK TO LEXICAL`
    // was committed and planned from on 2026-08-12 precisely because the
    // answer was only available as prose.
    onProductStores: prov.source === "postgres" && !rankerTally().lexical,
    store: prov.source, corpusObservedAt: prov.observedAt,
    corpus: `${prov.source} instruments=${prov.instruments}`,
    rankerTally: rankerTally(),
    ranker: rankerTallyLine(),
    // A sampled run has a wide interval on every row and is not the same
    // measurement as the exact one. Flagged so a chart can drop it or draw it
    // differently, rather than plotting an N=30 smoke run beside a reference.
    sampled: n > 0, populationSize: population.length,
    levers: { VERDICT_POOL, WRITER_CANDIDATE_CAP, PUBLISH_CAP, TOP, rowCuts: ROW_CUTS },
    watchOnlyInProduction: wo ?? null,
    meanTableRows: Number(meanOf((t) => t.tableLen).toFixed(1)),
    meanAccessibleRows: Number(meanOf((t) => t.accessibleLen).toFixed(1)),
    stages: rows.map((r) => ({
      id: r.stage.id, question: r.stage.question,
      remaining: r.remaining, sharePct: r.share == null ? null : Number(r.share.toFixed(2)),
      lost: r.loss, unmeasured: Boolean(r.stage.unmeasured),
      halfWidthPts: r.remaining == null ? null
        : Number(halfWidth(r.remaining, N).toFixed(2)),
    })),
    corpusLossReasons: Object.fromEntries(lostReasons),
    corpusLossUnattributed: unattributed,
    modelStage: est ? { estimated: true, ...est } : { estimated: false },
  };
  const body = `${JSON.stringify(record, null, 1)}\n`;
  writeFileSync(path.join(dir, "latest.json"), body);
  writeRunHistory(dir, startedAt, body);
  console.log(`wrote ${path.join(dir, "latest.md")}`);
}

/** ── THE HISTORY, AND THE ONE RULE IT HAS ──────────────────────────────────
 *
 *  APPEND ONLY. A run file is a statement about a moment and there is no
 *  correct reason to change one: a re-measurement is a NEW run with its own
 *  timestamp, fingerprint and store, and overwriting the old one would erase
 *  the evidence that the two disagreed. `wx` is the flag that makes that a
 *  property of the filesystem call rather than a convention, so a colliding
 *  write fails loudly instead of silently replacing history.
 *
 *  Named by `startedAt`, which is what makes a collision essentially
 *  impossible and also sorts the directory chronologically with no index file
 *  to keep in step. Colons are stripped because they are legal on this
 *  filesystem and not on every one a checkout may land on.
 *
 *  A failure here does NOT fail the run. `latest.md` and `latest.json` are
 *  already on disk and carry the whole measurement; losing the history entry
 *  costs a point on a chart, and taking the report down with it would cost two
 *  hours. It is loud, which is the same trade `publishVerdict` makes. */
function writeRunHistory(dir: string, startedAt: string, body: string): void {
  const runs = path.join(dir, "runs");
  const file = path.join(runs, `${startedAt.replace(/[:]/g, "-")}.json`);
  try {
    mkdirSync(runs, { recursive: true });
    writeFileSync(file, body, { flag: "wx" });
    console.log(`wrote ${file}`);
  } catch (err) {
    console.error(
      `measure_funnel: the run record was NOT written to ${file}: ${err}\n`
      + "  The measurement itself is intact in latest.md and latest.json; what is\n"
      + "  missing is this run's point on the series. Do not fix it by copying\n"
      + "  another run's file — a history entry that did not come from its own run\n"
      + "  is the thing this directory exists to prevent.");
  }
}

/** One-line mechanism per stage, printed beside it. A stage whose mechanism
 *  cannot be pointed at is a story about the funnel, not a measurement of it. */
const MECHANISM: Record<string, string> = {
  answer_key: "`loadRecallSet` + `reattributeMissingAnswers`",
  in_corpus: "`loadDbInstruments`",
  publishable: "`publishableInstruments` — seven predicates, `corpus.ts`",
  liveness_confirmed: "`unconfirmedOpen` — the degradation clause of the same filter",
  founder_screen: "`buildInstrumentTableHydrated` = `candidateInstrumentIds`",
  gates_pass: "`accessiblePool` → `VER-BLOCKED`",
  pool_cut: "`.slice(0, VERDICT_POOL)`",
  // NOT a cut that decides publication. `assembleBriefRows` ranks by CANDIDATE
  // ORDER, so the published table is the head of this list and this cap only
  // bounds how far the watch-only demotion can backfill into it. A founder
  // counted lost here is lost to the ORDER, not to the number.
  writer_cap: "`.slice(0, WRITER_CANDIDATE_CAP)` — bounds the backfill, not the table",
  watch_only: "`isWatchOnly` in `assembleBriefRows` — needs the writer",
  model: "`agentSelectMemoPool` → Anthropic, in `pipeline.ts` — a PERMUTATION of the "
    + `${VERDICT_POOL}, applied above the two cuts below it`,
  // The row cuts are generated from ROW_CUTS, so their mechanisms are too: a
  // cut added to that list arrives with its mechanism rather than with a blank
  // cell, which is what a hand-maintained second list here would have produced.
  ...Object.fromEntries(ROW_CUTS.map((n) => [
    rowCutId(n),
    n === PUBLISH_CAP
      ? "`order.slice(0, BRIEF_LIMITS.institutionsMax)`"
      : `the first ${n} rows of the same order, our own scoring`,
  ])),
};

/** ── HOW OFTEN THE ONE UNMEASURED CUT ACTUALLY FIRES ──────────────────────
 *
 *  `assembleBriefRows` demotes watch-only rows behind actionable ones, and this
 *  harness cannot see it: the predicate reads the writer's prose and a memo per
 *  founder is the one thing this instrument may not buy. What it CAN do is count
 *  how often the demotion fired on briefs that were really written — `pipeline.ts`
 *  records `dropped_watch_only` on every one, so production has been keeping the
 *  measurement all along.
 *
 *  This is a MAGNITUDE, not the stage. It says how often the assumption under
 *  the row cuts is perturbed at all; it cannot say which founders moved, in
 *  which direction, or past which rank. That still needs the writer.
 *
 *  Undefined on any failure, and the report then says the table was unreachable
 *  rather than quoting a remembered rate. Read-only, one query. */
async function watchOnlyRate(): Promise<{
  briefs: number; withDemotion: number; rows: number; share: number;
} | undefined> {
  const url = process.env.DATABASE_URL;
  if (!url) return undefined;
  try {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: url, connectionTimeoutMillis: 3000 });
    await client.connect();
    try {
      await client.query("SET statement_timeout = 3000");
      const res = await client.query(
        `SELECT count(*)::int AS briefs,
                count(*) FILTER (WHERE dropped_watch_only > 0)::int AS with_demotion,
                coalesce(sum(dropped_watch_only), 0)::int AS rows
           FROM brief_records`);
      const r = res.rows[0] as { briefs: number; with_demotion: number; rows: number };
      if (!r?.briefs) return undefined;
      return {
        briefs: r.briefs, withDemotion: r.with_demotion, rows: r.rows,
        share: r.with_demotion / r.briefs,
      };
    } finally { await client.end(); }
  } catch { return undefined; }
}

/** ── TWO READS OF ONE TABLE, AND THEY SHOULD BE ONE ────────────────────────
 *  `watchOnlyRate` above and `watchOnlyBudget` below both query `brief_records`
 *  for the same column, arrived at independently by two workstreams on the same
 *  night. Both are CALLED and they answer different questions -- the rate bounds
 *  the ladder's note, the distribution decides whether WRITER_CANDIDATE_CAP is a
 *  lever -- so neither is dead. They are nonetheless two implementations of one
 *  measurement, which is the shape this repo has been bitten by repeatedly, and
 *  the next person in this file should fold the rate into the budget rather than
 *  add a third.
 */
/** ── THE WATCH-ONLY BUDGET, FROM PRODUCTION'S OWN BRIEFS (wsGI) ────────────
 *
 *  `WRT-WATCH-ONLY` reads prose only the writer can produce, so this instrument
 *  cannot evaluate it per founder without paying for a memo each. It does not
 *  follow that the stage is unknowable: `recordBrief` has written
 *  `dropped_watch_only` on every brief this product has ever published, so the
 *  RATE is on record even though the per-founder verdict is not.
 *
 *  That distinction is the whole value of the number. It cannot be a survivor
 *  count in the ladder -- it is a different population, and blending it in
 *  would be the exact defect this file exists to remove -- but it BOUNDS what
 *  the two rows beneath it can be, and it is what decides whether
 *  `WRITER_CANDIDATE_CAP` is a lever or a decoration:
 *
 *    a candidate at rank r publishes iff r <= WRITER_CANDIDATE_CAP and
 *    r - w(r) <= PUBLISH_CAP, where w(r) is the watch-only rows above it
 *
 *  so rank PUBLISH_CAP+k is reachable only where at least k rows demote. The
 *  distribution here is therefore the ceiling on everything a wider cap could
 *  ever buy, and `caps.ts` cites it as the reason its constant does not move.
 *
 *  READ, NEVER RETYPED. A rate copied into a comment is a rate that stops
 *  moving the day the writer's behaviour does, which is precisely when it
 *  matters. Returns undefined on any failure -- a missing table, an unreachable
 *  database, a fresh deployment with no briefs yet -- and the report then says
 *  the budget was unreadable rather than printing a remembered figure. */
async function watchOnlyBudget(): Promise<{
  briefs: number; byCount: Map<number, number>; meanPerBrief: number;
  meanCandidates: number; from: string; to: string;
} | undefined> {
  const url = process.env.DATABASE_URL;
  if (!url) return undefined;
  let client: import("pg").Client | undefined;
  try {
    const { Client } = await import("pg");
    client = new Client({ connectionString: url, connectionTimeoutMillis: 5000 });
    await client.connect();
    await client.query("SET statement_timeout = 10000");
    const r = await client.query<{ wo: number; n: string }>(
      `SELECT COALESCE(dropped_watch_only, 0)::int AS wo, COUNT(*)::text AS n
         FROM brief_records WHERE candidate_count > 0 GROUP BY 1 ORDER BY 1`);
    if (!r.rows.length) return undefined;
    const agg = await client.query<{ briefs: string; mean: string; cand: string;
      from: string; to: string }>(
      `SELECT COUNT(*)::text AS briefs,
              AVG(COALESCE(dropped_watch_only, 0))::text AS mean,
              AVG(candidate_count)::text AS cand,
              MIN(created_at)::date::text AS from, MAX(created_at)::date::text AS to
         FROM brief_records WHERE candidate_count > 0`);
    const a = agg.rows[0];
    return {
      briefs: Number(a.briefs),
      byCount: new Map(r.rows.map((x) => [x.wo, Number(x.n)])),
      meanPerBrief: Number(a.mean), meanCandidates: Number(a.cand),
      from: a.from, to: a.to,
    };
  } catch { return undefined; }
  finally { await client?.end().catch(() => {}); }
}

/** ── THE RECALL FLOOR'S OWN LAST PUBLISHED FIGURES ─────────────────────────
 *
 *  Read from the guard verdict feed, which is the channel `check_verdicts.ts`
 *  already uses and the only one a reader without credentials has. Quoting the
 *  floor's numbers from memory here would create the fifth incomparable number
 *  in the very report written to stop the first four.
 *
 *  Returns undefined on any failure, and the table then says the feed was
 *  unreachable rather than printing a remembered figure. This is a comparison,
 *  not a gate: a blip must not fail a measurement run, and `check_verdicts` is
 *  where an unreachable feed is correctly fatal. */
async function lastRecallFloor(): Promise<{
  pool: number; exact5: number; n: number; set: string; split: string; takenAt: string;
} | undefined> {
  interface Row { takenAt?: string; metrics?: Record<string, unknown> }
  try {
    const reg = JSON.parse(readFileSync(
      path.join(process.cwd(), "..", "..", "data", "guard_registry.json"), "utf8"),
    ) as { feed?: { url?: string } };
    const url = process.env.GUARD_FEED_URL || reg.feed?.url;
    if (!url) return undefined;
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) return undefined;
    const feed = (await res.json()) as { guards?: Record<string, Row[]> };
    const rows = (feed.guards?.recall_floor ?? [])
      .filter((r) => typeof r.metrics?.pool === "number")
      .sort((a, b) => (b.takenAt ?? "").localeCompare(a.takenAt ?? ""));
    const r = rows[0];
    if (!r) return undefined;
    const m = r.metrics as Record<string, number | string>;
    return {
      pool: Number(m.pool), exact5: Number(m.exact5), n: Number(m.n),
      set: String(m.set ?? "an unrecorded set"),
      // The floor is pinned to the tune split in its own source and does not
      // publish it as a metric. Named here rather than left implicit, because
      // WHICH SPLIT a figure came from is half of what this report is about.
      split: "tune",
      takenAt: r.takenAt ?? "an unrecorded time",
    };
  } catch { return undefined; }
}

/** ── THE LAST PAID RUN'S RATE, RE-DERIVED FROM ITS TAPE ────────────────────
 *
 *  Read from the head-to-head's per-founder rows, never from its prose. A rate
 *  copied out of a report is a fifth incomparable number the moment the report
 *  is regenerated; a rate computed from the tape moves when the tape does, and
 *  the tape carries the fingerprint that says which founders it is about.
 *
 *  Returns undefined rather than a default if no tape exists. An estimate with
 *  no evidence behind it is the thing this whole instrument was built to stop. */
function estimateModelStage(): {
  file: string; fingerprint: string; n: number;
  controlHits: number; rankerHits: number; controlRate: number; rankerRate: number;
} | undefined {
  const dir = path.join(process.cwd(), "..", "..", "project-mgmt", "findings", "headtohead_wsGA");
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch { return undefined; }
  interface TapeRow {
    called?: boolean; reachable?: boolean;
    publishedControl?: string[]; publishedRanker?: string[]; won?: string;
  }
  interface Tape { arm?: string; drawFingerprint?: string; rows?: TapeRow[]; startedAt?: string }
  let best: { file: string; tape: Tape } | undefined;
  for (const f of files) {
    let tape: Tape;
    try { tape = JSON.parse(readFileSync(path.join(dir, f), "utf8")) as Tape; } catch { continue; }
    // Only an arm that actually called a model says anything about the model.
    // `off` and `reverse` are the free controls and would silently report a
    // ratio of exactly 1 — an estimate of "the model changes nothing", drawn
    // from a run in which there was no model.
    if (!tape.arm || tape.arm === "off" || tape.arm === "reverse" || tape.arm === "dry") continue;
    if (!tape.rows?.length) continue;
    if (!best || (tape.startedAt ?? "") > (best.tape.startedAt ?? "")) best = { file: f, tape };
  }
  if (!best) return undefined;
  const graded = (best.tape.rows ?? []).filter((r) => r.called && r.reachable);
  if (!graded.length) return undefined;
  const hit = (ids: string[] | undefined, won: string | undefined) =>
    Boolean(won && (ids ?? []).slice(0, TOP).includes(won));
  const controlHits = graded.filter((r) => hit(r.publishedControl, r.won)).length;
  const rankerHits = graded.filter((r) => hit(r.publishedRanker, r.won)).length;
  return {
    file: best.file, fingerprint: best.tape.drawFingerprint ?? "unrecorded", n: graded.length,
    controlHits, rankerHits,
    controlRate: controlHits / graded.length, rankerRate: rankerHits / graded.length,
  };
}

main().catch((e) => { console.error(e); process.exit(1); });
