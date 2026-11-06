delete process.env.DATABASE_URL;
import { loadDbInstruments } from "../../lib/intelligence/corpus";
import { callStatus } from "../../lib/intelligence/liveness";
import { betweenCallsCaveat, betweenCallsSource } from "../../lib/intelligence/callRecurrence";
for (const r of loadDbInstruments()) {
  if (callStatus(r) !== "between_calls") continue;
  console.log(`\n${r.name}  (${r.country})`);
  console.log(`  ${betweenCallsCaveat(r)}`);
  console.log(`  source: ${betweenCallsSource(r.id)?.url}`);
}
