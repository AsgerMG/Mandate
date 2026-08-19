import { loadEnvLocal, requireCredentials } from "../loadEnv";
loadEnvLocal(); requireCredentials("x", ["DATABASE_URL"]);
import { hydrateDbInstruments, loadDbInstruments, publishabilityContext, publishabilityFailures, requireLiveCorpus } from "../../lib/intelligence/corpus";
(async () => {
  await hydrateDbInstruments(); requireLiveCorpus("x");
  const all = loadDbInstruments();
  const ctx = publishabilityContext(all);
  for (const i of all.filter((x) => x.schemeCode === "SA.40391" || x.id.includes("sa_58995"))) {
    console.log(`${i.id}\n    ${JSON.stringify(publishabilityFailures(i, ctx))}`);
  }
})();
