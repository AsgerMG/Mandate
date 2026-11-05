// wsIF — WHAT NORWAY ACTUALLY OFFERS TODAY, read-only.
//
// `project_offerability_residual` records "Norway's entire 48-row set" as rows
// that should not be offered, and attributes it to the RESEARCH COUNCIL
// re-booking its ledger onto new codes. Whether that finding reaches the six
// Innovasjon Norge leaves is the difference between a rename and a withdrawal,
// so it is asked of the corpus rather than inherited.
//
//   npx tsx scripts/_wsif_no.ts
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("wsif_no", ["DATABASE_URL"]);

import {
  hydrateDbInstruments, loadDbInstruments, publishabilityContext,
  publishabilityFailures, publishableInstruments, requireLiveCorpus,
} from "../lib/intelligence/corpus";

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("wsif_no");
  const all = loadDbInstruments();
  const ctx = publishabilityContext(all);
  const offerable = new Set(publishableInstruments().map((i) => i.id));

  const no = all.filter((i) => (i.country ?? "") === "NO");
  console.log("NO rows in corpus   " + no.length);
  console.log("NO rows offerable   " + no.filter((i) => offerable.has(i.id)).length);
  console.log("");
  for (const i of no.sort((a, b) => a.id.localeCompare(b.id))) {
    const why = publishabilityFailures(i, ctx);
    console.log((offerable.has(i.id) ? "OFFERED  " : "withheld ")
      + i.id.padEnd(46) + " " + JSON.stringify(i.name).padEnd(34)
      + " nameSource=" + (i.nameSource ?? "-")
      + " family=" + (i.sourceFamilyBucket ?? "-")
      + (why.length ? "  [" + why.join("; ") + "]" : ""));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
