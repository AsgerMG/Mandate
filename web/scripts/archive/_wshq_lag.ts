// How far behind is the register? Measured on rows whose openness is established
// INDEPENDENTLY of any award year — a declared end date still in the future.
import { loadEnvLocal, requireCredentials } from "../loadEnv";
loadEnvLocal();
// Without the key this measures the committed snapshot and prints a number
// indistinguishable from a live one. _wshq_lag quotes figures that reached a
// finding and, for the lag, a shipped constant.
requireCredentials("_wshq_lag", ["DATABASE_URL"]);
import { hydrateDbInstruments, loadDbInstruments, requireLiveCorpus } from "../../lib/intelligence/corpus";
import { SCHEME_END_BASIS, today } from "../../lib/intelligence/liveness";
const asOf = today();
const thisYear = Number(asOf.slice(0, 4));
async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("_wshq_lag");
  const all = loadDbInstruments();
  const open = all.filter((r) => r.schemeEndDate && String(r.schemeEndDate).slice(0,10) >= asOf
    && r.schemeEndBasis === SCHEME_END_BASIS.notifiedDuration && r.lastYear != null);
  const hist: Record<number, number> = {};
  for (const r of open) hist[thisYear - (r.lastYear as number)] = (hist[thisYear - (r.lastYear as number)] ?? 0) + 1;
  console.log(`rows with a FUTURE notified duration and an award year: ${open.length}`);
  let cum = 0;
  for (const k of Object.keys(hist).map(Number).sort((a,b)=>a-b)) {
    cum += hist[k];
    console.log(`  last award ${k} year(s) ago: ${String(hist[k]).padStart(4)}   cumulative ${(100*cum/open.length).toFixed(1)}%`);
  }
  console.log(`\nSo a grace of 0 years would call ${(100*(open.length-(hist[0]??0))/open.length).toFixed(1)}% of these demonstrably-open rows stale;`);
  console.log(`a grace of 1 year, ${(100*(open.length-(hist[0]??0)-(hist[1]??0))/open.length).toFixed(1)}%.`);
  process.exit(0);
}
main();
