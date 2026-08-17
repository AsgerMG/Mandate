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

import { BRIEF_LIMITS } from "../lib/intelligence/briefChecks";
import { parseDepth, SELECT_DEPTH, VERDICT_POOL, WRITER_CANDIDATE_CAP } from "../lib/intelligence/caps";
import {
  corpusProvenance, type DbInstrument, findPeersBySubsector, gateOverlayReport,
  hydrateDbInstruments,
  isGenericSubsector, loadDbInstruments, matchCompany, publishabilityContext,
  type PublishabilityContext, publishabilityFailures, publishableInstruments,
  requireLiveCorpus, resetGateHydration, setGateOverlay,
  suppressedForUnconfirmedLiveness,
} from "../lib/intelligence/corpus";
import { evaluateEligibility } from "../lib/intelligence/eligibility";
import { productionCannotPopulate, unofferableValues } from "../lib/intelligence/fieldReach";
import { ExclusionLog } from "../lib/intelligence/exclusions";
import { accessiblePool, orderMemoCandidates } from "../lib/intelligence/memoCandidates";
import { POOL_BLEND } from "../lib/intelligence/poolBlend";
import { POOL_RECALL_KS, poolRecallAt, poolRecallN } from "../lib/intelligence/poolRecall";
import {
  rankerTally, rankerTallyLine, requireCleanRanker, resetRankerTally, semanticFundMatch,
} from "../lib/intelligence/semantic";
import {
  applyProfileSignal, AWARD_TERM, buildInstrumentTableHydrated, founderCountryList,
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

/** ── EVERY MODULE-SCOPE ARM THAT CHANGES WHAT A FOUNDER IS SHOWN ───────────
 *
 *  Declared once, with its shipped default, so the levers line and the
 *  not-the-shipped-order banner are both DERIVED from this list rather than
 *  hand-written per arm. A third arm added next month is named and bannered
 *  with no edit to either site — which is the property, and the test for an
 *  unseen case is: is this value read once at module scope, and can two runs
 *  differing only in it produce different rows? Then it belongs here.
 *
 *  `value` is the SHIPPED CONSTANT, never `process.env`. A variable that never
 *  reached the run would otherwise label the report with the arm somebody
 *  meant, which is the exact false null this file's header was written about. */
const RANKING_ARMS: { label: string; env: string; value: string; shipped: string }[] = [
  { label: "row_order", env: "POOL_BLEND", value: POOL_BLEND, shipped: "off" },
  { label: "award_term", env: "AWARD_TERM", value: AWARD_TERM, shipped: "shipped" },
];

const num = (v: string | undefined, d: number) =>
  (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : d);

/** ── THE DEPTHS THE LADDER IS EVALUATED AT ─────────────────────────────────
 *
 *  `POOL_SWEEP=18,25,40,60,all` runs the WHOLE funnel at each depth. Unset, the
 *  list is `[VERDICT_POOL]` and the run does exactly what it did before.
 *
 *  ── WHY A SWEEP IS ONE RUN AND NOT FIVE ──────────────────────────────────
 *  Everything above the cut — the intake, the Voyage embedding, the gate
 *  hydration, `accessiblePool` — is independent of this number. Only
 *  `accessible.slice(0, K)` and everything after it moves. So five depths are
 *  five projections of ONE pool object per founder: the same founders, the same
 *  embeddings, the same gates, one draw fingerprint. Five separate runs would be
 *  five times the wall clock and five times the embedding spend, and would then
 *  have to be compared UNPAIRED.
 *
 *  ── WHAT A FREE SWEEP CAN AND CANNOT SEE, SAID BEFORE THE NUMBERS ────────
 *  For K' > K, `accessible.slice(0, K')` is a SUPERSET of `accessible.slice(0,
 *  K)` WITH AN IDENTICAL PREFIX, and `orderMemoCandidates` no longer sorts. So
 *  with no model in the loop there is exactly ONE mechanism by which a wider
 *  pool can change the rows below it: `resolveNameCollisions` picks a label
 *  class's survivor by `preferBetterEvidencedRow`, a total order INDEPENDENT OF
 *  POSITION, so a better-evidenced sibling admitted at rank 30 can demote the
 *  row that held that label at rank 3. That channel is counted directly below
 *  rather than inferred from the won fund, because it is the entire
 *  deterministic downside of widening and "the won fund did not move" is not the
 *  same statement as "nothing moved".
 *
 *  The value of widening is realised at the stage this instrument may not buy.
 *  What it CAN establish is the model's CEILING at each K — nobody outside
 *  `pool_cut` is reachable by any ranker at any price — and the exact
 *  deterministic cost of getting there.
 *
 *  The shipped default is always a member of the list, so the sweep's baseline
 *  column IS the table above it, produced by the same code rather than by a
 *  second definition of the same ladder. */
const SWEEP_KS: number[] = (() => {
  const raw = process.env.POOL_SWEEP;
  const ks = (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean)
    .map((s) => parseDepth(s, `POOL_SWEEP element "${s}"`, { all: true }));
  return [...new Set([VERDICT_POOL, ...ks])].sort((a, b) => a - b);
})();

/** ── A PROPOSED GATE ENCODING, MEASURED WITHOUT BEING WRITTEN ──────────────
 *
 *  `GATE_OVERLAY=<path to a corrections jsonl>` runs the WHOLE ladder a second
 *  time per founder with those comparators served instead of the store's, and
 *  prints the two arms side by side.
 *
 *  ── The gap this closes ──────────────────────────────────────────────────
 *  A gate-encoding correction is a proposal until its owner approves it, and
 *  approving it means a write to the store the product serves from. Until now
 *  the only thing that could report on a proposal was
 *  `_wsgu_counterfactual.ts`, which applies the corrections in memory to the
 *  COMMITTED SNAPSHOT and re-runs `assessInstrument` alone: it can say what a
 *  guard's counter becomes (251 wrongful deletions to 14) and it cannot say
 *  what a founder would see, because it contains no ranker, no pool cut and no
 *  writer cap. The owner was being asked to authorise a write on the strength
 *  of a guard's internal counter. This is how he gets the product number
 *  instead, and it writes nothing.
 *
 *  ── Why the arms are PAIRED INSIDE ONE RUN ───────────────────────────────
 *  The shipped ordering drifts between runs while other workstreams republish
 *  `instrument_profiles` (wsGY watched a few founders move in a couple of
 *  hours), so a before-run and an after-run are not comparable at the founder.
 *  Both arms here see the same draw, the same intake, the same corpus read and
 *  the same embedding — `semanticFundMatch` caches by description, so the
 *  second arm costs no extra Voyage call and the ranker attestation still
 *  counts every request as EMBEDDING. What differs between the arms is exactly
 *  63 comparators, which is what makes the difference attributable to them.
 *
 *  ── It refuses rather than reports a flattering zero ─────────────────────
 *  An overlay that applied nothing would print "the corrections change
 *  nothing", which is both the most consequential possible finding and the
 *  easiest one to produce by accident. So the run fails if the file is
 *  unreadable, if it is empty, if any row's stored comparator is not the one
 *  the proposal was written against (drift), or if no proposed comparator was
 *  ever served. */
interface GateProposal {
  instrument_id: string;
  gate_key: string;
  action?: string;
  clause?: string;
  current_value_spec: unknown;
  proposed_value_spec: unknown;
}

function loadGateProposal(): { file: string; rows: GateProposal[] } | undefined {
  const file = process.env.GATE_OVERLAY;
  if (!file) return undefined;
  const abs = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
  const rows = readFileSync(abs, "utf8").split("\n").filter((l) => l.trim())
    .map((l) => JSON.parse(l) as GateProposal);
  if (!rows.length) {
    throw new Error(`measure_funnel: GATE_OVERLAY=${file} holds no rows. A counterfactual `
      + "arm that changes nothing would report the corrections as harmless, which is the "
      + "one conclusion this must never reach by accident.");
  }
  return { file, rows };
}

/** ── A DERIVED INTAKE ANSWER, MEASURED WITHOUT BEING ADOPTED ──────────────
 *
 *  `USE_OF_FUNDS=<path to a {company: {uses, basis}} json>` runs the WHOLE
 *  ladder a second time per founder with that founder's `useOfFunds` in place
 *  of the harness's pin, and prints the two arms side by side.
 *
 *  ── The gap this closes ──────────────────────────────────────────────────
 *  `founderIntake` pins `useOfFunds` for all 897 founders and says why: the
 *  only derivation previously available read the register's `objectives_text`,
 *  a statement about the SCHEME, and `objectiveScorer` ranks on that same
 *  field. `door_separation_wsHA` §6 then measured that the corpus declares a
 *  DIFFERENT purpose for the two doors on 30.0% of the pairs that cost us a
 *  founder — the largest identified, statable, already-collected separator on
 *  that population — and could not price it, because the harness holds the
 *  field constant. This is how it gets priced.
 *
 *  ── Why it is the same seam as GATE_OVERLAY and not a new one ────────────
 *  Same reason, same shape: the shipped ordering drifts between runs while
 *  other workstreams republish `instrument_profiles`, so a before-run and an
 *  after-run are not comparable at the founder. Both arms here see the same
 *  draw, the same corpus read and the same embedding — `semanticFundMatch`
 *  caches by description, and the description is identical in both arms, so
 *  the second arm costs no extra Voyage call.
 *
 *  ── The control is INSIDE the arm, which a gate overlay cannot manage ────
 *  A founder whose derived answer set-equals the pin is served an identical
 *  request in both arms. Their two traces must therefore be identical, and any
 *  founder for whom they are not is proof the corpus moved between the arms.
 *  That is a drift detector the gate arm has to buy with `expect`/`spec`
 *  bookkeeping, and here it is free. It is fatal, below.
 *
 *  ── It refuses rather than reports a flattering zero ─────────────────────
 *  The run fails if the file is unreadable or empty, if no founder's answer
 *  actually changed, or if a control founder's two traces differ. */
interface UseOfFundsArm {
  file: string;
  /** company name -> the answer that replaces the pin. Only non-empty ones. */
  byCompany: Map<string, string[]>;
  /** How many rows the file held, including the ones that answer nothing. */
  rows: number;
}

function loadUseOfFundsArm(): UseOfFundsArm | undefined {
  const file = process.env.USE_OF_FUNDS;
  if (!file) return undefined;
  if (process.env.GATE_OVERLAY) {
    throw new Error(
      "measure_funnel: GATE_OVERLAY and USE_OF_FUNDS are both set. There is one "
      + "counterfactual arm, so running both would attribute the difference between the "
      + "arms to two changes at once. Run them separately.");
  }
  const abs = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
  const raw = JSON.parse(readFileSync(abs, "utf8")) as
    Record<string, { uses?: string[] } | string[]>;
  const byCompany = new Map<string, string[]>();
  let rows = 0;
  for (const [company, v] of Object.entries(raw)) {
    rows++;
    const uses = Array.isArray(v) ? v : (v.uses ?? []);
    if (uses.length) byCompany.set(company, uses);
  }
  if (!byCompany.size) {
    throw new Error(
      `measure_funnel: USE_OF_FUNDS=${file} carries ${rows} row(s) and not one non-empty `
      + "answer. A counterfactual arm that changes nothing would report the derived answer "
      + "as harmless, which is the one conclusion this must never reach by accident.");
  }
  return { file, byCompany, rows };
}

/** ── THE SECOND ARM'S FOUNDER ─────────────────────────────────────────────
 *
 *  `founderIntake` has already applied the production-reach rule and the
 *  offerable-value rule to arm A's answers. Both are re-applied here rather
 *  than assumed, over the SAME functions, because a value this harness invents
 *  is exactly as capable of being one production cannot serve as a value it
 *  derived — and the whole point of `founderIntake` is that nothing gets to
 *  skip those two rules by arriving through a different door.
 *
 *  A founder with no derived answer is returned UNCHANGED and keeps the pin,
 *  the same fallback `answersFor` uses for a `ticketBand` it cannot derive: the
 *  denominator must not move with the derivation. */
function withDerivedUseOfFunds(
  f: ReturnType<typeof founderIntake>, uses: string[] | undefined,
): { founder: ReturnType<typeof founderIntake>; changed: boolean } {
  if (!uses?.length) return { founder: f, changed: false };
  if (productionCannotPopulate("useOfFunds")) {
    throw new Error(
      "measure_funnel: USE_OF_FUNDS was given an answer for a field production cannot "
      + "populate. A replayed founder who carries a value production can never carry is not "
      + "a founder, and every stage measured below it inherits the error.");
  }
  const draft = { ...f.eligibility, useOfFunds: uses };
  const off = unofferableValues("useOfFunds", uses, draft as never);
  if (off.length) {
    throw new Error(
      `measure_funnel: USE_OF_FUNDS answered ${off.map((v) => `"${v}"`).join(", ")} for `
      + `"${f.company}", which the control never offers. A gate that fires on an answer no `
      + "founder can give is a gate no founder meets.");
  }
  const before = [...(f.eligibility.useOfFunds ?? [])].sort().join("|");
  const changed = before !== [...uses].sort().join("|");
  return { founder: { ...f, eligibility: draft }, changed };
}

/** A depth for a column heading. `Infinity` is the whole accessible pool, and
 *  printing `Infinity` would be the one thing a reader cannot act on. */
const kLabel = (k: number) => (Number.isFinite(k) ? String(k) : "all");

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
   *  writer is shown, AT EACH SWEPT DEPTH. This is the head-to-head's
   *  `rankControl`, and at `VERDICT_POOL` it is the shipped one.
   *
   *  The id list is carried beside the rank because the won fund not moving is
   *  a weaker statement than nothing moving, and the only deterministic
   *  mechanism a wider pool has (see `SWEEP_KS`) acts on rows this founder did
   *  not win. */
  writerAt: Map<number, { rank: number | null; ids: string[] }>;
  tableLen: number;
  accessibleLen: number;
}

/** The shipped seam's rank, so every reader of the default ladder asks for it
 *  by meaning rather than by looking a depth up in a map. */
const rankWriter = (t: Trace, pool: number): number | null =>
  t.writerAt.get(pool)?.rank ?? null;

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
 *  story about the funnel rather than a measurement of it.
 *
 *  ── IT IS A FUNCTION OF THE POOL DEPTH, AND THAT IS THE SWEEP ────────────
 *  `pool` is the only thing in the funnel a sweep changes, so it is a PARAMETER
 *  rather than a module constant read in six places. The report's own table is
 *  `ladderAt(VERDICT_POOL)`; a swept column is the SAME function at another
 *  depth. There is therefore no second definition of "the funnel" that could
 *  drift from the first — which is the failure this whole instrument was built
 *  to remove, arriving one level up. */
function ladderAt(pool: number): Stage[] { return [
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
    question: `... and it survives the cut to VERDICT_POOL (${kLabel(pool)} rows)`,
    alive: (t) => t.rankAccessible != null && t.rankAccessible <= pool,
  },
  {
    id: "writer_cap",
    question: `... and it survives the cut to the writer's candidates (${WRITER_CANDIDATE_CAP})`,
    // `orderMemoCandidates().toWriter`. Also applies the name-collision
    // DEMOTION, which can push a row over the cap without deleting it.
    alive: (t) => rankWriter(t, pool) != null,
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
      + "below are neither an upper nor a lower bound — see the note under the table.",
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
    alive: (t) => { const r = rankWriter(t, pool); return r != null && r <= n; },
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
    question: `... and the MODEL, which re-orders the ${kLabel(pool)} before the cuts below, `
      + `still leaves it in the first ${TOP}`,
    alive: () => null,
    unmeasured:
      "one Anthropic call per founder. It re-orders the pool ABOVE the writer cap rather "
      + "than removing anything, so it has no survivor set of its own and cannot be a row "
      + "in a nested ladder; its effect is estimated below from the last paid head-to-head's "
      + "own tape, at the end where it becomes observable, and is never measured here.",
  },
]; }

/** The shipped ladder. Everything the report prints outside the sweep section
 *  is this one, so the default output is unchanged by the sweep existing. */
const STAGES: Stage[] = ladderAt(VERDICT_POOL);

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
function assertNested(t: Trace, stages: Stage[], verdicts: (boolean | null)[]): void {
  let dead = false;
  for (let i = 0; i < verdicts.length; i++) {
    const v = verdicts[i];
    if (v === null) continue;
    if (dead && v === true) {
      throw new Error(
        `measure_funnel: stage \`${stages[i].id}\` says the won fund is still present for `
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
/** ── IT IS THE FILTER'S OWN LIST, NOT A COPY OF IT (wsGT) ──────────────────
 *
 *  Seven predicates were restated here, and the docstring above already knew
 *  what that costs: `publishableInstruments()` and its explanation drifted
 *  once, and every row dropped for some other reason that happened to also be
 *  a closed scheme with a successor was reported as a closure. The fix was to
 *  make the filter and its explanation the same code — `publishabilityFailures`
 *  in corpus.ts — and this harness never moved onto it.
 *
 *  It drifted again, the same way and on the same clause. The closure test here
 *  read `isClosed`, i.e. "has the window we hold shut", while the filter asks
 *  `isShut`, "and does anything recorded on the row contradict the programme
 *  having ended". A between-calls row is closed by the first and publishable by
 *  the second, so this list would have attributed a loss to a clause that did
 *  not remove the row.
 *
 *  So it CALLS the definition. `wsgl_corpus_stage.ts` already did; this is the
 *  last restatement. The `unattributed` counter below is what remains of the
 *  hazard, and it is now the only one it can have: a clause added to the filter
 *  arrives here for free. */
function whyNotPublishable(i: DbInstrument, ctx: PublishabilityContext): string[] {
  return publishabilityFailures(i, ctx);
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
  // The filter's OWN context, so the attribution below is the filter's own
  // list rather than a seventh restatement of it. See `whyNotPublishable`.
  const pubCtx = publishabilityContext(corpus);
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

  // ── THE COUNTERFACTUAL ARM ────────────────────────────────────────────────
  // Empty unless GATE_OVERLAY names a proposal. `tracesB` is the SAME founders
  // in the same order, so every comparison below is paired at the founder and
  // no seed has to match for it to be.
  const proposal = loadGateProposal();
  const overlayMap = new Map<string, { expect: unknown; spec: unknown }>(
    (proposal?.rows ?? []).map((c) => [
      `${c.instrument_id} ${c.gate_key}`,
      { expect: c.current_value_spec, spec: c.proposed_value_spec },
    ]));
  const tracesB: Trace[] = [];
  const overlayEverApplied = new Set<string>();
  const overlayDriftSeen = new Set<string>();

  // ── THE SECOND KIND OF COUNTERFACTUAL ARM ─────────────────────────────────
  // Same `tracesB`, same pairing, same process. What differs between the arms
  // is one intake answer instead of a set of comparators.
  const uof = loadUseOfFundsArm();
  /** Founders whose answer actually moved, and founders it did not — the
   *  second list is the arms' own control and is checked for drift below. */
  const uofChanged: string[] = [];
  const uofControl: number[] = [];
  if (uof) {
    console.log(`counterfactual arm: derived \`useOfFunds\` for ${uof.byCompany.size} of `
      + `${uof.rows} founder(s) from ${uof.file}\n  every founder runs the ladder TWICE — `
      + "the harness's pin, then their own derived answer — paired, in this process, "
      + "writing nothing\n");
  }
  if (proposal) {
    console.log(`counterfactual arm: ${proposal.rows.length} proposed comparators from `
      + `${proposal.file}\n  every founder runs the ladder TWICE — the store's encoding, `
      + "then the proposal — paired, in this process, writing nothing\n");
  }

  console.log(
    `one funnel · set=${setFile} split=${split} · ${drawn.length} founder(s)`
    + `${n > 0 ? ` sampled of ${population.length}` : " (the whole population)"}`
    + ` · draw ${fingerprint}\n`);

  // ── ONE FOUNDER'S PASSAGE, SO IT CAN BE RUN TWICE ────────────────────────
  // Extracted for the counterfactual arm and for nothing else: both arms must
  // be the SAME code, or the difference between them is a difference between
  // two harnesses. Every gate-dependent step is inside — the table build (which
  // fetches gates), `accessiblePool` (which reads their verdicts) and the
  // writer cut below it.
  const passage = async (f: ReturnType<typeof founderIntake>, won: string) => {
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
    const tableLen = hydrated.length;
    const iTable = hydrated.map((r: InstrumentRow) => r.instrumentId).indexOf(won);
    const rankTable = iTable < 0 ? null : iTable + 1;

    const accessible = applyProfileSignal(
      accessiblePool(hydrated, f.eligibility as never, log), undefined, undefined);
    const accessibleLen = accessible.length;
    const iAcc = accessible.map((r) => r.instrumentId).indexOf(won);
    const rankAccessible = iAcc < 0 ? null : iAcc + 1;

    // The writer's candidates, through production's own function on
    // production's own cut. `orderMemoCandidates` no longer sorts -- it
    // carries the incoming order and applies the name-collision demotion and
    // the writer cap -- so this is the published ordering minus the model.
    //
    // ── THE SWEEP, AND WHY IT IS THIS LINE AND NOTHING ABOVE IT ──────────
    // `accessible` is the expensive object: one Voyage embedding and one gate
    // hydration bought it. Every depth is a projection of it, so the loop is
    // here rather than around the whole run, and the arms are paired to the
    // founder by construction rather than by a matching seed.
    const writerAt = new Map<number, { rank: number | null; ids: string[] }>();
    for (const k of SWEEP_KS) {
      const poolCut = accessible.slice(0, k);
      const poolIds = poolCut.map((r) => r.instrumentId)
        .filter((id): id is string => Boolean(id));
      const toWriter = orderMemoCandidates({
        instrumentTable: poolCut,
        req: {
          company: f.company, country: f.country, description: f.opts.description,
          capitalSought: f.opts.capitalSought, eligibility: f.eligibility,
          targetMarkets: undefined,
        } as never,
        records: [], dbPeers,
        eligibilityScreen: evaluateEligibility(f.eligibility as never, poolIds),
        log: new ExclusionLog(),
      }).toWriter.map((x) => x.row.instrumentId ?? x.row.channel);
      const iW = toWriter.indexOf(won);
      writerAt.set(k, { rank: iW < 0 ? null : iW + 1, ids: toWriter });
    }
    return { rankTable, rankAccessible, writerAt, tableLen, accessibleLen };
  };

  /** A founder whose answer never reached the founder stages. Not "lost
   *  nothing": the ladder's corpus rows have already recorded why. */
  const noPassage = () => ({
    rankTable: null as number | null, rankAccessible: null as number | null,
    writerAt: new Map<number, { rank: number | null; ids: string[] }>(),
    tableLen: 0, accessibleLen: 0,
  });

  /** Run a founder's passage with a given gate encoding in force. The reset is
   *  INSIDE, because the arms differ only in what hydration returns and each
   *  therefore has to start from the cold corpus a request starts from. */
  const arm = async (
    f: ReturnType<typeof founderIntake>, won: string,
    overlay?: Map<string, { expect: unknown; spec: unknown }>,
  ) => {
    resetGateHydration();
    setGateOverlay(overlay);
    try {
      const pass = await passage(f, won);
      // Read BEFORE the overlay comes off: `setGateOverlay` clears the
      // attestation, so a report taken after the removal would say the
      // proposal was never applied on every single founder.
      return { pass, applied: overlay ? gateOverlayReport() : undefined };
    } finally {
      setGateOverlay(undefined);
    }
  };

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
      const why = whyNotPublishable(byId.get(won) as DbInstrument, pubCtx);
      if (!why.length) unattributed++;
      for (const w of why) lostReasons.set(w, (lostReasons.get(w) ?? 0) + 1);
    }

    // The founder stages are only asked of a founder whose answer survived the
    // corpus stages. Asking them of the rest would cost a Voyage call per
    // founder to establish a `false` the ladder already knows, and the nesting
    // property is what makes that sound rather than a shortcut.
    const a = isOfferable ? await arm(f, won) : { pass: noPassage(), applied: undefined };

    const trace: Trace = {
      company: t.name, country: t.country, won,
      inCorpus: heldByCorpus, offerable: isOfferable, degraded: wasDegraded,
      ...a.pass,
    };
    // Every swept depth is checked, not just the shipped one. A sweep that
    // reported a non-nested column would be reporting a funnel that is not a
    // funnel, and the whole point of generating the columns from `ladderAt` is
    // that the property travels with them.
    for (const k of SWEEP_KS) {
      const ladder = ladderAt(k);
      assertNested(trace, ladder, ladder.map((s) => s.alive(trace)));
    }
    traces.push(trace);

    // ── THE SAME FOUNDER, WITH THE PROPOSED COMPARATORS ────────────────────
    // Second, so the shipped arm is never the one that inherits a warmed cache
    // or a mutated corpus, and immediately, so the two arms are separated by
    // milliseconds rather than by a republish.
    if (proposal) {
      const b = isOfferable
        ? await arm(f, won, overlayMap) : { pass: noPassage(), applied: undefined };
      for (const k of b.applied?.applied ?? []) overlayEverApplied.add(k);
      for (const d of b.applied?.drift ?? []) overlayDriftSeen.add(d);
      const traceB: Trace = {
        company: t.name, country: t.country, won,
        inCorpus: heldByCorpus, offerable: isOfferable, degraded: wasDegraded,
        ...b.pass,
      };
      for (const k of SWEEP_KS) {
        const ladder = ladderAt(k);
        assertNested(traceB, ladder, ladder.map((s) => s.alive(traceB)));
      }
      tracesB.push(traceB);
    }

    // ── THE SAME FOUNDER, WITH THEIR OWN DERIVED ANSWER ────────────────────
    // Second for the same reason the gate arm is: the shipped arm never
    // inherits a warmed cache or a mutated corpus, and the two arms are
    // separated by milliseconds rather than by a republish.
    if (uof) {
      const { founder: fB, changed } = withDerivedUseOfFunds(f, uof.byCompany.get(t.name));
      if (changed) uofChanged.push(t.name); else uofControl.push(tracesB.length);
      const b = isOfferable ? await arm(fB, won) : { pass: noPassage(), applied: undefined };
      const traceB: Trace = {
        company: t.name, country: t.country, won,
        inCorpus: heldByCorpus, offerable: isOfferable, degraded: wasDegraded,
        ...b.pass,
      };
      for (const k of SWEEP_KS) {
        const ladder = ladderAt(k);
        assertNested(traceB, ladder, ladder.map((s) => s.alive(traceB)));
      }
      tracesB.push(traceB);
    }
    if (traces.length % 50 === 0) console.log(`  ${traces.length}/${drawn.length}`);
  }


  writeFounderTrace(traces, byId, startedAt);

  // ── THE TABLE ─────────────────────────────────────────────────────────────
  const N = traces.length;
  const rows = funnelRows(STAGES, traces);

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
    + `published_cap=${PUBLISH_CAP} top=${TOP} select_depth=${kLabel(SELECT_DEPTH)} `
    + `${RANKING_ARMS.map((a) => `${a.label}=${a.value}`).join(" ")}`);
  if (SWEEP_KS.length > 1) {
    p(`pool swept at      ${SWEEP_KS.map(kLabel).join(", ")} — the whole ladder at each, `
      + `paired off one pool object`);
  }
  p("```");
  p();
  // ── A RUN THAT DID NOT USE THE SHIPPED ORDERING MUST SAY SO ───────────────
  // `latest.md` is the file that gets quoted, and it used to name nothing about
  // the ordering that produced it: these arms are read at module scope inside
  // `shortlist.ts` and `poolBlend.ts`, so an arm run and a baseline run wrote
  // byte-comparable headers and differed only in the numbers -- which is
  // precisely the shape that let four figures on four populations be compared
  // to each other.
  //
  // A LIST, NOT TWO `if`s. `RANKING_ARMS` is the one place an arm is declared
  // with its shipped default, so the levers line above and the banner below are
  // both derived from it and a THIRD arm added next month is named and bannered
  // with no edit here. The property: any module-scope lever that changes what a
  // founder is shown appears on the levers line, and any one of them off its
  // shipped default banners the run.
  for (const a of RANKING_ARMS.filter((x) => x.value !== x.shipped)) {
    p(`██ NOT THE SHIPPED ORDER — this run ranked every founder's table with `
      + `\`${a.env}=${a.value}\` (shipped: \`${a.shipped}\`), an arm no founder `
      + `receives. Every number below is a measurement of that arm, not of the product. `
      + `Do not quote a row from this run beside a row from a shipped run without saying `
      + `which is which.`);
    p();
  }
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

  // ── THE COUNTERFACTUAL ARM ────────────────────────────────────────────────
  const counterfactual = proposal
    ? counterfactualReport(traces, tracesB, proposal, overlayEverApplied, overlayDriftSeen)
    : uof
      ? useOfFundsReport(traces, tracesB, uof, uofChanged, uofControl)
      : undefined;
  if (counterfactual) { for (const line of counterfactual.lines) p(line); p(); }

  // ── THE SWEEP ─────────────────────────────────────────────────────────────
  const sweep = SWEEP_KS.length > 1 ? sweepReport(traces, SWEEP_KS, est) : undefined;
  if (sweep) { for (const line of sweep.lines) p(line); p(); }
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
  // No count here. "Every founder here answers 23 fields" was a literal, and it
  // was false in both directions on the day it was written: 23 is how many the
  // intake HAS, eight is how many carried a value, and one of the eight was a
  // question production does not ask. The block at the top of this report is
  // the derived answer to all three, so this bullet points at it instead of
  // restating a number that cannot follow it.
  p("- **the intake.** A replayed founder's answers are resolved from their own "
    + "register history, not typed into the first screen a real founder fills in — "
    + "and the founder-intake block above says, field by field, which carried a "
    + "value, which were withheld for want of an honest source, and which were held "
    + "back because production cannot populate them. A ceiling measured on these "
    + "answers bounds THIS harness, not the product.");
  p("- **`discoverAndResearch`, `judgeOpenAnswers` and the `ProfileSignal`** are model "
    + "calls on the live request path. They are absent here, so `applyProfileSignal` "
    + "attaches nothing and the adaptive round's `lateFields` is empty.");
  p("- **REGIME@5 is deliberately not a row.** It credits a SIBLING of the won fund, so "
    + "a founder can be lost at one stage and credited at a later one — which breaks the "
    + "nesting property this whole ladder rests on. It is a different question (did we "
    + "send them to the right funder) and it needs its own ladder, not a row in this one.");
  p();

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

  // ── AND NOTHING IS WRITTEN BY A COUNTERFACTUAL THAT NEVER FIRED ──────────
  // The failure this closes is specific: an overlay that reached no gate
  // produces two identical arms and a report saying the proposal changes
  // nothing, which is the most consequential conclusion this instrument can
  // reach and the easiest one to reach by accident. Drift is fatal for the
  // same reason it is fatal in the applier — a proposal written against a
  // comparator the store no longer holds is a proposal about something else.
  // Scoped to `proposal`, not to `counterfactual`: there is now a second kind
  // of counterfactual arm and neither of these two refusals is about it. A
  // derived-answer run tripped the "no comparator was ever served" throw
  // because it serves no comparators by design.
  if (proposal) {
    if (overlayDriftSeen.size) {
      throw new Error(
        `measure_funnel: ${overlayDriftSeen.size} proposed comparator(s) were written against `
        + "a stored value the store no longer holds, so the counterfactual arm measured a "
        + "mixture of the proposal and the corpus that moved under it. Re-derive the "
        + `proposal against the current store. First: ${[...overlayDriftSeen][0]}`);
    }
    if (!overlayEverApplied.size) {
      throw new Error(
        "measure_funnel: the counterfactual arm ran and NOT ONE proposed comparator ever "
        + "reached the engine. The two arms are therefore identical by construction, and "
        + "reporting that as \"the proposal changes nothing\" would be the worst output this "
        + "harness can produce. Check that GATE_OVERLAY's ids match the store's.");
    }
  }

  // ── AND THE SAME TWO REFUSALS FOR THE DERIVED-ANSWER ARM ─────────────────
  // Not one founder changed is the same flattering zero as an overlay that
  // reached no gate. The control check is the stronger of the two and has no
  // equivalent on the gate arm: a founder whose derived answer equals the pin
  // was served an IDENTICAL request in both arms, so their two traces must be
  // identical. One that is not is proof the corpus moved between the arms, and
  // the delta this run reports would be a mixture of the answer and the drift.
  if (uof) {
    if (!uofChanged.length) {
      throw new Error(
        "measure_funnel: the derived-answer arm ran and NOT ONE founder's `useOfFunds` "
        + "actually changed. The two arms are identical by construction, and reporting that "
        + "as \"the derived answer changes nothing\" would be the worst output this harness "
        + `can produce. Check that USE_OF_FUNDS=${uof.file} is keyed by company name.`);
    }
    const drifted: string[] = [];
    for (const i of uofControl) {
      const a = traces[i], b = tracesB[i];
      const same = a.inCorpus === b.inCorpus && a.offerable === b.offerable
        && a.degraded === b.degraded && a.rankTable === b.rankTable
        && a.rankAccessible === b.rankAccessible && a.tableLen === b.tableLen
        && a.accessibleLen === b.accessibleLen
        && SWEEP_KS.every((k) =>
          (a.writerAt.get(k)?.ids ?? []).join("|") === (b.writerAt.get(k)?.ids ?? []).join("|"));
      if (!same) drifted.push(a.company);
    }
    if (drifted.length) {
      throw new Error(
        `measure_funnel: ${drifted.length} of ${uofControl.length} CONTROL founders — whose `
        + "derived answer equals the pin, so both arms served them an identical request — "
        + "have different traces in the two arms. The corpus moved under this run and the "
        + "delta is a mixture of the derived answer and that movement. Re-run. "
        + `First: ${drifted[0]}`);
    }
    console.log(`derived-answer arm: ${uofChanged.length} founder(s) changed, `
      + `${uofControl.length} control founder(s) byte-identical across both arms`);
  }

  const dir = path.join(process.cwd(), "..", "..", "project-mgmt", "findings", "one_funnel");
  mkdirSync(dir, { recursive: true });
  // ── A COUNTERFACTUAL RUN DOES NOT BECOME `latest.md` ─────────────────────
  // `latest.md` is the file that gets quoted, planned from and committed, and
  // every figure in it should be one a founder receives. This run's baseline
  // arm IS such a figure, but the file would also carry a proposed column, and
  // a number that is quoted is a number that will eventually be quoted without
  // its banner. So the counterfactual writes its own named file and leaves the
  // shipped one alone.
  // A derived-intake run and a gate-proposal run are different counterfactuals
  // and must not overwrite each other's file: two arms named the same thing is
  // how a reader ends up comparing one proposal's number with another's.
  const cfName = uof ? "useoffunds_latest" : "counterfactual_latest";
  writeFileSync(path.join(dir, counterfactual ? `${cfName}.md` : "latest.md"), out);
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
    levers: {
      VERDICT_POOL, WRITER_CANDIDATE_CAP, PUBLISH_CAP, TOP, rowCuts: ROW_CUTS,
      // The ordering arms, so the series in `runs/` can never contain a point
      // nobody can attribute to a code path. `rowOrder` keeps its own key
      // because every run file already written carries it and a series is not
      // re-readable if a field is renamed under it. See the banner above.
      rowOrder: POOL_BLEND,
      arms: Object.fromEntries(RANKING_ARMS.map((a) => [a.env, a.value])),
    },
    // Null on a run with no sweep, never absent: a series where the field comes
    // and goes cannot be asked "was this run swept" without inspecting prose.
    poolSweep: sweep?.record ?? null,
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
    // Null on a run with no proposal, never absent — for the same reason
    // `poolSweep` is. A point in this series must be answerable to "was this
    // the shipped encoding" without a human reading prose.
    counterfactual: counterfactual?.record ?? null,
  };
  const body = `${JSON.stringify(record, null, 1)}\n`;
  // Same argument as `latest.md` above, and the same for the history: a run
  // carrying a proposed arm is not a point in the series of what the product
  // does, and a series that mixes the two cannot be read as either.
  if (counterfactual) {
    writeFileSync(path.join(dir, `${cfName}.json`), body);
  } else {
    writeFileSync(path.join(dir, "latest.json"), body);
    writeRunHistory(dir, startedAt, body);
  }
  console.log(`wrote ${path.join(dir, counterfactual ? `${cfName}.md` : "latest.md")}`);
}

/** One column of the funnel: a stage list evaluated over one population.
 *
 *  Extracted so the sweep's columns and the report's own table come from ONE
 *  counting rule. Two implementations of "how many founders survived stage s"
 *  is exactly the shape of defect this file's header is about, and a sweep is a
 *  standing invitation to write the second one. */
interface FunnelRow {
  stage: Stage; remaining: number | null; share: number | null;
  loss: number | null; lossShare: number | null;
}
function funnelRows(stages: Stage[], traces: Trace[]): FunnelRow[] {
  const N = traces.length;
  const out: FunnelRow[] = [];
  let prev = N;
  for (const s of stages) {
    const verdicts = traces.map((t) => s.alive(t));
    const anyMeasured = verdicts.some((v) => v !== null);
    if (!anyMeasured) {
      out.push({ stage: s, remaining: null, share: null, loss: null, lossShare: null });
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
    out.push({
      stage: s, remaining, share: (100 * remaining) / N,
      loss: prev - remaining, lossShare: (100 * (prev - remaining)) / N,
    });
    prev = remaining;
  }
  return out;
}

/** ── THE COUNTERFACTUAL SECTION ────────────────────────────────────────────
 *
 *  Two arms of the SAME ladder on the SAME founders in the SAME process: the
 *  gate encoding the store holds, and the one a proposal would put there. It
 *  reports the whole funnel both ways, because a proposal that moves one row
 *  and costs another is a different decision from one that moves a row for
 *  free, and a single number cannot tell them apart.
 *
 *  ── The attestation comes FIRST, and it can fail the run ─────────────────
 *  The dangerous output of this section is "the proposal changes nothing",
 *  which is indistinguishable from "the overlay never fired". So the number of
 *  proposed comparators that were ACTUALLY SERVED to the engine is printed
 *  above the tables, drift is printed by name, and both are asserted by the
 *  caller before anything is written to disk.
 *
 *  ── Paired, so the interval is on the DISCORDANT founders ────────────────
 *  A founder either moved or did not; the ones who did not carry no
 *  information about whether the proposal works. So the movement is reported
 *  as `entered` and `left` separately — never as a net alone — with an exact
 *  two-sided binomial on the discordant pairs, which is McNemar's test without
 *  the normal approximation that a handful of movers would not support. */
function exactMcNemarP(entered: number, left: number): number {
  const n = entered + left;
  if (!n) return 1;
  // Exact two-sided binomial at p=0.5: sum the pmf of every outcome no more
  // likely than the observed one. With p=0.5 the pmf is symmetric, so that is
  // twice the smaller tail, capped at 1.
  const logFact: number[] = [0];
  for (let i = 1; i <= n; i++) logFact[i] = logFact[i - 1] + Math.log(i);
  const pmf = (k: number) =>
    Math.exp(logFact[n] - logFact[k] - logFact[n - k] - n * Math.LN2);
  const k = Math.min(entered, left);
  let tail = 0;
  for (let i = 0; i <= k; i++) tail += pmf(i);
  return Math.min(1, 2 * tail);
}

function counterfactualReport(
  a: Trace[], b: Trace[], proposal: { file: string; rows: GateProposal[] },
  applied: Set<string>, drift: Set<string>,
): { lines: string[]; record: Record<string, unknown> } {
  const L: string[] = [];
  const p = (s = "") => L.push(s);
  const N = a.length;
  const rowsA = funnelRows(STAGES, a);
  const rowsB = funnelRows(STAGES, b);
  const byAction = new Map<string, number>();
  for (const c of proposal.rows) byAction.set(c.action ?? "?", (byAction.get(c.action ?? "?") ?? 0) + 1);

  p("## The proposed gate encoding — a paired counterfactual, and NOT the product");
  p();
  p("██ NOTHING WAS WRITTEN. ██ The rows in the `proposed` column were produced by serving");
  p("a different comparator to the eligibility engine IN THIS PROCESS ONLY. The store still");
  p("holds what it held, and the `store` column is the shipped funnel — it is the same");
  p("numbers as the table at the top of this report, from the same traces.");
  p();
  p("```");
  p(`proposal           ${proposal.file}`);
  p(`comparators        ${proposal.rows.length} proposed — `
    + `${[...byAction].sort().map(([k, n]) => `${k} ${n}`).join(", ")}`);
  p(`actually served    ${applied.size} of ${proposal.rows.length} reached the engine on at `
    + `least one founder`);
  p(`drift              ${drift.size} row(s) whose stored comparator was not the one the `
    + `proposal was written`);
  p("                   against — those keep the store's value and are named below");
  p("pairing            same draw, same intake, same corpus read, same embedding cache.");
  p("                   The arms differ in the comparators and in nothing else.");
  p("```");
  p();
  if (drift.size) {
    p("██ DRIFT ██ — these rows were NOT overlaid, so the proposed column understates or");
    p("overstates the proposal by whatever they would have done:");
    p();
    for (const d of [...drift].sort()) p(`- ${d}`);
    p();
  }
  // A proposal whose rows never reach a founder's shortlist is not a proposal
  // about the funnel, and saying which ones never fired is the difference
  // between "it does nothing" and "nobody was ever tested against it".
  const never = proposal.rows
    .map((c) => `${c.instrument_id} ${c.gate_key}`)
    .filter((k) => !applied.has(k));
  if (never.length) {
    p(`${never.length} proposed comparator(s) were never served: no founder in this draw had `
      + "the instrument");
    p("in their shortlist, so this run says nothing about them either way.");
    p();
  }

  p(`| stage | store | proposed | delta |`);
  p(`|---|---:|---:|---:|`);
  for (let i = 0; i < rowsA.length; i++) {
    const ra = rowsA[i], rb = rowsB[i];
    if (ra.remaining == null || rb.remaining == null) {
      p(`| ${ra.stage.id} | UNMEASURED | UNMEASURED | — |`);
      continue;
    }
    const d = rb.remaining - ra.remaining;
    const dp = rb.share! - ra.share!;
    p(`| ${ra.stage.id}${d ? " ←" : ""} | **${ra.remaining}** ${ra.share!.toFixed(1)}% | `
      + `**${rb.remaining}** ${rb.share!.toFixed(1)}% | `
      + `${d > 0 ? "+" : ""}${d} (${dp > 0 ? "+" : ""}${dp.toFixed(1)} pts) |`);
  }
  p();
  p("`←` marks a row the proposal moves. A row it does not move is a measurement, not an");
  p("assumption: both arms ran the same code on the same founders.");
  p();

  // ── THE MOVEMENT, BOTH DIRECTIONS, AT THE FOUNDER ─────────────────────────
  p("### Which founders move, and in which direction");
  p();
  p("Paired at the founder. `entered` gained the row under the proposal, `left` lost it. A");
  p("net of zero over a churn of forty is a different fact from a net of zero over a churn of");
  p("zero, so both are printed, with an EXACT two-sided McNemar on the discordant pairs.");
  p();
  const movementIds = ["gates_pass", "pool_cut", "writer_cap", ...ROW_CUTS.map(rowCutId)];
  p("| row | entered | left | net | exact McNemar p |");
  p("|---|---:|---:|---:|---:|");
  const movement: Record<string, { entered: number; left: number; p: number }> = {};
  for (const id of movementIds) {
    const s = STAGES.find((x) => x.id === id);
    if (!s) continue;
    let entered = 0, left = 0;
    for (let i = 0; i < a.length; i++) {
      const va = s.alive(a[i]) === true, vb = s.alive(b[i]) === true;
      if (vb && !va) entered += 1;
      if (va && !vb) left += 1;
    }
    const pv = exactMcNemarP(entered, left);
    movement[id] = { entered, left, p: pv };
    p(`| ${id} | +${entered} | -${left} | ${entered - left > 0 ? "+" : ""}${entered - left} | `
      + `${pv < 0.001 ? "<0.001" : pv.toFixed(3)} |`);
  }
  p();

  // ── THE COST CHANNEL, NAMED AND COUNTED ───────────────────────────────────
  // A quarantined comparator stops deleting the founder it wrongly deleted,
  // and it also stops deleting that row for EVERYONE ELSE. So the accessible
  // pool gets longer for founders the proposal was never about, and a won fund
  // sitting near the 40-row cut or the 8-row writer cap can be pushed out of it
  // by rows that are now allowed to stay. That is the only mechanism by which
  // this proposal can lose a founder, and it is counted directly rather than
  // inferred from the net.
  const offerableIdx = a.map((_, i) => i).filter((i) => a[i].offerable);
  const meanAcc = (ts: Trace[]) => offerableIdx.length
    ? offerableIdx.reduce((s, i) => s + ts[i].accessibleLen, 0) / offerableIdx.length : 0;
  const grew = offerableIdx.filter((i) => b[i].accessibleLen > a[i].accessibleLen).length;
  const shrank = offerableIdx.filter((i) => b[i].accessibleLen < a[i].accessibleLen).length;
  p("### Why anybody LEAVES a row under a proposal that only un-blocks");
  p();
  p("A quarantined comparator stops deleting the founder it wrongly deleted, and it stops");
  p("deleting that row for every other founder too. The pool gets longer, and a won fund");
  p("near the 40-row cut or the 8-row writer cap can be pushed out of it by rows that are now");
  p("allowed to stay. That is the whole of the cost, and it is counted, not inferred:");
  p();
  p("```");
  p(`  mean accessible pool   ${meanAcc(a).toFixed(1)} rows  ->  ${meanAcc(b).toFixed(1)} rows`);
  p(`  founders whose pool grew    ${grew} of ${offerableIdx.length}`);
  p(`  founders whose pool shrank  ${shrank} of ${offerableIdx.length}`);
  p("```");
  p();

  // ── WHERE THE GAIN LANDS ON THE LADDER ────────────────────────────────────
  // A founder gained at `gates_pass` and lost again at `pool_cut` is not a
  // founder the product serves any better, and the difference is invisible in
  // a table of levels.
  const survived = (t: Trace, id: string) => STAGES.find((x) => x.id === id)?.alive(t) === true;
  const gainedGates = a.map((_, i) => i).filter((i) =>
    survived(b[i], "gates_pass") && !survived(a[i], "gates_pass"));
  const carried = (id: string) => gainedGates.filter((i) => survived(b[i], id)).length;
  p("### What happens to the founders the proposal un-gates");
  p();
  p(`${gainedGates.length} founder(s) keep their won fund past \`gates_pass\` under the `
    + "proposal that lost it under the");
  p("store's encoding. A gain at the gate screen is only worth what survives the cuts below");
  p("it, so this is where it lands:");
  p();
  p("```");
  for (const id of ["pool_cut", "writer_cap", ...ROW_CUTS.map(rowCutId)]) {
    p(`  ${String(carried(id)).padStart(4)} of ${gainedGates.length} still there at ${id}`);
  }
  p("```");
  p();

  return {
    lines: L,
    record: {
      file: proposal.file, proposed: proposal.rows.length, served: applied.size,
      drift: [...drift], neverServed: never,
      stages: rowsA.map((ra, i) => ({
        id: ra.stage.id, store: ra.remaining, proposed: rowsB[i].remaining,
        delta: ra.remaining == null || rowsB[i].remaining == null
          ? null : rowsB[i].remaining! - ra.remaining,
      })),
      movement,
      unGatedCarriedTo: Object.fromEntries(
        ["pool_cut", "writer_cap", ...ROW_CUTS.map(rowCutId)].map((id) => [id, carried(id)])),
      unGated: gainedGates.length,
      meanAccessibleStore: Number(meanAcc(a).toFixed(1)),
      meanAccessibleProposed: Number(meanAcc(b).toFixed(1)),
      poolGrew: grew, poolShrank: shrank,
      n: N,
    },
  };
}

/** ── THE DERIVED-INTAKE-ANSWER SECTION ─────────────────────────────────────
 *
 *  Two arms of the SAME ladder on the SAME founders in the SAME process: the
 *  `useOfFunds` the harness pins, and the one derived from each founder's own
 *  description prose. It reports the WHOLE FUNNEL both ways, for the same
 *  reason the gate counterfactual does — an intake answer that moves one row
 *  and costs two somewhere else has not helped, and a single number cannot say
 *  so.
 *
 *  `useOfFunds` reaches the funnel by TWO paths and they pull in opposite
 *  directions, which is why the whole ladder is the only honest report:
 *
 *    * 59 HARD FILTERS turn on it (`founderIntake`'s own cost note), so a
 *      changed answer opens and closes funds at `gates_pass` — for the won
 *      fund AND for everything competing with it.
 *    * `objectiveScorer` multiplies it into the score inside the within-regime
 *      sibling reassignment, so it reorders `pool_cut` and below.
 *
 *  A gain at `gates_pass` that is given back at six rows is a real result and
 *  the table shows it as one. */
function useOfFundsReport(
  a: Trace[], b: Trace[], uof: UseOfFundsArm, changed: string[], control: number[],
): { lines: string[]; record: Record<string, unknown> } {
  const L: string[] = [];
  const p = (s = "") => L.push(s);
  const rowsA = funnelRows(STAGES, a);
  const rowsB = funnelRows(STAGES, b);

  p("## The derived intake answer, measured without being adopted");
  p();
  p("```");
  p(`answers            ${uof.file}`);
  p(`derived            ${uof.byCompany.size} of ${uof.rows} founder(s) got a non-empty `
    + "answer from their own");
  p("                   description prose; the rest keep the harness's pin, the same "
    + "fallback");
  p("                   `answersFor` uses for a ticketBand it cannot derive");
  p(`actually moved     ${changed.length} founder(s) — the rest were served an IDENTICAL `
    + "request in both");
  p(`                   arms and are the CONTROL: ${control.length} founder(s), verified `
    + "byte-identical");
  p("                   across the two arms before this table was written");
  p("pin                industrial_research, experimental_development — uniform, for "
    + "everyone");
  p("paths              59 hard filter gates turn on this field, and `objectiveScorer` "
    + "multiplies");
  p("                   it into the score. The two can cancel; the table below is how you "
    + "see that.");
  p("```");
  p();
  p("**Nothing was written.** The derived answer is an in-memory substitution in this "
    + "process only.");
  p("`founderIntake` still pins the field, and this run does not change what any founder "
    + "is served.");
  p();

  p(`| stage | pinned | derived | delta |`);
  p(`|---|---:|---:|---:|`);
  for (let i = 0; i < rowsA.length; i++) {
    const ra = rowsA[i], rb = rowsB[i];
    if (ra.remaining == null || rb.remaining == null) {
      p(`| ${ra.stage.id} | UNMEASURED | UNMEASURED | — |`);
      continue;
    }
    const d = rb.remaining - ra.remaining;
    const dp = rb.share! - ra.share!;
    p(`| ${ra.stage.id}${d ? " ←" : ""} | **${ra.remaining}** ${ra.share!.toFixed(1)}% | `
      + `**${rb.remaining}** ${rb.share!.toFixed(1)}% | `
      + `${d > 0 ? "+" : ""}${d} (${dp > 0 ? "+" : ""}${dp.toFixed(1)} pts) |`);
  }
  p();
  p("`←` marks a row the derived answer moves. A row it does not move is a measurement, "
    + "not an");
  p("assumption: both arms ran the same code on the same founders in the same process.");
  p();

  // ── THE MOVEMENT, BOTH DIRECTIONS, AT THE FOUNDER ────────────────────────
  p("### Which founders move, and in which direction");
  p();
  p("Paired at the founder. `entered` gained the row under the derived answer, `left` lost "
    + "it. A net");
  p("of zero over a churn of forty is a different fact from a net of zero over a churn of "
    + "zero, so");
  p("both are printed, with an EXACT two-sided McNemar on the discordant pairs.");
  p();
  const movementIds = ["gates_pass", "pool_cut", "writer_cap", ...ROW_CUTS.map(rowCutId)];
  p("| row | entered | left | net | exact McNemar p |");
  p("|---|---:|---:|---:|---:|");
  const movement: Record<string, { entered: number; left: number; p: number }> = {};
  for (const id of movementIds) {
    const s = STAGES.find((x) => x.id === id);
    if (!s) continue;
    let entered = 0, left = 0;
    for (let i = 0; i < a.length; i++) {
      const va = s.alive(a[i]) === true, vb = s.alive(b[i]) === true;
      if (vb && !va) entered += 1;
      if (va && !vb) left += 1;
    }
    const pv = exactMcNemarP(entered, left);
    movement[id] = { entered, left, p: pv };
    p(`| ${id} | +${entered} | -${left} | ${entered - left > 0 ? "+" : ""}${entered - left} | `
      + `${pv < 0.001 ? "<0.001" : pv.toFixed(3)} |`);
  }
  p();

  // ── AND THE SAME MOVEMENT OVER THE FOUNDERS WHO ACTUALLY CHANGED ────────
  // The table above averages the derivation together with the ~half of the
  // population it left on the pin, so it understates the effect per founder
  // affected by exactly that dilution. Both denominators are printed rather
  // than one chosen, because the product question and the mechanism question
  // want different ones.
  const moved = new Set(changed);
  const ia = a.map((t, i) => i).filter((i) => moved.has(a[i].company));
  if (ia.length) {
    p(`### Restricted to the ${ia.length} founders whose answer actually changed`);
    p();
    p("The table above is over all " + a.length + " founders, roughly half of whom kept the "
      + "pin, so it");
    p("dilutes the effect by that share. This is the same movement over the affected "
      + "founders only.");
    p("It is the MECHANISM figure. The one above is the PRODUCT figure, because the "
      + "product would");
    p("have to serve everybody.");
    p();
    p("| row | pinned | derived | entered | left |");
    p("|---|---:|---:|---:|---:|");
    for (const id of movementIds) {
      const s = STAGES.find((x) => x.id === id);
      if (!s) continue;
      let ra = 0, rb = 0, entered = 0, left = 0;
      for (const i of ia) {
        const va = s.alive(a[i]) === true, vb = s.alive(b[i]) === true;
        if (va) ra++; if (vb) rb++;
        if (vb && !va) entered++;
        if (va && !vb) left++;
      }
      p(`| ${id} | ${ra} ${((100 * ra) / ia.length).toFixed(1)}% | `
        + `${rb} ${((100 * rb) / ia.length).toFixed(1)}% | +${entered} | -${left} |`);
    }
    p();
  }

  return {
    lines: L,
    record: {
      kind: "use_of_funds",
      file: uof.file, rows: uof.rows, derived: uof.byCompany.size,
      changed: changed.length, control: control.length,
      stages: rowsA.map((r, i) => ({
        id: r.stage.id,
        pinned: r.remaining, derived: rowsB[i].remaining,
        delta: r.remaining == null || rowsB[i].remaining == null
          ? null : rowsB[i].remaining! - r.remaining,
      })),
      movement,
    },
  };
}

/** ── THE SWEEP SECTION ─────────────────────────────────────────────────────
 *
 *  The whole funnel at every depth, the two directions of every difference, and
 *  the one deterministic mechanism by which a wider pool can hurt — counted
 *  directly rather than inferred from the won fund.
 *
 *  Everything here is PAIRED to the founder: one pool object, five projections.
 *  So a difference between two columns is a difference on the same 897 people
 *  and needs no unpaired interval. `+/-` still appears on the LEVELS, because a
 *  level is an estimate of a population rate and a paired delta is not. */
function sweepReport(
  traces: Trace[], ks: number[], est: ReturnType<typeof estimateModelStage>,
): { lines: string[]; record: Record<string, unknown> } {
  const N = traces.length;
  const base = VERDICT_POOL;
  const L: string[] = [];
  const p = (s = "") => L.push(s);
  const perK = new Map(ks.map((k) => [k, funnelRows(ladderAt(k), traces)]));
  const at = (k: number, id: string) => perK.get(k)!.find((r) => r.stage.id === id);
  const offerable = traces.filter((t) => t.offerable);

  p("## The cut, swept — the whole funnel at every pool depth");
  p();
  p(`Paired. One pool object per founder, ${ks.length} projections of it, the same `
    + "embeddings and");
  p("the same gates behind every column. `pool_cut` is the row `BRIEF_VERDICT_POOL` moves;");
  p("every row below it is what that costs.");
  p();
  p(`| stage | ${ks.map((k) => `K=${kLabel(k)}`).join(" | ")} |`);
  p(`|---|${ks.map(() => "---:").join("|")}|`);
  for (const s of ladderAt(base)) {
    const cells = ks.map((k) => {
      const r = at(k, s.id);
      if (r?.remaining == null) return "—";
      return `**${r.remaining}** ${r.share!.toFixed(1)}%`;
    });
    // A row identical in every column is a row the lever cannot reach, and
    // saying so is more use than making the reader diff five numbers.
    const flat = new Set(ks.map((k) => at(k, s.id)?.remaining ?? -1)).size === 1;
    p(`| ${s.id}${flat ? "" : " ←"} | ${cells.join(" | ")} |`);
  }
  p();
  p("`←` marks a row the lever moves. Every other row is identical at every depth, which is");
  p("a measurement and not an assumption: the stages above the cut do not read this number,");
  p("and the stages below it can only be reached through the one channel counted next.");
  p();

  // ── THE ONE DETERMINISTIC CHANNEL, BOTH DIRECTIONS ────────────────────────
  p("### What a wider pool costs on the deterministic path");
  p();
  p("With no model in the loop a wider cut is a SUPERSET WITH AN IDENTICAL PREFIX, so the");
  p("only way it can change the rows below `pool_cut` is `resolveNameCollisions`, whose");
  p("survivor rule `preferBetterEvidencedRow` is a total order INDEPENDENT OF POSITION: a");
  p("better-evidenced sibling admitted at rank 30 can demote the row that held that label at");
  p("rank 3. Counted here on every founder, won fund or not, because \"the won fund did not");
  p("move\" is a weaker statement than \"nothing moved\".");
  p();
  const cutIds = ["writer_cap", ...ROW_CUTS.map(rowCutId)];
  p(`| K | founders whose \`toWriter\` differs from K=${kLabel(base)} | `
    + `${cutIds.map((id) => `${id} entered / left`).join(" | ")} |`);
  p(`|---|---:|${cutIds.map(() => "---:").join("|")}|`);
  const churnByK: Record<string, number> = {};
  const movesByK: Record<string, Record<string, { entered: number; left: number }>> = {};
  for (const k of ks) {
    const churn = offerable.filter((t) =>
      (t.writerAt.get(k)?.ids ?? []).join(" ") !== (t.writerAt.get(base)?.ids ?? []).join(" "),
    ).length;
    churnByK[kLabel(k)] = churn;
    const ladderK = ladderAt(k), ladderB = ladderAt(base);
    const moves: Record<string, { entered: number; left: number }> = {};
    const cells = cutIds.map((id) => {
      const sK = ladderK.find((s) => s.id === id)!, sB = ladderB.find((s) => s.id === id)!;
      const entered = traces.filter((t) => sK.alive(t) === true && sB.alive(t) !== true).length;
      const left = traces.filter((t) => sK.alive(t) !== true && sB.alive(t) === true).length;
      moves[id] = { entered, left };
      return `+${entered} / -${left}`;
    });
    movesByK[kLabel(k)] = moves;
    p(`| ${kLabel(k)} | ${churn} | ${cells.join(" | ")} |`);
  }
  p();
  p("A net of zero over a churn of forty is a different fact from a net of zero over a churn");
  p("of zero, so both are printed. `entered` and `left` are founders, counted separately.");
  p();

  // ── THE CEILING, WHICH IS THE WHOLE POINT ─────────────────────────────────
  p("### The model's ceiling at each depth");
  p();
  p("`pool_cut` is the maximum ANY ranker can deliver at that depth, at any price: a founder");
  p("whose won fund is outside the cut is unreachable by construction. The rows below it in");
  p("the table above are our own deterministic order standing in for a ranker that is not in");
  p("this run.");
  p();
  p("| K | mean rows the ranker is shown | the answer is on the list | vs the shipped default |");
  p("|---|---:|---:|---:|");
  const meanShown = (k: number) => offerable.length
    ? offerable.reduce((a, t) => a + Math.min(k, t.accessibleLen), 0) / offerable.length : 0;
  const baseShare = at(base, "pool_cut")!.share!;
  for (const k of ks) {
    const r = at(k, "pool_cut")!;
    p(`| ${kLabel(k)}${k === base ? " (ships)" : ""} | ${meanShown(k).toFixed(1)} | `
      + `**${r.share!.toFixed(1)}%** +/-${halfWidth(r.remaining!, N).toFixed(1)} | `
      + `${k === base ? "—" : `${r.share! >= baseShare ? "+" : ""}${(r.share! - baseShare).toFixed(1)} pts`} |`);
  }
  p();

  // ── WHAT THE FREE RUN CANNOT SEE, AS A FALSIFIABLE QUANTITY ───────────────
  p("### The one thing only a paid run settles, stated as a number");
  p();
  const bands = bandConversions();
  if (!est) {
    p("██ No paid tape was found, so the break-even below cannot be computed and is not");
    p("guessed at.");
  } else {
    const c18 = est.rankerRate;
    p(`Let \`c_K\` be the model's EXACT@${TOP} rate among founders whose won fund is ON the `
      + `menu it`);
    p(`is shown. The tape measures \`c_${kLabel(base)}\` = **${(100 * c18).toFixed(1)}%** `
      + `(${est.rankerHits}/${est.n}). Population EXACT@${TOP} is`);
    p("`P(won inside K) x c_K`, so break-even at K needs `c_K = c_base x P_base / P_K`.");
    p();
    p(`| K | \`c_K\` break-even needs | relative collapse from ${(100 * c18).toFixed(1)}% `
      + "| head degradation tolerable if the new band converts at 30% |");
    p("|---|---:|---:|---:|");
    const breakEven: Record<string, { requiredCk: number; relativeCollapse: number }> = {};
    for (const k of ks) {
      if (k === base) { p(`| ${kLabel(k)} (ships) | — | — | — |`); continue; }
      const pB = baseShare / 100, pK = at(k, "pool_cut")!.share! / 100;
      const req = c18 * (pB / pK);
      const collapse = 1 - pB / pK;
      // If the head keeps its accuracy, widening cannot lose for ANY conversion
      // b >= 0 on the new band. So the tolerance is stated the other way round:
      // how far the head may fall before a new band converting at b stops
      // paying for it. b = 30% is below every band the tape measured at ranks
      // 13-18, which is the nearest evidence there is.
      const b = 0.30;
      const tol = (pK - pB) * b / (pB * c18);
      breakEven[kLabel(k)] = { requiredCk: req, relativeCollapse: collapse };
      p(`| ${kLabel(k)} | ${(100 * req).toFixed(1)}% | ${(100 * collapse).toFixed(1)}% | `
        + `${(100 * Math.min(tol, 1)).toFixed(0)}%${tol > 1 ? " (any)" : ""} |`);
    }
    p();
    p("**Read the second column as the whole risk.** Hold the head's accuracy fixed and a");
    p("wider menu cannot lose at any conversion rate `b >= 0` on the newly-visible band — it");
    p("only ever adds founders who were unreachable. The entire case against widening is that");
    p("a longer menu makes the model WORSE ON THE ROWS IT WAS ALREADY SHOWN, and no free run");
    p("can measure that, because it is the model.");
    p();
  }
  if (bands?.length) {
    p("The nearest free evidence about the newly-visible band, re-derived from the same tape's");
    p("per-founder rows rather than from its prose — the model's conversion by where the won");
    p(`fund sat in the ${kLabel(base)}-row menu it was actually shown:`);
    p();
    p("| the won fund's rank in the menu | founders | control EXACT@5 | ranker EXACT@5 |");
    p("|---|---:|---:|---:|");
    for (const b of bands) {
      p(`| ${b.label} | ${b.n} | ${b.control} (${(100 * b.control / b.n).toFixed(0)}%) | `
        + `${b.ranker} (${(100 * b.ranker / b.n).toFixed(0)}%) |`);
    }
    p();
    p("██ There is no row here for ranks past the end of that menu, because that band was");
    p("never shown to a model. Its conversion rate is the one quantity this whole question");
    p("turns on and it does not exist yet at any depth.");
    p();
  }

  // ── THE OTHER LEVER, WHICH IS NOT A PREFERENCE ────────────────────────────
  p("### The depth the selector can actually read");
  p();
  p(`\`AGENT_SELECT_DEPTH\` is ${kLabel(SELECT_DEPTH)}. \`agentSelectRows\` cuts the menu to `
    + "it and returns");
  p("`[...chosen, ...everything else in the shipped order]`, so a pool row past that depth is");
  p("never shown and can only land behind all `SELECT_COUNT` picks — past the published cap.");
  p("A pool wider than the depth therefore measures the depth while printing its own number.");
  p("Every column above is honest about the CUT; only the columns at or below the depth are");
  p("honest about what a founder could receive.");
  p();

  return {
    lines: L,
    record: {
      ks: ks.map(kLabel), base: kLabel(base),
      meanShown: Object.fromEntries(ks.map((k) => [kLabel(k), Number(meanShown(k).toFixed(1))])),
      stages: Object.fromEntries(ks.map((k) => [kLabel(k), Object.fromEntries(
        perK.get(k)!.map((r) => [r.stage.id, r.remaining]))])),
      toWriterChurn: churnByK,
      moves: movesByK,
      selectDepth: kLabel(SELECT_DEPTH),
      bands: bands ?? null,
    },
  };
}

/** ── THE PAID TAPE'S CONVERSION BY MENU RANK, RE-DERIVED ───────────────────
 *
 *  The tape carries `poolRankControl` — where the won fund sat in the menu the
 *  model was shown — and the published ids of both arms, so the per-band
 *  conversion is a free re-derivation rather than a figure copied out of a
 *  report. Bands are generated from the menu length rather than written out, so
 *  a tape taken at another depth bands itself.
 *
 *  Returns undefined if no tape carries the rank, and the report then says the
 *  band table is unavailable rather than showing a remembered one. */
function bandConversions(): { label: string; n: number; control: number; ranker: number }[] | undefined {
  const dir = path.join(process.cwd(), "..", "..", "project-mgmt", "findings", "headtohead_wsGA");
  interface TapeRow {
    called?: boolean; reachable?: boolean; poolRankControl?: number | null;
    publishedControl?: string[]; publishedRanker?: string[]; won?: string; menu?: number;
  }
  interface Tape { arm?: string; rows?: TapeRow[]; startedAt?: string }
  let best: Tape | undefined;
  try {
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      let tape: Tape;
      try { tape = JSON.parse(readFileSync(path.join(dir, f), "utf8")) as Tape; } catch { continue; }
      if (!tape.arm || ["off", "reverse", "dry"].includes(tape.arm)) continue;
      if (!tape.rows?.length) continue;
      if (!best || (tape.startedAt ?? "") > (best.startedAt ?? "")) best = tape;
    }
  } catch { return undefined; }
  const graded = (best?.rows ?? []).filter((r) =>
    r.called && r.reachable && typeof r.poolRankControl === "number");
  if (!graded.length) return undefined;
  const menu = Math.max(...graded.map((r) => r.menu ?? 0), 0)
    || Math.max(...graded.map((r) => r.poolRankControl ?? 0));
  const width = 3;
  const out: { label: string; n: number; control: number; ranker: number }[] = [];
  const hit = (ids: string[] | undefined, won: string | undefined) =>
    Boolean(won && (ids ?? []).slice(0, TOP).includes(won));
  for (let lo = 1; lo <= menu; lo += width) {
    const hi = Math.min(lo + width - 1, menu);
    const inBand = graded.filter((r) => (r.poolRankControl ?? 0) >= lo && (r.poolRankControl ?? 0) <= hi);
    if (!inBand.length) continue;
    out.push({
      label: `${lo}-${hi}`, n: inBand.length,
      control: inBand.filter((r) => hit(r.publishedControl, r.won)).length,
      ranker: inBand.filter((r) => hit(r.publishedRanker, r.won)).length,
    });
  }
  return out;
}

/** The working tree. `process.cwd()` is `website/frontend` for every harness
 *  here, and the repo is two levels up — the same derivation `latest.md`'s own
 *  output path uses, so the two cannot disagree about where the tree is. */
const REPO_ROOT = path.resolve(process.cwd(), "..", "..");

/** ── THE PER-FOUNDER TRACE, AND WHY IT DOES NOT LIVE IN THE REPO ───────────
 *
 *  `latest.json` is AGGREGATE ONLY, deliberately. That makes it safe and makes
 *  it unable to answer the one question this repo's standing rule asks of every
 *  proposed change: **is the gain SPREAD or is it one market**. Two funnel runs
 *  are the same founders in the same order — the draw fingerprint says so — so
 *  the pairing exists; what was missing was anything to pair. A workstream that
 *  wanted it had to either re-implement the ladder in a scratch script (a second
 *  definition of the funnel, which is the defect this instrument was built to
 *  remove) or report an unpaired difference of two marginal counts, which is
 *  exactly the comparison that closed the blend route in error in wsBU.
 *
 *  So: opt-in, one line per founder, and REFUSED anywhere inside the working
 *  tree. The regime is a `parentId`, which for a standalone fund IS the won
 *  fund's id — so this file is a partial answer key, and the answer key may not
 *  gain a second copy in a directory nothing guards. `check_answer_not_reachable`
 *  scans the repo; a path outside it is outside that guard, which is the reason
 *  the guard here is a refusal and not a warning.
 *
 *  The company NAME never appears. Pairing is positional: two runs quoting one
 *  draw fingerprint drew the same founders in the same order, and that is
 *  checked by the fingerprint rather than asserted by a name in this file. */
function writeFounderTrace(
  traces: Trace[], byId: Map<string, DbInstrument>, startedAt: string,
): void {
  const out = process.env.FUNNEL_TRACE;
  if (!out) return;
  const abs = path.resolve(out);
  if (!path.relative(REPO_ROOT, abs).startsWith("..")) {
    throw new Error(
      `measure_funnel: FUNNEL_TRACE=${abs} is inside the working tree. Each line `
      + "carries the REGIME of a fund a real company really won, and for a "
      + "standalone fund the regime is that fund's own id — so this is a partial "
      + "copy of the answer key, and the answer key does not get a second copy "
      + "the leak guards do not scan. Write it outside the repo.");
  }
  const lines = traces.map((t, i) => JSON.stringify({
    i, country: t.country,
    // The ROLLUP the won fund belongs to. `measure_recall` computes the same
    // quantity the same way (`parentId ?? id`), so a concentration figure from
    // this file and one from that harness mean the same thing.
    regime: String(byId.get(t.won)?.parentId ?? t.won),
    inCorpus: t.inCorpus, offerable: t.offerable,
    rankTable: t.rankTable, rankAccessible: t.rankAccessible,
    rankWriter: rankWriter(t, VERDICT_POOL),
    tableLen: t.tableLen, accessibleLen: t.accessibleLen,
  }));
  mkdirSync(path.dirname(abs), { recursive: true });
  // `awardTerm` beside `rowOrder` for the same reason `rowOrder` is here: two
  // traces are paired positionally on the draw fingerprint, so the ONE thing a
  // pair cannot recover for itself is which arm each side was taken under. Read
  // from the shipped constant, never from `process.env` — a variable that never
  // reached the run would otherwise label the run with the arm somebody meant.
  writeFileSync(abs, `${JSON.stringify({ startedAt, rowOrder: POOL_BLEND, awardTerm: AWARD_TERM })}\n`
    + `${lines.join("\n")}\n`);
  console.log(`wrote founder trace ${abs} (${lines.length} founders)`);
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
  writer_cap: "`orderMemoCandidates().toWriter`",
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
