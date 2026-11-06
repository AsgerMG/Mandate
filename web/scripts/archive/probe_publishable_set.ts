// Print, as JSON, what THIS corpus would let a founder be offered, and what it
// withheld. One process, one corpus, so the two arms can be compared without
// either one marking its own homework.
//
//   npx tsx scripts/probe_publishable_set.ts            # Postgres
//   NO_PG=1 npx tsx scripts/probe_publishable_set.ts    # the committed snapshot

import { loadEnvLocal, requireCredentials } from "../loadEnv";

loadEnvLocal();
requireCredentials("probe_publishable_set", ["DATABASE_URL"]);

import {
  corpusProvenance, hydrateDbInstruments, publishableInstruments,
  suppressedForUnconfirmedLiveness,
} from "../../lib/intelligence/corpus";

async function main() {
  await hydrateDbInstruments();
  const publishable = publishableInstruments().map((i) => i.id);
  const withheld = suppressedForUnconfirmedLiveness();
  process.stdout.write(JSON.stringify({
    provenance: corpusProvenance(),
    publishable,
    withheld: withheld.map((w) => ({ id: w.id, country: w.country })),
  }));
}

main().catch((e) => { console.error(e); process.exit(1); });
