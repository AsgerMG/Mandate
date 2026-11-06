// What each renewal horizon costs and buys, on the live corpus.
import { loadEnvLocal, requireCredentials } from "../loadEnv";
loadEnvLocal();
// Without the key this measures the committed snapshot and prints a number
// indistinguishable from a live one. _wshq_horizon quotes figures that reached a
// finding and, for the lag, a shipped constant.
requireCredentials("_wshq_horizon", ["DATABASE_URL"]);
import { hydrateDbInstruments, loadDbInstruments, publishableInstruments, publishabilityFailures, publishabilityContext, requireLiveCorpus } from "../../lib/intelligence/corpus";
import { SCHEME_END_BASIS, today } from "../../lib/intelligence/liveness";
import { recurrenceRecord } from "../../lib/intelligence/callRecurrence";

const asOf = today();
const thisYear = Number(asOf.slice(0, 4));

// The candidate rule, applied off to the side so nothing in the tree moves yet.
function newlyStale(r: any, grace: number): boolean {
  const end = r.schemeEndDate ? String(r.schemeEndDate).slice(0, 10) : "";
  if (!end || end >= asOf) return false;
  if (r.schemeEndBasis !== SCHEME_END_BASIS.notifiedDuration) return false;
  if (r.lastYear == null || r.lastYear <= Number(end.slice(0, 4))) return false; // was already closed
  return r.lastYear + grace < thisYear; // renewal evidence no longer current
}

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("_wshq_horizon");
  const all = loadDbInstruments();
  const ctx = publishabilityContext(all);
  const pub = publishableInstruments();
  const pubIds = new Set(pub.map((r) => r.id));
  console.log(`corpus ${all.length}  publishable today ${pub.length}  asOf ${asOf}`);

  for (const grace of [0, 1, 2, 3]) {
    const hit = all.filter((r) => newlyStale(r, grace));
    const hitPub = hit.filter((r) => pubIds.has(r.id));
    const recurs = hitPub.filter((r) => recurrenceRecord(r.id)?.recurrence === "recurs");
    const single = hitPub.filter((r) => recurrenceRecord(r.id)?.recurrence === "single_call");
    const none = hitPub.filter((r) => !recurrenceRecord(r.id));
    // A suppressed row may still be republished under a successor.
    const rescued = none.filter((r) => r.successorScheme && !ctx.liveCodes.has(r.successorScheme));
    console.log(`\ngrace ${grace}y  (renewal counts while lastYear + ${grace} >= ${thisYear})`);
    console.log(`  rows re-judged            ${hit.length}   of which publishable today ${hitPub.length}`);
    console.log(`  -> between_calls, caveated ${recurs.length}   (kept, funder's page says the programme runs on)`);
    console.log(`  -> shut, funder said so    ${single.length}`);
    console.log(`  -> shut, nobody asked      ${none.length}   (of which successor-redirected back in: ${rescued.length})`);
    console.log(`  net publishable            ${pub.length - single.length - none.length + rescued.length}`);
  }

  // The canary: the row whose suppression cost 306 leaves in August.
  console.log("\n── canaries ──");
  for (const r of all) {
    if (!/fondo.*garanzia|garanzia.*pmi/i.test(r.name ?? "")) continue;
    console.log(`  ${r.name} | end=${r.schemeEndDate} basis=${r.schemeEndBasis} lastYear=${r.lastYear} newlyStale@1=${newlyStale(r, 1)}`);
  }

  // The biggest things a 1-year horizon would drop with nobody asked.
  const drop = all.filter((r) => pubIds.has(r.id) && newlyStale(r, 1) && !recurrenceRecord(r.id))
    .sort((a, b) => (b.awardN ?? 0) - (a.awardN ?? 0));
  console.log(`\n── the 15 largest rows a 1-year horizon suppresses unexamined (of ${drop.length}) ──`);
  for (const r of drop.slice(0, 15)) {
    console.log(`  ${String(r.awardN ?? 0).padStart(6)} awards  end=${r.schemeEndDate} lastYear=${r.lastYear}  ${r.country}  ${r.name?.slice(0, 70)}`);
  }
  const byCountry: Record<string, number> = {};
  for (const r of drop) byCountry[r.country ?? "?"] = (byCountry[r.country ?? "?"] ?? 0) + 1;
  console.log("  by country:", JSON.stringify(byCountry));
  process.exit(0);
}
main();
