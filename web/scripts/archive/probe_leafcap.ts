// Leaf-cap arithmetic read from POSTGRES, not the committed snapshot.
//
// check_leaf_cap.ts deletes DATABASE_URL on purpose. This probe does the
// opposite so the two readings can be compared, and so the number quoted in the
// findings is one that came out of Postgres.
import { loadEnvLocal, requireCredentials } from "../loadEnv";

loadEnvLocal();
requireCredentials("probe_leafcap", ["DATABASE_URL"]);

import {
  corpusProvenance, hydrateDbInstruments, publishableInstruments, requireLiveCorpus,
} from "../../lib/intelligence/corpus";
import { leafCapGroups } from "../../lib/intelligence/leafCap";

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("probe_leafcap");
  const p = corpusProvenance();
  console.log(`corpus=${p.source} instruments=${p.instruments} at ${p.hydratedAt}`);
  const pub = publishableInstruments();
  console.log(`publishable=${pub.length}`);
  const groups = leafCapGroups(pub);
  console.log(`groups=${groups.length}`);
  console.log("\n    n  channel                       country");
  for (const g of groups.slice(0, 30)) {
    console.log(`${String(g.n).padStart(5)}  ${g.channel.padEnd(28)}  ${g.country}`);
  }
  // Distribution of group sizes, so a cap can be chosen against the shape of the
  // corpus rather than against its single widest point.
  const ns = groups.map((g) => g.n).sort((a, b) => a - b);
  const q = (f: number) => ns[Math.min(ns.length - 1, Math.floor(f * ns.length))];
  console.log(`\nsizes: p50=${q(0.5)} p90=${q(0.9)} p95=${q(0.95)} p99=${q(0.99)} max=${ns[ns.length - 1]}`);
  for (const cap of [90, 103, 110, 120, 130, 150, 160, 180, 200, 250]) {
    const over = groups.filter((g) => g.n > cap);
    const cut = over.reduce((s, g) => s + g.n - cap, 0);
    console.log(`cap ${String(cap).padStart(4)}  over=${String(over.length).padStart(3)} groups  cut=${cut}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
