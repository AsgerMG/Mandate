// HOW MUCH OF THE POPULATION CAN THE REGION SIGNAL EVEN REACH?
//
// `REGION=any` is bit-identical to no region across every headline, mode,
// regime bucket and country, and the natural reading is that the answer is
// dropped between the intake and the ranker. It is not: computeVerdict responds
// to it (diagnose_region_drop.ts). What is actually true is narrower and more
// useful -- `regionScorer` only compares leaves that share a `schemeCode`, and
// almost nothing does.
//
// This states the reach as a fraction of the population EXACT@5 is graded on,
// and contrasts it with the reach the same signal would have if it were scoped
// to the REGIME, which is the unit the leaf-choice problem is actually posed in
// and the unit gateFitScorer uses.
import { loadEnvLocal } from "./loadEnv";
loadEnvLocal();

import {
  hydrateDbInstruments, loadDbInstruments, publishableInstruments, requireLiveCorpus,
} from "../lib/intelligence/corpus";
import { recipientsIn } from "../lib/intelligence/regionPrior";
import { loadRecallSet, partitionByOfferable, reattributeMissingAnswers } from "./recallSet";
import { DEFAULT_SEED, sampleRecall } from "./recallSample";

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("diagnose_region_reach");
  const corpus = loadDbInstruments();
  const byId = new Map(corpus.map((i) => [i.id, i]));
  const offerable = new Set(publishableInstruments().map((i) => i.id));
  const regimeOf = (id: string) => (byId.get(id) as any)?.parentId ?? id;

  const groupBy = (key: (i: any) => string | undefined) => {
    const m = new Map<string, string[]>();
    for (const i of corpus) {
      if (!offerable.has(i.id)) continue;
      const k = key(i);
      if (k) m.set(k, [...(m.get(k) ?? []), i.id]);
    }
    return m;
  };
  const byScheme = groupBy((i) => ((i as any).schemeCode ?? "").trim() || undefined);
  const byRegime = groupBy((i) => regimeOf(i.id));

  const inMulti = (m: Map<string, string[]>) =>
    [...m.values()].filter((g) => g.length > 1).reduce((a, g) => a + g.length, 0);
  console.log(`publishable leaves ${offerable.size}`);
  console.log(`  sitting in a multi-leaf SCHEME CODE group  ${inMulti(byScheme)}`);
  console.log(`  sitting in a multi-leaf REGIME             ${inMulti(byRegime)}`);

  const { rows: all } = loadRecallSet();
  const inCorpus = new Set(corpus.map((i) => i.id));
  const fixed = reattributeMissingAnswers(all, (id) => inCorpus.has(id), (id) => offerable.has(id));
  const pop = partitionByOfferable(fixed.rows, (id) => offerable.has(id));
  const holdout = (pop.graded as any[]).filter((r) => r.split === "holdout");

  // "Reachable" = the founder supplied a region AND the won fund has siblings
  // in the group the signal compares within AND the register records different
  // recipient counts for at least two of them. Anything short of all three and
  // region is silent for that founder by construction, not by weakness.
  const reach = (groups: Map<string, string[]>, key: (id: string) => string | undefined) =>
    (rows: any[]) => rows.filter((r) => {
      if (!r.region) return false;
      const k = key(r.instrument);
      const sibs = k ? groups.get(k) ?? [] : [];
      if (sibs.length < 2) return false;
      const counts = sibs.map((id) => recipientsIn(id, r.region)).filter((n) => n !== undefined);
      return counts.length > 1 && new Set(counts).size > 1 && counts.some((n) => (n as number) > 0);
    }).length;

  const schemeReach = reach(byScheme, (id) => ((byId.get(id) as any)?.schemeCode ?? "").trim() || undefined);
  const regimeReach = reach(byRegime, (id) => regimeOf(id));

  const pc = (n: number, d: number) => `${n}/${d} (${(100 * n / d).toFixed(0)}%)`;
  console.log(`\nholdout graded pairs ${holdout.length}`);
  console.log(`  supplied a region                          ${pc(holdout.filter((r) => r.region).length, holdout.length)}`);
  console.log(`  region can separate, scoped to SCHEME CODE ${pc(schemeReach(holdout), holdout.length)}   <- what ships`);
  console.log(`  region can separate, scoped to REGIME      ${pc(regimeReach(holdout), holdout.length)}`);

  // The same, on the exact sample the headline is measured on, because a
  // fraction of the graded population is not the same thing as a count of rows
  // in the 300 that produce the published number.
  for (const seed of [20260806, 7, 99]) {
    const s = sampleRecall(holdout as any, 300, seed);
    console.log(`  seed ${String(seed).padEnd(8)} N=300:  scheme-scoped ${String(schemeReach(s as any)).padStart(3)}` +
                `   regime-scoped ${String(regimeReach(s as any)).padStart(3)}`);
  }
}
main();
