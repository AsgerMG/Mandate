// wsCU — the sixth row, and the memo-versus-screen gap, on a founder who exists.
//
// ── Why this is a re-measurement and not a new question ────────────────────
// wsCR measured MEMO@5->@6 at +2.8 tune / +1.2 holdout and, far more
// importantly, MEMO@6 15.6% against SCREEN@6 30.0% — the memo's table half as
// good as the shortlist it follows. Both numbers were produced by a harness
// that replayed every founder as `"TestCo"`, which matches nothing, so
// `usedInField` — TIER 1 of the row sort, compared ABOVE the entire score —
// was false on every row of both orderings, and `capitalSought` was pinned to
// a filter that removed every tax-credit and equity instrument before ranking.
// wsCR said so in its own header and asked for the re-run. This is it.
//
// ── The two orderings, one replay ─────────────────────────────────────────
//   SCREEN@k   `computeVerdict().instrumentTable` — the instant shortlist
//   MEMO@k     `orderMemoCandidates().ordered` — the list the cut cuts
//
// They are not the same list: the memo builds a wider pool (VERDICT_POOL 18,
// not DISPLAY_CAP 6), re-ranks it on qualification and ease, drops
// conclusively blocked rows, collapses duplicate display names, and only then
// cuts. `orderMemoCandidates` is production's own function and is CALLED, not
// reimplemented — a diagnostic that rebuilds the sort it is grading is the
// defect class this repo has paid for repeatedly.
//
// ── The one place this replay must NOT copy production ────────────────────
// `runIntelligence` builds `fieldChannels` from the founder's own traced
// awards unioned with their peers'. For a founder that is correct. For a
// harness replaying a real company against the fund it actually won, the
// founder's own history CONTAINS THE ANSWER, and it would be handed to tier 1
// of the sort — the most valuable place in the ordering to be given one. So
// the self record's channels are WITHHELD here and the peers' are kept, which
// is exactly what `computeVerdict(..., { ownHistory: "withheld" })` does on
// the screen side and exactly what production does for a founder who is not in
// the corpus. Both orderings therefore see the same peer-derived tier 1, and
// neither sees the answer. See scripts/founderIntake.ts.
//
// `records` is empty because the web-search comparables cannot be replayed
// offline; production reaches them only through `discoverAndResearch`, which
// is a model call. Their contribution is a further union INTO `fieldChannels`
// and a comparable count, so this replay is a LOWER bound on tier 1, not an
// upper one.
//
// ── What it cannot see, stated rather than buried ─────────────────────────
// The writer reorders its candidates and may decline to cover one. MEMO@k is
// the CODE-SIDE bound: the won leaf's rank in the order handed to the writer.
// It is the right quantity for "does the cut throw the answer away" and it is
// NOT a claim about the finished brief.
//
// FREE: one Voyage embed and one Postgres read per pair. No model calls.
//
//   SPLIT=tune    N=250 npx tsx scripts/_wscu_memo.ts
//   SPLIT=holdout N=250 npx tsx scripts/_wscu_memo.ts   # ONCE
import { writeFileSync } from "fs";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("wscu_memo", ["DATABASE_URL", "VOYAGE_KEY"]);

import { BRIEF_LIMITS } from "../lib/intelligence/briefChecks";
import {
  corpusProvenance, findPeersBySubsector, hydrateDbInstruments, hydrateGatesFor,
  isGenericSubsector, loadDbInstruments, matchCompany, publishableInstruments,
  requireLiveCorpus, resetGateHydration,
} from "../lib/intelligence/corpus";
import { evaluateEligibility } from "../lib/intelligence/eligibility";
import { ExclusionLog } from "../lib/intelligence/exclusions";
import {
  agentSelectMemoPool, agentSelectTallyLine, resetAgentSelectTally,
} from "../lib/intelligence/agentSelect";
import { accessiblePool, orderMemoCandidates, WRITER_CANDIDATE_CAP } from "../lib/intelligence/memoCandidates";
import { computeVerdict } from "../lib/intelligence/pipeline";
import { rankerTallyLine, resetRankerTally, semanticFundMatch } from "../lib/intelligence/semantic";
import {
  applyProfileSignal, buildInstrumentTableHydrated, DISPLAY_CAP, founderCountryList,
  tableInputFromAnswers, VERDICT_POOL,
} from "../lib/intelligence/shortlist";
import {
  founderIntake, founderPolicyFromEnv, IntakeTally, type FounderPolicy,
} from "./founderIntake";
import { DEFAULT_SEED, halfWidth, sampleRecall } from "./recallSample";
import {
  assertAncestorConvention, assertGradablePopulation, isDescribed, loadRecallSet,
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
  /** Did tier 1 fire for the won leaf's channel at all — i.e. is this a pair
   *  on which the wsCQ change could have changed anything? Reported beside the
   *  gain, because a re-measurement that moves nothing on the rows where the
   *  new signal is dark has established nothing about the signal. */
  tier1Live: boolean;
}

/** Share and half-width, printed the way every other harness here prints it. */
function pct(hits: number, n: number): string {
  return `${hits}/${n} (${(100 * hits / n).toFixed(1)}% +/-${halfWidth(hits, n).toFixed(1)})`;
}

async function main() {
  // ── CORPUS=json: rank a LOCALLY MODIFIED corpus with the production ranker ─
  //
  // Default is unchanged: hydrate from Postgres, which is the source of truth.
  //
  // wsCZ needed to measure a corpus CORRECTION before asking for permission to
  // write it, and Railway may not be written to unilaterally. `SNAPSHOT_FILE`
  // already lets a harness name a different snapshot, but the snapshot is only
  // read when Postgres is absent -- and deleting DATABASE_URL for the whole run
  // also strips the pgvector ranker, which then falls back to LEXICAL and makes
  // the number incomparable with every other figure in this file.
  //
  // So the URL is removed for HYDRATION ONLY and restored immediately, exactly
  // as diagnose_corpus_variance.ts does it. The two arms then differ in the
  // corpus and in nothing else: same embeddings, same pgvector reads, same
  // `ranker: all N request(s) on EMBEDDING`.
  const liveUrl = process.env.DATABASE_URL;
  if (process.env.CORPUS === "json") delete process.env.DATABASE_URL;
  await hydrateDbInstruments();
  if (liveUrl) process.env.DATABASE_URL = liveUrl;
  requireLiveCorpus("wscu_memo");
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

  const policy: FounderPolicy = { ...founderPolicyFromEnv(), answers: answerMode };
  const tally = new IntakeTally();
  resetRankerTally();
  resetAgentSelectTally();
  resetGateHydration();
  const out: Out[] = [];
  for (const t of sample) {
    resetGateHydration();
    const f = founderIntake(t, policy);
    tally.add(f);

    // ── the instant screen, through production's own entry point ───────────
    const v = await computeVerdict(f.company, f.country, f.eligibility as never, {
      ...f.opts, log: new ExclusionLog(),
    } as never);
    const screenIds = (v.instrumentTable ?? [])
      .map((r: { instrumentId?: string }) => r.instrumentId).filter(Boolean) as string[];
    const screenIdx = screenIds.indexOf(t.instrument);

    // ── the memo's own pool and order ─────────────────────────────────────
    // Peers resolved exactly as `runIntelligence` resolves them for a founder
    // whose web comparables came back empty, and the self record's channels
    // withheld for the reason in the header.
    const selfRecord = matchCompany(f.company, f.country);
    const targetSub =
      selfRecord.matched && !isGenericSubsector(selfRecord.subsector) ? selfRecord.subsector : "";
    const dbPeers = targetSub
      ? findPeersBySubsector(targetSub, { country: f.country, limit: 4, exclude: [f.company] })
      : [];
    const fieldChannels = new Set<string>(dbPeers.flatMap((r) => r.channels));

    const semantic = await semanticFundMatch(f.opts.description ?? "");
    const log = new ExclusionLog();
    const hydrated = await buildInstrumentTableHydrated({
      fieldChannels,
      founderCountries: founderCountryList(
        f.country, f.opts.targetMarkets, f.eligibility.entityCountries),
      capitalSought: f.opts.capitalSought,
      description: f.opts.description,
      semantic,
      ...tableInputFromAnswers(f.eligibility),
      log,
    } as never);
    // ── The pool cut, on the arm under test ────────────────────────────────
    // `POOL=legacy` reproduces the cut as it stood before wsCY: slice first,
    // drop the conclusively blocked afterwards, so a founder whose top rows all
    // disqualify them spends the whole pool on rows that are then deleted.
    // Default is what ships: drop first, then cut, so the pool holds
    // VERDICT_POOL rows that could actually be published.
    //
    // Both arms are one replay over one pool, which is the only way the two
    // numbers are comparable.
    // ── The selection seat, through PRODUCTION'S OWN function (wsDL) ───────
    // `agentSelectMemoPool` is the same call `runIntelligence` makes, in the
    // same place: after the cut, on a fixed set of rows. Not reimplemented —
    // a diagnostic that rebuilds the seam it is grading is how wsDD came to
    // measure an arm that could not reach the product. With AGENT_SELECT unset
    // this returns its argument BY REFERENCE, so the default run of this file
    // is byte-identical to the one before the seam existed.
    const instrumentTable = await agentSelectMemoPool(
      applyProfileSignal(
        (process.env.POOL === "legacy"
          ? hydrated
          : accessiblePool(hydrated, f.eligibility as never)
        ).slice(0, VERDICT_POOL), undefined, undefined),
      { country: f.country, description: f.opts.description, eligibility: f.eligibility as never });
    const poolIds = instrumentTable
      .map((r) => r.instrumentId).filter((id): id is string => Boolean(id));
    await hydrateGatesFor(poolIds);
    const eligibilityScreen = evaluateEligibility(f.eligibility as never, poolIds.slice(0, DISPLAY_CAP));
    const { ordered } = orderMemoCandidates({
      instrumentTable,
      req: {
        company: f.company, country: f.country, eligibility: f.eligibility, ...f.opts,
      } as never,
      records: [], dbPeers, eligibilityScreen, semanticScores: semantic, log,
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
      // Read off the row the ranker built rather than recomputed from a
      // channel set: `usedInField` IS the flag tier 1 compares, so this is
      // the signal itself and not a proxy for it.
      tier1Live: Boolean(instrumentTable.find(
        (r) => r.instrumentId === t.instrument)?.usedInField),
    });
  }

  const prov = corpusProvenance();
  console.log(`corpus=${prov.source} instruments=${prov.instruments} at ${prov.hydratedAt}`);
  console.log(rankerTallyLine());
  // The arm attestation, on the same screen as the number, for the same reason
  // `ranker:` is: a run whose every model call timed out and fell back prints
  // the CONTROL's figure under the treatment's banner and no reader could tell.
  // Reports "no calls made" under the default arm.
  console.log(agentSelectTallyLine());
  console.log(`set=${setFile} split=${split} replayed ${out.length}`);
  // The intake on the same screen as the number, for the same reason the
  // ranker line is: this whole file exists because wsCR's figures could not
  // say who they were about.
  for (const line of tally.lines(policy)) console.log(line);
  console.log(`published cap under test: BRIEF_LIMITS.institutionsMax=${BRIEF_LIMITS.institutionsMax}, ` +
    `writer cap ${WRITER_CANDIDATE_CAP}`);
  const tier1 = out.filter((r) => r.tier1Live).length;
  console.log(`  tier 1 (usedInField) live for the won leaf's own channel on ` +
    `${pct(tier1, out.length)} of pairs — peers only, never this founder`);

  const at = (k: number, pick: (r: Out) => number | null) =>
    out.filter((r) => { const x = pick(r); return x !== null && x <= k; }).length;

  console.log(`\n── THE INSTANT SCREEN ──`);
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
  console.log(`  ██ MEMO@6 ${(100 * at(6, (r) => r.memoRank) / out.length).toFixed(1)}% against ` +
    `SCREEN@6 ${(100 * at(6, (r) => r.screenRank) / out.length).toFixed(1)}% — ` +
    `the memo keeps ${(100 * at(6, (r) => r.memoRank) / Math.max(1, at(6, (r) => r.screenRank))).toFixed(0)}% ` +
    `of what the screen got right`);

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
  // Measured, NOT repaired: workstream CT owns everything between the
  // shortlist and the published memo, including these two deletions.
  const inPool = out.filter((r) => r.poolRank !== null).length;
  const inPool6 = out.filter((r) => r.poolRank !== null && r.poolRank <= 6).length;
  const dropped = out.filter((r) => r.poolRank !== null && r.memoRank === null);
  console.log(`\n── WHERE THE MEMO LOSES A LEAF THE POOL HELD (wsCT owns the fix) ──`);
  console.log(`  won leaf inside the memo pool (top ${VERDICT_POOL}):        ${pct(inPool, out.length)}`);
  console.log(`  ...and inside its first six BEFORE the re-sort: ${pct(inPool6, out.length)}`);
  console.log(`  ...and inside the memo order after re-sort/drop: ${pct(at(6, (r) => r.memoRank), out.length)}`);
  const byDrop = new Map<string, number>();
  for (const r of dropped) {
    const k = r.droppedBy ?? "(still ranked, below the list)";
    byDrop.set(k, (byDrop.get(k) ?? 0) + 1);
  }
  console.log(`  in the pool but absent from the memo order: ${dropped.length}`);
  for (const [k, n] of [...byDrop].sort((x, y) => y[1] - x[1])) console.log(`    ${k.padEnd(36)}${String(n).padStart(4)}`);
  const demoted = out.filter((r) => r.poolRank !== null && r.poolRank <= 6
    && (r.memoRank === null || r.memoRank > 6)).length;
  const promoted = out.filter((r) => r.memoRank !== null && r.memoRank <= 6
    && (r.poolRank === null || r.poolRank > 6)).length;
  console.log(`  the fit re-sort moves the won leaf OUT of the top six ${demoted} times, INTO it ${promoted} times`);

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
