import { loadEnvLocal, requireCredentials } from "./loadEnv";
loadEnvLocal(); delete process.env.ANTHROPIC_API_KEY;
requireCredentials("wsgl_floor", ["DATABASE_URL"]);
import { hydrateDbInstruments, loadDbInstruments, publishabilityContext, publishabilityFailures, publishableInstruments, requireLiveCorpus } from "../lib/intelligence/corpus";
import { meetsDataFloor, hasThinEvidence, accessMode } from "../lib/intelligence/accessMode";
import { SCHEME_END_BASIS, today } from "../lib/intelligence/liveness";
async function main(){
  await hydrateDbInstruments(); requireLiveCorpus("wsgl_floor");
  const all = loadDbInstruments();
  const ctx = publishabilityContext(all);
  const pub = publishableInstruments();
  // rows failing ONLY the data floor (would be publishable if the floor were dropped)
  const onlyFloor = all.filter(i => {
    const w = publishabilityFailures(i, ctx);
    return w.length === 1 && w[0].startsWith("no amounts and no dates");
  });
  const anyFloor = all.filter(i => publishabilityFailures(i, ctx).some(w => w.startsWith("no amounts")));
  const t = today();
  const failsFirstTwo = all.filter(i => !((i.totalEur ?? 0) > 0) && !i.lastYear);
  const futureWindow = failsFirstTwo.filter(i => {
    const e = i.schemeEndDate ? String(i.schemeEndDate).slice(0,10) : "";
    return (i as any).schemeEndBasis === SCHEME_END_BASIS.callDeadline && e.length===10 && e >= t;
  });
  console.log(`today=${t}`);
  console.log(`corpus=${all.length} publishable=${pub.length}`);
  console.log(`fail the two AWARD tests (no total, no lastYear): ${failsFirstTwo.length}`);
  console.log(`  ... of those, a FUTURE register call deadline: ${futureWindow.length}`);
  console.log(`fail meetsDataFloor and are otherwise publishable: ${onlyFloor.length}`);
  console.log(`fail meetsDataFloor at all: ${anyFloor.length}`);
  console.log(`thin evidence among publishable: ${pub.filter(hasThinEvidence).length}`);
  console.log(`publishable with no award median (totalEur<=0): ${pub.filter(i=>!((i.totalEur??0)>0)).length}`);
  console.log("\nrows that would be ADMITTED if the floor were dropped:");
  const byCountry = new Map<string, number>();
  for (const i of onlyFloor) byCountry.set(i.country, (byCountry.get(i.country)??0)+1);
  for (const i of onlyFloor.sort((a,b)=>a.country.localeCompare(b.country))) {
    console.log(`  ${i.country}  ${i.id.padEnd(34)} cap=${String(i.capitalType).padEnd(13)} mode=${accessMode(i)} ev=${i.eventCount} gates=${i.gates.length}  ${i.name}`);
  }
  console.log("\nby country:", [...byCountry].sort((a,b)=>b[1]-a[1]).map(([c,n])=>`${c}=${n}`).join(" "));
  // countries whose ONLY publishable rows would change
  const pubByCountry = new Map<string, number>();
  for (const i of pub) pubByCountry.set(i.country, (pubByCountry.get(i.country)??0)+1);
  console.log("\ncountries with <=3 publishable rows today:",
    [...pubByCountry].filter(([,n])=>n<=3).sort((a,b)=>a[1]-b[1]).map(([c,n])=>`${c}=${n}`).join(" "));
  const missing = [...new Set(all.map(i=>i.country))].filter(c=>!pubByCountry.has(c));
  console.log("countries with ZERO publishable rows:", missing.join(" ") || "(none)");
}
main().catch(e=>{console.error(e);process.exit(1)});
