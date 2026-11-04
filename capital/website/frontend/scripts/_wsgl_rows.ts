import { loadEnvLocal, requireCredentials } from "./loadEnv";
loadEnvLocal(); delete process.env.ANTHROPIC_API_KEY;
requireCredentials("wsgl_rows", ["DATABASE_URL"]);
import { hydrateDbInstruments, loadDbInstruments, publishabilityContext, publishabilityFailures, publishableInstruments, requireLiveCorpus, suppressedForUnconfirmedLiveness } from "../lib/intelligence/corpus";
import { assertAncestorConvention, isDescribed, loadRecallSet, reattributeMissingAnswers } from "./recallSet";
async function main(){
  await hydrateDbInstruments(); requireLiveCorpus("wsgl_rows");
  const corpus = loadDbInstruments(); assertAncestorConvention(corpus);
  const byId = new Map(corpus.map(i=>[i.id,i]));
  const inCorpus = new Set(corpus.map(i=>i.id));
  const ctx = publishabilityContext(corpus);
  const offerable = new Set(publishableInstruments().map(i=>i.id));
  const degraded = new Set(suppressedForUnconfirmedLiveness().map(r=>r.id));
  const { rows: all } = loadRecallSet("wsgl rows");
  const fixed = reattributeMissingAnswers(all, id=>inCorpus.has(id), id=>offerable.has(id));
  const seen = new Set<string>();
  const drawn = fixed.rows.filter(r=>r.split==="holdout" && isDescribed(r))
    .sort((a,b)=>a.name.localeCompare(b.name))
    .filter(r=>(seen.has(r.name)?false:(seen.add(r.name),true)));
  const out: any[] = [];
  const agg = new Map<string, any>();
  for (const t of drawn) {
    const won = t.instrument;
    if (!inCorpus.has(won) || offerable.has(won) || degraded.has(won)) continue;
    const i = byId.get(won)!;
    const why = publishabilityFailures(i, ctx);
    const e = agg.get(won) ?? { id: won, name: i.name, country: i.country, why,
      schemeCode: i.schemeCode, schemeEndDate: i.schemeEndDate, schemeEndBasis: (i as any).schemeEndBasis,
      lastYear: i.lastYear, totalEur: i.totalEur, eventCount: i.eventCount,
      capitalType: i.capitalType, applicationUrl: (i as any).applicationUrl,
      successorScheme: i.successorScheme, routeStatus: (i as any).routeStatus,
      nameSource: (i as any).nameSource, founders: [] as string[] };
    e.founders.push(t.name); agg.set(won, e);
  }
  console.log(JSON.stringify([...agg.values()].sort((a,b)=>b.founders.length-a.founders.length), null, 1));
}
main().catch(e=>{console.error(e);process.exit(1)});
