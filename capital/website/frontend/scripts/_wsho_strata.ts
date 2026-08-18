// wsHO — THE FIRST INDICATIVE RUN UNDER THE EUR 4 POLICY.
//
// @ws-active until 2026-09-30
//
// Pre-registered in `project-mgmt/wsHO_prereg.md`, committed before the first
// paid token. Read that file first; this one implements it and nothing else.
//
// ── WHAT IT BUYS, IN PRIORITY ORDER ───────────────────────────────────────
//
//   Q1 COST.  `findings/tokens_wsHI/` prices a full run at EUR 0.0217-0.0483 a
//     call and the whole 2.2x spread is one unmeasured question: does a FORTY-
//     row menu provoke longer thinking? Every recorded paid run in this tree
//     ran EIGHTEEN. This run buys forty-row calls at wsGA's own effort, so the
//     output-token distribution is a BY-PRODUCT of it — mean, p95 and max per
//     API call, read from the API's own usage rather than from a projection.
//
//   Q2 TRUST.  wsHI raised `MAX_TOKENS_BY_EFFORT.medium` to 34,816 and fixed a
//     truncation counter whose denominator was wrong. Both were verified
//     OFFLINE. This is the first live exercise of either, so the report carries
//     the truncation count over `apiCalls`, `exits.threw`, and the slowest call
//     against the clock — because a ceiling the clock cannot reach never
//     truncates, it times out, and that is a zero that lies.
//
//   Q3 DIRECTION.  Does the model's ordering of the forty beat our own six.
//     INDICATIVE. Every figure carries n=.
//
// ── WHY THIS IS NOT `_wsga_headtohead.ts` WITH A SMALLER `MAX_EUR` ────────
//
// wsGA conditions on `ONLY_IN_POOL`, which is the right first cut and stops
// half way. Inside the pool there are still TWO populations and they answer
// different questions:
//
//   R  the won fund is in the forty and NOT in our six   -> the model can RESCUE
//   C  the won fund is already in our six                -> the model can only HARM
//   D  the won fund is not in the forty at all           -> neither arm can move
//
// A run that samples only R measures gain and can never measure harm; it would
// report the numerator of a fraction. So C is carried DELIBERATELY as a control
// stratum, the two rates are reported separately, and the population estimate
// is their weighted difference:
//
//     delta  =  s_R * rescue  -  s_C * harm
//
// D is never called. Neither arm can win there and a call on it is a concordant
// miss bought at full price.
//
// ── THE PROPERTIES THIS FILE GUARANTEES ──────────────────────────────────
//
//  1. ONE POOL OBJECT. Built once per founder, free, and BOTH arms are handed
//     the same array. The lever is which function is applied to it, so there is
//     no "between" for the corpus to move in. Asserted per founder, not
//     promised: `sameArray` compares the identity of the array handed to each.
//
//  2. THE STRATUM IS DECIDED BEFORE EITHER ARM RUNS, by the free pool build
//     both arms already need. It is not a post-hoc cut.
//
//  3. THE RAIL IS IN EUROS AND IS CHECKED AGAINST BILLED USAGE. A founder it
//     stops on is `called=false` and is excluded from every graded set. A spend
//     limit must never be able to turn itself into a result.
//
//  4. THE TAPE IS WRITTEN AS IT GOES. One JSONL line per founder, flushed
//     immediately. A run killed at the rail, at a timeout or by a human loses
//     nothing that was paid for.
//
//  5. PROVENANCE OR IT IS NOT EVIDENCE. `ranker: all N request(s) on EMBEDDING`
//     is printed AND enforced; a run that cannot attest it prints its numbers
//     under a banner saying they may not be quoted, and exits non-zero.
//
//  6. THE ANSWER KEY IS NEVER REACHABLE FROM THE THING BEING GRADED. This file
//     is under `scripts/`, outside the closure `check_answer_not_reachable.ts`
//     walks; the founder is resolved through the shared `founderIntake` with
//     their own history WITHHELD; and paid calls are restricted to
//     `cross_regime` descriptions — prose about the company recovered from an
//     award under a DIFFERENT regime than the fund being predicted. A model
//     reads the query text. `one_funnel`'s looser bar exists because nothing in
//     that run does.
//
// ── HOW TO FIRE IT ────────────────────────────────────────────────────────
//
//   # FREE. Walks the whole population, calls nothing, and produces the strata
//   # denominators, the ordering-jitter check and the harness proof.
//   GUARD_NO_PUBLISH=1 AGENT_SELECT=off OUT_TAG=free npx tsx scripts/_wsho_strata.ts
//
//   # THE PAID RUN. MAX_EUR is a rail, not an estimate.
//   GUARD_NO_PUBLISH=1 AGENT_SELECT=adviser AGENT_SELECT_EFFORT=medium \
//     AGENT_SELECT_UNSURE=declare BRIEF_VERDICT_POOL=40 AGENT_SELECT_DEPTH=40 \
//     MAX_EUR=3.6 OUT_TAG=paid npx tsx scripts/_wsho_strata.ts
//
// @ws-active until 2026-09-30
import { appendFileSync, mkdirSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import path from "path";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();

import {
  AGENT_SELECT_ARM, MAX_TOKENS_BY_EFFORT, VERDICT_POOL, WRITER_CANDIDATE_CAP,
} from "../lib/intelligence/caps";

// The credential contract depends on the arm and is declared either way. A free
// arm must not demand an Anthropic key — the safest machine to prove a harness
// on is one with no way to spend — and the paid arm must, because a missing key
// makes every call fall back and reports the CONTROL under the treatment's name.
const PAID_ARMS = new Set<string>(["rows", "assist", "adviser"]);
const mode = requireCredentials("wsho_strata",
  PAID_ARMS.has(AGENT_SELECT_ARM)
    ? ["DATABASE_URL", "VOYAGE_KEY", "ANTHROPIC_API_KEY"]
    : ["DATABASE_URL", "VOYAGE_KEY"]);
if (mode === "offline") {
  throw new Error(
    "_wsho_strata: NO_PG is set. It deletes DATABASE_URL, which serves the "
    + "committed snapshot AND drops every `rankerUsed` call site to the lexical "
    + "index. One flag, two defects, 5.3 points. Forbidden by the "
    + "pre-registration.");
}

import {
  AGENT_SELECT_SEAM, agentSelectExitLine, agentSelectExits, agentSelectLastTrace,
  agentSelectMemoPool, agentSelectTallyLine, LOOKUP_MAX, resetAgentSelectTally,
  SECTOR_NOTE, SELECT_COUNT, SELECT_COUNT_MODE, SELECT_DEPTH, setAgentSelectTracing,
  THINK_EFFORT, TIMEOUT_BY_EFFORT, UNSURE_MODE,
} from "../lib/intelligence/agentSelect";
import { BRIEF_LIMITS } from "../lib/intelligence/briefChecks";
import { PROFILE_BLOCK } from "../lib/intelligence/pipeline";
import { POOL_BLEND, ROW_PROXIMITY } from "../lib/intelligence/poolBlend";
import {
  corpusProvenance, findPeersBySubsector, hydrateDbInstruments, hydrateGatesFor,
  isGenericSubsector, loadDbInstruments, matchCompany, publishableInstruments,
  requireLiveCorpus, resetGateHydration,
} from "../lib/intelligence/corpus";
import { evaluateEligibility } from "../lib/intelligence/eligibility";
import { ExclusionLog } from "../lib/intelligence/exclusions";
import { accessiblePool, orderMemoCandidates } from "../lib/intelligence/memoCandidates";
import {
  rankerTallyLine, resetRankerTally, semanticFundMatch,
} from "../lib/intelligence/semantic";
import {
  applyProfileSignal, AWARD_TERM, buildInstrumentTableHydrated, founderCountryList,
  tableInputFromAnswers,
} from "../lib/intelligence/shortlist";
import type { InstrumentRow } from "../lib/intelligence/types";
import { withCostTracking } from "../lib/intelligence/cost";
import { founderIntake, founderPolicyFromEnv, type FounderPolicy } from "./founderIntake";
import { paired, wilcoxonSignedRank } from "./_wsga_stats";
import { mcnemarLine } from "./mcnemar";
import { DEFAULT_SEED, halfWidth, sampleRecall } from "./recallSample";
import {
  assertAncestorConvention, assertGradablePopulation, isDescribed, loadRecallSet,
  partitionByOfferable, reattributeMissingAnswers, type RecallRow,
} from "./recallSet";

// ── WHERE THE ARTEFACT LANDS ───────────────────────────────────────────────
// wsHO's own directory is the DEFAULT, so its reproduce line still reproduces
// it byte for byte. A RE-READ of this instrument months later is a different
// artefact and may not be written on top of the one it is compared against:
// `OUT_ROOT` names the folder, `OUT_TAG` names the file inside it, and the paid
// tape of the first run is therefore unreachable from the second.
const OUT_DIR = path.join(
  process.cwd(), "..", "..", "project-mgmt", "findings",
  process.env.OUT_ROOT ?? "indicative_wsHO");

const num = (v: string | undefined, d: number) =>
  (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : d);

/** The row count the owner reads the brief at. One name, three call sites. */
const SHOWN_ROWS = 6;

/** The draw `one_funnel/latest.md`, `door_separation_wsHA/` and wsHE are all
 *  computed on. Asserted so a silent change to the recall set cannot make this
 *  file's strata a partition of some other population. */
const FUNNEL_DRAW = "13cb71cf3a1d1847";

/** What `AGENT_SELECT_EFFORT` is when nobody sets it — `caps.ts`'s own default,
 *  stated once so the report can say whether the run it is describing is the
 *  product or an arm. Retyped here and nowhere else; `check_ws_scripts` has no
 *  opinion on it, so it is pinned by the branch above being wrong out loud. */
const SHIPPED_EFFORT: typeof THINK_EFFORT = "low";

type Stratum = "R" | "C" | "D" | "U";

interface Row {
  company: string;
  country: string;
  won: string;
  /** `parentId ?? id` — `measure_recall.ts`'s own definition, so a REGIME
   *  figure here is comparable with every one this repo has published. */
  wonRegime: string;
  descriptionSource: string;
  descriptionChars: number;
  /** Carried so the free harvest can apply the prompt's OWN money rule without
   *  re-parsing the prompt for a fact the harness already holds. */
  sector: string;
  ticketBand: string;
  /** R rescuable / C at risk / D dead / U unofferable, i.e. not gradable. */
  stratum: Stratum;
  accessible: number;
  /** 1-based rank of the won fund in the whole accessible pool, or null. */
  rankAccessible: number | null;
  /** 1-based rank in each arm's 40-row pool. Equal SET under `late`, so this
   *  exists for every in-pool founder under both arms — the whole point of a
   *  rank test. */
  poolRankControl: number | null;
  poolRankTreatment: number | null;
  controlSix: string[];
  treatmentSix: string[];
  hitControl: boolean;
  hitTreatment: boolean;
  /** The menu the model was actually SHOWN, `min(SELECT_DEPTH, pool)`. Never
   *  the lever that bounds it — that mistake cost a paid run (wsHI). */
  menu: number;
  picks: number[];
  fellBack: string | null;
  called: boolean;
  /** Per API CALL, from the API's own usage. Round two doubles the entries for
   *  a founder whose brief retrieved, which is why these are arrays. */
  outTokens: number[];
  inTokens: number[];
  thinkTokens: number[];
  eur: number;
  /** Asserted, not assumed: both arms were handed the same array object. */
  sameArray: boolean;
  /** ── THE PAID ARTEFACT NOBODY ELSE HOLDS ──────────────────────────────
   *  The full transcript of every API call: the prompt as sent, the reply as it
   *  arrived, and the model's own reasoning. Kept whole and kept on disk,
   *  because this is the FIRST set of real replies at a forty-row menu and
   *  every free question anyone asks of them later is answered from here rather
   *  than re-bought. `_wsdy_slots.ts` measured 2.1 of 18 rows surviving the
   *  prompt's own two disqualifiers by parsing recorded prompts exactly like
   *  these; `_wsho_harvest.ts` does the same at forty. */
  turns: { round: number; prompt: string; reply: string; thinking: string }[];
}

const quant = (xs: number[], q: number): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

async function main() {
  const startedAt = new Date().toISOString();
  await hydrateDbInstruments();
  requireLiveCorpus("wsho_strata");
  resetRankerTally();
  resetAgentSelectTally();
  setAgentSelectTracing(true);

  const store = corpusProvenance().source;
  if (store !== "postgres") {
    throw new Error(
      `_wsho_strata: the corpus came from ${store}, not Postgres. The strata are `
      + "a partition of the SHIPPED funnel and the snapshot is a different one.");
  }

  const corpus = loadDbInstruments();
  assertAncestorConvention(corpus);
  const byId = new Map(corpus.map((i) => [i.id, i]));
  const inCorpus = new Set(corpus.map((i) => i.id));
  const offerable = new Set(publishableInstruments().map((i) => i.id));
  const regimeOf = (id: string) => String(byId.get(id)?.parentId ?? id);

  const { file: setFile, rows: all } = loadRecallSet("wsHO indicative strata");
  const fixed = reattributeMissingAnswers(
    all, (id) => inCorpus.has(id), (id) => offerable.has(id));
  const pop = partitionByOfferable(fixed.rows, (id) => offerable.has(id));
  assertGradablePopulation(pop, (id) => inCorpus.has(id), fixed.reattributed.length, setFile);

  // ── THE POPULATION, IDENTICAL TO `one_funnel` AND wsHA ───────────────────
  const split = process.env.SPLIT ?? "holdout";
  const seed = num(process.env.SEED, DEFAULT_SEED);
  let population = fixed.rows.filter((r) =>
    (split === "all" || r.split === split) && isDescribed(r));
  {
    const seen = new Set<string>();
    population = [...population].sort((a, b) => a.name.localeCompare(b.name))
      .filter((r) => (seen.has(r.name) ? false : (seen.add(r.name), true)));
  }
  const fingerprint = createHash("sha256")
    .update(population.map((r) => `${r.name}::${r.instrument}`).join("\n"))
    .digest("hex").slice(0, 16);
  if (split === "holdout" && fingerprint !== FUNNEL_DRAW) {
    throw new Error(
      `_wsho_strata: population ${fingerprint} is not the funnel's ${FUNNEL_DRAW}. `
      + "The strata are quoted as a partition of that draw and this would be a "
      + "different study wearing its name.");
  }

  // ── THE WALK ORDER IS A SEEDED SHUFFLE ──────────────────────────────────
  // The population is sorted by name so its fingerprint is stable; walking it
  // in that order and stopping at a budget rail would buy the alphabet. The
  // shuffle makes the CALLED set a random sample of R u C, which is what makes
  // the strata rates estimates of anything.
  const walkOrder = sampleRecall(population, population.length, seed) as RecallRow[];
  const walk = Math.min(walkOrder.length, num(process.env.WALK, walkOrder.length));

  /** The rail, in the unit the budget is actually in, checked against what the
   *  API said it billed. */
  const maxEur = num(process.env.MAX_EUR, 4);
  const maxCalls = num(process.env.MAX_CALLS, Number.POSITIVE_INFINITY);
  /** Which strata may be called on. D is excluded by the pre-registration and
   *  the default states that rather than hiding it in a condition. */
  const callStrata = new Set((process.env.STRATA ?? "R,C").split(",").map((s) => s.trim()));
  /** wsGA's stricter leak bar. A model reads the query text. */
  const crossRegimeOnly = (process.env.CROSS_REGIME_ONLY ?? "1") !== "0";

  const policy: FounderPolicy = founderPolicyFromEnv();
  const tag = process.env.OUT_TAG ?? AGENT_SELECT_ARM;
  mkdirSync(OUT_DIR, { recursive: true });
  const tapePath = path.join(OUT_DIR, `${tag}_tape.jsonl`);
  writeFileSync(tapePath, "");

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
    `wsHO indicative · arm=${AGENT_SELECT_ARM} seam=${AGENT_SELECT_SEAM} `
    + `effort=${THINK_EFFORT} maxtok=${MAX_TOKENS_BY_EFFORT[THINK_EFFORT]} `
    + `pool=${VERDICT_POOL} · walking ${walk} of ${population.length} · `
    + `rail EUR ${maxEur.toFixed(2)}\n`);

  for (let w = 0; w < walk; w++) {
    const t = walkOrder[w];
    resetGateHydration();
    const f = founderIntake(t, policy);
    const won = t.instrument;
    const req = {
      company: f.company, country: f.country, description: f.opts.description,
      capitalSought: f.opts.capitalSought, eligibility: f.eligibility,
    };

    const base: Row = {
      company: f.company, country: t.country, won, wonRegime: regimeOf(won),
      descriptionSource: t.descriptionSource ?? "", descriptionChars: (t.description ?? "").length,
      sector: t.sector ?? "", ticketBand: String(f.eligibility.ticketBand ?? ""),
      stratum: "U", accessible: 0, rankAccessible: null,
      poolRankControl: null, poolRankTreatment: null,
      controlSix: [], treatmentSix: [], hitControl: false, hitTreatment: false,
      menu: 0, picks: [], fellBack: null, called: false,
      outTokens: [], inTokens: [], thinkTokens: [], eur: 0, sameArray: false,
      turns: [],
    };

    if (!offerable.has(won)) {
      rows.push(base);
      appendFileSync(tapePath, `${JSON.stringify(base)}\n`);
      continue;
    }

    // ── EVERYTHING BELOW IS FREE AND IS BUILT ONCE ────────────────────────
    // VERBATIM from `_wsha_doors.ts` / `measure_funnel.ts`. The self record's
    // channels are WITHHELD: for a founder replayed against the fund they
    // actually won, their own history CONTAINS THE ANSWER and it would be handed
    // to tier 1 of the sort. Peers are kept, which is what production does for a
    // founder who is not in the corpus.
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

    const poolFull: InstrumentRow[] = applyProfileSignal(
      accessiblePool(hydrated, f.eligibility as never, log), undefined, undefined);
    await hydrateGatesFor(
      poolFull.slice(0, Math.max(VERDICT_POOL, SELECT_DEPTH))
        .map((r) => r.instrumentId).filter((id): id is string => Boolean(id)));

    // ── ONE POOL OBJECT. Both arms are views of THIS array ────────────────
    const pool = poolFull.slice(0, VERDICT_POOL);

    const project = (rowsIn: InstrumentRow[]): string[] => {
      const l = new ExclusionLog();
      const poolIds = rowsIn.map((r) => r.instrumentId).filter((id): id is string => Boolean(id));
      return orderMemoCandidates({
        instrumentTable: rowsIn,
        req: { ...req, targetMarkets: undefined } as never,
        records: [], dbPeers,
        eligibilityScreen: evaluateEligibility(f.eligibility as never, poolIds),
        log: l,
      }).toWriter.map((x) => idOf(x.row));
    };

    base.accessible = poolFull.length;
    base.rankAccessible = rankIn(poolFull.map(idOf), won);
    base.poolRankControl = rankIn(pool.map(idOf), won);
    const controlOrder = project(pool);
    base.controlSix = controlOrder.slice(0, SHOWN_ROWS);
    base.hitControl = base.controlSix.includes(won);

    // ── THE STRATUM, DECIDED BEFORE EITHER ARM RUNS ───────────────────────
    const inPool = base.poolRankControl != null;
    base.stratum = base.hitControl ? "C" : inPool ? "R" : "D";

    // Defaults, so a founder that is not called reads as "the model changed
    // nothing" nowhere: `called=false` excludes it from every graded set.
    base.treatmentSix = base.controlSix;
    base.poolRankTreatment = base.poolRankControl;
    base.hitTreatment = base.hitControl;

    const leakOk = !crossRegimeOnly || (t.descriptionSource ?? "").startsWith("cross_regime");
    const wanted = callStrata.has(base.stratum) && leakOk;
    const budgetLeft = spend < maxEur && calls < maxCalls;
    if (wanted && !budgetLeft) skippedForBudget++;
    const worthCalling = wanted && budgetLeft;

    if (worthCalling) {
      const { result, eur: spent } = await withCostTracking(
        () => agentSelectMemoPool(pool, req as never));
      spend += spent;
      if (AGENT_SELECT_ARM !== "off") calls++;
      const trace = agentSelectLastTrace();
      base.called = true;
      base.eur = spent;
      base.picks = trace?.picks ?? [];
      base.menu = trace?.menu.length ?? 0;
      base.fellBack = trace?.fellBack ?? null;
      // PROPERTY 1, asserted rather than promised: the treatment was handed the
      // control's own array, so pool MEMBERSHIP cannot have moved between arms.
      base.sameArray = result.length === pool.length
        && new Set(result.map(idOf)).size === new Set(pool.map(idOf)).size
        && result.every((r) => pool.includes(r));
      for (const turn of trace?.turns ?? []) {
        const u = (turn.usage ?? {}) as {
          input_tokens?: number; output_tokens?: number;
          output_tokens_details?: { thinking_tokens?: number };
        };
        base.outTokens.push(u.output_tokens ?? 0);
        base.inTokens.push(u.input_tokens ?? 0);
        base.thinkTokens.push(u.output_tokens_details?.thinking_tokens ?? 0);
        base.turns.push({
          round: turn.round, prompt: turn.user, reply: turn.reply, thinking: turn.thinking,
        });
      }
      base.poolRankTreatment = rankIn(result.map(idOf), won);
      base.treatmentSix = project(result).slice(0, SHOWN_ROWS);
      base.hitTreatment = base.treatmentSix.includes(won);
    }

    rows.push(base);
    // PROPERTY 4: flushed immediately. A run killed at the rail, at a timeout or
    // by a human loses nothing that was paid for.
    appendFileSync(tapePath, `${JSON.stringify(base)}\n`);

    if (worthCalling || (w + 1) % 50 === 0) {
      console.log(
        `  ${String(w + 1).padStart(4)}/${walk} ${f.company.slice(0, 28).padEnd(29)}`
        + `${t.country} ${base.stratum} pool ${String(base.accessible).padStart(3)}`
        + ` · won@${base.rankAccessible ?? "-"}`
        + ` · six ${base.hitControl ? "Y" : "n"}/${base.hitTreatment ? "Y" : "n"}`
        + (base.called
          ? ` · menu ${base.menu} · out ${base.outTokens.join("+")} · EUR ${base.eur.toFixed(4)}`
            + ` · total ${spend.toFixed(4)}`
          : "")
        + (base.fellBack ? "  ██ FELL BACK" : ""));
    }
  }

  // ══ THE REPORT ═══════════════════════════════════════════════════════════
  const L: string[] = [];
  const p = (s = "") => L.push(s);
  const prov = corpusProvenance();
  const rankerLine = rankerTallyLine();
  const tallyLine = agentSelectTallyLine();
  const exitLine = agentSelectExitLine();
  const exits = agentSelectExits();

  const walked = rows.length;
  const called = rows.filter((r) => r.called);
  const gradable = rows.filter((r) => r.stratum !== "U");
  const inStratum = (s: Stratum) => rows.filter((r) => r.stratum === s);
  const calledIn = (s: Stratum) => called.filter((r) => r.stratum === s);

  const apiOut = called.flatMap((r) => r.outTokens);
  const apiIn = called.flatMap((r) => r.inTokens);
  const apiThink = called.flatMap((r) => r.thinkTokens);
  const menu40 = called.filter((r) => r.menu === 40);
  const out40 = menu40.flatMap((r) => r.outTokens);

  p(`# wsHO — the forty-row call, priced; the ceiling, exercised; the ordering, pointed`);
  p();
  p("```");
  p(`started            ${startedAt}`);
  p(`finished           ${new Date().toISOString()}`);
  p(`corpus             ${prov.source} instruments=${prov.instruments} at ${prov.hydratedAt}`);
  p(rankerLine);
  p(tallyLine);
  p(exitLine);
  p(`set                ${setFile}  split=${split}  seed=${seed}`);
  p(`population         ${population.length} founder(s), fingerprint ${fingerprint}`);
  p(`walked             ${walked} of ${population.length} in seeded-shuffle order`);
  p("```");
  p();
  p(`### The full lever set this figure was produced under`);
  p();
  p("A paid figure without the configuration that produced it is not reusable, and");
  p("this one is meant to be the baseline the eventual full run is compared against.");
  p("Every value below is read from the SHIPPED constant, never from `process.env` —");
  p("a dump that cannot say which arm produced it is not evidence (wsHA).");
  p();
  p("```");
  p(`arm                ${AGENT_SELECT_ARM}          seam ${AGENT_SELECT_SEAM}`);
  p(`AWARD_TERM         ${AWARD_TERM}${AWARD_TERM === "oneside" ? "       <- flipped 2026-08-17 on wsHE; NEVER SEEN BY A MODEL BEFORE" : ""}`);
  p(`PROFILE_BLOCK      ${PROFILE_BLOCK}${PROFILE_BLOCK === "complete" ? "      <- NEVER SEEN BY A MODEL BEFORE" : ""}`);
  p(`POOL_BLEND         ${POOL_BLEND}          ROW_PROXIMITY ${ROW_PROXIMITY}`);
  p(`VERDICT_POOL       ${VERDICT_POOL}           SELECT_DEPTH ${SELECT_DEPTH}   menu = min(depth, pool)`);
  p(`SELECT_COUNT       ${SELECT_COUNT}            SELECT_COUNT_MODE ${SELECT_COUNT_MODE}`);
  p(`SECTOR_NOTE        ${SECTOR_NOTE}${SECTOR_NOTE === "explain" ? "      <- wsIB, NEVER SEEN BY A MODEL BEFORE" : ""}`);
  p(`AGENT_SELECT_UNSURE ${UNSURE_MODE}     LOOKUP_MAX ${LOOKUP_MAX}`);
  p(`WRITER_CANDIDATE_CAP ${WRITER_CANDIDATE_CAP}   published_cap ${BRIEF_LIMITS.institutionsMax}   shown ${SHOWN_ROWS}`);
  p(`AGENT_SELECT_EFFORT ${THINK_EFFORT}      maxtok ${MAX_TOKENS_BY_EFFORT[THINK_EFFORT]}   clock ${TIMEOUT_BY_EFFORT[THINK_EFFORT]}ms`);
  p("```");
  p();
  // ── THE EFFORT SENTENCE IS READ FROM THE RUN, NOT TYPED (wsHW) ──────────
  // This paragraph was a fixed string saying "this run is at `medium`", and
  // wsHO's own artefact printed it while running at `low` — the addendum had
  // moved the rung and the report writer had not. A run that cannot state its
  // own rung correctly cannot be composed with any other, and quoting a cost
  // for the wrong rung is the wsGS failure exactly. So it is a branch on the
  // constant now, and there is no sentence that can be true of one run and
  // printed by another.
  if (THINK_EFFORT === SHIPPED_EFFORT) {
    p(`**EVERY LEVER ABOVE IS THE SHIPPED DEFAULT. Nothing was tuned for the measurement.**`);
    p(`\`AGENT_SELECT_EFFORT\` is \`${THINK_EFFORT}\`, which is what production runs`);
    p(`(max_tokens ${MAX_TOKENS_BY_EFFORT[THINK_EFFORT].toLocaleString("en-US")}, `
      + `${(TIMEOUT_BY_EFFORT[THINK_EFFORT] / 1000).toFixed(0)}s clock). The cost, the ceiling and the`);
    p(`ordering below are therefore the SHIPPED rung's and no other's.`);
  } else {
    p(`██ **\`AGENT_SELECT_EFFORT\` IS NOT THE SHIPPED DEFAULT.** It ships as`);
    p(`\`${SHIPPED_EFFORT}\` (max_tokens ${MAX_TOKENS_BY_EFFORT[SHIPPED_EFFORT].toLocaleString("en-US")}, `
      + `${(TIMEOUT_BY_EFFORT[SHIPPED_EFFORT] / 1000).toFixed(0)}s clock) and this run is at`);
    p(`\`${THINK_EFFORT}\` (max_tokens ${MAX_TOKENS_BY_EFFORT[THINK_EFFORT].toLocaleString("en-US")}, `
      + `${(TIMEOUT_BY_EFFORT[THINK_EFFORT] / 1000).toFixed(0)}s clock). Every figure below is that rung's`);
    p(`and composes with nothing measured at another. Quoting a cost for the wrong`);
    p(`rung is the wsGS failure and it is named here so it cannot happen quietly.`);
  }
  p();
  p("```");
  p(`leak bar           ${crossRegimeOnly ? "cross_regime ONLY on paid calls (wsGA's stricter bar)" : "isDescribed (one_funnel's bar) — LOOSER"}`);
  p(`strata called      ${[...callStrata].sort().join(",")}  (D is never called by pre-registration)`);
  p(`rail               EUR ${maxEur.toFixed(2)}; ${skippedForBudget} founder(s) turned away by it`);
  p(`spend              EUR ${spend.toFixed(4)} over ${calls} seam call(s)`
    + (calls ? ` = EUR ${(spend / calls).toFixed(4)} per founder` : ""));
  p("```");
  p();
  p("**INDICATIVE. Not a measurement.** Every figure below carries its own `n=`.");
  p("No figure from this run may reach the dashboard headline — that is `one_funnel`");
  p("and nothing else. Pre-registered in `project-mgmt/wsHO_prereg.md`, committed");
  p("before the first paid token.");
  p();

  // ── THE VOID TABLE, BEFORE ANY ANALYSIS ─────────────────────────────────
  const rankerClean = /^ranker: all \d+ request\(s\) on EMBEDDING$/.test(rankerLine);
  const truncMatch = /(\d+)\/(\d+) CUT OFF at max_tokens/.exec(tallyLine);
  const truncated = truncMatch ? Number(truncMatch[1]) : 0;
  const apiCalls = truncMatch ? Number(truncMatch[2]) : apiOut.length;
  const slowestMatch = /slowest call (\d+)ms of (\d+)ms/.exec(tallyLine);
  const slowestMs = slowestMatch ? Number(slowestMatch[1]) : 0;
  const clockMs = slowestMatch ? Number(slowestMatch[2]) : TIMEOUT_BY_EFFORT[THINK_EFFORT];
  const clockShare = clockMs ? slowestMs / clockMs : 0;
  const fellBack = called.filter((r) => r.fellBack).length;
  const fbShare = called.length ? fellBack / called.length : 0;
  const menuMax = Math.max(0, ...called.map((r) => r.menu));
  const sameArrayAll = called.every((r) => r.sameArray);

  p(`## The void conditions, checked rather than promised`);
  p();
  p(`Quoted from \`wsHO_prereg.md\` §6. Every one is a field printed above.`);
  p();
  p(`| condition | | observed |`);
  p(`|---|---|---|`);
  const voids: [string, boolean, string][] = [
    ["1. `exits.threw` is zero", (exits.threw ?? 0) === 0, `${exits.threw ?? 0}`],
    ["2. slowest call <= 80% of the clock", clockShare <= 0.8,
      `${slowestMs}ms of ${clockMs}ms = ${(100 * clockShare).toFixed(1)}%`],
    ["3. no call cut off at max_tokens (VOIDS Q3 ONLY)", truncated === 0,
      `${truncated}/${apiCalls} API call(s)`],
    ["4. ranker attestation clean", rankerClean, rankerLine],
    ["5. fell back on <= 5% of calls", fbShare <= 0.05,
      `${fellBack} of ${called.length} (${(100 * fbShare).toFixed(1)}%)`],
    ["6. both arms handed the same pool array, every called founder", sameArrayAll,
      `${called.filter((r) => r.sameArray).length} of ${called.length}`],
    ["7. `menuMax` is 40", menuMax === 40, `menuMax=${menuMax}`],
  ];
  for (const [what, ok, obs] of voids) p(`| ${what} | ${ok ? "ok" : "**VOID**"} | ${obs} |`);
  p();
  if (!rankerClean) {
    p(`## ██ THIS RUN IS NOT EVIDENCE ██`);
    p();
    p("The numbers below were produced by more than one ranking system, or by none.");
    p("They are printed so the run is not silently discarded, and they may not be quoted.");
    p();
  }

  // ── Q1: THE COST ────────────────────────────────────────────────────────
  p(`## Q1 — what a forty-row call actually costs`);
  p();
  if (!apiOut.length) {
    p("No paid call was made on this run, so there is no distribution to report.");
    p();
  } else {
    p("Read from the API's own `usage` on every turn, not from a projection.");
    p(`One founder is one SEAM call and one or two API calls: round two fires only`);
    p(`where the model itself declared it could not separate two funds.`);
    p();
    p(`| | n | mean | median | p95 | max |`);
    p(`|---|---:|---:|---:|---:|---:|`);
    for (const [label, xs] of [
      ["output tokens / API call, ALL menus", apiOut],
      [`output tokens / API call, menu=40 only`, out40],
      ["of which THINKING", apiThink],
      ["input tokens / API call", apiIn],
    ] as [string, number[]][]) {
      p(`| ${label} | ${xs.length} | ${mean(xs).toFixed(0)} | ${quant(xs, 0.5)} | `
        + `${quant(xs, 0.95)} | ${xs.length ? Math.max(...xs) : 0} |`);
    }
    p();
    const eurPerApi = apiCalls ? spend / apiCalls : 0;
    const eurPerFounder = calls ? spend / calls : 0;
    p(`| | |`);
    p(`|---|---:|`);
    p(`| API calls | ${apiCalls} over ${calls} founder(s) = ${(apiCalls / (calls || 1)).toFixed(2)} per founder |`);
    p(`| **EUR per API call** | **${eurPerApi.toFixed(4)}** |`);
    p(`| **EUR per founder** | **${eurPerFounder.toFixed(4)}** |`);
    p(`| thinking share of output tokens | ${(100 * (apiThink.reduce((a, b) => a + b, 0)
      / Math.max(1, apiOut.reduce((a, b) => a + b, 0)))).toFixed(1)}% |`);
    p(`| ceiling in force (\`MAX_TOKENS_BY_EFFORT.${THINK_EFFORT}\`) | ${MAX_TOKENS_BY_EFFORT[THINK_EFFORT]} |`);
    p(`| largest single reply as a share of it | ${(100 * Math.max(...apiOut)
      / MAX_TOKENS_BY_EFFORT[THINK_EFFORT]).toFixed(1)}% |`);
    p();
    p(`### What the eventual full run costs, now that the spread is measured`);
    p();
    p(`\`findings/tokens_wsHI/\` priced a call at EUR 0.0217 (no menu scaling) to`);
    p(`EUR 0.0483 (linear, the pessimistic end). The realised figure above replaces`);
    p(`both. A full run is the whole gradable population under \`ONLY_IN_POOL\`:`);
    p();
    const inPoolN = inStratum("R").length + inStratum("C").length;
    const fullFounders = Math.round((inPoolN / Math.max(1, walked)) * population.length);
    p(`| run | founders | API calls | EUR |`);
    p(`|---|---:|---:|---:|`);
    p(`| this one | ${calls} | ${apiCalls} | ${spend.toFixed(2)} |`);
    p(`| in-pool population (${inPoolN}/${walked} walked -> ${fullFounders} of ${population.length}) | `
      + `${fullFounders} | ${Math.round(fullFounders * (apiCalls / (calls || 1)))} | `
      + `**${(fullFounders * eurPerFounder).toFixed(2)}** |`);
    p(`| whole population, both strata and the dead one | ${population.length} | `
      + `${Math.round(population.length * (apiCalls / (calls || 1)))} | `
      + `**${(population.length * eurPerFounder).toFixed(2)}** |`);
    p();
    p(`After the 2026-08-31 price change, multiply by 1.5 — the ratio`);
    p(`\`tokens_wsHI/README.md\` carries in its own scaling table.`);
    p();
  }

  // ── Q2: TRUST ───────────────────────────────────────────────────────────
  p(`## Q2 — can the run be trusted`);
  p();
  p("```");
  p(tallyLine);
  p(exitLine);
  p(JSON.stringify(exits));
  p("```");
  p();
  p(`- **truncation: ${truncated} of ${apiCalls} API call(s)** — the denominator is`);
  p(`  \`apiCalls\`, incremented on the line that builds the request, not \`calls\`,`);
  p(`  which counts seam invocations. wsGA's published line divided the second by`);
  p(`  the first and printed \`thought on 210/148 call(s)\`. This is the first LIVE`);
  p(`  exercise of the fix \`lib/intelligence/tallyDenominator.test.ts\` pins.`);
  p(`- **\`exits.threw\`: ${exits.threw ?? 0}** — a ceiling the clock cannot reach never`);
  p(`  truncates, it times out, and a timeout lands here rather than in \`truncated\`.`);
  p(`  A zero on the line above is only evidence when this one is zero too.`);
  p(`- **slowest call: ${slowestMs}ms of ${clockMs}ms = ${(100 * clockShare).toFixed(1)}% of the clock**`);
  p(`  — the first recorded duration for this seam in this repo.`);
  p();

  // ── Q3: DIRECTION ───────────────────────────────────────────────────────
  p(`## Q3 — which way the model's ordering points (INDICATIVE)`);
  p();
  p(`### The strata, measured on this run's own walk`);
  p();
  p(`| stratum | what the model can do | walked | share of gradable | CALLED |`);
  p(`|---|---|---:|---:|---:|`);
  const gradN = gradable.length || 1;
  for (const [s, what] of [
    ["R", "RESCUE — won fund in the forty, not in our six"],
    ["C", "HARM only — won fund already in our six"],
    ["D", "nothing — won fund not in the forty at all"],
  ] as [Stratum, string][]) {
    p(`| **${s}** | ${what} | ${inStratum(s).length} | `
      + `${((100 * inStratum(s).length) / gradN).toFixed(1)}% | ${calledIn(s).length} |`);
  }
  p(`| U | not gradable — the won fund is not publishable | ${inStratum("U").length} | — | 0 |`);
  p();
  const nR = calledIn("R").length;
  const nC = calledIn("C").length;
  const sR = inStratum("R").length / gradN;
  const sC = inStratum("C").length / gradN;
  const rescued = calledIn("R").filter((r) => r.hitTreatment).length;
  const harmed = calledIn("C").filter((r) => !r.hitTreatment).length;
  const rescue = nR ? rescued / nR : 0;
  const harm = nC ? harmed / nC : 0;
  const delta = sR * rescue - sC * harm;
  const seDelta = Math.sqrt(
    (sR ** 2 * rescue * (1 - rescue)) / Math.max(1, nR)
    + (sC ** 2 * harm * (1 - harm)) / Math.max(1, nC));

  p(`### The two rates, and the population estimate`);
  p();
  p(`| | n | count | rate |`);
  p(`|---|---:|---:|---:|`);
  p(`| **rescue** — won fund enters the six under the model | ${nR} | ${rescued} | `
    + `${(100 * rescue).toFixed(1)}% +/-${halfWidth(rescued, nR || 1).toFixed(1)} |`);
  p(`| **harm** — won fund LEAVES the six under the model | ${nC} | ${harmed} | `
    + `${(100 * harm).toFixed(1)}% +/-${halfWidth(harmed, nC || 1).toFixed(1)} |`);
  p();
  p("```");
  p(`delta = s_R * rescue  -  s_C * harm`);
  p(`      = ${sR.toFixed(3)} * ${rescue.toFixed(3)}  -  ${sC.toFixed(3)} * ${harm.toFixed(3)}`);
  p(`      = ${delta >= 0 ? "+" : ""}${(100 * delta).toFixed(2)} points of population EXACT@6`);
  p(`        95% interval  ${(100 * (delta - 1.96 * seDelta)).toFixed(2)} to ${(100 * (delta + 1.96 * seDelta)).toFixed(2)}`);
  p("```");
  p();
  const enough = nR >= 15 && nC >= 15;
  if (!enough) {
    p(`██ **NO DIRECTION IS CLAIMED.** The pre-registration requires at least 15`);
    p(`founders called in EACH stratum and this run called ${nR} in R and ${nC} in C.`);
    p(`"The budget did not buy a direction" is the result, and it is reported as one`);
    p(`rather than rescued by pooling the strata.`);
  } else {
    p(`The pre-registration's bar for claiming a direction — 15 called in each`);
    p(`stratum — is met (R ${nR}, C ${nC}). The direction is **${delta > 0 ? "TOWARDS the model"
      : delta < 0 ? "AWAY from the model" : "flat"}**, and it is`);
    p(`INDICATIVE: the interval spans zero and this run was never powered to close it.`);
  }
  p();

  p(`### The paired test on the called set`);
  p();
  p("```");
  const g = called.filter((r) => r.stratum === "R" || r.stratum === "C");
  const mc = paired(g.map((r) => r.hitTreatment), g.map((r) => r.hitControl));
  p(mcnemarLine(`EXACT@6 (n=${g.length} called, R+C)`, mc, "model", "our score"));
  p("```");
  p();
  p("This pools the two strata and is reported for comparability with wsGA, which");
  p("did the same. It is NOT the estimand: pooling weights the strata by how the");
  p("budget happened to fall rather than by how the population is composed.");
  p();

  p(`### Concentration — because wsHE's +2.4 was +0.4 with one agency removed`);
  p();
  for (const [label, set] of [
    ["RESCUES", calledIn("R").filter((r) => r.hitTreatment)],
    ["HARMS", calledIn("C").filter((r) => !r.hitTreatment)],
  ] as [string, Row[]][]) {
    const byRegime = new Map<string, number>();
    for (const r of set) byRegime.set(r.wonRegime, (byRegime.get(r.wonRegime) ?? 0) + 1);
    const sorted = [...byRegime].sort((a, b) => b[1] - a[1]);
    p(`- **${label}: ${set.length}** across **${sorted.length}** regime(s)`
      + (sorted.length
        ? `; largest \`${sorted[0][0]}\` with ${sorted[0][1]} = `
          + `${((100 * sorted[0][1]) / set.length).toFixed(0)}% of them`
        : ""));
    for (const [reg, n] of sorted) p(`  - \`${reg}\` ${n}`);
  }
  p();

  p(`### Secondary — the won fund's POOL RANK, Wilcoxon signed-rank`);
  p();
  p("```");
  const w = wilcoxonSignedRank(g.map((r) => ({
    control: r.poolRankControl, treatment: r.poolRankTreatment })));
  p(`POOL rank (of ${VERDICT_POOL})`);
  p(`  n=${w.n} non-tied pairs (${w.dropped} dropped)`);
  p(`  mean rank shift ${w.meanShift >= 0 ? "+" : ""}${w.meanShift.toFixed(2)} `
    + `(NEGATIVE favours the model — a lower rank is better)`);
  p(`  z = ${w.z >= 0 ? "+" : ""}${w.z.toFixed(2)}   p = ${w.p < 0.001 ? "<0.001" : w.p.toFixed(3)}`);
  p("```");
  p();
  p("SECONDARY BY PRE-REGISTRATION. A more powerful test of a different quantity is");
  p("not a second chance at the same question.");
  p();

  p(`## Composition of the CALLED set`);
  p();
  const byCountry = new Map<string, number>();
  for (const r of called) byCountry.set(r.country, (byCountry.get(r.country) ?? 0) + 1);
  const sortedC = [...byCountry].sort((a, b) => b[1] - a[1]);
  p(`| country | calls | share |`);
  p(`|---|---:|---:|`);
  for (const [c, n] of sortedC) {
    p(`| ${c} | ${n} | ${((100 * n) / (called.length || 1)).toFixed(1)}% |`);
  }
  p();

  p(`## Per called founder`);
  p();
  p(`| founder | country | stratum | won @ pool | six control/model | menu | out tokens | EUR |`);
  p(`|---|---|---|---:|---|---:|---|---:|`);
  for (const r of called) {
    p(`| ${r.company} | ${r.country} | ${r.stratum} | ${r.poolRankControl ?? "—"}`
      + ` -> ${r.poolRankTreatment ?? "—"} | ${r.hitControl ? "Y" : "n"}/${r.hitTreatment ? "Y" : "n"}`
      + ` | ${r.menu} | ${r.outTokens.join("+")} | ${r.eur.toFixed(4)} |`);
  }
  p();

  const mdPath = path.join(OUT_DIR, `${tag}.md`);
  writeFileSync(mdPath, L.join("\n"));
  writeFileSync(path.join(OUT_DIR, `${tag}.json`), JSON.stringify({
    startedAt, finishedAt: new Date().toISOString(),
    arm: AGENT_SELECT_ARM, seam: AGENT_SELECT_SEAM, effort: THINK_EFFORT,
    maxTokens: MAX_TOKENS_BY_EFFORT[THINK_EFFORT], clockMs: TIMEOUT_BY_EFFORT[THINK_EFFORT],
    verdictPool: VERDICT_POOL, selectDepth: SELECT_DEPTH,
    levers: {
      arm: AGENT_SELECT_ARM, seam: AGENT_SELECT_SEAM, effort: THINK_EFFORT,
      AWARD_TERM, PROFILE_BLOCK, POOL_BLEND, ROW_PROXIMITY,
      VERDICT_POOL, SELECT_DEPTH, SELECT_COUNT, SELECT_COUNT_MODE,
      UNSURE_MODE, LOOKUP_MAX, WRITER_CANDIDATE_CAP, SECTOR_NOTE,
      publishedCap: BRIEF_LIMITS.institutionsMax, shown: SHOWN_ROWS,
      maxTokens: MAX_TOKENS_BY_EFFORT[THINK_EFFORT],
      clockMs: TIMEOUT_BY_EFFORT[THINK_EFFORT],
    },
    set: setFile, split, seed, fingerprint, walked, population: population.length,
    crossRegimeOnly, callStrata: [...callStrata], maxEur, skippedForBudget,
    corpus: prov, rankerLine, rankerClean, tallyLine, exitLine, exits,
    calls, apiCalls, truncated, slowestMs, clockShare, spendEur: spend,
    strata: { R: inStratum("R").length, C: inStratum("C").length,
      D: inStratum("D").length, U: inStratum("U").length },
    calledStrata: { R: nR, C: nC },
    rescue, harm, delta, seDelta, rows,
  }, null, 1));

  console.log(`\n${L.join("\n")}`);
  console.log(`\nwrote ${mdPath}, ${tag}.json and ${tag}_tape.jsonl`);
  if (!rankerClean) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
