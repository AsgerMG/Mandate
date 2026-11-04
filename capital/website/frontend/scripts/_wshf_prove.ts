// @ws-active until 2026-09-30
// Prove the write through the SHIPPED predicate chain against POSTGRES -- what
// a founder's request actually gets, not a SELECT. wsHF.
import { bodyNamedRows } from "../lib/intelligence/bodyNamedRow";
import { doorLabelFor } from "../lib/intelligence/doorLabel";
async function main() {
  const { loadEnvLocal, requireCredentials } = await import("./loadEnv");
  loadEnvLocal();
  // "against POSTGRES ... not a SELECT" is the first line of this file. Without
  // the key the shipped predicate chain runs against the committed snapshot and
  // proves nothing about the write.
  requireCredentials("wshf_prove", ["DATABASE_URL"]);
  const { hydrateDbInstruments, publishableInstruments, corpusProvenance } =
    await import("../lib/intelligence/corpus");
  await hydrateDbInstruments();
  console.log("provenance:", JSON.stringify(corpusProvenance()));
  const pool = publishableInstruments() as any[];
  const mine = pool.filter((r) => ["SA.40391", "SA.56245", "SA.49781"].includes(r.schemeCode ?? ""));
  console.log(`\n${mine.length} of the 22 are offerable; as a founder sees them:`);
  for (const r of mine.slice(0, 3).concat(mine.slice(-3)))
    console.log(`  [${r.nameSource}] ${doorLabelFor(r)}`);
  console.log(`\nbody-named rows still in the offerable pool: ${bodyNamedRows(pool).length}`);
  for (const r of bodyNamedRows(pool)) console.log(`  ${r.id.padEnd(46)} "${r.name}"`);
}
main();
