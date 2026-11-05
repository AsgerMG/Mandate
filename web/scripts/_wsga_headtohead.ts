// wsGA — THE AI RANKER AGAINST OUR OWN SCORING. ONE PROCESS, ONE POOL OBJECT.
//
// ── What this is for ──────────────────────────────────────────────────────
// The selector arm is built and switched off. The decision is to measure it
// head to head against the empirical ranker before turning it on, in ONE
// well-powered run rather than several small ones — because a EUR 2.50 run at
// n=36 had one-founder resolution and settled nothing.
//
// ── THE FIVE PROPERTIES THIS FILE EXISTS TO GUARANTEE ─────────────────────
//
// 1. SAME FOUNDERS, SAME SEED, BOTH ARMS, AND NO "BETWEEN".
//    The pool is built HERE, once per founder, and both arms are handed the
//    SAME ARRAY. The lever is which function is applied to it, not an
//    environment variable, so `AGENT_SELECT` stays read-once at module scope
//    and the corpus cannot move between the arms because there is no between.
//    This is `_wsdr_seam.ts`'s pattern and it is copied deliberately: a
//    sequential before/after on a shared database is not a controlled
//    comparison. 29 verdicts were published between one agent's two runs and
//    moved its numbers.
//
//    It also answers the standing hazard the recall floor has recorded for
//    weeks — THE SEED PINS THE DRAW, NOT THE POPULATION. Publishing 53 closed
//    calls once shrank the graded key so the same seed drew a different 300
//    pairs and 48% of the exam was replaced. A frozen snapshot would fix the
//    corpus and would NOT fix that, because `partitionByOfferable` is a
//    function of `today()`. What fixes it is that both arms are graded inside
//    one loop iteration on one array. The draw is recorded to the tape anyway,
//    with a fingerprint, so a later run can prove it drew the same founders.
//
// 2. THE CEILING IS PRINTED BESIDE EVERY SCORE. A ranker cannot pick a fund
//    that is not in the list it was handed. On the `late` seam the two arms
//    share a pool by construction, so their ceilings are EQUAL and any
//    difference is a bug; on `early` the model changes pool membership and the
//    two ceilings are the number the change has to be bought with.
//
// 3. PAIRED ANALYSIS. `scripts/mcnemar.ts` — the repo's one McNemar, signed,
//    with an exact binomial p — on EXACT@5 AND EXACT@6. Wilcoxon on the won
//    fund's rank is reported as an explicitly SECONDARY test; see the
//    pre-registration for why it may not carry the headline.
//
// 4. PROVENANCE, OR IT IS NOT EVIDENCE. Three headline figures in this project
//    have been retracted for missing it. Every run prints `ranker: all N
//    request(s) on EMBEDDING` from `semantic.ts`'s own tally, the arm
//    attestation, the exit tally, the corpus fingerprint and the founder
//    disclosure — and REFUSES to write a report if the ranker line is not
//    clean, rather than printing a number nobody can attribute.
//
// 5. THE ANSWER KEY IS NEVER REACHABLE FROM THE THING BEING GRADED. This file
//    lives under `scripts/`, which is outside the import closure
//    `check_answer_not_reachable.ts` walks from `lib/intelligence/pipeline.ts`;
//    the founder is resolved through the shared `founderIntake` with their own
//    history WITHHELD, which is what `check_harness_intake.ts` enforces; and
//    the population is restricted to descriptions whose provenance is a
//    DIFFERENT regime than the fund being predicted.
//
// ── THE POPULATION, AND WHY IT IS NOT THE OBVIOUS ONE ─────────────────────
// wsDQ and wsDR both drew from `cross_regime_summary` at 320+ characters. That
// population is 53% DE+FR, and those two markets were legible before this
// week's corpus work, so a sample dominated by them cannot see what changed.
// The draw here is STRATIFIED: seeded shuffle first, then a per-country cap, so
// no single market can hold more than `MAX_COUNTRY_SHARE` of the sample. The
// cap is reported with the composition, and a run whose cap did not bind says
// so — a stratifier that never fires is a comment, not a control.
//
// ── FREE MODES, AND THE FIRST RUN IS NOT THE FIRST RUN ────────────────────
//   AGENT_SELECT=off      the control alone. Free. Measures the CEILING at full
//                         n, which is the number that decides whether spending
//                         is worth it at all.
//   AGENT_SELECT=reverse  a real permutation with NO model in it. Free,
//                         deterministic, and deliberately garbage — the pool's
//                         last row first. It exercises every line of this file
//                         except the API call, and it BOUNDS the discordance
//                         rate: a maximal permutation moves more pairs across
//                         the top-five line than a considered one will.
//   AGENT_SELECT=dry      builds the identical prompt through the identical
//                         code path and never calls Anthropic. Prices the run.
//
//   AGENT_SELECT=adviser  THE PAID ARM. Nothing else spends.
//
// ── HOW TO FIRE IT ────────────────────────────────────────────────────────
//   # free, and run BOTH of these before the paid one
//   AGENT_SELECT=off     npx tsx scripts/_wsga_headtohead.ts
//   AGENT_SELECT=reverse npx tsx scripts/_wsga_headtohead.ts
//
//   # THE PAID RUN. One line. The analysis was written first --
//   # project-mgmt/wsGA_prereg.md -- and MAX_EUR is the rail that keeps it inside
//   # ten dollars while a founder it stops on stays UNGRADED.
//   AGENT_SELECT=adviser AGENT_SELECT_EFFORT=medium \
//     SPLIT=all N=773 MIN_DESCRIPTION_CHARS=0 \
//     ONLY_IN_POOL=1 REPEAT=2 REPEAT_FIRST=50 \
//     MAX_COUNTRY_CALLS=40 MAX_EUR=9.2 \
//     npx tsx scripts/_wsga_headtohead.ts
import { mkdirSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import path from "path";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();

// ── THE CREDENTIAL CONTRACT DEPENDS ON THE ARM, AND IS DECLARED EITHER WAY ──
// The free arms must not require an Anthropic key: demanding one would make the
// dry proof impossible on a machine that has deliberately been given no way to
// spend, which is the safest machine to prove a harness on. The paid arm must
// require it, because a missing key makes every call fall back to the shipped
// order and the run reports the CONTROL's number under the treatment's banner.
// That has happened here: the first 120-case run of this arm made 120 calls,
// all of which failed authentication, and reported the control.
//
// ── AND IT READS THE ARM FROM `caps.ts`, NOT FROM ITS OWN `?? "off"` (wsGB) ─
// This line was `process.env.AGENT_SELECT ?? "off"` — a SECOND copy of a
// default that lives in one place. It was harmless while the two copies agreed
// and became a spending hazard the moment `caps.ts` made `adviser` the default:
// invoked with no environment at all, the harness would have declared itself
// free, skipped the ANTHROPIC_API_KEY contract, and then made a paid call per
// founder. `caps.ts` imports nothing, so reading the resolved arm from it costs
// this preamble no credential reach — the same argument that put the constant
// there. The import is hoisted above this statement by ESM, which is what makes
// reading it here legal at all.
const PAID_ARMS = new Set<string>(["rows", "assist", "adviser"]);
requireCredentials("wsga_headtohead",
  PAID_ARMS.has(AGENT_SELECT_ARM)
    ? ["DATABASE_URL", "VOYAGE_KEY", "ANTHROPIC_API_KEY"]
    : ["DATABASE_URL", "VOYAGE_KEY"]);

import {
  AGENT_SELECT_SEAM, agentSelectExitLine, agentSelectExits,
  agentSelectLastTrace, agentSelectMemoPool, agentSelectTallyLine, LOOKUP_MAX,
  resetAgentSelectTally, SELECT_COUNT, SELECT_DEPTH, setAgentSelectTracing,
  THINK_EFFORT,
} from "../lib/intelligence/agentSelect";
import { BRIEF_LIMITS } from "../lib/intelligence/briefChecks";
// The arm comes from `caps.ts` rather than from `agentSelect.ts`'s re-export of
// it, because the credential preamble above reads it and that preamble must not
// depend on the Anthropic client to find out whether it needs a key.
import { AGENT_SELECT_ARM, VERDICT_POOL } from "../lib/intelligence/caps";
import { withCostTracking } from "../lib/intelligence/cost";
import {
  corpusProvenance, findPeersBySubsector, hydrateDbInstruments, hydrateGatesFor,
  isGenericSubsector, loadDbInstruments, matchCompany, publishableInstruments,
  requireLiveCorpus, resetGateHydration,
} from "../lib/intelligence/corpus";
import { evaluateEligibility } from "../lib/intelligence/eligibility";
import { ExclusionLog } from "../lib/intelligence/exclusions";
import { accessiblePool, orderMemoCandidates } from "../lib/intelligence/memoCandidates";
import { depthLabel, depthPhrase, poolRecallAtDepth, poolRecallN } from "../lib/intelligence/poolRecall";
import { rankerTallyLine, resetRankerTally, semanticFundMatch } from "../lib/intelligence/semantic";
import {
  applyProfileSignal, buildInstrumentTableHydrated, founderCountryList,
  tableInputFromAnswers,
} from "../lib/intelligence/shortlist";
import type { InstrumentRow } from "../lib/intelligence/types";
import {
  founderIntake, founderPolicyFromEnv, IntakeTally, type FounderPolicy,
} from "./founderIntake";
import {
  mcnemarLine, paired, wilcoxonSignedRank,
} from "./_wsga_stats";
import { DEFAULT_SEED, halfWidth, sampleRecall } from "./recallSample";
import {
  assertAncestorConvention, assertGradablePopulation, isDescribed, loadRecallSet,
  partitionByOfferable, reattributeMissingAnswers, type RecallRow,
} from "./recallSet";

const OUT_DIR = path.join(process.cwd(), "..", "capital", "project-mgmt", "findings", "headtohead_wsGA");
const PUBLISH_CAP = BRIEF_LIMITS.institutionsMax;

const num = (v: string | undefined, d: number) =>
  (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : d);

/** ── THE STRATIFIER ────────────────────────────────────────────────────────
 *
 *  A seeded shuffle first, so the draw is reproducible and cannot alias against
 *  the file's ordering — `recallSample.ts` records what stride sampling did to
 *  this set and it is not repeated here. Then a greedy fill with a per-country
 *  cap.
 *
 *  THE PROPERTY, stated over an arbitrary population rather than over the
 *  countries we happen to hold: no country may hold more than `share` of the
 *  drawn sample while any other eligible country still has an undrawn row. The
 *  second clause is what stops the cap making the sample SHORT — a run that
 *  silently returns 180 founders when it was asked for 250 has changed the
 *  power calculation without telling anybody.
 *
 *  Deferred rows are kept in shuffle order and used, in that order, only after
 *  every capped country has been offered its quota. So the overflow is still a
 *  random draw from the population, and the cap changes the COMPOSITION rather
 *  than the randomness. */
export function stratifyByCountry<T extends { country: string }>(
  rows: T[], n: number, share: number, seed: number,
): { drawn: T[]; capBound: boolean; cap: number } {
  const shuffled = sampleRecall(rows, rows.length, seed);
  const cap = Math.max(1, Math.ceil(n * share));
  const held = new Map<string, number>();
  const drawn: T[] = [];
  const deferred: T[] = [];
  for (const r of shuffled) {
    if (drawn.length >= n) break;
    const c = held.get(r.country) ?? 0;
    if (c >= cap) { deferred.push(r); continue; }
    held.set(r.country, c + 1);
    drawn.push(r);
  }
  const capBound = deferred.length > 0;
  for (const r of deferred) {
    if (drawn.length >= n) break;
    drawn.push(r);
  }
  return { drawn, capBound, cap };
}

/** One founder's result, both arms, everything a re-analysis needs. Written to
 *  the tape so the whole comparison can be re-scored for free — the only paid
 *  thing here is the model's ORDER, and once that is on disk every question
 *  about how it is graded is answerable without spending again. */
interface Row {
  company: string;
  country: string;
  sector: string;
  /** The fund they actually won. */
  won: string;
  descriptionChars: number;
  /** How many rows were accessible before the pool cut. Context for the
   *  ceiling: a founder with 20 accessible rows has a very different pool
   *  problem from one with 160. */
  accessible: number;
  /** 1-based rank of the won fund in the whole accessible pool, or null. The
   *  bound above every ceiling here. */
  rankAccessible: number | null;
  /** ── THE CEILING, PER ARM ──────────────────────────────────────────────
   *  Is the won fund in the list the arm was handed / produced. On the late
   *  seam these are equal by construction. */
  ceilingControl: boolean;
  ceilingRanker: boolean;
  /** The won fund is somewhere in the list the TREATMENT was SHOWN. Equal to
   *  `ceilingControl` on the `late` seam; a superset on `early`. This, not
   *  `ceilingControl`, is what `ONLY_IN_POOL` conditions on. */
  reachable: boolean;
  /** Rank of the won fund in each arm's published projection, 1-based. */
  rankControl: number | null;
  rankRanker: number | null;
  /** ── RANK IN THE POOL, WHICH IS WHAT THE SECONDARY TEST MUST READ ──────
   *  The published projection is SEVEN rows, so a won fund at pool rank 9
   *  under one arm and 14 under the other is `null` on both and the rank test
   *  drops the pair. The dry run made that concrete: the Wilcoxon dropped 114
   *  of 120 pairs and reported on three. The pool is eighteen rows and, on the
   *  `late` seam, the same SET under both arms — so this rank exists for every
   *  in-pool founder under both, which is the whole point of a rank test. */
  poolRankControl: number | null;
  poolRankRanker: number | null;
  /** The published projection itself, so a re-score does not need the corpus. */
  publishedControl: string[];
  publishedRanker: string[];
  /** `REPEAT>=2` only: a SECOND independent reply to the identical prompt on
   *  the identical pool, in the same loop iteration. The null. */
  publishedRankerB: string[] | null;
  rankRankerB: number | null;
  picksB: number[] | null;
  /** Menu indices the model named, and how deep it reached. Empty on a free
   *  arm that did not call. */
  picks: number[];
  menu: number;
  /** Set when the arm gave up and republished the shipped order. A run whose
   *  arm fell back on half its founders is measuring its own control on those
   *  founders and must say so. */
  fellBack: string | null;
  /** Was the treatment arm actually run on this founder. A founder skipped
   *  because the budget ceiling was reached is NOT a ranker miss, and grading
   *  one as a miss is how a spend limit turns into a result. */
  called: boolean;
  /** ── THE FREE JITTER MEASUREMENT ──────────────────────────────────────
   *  Under `arm=off` this harness projects the SAME pool array twice, so the
   *  two published orders must be identical. `semantic.ts` orders with no
   *  tiebreak and IS non-deterministic — the recall floor bounds the resulting
   *  spread at 0.6 points across 39 runs — so this is that jitter, measured on
   *  the exact ordering the paid run will grade, at zero cost, in the same
   *  process. `null` when the arm is not `off` and the two orders are supposed
   *  to differ. */
  projectionStable: boolean | null;
  eur: number;
}

async function main() {
  const startedAt = new Date().toISOString();
  await hydrateDbInstruments();
  // A run that asked for Postgres and silently got the committed snapshot
  // grades a corpus where nothing is closed.
  requireLiveCorpus("wsga_headtohead");
  resetRankerTally();
  resetAgentSelectTally();
  setAgentSelectTracing(true);

  const corpus = loadDbInstruments();
  assertAncestorConvention(corpus);
  const inCorpus = new Set(corpus.map((i) => i.id));
  const offerable = new Set(publishableInstruments().map((i) => i.id));

  const { file: setFile, rows: all } = loadRecallSet("wsga head-to-head");
  const fixed = reattributeMissingAnswers(
    all, (id) => inCorpus.has(id), (id) => offerable.has(id));
  const pop = partitionByOfferable(fixed.rows, (id) => offerable.has(id));
  assertGradablePopulation(pop, (id) => inCorpus.has(id), fixed.reattributed.length, setFile);

  const split = process.env.SPLIT ?? "tune";
  const seed = num(process.env.SEED, DEFAULT_SEED);
  const N = num(process.env.N, 250);
  const maxShare = num(process.env.MAX_COUNTRY_SHARE, 0.15);
  const minChars = num(process.env.MIN_DESCRIPTION_CHARS, 200);
  /** ── ONLY_IN_POOL: spend where a euro can buy information ───────────────
   *  On the `late` seam the model permutes rows the score already chose, so a
   *  founder whose won fund is not among them is a concordant miss BY
   *  CONSTRUCTION and the call on them is wasted. The conditioning variable is
   *  computed by the free pool build BOTH arms already need, is fixed before
   *  either arm runs, and is identical for both — so this changes the estimand
   *  and is not a choice made after seeing the data. The unconditional ceiling
   *  is measured at full n in the same loop, for free, so the population figure
   *  is recoverable. Default ON; `ONLY_IN_POOL=0` measures the population
   *  directly and costs about 1.6x the effect size to see. */
  const onlyInPool = (process.env.ONLY_IN_POOL ?? "1") !== "0";
  /** How many PAID calls this run may make before it stops. A ceiling in euros
   *  would be the better unit and is not available before the first reply
   *  arrives; this is the bound that can be enforced from the first founder. */
  const maxCalls = num(process.env.MAX_CALLS, Number.POSITIVE_INFINITY);
  /** The rail that is in the unit the budget is actually in. `MAX_CALLS` can
   *  only be set from a price nobody has measured on today's menus; this one is
   *  enforced against what the API said it billed, and it stops the run rather
   *  than reporting an overspend afterwards. Founders it stops on are recorded
   *  as NOT CALLED and are excluded from the graded set — a spend limit must
   *  never be able to turn itself into a result. */
  const maxEur = num(process.env.MAX_EUR, Number.POSITIVE_INFINITY);
  /** How many times the TREATMENT is run per founder. 1 is a comparison; 2 is a
   *  comparison WITH its own null. See the `publishedRankerB` block. */
  const repeat = Math.max(1, num(process.env.REPEAT, 1));
  /** How many founders get the extra call(s). The NULL is an estimate of a
   *  RATE, not a test of a small difference, so it needs far less n than the
   *  effect does — and every euro spent on it is a euro not spent on power.
   *  Repeating the first 50 called founders puts a +/-12 point interval around
   *  the self-discordance rate, which is ample to tell "2% against 20%" from
   *  "18% against 20%", and costs a fifth of repeating them all. */
  const repeatFirst = num(process.env.REPEAT_FIRST, Number.POSITIVE_INFINITY);
  let repeated = 0;
  /** ── THE CAP THAT ACTUALLY CONTROLS COMPOSITION UNDER `ONLY_IN_POOL` ─────
   *  `MAX_COUNTRY_SHARE` caps the DRAW. Under `ONLY_IN_POOL=1` the draw is not
   *  what gets measured -- the CALLED set is -- and the two have different
   *  compositions, because the in-pool rate varies enormously by market (74% in
   *  ES, 7% in GB on today's tune draw). A draw capped at 15% can therefore
   *  still produce a called set that one market dominates.
   *
   *  This caps the CALLS. The draw is already a seeded shuffle, so capping
   *  in-loop is the same thing as a seeded stratified draw of the calls, and
   *  founders it turns away are recorded as NOT CALLED rather than graded. */
  const maxCountryCalls = num(process.env.MAX_COUNTRY_CALLS, Number.POSITIVE_INFINITY);
  const callsByCountry = new Map<string, number>();
  let skippedForCountryCap = 0;

  // ── THE POPULATION ───────────────────────────────────────────────────────
  // `cross_regime_*` and nothing else. That provenance is prose about the
  // company recovered from an award under a DIFFERENT regime than the fund
  // being predicted, which is the only source `check_recall_leaks` clears at
  // the SIBLING level. A founder described out of the won fund's own text hands
  // the selector the answer in the query, and a win that comes from reading the
  // answer is worth less than no win.
  const eligible = pop.graded.filter((r) =>
    (split === "all" || r.split === split)
    && isDescribed(r)
    && (r.descriptionSource ?? "").startsWith("cross_regime")
    && (r.description ?? "").length >= minChars);
  if (!eligible.length) {
    throw new Error(
      `no rows match split=${split} with a cross-regime description of ${minChars}+ chars. ` +
      "A harness that reports 0/0 instead of failing is how a defect survives.");
  }
  const { drawn, capBound, cap } = stratifyByCountry(eligible, N, maxShare, seed);

  const policy: FounderPolicy = founderPolicyFromEnv();
  const tally = new IntakeTally();
  const rows: Row[] = [];
  let spend = 0;
  let calls = 0;
  let skippedForBudget = 0;

  const idOf = (r: InstrumentRow) => r.instrumentId ?? r.channel;
  const rankIn = (ids: string[], won: string) => {
    const i = ids.indexOf(won);
    return i < 0 ? null : i + 1;
  };

  console.log(
    `wsGA head-to-head · arm=${AGENT_SELECT_ARM} seam=${AGENT_SELECT_SEAM} ` +
    `effort=${THINK_EFFORT} · ${drawn.length} founder(s) drawn of ${eligible.length} eligible ` +
    `· only_in_pool=${onlyInPool}\n`);

  for (const t of drawn as RecallRow[]) {
    resetGateHydration();
    const f = founderIntake(t, policy);
    tally.add(f);
    const req = {
      company: f.company, country: f.country, description: f.opts.description,
      capitalSought: f.opts.capitalSought, eligibility: f.eligibility,
    };

    // ── EVERYTHING BELOW IS FREE AND IS BUILT ONCE ────────────────────────
    // The self record's channels are WITHHELD: for a founder replayed against
    // the fund they actually won, their own history CONTAINS THE ANSWER and it
    // would be handed to tier 1 of the sort, the most valuable place in the
    // ordering to be given one. Peers are kept, which is what production does
    // for a founder who is not in the corpus.
    const selfRecord = matchCompany(f.company, f.country);
    const targetSub = selfRecord.matched && !isGenericSubsector(selfRecord.subsector)
      ? selfRecord.subsector : "";
    const dbPeers = targetSub
      ? findPeersBySubsector(targetSub, { country: f.country, limit: 4, exclude: [f.company] })
      : [];
    const semantic = await semanticFundMatch(f.opts.description ?? "");
    const log = new ExclusionLog();
    const hydrated = await buildInstrumentTableHydrated({
      fieldChannels: new Set<string>(dbPeers.flatMap((r) => r.channels)),
      founderCountries: founderCountryList(
        f.country, f.eligibility.entityCountries),
      capitalSought: f.opts.capitalSought,
      description: f.opts.description,
      semantic,
      ...tableInputFromAnswers(f.eligibility),
      log,
    } as never);

    // ── ONE POOL OBJECT. Both arms are views of this array ────────────────
    const poolFull: InstrumentRow[] = applyProfileSignal(
      accessiblePool(hydrated, f.eligibility as never, log), undefined, undefined);
    // Gates for every row EITHER seam can show, so the qualification line the
    // model reads is built from the same hydration on both. Hydrating only the
    // first eighteen would give the early seam blank verdicts on exactly the
    // rows it exists to reach.
    await hydrateGatesFor(
      poolFull.slice(0, Math.max(VERDICT_POOL, SELECT_DEPTH))
        .map((r) => r.instrumentId).filter((id): id is string => Boolean(id)));
    const poolControl = poolFull.slice(0, VERDICT_POOL);

    /** Production's own ordering, on whichever pool it is handed. The
     *  eligibility screen is computed per arm over that arm's OWN pool ids —
     *  the SIGNAL scope `pipeline.ts` uses, not the six-row rendered scope two
     *  earlier harnesses copied by mistake. */
    const project = (pool: InstrumentRow[]): string[] => {
      const l = new ExclusionLog();
      const poolIds = pool.map((r) => r.instrumentId).filter((id): id is string => Boolean(id));
      return orderMemoCandidates({
        instrumentTable: pool,
        req: { ...req, } as never,
        records: [], dbPeers,
        eligibilityScreen: evaluateEligibility(f.eligibility as never, poolIds),
        log: l,
      }).toWriter.map((x) => idOf(x.row));
    };

    const ceilingControl = poolControl.map(idOf).includes(t.instrument);
    const publishedControl = project(poolControl);
    /** The won fund is somewhere in the list the TREATMENT will be SHOWN.
     *  Under `late` that is the control's own eighteen and this equals
     *  `ceilingControl`; under `early` it is the first `SELECT_DEPTH` rows of
     *  the accessible pool, which is a superset. Conditioning on the control's
     *  cut under `early` would throw away exactly the founders that seam exists
     *  to reach. */
    const shownDepth = AGENT_SELECT_SEAM === "early"
      ? Math.min(SELECT_DEPTH, poolFull.length) : VERDICT_POOL;
    const reachable = poolFull.slice(0, shownDepth).map(idOf).includes(t.instrument);

    // ── THE CONDITIONING GATE, decided before either arm has run ──────────
    const budgetLeft = calls < maxCalls && spend < maxEur;
    const countryRoom = (callsByCountry.get(t.country) ?? 0) < maxCountryCalls;
    const wanted = !onlyInPool || reachable;
    const worthCalling = wanted && budgetLeft && countryRoom;
    if (wanted && !budgetLeft) skippedForBudget++;
    else if (wanted && !countryRoom) skippedForCountryCap++;
    if (worthCalling) callsByCountry.set(t.country, (callsByCountry.get(t.country) ?? 0) + 1);

    let publishedRanker = publishedControl;
    let ceilingRanker = ceilingControl;
    let picks: number[] = [];
    let menu = 0;
    let fellBack: string | null = null;
    let eur = 0;
    /** ── THE NULL DISTRIBUTION, AND WHY IT IS NOT OPTIONAL ─────────────────
     *  `REPEAT=2` runs the treatment TWICE on the same founder, the same pool
     *  object and the same prompt, inside the same loop iteration. The second
     *  reply is not a second treatment: it is the null against which the first
     *  is read.
     *
     *  Both discordance rates then come out of one run. If the ranker disagrees
     *  with the CONTROL on 20% of pairs and disagrees with ITSELF on 18%, the
     *  head-to-head is measuring sampling noise and the comparison is over. No
     *  amount of n fixes that, and nothing else in this repo can detect it:
     *  every prior run sampled the model once and had no way to tell a
     *  judgement from a coin. */
    let publishedRankerB: string[] | null = null;
    let picksB: number[] | null = null;
    let poolRankRanker: number | null = rankIn(poolControl.map(idOf), t.instrument);

    if (worthCalling) {
      // ── WHICH ARRAY THE SEAM IS HANDED, and it is not a detail ───────────
      // `late`  the model is handed the pool the score already cut to
      //         VERDICT_POOL and permutes it. Pool membership cannot move.
      // `early` the model is handed the WHOLE accessible pool, reads
      //         SELECT_DEPTH of it, and the top VERDICT_POOL of ITS order hold
      //         the seats. Membership moves, which is why the ceiling is
      //         reported per arm rather than once.
      // Passing the 18-row pool under `early` and slicing afterwards would be a
      // no-op wearing the treatment's name -- the exact failure the arm
      // attestation exists to catch, arriving one layer above it.
      const input = AGENT_SELECT_SEAM === "early" ? poolFull : poolControl;
      const fire = async () => {
        const { result, eur: spent } = await withCostTracking(
          () => agentSelectMemoPool(input, req as never));
        spend += spent;
        if (AGENT_SELECT_ARM !== "off") calls++;
        const pool = AGENT_SELECT_SEAM === "early"
          ? result.slice(0, VERDICT_POOL) : result;
        return { pool, trace: agentSelectLastTrace(), spent };
      };
      const a = await fire();
      picks = a.trace?.picks ?? [];
      menu = a.trace?.menu.length ?? 0;
      fellBack = a.trace?.fellBack ?? null;
      eur = a.spent;
      ceilingRanker = a.pool.map(idOf).includes(t.instrument);
      poolRankRanker = rankIn(a.pool.map(idOf), t.instrument);
      publishedRanker = project(a.pool);
      const doRepeat = repeat > 1 && repeated < repeatFirst;
      if (doRepeat) repeated++;
      for (let k = 1; doRepeat && k < repeat; k++) {
        const b = await fire();
        eur += b.spent;
        // Only the FIRST retest is kept as the null; a third would need a
        // different statistic and this file does not pretend to have one.
        if (k === 1) {
          picksB = b.trace?.picks ?? [];
          publishedRankerB = project(b.pool);
          if (b.trace?.fellBack && !fellBack) fellBack = b.trace.fellBack;
        }
      }
    }

    rows.push({
      company: f.company, country: t.country, sector: t.sector ?? "other",
      won: t.instrument,
      descriptionChars: (t.description ?? "").length,
      accessible: poolFull.length,
      rankAccessible: rankIn(poolFull.map(idOf), t.instrument),
      ceilingControl, ceilingRanker, reachable,
      poolRankControl: rankIn(poolControl.map(idOf), t.instrument),
      poolRankRanker: poolRankRanker,
      rankControl: rankIn(publishedControl, t.instrument),
      rankRanker: worthCalling ? rankIn(publishedRanker, t.instrument) : null,
      publishedControl: publishedControl.slice(0, PUBLISH_CAP),
      publishedRanker: worthCalling ? publishedRanker.slice(0, PUBLISH_CAP) : [],
      publishedRankerB: publishedRankerB ? publishedRankerB.slice(0, PUBLISH_CAP) : null,
      rankRankerB: publishedRankerB ? rankIn(publishedRankerB, t.instrument) : null,
      picksB,
      picks, menu, fellBack, called: worthCalling, eur,
      projectionStable: AGENT_SELECT_ARM === "off" && worthCalling
        ? publishedControl.join("|") === publishedRanker.join("|") : null,
    });

    const mark = (b: boolean) => (b ? "Y" : "n");
    console.log(
      `  ${String(rows.length).padStart(4)} ${f.company.slice(0, 30).padEnd(31)}` +
      `${t.country}  accessible ${String(poolFull.length).padStart(3)}` +
      ` · ceiling ${mark(ceilingControl)}/${mark(ceilingRanker)}` +
      ` · rank ${rows.at(-1)!.rankControl ?? "-"}/${rows.at(-1)!.rankRanker ?? "-"}` +
      (worthCalling ? ` · EUR ${eur.toFixed(4)}` : "  (no call — outside the ceiling)") +
      (fellBack ? "  ██ FELL BACK" : ""));
  }

  // ── THE REPORT ───────────────────────────────────────────────────────────
  const called = rows.filter((r) => r.called);
  // A founder the treatment never saw is not a treatment miss. Grading one as a
  // miss is how a spend limit turns itself into a result, which is the one way
  // a budget rail can corrupt the thing it is protecting.
  const graded = rows.filter((r) => r.called && (!onlyInPool || r.reachable));
  const L: string[] = [];
  const p = (s = "") => L.push(s);
  const prov = corpusProvenance();
  const rankerLine = rankerTallyLine();

  const shownLabel = AGENT_SELECT_SEAM === "early"
    ? `first ${SELECT_DEPTH} of the accessible pool` : `the control's ${VERDICT_POOL}`;
  const drawFingerprint = createHash("sha256")
    .update(rows.map((r) => `${r.company}::${r.won}`).join("\n")).digest("hex").slice(0, 16);

  p(`# wsGA — the AI ranker against our own scoring`);
  p();
  p("```");
  p(`started            ${startedAt}`);
  p(`corpus             ${prov.source} instruments=${prov.instruments} at ${prov.hydratedAt}`);
  p(rankerLine);
  p(agentSelectTallyLine());
  p(agentSelectExitLine());
  p(`set                ${setFile}  split=${split}  seed=${seed}`);
  p(`draw               ${rows.length} of ${eligible.length} eligible, ` +
    `country cap ${cap} (${(100 * maxShare).toFixed(0)}%) ${capBound ? "BOUND" : "did not bind"}`);
  p(`draw fingerprint   ${drawFingerprint}  <- two runs quoting different fingerprints`);
  p(`                   graded different founders, whatever seed they name`);
  p(`levers             seam=${AGENT_SELECT_SEAM} depth=${SELECT_DEPTH} count=${SELECT_COUNT} ` +
    `effort=${THINK_EFFORT} lookups=${LOOKUP_MAX} pool=${depthLabel(VERDICT_POOL)} published_cap=${PUBLISH_CAP}`);
  p(`base rate curve    ${poolRecallN()} held-out founders; P(won in ${depthPhrase(VERDICT_POOL)})=` +
    `${((poolRecallAtDepth(VERDICT_POOL) ?? 0) * 100).toFixed(1)}%`);
  p(`paid calls         ${calls}${Number.isFinite(maxCalls) ? ` of a MAX_CALLS ceiling of ${maxCalls}` : ""}` +
    `${skippedForBudget ? `, ${skippedForBudget} founder(s) skipped once the ceiling was hit` : ""}`);
  p(`call cap           ${Number.isFinite(maxCountryCalls)
    ? `${maxCountryCalls} per country; ${skippedForCountryCap} founder(s) turned away by it`
    : "none per country (MAX_COUNTRY_CALLS unset)"}`);
  p(`null (REPEAT)      ${repeated} founder(s) had the treatment fired twice` +
    (Number.isFinite(repeatFirst) ? ` (REPEAT_FIRST=${repeatFirst})` : ""));
  p(`spend              EUR ${spend.toFixed(4)}` +
    (calls ? ` = EUR ${(spend / calls).toFixed(4)} per paid call` : ""));
  p("```");
  p();
  for (const line of tally.lines(policy)) p(line.trim());
  p();

  // ── THE ATTESTATION GATE ────────────────────────────────────────────────
  // Reported AND enforced. A run that averaged two ranking systems is not
  // comparable with a clean one, and three headline figures in this project
  // have been retracted for exactly this.
  const rankerClean = /^ranker: all \d+ request\(s\) on EMBEDDING$/.test(rankerLine);
  if (!rankerClean) {
    p(`## ██ THIS RUN IS NOT EVIDENCE ██`);
    p();
    p("```");
    p(rankerLine);
    p("```");
    p("The numbers below were produced by more than one ranking system, or by none.");
    p("They are printed so the run is not silently discarded, and they may not be");
    p("quoted as a comparison.");
    p();
  }

  const at = (get: (r: Row) => number | null, k: number) =>
    graded.filter((r) => { const v = get(r); return v != null && v <= k; }).length;
  const pctOf = (hits: number, n: number) =>
    `${hits}/${n} (${((100 * hits) / (n || 1)).toFixed(1)}% +/-${halfWidth(hits, n || 1).toFixed(1)})`;

  p(`## The ceiling — a ranker cannot pick a fund it was not handed`);
  p();
  p(`| | won fund in the arm's ${VERDICT_POOL}-row pool |`);
  p(`|---|---:|`);
  p(`| control (our own scoring) | ${pctOf(rows.filter((r) => r.ceilingControl).length, rows.length)} |`);
  p(`| ranker | ${pctOf(rows.filter((r) => r.ceilingRanker).length, rows.length)} |`);
  p(`| SHOWN to the ranker (${shownLabel}) | ${pctOf(rows.filter((r) => r.reachable).length, rows.length)} |`);
  p();
  p(`Measured over the WHOLE draw of ${rows.length}, including the founders no call was made on.`);
  if (AGENT_SELECT_SEAM === "late") {
    p("On the `late` seam the ranker permutes the control's own pool, so these two");
    p("numbers are equal BY CONSTRUCTION and any difference in this table is a bug.");
  } else {
    p("On the `early` seam the ranker changes pool MEMBERSHIP, so the second number is");
    p("what the change has to be bought with: a fund pushed out of the pool cannot be");
    p("recovered by any ranking gain.");
  }
  p();
  const noCeiling = rows.length - rows.filter((r) => r.reachable).length;
  p(`**${noCeiling} of ${rows.length} founders (${((100 * noCeiling) / rows.length).toFixed(1)}%) have no ` +
    `answer in the pool at all.** Neither arm can win on them and they are a concordant`);
  p(`miss in every paired test below.`);
  p();

  p(`## EXACT — the won fund in the published projection`);
  p();
  p(`Graded on ${graded.length} founder(s)` +
    (onlyInPool ? " — the draw was CONDITIONED on the control's ceiling, so this is the"
      + " in-pool sub-population and the population figure is this times the ceiling above."
      : " — the whole draw.") );
  p();
  p(`| arm | EXACT@5 | EXACT@6 |`);
  p(`|---|---:|---:|`);
  p(`| control (our own scoring) | ${pctOf(at((r) => r.rankControl, 5), graded.length)} | ` +
    `${pctOf(at((r) => r.rankControl, 6), graded.length)} |`);
  p(`| ranker | ${pctOf(at((r) => r.rankRanker, 5), graded.length)} | ` +
    `${pctOf(at((r) => r.rankRanker, 6), graded.length)} |`);
  p();
  p("These are the CODE-SIDE projection: `orderMemoCandidates` cut to the published");
  p("cap. `pipeline.ts` reads the ORDER OF THE WRITER'S NOTES as the ranking, so the");
  p("rows a founder actually reads are in the order the writer chose to mention them.");
  p("This is the right quantity for 'does the cut throw the answer away' and it is NOT");
  p("a claim about the finished brief.");
  p();

  p(`## The paired test — McNemar, exact, signed`);
  p();
  p("```");
  for (const k of [5, 6]) {
    const hit = (v: number | null) => v != null && v <= k;
    const r = paired(graded.map((x) => hit(x.rankRanker)), graded.map((x) => hit(x.rankControl)));
    p(mcnemarLine(`EXACT@${k}`, r, "ranker", "control"));
  }
  p("```");
  p();
  p("Concordant pairs carry no information about which arm is better and are excluded");
  p("by the test, not by a filter here. A run with few discordant pairs has little");
  p("evidence in it however many founders it cost.");
  p();

  // ── THE NULL: the model against ITSELF, same prompt, same pool ──────────
  const retested = graded.filter((r) => r.publishedRankerB !== null);
  if (retested.length) {
    p(`## The null — the ranker against ITSELF, same prompt, same pool, same second`);
    p();
    p("```");
    for (const k of [5, 6]) {
      const hit = (v: number | null) => v != null && v <= k;
      const vsControl = paired(
        retested.map((x) => hit(x.rankRanker)), retested.map((x) => hit(x.rankControl)));
      const vsSelf = paired(
        retested.map((x) => hit(x.rankRanker)), retested.map((x) => hit(x.rankRankerB)));
      const dc = retested.length ? (100 * vsControl.discordant) / retested.length : 0;
      const ds = retested.length ? (100 * vsSelf.discordant) / retested.length : 0;
      p(`EXACT@${k}  ranker vs CONTROL  ${vsControl.discordant} discordant of ${retested.length} = ${dc.toFixed(1)}%`);
      p(`EXACT@${k}  ranker vs ITSELF   ${vsSelf.discordant} discordant of ${retested.length} = ${ds.toFixed(1)}%` +
        `   (ab ${vsSelf.ab}, ba ${vsSelf.ba}, exact p = ${vsSelf.p.toFixed(3)})`);
      p(`          ratio ${ds > 0 ? (dc / ds).toFixed(2) : "n/a"}` +
        (ds >= dc
          ? "   ██ THE MODEL DISAGREES WITH ITSELF AS MUCH AS WITH THE SCORE ██"
          : ""));
    }
    const samePicks = retested.filter(
      (r) => (r.picks ?? []).join(",") === (r.picksB ?? []).join(",")).length;
    p(`identical pick lists on ${samePicks}/${retested.length} founders ` +
      `(${((100 * samePicks) / retested.length).toFixed(1)}%)`);
    p("```");
    p();
    p("The second reply is not a second treatment. It is the NULL: two samples of");
    p("one arm, on one prompt, on one pool object, in one loop iteration. If the");
    p("ranker disagrees with itself about as often as it disagrees with the score,");
    p("the head-to-head is measuring sampling noise and no n fixes it. Every prior");
    p("run of this arm sampled the model once and had no way to tell a judgement");
    p("from a coin.");
    p();
    p("The self-comparison is also a FALSIFICATION TEST of this harness: two");
    p("samples of one arm must not be significantly different from each other. An");
    p("exact p below 0.05 on the `ranker vs ITSELF` line means something in the");
    p("replay is not held constant, and the primary result must be discarded.");
    p();
  }

  p(`## Secondary — the won fund's RANK, Wilcoxon signed-rank`);
  p();
  p("```");
  for (const [where, get] of [
    [`POOL rank (of ${VERDICT_POOL}) — the sensitive one`,
      (r: Row) => ({ control: r.poolRankControl, treatment: r.poolRankRanker })],
    [`PUBLISHED rank (of ${PUBLISH_CAP})`,
      (r: Row) => ({ control: r.rankControl, treatment: r.rankRanker })],
  ] as [string, (r: Row) => { control: number | null; treatment: number | null }][]) {
    const w = wilcoxonSignedRank(graded.map(get));
    p(`${where}`);
    p(`  n=${w.n} non-tied pairs (${w.dropped} dropped: the fund is absent from one arm's list)`);
    p(`  mean rank shift ${w.meanShift >= 0 ? "+" : ""}${w.meanShift.toFixed(2)} ` +
      `(NEGATIVE favours the ranker — a lower rank is better)`);
    p(`  z = ${w.z >= 0 ? "+" : ""}${w.z.toFixed(2)}   p = ${w.p < 0.001 ? "<0.001" : w.p.toFixed(3)}`);
  }
  p("```");
  p();
  p("TWO windows, and the first is the one to read. The published projection is");
  p(`only ${PUBLISH_CAP} rows, so a won fund that sits at pool rank 9 under one arm and 14`);
  p("under the other is absent from both and the pair is DROPPED. The dry run made");
  p("that concrete: on the published window the rank test kept three pairs of 120.");
  p();
  p("SECONDARY BY PRE-REGISTRATION. It is a more powerful test of a DIFFERENT");
  p("quantity, and a more powerful test of a different quantity is not a second");
  p("chance at the same question. It may support or qualify the headline; it may not");
  p("carry it. See project-mgmt/wsGA_prereg.md.");
  p();

  p(`## Composition — because DE and FR were already legible`);
  p();
  const byCountry = new Map<string, { n: number; ceiling: number; called: number; c5: number; r5: number }>();
  for (const r of rows) {
    const m = byCountry.get(r.country) ?? { n: 0, ceiling: 0, called: 0, c5: 0, r5: 0 };
    m.n++;
    if (r.called) m.called++;
    if (r.ceilingControl) m.ceiling++;
    if (r.rankControl != null && r.rankControl <= 5) m.c5++;
    if (r.rankRanker != null && r.rankRanker <= 5) m.r5++;
    byCountry.set(r.country, m);
  }
  p(`| country | drawn | share of draw | won fund in pool | CALLED | share of CALLS | control EXACT@5 | ranker EXACT@5 |`);
  p(`|---|---:|---:|---:|---:|---:|---:|---:|`);
  const totalCalled = called.length || 1;
  for (const [c, m] of [...byCountry].sort((a, b) => b[1].called - a[1].called || b[1].n - a[1].n)) {
    p(`| ${c} | ${m.n} | ${((100 * m.n) / rows.length).toFixed(1)}% | ` +
      `${((100 * m.ceiling) / m.n).toFixed(0)}% | ${m.called} | ` +
      `${((100 * m.called) / totalCalled).toFixed(1)}% | ${m.c5} | ${m.r5} |`);
  }
  p();
  const deFr = (byCountry.get("DE")?.n ?? 0) + (byCountry.get("FR")?.n ?? 0);
  const deFrCalled = (byCountry.get("DE")?.called ?? 0) + (byCountry.get("FR")?.called ?? 0);
  p(`DE + FR hold ${deFr} of ${rows.length} = **${((100 * deFr) / rows.length).toFixed(1)}%** of the draw, ` +
    `and ${deFrCalled} of ${called.length} = **${((100 * deFrCalled) / totalCalled).toFixed(1)}%** of the CALLS. ` +
    `The unstratified described population is 53% DE+FR.`);
  p();
  p("The second share is the one that matters under `ONLY_IN_POOL=1`: the in-pool");
  p("rate varies enormously by market, so a draw capped at 15% can still produce a");
  p("called set one market dominates. `MAX_COUNTRY_CALLS` is the cap on that.");
  p();

  p(`## The void conditions, checked rather than promised`);
  p();
  p("Every one of these is a reason the pre-registration declares the run VOID —");
  p("no conclusion of any kind. See project-mgmt/wsGA_prereg.md section 4.");
  p();
  const exits = agentSelectExits();
  const fb = rows.filter((r) => r.fellBack).length;
  const fbShare = called.length ? fb / called.length : 0;
  const choseShare = calls ? exits.chose / calls : 1;
  const voids: [string, boolean, string][] = [
    ["ranker attestation clean", rankerClean, rankerLine],
    ["fell back on <= 5% of calls", fbShare <= 0.05,
      `${fb} of ${called.length} (${(100 * fbShare).toFixed(1)}%)`],
    ["chose on >= 95% of calls", choseShare >= 0.95,
      `${exits.chose} of ${calls} call(s)`],
    ["no call cut off at max_tokens", !/[1-9]\d* CUT OFF/.test(agentSelectTallyLine()),
      "read from the arm tally line above"],
  ];
  p(`| condition | | observed |`);
  p(`|---|---|---|`);
  for (const [what, ok, obs] of voids) {
    p(`| ${what} | ${ok ? "ok" : "**VOID**"} | ${obs} |`);
  }
  p();
  const stable = rows.filter((r) => r.projectionStable !== null);
  if (stable.length) {
    const unstable = stable.filter((r) => r.projectionStable === false).length;
    p(`### Ordering jitter, measured free on this very run`);
    p();
    p(`Under \`arm=off\` this harness projects the SAME pool array twice. The two`);
    p(`published orders differed on **${unstable} of ${stable.length}** founders.`);
    p();
    if (unstable) {
      p("██ THAT IS NOT ZERO, AND IT IS A CEILING ON WHAT ANY PAID RUN CAN CLAIM. ██");
      p(`A treatment effect smaller than ${((100 * unstable) / stable.length).toFixed(1)}% of pairs is`);
      p("indistinguishable from re-running the control against itself.");
    } else {
      p("Zero. The ordering is deterministic on this population, so every discordant");
      p("pair in a paid run is attributable to the arm and not to a tie-break.");
    }
    p();
  }

  p(`## Fallbacks and reach`);
  p();
  p(`- fell back to the shipped order: **${fb}** of ${called.length} call(s). ` +
    "A fallback publishes the CONTROL's order under the treatment's name.");
  if (called.length) {
    const menus = called.map((r) => r.menu).filter((x) => x > 0);
    const deepest = called.map((r) => Math.max(-1, ...r.picks)).filter((x) => x >= 0);
    if (menus.length) {
      p(`- mean menu shown: ${(menus.reduce((a, b) => a + b, 0) / menus.length).toFixed(1)} rows`);
    }
    if (deepest.length) {
      p(`- mean deepest index reached: ${(deepest.reduce((a, b) => a + b, 0) / deepest.length).toFixed(1)}`);
    }
  }
  p(`- exits: \`${agentSelectExitLine()}\``);
  p();
  p("```");
  p(JSON.stringify(exits));
  p("```");
  p();

  p(`## Per founder`);
  p();
  p(`| founder | country | accessible | won @ accessible | in pool | rank control/ranker | EUR |`);
  p(`|---|---|---:|---:|---:|---|---:|`);
  for (const r of rows) {
    p(`| ${r.company} | ${r.country} | ${r.accessible} | ${r.rankAccessible ?? "—"} | ` +
      `${r.ceilingControl ? "yes" : "**no**"} | ${r.rankControl ?? "—"}/${r.rankRanker ?? "—"} | ` +
      `${r.eur.toFixed(4)} |`);
  }
  p();

  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = `${AGENT_SELECT_ARM}_${THINK_EFFORT}_n${rows.length}` +
    (repeat > 1 ? `_x${repeat}` : "") + (process.env.RUN_TAG ? `_${process.env.RUN_TAG}` : "");
  writeFileSync(path.join(OUT_DIR, `${stamp}.md`), L.join("\n"));
  writeFileSync(path.join(OUT_DIR, `${stamp}.json`), JSON.stringify({
    startedAt, arm: AGENT_SELECT_ARM, seam: AGENT_SELECT_SEAM, effort: THINK_EFFORT,
    set: setFile, split, seed, n: rows.length, eligible: eligible.length,
    countryCap: cap, capBound, maxCountryCalls, skippedForCountryCap,
    onlyInPool, repeat, repeatFirst, repeated,
    drawFingerprint,
    corpus: prov, rankerLine, rankerClean,
    calls, spendEur: spend, rows,
  }, null, 1));

  console.log(`\n${L.join("\n")}`);
  console.log(`\nwrote ${OUT_DIR}/${stamp}.md and .json`);

  // A run that could not attest its ranker exits non-zero, so a shell loop
  // cannot chain a second arm onto an unusable first one.
  if (!rankerClean) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
