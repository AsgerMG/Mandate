// WHICH SIGNAL, ALONE, PUTS THE WON FUND IN THE TOP FIVE OF ITS OWN POOL.
//
// ── Why this exists, and why it is being re-run ────────────────────────────
// An earlier holdout study scored each signal on its own and concluded
// "instrument metadata cannot pick 1 of 50". That conclusion was drawn against
// `__recallSetComposed.json`, an answer key that could name 390 funds in 9
// countries and could not name a CHILDLESS FAMILY at all — the population the
// product offers most of. The active key is `__recallSetDoors.json`: 611 funds,
// 28 countries, 7,095 pairs, and it names 1,180 holdout pairs whose answer is a
// family nobody split. A conclusion about what metadata can do, measured where
// a third of the answers were invisible, has to be re-established rather than
// inherited.
//
// ── The measurement ───────────────────────────────────────────────────────
// One expensive pass produces the POOL — `candidateInstrumentIds` from the real
// `computeVerdict`, the same funds the product ranks. Every signal is then
// scored over THAT pool, offline and free. So every arm shares a denominator,
// a draw and a candidate set, and a difference between two arms is the signal
// and nothing else.
//
// ── Ties are resolved by EXPECTATION, not by an id sort ───────────────────
// `recency` takes nine values over a pool of fifty; `proximity` takes three.
// Sorting those and slicing five would grade whatever the tiebreak happened to
// be — for an id sort, the alphabet. So a pair's score is the PROBABILITY the
// won fund lands in the top five under uniform random tie-breaking:
//
//     better = candidates strictly above the won fund
//     tied   = candidates equal to it, itself included
//     p      = better >= 5 ? 0 : min(1, (5 - better) / tied)
//
// A signal that separates nothing scores 5/|pool| — which is exactly the random
// baseline, so the baseline is not a remembered number here, it is the CONSTANT
// signal measured on the same pools as everything else. It is reported as
// `random baseline` and it is computed, never quoted.
//
// ── Leaks ─────────────────────────────────────────────────────────────────
// Two are documented and both stay controlled. Descriptions that sit inside the
// won fund's own profile are already excluded from `isDescribed`; DESCRIBED=1
// restricts to that leak-free population and every number is labelled with
// whether it was set. The semantic signal is the only one that reads the
// founder's text at all — every other signal here is instrument-side metadata
// and cannot leak a description it never sees.
//
// FREE. No model calls beyond the Voyage query embedding the ranker already
// makes per description, which is the same cost as `measure_recall.ts`.
//
//   npx tsx scripts/measure_signal_power.ts
//   SPLIT=tune N=400 npx tsx scripts/measure_signal_power.ts
//   FEATURES_OUT=/tmp/tune.json SPLIT=tune npx tsx scripts/measure_signal_power.ts
import { writeFileSync } from "fs";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("measure_signal_power", ["DATABASE_URL", "VOYAGE_KEY"]);

import {
  corpusProvenance, hydrateDbInstruments, loadDbInstruments, publishableInstruments,
  requireLiveCorpus, resetGateHydration, toIso2,
} from "../lib/intelligence/corpus";
import { eligibilityFit, livenessFit, scaleFit, sectorFit } from "../lib/intelligence/fit";
import { computeVerdict } from "../lib/intelligence/pipeline";
import { rankerTallyLine, resetRankerTally } from "../lib/intelligence/semantic";
import { semanticFundMatch } from "../lib/intelligence/semantic";
import { peerPrior, THEME_WEIGHT } from "../lib/intelligence/shortlist";
import { assessAll } from "../lib/intelligence/verdict";
import { DEFAULT_SEED, halfWidth, sampleRecall } from "./recallSample";
import {
  answersFor, assertAncestorConvention, assertGradablePopulation, isDescribed, loadRecallSet,
  partitionByOfferable, reattributeMissingAnswers, type AnswerMode, type RecallRow,
} from "./recallSet";

/** The cut the product publishes. Five funds, which is the whole product. */
const TOP = 5;

/** Probability the won fund is inside the top `TOP` when the pool is ordered by
 *  `value` descending and ties are broken uniformly at random.
 *
 *  Exact, not simulated: with `better` strictly above and `tied` equal, the won
 *  fund takes one of `TOP - better` remaining slots with probability
 *  `(TOP - better) / tied` under a uniform random permutation of the tied block.
 *  This is what makes a signal with three distinct values comparable with one
 *  that has fifty. */
export function expectedHitAt5(values: number[], wonValue: number): number {
  let better = 0, tied = 0;
  for (const v of values) {
    if (v > wonValue) better++;
    else if (v === wonValue) tied++;
  }
  if (better >= TOP) return 0;
  if (tied === 0) return 0;
  return Math.min(1, (TOP - better) / tied);
}

type Acc = { n: number; sum: number; sumsq: number };
const acc = (): Acc => ({ n: 0, sum: 0, sumsq: 0 });
const add = (a: Acc, p: number) => { a.n++; a.sum += p; a.sumsq += p * p; };
const rate = (a: Acc) => (a.n ? a.sum / a.n : 0);
/** 95% half-width in POINTS.
 *
 *  For a 0/1 outcome this is `halfWidth` from recallSample.ts exactly. For the
 *  expected-hit values above — which are probabilities in [0,1], not indicators
 *  — the binomial formula is the wrong variance, so the SAMPLE sd is used and
 *  reduces to the binomial one when every value is 0 or 1. Same interval, one
 *  definition, and no arm gets a narrower band for being tie-heavy. */
function halfWidthOf(a: Acc): number {
  if (a.n < 2) return 100;
  const mean = a.sum / a.n;
  const varr = Math.max(0, a.sumsq / a.n - mean * mean) * (a.n / (a.n - 1));
  return 100 * 1.96 * Math.sqrt(varr / a.n);
}

/** Every signal a founder's pool can be ordered by, as one table.
 *
 *  A signal is a pure function of (candidate, founder) and is scored over the
 *  pool the product actually built, so nothing here can invent a candidate the
 *  ranker never considered. `null` means the signal has no opinion about this
 *  candidate and the caller substitutes the pool's own median — the same
 *  convention `sectorFitScorer` establishes for a gap in our data. */
type SignalCtx = {
  pool: { id: string; inst: import("../lib/intelligence/corpus").DbInstrument }[];
  founderSector?: string;
  founderCountries: Set<string>;
  ticketBand?: string;
  theme: Map<string, number>;
  eligibility: Map<string, { status: string }>;
  peerRank: Map<string, number>;
  year: number;
};

const SIGNALS: Record<string, (i: SignalCtx["pool"][number]["inst"], c: SignalCtx) => number | null> = {
  // ── the four the prior study named ──────────────────────────────────────
  "sector share (shipped, clipped)": (i, c) => sectorFit(i.sectorMix, c.founderSector),
  "collaborative prior (peer)": (i, c) => c.peerRank.has(i.id) ? -c.peerRank.get(i.id)! : null,
  "event count": (i) => i.eventCount,
  "recency (last award year)": (i, c) => livenessFit(i, c.year),
  // ── the same bytes read the other way ───────────────────────────────────
  // Ranking by the RAW COUNT of a fund's awards in the founder's sector is
  // ranking by the posterior P(fund | sector) across the pool: the denominator
  // is the same for every candidate, so it cannot change an order. No new
  // column, no new question — the clip and the per-fund normalisation are the
  // only difference from the row above.
  "sector count (posterior)": (i, c) =>
    c.founderSector && i.sectorMix ? (i.sectorMix[c.founderSector] ?? 0) : null,
  "sector share (unclipped)": (i, c) => {
    if (!c.founderSector || !i.sectorMix) return null;
    const total = Object.values(i.sectorMix).reduce((a, b) => a + b, 0);
    return total > 0 ? (i.sectorMix[c.founderSector] ?? 0) / total : null;
  },
  // ── everything else the corpus can offer per candidate ──────────────────
  "semantic (founder's text)": (i, c) => c.theme.get(i.id) ?? null,
  "award scale fit": (i, c) => scaleFit(i, c.ticketBand),
  "proximity (home country)": (i, c) =>
    !i.country || i.country === "EU" ? 0.45 : c.founderCountries.has(i.country) ? 1 : 0,
  "eligibility (encoded gates)": (i, c) =>
    eligibilityFit(c.eligibility.get(i.id) as never),
  "company count": (i) => i.companyCount,
  "total EUR": (i) => i.totalEur,
  "award median": (i) => i.awardP50 ?? null,
  "encoded gate count": (i) => i.gates.length,
};

/** A pool ordered by nothing at all. The baseline, computed on the same pools
 *  as every arm above rather than remembered from another population. */
const RANDOM = "random baseline";

/** The production ordering function, as a pool ranking.
 *
 *  `selectLeafInstruments` sorts on `THEME_WEIGHT * relevance + (1 - THEME_WEIGHT)
 *  * sectorFit`, and that blend is what puts a fund in front of a founder. It is
 *  measured here as its own arm so the table's quotas, channel caps and sibling
 *  reassignment can be separated from the SCORE they operate on: a signal that
 *  beats the score but loses to SHIPPED is being wasted downstream, and a signal
 *  that beats SHIPPED but loses to the score is not. */
const SHIPPED_SCORE = "shipped pool score (theme+sector)";
/** The lever `project-mgmt/research/corpus_signal_map.md` recommends, stated as
 *  a ranking rather than as an argument.
 *
 *  The clip in `sectorFit` ties the top of a sibling group in most comparisons,
 *  and the per-fund normalisation asks P(sector | fund) where the shortlist needs
 *  P(fund | sector). Both are fixed by ordering siblings on the RAW COUNT of a
 *  fund's awards in the founder's sector — the numerator of the posterior, whose
 *  denominator is constant across the group and therefore cannot reorder it.
 *
 *  Applied as a RANK-PRESERVING PERMUTATION, the same construction the region
 *  reassignment already uses: a regime keeps exactly the positions the shipped
 *  score won for it, and only which sibling occupies them changes. So it can
 *  never turn into a channel prior, which is the failure mode that cost
 *  `objectiveScorer` 21 points when it was tried in the row sort. */
const REGIME_PERMUTED = "shipped score, siblings by sector count";

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("measure_signal_power");
  const byId = new Map(loadDbInstruments().map((i) => [i.id, i]));
  const { file: setFile, rows: all } = loadRecallSet();
  const split = process.env.SPLIT ?? "holdout";
  const mode = process.env.MODE;
  const year = new Date().getFullYear();

  const corpus = loadDbInstruments();
  assertAncestorConvention(corpus);
  const inCorpus = new Set(corpus.map((i) => i.id));
  const offerable = new Set(publishableInstruments().map((i) => i.id));
  const fixed = reattributeMissingAnswers(
    all, (id) => inCorpus.has(id), (id) => offerable.has(id));
  const pop = partitionByOfferable(fixed.rows, (id) => offerable.has(id));
  assertGradablePopulation(pop, (id) => inCorpus.has(id), fixed.reattributed.length, setFile);

  const set = pop.graded.filter((r) => (split === "all" || r.split === split)
                             && (!mode || r.mode === mode)
                             && (!process.env.DESCRIBED || isDescribed(r)));
  if (!set.length) throw new Error(`no rows match split=${split} mode=${mode ?? "any"}`);
  const N = Math.min(Number(process.env.N ?? 300), set.length);
  const seed = Number(process.env.SEED ?? DEFAULT_SEED);
  const sample = sampleRecall(set, N, seed);
  const answerMode = (process.env.ANSWERS ?? "off") as AnswerMode;

  const names = [RANDOM, ...Object.keys(SIGNALS), SHIPPED_SCORE, REGIME_PERMUTED,
    "SHIPPED (the product's own five)"];
  const overall = new Map(names.map((k) => [k, acc()]));
  const byPop = new Map<string, Map<string, Acc>>();
  const poolSizes: number[] = [];
  let inPool = 0;
  // Per-pair feature rows, for the blend. Written only when asked, so the
  // measurement above never depends on a file existing.
  const features: {
    pop: string; pool: number; won: number; x: number[][];
    /** Did the PRODUCT put the won fund in its five, for this same pair?
     *  Carried per pair so the blend can be compared with the shipped ranker
     *  PAIRWISE. Two marginal half-widths beside each other answer "could these
     *  two populations differ"; the question here is whether the SAME founders
     *  do better, and only a paired count can answer it. Every arm in this file
     *  shares a draw precisely so that comparison is available, and until now
     *  the dump threw away the one column that needed it. */
    shipped: 0 | 1;
    /** The regime the answer belongs to, for the concentration rule: a gain
     *  that is seven leaves in one regime is not a ranking result. */
    regime: string;
  }[] = [];

  // ── WHICH RANKER THESE NUMBERS ARE ABOUT ──────────────────────────────────
  // Every arm below is scored over the pool `computeVerdict` built, and the
  // `semantic` arm plus `shipped pool score` read the embedding index directly.
  // `semanticFundMatch` returns an EMPTY MAP on a 3s connect or statement
  // timeout, at which point the pool score and every `rankerUsed` call site
  // inside the verdict drop to the lexical index — silently, and the run still
  // prints one number.
  //
  // That is not hypothetical here. The four `signal_remeasure_wsBU_*` artifacts
  // this file is being re-run to replace were all produced BEFORE
  // `rankerTallyLine` existed (wsCP audit, 2026-08-09), in the window where
  // `check_recall_floor` returned 87% and then 96% on identical inputs because
  // a loaded machine had averaged the two rankers. So the conclusion those
  // artifacts carry — "nothing beats the shipped ranker" — was measured on a
  // ranker nobody can now name.
  //
  // The tally is reset here rather than at import so hydration's own queries
  // cannot count, and printed beside the corpus banner. A run that does not
  // print `all N request(s) on EMBEDDING` is not evidence.
  resetRankerTally();
  resetGateHydration();
  for (const t of sample) {
    resetGateHydration();
    const a = answersFor(t, answerMode);
    const eligibilityAnswers = {
      entityCountries: [t.country], sector: t.sector ?? "other", activities: ["none"],
      borrowerModel: "operating", ticketBand: a.ticketBand, consortium: "yes",
      useOfFunds: ["industrial_research", "experimental_development"],
      region: a.region,
    };
    const v = await computeVerdict("TestCo", t.country, eligibilityAnswers as never, {
      targetMarkets: [t.country], capitalSought: a.capitalSought,
      description: t.description || t.selfDescription || undefined,
    } as never);
    const poolIds: string[] = v.candidateInstrumentIds ?? [];
    const top5 = (v.instrumentTable ?? []).slice(0, TOP)
      .map((r: { instrumentId?: string }) => r.instrumentId).filter(Boolean) as string[];

    const popKey = t.traced ? `traced:${t.traced}` : "original join";
    if (!byPop.has(popKey)) byPop.set(popKey, new Map(names.map((k) => [k, acc()])));
    const here = byPop.get(popKey)!;
    const record = (k: string, p: number) => { add(overall.get(k)!, p); add(here.get(k)!, p); };

    // SHIPPED is graded over the SAME population as every signal, including the
    // pairs whose answer never reached the pool. A signal cannot rank a fund
    // that was filtered out either, so this is the honest comparison.
    record("SHIPPED (the product's own five)", top5.includes(t.instrument) ? 1 : 0);

    const pool = poolIds.map((id) => ({ id, inst: byId.get(id) }))
      .filter((p): p is { id: string; inst: NonNullable<typeof p.inst> } => Boolean(p.inst));
    poolSizes.push(pool.length);
    if (!poolIds.includes(t.instrument) || !pool.length) {
      // The won fund never reached the pool: no ordering of the pool can find
      // it, so every signal scores 0 rather than being excused the case.
      for (const k of [RANDOM, ...Object.keys(SIGNALS), SHIPPED_SCORE, REGIME_PERMUTED]) {
        record(k, 0);
      }
      // Recorded with `won: -1` rather than dropped, so the blend scores the
      // SAME denominator this table does. A fitter handed only the pairs whose
      // answer survived selection would report a number conditional on pool
      // reach while calling it EXACT@5.
      if (process.env.FEATURES_OUT) {
        features.push({
          pop: popKey, pool: pool.length, won: -1, x: [],
          // The won fund never reached the pool, so it cannot be in the five
          // either -- but it is read off the table rather than assumed.
          shipped: top5.includes(t.instrument) ? 1 : 0,
          regime: String(byId.get(t.instrument)?.parentId ?? t.instrument),
        });
      }
      continue;
    }
    inPool++;

    const semantic = await semanticFundMatch(t.description || t.selfDescription || undefined);
    const ranked = peerPrior(t.country, t.sector);
    const ctx: SignalCtx = {
      pool,
      founderSector: t.sector,
      founderCountries: new Set([toIso2(t.country)].filter(Boolean).map((c) => c.toUpperCase())),
      ticketBand: a.ticketBand,
      theme: semantic,
      eligibility: assessAll(poolIds, eligibilityAnswers as never) as never,
      peerRank: new Map(ranked.map((id, i) => [id, i])),
      year,
    };

    record(RANDOM, expectedHitAt5(pool.map(() => 0), 0));
    const featureRow: number[][] = [];
    for (const [label, fn] of Object.entries(SIGNALS)) {
      const raw = pool.map((p) => fn(p.inst, ctx));
      // A signal with no opinion about a candidate takes the pool's MEDIAN of
      // the candidates it does have an opinion about — the rank-preserving
      // stand-in `sectorFitScorer` establishes. A constant would either bury or
      // promote every blind row, and both are judgements the signal has not
      // earned.
      const known = raw.filter((x): x is number => x !== null).sort((x, y) => x - y);
      const neutral = known.length
        ? (known.length % 2 ? known[known.length >> 1]
          : (known[(known.length >> 1) - 1] + known[known.length >> 1]) / 2)
        : 0;
      const vals = raw.map((x) => x ?? neutral);
      record(label, expectedHitAt5(vals, vals[pool.findIndex((p) => p.id === t.instrument)]));
      featureRow.push(vals);
    }
    // ── the two composite arms ────────────────────────────────────────────
    // The production score, over the same pool. `sectorFitScorer` is not used
    // here: the pool spans channels and the neutral it solves is per-channel,
    // so the pool median above is the honest stand-in and it is the same one
    // every other arm gets.
    const sectorNeutralPool = (() => {
      const known = pool.map((p) => sectorFit(p.inst.sectorMix, t.sector))
        .filter((x): x is number => x !== null).sort((x, y) => x - y);
      return known.length ? known[known.length >> 1] : 0.5;
    })();
    const shipped = pool.map((p) =>
      THEME_WEIGHT * (semantic.get(p.id) ?? 0)
      + (1 - THEME_WEIGHT) * (sectorFit(p.inst.sectorMix, t.sector) ?? sectorNeutralPool));
    const wonIdx = pool.findIndex((p) => p.id === t.instrument);
    record(SHIPPED_SCORE, expectedHitAt5(shipped, shipped[wonIdx]));

    // Rank-preserving within-regime permutation on the raw sector count. The
    // regime keeps its positions; only which sibling holds them changes.
    const order = pool.map((_p, i) => i).sort((x, y) => shipped[y] - shipped[x]);
    const regimeOf = (i: number) => pool[i].inst.parentId ?? pool[i].id;
    const slots = new Map<string, number[]>();
    for (let posn = 0; posn < order.length; posn++) {
      const r = regimeOf(order[posn]);
      (slots.get(r) ?? slots.set(r, []).get(r)!).push(posn);
    }
    const permutedRank = new Array(pool.length).fill(0);
    const sectorCount = (i: number) =>
      t.sector && pool[i].inst.sectorMix ? (pool[i].inst.sectorMix![t.sector] ?? 0) : -1;
    for (const [r, positions] of slots) {
      const members = order.filter((i) => regimeOf(i) === r)
        .sort((x, y) => sectorCount(y) - sectorCount(x));
      members.forEach((i, k) => { permutedRank[i] = -positions[k]; });
    }
    record(REGIME_PERMUTED, expectedHitAt5(permutedRank, permutedRank[wonIdx]));

    if (process.env.FEATURES_OUT) {
      features.push({
        pop: popKey, pool: pool.length,
        shipped: top5.includes(t.instrument) ? 1 : 0,
        regime: String(byId.get(t.instrument)?.parentId ?? t.instrument),
        won: pool.findIndex((p) => p.id === t.instrument),
        // Transposed to candidate-major, which is what a fitter wants.
        x: pool.map((_p, ci) => featureRow.map((col) => col[ci])),
      });
    }
  }

  const prov = corpusProvenance();
  const attestation = rankerTallyLine();
  console.log(`corpus=${prov.source} instruments=${prov.instruments} at ${prov.hydratedAt}`);
  console.log(attestation);
  console.log(`set=${setFile} split=${split}${mode ? ` mode=${mode}` : ""} seed=${seed}` +
              `${process.env.DESCRIBED ? " described-only (leak-free descriptions)" : ""}` +
              `${answerMode !== "off" ? ` answers=${answerMode}` : ""}  replayed ${sample.length}`);
  poolSizes.sort((x, y) => x - y);
  console.log(`  pool: median ${poolSizes[poolSizes.length >> 1]} candidates, ` +
              `won fund in pool ${inPool}/${sample.length} ` +
              `(${(100 * inPool / sample.length).toFixed(0)}%)`);
  console.log("  EXACT@5 per signal, ties resolved by expectation. A figure inside " +
              "its own half-width\n  of the random baseline is not a signal.");

  const popKeys = [...byPop.keys()].sort();
  const head = "  " + "signal".padEnd(40) + "overall".padStart(16) +
    popKeys.map((k) => k.replace("traced:", "").slice(0, 17).padStart(19)).join("");
  console.log(head);
  console.log("  " + "-".repeat(head.length - 2));
  const cell = (a: Acc, w: number) =>
    (a.n ? `${(100 * rate(a)).toFixed(1)} +/-${halfWidthOf(a).toFixed(1)}` : "-").padStart(w);
  const rows = names.map((k) => ({ k, r: rate(overall.get(k)!) }));
  // Ordered by measured strength, baseline pinned first so every row below it
  // is read against it.
  const ordered = [RANDOM, ...rows.filter((r) => r.k !== RANDOM)
    .sort((x, y) => y.r - x.r).map((r) => r.k)];
  for (const k of ordered) {
    console.log("  " + k.padEnd(40) + cell(overall.get(k)!, 16) +
      popKeys.map((p) => cell(byPop.get(p)!.get(k)!, 19)).join(""));
  }
  const base = overall.get(RANDOM)!;
  console.log(`\n  n per population: ` +
    popKeys.map((p) => `${p} ${byPop.get(p)!.get(RANDOM)!.n}`).join("   "));
  console.log(`  random baseline ${(100 * rate(base)).toFixed(1)}% +/-${halfWidthOf(base).toFixed(1)}` +
    ` — computed on THESE pools, not remembered from another population.`);

  if (process.env.FEATURES_OUT) {
    writeFileSync(process.env.FEATURES_OUT, JSON.stringify({
      set: setFile, split, seed, n: sample.length,
      // The attestation travels WITH the features, because the blend is fitted
      // offline hours later and its input is the only place the ranker can
      // still be named. A dump is evidence about whichever ranker filled it.
      ranker: attestation,
      signals: Object.keys(SIGNALS), rows: features,
    }));
    console.log(`  features -> ${process.env.FEATURES_OUT} (${features.length} pairs)`);
  }
}

if (process.env.NODE_ENV !== "test") main();
