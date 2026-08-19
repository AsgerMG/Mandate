import { loadEnvLocal, requireCredentials } from "../loadEnv";
loadEnvLocal(); requireCredentials("x", ["DATABASE_URL"]);
import { hydrateDbInstruments, loadDbInstruments, publishableInstruments, requireLiveCorpus } from "../../lib/intelligence/corpus";
(async () => {
  await hydrateDbInstruments(); requireLiveCorpus("x");
  const off = new Set(publishableInstruments().map((i) => i.id));
  for (const code of ["SA.40391", "SA.58995", "SA.111723"]) {
    const all = loadDbInstruments().filter((i) => i.schemeCode === code);
    console.log(`${code}: ${all.length} leaves, offerable ${all.filter((i) => off.has(i.id)).length}`);
    for (const i of all) console.log(`   ${off.has(i.id) ? "OFFER" : "  -  "}  ${i.id}  end=${i.schemeEndDate ?? ""} succ=${(i as never as {successorScheme?:string}).successorScheme ?? ""} routeStatus=${(i as never as {routeStatus?:string}).routeStatus ?? ""}`);
  }
})();
