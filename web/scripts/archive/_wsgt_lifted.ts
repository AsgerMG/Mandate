// Exactly which rows the axis lifts out of suppression, and on whose evidence.
delete process.env.DATABASE_URL;
import { loadDbInstruments } from "../../lib/intelligence/corpus";
import { callStatus } from "../../lib/intelligence/liveness";
import { recurrenceRecord } from "../../lib/intelligence/callRecurrence";
const rows = loadDbInstruments();
const lifted = rows.filter((r) => callStatus(r) === "between_calls");
console.log(`lifted ${lifted.length}`);
for (const r of lifted) {
  const rec = recurrenceRecord(r.id)!;
  console.log(`  ${rec.funderVerdict.padEnd(14)} ${r.schemeEndDate}  ${r.id}  [${rec.source}]`);
}
