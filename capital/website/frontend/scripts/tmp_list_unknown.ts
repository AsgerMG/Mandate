import { loadEnvLocal, requireCredentials } from "./loadEnv";
loadEnvLocal();
requireCredentials("tmp_list_unknown", ["DATABASE_URL"]);
import { corpusProvenance, hydrateDbInstruments, loadDbInstruments, publishableInstruments, requireLiveCorpus } from "../lib/intelligence/corpus";
import { instrumentServesCapital } from "../lib/intelligence/shortlist";
import { CAPITAL_OPTIONS } from "../lib/intelligence/types";

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("tmp_list_unknown");
  const p = corpusProvenance();
  console.log(`corpus=${p.source} instruments=${p.instruments}`);
  const options = CAPITAL_OPTIONS.map((o) => o.value);
  const all = loadDbInstruments();
  const pub = publishableInstruments();
  const pubIds = new Set(pub.map((i) => i.id));
  const unreachable = (t: string) => !options.some((o) => instrumentServesCapital(t, [o]));
  console.log("\n=== ALL instruments (incl. non-publishable) with unreachable capitalType ===");
  for (const i of all) {
    if (!unreachable(i.capitalType || "(empty)")) continue;
    console.log(JSON.stringify({ id: i.id, name: i.name, country: i.country, capitalType: i.capitalType,
      basis: (i as any).capitalTypeBasis, bucket: i.sourceFamilyBucket, parentId: i.parentId,
      isFramework: i.isFramework, publishable: pubIds.has(i.id), events: i.eventCount,
      totalEur: (i as any).totalEur, url: (i as any).applicationUrl, scheme: (i as any).schemeCode,
      body: (i as any).administeringBody, tier: (i as any).tier }));
  }
  console.log(`\npublishable=${pub.length}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
