// wsCT — should the memo re-sort the shortlist's order on `scoreFit` at all?
//
// ── The question ──────────────────────────────────────────────────────────
// The memo takes the shortlist's ranked pool (VERDICT_POOL 18) and re-sorts
// the whole thing on `scoreFit` before dropping blocked rows and cutting. wsCR
// measured that re-sort moving the won leaf OUT of the top six 49 times for 13
// in. A re-sort that loses four for every one it gains is not a re-sort.
//
// It had never been compared with the alternative, because "keep the pool's
// order" was not an option the code could express. It is now
// (`MemoCandidateInput.order`), so BOTH arms run over ONE pool, one embed per
// pair, and the difference is the ordering and nothing else.
//
// ── What the arms are ─────────────────────────────────────────────────────
//   fit    what ships: `scoreFit`, nine weighted components, thin-evidence
//          penalty, pool position as the tie-break.
//   pool   the shortlist's own ranking, untouched. The one ordering in this
//          product that has ever been measured end to end.
//
// Both arms then run the SAME blocked drop and the SAME display-name dedupe,
// because those are not ordering and are not in question here.
//
// ── The safety check that has to travel with it ───────────────────────────
// `scoreFit` scores an off-country national scheme at proximity 0, so removing
// the re-sort could in principle float one up the table — and a fund the
// founder cannot draw on is the wrongly-shown row this product treats as worse
// than a missing one. So both arms report how many of their first six rows are
// national schemes outside the founder's countries. A gain bought by putting
// an unusable row on the table is not a gain.
//
// FREE: one Voyage embed and one Postgres read per pair. No model calls.
//
//   SPLIT=tune    N=250 npx tsx scripts/_wsct_order.ts
//   SPLIT=holdout N=250 npx tsx scripts/_wsct_order.ts   # ONCE
import { writeFileSync } from "fs";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("wsct_order", ["DATABASE_URL", "VOYAGE_KEY"]);

import {
  corpusProvenance, hydrateDbInstruments, hydrateGatesFor, loadDbInstruments,
  publishableInstruments, requireLiveCorpus, resetGateHydration, toIso2,
} from "../lib/intelligence/corpus";
import { evaluateEligibility } from "../lib/intelligence/eligibility";
import { ExclusionLog } from "../lib/intelligence/exclusions";
import {
  orderMemoCandidates, ORDER_ARM, WRITER_CANDIDATE_CAP, type MemoOrderArm,
} from "../lib/intelligence/memoCandidates";
import { BRIEF_LIMITS } from "../lib/intelligence/briefChecks";
import { rankerTallyLine, resetRankerTally, semanticFundMatch } from "../lib/intelligence/semantic";
import {
  applyProfileSignal, buildInstrumentTableHydrated, DISPLAY_CAP, founderCountryList,
  instById, tableInputFromAnswers, VERDICT_POOL,
} from "../lib/intelligence/shortlist";
import { DEFAULT_SEED, halfWidth, sampleRecall } from "./recallSample";
import {
  answersFor, assertAncestorConvention, assertGradablePopulation, isDescribed, loadRecallSet,
  partitionByOfferable, reattributeMissingAnswers, type AnswerMode,
} from "./recallSet";

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);
const ARMS: MemoOrderArm[] = ["fit", "pool", "verdict"];

interface Row {
  want: string;
  wantRegime: string;
  country: string;
  poolRank: number | null;
  rank: Record<MemoOrderArm, number | null>;
  /** National schemes in the first six that the founder cannot draw on. */
  offCountryInSix: Record<MemoOrderArm, number>;
  /** What the published six are made of, by encoded verdict. `fit` weights
   *  `eligibilityFit` at 0.24, so dropping the re-sort could publish more rows
   *  carrying an obstacle. That is not fatal — the row states the obstacle,
   *  and FUND-12 says rows are not ranked — but it must not go unreported. */
  verdictMix: Record<MemoOrderArm, Record<string, number>>;
}

function pct(hits: number, n: number): string {
  return `${hits}/${n} (${(100 * hits / n).toFixed(1)}% +/-${halfWidth(hits, n).toFixed(1)})`;
}

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("wsct_order");
  const corpus = loadDbInstruments();
  const byId = new Map(corpus.map((i) => [i.id, i]));
  const offerable = new Set(publishableInstruments().map((i) => i.id));

  const { file: setFile, rows: all } = loadRecallSet();
  const split = process.env.SPLIT ?? "tune";
  const answerMode = (process.env.ANSWERS ?? "off") as AnswerMode;
  assertAncestorConvention(corpus);
  const inCorpus = new Set(corpus.map((i) => i.id));
  const fixed = reattributeMissingAnswers(all, (id) => inCorpus.has(id), (id) => offerable.has(id));
  const pop = partitionByOfferable(fixed.rows, (id) => offerable.has(id));
  assertGradablePopulation(pop, (id) => inCorpus.has(id), fixed.reattributed.length, setFile);
  const set = pop.graded.filter((r) => (split === "all" || r.split === split)
    && (!process.env.DESCRIBED || isDescribed(r)));
  if (!set.length) throw new Error(`no rows match split=${split}`);
  const N = Math.min(num(process.env.N, 250), set.length);
  const sample = sampleRecall(set, N, num(process.env.SEED, DEFAULT_SEED));

  resetRankerTally();
  resetGateHydration();
  const out: Row[] = [];
  for (const t of sample) {
    resetGateHydration();
    const a = answersFor(t, answerMode);
    const eligibility = {
      entityCountries: [t.country], sector: t.sector ?? "other", activities: ["none"],
      borrowerModel: "operating", ticketBand: a.ticketBand, consortium: "yes",
      useOfFunds: ["industrial_research", "experimental_development"],
      region: a.region,
    } as never;
    const description = t.description || t.selfDescription || undefined;
    const opts = { targetMarkets: [t.country], capitalSought: a.capitalSought, description };

    const semantic = await semanticFundMatch(description ?? "");
    const log = new ExclusionLog();
    const hydrated = await buildInstrumentTableHydrated({
      fieldChannels: new Set<string>(),
      founderCountries: founderCountryList(t.country, opts.targetMarkets, [t.country]),
      capitalSought: a.capitalSought,
      description,
      semantic,
      ...tableInputFromAnswers(eligibility),
      log,
    } as never);
    const instrumentTable = applyProfileSignal(hydrated.slice(0, VERDICT_POOL), undefined, undefined);
    const poolIds = instrumentTable
      .map((r) => r.instrumentId).filter((id): id is string => Boolean(id));
    await hydrateGatesFor(poolIds);
    const eligibilityScreen = evaluateEligibility(eligibility, poolIds.slice(0, DISPLAY_CAP));

    // The founder's own countries, by the product's own derivation.
    const mine = new Set(founderCountryList(t.country, opts.targetMarkets, [t.country])
      .map((c) => toIso2(c).toUpperCase()).filter(Boolean));
    const offCountry = (id?: string) => {
      const c = (id ? instById().get(id)?.country : "")?.toUpperCase() ?? "";
      return c !== "" && c !== "EU" && !mine.has(c);
    };

    const rank: Row["rank"] = { fit: null, pool: null, verdict: null };
    const off: Row["offCountryInSix"] = { fit: 0, pool: 0, verdict: 0 };
    const mix: Row["verdictMix"] = { fit: {}, pool: {}, verdict: {} };
    for (const arm of ARMS) {
      // A fresh log per arm: the exclusion log is a record of one run.
      const { ordered } = orderMemoCandidates({
        instrumentTable,
        req: { company: "TestCo", country: t.country, eligibility, ...opts } as never,
        records: [], dbPeers: [], eligibilityScreen, semanticScores: semantic,
        log: new ExclusionLog(), order: arm,
      });
      const ids = ordered.map((c) => c.row.instrumentId).filter(Boolean) as string[];
      const idx = ids.indexOf(t.instrument);
      rank[arm] = idx < 0 ? null : idx + 1;
      off[arm] = ids.slice(0, BRIEF_LIMITS.institutionsMax).filter(offCountry).length;
      for (const c of ordered.slice(0, BRIEF_LIMITS.institutionsMax)) {
        const s = c.assessment?.status ?? "unknown";
        mix[arm][s] = (mix[arm][s] ?? 0) + 1;
      }
    }
    const poolIdx = poolIds.indexOf(t.instrument);
    out.push({
      want: t.instrument,
      wantRegime: String(byId.get(t.instrument)?.parentId ?? t.instrument),
      country: t.country,
      poolRank: poolIdx < 0 ? null : poolIdx + 1,
      rank, offCountryInSix: off, verdictMix: mix,
    });
    void log;
  }

  const prov = corpusProvenance();
  console.log(`corpus=${prov.source} instruments=${prov.instruments} at ${prov.hydratedAt}`);
  console.log(rankerTallyLine());
  console.log(`set=${setFile} split=${split} replayed ${out.length}`);
  console.log(`published cap ${BRIEF_LIMITS.institutionsMax}, writer cap ${WRITER_CANDIDATE_CAP}, `
    + `shipping arm ORDER_ARM=${ORDER_ARM}`);

  const at = (arm: MemoOrderArm, k: number) =>
    out.filter((r) => { const x = r.rank[arm]; return x !== null && x <= k; }).length;

  console.log(`\n── MEMO@k, BOTH ORDERS OVER THE SAME POOL ──`);
  console.log(`  k     ${ARMS.map((a) => a.padEnd(21)).join("")}`);
  for (const k of [1, 3, 5, 6, 7]) {
    const mark = k === BRIEF_LIMITS.institutionsMax ? "  <- PUBLISHED" : "";
    console.log(`  ${String(k).padEnd(4)}  `
      + ARMS.map((a) => pct(at(a, k), out.length).padEnd(21)).join("") + mark);
  }
  const K = BRIEF_LIMITS.institutionsMax;
  for (const a of ARMS) {
    if (a === "fit") continue;
    const d = at(a, K) - at("fit", K);
    console.log(`\n  MEMO@${K}: ${a} - fit = ${d >= 0 ? "+" : ""}${(100 * d / out.length).toFixed(1)} pts (${d} pairs)`);
    const movedOut = out.filter((r) => (r.rank[a] ?? 99) <= K && (r.rank.fit ?? 99) > K).length;
    const movedIn = out.filter((r) => (r.rank.fit ?? 99) <= K && (r.rank[a] ?? 99) > K).length;
    console.log(`    the fit re-sort moves the won leaf OUT of the first ${K} ${movedOut} times, `
      + `INTO it ${movedIn} times, against ${a}`);
  }

  // ── Regime concentration on the difference, as the standing rule requires ─
  const gainers = out.filter((r) => (r.rank.verdict ?? 99) <= K && (r.rank.fit ?? 99) > K);
  const byRegime = new Map<string, number>();
  for (const r of gainers) byRegime.set(r.wantRegime, (byRegime.get(r.wantRegime) ?? 0) + 1);
  console.log(`\n── WHERE THE DIFFERENCE LANDS ──`);
  console.log(`  ${gainers.length} pairs across ${byRegime.size} regimes and `
    + `${new Set(gainers.map((r) => r.country)).size} countries`);
  for (const [k, n] of [...byRegime].sort((x, y) => y[1] - x[1]).slice(0, 8)) {
    console.log(`    ${k.padEnd(48)}${String(n).padStart(4)}`);
  }
  if (gainers.length) {
    console.log(`  largest single regime holds ${Math.max(...byRegime.values())} of ${gainers.length}`);
  }

  // ── The safety check: a gain bought with an unusable row is not a gain ────
  console.log(`\n── OFF-COUNTRY ROWS IN THE PUBLISHED ${K} (lower is better) ──`);
  for (const arm of ARMS) {
    const total = out.reduce((s, r) => s + r.offCountryInSix[arm], 0);
    const founders = out.filter((r) => r.offCountryInSix[arm] > 0).length;
    console.log(`  ${arm.padEnd(6)} ${total} row(s) across ${founders}/${out.length} founders`);
  }

  console.log(`\n── WHAT THE PUBLISHED ${K} ARE MADE OF, by encoded verdict ──`);
  for (const arm of ARMS) {
    const m = new Map<string, number>();
    for (const r of out) for (const [k, n] of Object.entries(r.verdictMix[arm])) {
      m.set(k, (m.get(k) ?? 0) + n);
    }
    const tot = [...m.values()].reduce((a, b) => a + b, 0);
    console.log(`  ${arm.padEnd(6)} ` + [...m].sort((x, y) => y[1] - x[1])
      .map(([k, n]) => `${k} ${n} (${(100 * n / tot).toFixed(1)}%)`).join("   "));
  }

  if (process.env.OUT) {
    writeFileSync(process.env.OUT, JSON.stringify(out, null, 1));
    console.log(`\nwrote ${process.env.OUT}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
