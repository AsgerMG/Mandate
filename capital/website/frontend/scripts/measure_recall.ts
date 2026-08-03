// Does retrieval return the fund a company ACTUALLY won?
//
// The only ground truth we own: 150k companies with traced awards. Replay a
// real recipient -- their country and the project they were funded for -- and
// check whether the instrument that actually paid them comes back in the pool
// and in the published rows. Row count is not correctness; this is.
import { readFileSync } from "fs";
import { hydrateDbInstruments } from "../lib/intelligence/corpus";
import { computeVerdict } from "../lib/intelligence/pipeline";

async function main() {
  await hydrateDbInstruments();
  const truth = JSON.parse(readFileSync("/tmp/ground_truth.json", "utf8")) as any[];
  const N = Number(process.env.N ?? 40);
  let inPool = 0, inRows = 0, done = 0;
  const misses: string[] = [];
  for (const t of truth.slice(0, N)) {
    const v = await computeVerdict("TestCo", t.country, {
      entityCountries: [t.country], sector: t.sector ?? "other", activities: ["none"],
      borrowerModel: "operating", ticketBand: "b500k_2m5", consortium: "yes",
    } as never, {
      targetMarkets: [t.country], capitalSought: ["grant", "loan"],
      description: t.description,
    } as never);
    const pool: string[] = v.candidateInstrumentIds ?? [];
    const rows: string[] = (v.instrumentTable ?? []).map((r: any) => r.instrumentId).filter(Boolean);
    done++;
    if (pool.includes(t.instrument)) inPool++;
    else misses.push(`${t.country} ${t.instrumentName} <- ${t.description.slice(0, 46)}`);
    if (rows.includes(t.instrument)) inRows++;
  }
  console.log(`replayed ${done} real recipients`);
  console.log(`  actual fund in the candidate pool: ${inPool}/${done}  (${(100*inPool/done).toFixed(0)}%)`);
  console.log(`  actual fund in published rows:     ${inRows}/${done}  (${(100*inRows/done).toFixed(0)}%)`);
  console.log(`\nmisses (fund never even considered):`);
  for (const m of misses.slice(0, 10)) console.log("   " + m);
}
main();
