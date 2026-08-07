// Print, as JSON, what THIS corpus would let a founder be offered, and what it
// withheld. One process, one corpus, so the two arms can be compared without
// either one marking its own homework.
//
//   npx tsx scripts/probe_publishable_set.ts            # Postgres
//   NO_PG=1 npx tsx scripts/probe_publishable_set.ts    # the committed snapshot
import { readFileSync } from "fs";

try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* rely on the process environment */ }
if (process.env.NO_PG) delete process.env.DATABASE_URL;

import {
  corpusProvenance, hydrateDbInstruments, publishableInstruments,
  suppressedForUnconfirmedLiveness,
} from "../lib/intelligence/corpus";

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
