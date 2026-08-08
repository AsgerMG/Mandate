// WHY DOES THE REGION ANSWER CHANGE NOTHING?
//
// `REGION=any` is bit-identical to no region on every headline, mode, regime
// bucket and country, while 139 of 300 replayed rows are supplied a real NUTS
// region. Something between the intake and the published table drops it.
//
// This walks the REAL build path — selectInstrumentRows -> hydrateGatesFor ->
// materialiseInstrumentTable, which is exactly what computeVerdict calls — once
// with the founder's region and once without, and reports where the two orders
// stop differing. Reasoning about the code got as far as three candidate
// collapses; only running it says which one binds.
import { loadEnvLocal, requireCredentials } from "./loadEnv";
loadEnvLocal();
// Declared, not assumed: this harness ranks on pgvector when the keys are
// present and on the lexical fallback when they are not, and the two are
// different systems. check_env_loader P4 derives this from the import graph.
requireCredentials("diagnose_region_drop", ["DATABASE_URL", "VOYAGE_KEY"]);

import {
  hydrateDbInstruments, loadDbInstruments, publishableInstruments, requireLiveCorpus,
  resetGateHydration,
} from "../lib/intelligence/corpus";
import { buildInstrumentTableHydrated, regionScorer } from "../lib/intelligence/shortlist";
import { computeVerdict } from "../lib/intelligence/pipeline";
import { semanticFundMatch } from "../lib/intelligence/semantic";
import { loadRecallSet, partitionByOfferable, reattributeMissingAnswers } from "./recallSet";
import { DEFAULT_SEED, sampleRecall } from "./recallSample";

const ids = (rows: { instrumentId?: string }[]) =>
  rows.map((r) => r.instrumentId ?? "-").join(",");

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("diagnose_region_drop");
  const corpus = loadDbInstruments();
  const byId = new Map(corpus.map((i) => [i.id, i]));
  const offerable = new Set(publishableInstruments().map((i) => i.id));

  const byScheme = new Map<string, string[]>();
  for (const i of corpus) {
    const c = ((i as any).schemeCode ?? "").trim();
    if (c) byScheme.set(c, [...(byScheme.get(c) ?? []), i.id]);
  }

  const { rows: all } = loadRecallSet();
  const inCorpus = new Set(corpus.map((i) => i.id));
  const fixed = reattributeMissingAnswers(all, (id) => inCorpus.has(id), (id) => offerable.has(id));
  const pop = partitionByOfferable(fixed.rows, (id) => offerable.has(id));
  // The rows that can possibly be moved by region: a real NUTS answer AND a won
  // fund whose notified scheme has siblings regionScorer can separate. Anything
  // else is a row where region has nothing to say, and counting it would dilute
  // the very effect being looked for.
  const candidates = (pop.graded as any[]).filter((r) => {
    if (r.split !== "holdout" || !r.region) return false;
    const won = byId.get(r.instrument);
    const code = ((won as any)?.schemeCode ?? "").trim();
    if (!code) return false;
    const sibs = (byScheme.get(code) ?? []).map((id) => byId.get(id)!).filter(Boolean);
    if (sibs.length < 2) return false;
    const sc = regionScorer(sibs as any, r.region);
    return new Set(sibs.map((s) => sc(s as any).toFixed(6))).size > 1;
  });
  console.log(`holdout rows where region CAN separate the won fund's scheme: ${candidates.length}`);

  const N = Math.min(Number(process.env.N ?? 120), candidates.length);
  const sample = sampleRecall(candidates as any, N, Number(process.env.SEED ?? DEFAULT_SEED));

  let fullDiffers = 0, top6Differs = 0, wonRankImproved = 0, wonRankWorse = 0;
  let sibsInFullPool = 0, sibsInTop6 = 0, wonInTop6With = 0, wonInTop6Without = 0;
  const examples: string[] = [];

  for (const t of sample as any[]) {
    const semantic = await semanticFundMatch(t.description || t.selfDescription || "");
    const input = {
      fieldChannels: new Set<string>(),
      ticketBand: "b500k_2m5",
      consortiumOk: true,
      founderCountries: [t.country],
      capitalSought: ["grant", "loan"],
      description: t.description || t.selfDescription || undefined,
      semantic,
      founderSector: t.sector ?? "other",
      useOfFunds: ["industrial_research", "experimental_development"],
    } as any;

    // Two ways in, because they disagree and the disagreement IS the bug.
    // DIRECT calls the builder the way the ranker documents it. VERDICT goes
    // through computeVerdict exactly as measure_recall.ts does. If only the
    // first moves, the signal is lost inside computeVerdict rather than in the
    // ranker, and no amount of reading regionScorer would have found it.
    const via = process.env.VIA ?? "direct";
    const build = async (region?: string) => {
      resetGateHydration();
      if (via === "direct") {
        return await buildInstrumentTableHydrated({ ...input, founderRegion: region });
      }
      const v = await computeVerdict("TestCo", t.country, {
        entityCountries: [t.country], sector: t.sector ?? "other", activities: ["none"],
        borrowerModel: "operating", ticketBand: "b500k_2m5", consortium: "yes",
        useOfFunds: ["industrial_research", "experimental_development"],
        region,
      } as never, {
        targetMarkets: [t.country], capitalSought: ["grant", "loan"],
        description: t.description || t.selfDescription || undefined,
      } as never);
      return (v.instrumentTable ?? []) as any[];
    };
    const without = await build(undefined);
    const with_ = await build(t.region);

    const full = ids(without) !== ids(with_);
    if (full) fullDiffers++;
    const t6a = ids(without.slice(0, 6)), t6b = ids(with_.slice(0, 6));
    if (t6a !== t6b) top6Differs++;

    const rank = (rows: any[]) => rows.findIndex((r) => r.instrumentId === t.instrument);
    const ra = rank(without), rb = rank(with_);
    if (rb >= 0 && (ra < 0 || rb < ra)) wonRankImproved++;
    if (ra >= 0 && (rb < 0 || rb > ra)) wonRankWorse++;
    if (ra >= 0 && ra < 6) wonInTop6Without++;
    if (rb >= 0 && rb < 6) wonInTop6With++;

    // How many siblings of the won scheme survive into the published rows at
    // all? Region can only order what is still there.
    const code = ((byId.get(t.instrument) as any)?.schemeCode ?? "").trim();
    const sibIds = new Set(byScheme.get(code) ?? []);
    const inFull = with_.filter((r) => r.instrumentId && sibIds.has(r.instrumentId)).length;
    const inTop6 = with_.slice(0, 6).filter((r) => r.instrumentId && sibIds.has(r.instrumentId)).length;
    if (inFull > 1) sibsInFullPool++;
    if (inTop6 > 1) sibsInTop6++;

    if (full && t6a === t6b && examples.length < 3) {
      examples.push(`  ${t.country} ${t.region} won=${t.instrument}\n` +
        `    rank without region ${ra}, with region ${rb}; siblings in full list ${inFull}, in top6 ${inTop6}`);
    }
  }

  console.log(`\nreplayed ${N} rows where region has something to say:`);
  console.log(`  FULL candidate order differs        ${fullDiffers}/${N}`);
  console.log(`  published TOP 6 differs             ${top6Differs}/${N}`);
  console.log(`  won fund ranked HIGHER with region  ${wonRankImproved}`);
  console.log(`  won fund ranked LOWER with region   ${wonRankWorse}`);
  console.log(`  won fund in top6 without / with     ${wonInTop6Without} / ${wonInTop6With}`);
  console.log(`  >1 sibling of the won scheme in the full list  ${sibsInFullPool}/${N}`);
  console.log(`  >1 sibling of the won scheme in the top 6      ${sibsInTop6}/${N}`);
  if (examples.length) {
    console.log(`\nrows whose full order moved but whose published table did not:`);
    for (const e of examples) console.log(e);
  }
}
main();
