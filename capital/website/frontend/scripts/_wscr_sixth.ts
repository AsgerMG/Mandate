// wsCR — what the sixth row is actually worth, on the path the memo takes.
//
// ── Why this is not just a re-run of the existing recall harness ───────────
// wsCM measured EXACT@5 26.8% and EXACT@6 29.6% and reported the difference as
// "+2.8 points, free". Both figures came from `computeVerdict().instrumentTable`
// -- the INSTANT SCREEN. The memo does not use that ordering. It builds a wider
// pool (VERDICT_POOL 18, not DISPLAY_CAP 6), re-ranks it on ease and fit, drops
// conclusively blocked rows, collapses duplicate display names, and only then
// cuts. Raising `BRIEF_LIMITS.institutionsMax` moves the cut on the SECOND
// ordering, so the screen's headroom is evidence about a different list.
//
// So both are measured here, in the same replay, over the same pairs:
//
//   SCREEN@5 / SCREEN@6   reproduces wsCM, and says whether it reproduces
//   MEMO@5  / MEMO@6      the number the change actually buys
//
// The memo order comes from `orderMemoCandidates`, which production calls. It
// is not reimplemented here -- a diagnostic that rebuilds the sort it is
// grading is the defect class this repo has paid for three times in two days.
//
// ── What it cannot see, stated rather than buried ─────────────────────────
// The writer reorders its candidates and may decline to cover one, and there
// is no free way to replay that. MEMO@k is therefore the CODE-SIDE bound: the
// won leaf's rank in the order handed to the writer. It is the right quantity
// for "does the cut throw the answer away", and it is NOT a claim about the
// finished brief. Every founder is replayed as "TestCo" here as everywhere
// else in this repo, so `usedInField`, `records` and `dbPeers` are empty --
// see wsCM section 3a.
//
// FREE: one Voyage embed and one Postgres read per pair. No model calls.
//
//   SPLIT=tune    N=250 npx tsx scripts/_wscr_sixth.ts
//   SPLIT=holdout N=250 npx tsx scripts/_wscr_sixth.ts   # ONCE
import { writeFileSync } from "fs";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("wscr_sixth", ["DATABASE_URL", "VOYAGE_KEY"]);

import {
  corpusProvenance, hydrateDbInstruments, hydrateGatesFor, loadDbInstruments,
  publishableInstruments, requireLiveCorpus, resetGateHydration,
} from "../lib/intelligence/corpus";
import { evaluateEligibility } from "../lib/intelligence/eligibility";
import { ExclusionLog } from "../lib/intelligence/exclusions";
import { orderMemoCandidates, WRITER_CANDIDATE_CAP } from "../lib/intelligence/memoCandidates";
import { BRIEF_LIMITS } from "../lib/intelligence/briefChecks";
import { computeVerdict } from "../lib/intelligence/pipeline";
import { rankerTallyLine, resetRankerTally, semanticFundMatch } from "../lib/intelligence/semantic";
import {
  applyProfileSignal, buildInstrumentTableHydrated, DISPLAY_CAP, founderCountryList,
  tableInputFromAnswers, VERDICT_POOL,
} from "../lib/intelligence/shortlist";
import { DEFAULT_SEED, halfWidth, sampleRecall } from "./recallSample";
import {
  answersFor, assertAncestorConvention, assertGradablePopulation, isDescribed, loadRecallSet,
  partitionByOfferable, reattributeMissingAnswers, type AnswerMode,
} from "./recallSet";

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);

interface Out {
  want: string;
  wantRegime: string;
  country: string;
  /** Rank of the won leaf in the INSTANT SCREEN's table, 1-based, null if absent. */
  screenRank: number | null;
  /** Rank of the won leaf in the MEMO's candidate order, 1-based, null if absent. */
  memoRank: number | null;
  /** How many candidates the memo order actually had. A cut cannot buy a row
   *  that does not exist, and this is what says whether it did. */
  memoDepth: number;
  /** Rank of the won leaf in the memo's POOL, before the blocked drop, the
   *  name dedupe and the fit re-sort. Separates "the order demoted it" from
   *  "the memo removed it". */
  poolRank: number | null;
  /** Which pre-writer rule removed it, where one did. */
  droppedBy: string | null;
}

/** Share and half-width, printed the way every other harness here prints it. */
function pct(hits: number, n: number): string {
  return `${hits}/${n} (${(100 * hits / n).toFixed(1)}% +/-${halfWidth(hits, n).toFixed(1)})`;
}

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("wscr_sixth");
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
  const out: Out[] = [];
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
    const opts = {
      targetMarkets: [t.country], capitalSought: a.capitalSought, description,
    };

    // ── the instant screen, exactly as wsCM measured it ────────────────────
    const v = await computeVerdict("TestCo", t.country, eligibility, {
      ...opts, log: new ExclusionLog(),
    } as never);
    const screenIds = (v.instrumentTable ?? [])
      .map((r: { instrumentId?: string }) => r.instrumentId).filter(Boolean) as string[];
    const screenIdx = screenIds.indexOf(t.instrument);

    // ── the memo's own pool and order, through the production function ────
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
    const { ordered } = orderMemoCandidates({
      instrumentTable,
      req: { company: "TestCo", country: t.country, eligibility, ...opts } as never,
      records: [], dbPeers: [], eligibilityScreen, semanticScores: semantic, log,
    });
    const memoIds = ordered.map((c) => c.row.instrumentId).filter(Boolean) as string[];
    const memoIdx = memoIds.indexOf(t.instrument);
    const poolIdx = poolIds.indexOf(t.instrument);
    const dropEvent = log.all().find((e) => e.subject === t.instrument
      && (e.ruleId === "VER-BLOCKED" || e.ruleId === "SEL-DUPE-NAME"));

    out.push({
      want: t.instrument,
      wantRegime: String(byId.get(t.instrument)?.parentId ?? t.instrument),
      country: t.country,
      screenRank: screenIdx < 0 ? null : screenIdx + 1,
      memoRank: memoIdx < 0 ? null : memoIdx + 1,
      memoDepth: ordered.length,
      poolRank: poolIdx < 0 ? null : poolIdx + 1,
      droppedBy: dropEvent ? dropEvent.ruleId : null,
    });
  }

  const prov = corpusProvenance();
  console.log(`corpus=${prov.source} instruments=${prov.instruments} at ${prov.hydratedAt}`);
  console.log(rankerTallyLine());
  console.log(`set=${setFile} split=${split} replayed ${out.length}`);
  console.log(`published cap under test: BRIEF_LIMITS.institutionsMax=${BRIEF_LIMITS.institutionsMax}, ` +
    `writer cap ${WRITER_CANDIDATE_CAP}`);

  const at = (k: number, pick: (r: Out) => number | null) =>
    out.filter((r) => { const x = pick(r); return x !== null && x <= k; }).length;

  console.log(`\n── THE INSTANT SCREEN (what wsCM measured) ──`);
  for (const k of [5, 6]) console.log(`  SCREEN@${k}  ${pct(at(k, (r) => r.screenRank), out.length)}`);
  const screenGain = at(6, (r) => r.screenRank) - at(5, (r) => r.screenRank);
  console.log(`  gain of the sixth row on the screen: +${(100 * screenGain / out.length).toFixed(1)} pts (${screenGain} pairs)`);

  console.log(`\n── THE MEMO'S CANDIDATE ORDER (what the cut actually cuts) ──`);
  for (const k of [1, 2, 3, 4, 5, 6, 7]) {
    const marker = k === WRITER_CANDIDATE_CAP ? "   <- writer cap" : "";
    console.log(`  MEMO@${k}   ${pct(at(k, (r) => r.memoRank), out.length)}${marker}`);
  }
  const memoGain = at(6, (r) => r.memoRank) - at(5, (r) => r.memoRank);
  console.log(`  gain of the sixth row in the memo: +${(100 * memoGain / out.length).toFixed(1)} pts (${memoGain} pairs)`);

  // A cut cannot publish a row the order does not contain. If the memo order
  // is routinely shorter than six, the cap change is inert for those founders
  // and the gain above is an overstatement of what ships.
  const deep = out.filter((r) => r.memoDepth >= 6).length;
  const depths = out.map((r) => r.memoDepth).sort((x, y) => x - y);
  console.log(`\n  memo order depth: min ${depths[0]} p25 ${depths[Math.floor(depths.length * 0.25)]} ` +
    `median ${depths[Math.floor(depths.length / 2)]} max ${depths[depths.length - 1]}`);
  console.log(`  founders whose memo order even HAS a sixth row: ${deep}/${out.length} ` +
    `(${(100 * deep / out.length).toFixed(1)}%)`);

  // ── Regime concentration on the gain, as the standing rule requires ──────
  const gainers = out.filter((r) => r.memoRank === 6);
  const byRegime = new Map<string, number>();
  for (const r of gainers) byRegime.set(r.wantRegime, (byRegime.get(r.wantRegime) ?? 0) + 1);
  console.log(`\n── WHERE THE GAIN LANDS (memo rank exactly 6) ──`);
  console.log(`  ${gainers.length} pairs across ${byRegime.size} distinct regimes ` +
    `and ${new Set(gainers.map((r) => r.country)).size} countries`);
  for (const [k, n] of [...byRegime].sort((x, y) => y[1] - x[1]).slice(0, 8)) {
    console.log(`    ${k.padEnd(48)}${String(n).padStart(4)}`);
  }
  if (gainers.length) {
    const top = Math.max(...byRegime.values());
    console.log(`  largest single regime holds ${top} of ${gainers.length} ` +
      `(${(100 * top / gainers.length).toFixed(0)}%)`);
  }

  // ── The pool is shared; the ORDER is not. Where the memo loses it ───────
  // The screen and the memo draw from ONE ranked pool: the screen shows its
  // first six, the memo re-sorts its first eighteen on `scoreFit` and cuts.
  // So a won leaf the screen shows and the memo does not was either DEMOTED by
  // that re-sort or REMOVED before it.
  const inPool = out.filter((r) => r.poolRank !== null).length;
  const inPool6 = out.filter((r) => r.poolRank !== null && r.poolRank <= 6).length;
  const dropped = out.filter((r) => r.poolRank !== null && r.memoRank === null);
  console.log(`\n── WHERE THE MEMO LOSES A LEAF THE POOL HELD ──`);
  console.log(`  won leaf inside the memo pool (top ${VERDICT_POOL}):        ${pct(inPool, out.length)}`);
  console.log(`  ...and inside its first six BEFORE the re-sort: ${pct(inPool6, out.length)}`);
  console.log(`  ...and inside the memo order after re-sort/drop: ${pct(at(6, (r) => r.memoRank), out.length)}`);
  const byDrop = new Map<string, number>();
  for (const r of dropped) byDrop.set(r.droppedBy ?? "(still ranked, below the list)", (byDrop.get(r.droppedBy ?? "(still ranked, below the list)") ?? 0) + 1);
  console.log(`  in the pool but absent from the memo order: ${dropped.length}`);
  for (const [k, n] of [...byDrop].sort((x, y) => y[1] - x[1])) console.log(`    ${k.padEnd(36)}${String(n).padStart(4)}`);
  const demoted = out.filter((r) => r.poolRank !== null && r.poolRank <= 6
    && (r.memoRank === null || r.memoRank > 6)).length;
  const promoted = out.filter((r) => r.memoRank !== null && r.memoRank <= 6
    && (r.poolRank === null || r.poolRank > 6)).length;
  console.log(`  the fit re-sort moves the won leaf OUT of the top six ${demoted} times, INTO it ${promoted} times`);

  // The two orderings are not the same list, and the size of that difference
  // is the reason the screen's headroom could not be inherited.
  const bothIn = out.filter((r) => r.screenRank !== null && r.memoRank !== null).length;
  const sameRank = out.filter((r) => r.screenRank !== null && r.screenRank === r.memoRank).length;
  console.log(`\n  screen and memo agree on the won leaf's rank in ${sameRank}/${bothIn} pairs ` +
    `where both contain it`);

  if (process.env.OUT) {
    writeFileSync(process.env.OUT, JSON.stringify(out, null, 1));
    console.log(`\nwrote ${process.env.OUT}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
