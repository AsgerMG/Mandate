// What the degradation policy withholds off the COMMITTED SNAPSHOT, today.
import { loadEnvLocal } from "./loadEnv";
loadEnvLocal(); delete process.env.ANTHROPIC_API_KEY;
delete process.env.DATABASE_URL;   // force the snapshot path
import { loadDbInstruments, publishableInstruments, suppressedForUnconfirmedLiveness, corpusProvenance } from "../lib/intelligence/corpus";
const pub = publishableInstruments();
const sup = suppressedForUnconfirmedLiveness();
const byCountry = new Map<string, number>();
for (const r of sup) byCountry.set(r.country, (byCountry.get(r.country)??0)+1);
console.log("provenance:", JSON.stringify(corpusProvenance()));
console.log(`snapshot corpus=${loadDbInstruments().length} publishable=${pub.length} withheld=${sup.length}`);
console.log("withheld by country:", [...byCountry].sort((a,b)=>b[1]-a[1]).map(([c,n])=>`${c}=${n}`).join(" "));
