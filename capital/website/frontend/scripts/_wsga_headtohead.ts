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
//   # the paid run (see project-mgmt/wsGA_prereg.md for the analysis, written first)
//   AGENT_SELECT=adviser AGENT_SELECT_EFFORT=medium N=250 npx tsx scripts/_wsga_headtohead.ts
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
const PAID_ARMS = new Set(["rows", "assist", "adviser"]);
const ARM_ENV = process.env.AGENT_SELECT ?? "off";
requireCredentials("wsga_headtohead",
  PAID_ARMS.has(ARM_ENV)
    ? ["DATABASE_URL", "VOYAGE_KEY", "ANTHROPIC_API_KEY"]
    : ["DATABASE_URL", "VOYAGE_KEY"]);

import {
  AGENT_SELECT_ARM, AGENT_SELECT_SEAM, agentSelectExitLine, agentSelectExits,
  agentSelectLastTrace, agentSelectMemoPool, agentSelectTallyLine, LOOKUP_MAX,
  resetAgentSelectTally, SELECT_COUNT, SELECT_DEPTH, setAgentSelectTracing,
  THINK_EFFORT,
} from "../lib/intelligence/agentSelect";
import { BRIEF_LIMITS } from "../lib/intelligence/briefChecks";
import { VERDICT_POOL } from "../lib/intelligence/caps";
import { withCostTracking } from "../lib/intelligence/cost";
import {
  corpusProvenance, findPeersBySubsector, hydrateDbInstruments, hydrateGatesFor,
  isGenericSubsector, loadDbInstruments, matchCompany, publishableInstruments,
  requireLiveCorpus, resetGateHydration,
} from "../lib/intelligence/corpus";
import { evaluateEligibility } from "../lib/intelligence/eligibility";
import { ExclusionLog } from "../lib/intelligence/exclusions";
import { accessiblePool, orderMemoCandidates } from "../lib/intelligence/memoCandidates";
import { poolRecallAt, poolRecallN } from "../lib/intelligence/poolRecall";
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

const OUT_DIR = path.join(process.cwd(), "..", "..", "project-mgmt", "findings", "headtohead_wsGA");
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
  /** Rank of the won fund in each arm's published projection, 1-based. */
  rankControl: number | null;
  rankRanker: number | null;
  /** The published projection itself, so a re-score does not need the corpus. */
  publishedControl: string[];
  publishedRanker: string[];
  /** Menu indices the model named, and how deep it reached. Empty on a free
   *  arm that did not call. */
  picks: number[];
  menu: number;
  /** Set when the arm gave up and republished the shipped order. A run whose
   *  arm fell back on half its founders is measuring its own control on those
   *  founders and must say so. */
  fellBack: string | null;
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
        f.country, f.opts.targetMarkets, f.eligibility.entityCountries),
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
        req: { ...req, targetMarkets: undefined } as never,
        records: [], dbPeers,
        eligibilityScreen: evaluateEligibility(f.eligibility as never, poolIds),
        semanticScores: semantic, log: l,
      }).toWriter.map((x) => idOf(x.row));
    };

    const ceilingControl = poolControl.map(idOf).includes(t.instrument);
    const publishedControl = project(poolControl);

    // ── THE CONDITIONING GATE, decided before either arm has run ──────────
    const budgetLeft = calls < maxCalls;
    const worthCalling = (!onlyInPool || ceilingControl) && budgetLeft;
    if (!budgetLeft) skippedForBudget++;

    let publishedRanker = publishedControl;
    let ceilingRanker = ceilingControl;
    let picks: number[] = [];
    let menu = 0;
    let fellBack: string | null = null;
    let eur = 0;

    if (worthCalling) {
      const { result, eur: spent } = await withCostTracking(
        () => agentSelectMemoPool(poolControl, req as never));
      const poolRanker = AGENT_SELECT_SEAM === "early"
        ? result.slice(0, VERDICT_POOL) : result;
      const trace = agentSelectLastTrace();
      picks = trace?.picks ?? [];
      menu = trace?.menu.length ?? 0;
      fellBack = trace?.fellBack ?? null;
      eur = spent;
      spend += spent;
      if (AGENT_SELECT_ARM !== "off") calls++;
      ceilingRanker = poolRanker.map(idOf).includes(t.instrument);
      publishedRanker = project(poolRanker);
    }

    rows.push({
      company: f.company, country: t.country, sector: t.sector ?? "other",
      won: t.instrument,
      descriptionChars: (t.description ?? "").length,
      accessible: poolFull.length,
      rankAccessible: rankIn(poolFull.map(idOf), t.instrument),
      ceilingControl, ceilingRanker,
      rankControl: rankIn(publishedControl, t.instrument),
      rankRanker: worthCalling ? rankIn(publishedRanker, t.instrument) : null,
      publishedControl: publishedControl.slice(0, PUBLISH_CAP),
      publishedRanker: worthCalling ? publishedRanker.slice(0, PUBLISH_CAP) : [],
      picks, menu, fellBack, eur,
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
  const called = rows.filter((r) => r.rankRanker !== null || r.publishedRanker.length > 0);
  const graded = onlyInPool ? rows.filter((r) => r.ceilingControl) : rows;
  const L: string[] = [];
  const p = (s = "") => L.push(s);
  const prov = corpusProvenance();
  const rankerLine = rankerTallyLine();

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
    `effort=${THINK_EFFORT} lookups=${LOOKUP_MAX} pool=${VERDICT_POOL} published_cap=${PUBLISH_CAP}`);
  p(`base rate curve    ${poolRecallN()} held-out founders; P(won in first ${VERDICT_POOL})=` +
    `${((poolRecallAt(VERDICT_POOL) ?? 0) * 100).toFixed(1)}%`);
  p(`paid calls         ${calls}${Number.isFinite(maxCalls) ? ` of a MAX_CALLS ceiling of ${maxCalls}` : ""}` +
    `${skippedForBudget ? `, ${skippedForBudget} founder(s) skipped once the ceiling was hit` : ""}`);
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
  const noCeiling = rows.length - rows.filter((r) => r.ceilingControl).length;
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

  p(`## Secondary — the won fund's RANK, Wilcoxon signed-rank`);
  p();
  p("```");
  const w = wilcoxonSignedRank(
    graded.map((r) => ({ control: r.rankControl, treatment: r.rankRanker })));
  p(`n=${w.n} non-tied pairs (${w.dropped} dropped: the fund is absent from one arm's list)`);
  p(`mean rank shift ${w.meanShift >= 0 ? "+" : ""}${w.meanShift.toFixed(2)} ` +
    `(NEGATIVE favours the ranker — a lower rank is better)`);
  p(`z = ${w.z >= 0 ? "+" : ""}${w.z.toFixed(2)}   p = ${w.p < 0.001 ? "<0.001" : w.p.toFixed(3)}`);
  p("```");
  p();
  p("SECONDARY BY PRE-REGISTRATION. It is a more powerful test of a DIFFERENT");
  p("quantity, and a more powerful test of a different quantity is not a second");
  p("chance at the same question. It may support or qualify the headline; it may not");
  p("carry it. See project-mgmt/wsGA_prereg.md.");
  p();

  p(`## Composition — because DE and FR were already legible`);
  p();
  const byCountry = new Map<string, { n: number; ceiling: number; c5: number; r5: number }>();
  for (const r of rows) {
    const m = byCountry.get(r.country) ?? { n: 0, ceiling: 0, c5: 0, r5: 0 };
    m.n++;
    if (r.ceilingControl) m.ceiling++;
    if (r.rankControl != null && r.rankControl <= 5) m.c5++;
    if (r.rankRanker != null && r.rankRanker <= 5) m.r5++;
    byCountry.set(r.country, m);
  }
  p(`| country | founders | share | won fund in pool | control EXACT@5 | ranker EXACT@5 |`);
  p(`|---|---:|---:|---:|---:|---:|`);
  for (const [c, m] of [...byCountry].sort((a, b) => b[1].n - a[1].n)) {
    p(`| ${c} | ${m.n} | ${((100 * m.n) / rows.length).toFixed(1)}% | ` +
      `${((100 * m.ceiling) / m.n).toFixed(0)}% | ${m.c5} | ${m.r5} |`);
  }
  p();
  const deFr = (byCountry.get("DE")?.n ?? 0) + (byCountry.get("FR")?.n ?? 0);
  p(`DE + FR hold ${deFr} of ${rows.length} = **${((100 * deFr) / rows.length).toFixed(1)}%** of the draw. ` +
    `The unstratified population is 53% DE+FR.`);
  p();

  p(`## Fallbacks and reach`);
  p();
  const fb = rows.filter((r) => r.fellBack).length;
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
  p(JSON.stringify(agentSelectExits()));
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
  const stamp = `${AGENT_SELECT_ARM}_${THINK_EFFORT}_n${rows.length}`;
  writeFileSync(path.join(OUT_DIR, `${stamp}.md`), L.join("\n"));
  writeFileSync(path.join(OUT_DIR, `${stamp}.json`), JSON.stringify({
    startedAt, arm: AGENT_SELECT_ARM, seam: AGENT_SELECT_SEAM, effort: THINK_EFFORT,
    set: setFile, split, seed, n: rows.length, eligible: eligible.length,
    countryCap: cap, capBound, onlyInPool, drawFingerprint,
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
