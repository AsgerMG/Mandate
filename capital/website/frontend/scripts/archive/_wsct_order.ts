// wsCT — should the memo re-sort the shortlist's order on the fit score at all?
//
// ██ ARCHIVED (wsGB, 2026-08-12). THE ARMS IT SWEPT NO LONGER EXIST. ██
//
// ── What it proved, which is why it is kept ───────────────────────────────
// All three orderings, ONE replay, one pool, tune n=250 seed 20260806,
// `ranker: all 245 request(s) on EMBEDDING`:
//
//   MEMO@6        fit 24.0%      pool 28.8%      verdict 27.6%
//   off-country rows in the published six    0          0          0
//   published rows that are `open`        100%      95.4%       100%
//
// It closed the `fit` re-sort: 24.0% against 27.6% for keeping qualification
// first, agreeing with wsCR's separate finding that the re-sort moved the won
// leaf OUT of the published six 49 times for 13 in. `verdict` shipped on the
// strength of the third row — it published no row carrying an obstacle where
// `pool` published 4.6% — and paid 1.2 points for it.
//
// ── Why it is archived, and what changed under it ────────────────────────
// `AGENT_SELECT` now defaults to `adviser`: the model ranks the subset, and the
// deterministic memo sort those three arms were arms OF is deleted. So is the
// nine-component composite the `fit` arm sorted on. There is no
// `SHIPPED_MEMO_ORDER`, no `MemoOrderControl` and no `orderControl`.
//
// ── What it can and cannot still do ──────────────────────────────────────
// `orderMemoCandidates` now carries its input order through, so an arm can be
// applied to the pool BEFORE the call and the result is what this script used
// to get from `orderControl` — same collapse, same cap, same projection. Two of
// the three arms are reproduced that way below, from `VERDICT_RANK`, which
// survives:
//
//   pool      identity. The subset builder's own ranking, untouched, and the
//             order the memo publishes today wherever the model declines a seat.
//   verdict   the band sort that shipped until wsGB.
//
// The `fit` arm is NOT reproduced and cannot be: `scoreFitControl`, FIT_WEIGHTS
// and `structureFit` were deleted with the sort they fed. Its number is in the
// table above and in fit.ts, and nobody should rebuild a scorer to re-measure a
// route this file already closed.
//
// FREE: one Voyage embed and one Postgres read per pair. No model calls.
//
//   SPLIT=tune    N=250 npx tsx scripts/archive/_wsct_order.ts
import { writeFileSync } from "fs";

import { loadEnvLocal, requireCredentials } from "../loadEnv";

loadEnvLocal();
requireCredentials("wsct_order", ["DATABASE_URL", "VOYAGE_KEY"]);

import {
  corpusProvenance, hydrateDbInstruments, hydrateGatesFor, loadDbInstruments,
  publishableInstruments, requireLiveCorpus, resetGateHydration, toIso2,
} from "../../lib/intelligence/corpus";
import { evaluateEligibility } from "../../lib/intelligence/eligibility";
import { ExclusionLog } from "../../lib/intelligence/exclusions";
import {
  orderMemoCandidates, WRITER_CANDIDATE_CAP,
} from "../../lib/intelligence/memoCandidates";
import { assessAll, VERDICT_RANK } from "../../lib/intelligence/verdict";
import type { InstrumentRow } from "../../lib/intelligence/types";
import { BRIEF_LIMITS } from "../../lib/intelligence/briefChecks";
import { rankerTallyLine, resetRankerTally, semanticFundMatch } from "../../lib/intelligence/semantic";
import {
  applyProfileSignal, buildInstrumentTableHydrated, DISPLAY_CAP, founderCountryList,
  instById, tableInputFromAnswers, VERDICT_POOL,
} from "../../lib/intelligence/shortlist";
import { DEFAULT_SEED, halfWidth, sampleRecall } from "../recallSample";
import {
  answersFor, assertAncestorConvention, assertGradablePopulation, isDescribed, loadRecallSet,
  partitionByOfferable, reattributeMissingAnswers, type AnswerMode,
} from "../recallSet";

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);
/** The two arms that still have a subject. `fit` is gone with its scorer; see
 *  the header. */
type MemoOrderControl = "pool" | "verdict";
const ARMS: MemoOrderControl[] = ["pool", "verdict"];

/** The removed sort, reproduced here rather than in production.
 *
 *  It is applied to the POOL, ahead of `orderMemoCandidates`, which is exactly
 *  equivalent to the `orderControl` argument this script used to pass: that
 *  argument chose a sort that ran before the display-name collapse and the
 *  writer cap, and those two still run, in that order, on whatever they are
 *  handed. Stable, so `pool` order remains the tie-break inside a band. */
function sortByArm(
  rows: InstrumentRow[], arm: MemoOrderControl, eligibility: unknown,
): InstrumentRow[] {
  if (arm === "pool") return rows;
  const ids = rows.map((r) => r.instrumentId).filter((id): id is string => Boolean(id));
  const assessed = assessAll(ids, eligibility as never);
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => {
      const va = VERDICT_RANK[
        (a.row.instrumentId ? assessed.get(a.row.instrumentId)?.status : undefined) ?? "unknown"];
      const vb = VERDICT_RANK[
        (b.row.instrumentId ? assessed.get(b.row.instrumentId)?.status : undefined) ?? "unknown"];
      return va !== vb ? va - vb : a.i - b.i;
    })
    .map((x) => x.row);
}

interface Row {
  want: string;
  wantRegime: string;
  country: string;
  poolRank: number | null;
  rank: Record<MemoOrderControl, number | null>;
  /** National schemes in the first six that the founder cannot draw on. */
  offCountryInSix: Record<MemoOrderControl, number>;
  /** What the published six are made of, by encoded verdict. `fit` weights
   *  `eligibilityFit` at 0.24, so dropping the re-sort could publish more rows
   *  carrying an obstacle. That is not fatal — the row states the obstacle,
   *  and FUND-12 says rows are not ranked — but it must not go unreported. */
  verdictMix: Record<MemoOrderControl, Record<string, number>>;
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

    const rank: Row["rank"] = { pool: null, verdict: null };
    const off: Row["offCountryInSix"] = { pool: 0, verdict: 0 };
    const mix: Row["verdictMix"] = { pool: {}, verdict: {} };
    for (const arm of ARMS) {
      // A fresh log per arm: the exclusion log is a record of one run.
      const { ordered } = orderMemoCandidates({
        instrumentTable: sortByArm(instrumentTable, arm, eligibility),
        req: { company: "TestCo", country: t.country, eligibility, ...opts } as never,
        records: [], dbPeers: [], eligibilityScreen,
        log: new ExclusionLog(),
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
    + `NO shipping arm: production's memo order is the model's (AGENT_SELECT)`);

  const at = (arm: MemoOrderControl, k: number) =>
    out.filter((r) => { const x = r.rank[arm]; return x !== null && x <= k; }).length;

  console.log(`\n── MEMO@k, BOTH ORDERS OVER THE SAME POOL ──`);
  console.log(`  k     ${ARMS.map((a) => a.padEnd(21)).join("")}`);
  for (const k of [1, 3, 5, 6, 7]) {
    const mark = k === BRIEF_LIMITS.institutionsMax ? "  <- PUBLISHED" : "";
    console.log(`  ${String(k).padEnd(4)}  `
      + ARMS.map((a) => pct(at(a, k), out.length).padEnd(21)).join("") + mark);
  }
  const K = BRIEF_LIMITS.institutionsMax;
  // Against `pool` rather than against `fit`, which no longer runs. `pool` is
  // also the order production publishes wherever the model declines a seat, so
  // this delta prices what the band sort was buying at the moment it was
  // removed.
  const d = at("verdict", K) - at("pool", K);
  console.log(`\n  MEMO@${K}: verdict - pool = ${d >= 0 ? "+" : ""}`
    + `${(100 * d / out.length).toFixed(1)} pts (${d} pairs)`);
  const movedOut = out.filter((r) => (r.rank.pool ?? 99) <= K && (r.rank.verdict ?? 99) > K).length;
  const movedIn = out.filter((r) => (r.rank.verdict ?? 99) <= K && (r.rank.pool ?? 99) > K).length;
  console.log(`    the band sort moved the won leaf OUT of the first ${K} ${movedOut} times, `
    + `INTO it ${movedIn} times`);

  // ── Regime concentration on the difference, as the standing rule requires ─
  const gainers = out.filter((r) => (r.rank.verdict ?? 99) <= K && (r.rank.pool ?? 99) > K);
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
