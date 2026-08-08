// Which rule actually decides how many of a channel's leaves reach the pool?
//
// The leaf cap cuts BEFORE ranking, which is why it has been so damaging. But
// it is not the only collapse on the path: `buildInstrumentTable` ends with a
// one-row-per-institution-name dedupe (`SEL-DUPE-NAME`) that runs AFTER ranking
// and is, on today's corpus, far stronger. Without separating the two, a cap
// raise gets credited or blamed for what the dedupe did.
//
// So run one founder through with an ExclusionLog and count both.
//
//   COUNTRIES=DE npx tsx scripts/probe_leafcap_effect.ts
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("probe_leafcap_effect", ["DATABASE_URL", "VOYAGE_KEY"]);

import {
  corpusProvenance, hydrateDbInstruments, publishableInstruments, requireLiveCorpus,
  resetGateHydration,
} from "../lib/intelligence/corpus";
import { ExclusionLog } from "../lib/intelligence/exclusions";
import { computeVerdict } from "../lib/intelligence/pipeline";
import { POOL_LEAVES_PER_CHANNEL } from "../lib/intelligence/shortlist";

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("probe_leafcap_effect");
  const p = corpusProvenance();
  console.log(`corpus=${p.source} instruments=${p.instruments} at ${p.hydratedAt}`);
  console.log(`POOL_LEAVES_PER_CHANNEL=${POOL_LEAVES_PER_CHANNEL}\n`);

  const pub = publishableInstruments();
  for (const country of (process.env.COUNTRIES ?? "DE,ES,IT,FR").split(",")) {
    resetGateHydration();
    const log = new ExclusionLog();
    const v = await computeVerdict("TestCo", country, {
      entityCountries: [country], sector: "other", activities: ["none"],
      borrowerModel: "operating", ticketBand: "b500k_2m5", consortium: "yes",
      useOfFunds: ["industrial_research", "experimental_development"],
    } as never, {
      targetMarkets: [country], capitalSought: ["grant", "loan"],
      description: "We build software for industrial automation.", log,
    } as never);
    const counts = log.countsByRule();
    const ids = new Set(v.candidateInstrumentIds ?? []);
    // The one channel this cap has ever bound, counted the way the guard counts
    // it: the founder's own country plus the EU-wide tier.
    const satr = pub.filter((i) => i.sourceFamilyBucket === "state_aid_satr"
      && (i.country === country || i.country === "EU"));
    const inPool = satr.filter((i) => ids.has(i.id)).length;
    console.log(`${country}: pool=${ids.size}   state_aid_satr publishable=${satr.length} ` +
      `-> in pool=${inPool}`);
    // Every rule that fired, not a chosen three: the point of the probe is to
    // find out which one is load-bearing, and a hand-picked list would only
    // ever confirm the rule someone already suspected.
    console.log("    " + Object.entries(counts).sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k} ${n}`).join("   "));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
