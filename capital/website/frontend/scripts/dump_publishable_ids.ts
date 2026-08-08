// Emit the ids the product actually publishes, so a Python-side analysis can
// measure on the rows the founder actually sees rather than on the whole
// corpus.
//
// ── Why this hydrates, and why that is not a detail ────────────────────────
// This used to call publishableInstruments() straight off the committed
// snapshot. publishableInstruments() is synchronous and reads whatever corpus
// is currently loaded, so with no hydrate call it answered from
// public/data/instrument_terms.json every time — and the snapshot and Postgres
// do not agree about which funds exist, let alone which are OPEN. The liveness
// filter is the whole point of the word "publishable", so taking it off the
// corpus that lags is the one thing this script must not do: every downstream
// probe then measures a set the founder was never shown.
//
// Run from website/frontend:  npx tsx scripts/dump_publishable_ids.ts [out.json]
import { writeFileSync } from "fs";
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("dump_publishable_ids", ["DATABASE_URL"]);

async function main() {
  const { hydrateDbInstruments, publishableInstruments, corpusProvenance } =
    await import("../lib/intelligence/corpus");
  await hydrateDbInstruments();
  const provenance = corpusProvenance();
  const ids = publishableInstruments().map((i) => i.id);
  const out = process.argv[2] ?? "/tmp/publishable_ids.json";
  writeFileSync(out, JSON.stringify(ids, null, 0));
  // Say which corpus this came off, in the same breath as the count: a bare
  // count is what let the two corpora be reported as one system.
  console.log(
    `${ids.length} publishable instruments -> ${out} (corpus=${provenance.source})`);
}

main();
