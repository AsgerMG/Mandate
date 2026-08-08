// WHAT SHOULD A RULE DO FOR A FUND THAT HAS NO SIBLINGS?
//
// ANSWERED, WS-AW: nothing, and the reason is measured rather than assumed.
// Scoring a standalone leaf on its own rules PROMOTES it -- the standalone
// share of the five rows shown goes 4.5% -> 8.1% -- and costs recall, because
// across a channel "share of rules cleared" is largely a statement about how
// much has been encoded. Section 2 below is where that shows: the pure
// documentation-depth null model scores 0.528 against pass rate's 0.577, and
// in Spain the null BEATS it. `project-mgmt/findings/standalone_gates_wsAW.md`
// has the end-to-end arms; the docstring on `gateFitScorer` has the summary.
//
// The script is kept because sections 1 and 4 are the questions to ask BEFORE
// paying to encode a register, and because the conclusion is a property of
// this corpus that a new load can change.
//
// `gateFitScorer` opens with `if (group.length < 2) continue` over a REGIME.
// It is a tie-breaker inside a family, and nothing else. WS-AU established the
// consequence on one market: all 88 Spanish BDNS convocatorias are parent-less
// by construction, so their 596 encoded gates can never be read by the ranker,
// and re-encoding them moved recall by bit-identical zero on three seeds.
//
// That is a property of the RANKER, not of Spain, and this script measures it
// as one. Three questions, in the order that can kill the next:
//
//   1. SCOPE.   How much of the publishable corpus is parent-less, and how much
//               of what a founder is actually SHOWN? If standalone leaves are
//               a rounding error the design question is academic.
//   2. NULL.    Across a channel — as opposed to within one regime — is gate
//               fit distinguishable from a measure of how well DOCUMENTED a
//               leaf is? `FIT=checked` is the confound in the flesh: it counts
//               rules evaluated and knows nothing about whether the founder
//               passed. Within a regime the leaves share a rule set, so the
//               confound is bounded; across a channel it is not bounded at all,
//               and pass RATE over one rule is not comparable to pass rate over
//               nine.
//   3. SIGNAL.  Where the pool CAN be separated, does gate fit rank the leaf
//               the company actually won above the rest of its channel, better
//               than a uniform draw?
//
// Reported against the uniform baseline (1 / pool size) and as the won fund's
// PERCENTILE in its channel, because a channel holds up to 90 leaves and a
// top-1 rate over that is too small a number to read.
//
// The pool here is the channel's publishable leaves reachable in the founder's
// country, which is a SUPERSET of the pool `selectLeafInstruments` admits. It
// is a proxy and is labelled as one: it answers whether the signal exists at
// channel scope, not what shipping it would score. Only `measure_recall.ts`
// answers that.
//
//   npx tsx scripts/measure_gate_standalone.ts
//   ANSWERS=real npx tsx scripts/measure_gate_standalone.ts
//   ANSWERS=real FIT=checked npx tsx scripts/measure_gate_standalone.ts
import { loadEnvLocal, requireCredentials } from "./loadEnv";
loadEnvLocal();
requireCredentials("measure_gate_standalone", ["DATABASE_URL"]);

import {
  hydrateDbInstruments, hydrateGatesFor, loadDbInstruments, publishableInstruments,
  requireLiveCorpus,
} from "../lib/intelligence/corpus";
import { assessInstrument, VERDICT_RANK } from "../lib/intelligence/verdict";
import {
  answersFor, assertAncestorConvention, loadRecallSet, partitionByOfferable,
  reattributeMissingAnswers, type AnswerMode, type RecallRow,
} from "./recallSet";

/** The three readings of "gate fit", kept in one place so the null model and
 *  the candidate signal are computed from the same assessment. */
function gateFit(a: ReturnType<typeof assessInstrument>): number[] {
  switch (process.env.FIT ?? "full") {
    // THE NULL MODEL. How much has been encoded about this leaf, with no
    // reference whatsoever to whether the founder qualifies. A "gate fit"
    // signal that beats chance by this much has measured documentation depth.
    case "checked": return [a.checked];
    // THE SECOND NULL MODEL, and the one that matters for `passrate`. Pass rate
    // scores an unencoded leaf 0 and a leaf with one trivially-passed rule 1.0,
    // so at channel scope most of its spread is the binary "has anyone encoded
    // anything here", not "does this founder qualify". This isolates exactly
    // that binary and nothing else.
    case "encoded": return [a.checked > 0 ? 1 : 0];
    // What `gateFitScorer` actually ranks on today.
    case "passrate": return [a.checked ? a.passed / a.checked : 0];
    default: return [-VERDICT_RANK[a.status], a.passed, a.checked, -a.blockers.length];
  }
}

const cmp = (x: number[], y: number[]) => {
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return y[i] - x[i];
  return 0;
};

const pct = (n: number, d: number) => `${(100 * n / Math.max(1, d)).toFixed(1)}%`;

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("measure_gate_standalone");
  const corpus = loadDbInstruments();
  assertAncestorConvention(corpus);
  const byId = new Map(corpus.map((i) => [i.id, i]));
  const offerable = new Set(publishableInstruments().map((i) => i.id));
  const regimeOf = (id: string) => byId.get(id)?.parentId ?? id;

  const regimeSize = new Map<string, number>();
  for (const i of corpus) {
    if (!offerable.has(i.id)) continue;
    const r = regimeOf(i.id);
    regimeSize.set(r, (regimeSize.get(r) ?? 0) + 1);
  }
  /** The scorer's own predicate, restated once: can this leaf EVER be scored? */
  const scoreable = (id: string) => (regimeSize.get(regimeOf(id)) ?? 0) >= 2;

  // ── 1. SCOPE ──────────────────────────────────────────────────────────────
  const pubs = corpus.filter((i) => offerable.has(i.id));
  const standalone = pubs.filter((i) => !scoreable(i.id));
  console.log(`\n1. SCOPE -- how much of the publishable corpus can the scorer never read?`);
  console.log(`  publishable leaves                             ${pubs.length}`);
  console.log(`  ...parent-less, or sole leaf of their regime   ${standalone.length}` +
              ` (${pct(standalone.length, pubs.length)})`);

  // Per country, because a register that publishes standalone calls concentrates
  // the whole effect in one market and an aggregate hides it.
  const byCountry = new Map<string, { n: number; alone: number; gated: number; aloneGated: number }>();
  for (const i of pubs) {
    const k = (i.country || "(none)").toUpperCase();
    const c = byCountry.get(k) ?? { n: 0, alone: 0, gated: 0, aloneGated: 0 };
    c.n++;
    if (!scoreable(i.id)) c.alone++;
    byCountry.set(k, c);
  }

  // Gates on the standalone rows: an unscoreable leaf with no encoded rule
  // costs nothing, and one carrying a decidable filter is encoded work the
  // ranker throws away. The two are a completely different finding.
  await hydrateGatesFor(pubs.map((i) => i.id));
  let aloneWithFilter = 0, aloneFilters = 0, sibWithFilter = 0, sibFilters = 0;
  for (const i of pubs) {
    const inst = byId.get(i.id)!;
    const n = ((inst.gates ?? []) as { gateRole?: string; valueSpec?: unknown }[])
      .filter((g) => (!g.gateRole || g.gateRole === "filter") && g.valueSpec).length;
    const k = (i.country || "(none)").toUpperCase();
    const c = byCountry.get(k)!;
    if (n > 0) c.gated++;
    if (scoreable(i.id)) { if (n > 0) sibWithFilter++; sibFilters += n; }
    else { if (n > 0) { aloneWithFilter++; c.aloneGated++; } aloneFilters += n; }
  }
  console.log(`  ...of those, carrying a decidable filter       ${aloneWithFilter}` +
              ` (${aloneFilters} filters, thrown away)`);
  console.log(`  sibling-grouped leaves carrying one            ${sibWithFilter}` +
              ` (${sibFilters} filters, read)`);
  console.log(`\n  by COUNTRY (leaves / unscoreable / unscoreable AND carrying a filter)`);
  for (const [k, c] of [...byCountry].sort((a, b) => b[1].alone - a[1].alone)) {
    if (c.n < 5 && c.alone === 0) continue;
    console.log(`    ${k.padEnd(10)} ${String(c.n).padStart(5)}` +
                ` ${String(c.alone).padStart(6)} (${pct(c.alone, c.n).padStart(6)})` +
                ` ${String(c.aloneGated).padStart(6)}`);
  }

  // ── 2 + 3. NULL and SIGNAL, at CHANNEL scope ─────────────────────────────
  const { rows: all } = loadRecallSet();
  const inCorpus = new Set(corpus.map((i) => i.id));
  const fixed = reattributeMissingAnswers(all, (id) => inCorpus.has(id), (id) => offerable.has(id));
  const pop = partitionByOfferable(fixed.rows, (id) => offerable.has(id));
  const holdout = (pop.graded as RecallRow[]).filter((r) => r.split === "holdout");

  // The proxy pool: the won fund's channel, restricted to leaves a founder in
  // that country could be offered at all. Country reach is the one filter that
  // is not a ranking decision — an off-country national scheme is excluded
  // before ranking, so including it here would flatter every statistic below.
  const reachable = (i: (typeof corpus)[number], country: string) => {
    const c = (i.country || "").toUpperCase();
    return c === "" || c === "EU" || c === country.toUpperCase();
  };

  const mode = (process.env.ANSWERS ?? "off") as AnswerMode;
  const buckets = new Map<string, {
    n: number; pctSum: number; top1: number; uniform: number;
    sep: number; sepPctSum: number; sepTop1: number; sepUniform: number;
  }>();
  const bump = (k: string, p: number, top1: number, u: number, sep: boolean) => {
    const b = buckets.get(k) ?? { n: 0, pctSum: 0, top1: 0, uniform: 0, sep: 0, sepPctSum: 0, sepTop1: 0, sepUniform: 0 };
    b.n++; b.pctSum += p; b.top1 += top1; b.uniform += u;
    if (sep) { b.sep++; b.sepPctSum += p; b.sepTop1 += top1; b.sepUniform += u; }
    buckets.set(k, b);
  };

  let skipped = 0;
  for (const r of holdout) {
    const won = byId.get(r.instrument);
    if (!won?.sourceFamilyBucket) { skipped++; continue; }
    const pool = pubs.filter((i) => i.sourceFamilyBucket === won.sourceFamilyBucket
                                 && reachable(i, r.country));
    // A won fund outside its own proxy pool is a pair whose answer the country
    // reach rule would have excluded before ranking. That is a fact about the
    // answer key, not about gate fit, and scoring it here would grade this
    // signal on rows no ranker ever saw.
    if (pool.length < 2 || !pool.some((i) => i.id === r.instrument)) { skipped++; continue; }
    const a = answersFor(r, mode);
    const answers = {
      entityCountries: [r.country], sector: r.sector ?? "other", activities: ["none"],
      borrowerModel: "operating", ticketBand: a.ticketBand, consortium: "yes",
      useOfFunds: ["industrial_research", "experimental_development"],
      region: a.region,
    } as never;

    const scored = pool.map((i) => ({ id: i.id, fit: gateFit(assessInstrument(byId.get(i.id)!, answers)) }));
    const sep = new Set(scored.map((s) => s.fit.join(","))).size > 1;
    const mine = scored.find((s) => s.id === r.instrument)!.fit;
    // Percentile: the share of the pool this leaf outranks, ties counted as
    // half. 0.5 is exactly what a signal that knows nothing scores.
    let below = 0, tie = 0;
    for (const s of scored) {
      const d = cmp(mine, s.fit);
      if (d < 0) below++; else if (d === 0) tie++;
    }
    const percentile = (below + tie / 2) / scored.length;
    const best = [...scored].sort((x, y) => cmp(x.fit, y.fit));
    const bestFit = best[0].fit.join(",");
    const tied = best.filter((s) => s.fit.join(",") === bestFit);
    const top1 = tied.some((s) => s.id === r.instrument) ? 1 / tied.length : 0;
    const u = 1 / pool.length;
    const key = scoreable(r.instrument) ? "won fund HAS siblings" : "won fund STANDALONE";
    for (const k of ["ALL", key, `channel=${won.sourceFamilyBucket}`, `country=${r.country}`]) {
      bump(k, percentile, top1, u, sep);
    }
  }

  console.log(`\n2+3. CHANNEL-SCOPE separation  (FIT=${process.env.FIT ?? "full"}` +
              ` ANSWERS=${mode})   skipped ${skipped} pair(s) with no channel or a pool of one`);
  console.log(`  proxy pool = publishable leaves of the won fund's channel, reachable in the founder's country`);
  console.log(`  ${"bucket".padEnd(34)} ${"n".padStart(5)} ${"pctile".padStart(7)}` +
              ` ${"top1".padStart(7)} ${"uniform".padStart(8)}  ${"sep".padStart(5)}` +
              ` ${"sep pct".padStart(8)} ${"sep top1".padStart(9)}`);
  const order = (k: string) => k === "ALL" ? 0 : k.startsWith("won fund") ? 1 : k.startsWith("channel=") ? 2 : 3;
  for (const [k, b] of [...buckets].sort((x, y) => order(x[0]) - order(y[0]) || y[1].n - x[1].n)) {
    if (b.n < 8 && order(k) === 3) continue;
    console.log(`  ${k.padEnd(34)} ${String(b.n).padStart(5)}` +
                ` ${(b.pctSum / b.n).toFixed(3).padStart(7)}` +
                ` ${pct(b.top1, b.n).padStart(7)} ${pct(b.uniform, b.n).padStart(8)}` +
                `  ${String(b.sep).padStart(5)}` +
                ` ${(b.sep ? b.sepPctSum / b.sep : 0).toFixed(3).padStart(8)}` +
                ` ${pct(b.sepTop1, Math.max(1, b.sep)).padStart(9)}`);
  }

  if (process.env.REACH) await reach(pubs, scoreable, holdout, mode);
}

/** ── 4. REACH ─────────────────────────────────────────────────────────────
 *
 *  The question every arm's flat result forces. A scorer can only reorder what
 *  selection hands it, so before concluding anything about how a standalone
 *  leaf SHOULD be scored, count how often one is on the table at all.
 *
 *  Structural, never a list of ids: a leaf is standalone if it is the sole
 *  publishable leaf of its regime. The same predicate `gateFitScorer` applies.
 *
 *  REACH=1 npx tsx scripts/measure_gate_standalone.ts */
async function reach(
  pubs: { id: string; country: string }[],
  scoreable: (id: string) => boolean,
  holdout: RecallRow[],
  mode: AnswerMode,
): Promise<void> {
  const { computeVerdict } = await import("../lib/intelligence/pipeline");
  const { sampleRecall } = await import("./recallSample");
  const N = Math.min(Number(process.env.REACH_N ?? 120), holdout.length);
  const sample = sampleRecall(holdout, N, Number(process.env.SEED ?? 20260806));
  const { resetGateHydration } = await import("../lib/intelligence/corpus");
  const by = new Map<string, { n: number; pool: number; poolAlone: number; t5: number; t5Alone: number }>();
  for (const t of sample) {
    resetGateHydration();
    const a = answersFor(t, mode);
    const v = await computeVerdict("TestCo", t.country, {
      entityCountries: [t.country], sector: t.sector ?? "other", activities: ["none"],
      borrowerModel: "operating", ticketBand: a.ticketBand, consortium: "yes",
      useOfFunds: ["industrial_research", "experimental_development"], region: a.region,
    } as never, {
      targetMarkets: [t.country], capitalSought: a.capitalSought,
      description: t.description || t.selfDescription || undefined,
    } as never);
    const pool = (v.candidateInstrumentIds ?? []) as string[];
    const top5 = ((v.instrumentTable ?? []) as { instrumentId?: string }[])
      .slice(0, 5).map((r) => r.instrumentId).filter((x): x is string => Boolean(x));
    for (const k of ["ALL", t.country || "(none)"]) {
      const b = by.get(k) ?? { n: 0, pool: 0, poolAlone: 0, t5: 0, t5Alone: 0 };
      b.n++; b.pool += pool.length; b.poolAlone += pool.filter((id) => !scoreable(id)).length;
      b.t5 += top5.length; b.t5Alone += top5.filter((id) => !scoreable(id)).length;
      by.set(k, b);
    }
  }
  console.log(`\n4. REACH -- does a standalone leaf ever get on the table?  (n=${N} founders replayed)`);
  console.log(`  ${"bucket".padEnd(12)} ${"n".padStart(5)} ${"pool".padStart(7)}` +
              ` ${"alone".padStart(7)} ${"share".padStart(7)}  ${"top5".padStart(6)}` +
              ` ${"alone".padStart(6)} ${"share".padStart(7)}`);
  for (const [k, b] of [...by].sort((x, y) => (x[0] === "ALL" ? -1 : y[0] === "ALL" ? 1 : y[1].n - x[1].n))) {
    if (b.n < 5 && k !== "ALL") continue;
    console.log(`  ${k.padEnd(12)} ${String(b.n).padStart(5)}` +
                ` ${(b.pool / b.n).toFixed(1).padStart(7)} ${(b.poolAlone / b.n).toFixed(1).padStart(7)}` +
                ` ${pct(b.poolAlone, b.pool).padStart(7)}  ${(b.t5 / b.n).toFixed(1).padStart(6)}` +
                ` ${(b.t5Alone / b.n).toFixed(2).padStart(6)} ${pct(b.t5Alone, b.t5).padStart(7)}`);
  }
  void pubs;
}

main().catch((e) => { console.error(e); process.exit(1); });
