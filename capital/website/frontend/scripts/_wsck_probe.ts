// wsCK — the control that keeps `_wsck_money.ts`'s +0.0 from being a dead flag.
//
// The paired ticket test returns +0.0 with ZERO discordant pairs on both splits.
// In this repo that pattern has meant a dead code path far more often than it
// has meant a null effect: `ticketBand` reached `rowRelevance`, was turned into
// a multiplier, and was left out of the returned expression by the very commit
// named "Make ticketBand actually affect what a founder is shown". A null result
// on a signal that never arrives is not a finding, it is a bug wearing one.
//
// So before the +0.0 may be reported, the path is proved LIVE the only way it
// can be: hand the same founder four ticket bands spanning the whole vocabulary
// and check the published five actually differ. This fails loudly if any country
// returns one ordering for all four.
//
// FREE: four verdicts per country, embeds only, no model calls.
//
//   npx tsx scripts/_wsck_probe.ts
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("wsck_probe", ["DATABASE_URL", "VOYAGE_KEY"]);

import {
  hydrateDbInstruments, requireLiveCorpus, resetGateHydration,
} from "../lib/intelligence/corpus";
import { computeVerdict } from "../lib/intelligence/pipeline";
import { rankerTallyLine, resetRankerTally } from "../lib/intelligence/semantic";
import { TICKET_BANDS } from "../lib/intelligence/types";

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("wsck_probe");
  resetRankerTally();
  // Spanning bands, read off the published vocabulary rather than written out,
  // so a change to the band table cannot leave this probe testing two values
  // that no longer bracket anything.
  const vals = TICKET_BANDS.map((b) => b.value as string);
  const bands = [vals[0], vals[Math.floor(vals.length / 3)], vals[Math.floor((2 * vals.length) / 3)], vals[vals.length - 1]];
  const countries = (process.env.COUNTRIES ?? "FR,ES,SE,DE").split(",");
  let inert = 0;
  for (const country of countries) {
    const tops: string[] = [];
    for (const band of bands) {
      resetGateHydration();
      const v = await computeVerdict("TestCo", country, {
        entityCountries: [country], sector: "other", activities: ["none"],
        borrowerModel: "operating", ticketBand: band, consortium: "yes",
        useOfFunds: ["industrial_research", "experimental_development"],
      } as never, { targetMarkets: [country], capitalSought: ["grant", "loan"] } as never);
      tops.push(((v.instrumentTable ?? []).slice(0, 5)
        .map((r: { instrumentId?: string }) => r.instrumentId)).join(","));
    }
    const distinct = new Set(tops).size;
    console.log(`${country}  distinct published-five orderings across ${bands.join("/")}: ${distinct} of ${bands.length}`);
    if (distinct === 1) inert++;
  }
  console.log(rankerTallyLine());
  if (inert) {
    throw new Error(`ticketBand changed nothing in ${inert} of ${countries.length} countries — ` +
      `the signal does not reach the ordering, so any paired null measured on it is a dead path, not a result`);
  }
  console.log(`\nPATH IS LIVE in every country probed. A +0.0 from _wsck_money.ts is therefore a`);
  console.log(`real null: the answer arrives, reorders the table, and does not move the won leaf.`);
}

main();
