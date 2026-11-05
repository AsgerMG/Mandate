// wsGY — HOW MUCH OF THE 46 POINTS IS REACHABLE BY REORDERING AT ALL, AND
// WHERE THE ANSWER ACTUALLY SITS WHEN WE LOSE IT.
//
// `one_funnel/latest.md` loses 14.6 points at `.slice(0, VERDICT_POOL)` and
// 31.3 more at `orderMemoCandidates().toWriter`. `caps.ts:440-496` settles that
// the second is not the cap. Both are the ORDER the accessible pool arrives in.
// Two workstreams are trying to improve that order. This one measures the shape
// of the problem they are pushing on, and it buys nothing:
//
//   1  THE ORACLE CEILING.   Put the won fund FIRST in the accessible pool and
//      run production's own cuts on top of it. What survives to six rows is the
//      most any ordering can ever deliver, at any price, from any model.
//
//   2  THE RANK DISTRIBUTION OF THE ANSWER WHEN WE LOSE IT.  Not a mean. The
//      whole distribution, because a median of 22 with a long tail and a
//      bimodal 9-and-60 imply completely different work.
//
//   3  WHAT DISTINGUISHES THE ROWS RANKED ABOVE THE ANSWER FROM THE ANSWER.
//      Per-founder PERCENTILE within that founder's own accessible pool, so
//      "the score prefers big funds" is separated from "big funds are what the
//      pool is made of". Reported for hits and misses separately: a feature
//      that reads the same on both is not what decides.
//
//   4  WHAT THE CONSTRAINT STACK COSTS AT THE CUT.  `ranking_reopen_wsCS.md`
//      flags its +5.7 as an UPPER BOUND because a fitted blend is scored as a
//      pure re-ordering that pays for no channel cap, no scheme dedupe and no
//      peer precedence. That caveat has never been a number. It is measurable
//      for free on the SHIPPED score, because `tableTrace.ts` records the
//      candidate order at each stage of `materialiseInstrumentTable`, and every
//      stage is a permutation of the same rows.
//
// ── THE ARMS, AND WHY THEY ARE NESTED ──────────────────────────────────────
// Every arm is a PERMUTATION of ONE accessible pool per founder, handed to the
// SAME downstream (`.slice(0, VERDICT_POOL)` then `orderMemoCandidates`). So no
// arm changes what is available, only what order it is in, and the deltas
// between adjacent arms are attributable to exactly one mechanism:
//
//   score_only   the score alone: `relevance` descending, both boolean tiers
//                stripped                                    <- wsCS's frame
//     + the two boolean tiers (usedInField, fitDemoted)
//   sorted       the row comparator's own output      (`recordStage("sorted")`)
//     + the display-name collision demotion
//   collapsed    after `resolveNameCollisions`     (`recordStage("collapsed")`)
//     + peer precedence and the notified-scheme dedupe
//   shipped      what a founder is served today        (`recordStage("final")`)
//
//   oracle       the won fund first, everything else in shipped order
//
// `shipped` is not a re-implementation: it is the array production returned.
// It is carried as an arm anyway, and asserted equal to the funnel's own
// `writer_cap` definition, because an arm harness whose baseline is not the
// product is measuring a system nobody is served by.
//
// ── WHAT THIS IS NOT ───────────────────────────────────────────────────────
// It is DIAGNOSIS. Nothing here is a proposal and nothing here is shipped. The
// ordering code is read, never written: `rowRelevance`, `orderMemoCandidates`,
// `accessiblePool` and `caps.ts` are untouched by this workstream.
//
// ── THE ORACLE MAY NOT REACH THE PRODUCT ───────────────────────────────────
// The answer key is 1.7 MB of real winning project titles in the folder the
// memo path imports from. An oracle is a measurement instrument: it lives here,
// in `scripts/`, and it reads the won fund from the RECALL SET ROW, which is
// the harness's own object. Nothing under `lib/` learns anything.
// `check_answer_not_reachable.ts` stays green.
//
// FREE, NOT OFFLINE. One Voyage embedding and one gate hydration per founder --
// the same cost as `measure_funnel.ts`, and for the same reason: the lexical
// fallback is a different ranker, so measuring it would be a number about a
// system no founder is served by. ANTHROPIC_API_KEY is deleted before anything
// that could reach it is imported.
//
//   N=30  npx tsx scripts/_wsgy_rankshape.ts            # smoke, ~4 min
//   OUT=/tmp/wsgy.json npx tsx scripts/_wsgy_rankshape.ts   # the whole
//                                                      # population, ~2h
//
// The report is rendered by `_wsgy_report.ts` from the JSON, so a formatting
// change never costs the two hours again.
import { createHash } from "crypto";
import { writeFileSync } from "fs";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
// Free by construction, not by intention. Verbatim from measure_funnel.ts.
delete process.env.ANTHROPIC_API_KEY;
if (requireCredentials("wsgy_rankshape", ["DATABASE_URL", "VOYAGE_KEY"]) === "offline") {
  throw new Error(
    "_wsgy_rankshape: NO_PG is set. It deletes DATABASE_URL, which serves the "
    + "committed snapshot AND drops every `rankerUsed` call site to the lexical "
    + "index. One flag, two defects, and it cost 5.3 points once already. This "
    + "harness measures the order the shipped ranker puts funds in; measured "
    + "against the lexical fallback it would be an ordering nobody is served by.");
}

import { VERDICT_POOL, WRITER_CANDIDATE_CAP } from "../lib/intelligence/caps";
import { BRIEF_LIMITS } from "../lib/intelligence/briefChecks";
import {
  corpusProvenance, type DbInstrument, findPeersBySubsector, hydrateDbInstruments,
  isGenericSubsector, loadDbInstruments, matchCompany, publishableInstruments,
  requireLiveCorpus, resetGateHydration, toIso2,
} from "../lib/intelligence/corpus";
import { evaluateEligibility } from "../lib/intelligence/eligibility";
import { ExclusionLog } from "../lib/intelligence/exclusions";
import { accessiblePool, orderMemoCandidates } from "../lib/intelligence/memoCandidates";
import {
  rankerTallyLine, requireCleanRanker, resetRankerTally, semanticFundMatch,
} from "../lib/intelligence/semantic";
import {
  applyProfileSignal, buildInstrumentTableHydrated, founderCountryList, peerPrior,
  tableInputFromAnswers,
} from "../lib/intelligence/shortlist";
import { readTrace, traceOn, traceReset } from "../lib/intelligence/tableTrace";
import type { InstrumentRow } from "../lib/intelligence/types";
import { founderIntake, founderPolicyFromEnv, type FounderPolicy } from "./founderIntake";
import { DEFAULT_SEED, sampleRecall } from "./recallSample";
import {
  assertAncestorConvention, assertGradablePopulation, isDescribed, loadRecallSet,
  partitionByOfferable, reattributeMissingAnswers, type RecallRow,
} from "./recallSet";

const num = (v: string | undefined, d: number) =>
  (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : d);

/** The row count the owner reads the brief at, and the row the 46 points are
 *  quoted against. `institutionsMax` is 7 and every EXACT@K figure in the repo
 *  is at 5; six is the one this workstream's question is asked at, so it is
 *  named once here rather than typed at three call sites. */
const SHOWN_ROWS = 6;

/** The arms, in the order the decomposition reads. Named for the code that
 *  produces them, never for what they are believed to do -- the same rule
 *  `tableTrace.ts` states for its stages, and for the same reason. */
export const ARMS = ["score_only", "sorted", "collapsed", "shipped", "oracle"] as const;
export type Arm = (typeof ARMS)[number];

/** Everything one founder contributes, computed once. */
export interface Row {
  company: string;
  country: string;
  won: string;
  /** The corpus stages, so this file's population reconciles with the funnel's
   *  without re-deriving them. */
  inCorpus: boolean;
  offerable: boolean;
  /** 1-based rank of the won fund in the founder's full instrument table. */
  rankTable: number | null;
  /** 1-based rank in the ACCESSIBLE pool -- the quantity every question here is
   *  really about. `null` = the gates conclusively failed it. */
  rankAccessible: number | null;
  accessibleLen: number;
  tableLen: number;
  /** 1-based rank in `orderMemoCandidates().toWriter` under each arm, or null.
   *  <= WRITER_CANDIDATE_CAP by construction when non-null. */
  writerRank: Partial<Record<Arm, number | null>>;
  /** The won fund's rank in the ACCESSIBLE pool under each arm, uncapped. This
   *  is what says where a reordering moved the answer to, as opposed to whether
   *  it happened to cross a cut. */
  poolRank: Partial<Record<Arm, number | null>>;
  /** ── EXACT@6 IS NOT ENOUGH TO JUDGE AN ARM, AND THAT IS THE WHOLE POINT ──
   *  wsBU's unclipping arm bought +0.7 EXACT@5 for −6 REGIME@5 and −6
   *  CHANNEL@5, and `ranking_reopen_wsCS.md` cites exactly that as why its +5.7
   *  is an upper bound. An arm comparison that reports only the exact fund
   *  therefore cannot tell a gain from a trade. Both are recorded per arm, at
   *  six rows, on `measure_recall.ts`'s own definitions: regime = `parentId ??
   *  id`, channel = `sourceFamilyBucket`.
   *
   *  These are NOT rows of the funnel ladder and must never be added to one:
   *  REGIME credits a SIBLING of the won fund, so a founder can be lost at one
   *  stage and credited at a later one, which breaks nesting. They are a
   *  SECOND, PARALLEL reading of the same six rows. */
  regimeAt6: Partial<Record<Arm, boolean>>;
  channelAt6: Partial<Record<Arm, boolean>>;
  /** Which branch of `applyPeerPrecedence` this founder took, and how many
   *  leading seats the score kept. -1 = peer precedence did not run. */
  peerBranch: "specific" | "flat" | "none";
  scoreSeats: number;
  /** Rows above the won fund in the FINAL order that it BEAT on the score --
   *  the footprint of everything above tier 3. */
  aboveOnTierOnly: number;
  aboveOnPeerOnly: number;
  /** How many rows in the accessible pool score EXACTLY as the won fund does at
   *  the precision the comparator compares at, itself included. A won fund tied
   *  with twenty rows is unreachable by any reordering that reads the score. */
  tiedAtWon: number;
  /** Per-founder PERCENTILE of the won fund within its own accessible pool, and
   *  the mean percentile of the six rows actually shown, per feature. 0 = the
   *  lowest value in this founder's pool, 1 = the highest. */
  featWon: Record<string, number>;
  featShown: Record<string, number>;
}

/** ── THE FEATURES ──────────────────────────────────────────────────────────
 *
 *  A property with a test for an unseen case, not a register of fund names:
 *  each is a number readable off any `DbInstrument` in any corpus, and a fund
 *  nobody has seen gets a value from the same expression. Percentiles are taken
 *  WITHIN the founder's own accessible pool, which is what separates "the score
 *  prefers big funds" from "big funds are what the pool is made of".
 *
 *  `relevance` is the shipped score itself and is included deliberately: it is
 *  the control. If the shown rows do not sit above the won fund on `relevance`,
 *  the loss is not the score's ordering at all and every other column is a
 *  distraction. */
type Feat = (inst: DbInstrument, ctx: FeatCtx) => number;
interface FeatCtx {
  founderCountry: string;
  peerRank: Map<string, number>;
  relevance: Map<string, number>;
  usedInField: Map<string, boolean>;
  fitDemoted: Map<string, boolean>;
}

const FEATURES: Record<string, Feat> = {
  /** Tier 3 of the comparator. THE CONTROL. */
  relevance: (i, c) => c.relevance.get(i.id) ?? 0,
  /** Tier 1 and tier 2, both channel-level booleans that sit ABOVE the score. */
  usedInField: (i, c) => (c.usedInField.get(i.id) ? 1 : 0),
  fitDemoted: (i, c) => (c.fitDemoted.get(i.id) ? 1 : 0),
  /** Is it the founder's own country's, EU-level, or somebody else's. The term
   *  `rowRelevance` does not contain in any form, and the fitted blend's
   *  largest weight (`ranking_reopen_wsCS.md` §2). */
  proximity: (i, c) => {
    const iso = toIso2(i.country ?? "");
    if (!iso || iso === "EU") return 1;
    return iso === c.founderCountry ? 2 : 0;
  },
  /** Everything about a fund's SIZE. wsCS measured each of these at or below a
   *  shuffle as a RANKING signal; the question here is different -- not whether
   *  they predict, but whether our score is systematically picking them. */
  totalEur: (i) => i.totalEur ?? 0,
  eventCount: (i) => i.eventCount ?? 0,
  companyCount: (i) => i.companyCount ?? 0,
  awardP50: (i) => i.awardP50 ?? 0,
  /** How recently it awarded anything. */
  lastYear: (i) => i.lastYear ?? 0,
  /** Does the collaborative prior for this founder's country and sector name
   *  it, and how highly. Peer-unknown scores 0, which is the strict tier's own
   *  reading of it. */
  peerKnown: (i, c) => (c.peerRank.has(i.id) ? 1 : 0),
  /** How much text the fund carries. A row with more prose gives the semantic
   *  index more to match, so a score that prefers verbose funds is preferring
   *  our collection effort rather than the founder's fit. */
  textLen: (i) => (i.description?.length ?? 0) + (i.eligibilityText?.length ?? 0),
};
export const FEATURE_NAMES = Object.keys(FEATURES);

/** Percentile of `v` among `all`: the share of the pool strictly below it plus
 *  half the share tied with it. Ties get the midpoint rather than the top, so a
 *  feature that is constant across the pool reads 0.5 (no opinion) instead of
 *  1.0 (the strongest possible preference), which is the failure mode of a
 *  naive rank. */
function percentile(v: number, all: number[]): number {
  if (!all.length) return 0.5;
  let below = 0, tied = 0;
  for (const x of all) { if (x < v) below++; else if (x === v) tied++; }
  return (below + tied / 2) / all.length;
}

/** Reorder `pool` to follow `reference`, keeping anything absent from it at the
 *  back in its own relative order. Nothing is added or removed -- the property
 *  every ordering in the product keeps, and the reason an arm's delta is
 *  attributable to the mechanism rather than to membership. */
function reorderBy(pool: InstrumentRow[], reference: string[]): InstrumentRow[] {
  const at = new Map<string, number>();
  reference.forEach((id, i) => { if (!at.has(id)) at.set(id, i); });
  const key = (r: InstrumentRow) => r.instrumentId ?? r.channel;
  return pool
    .map((r, i) => ({ r, i, k: at.get(key(r)) ?? Number.POSITIVE_INFINITY }))
    .sort((a, b) => (a.k - b.k) || (a.i - b.i))
    .map((x) => x.r);
}

async function main() {
  const startedAt = new Date().toISOString();
  await hydrateDbInstruments();
  requireLiveCorpus("_wsgy_rankshape");
  const store = corpusProvenance().source;
  if (store !== "postgres") {
    throw new Error(
      `_wsgy_rankshape: the corpus came from ${store}, not Postgres. Every question `
      + "here is about the order a founder's own request produces, and a request "
      + "reads Postgres. The snapshot is the degradation path and offers strictly "
      + "fewer instruments; measuring it would be a different run wearing this "
      + "one's name.");
  }
  resetRankerTally();
  traceOn();

  const corpus = loadDbInstruments();
  assertAncestorConvention(corpus);
  const byId = new Map(corpus.map((i) => [i.id, i]));
  const inCorpus = new Set(corpus.map((i) => i.id));
  const offerable = new Set(publishableInstruments().map((i) => i.id));
  // `measure_recall.ts`'s own two definitions, so a REGIME or CHANNEL figure
  // here is comparable with every one this repo has published. Not restated in
  // prose anywhere: a second definition of "same regime" is a second metric.
  const regimeOf = (id: string) => String(byId.get(id)?.parentId ?? id);
  const channelOf = (id: string) => String(byId.get(id)?.sourceFamilyBucket ?? "");

  const { file: setFile, rows: all } = loadRecallSet("wsGY rank shape");
  const fixed = reattributeMissingAnswers(
    all, (id) => inCorpus.has(id), (id) => offerable.has(id));
  const pop = partitionByOfferable(fixed.rows, (id) => offerable.has(id));
  assertGradablePopulation(pop, (id) => inCorpus.has(id), fixed.reattributed.length, setFile);

  // ── THE POPULATION, IDENTICAL TO `measure_funnel.ts` BY CONSTRUCTION ──────
  // Drawn from `fixed.rows` (before the offerability cut), held out, described,
  // one founder per company, sorted by name. Every figure here therefore shares
  // a denominator with `one_funnel/latest.md` and the two can be read together
  // -- which is the whole reason that instrument exists, and the failure this
  // repo has paid for twice.
  const split = process.env.SPLIT ?? "holdout";
  const seed = num(process.env.SEED, DEFAULT_SEED);
  let population = fixed.rows.filter((r) =>
    (split === "all" || r.split === split) && isDescribed(r));
  {
    const seen = new Set<string>();
    population = [...population].sort((a, b) => a.name.localeCompare(b.name))
      .filter((r) => (seen.has(r.name) ? false : (seen.add(r.name), true)));
  }
  if (!population.length) {
    throw new Error(`_wsgy_rankshape: no rows match split=${split} with a description.`);
  }
  const n = num(process.env.N, 0);
  const drawn = (n > 0 ? sampleRecall(population, n, seed) : population) as RecallRow[];
  const fingerprint = createHash("sha256")
    .update(drawn.map((r) => `${r.name}::${r.instrument}`).join("\n"))
    .digest("hex").slice(0, 16);

  console.log(
    `wsGY rank shape · set=${setFile} split=${split} · ${drawn.length} founder(s)`
    + `${n > 0 ? ` sampled of ${population.length}` : " (the whole population)"}`
    + ` · draw ${fingerprint}\n`);

  const policy: FounderPolicy = founderPolicyFromEnv();
  const out: Row[] = [];

  for (const t of drawn) {
    resetGateHydration();
    traceReset();
    const f = founderIntake(t, policy);
    const won = t.instrument;
    const isOfferable = offerable.has(won);

    const row: Row = {
      company: t.name, country: t.country, won,
      inCorpus: inCorpus.has(won), offerable: isOfferable,
      rankTable: null, rankAccessible: null, accessibleLen: 0, tableLen: 0,
      writerRank: {}, poolRank: {}, regimeAt6: {}, channelAt6: {},
      peerBranch: "none", scoreSeats: -1,
      aboveOnTierOnly: 0, aboveOnPeerOnly: 0, tiedAtWon: 0,
      featWon: {}, featShown: {},
    };

    if (isOfferable) {
      // ── VERBATIM FROM `measure_funnel.ts` ────────────────────────────────
      // The founder's own channels are WITHHELD: replayed against the fund they
      // actually won, their history CONTAINS the answer and `fieldChannels` is
      // tier 1 of the row sort. Peers are kept, which is what production does
      // for a founder who is not in the corpus.
      const selfRecord = matchCompany(f.company, f.country);
      const targetSub = selfRecord.matched && !isGenericSubsector(selfRecord.subsector)
        ? selfRecord.subsector : "";
      const dbPeers = targetSub
        ? findPeersBySubsector(targetSub, { country: f.country, limit: 4, exclude: [f.company] })
        : [];
      const semantic = await semanticFundMatch(f.opts.description ?? "");
      const log = new ExclusionLog();
      // Hoisted out of the call because the peer prior below has to be built
      // from THE SAME first country the table was built with; two derivations
      // of one founder's country list would be two priors under one name.
      const founderCountries = founderCountryList(
        f.country, f.eligibility.entityCountries);
      const hydrated = await buildInstrumentTableHydrated({
        fieldChannels: new Set<string>(dbPeers.flatMap((r) => r.channels)),
        founderCountries,
        capitalSought: f.opts.capitalSought,
        description: f.opts.description,
        semantic,
        ...tableInputFromAnswers(f.eligibility),
        log,
      } as never);
      row.tableLen = hydrated.length;
      const iTable = hydrated.map((r: InstrumentRow) => r.instrumentId).indexOf(won);
      row.rankTable = iTable < 0 ? null : iTable + 1;

      const accessible = applyProfileSignal(
        accessiblePool(hydrated, f.eligibility as never, log), undefined, undefined);
      row.accessibleLen = accessible.length;
      const iAcc = accessible.map((r) => r.instrumentId).indexOf(won);
      row.rankAccessible = iAcc < 0 ? null : iAcc + 1;

      const trace = readTrace();
      row.peerBranch = trace.peerBranch;
      row.scoreSeats = trace.scoreSeats;
      const stage = (name: string) => trace.stages.find((s) => s.name === name)?.ids ?? [];
      const facts = new Map(trace.facts.map((x) => [x.id, x]));
      const rel = new Map(trace.facts.map((x) => [x.id, x.relevance] as const));
      const usedInField = new Map(trace.facts.map((x) => [x.id, x.usedInField] as const));
      const fitDemoted = new Map(trace.facts.map((x) => [x.id, x.fitDemoted] as const));

      // ── THE ARMS ─────────────────────────────────────────────────────────
      // Each is a permutation of `accessible`, handed to the SAME downstream.
      const key = (r: InstrumentRow) => r.instrumentId ?? r.channel;
      const relOf = (r: InstrumentRow) => rel.get(key(r)) ?? 0;
      const orders: Record<Arm, InstrumentRow[]> = {
        // The score alone, both boolean tiers stripped. Ties keep the shipped
        // relative order, so `score_only` differs from `sorted` ONLY where a
        // tier actually moved something.
        score_only: [...accessible]
          .map((r, i) => ({ r, i }))
          .sort((a, b) => (relOf(b.r) - relOf(a.r)) || (a.i - b.i))
          .map((x) => x.r),
        sorted: reorderBy(accessible, stage("sorted")),
        collapsed: reorderBy(accessible, stage("collapsed")),
        // Production's own array. Not re-derived.
        shipped: accessible,
        // ── THE ORACLE ───────────────────────────────────────────────────
        // The won fund first, everything else in shipped order. It reads the
        // answer off the RECALL SET ROW -- a harness object -- and hands
        // production an ordering. Nothing under `lib/` is told anything, and
        // no production path can construct this.
        oracle: iAcc < 0 ? accessible
          : [accessible[iAcc], ...accessible.filter((_r, i) => i !== iAcc)],
      };

      let shippedSix: string[] = [];
      // ── THE SELF-CHECK, AND WHY IT EXISTS ────────────────────────────────
      // `shipped` is the baseline every delta in this file is taken against,
      // and it is measured INSIDE a loop that has already run four other arms
      // through `orderMemoCandidates` and `evaluateEligibility` for the same
      // founder. If either of those carried request-scoped state, the baseline
      // would be a function of the arms beside it and every delta would be
      // wrong in a way no half-width could show. `ONLY_ARM=shipped` runs the
      // identical harness with nothing else in the loop; the two runs agreeing
      // founder for founder is what makes the baseline the product's.
      const only = process.env.ONLY_ARM;
      for (const arm of ARMS) {
        if (only && arm !== only) continue;
        const ord = orders[arm];
        const iPool = ord.map((r) => r.instrumentId).indexOf(won);
        row.poolRank[arm] = iPool < 0 ? null : iPool + 1;
        const poolCut = ord.slice(0, VERDICT_POOL);
        const poolIds = poolCut.map((r) => r.instrumentId)
          .filter((id): id is string => Boolean(id));
        const toWriter = orderMemoCandidates({
          instrumentTable: poolCut,
          req: {
            company: f.company, country: f.country, description: f.opts.description,
            capitalSought: f.opts.capitalSought, eligibility: f.eligibility,
          } as never,
          records: [], dbPeers,
          eligibilityScreen: evaluateEligibility(f.eligibility as never, poolIds),
          log: new ExclusionLog(),
        }).toWriter.map((x) => x.row.instrumentId ?? x.row.channel);
        const iW = toWriter.indexOf(won);
        row.writerRank[arm] = iW < 0 ? null : iW + 1;
        // The six rows the founder reads, under this arm, read a second way.
        const six = toWriter.slice(0, SHOWN_ROWS);
        row.regimeAt6[arm] = six.some((id) => regimeOf(id) === regimeOf(won));
        row.channelAt6[arm] = six.some((id) =>
          channelOf(id) !== "" && channelOf(id) === channelOf(won));
        if (arm === "shipped") shippedSix = six;
      }

      // ── WHAT SITS ABOVE IT, AND ON WHAT ──────────────────────────────────
      if (iAcc >= 0) {
        const wonRel = Math.round((rel.get(won) ?? 0) * 1e6);
        const above = accessible.slice(0, iAcc);
        for (const r of above) {
          const k = key(r);
          const fr = facts.get(k);
          const beatOnScore = Math.round((rel.get(k) ?? 0) * 1e6) > wonRel;
          if (beatOnScore) continue;
          // It did NOT outscore the won fund and is above it anyway. Which
          // mechanism put it there: a boolean tier, or everything below the
          // sort (the collapse, peer precedence, the scheme dedupe).
          const wonFacts = facts.get(won);
          const tier = fr && wonFacts
            && ((fr.usedInField && !wonFacts.usedInField)
              || (!fr.fitDemoted && wonFacts.fitDemoted));
          if (tier) row.aboveOnTierOnly++;
          else row.aboveOnPeerOnly++;
        }
        row.tiedAtWon = accessible.filter((r) =>
          Math.round((rel.get(key(r)) ?? 0) * 1e6) === wonRel).length;
      }

      // ── THE FEATURE PERCENTILES ──────────────────────────────────────────
      // Over the accessible pool, which is the population the ordering chooses
      // from. `shown` is the six rows a founder actually reads under the
      // shipped arm; where the brief is shorter than six, it is however many
      // there are.
      // THE PRODUCT'S OWN PRIOR, off the product's own two arguments:
      // `applyPeerPrecedence(rows, founderCountries?.[0], founderSector, ...)`
      // and `founderSector` is `tableInputFromAnswers`'s `e?.sector`. Reading a
      // prior built from anything else would put a different statistic under
      // this column's name.
      const ctx: FeatCtx = {
        founderCountry: toIso2(f.country ?? "") || "",
        peerRank: new Map(peerPrior(founderCountries[0], f.eligibility.sector)
          .map((id, i) => [id, i] as const)),
        relevance: rel, usedInField, fitDemoted,
      };
      const poolInsts = accessible
        .map((r) => (r.instrumentId ? byId.get(r.instrumentId) : undefined))
        .filter((i): i is DbInstrument => Boolean(i));
      const wonInst = byId.get(won);
      // ── THE WON FUND IS EXCLUDED FROM `shown`, AND THAT IS NOT A DETAIL ──
      // On a HIT the won fund IS one of the six, so leaving it in would make
      // the hit column partly a measurement of itself and every feature would
      // read "the shown rows look like the won fund" for the trivial reason.
      // `shown` is therefore always THE OTHER ROWS ON THE PAGE, on hits and on
      // misses alike, which is the only way the two columns compare.
      const shownIds = shippedSix.filter((id) => id !== won);
      for (const [name, fn] of Object.entries(FEATURES)) {
        const allVals = poolInsts.map((i) => fn(i, ctx));
        if (wonInst) row.featWon[name] = percentile(fn(wonInst, ctx), allVals);
        const shownVals = shownIds
          .map((id) => byId.get(id)).filter((i): i is DbInstrument => Boolean(i))
          .map((i) => percentile(fn(i, ctx), allVals));
        if (shownVals.length) {
          row.featShown[name] = shownVals.reduce((a, b) => a + b, 0) / shownVals.length;
        }
      }
    }

    out.push(row);
    if (out.length % 25 === 0) console.log(`  ${out.length}/${drawn.length}`);
  }

  // ── ATTESTATION, BEFORE ANYTHING IS WRITTEN TO DISK ───────────────────────
  // A run that averaged two rankers and printed one number is not evidence, and
  // this is the check that stops one being filed as though it were.
  requireCleanRanker("_wsgy_rankshape");
  console.log(`\n${rankerTallyLine()}`);

  const meta = {
    startedAt, finishedAt: new Date().toISOString(),
    set: setFile, split, seed, n: out.length,
    populationSize: population.length, fingerprint,
    store, instruments: corpus.length,
    levers: {
      VERDICT_POOL, WRITER_CANDIDATE_CAP,
      publishedCap: BRIEF_LIMITS.institutionsMax,
    },
    ranker: rankerTallyLine(),
    // The arm and feature lists travel INSIDE the file rather than being
    // re-declared by the reader. `_wsgy_report.ts` imports nothing but the
    // TYPES from here — a value import would run this file's `main()`, and a
    // report that opens a database to format a committed number is a harness
    // waiting to measure something it did not mean to.
    arms: [...ARMS],
    features: FEATURE_NAMES,
  };
  const dest = process.env.OUT ?? "/tmp/wsgy_rankshape.json";
  writeFileSync(dest, JSON.stringify({ meta, rows: out }, null, 1));
  console.log(`wrote ${dest}  (${out.length} founders)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
