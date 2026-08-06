// Emit the ids the product actually publishes, so a Python-side analysis can
// measure on the same 721 rows the founder sees rather than all 1,014.
import { writeFileSync } from "fs";
import { publishableInstruments } from "../lib/intelligence/corpus";
const ids = publishableInstruments().map((i) => i.id);
writeFileSync(process.argv[2] ?? "/tmp/publishable_ids.json", JSON.stringify(ids, null, 0));
console.log(`${ids.length} publishable instruments`);
