import { loadEnvLocal } from "./loadEnv";
loadEnvLocal();
import { hydrateDbInstruments, loadDbInstruments } from "../lib/intelligence/corpus";
import { recurrenceRecord } from "../lib/intelligence/callRecurrence";
async function main() {
  await hydrateDbInstruments();
  for (const r of loadDbInstruments()) {
    if (r.schemeCode !== "SA.40453") continue;
    console.log(`${r.id}\n  end=${r.schemeEndDate} basis=${r.schemeEndBasis} lastYear=${r.lastYear} successor=${r.successorScheme} rec=${recurrenceRecord(r.id)?.recurrence ?? "none"} body=${(r as any).institution ?? (r as any).body ?? "?"}`);
  }
  const one = loadDbInstruments()[0];
  console.log("\nfields:", Object.keys(one).join(" "));
  process.exit(0);
}
main();
