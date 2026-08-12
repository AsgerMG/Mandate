// wsDC — where the published-row curve stops paying.
//
// ── The question ───────────────────────────────────────────────────────────
// Publishing a sixth memo row instead of a fifth bought +2.8 tune / +3.2
// holdout and cost nothing: the row was already built, already screened and
// already on the instant screen, and the memo simply threw it away
// (`BRIEF_LIMITS.institutionsMax` 5 -> 6, wsCR/wsCU). Nobody has asked what
// row seven or eight buys. This file asks, ONCE, over one replay.
//
// ── Why this is one replay and not one run per k ───────────────────────────
// A cut is a `slice`. Nothing upstream of it depends on k, so replaying the
// pipeline once per k would spend N x K embeds to produce the SAME ordering
// K times and would additionally let sampling noise masquerade as curvature.
// The ordering is recorded once, per pair, and every k is read off it. The
// curve is therefore exactly monotone by construction, which is the point: the
// question is not whether more rows can help, it is HOW MUCH each row buys and
// where that stops paying for the length.
//
// ── The four metrics, and what each is a claim about ───────────────────────
// All four are read off the MEMO's candidate order -- the list the published
// cut actually cuts -- because that, not the instant screen, is what a founder
// receives. SCREEN@k is printed beside them for reference only.
//
//   EXACT@k    the leaf the company actually won is in the first k rows
//   MEMO@k     identical to EXACT@k on this path, and printed under both names
//              because the repo's two harnesses use the two names for the same
//              quantity and quoting one against the other is how a comparison
//              goes wrong. Kept as an explicit alias, not a second number.
//   REGIME@k   SOMETHING from the won leaf's programme is in the first k
//   CHANNEL@k  something from the won leaf's source family is in the first k
//
// EXACT@k is the metric to reason about. REGIME@k and CHANNEL@k are far more
// generous -- a founder facing 76 siblings of the right programme has not been
// answered -- and they are here to say whether a marginal row is buying a new
// ANSWER or another sibling of an answer already on the page.
//
// ── The cap this curve runs into, which is not the display cap ─────────────
// `WRITER_CANDIDATE_CAP` is 7. The writer must return a note per candidate and
// a candidate it never mentions cannot be published, so the published count
// can never exceed it and the DIFFERENCE between them is the number of
// candidates the writer may reject before the table goes short. This file
// therefore prints, next to the curve, the headroom each k would leave.
//
// FREE: one Voyage embed and one Postgres read per pair. No model calls.
//
//   SPLIT=tune    N=250 npx tsx scripts/_wsdc_rows.ts
//   SPLIT=holdout N=250 npx tsx scripts/_wsdc_rows.ts   # ONCE
import { writeFileSync } from "fs";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("wsdc_rows", ["DATABASE_URL", "VOYAGE_KEY"]);

import { BRIEF_LIMITS } from "../lib/intelligence/briefChecks";
import {
  corpusProvenance, findPeersBySubsector, hydrateDbInstruments, hydrateGatesFor,
  isGenericSubsector, loadDbInstruments, matchCompany, publishableInstruments,
  requireLiveCorpus, resetGateHydration,
} from "../lib/intelligence/corpus";
import { evaluateEligibility } from "../lib/intelligence/eligibility";
import { ExclusionLog } from "../lib/intelligence/exclusions";
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

/** How far up the curve to read. Deliberately beyond every cap in the
 *  pipeline: a curve that stops at the cap cannot say whether the cap is
 *  costing anything. */
const K_MAX = 12;

interface Out {
  want: string;
  wantRegime: string;
  wantChannel: string;
  country: string;
  /** The memo's candidate order, truncated at K_MAX. Ranks are read off this. */
  memoIds: string[];
  /** The instant screen's table, truncated at K_MAX. Reference only. */
  screenIds: string[];
  /** How many candidates the memo order actually had, UNTRUNCATED. A cut
   *  cannot buy a row that does not exist and this is what says whether it
   *  did. */
  memoDepth: number;
}

function pct(hits: number, n: number): string {
  return `${hits}/${n} (${(100 * hits / n).toFixed(1)}% +/-${halfWidth(hits, n).toFixed(1)})`;
}

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("wsdc_rows");
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
    const screenIds = ((v.instrumentTable ?? [])
      .map((r: { instrumentId?: string }) => r.instrumentId)
      .filter(Boolean) as string[]).slice(0, K_MAX);

    // ── the memo's own pool and order ─────────────────────────────────────
    // Peers exactly as `runIntelligence` resolves them for a founder whose web
    // comparables came back empty; the SELF record's channels withheld, because
    // a company's own award history contains the answer and tier 1 of the sort
    // would be handed it. Same convention as scripts/_wscu_memo.ts.
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
    const instrumentTable = applyProfileSignal(
      accessiblePool(hydrated, f.eligibility as never).slice(0, VERDICT_POOL), undefined, undefined);
    const poolIds = instrumentTable
      .map((r) => r.instrumentId).filter((id): id is string => Boolean(id));
    await hydrateGatesFor(poolIds);
    // Production scopes the ease SIGNAL to the whole pool and the FOUNDER-FACING
    // table to `DISPLAY_CAP`; `SCREEN=head` replays the single shared scope as
    // it stood before that split, so the two are one replay apart and
    // comparable. Never reimplemented -- the same `evaluateEligibility`
    // production calls, with the same argument production passes.
    const eligibilityScreen = evaluateEligibility(f.eligibility as never,
      process.env.SCREEN === "head" ? poolIds.slice(0, DISPLAY_CAP) : poolIds);
    const { ordered } = orderMemoCandidates({
      instrumentTable,
      req: {
        company: f.company, country: f.country, eligibility: f.eligibility, ...f.opts,
      } as never,
      records: [], dbPeers, eligibilityScreen, log,
    });
    const memoIds = (ordered.map((c) => c.row.instrumentId).filter(Boolean) as string[]);

    out.push({
      want: t.instrument,
      wantRegime: String(byId.get(t.instrument)?.parentId ?? t.instrument),
      wantChannel: String(byId.get(t.instrument)?.sourceFamilyBucket ?? "(none)"),
      country: t.country,
      memoIds: memoIds.slice(0, K_MAX),
      screenIds,
      memoDepth: ordered.length,
    });
  }

  const prov = corpusProvenance();
  console.log(`corpus=${prov.source} instruments=${prov.instruments} at ${prov.hydratedAt}`);
  console.log(rankerTallyLine());
  console.log(`set=${setFile} split=${split} replayed ${out.length}`);
  for (const line of tally.lines(policy)) console.log(line);
  console.log(`caps in force: BRIEF_LIMITS.institutionsMax=${BRIEF_LIMITS.institutionsMax}, ` +
    `WRITER_CANDIDATE_CAP=${WRITER_CANDIDATE_CAP}, DISPLAY_CAP=${DISPLAY_CAP}, VERDICT_POOL=${VERDICT_POOL}`);

  const regimeOf = (id: string) => String(byId.get(id)?.parentId ?? id);
  const channelOf = (id: string) => String(byId.get(id)?.sourceFamilyBucket ?? "(none)");

  const hitExact = (ids: string[], r: Out, k: number) => ids.slice(0, k).includes(r.want);
  const hitRegime = (ids: string[], r: Out, k: number) =>
    ids.slice(0, k).some((id) => regimeOf(id) === r.wantRegime);
  const hitChannel = (ids: string[], r: Out, k: number) =>
    ids.slice(0, k).some((id) => channelOf(id) === r.wantChannel);

  const count = (k: number, f: (ids: string[], r: Out, k: number) => boolean,
    pick: (r: Out) => string[] = (r) => r.memoIds) =>
    out.filter((r) => f(pick(r), r, k)).length;

  const n = out.length;
  console.log(`\n── THE PUBLISHED-ROW CURVE (all four metrics on the MEMO order, which is what publishes) ──`);
  console.log(`  k   EXACT@k = MEMO@k        d        REGIME@k              d      CHANNEL@k             d     headroom`);
  let prevE = 0, prevR = 0, prevC = 0;
  for (let k = 1; k <= K_MAX; k++) {
    const e = count(k, hitExact), r = count(k, hitRegime), c = count(k, hitChannel);
    const d = (x: number, p: number) => `${x > p ? "+" : " "}${(100 * (x - p) / n).toFixed(1)}`;
    // Headroom: candidates the writer may decline before the table goes short.
    const head = WRITER_CANDIDATE_CAP - k;
    const headTxt = head < 0 ? `IMPOSSIBLE (writer cap ${WRITER_CANDIDATE_CAP})`
      : head === 0 ? `0  every candidate must land` : `${head}`;
    console.log(
      `  ${String(k).padStart(2)}  ${pct(e, n).padEnd(22)} ${d(e, prevE).padStart(6)}   ` +
      `${pct(r, n).padEnd(22)} ${d(r, prevR).padStart(6)}  ` +
      `${pct(c, n).padEnd(22)} ${d(c, prevC).padStart(6)}   ${headTxt}` +
      `${k === BRIEF_LIMITS.institutionsMax ? "   <- PUBLISHED TODAY" : ""}`);
    prevE = e; prevR = r; prevC = c;
  }

  console.log(`\n── THE INSTANT SCREEN, for reference only (SCREEN@k, exact leaf) ──`);
  console.log("  " + [1, 5, 6, 7, 8].map((k) =>
    `@${k} ${(100 * count(k, hitExact, (r) => r.screenIds) / n).toFixed(1)}%`).join("   "));

  // ── Can the row even exist? ───────────────────────────────────────────────
  // A cut cannot buy a row the order does not have. This is the ceiling on
  // every marginal point above, and it is a fact about founders, not about k.
  console.log(`\n── FOUNDERS WHOSE MEMO ORDER EVEN HAS A k-TH ROW ──`);
  const depths = out.map((r) => r.memoDepth).sort((x, y) => x - y);
  console.log(`  depth: min ${depths[0]} p10 ${depths[Math.floor(n * 0.1)]} p25 ${depths[Math.floor(n * 0.25)]} ` +
    `median ${depths[Math.floor(n / 2)]} p75 ${depths[Math.floor(n * 0.75)]} max ${depths[n - 1]}`);
  for (let k = 5; k <= K_MAX; k++) {
    const have = out.filter((r) => r.memoDepth >= k).length;
    console.log(`  >= ${String(k).padStart(2)} rows: ${pct(have, n)}`);
  }

  // ── Regime concentration on every marginal row, as the standing rule requires
  console.log(`\n── WHERE EACH MARGINAL ROW'S GAIN LANDS (exact leaf at rank exactly k) ──`);
  for (let k = 5; k <= K_MAX; k++) {
    const gainers = out.filter((r) => r.memoIds.indexOf(r.want) === k - 1);
    const byRegime = new Map<string, number>();
    for (const g of gainers) byRegime.set(g.wantRegime, (byRegime.get(g.wantRegime) ?? 0) + 1);
    const top = byRegime.size ? Math.max(...byRegime.values()) : 0;
    console.log(`  row ${String(k).padStart(2)}: ${String(gainers.length).padStart(3)} pair(s), ` +
      `${String(byRegime.size).padStart(3)} regime(s), ` +
      `${String(new Set(gainers.map((g) => g.country)).size).padStart(2)} countr(ies), ` +
      `largest regime ${top}${gainers.length ? ` (${(100 * top / gainers.length).toFixed(0)}%)` : ""}` +
      `${gainers.length ? `  ${[...byRegime].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([kk, v]) => `${kk}:${v}`).join(" ")}` : ""}`);
  }

  // ── What a marginal row ADDS, as opposed to repeats ───────────────────────
  // A row that brings a regime already on the page is a second sibling of an
  // answer the founder already had. It lengthens the memo without widening it,
  // and that is the cost side of this curve.
  console.log(`\n── DOES ROW k WIDEN THE MEMO OR LENGTHEN IT? (over all published rows, not just won leaves) ──`);
  for (let k = 2; k <= K_MAX; k++) {
    const withRow = out.filter((r) => r.memoIds.length >= k);
    if (!withRow.length) { console.log(`  row ${k}: no founder has one`); continue; }
    const newRegime = withRow.filter((r) =>
      !r.memoIds.slice(0, k - 1).some((id) => regimeOf(id) === regimeOf(r.memoIds[k - 1]))).length;
    const newChannel = withRow.filter((r) =>
      !r.memoIds.slice(0, k - 1).some((id) => channelOf(id) === channelOf(r.memoIds[k - 1]))).length;
    console.log(`  row ${String(k).padStart(2)}: brings a regime not already shown ` +
      `${(100 * newRegime / withRow.length).toFixed(0)}%, ` +
      `a channel not already shown ${(100 * newChannel / withRow.length).toFixed(0)}%  (n=${withRow.length})`);
  }

  if (process.env.OUT) {
    writeFileSync(process.env.OUT, JSON.stringify(out, null, 1));
    console.log(`\nwrote ${process.env.OUT}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
