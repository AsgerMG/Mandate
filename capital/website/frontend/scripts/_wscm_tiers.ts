// wsCM — does the row comparator's FIRST tier ever actually decide anything?
//
// `_wscm_stages.ts` reported "won leaf had >=1 row above it that it BEAT on the
// score: 0/250". Zero across 250 tables of ~77 rows is the shape of a
// diagnostic that is not looking, so it is checked directly here rather than
// believed: this prints the two booleans' distribution over one replay and
// counts, over the whole table and not merely around the won leaf, how many
// ADJACENT pairs the comparator resolved on a tier rather than on the score.
//
// If the tiers are genuinely inert the answer is zero and the 0/250 above is a
// finding. If they are not, this prints a non-zero count and the 0/250 was a
// bug in the measurement.
//
// FREE. One Voyage embed and one Postgres read per pair.
//
//   SPLIT=tune N=25 npx tsx scripts/_wscm_tiers.ts
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("wscm_tiers", ["DATABASE_URL", "VOYAGE_KEY"]);

import {
  hydrateDbInstruments, publishableInstruments, loadDbInstruments,
  requireLiveCorpus, resetGateHydration,
} from "../lib/intelligence/corpus";
import { ExclusionLog } from "../lib/intelligence/exclusions";
import { computeVerdict } from "../lib/intelligence/pipeline";
import { rankerTallyLine, resetRankerTally } from "../lib/intelligence/semantic";
import { readTrace, traceOn, traceReset } from "../lib/intelligence/tableTrace";
import { DEFAULT_SEED, sampleRecall } from "./recallSample";
import {
  answersFor, assertAncestorConvention, assertGradablePopulation, loadRecallSet,
  partitionByOfferable, reattributeMissingAnswers, type AnswerMode,
} from "./recallSet";

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("wscm_tiers");
  const corpus = loadDbInstruments();
  const offerable = new Set(publishableInstruments().map((i) => i.id));
  const { file, rows: all } = loadRecallSet();
  assertAncestorConvention(corpus);
  const inCorpus = new Set(corpus.map((i) => i.id));
  const fixed = reattributeMissingAnswers(all, (id) => inCorpus.has(id), (id) => offerable.has(id));
  const pop = partitionByOfferable(fixed.rows, (id) => offerable.has(id));
  assertGradablePopulation(pop, (id) => inCorpus.has(id), fixed.reattributed.length, file);
  const split = process.env.SPLIT ?? "tune";
  const set = pop.graded.filter((r) => split === "all" || r.split === split);
  const N = Math.min(Number(process.env.N ?? 25), set.length);
  const sample = sampleRecall(set, N, Number(process.env.SEED ?? DEFAULT_SEED));

  traceOn();
  resetRankerTally();
  let rowsSeen = 0, usedInFieldTrue = 0, fitDemotedTrue = 0;
  let adjTier1 = 0, adjTier2 = 0, adjScore = 0, adjTie = 0;
  let tablesWithBothTier1 = 0, tablesWithBothTier2 = 0;
  const R = (x: number) => Math.round(x * 1e6);
  for (const t of sample) {
    resetGateHydration();
    traceReset();
    const a = answersFor(t, (process.env.ANSWERS ?? "off") as AnswerMode);
    await computeVerdict("TestCo", t.country, {
      entityCountries: [t.country], sector: t.sector ?? "other", activities: ["none"],
      borrowerModel: "operating", ticketBand: a.ticketBand, consortium: "yes",
      useOfFunds: ["industrial_research", "experimental_development"], region: a.region,
    } as never, {
      targetMarkets: [t.country], capitalSought: a.capitalSought,
      description: t.description || t.selfDescription || undefined, log: new ExclusionLog(),
    } as never);
    const { facts } = readTrace();
    rowsSeen += facts.length;
    usedInFieldTrue += facts.filter((f) => f.usedInField).length;
    fitDemotedTrue += facts.filter((f) => f.fitDemoted).length;
    const anyT1 = facts.some((f) => f.usedInField), allT1 = facts.every((f) => f.usedInField);
    if (anyT1 && !allT1) tablesWithBothTier1++;
    const anyT2 = facts.some((f) => f.fitDemoted), allT2 = facts.every((f) => f.fitDemoted);
    if (anyT2 && !allT2) tablesWithBothTier2++;
    // What resolved each adjacent pair, in the comparator's own precedence.
    for (let i = 1; i < facts.length; i++) {
      const x = facts[i - 1], y = facts[i];
      if (x.usedInField !== y.usedInField) adjTier1++;
      else if (x.fitDemoted !== y.fitDemoted) adjTier2++;
      else if (R(x.relevance) !== R(y.relevance)) adjScore++;
      else adjTie++;
    }
  }
  console.log(rankerTallyLine());
  console.log(`\n${sample.length} tables, ${rowsSeen} rows`);
  console.log(`  usedInField true on ${usedInFieldTrue} rows (${(100 * usedInFieldTrue / rowsSeen).toFixed(1)}%)` +
    `   tables where it VARIES: ${tablesWithBothTier1}/${sample.length}`);
  console.log(`  fitDemoted  true on ${fitDemotedTrue} rows (${(100 * fitDemotedTrue / rowsSeen).toFixed(1)}%)` +
    `   tables where it VARIES: ${tablesWithBothTier2}/${sample.length}`);
  const adj = adjTier1 + adjTier2 + adjScore + adjTie;
  console.log(`\nWHAT RESOLVED EACH ADJACENT PAIR IN THE SORTED TABLE (${adj} pairs)`);
  console.log(`  tier 1  usedInField  ${String(adjTier1).padStart(6)}  ${(100 * adjTier1 / adj).toFixed(2)}%`);
  console.log(`  tier 2  fit          ${String(adjTier2).padStart(6)}  ${(100 * adjTier2 / adj).toFixed(2)}%`);
  console.log(`  tier 3  the SCORE    ${String(adjScore).padStart(6)}  ${(100 * adjScore / adj).toFixed(2)}%`);
  console.log(`  tie -> channel/id    ${String(adjTie).padStart(6)}  ${(100 * adjTie / adj).toFixed(2)}%`);
}

main();
