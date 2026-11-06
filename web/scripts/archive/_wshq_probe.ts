// Why is SA.40453 published? Ask the real corpus, row by row.
import { loadEnvLocal, requireCredentials } from "../loadEnv";
loadEnvLocal();
// Without the key this measures the committed snapshot and prints a number
// indistinguishable from a live one. _wshq_probe quotes figures that reached a
// finding and, for the lag, a shipped constant.
requireCredentials("_wshq_probe", ["DATABASE_URL"]);
import { hydrateDbInstruments, loadDbInstruments, publishableInstruments, publishabilityFailures, publishabilityContext, corpusProvenance, requireLiveCorpus } from "../../lib/intelligence/corpus";
import { callStatus, isClosed, opennessEvidence, today } from "../../lib/intelligence/liveness";
import { recurrenceRecord } from "../../lib/intelligence/callRecurrence";

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("_wshq_probe");
  console.log("provenance", JSON.stringify(corpusProvenance()));
  const all = loadDbInstruments();
  const asOf = today();
  const pub = publishableInstruments();
  const pubIds = new Set(pub.map((r) => r.id));
  console.log(`all ${all.length}  publishable ${pub.length}  asOf ${asOf}`);

  const past = all.filter((r) => r.schemeEndDate && String(r.schemeEndDate).slice(0,10) < asOf);
  console.log(`\nrows with a past scheme_end_date: ${past.length}`);
  const pastPub = past.filter((r) => pubIds.has(r.id));
  console.log(`  ... of which publishable: ${pastPub.length}`);

  const tally: Record<string, number> = {};
  for (const r of pastPub) {
    const k = `${r.schemeEndBasis ?? "NULL"} / ${callStatus(r, asOf)} / ${opennessEvidence(r, asOf)} / rec=${recurrenceRecord(r.id)?.recurrence ?? "none"}`;
    tally[k] = (tally[k] ?? 0) + 1;
  }
  console.log("\npublishable rows with a past end date, by (basis / callStatus / evidence / recurrence):");
  for (const [k, v] of Object.entries(tally).sort((a,b)=>b[1]-a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);

  console.log("\n── the row from the memo ──");
  for (const r of all) {
    if (!/40453|40391|111723|111728/.test(r.id) && r.schemeCode !== "SA.40453") continue;
    console.log(`${r.id}`);
    console.log(`  name=${r.name}`);
    console.log(`  schemeCode=${r.schemeCode} end=${r.schemeEndDate} basis=${r.schemeEndBasis} lastYear=${r.lastYear} successor=${r.successorScheme} policy=${r.sourceWindowPolicy}`);
    console.log(`  isClosed=${isClosed(r, asOf)} callStatus=${callStatus(r, asOf)} evidence=${opennessEvidence(r, asOf)} rec=${recurrenceRecord(r.id)?.recurrence ?? "none"}`);
    const ctx = publishabilityContext(all);
    console.log(`  publishabilityFailures=${JSON.stringify(publishabilityFailures(r, ctx))}  published=${pubIds.has(r.id)}`);
  }
  process.exit(0);
}
main();
