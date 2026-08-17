/**
 * WHO IS THIS ROW NAMED AFTER — the sweep behind `check_body_named_rows.ts`.
 *
 * FREE. Reads the committed snapshot through the shipped predicates; with
 * DATABASE_URL set it reads Postgres instead. No model call, no paid network.
 *
 * @ws-active until 2026-09-30
 * Run: npx tsx scripts/_wshf_sweep.ts
 */
import { bodyNamedRows } from "../lib/intelligence/bodyNamedRow";

async function main() {
  const { publishableInstruments } = await import("../lib/intelligence/corpus");
  const pool = publishableInstruments();
  const hits = bodyNamedRows(pool);
  console.log(`pool ${pool.length}   body-named ${hits.length}`);
  for (const r of hits) {
    console.log(
      `  ${(r.nameSource ?? "-").padEnd(14)} ${(r.schemeCode ?? "-").padEnd(12)} ` +
      `${(r.country ?? "--").padEnd(3)} ${r.id.padEnd(72)} "${r.name}"`);
  }
}
main();
