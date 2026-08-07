// What does a WIDER POOL actually cost a request?
//
// `check_leaf_cap.ts` used to claim `check_payload_budget.ts` bounded
// POOL_LEAVES_PER_CHANNEL from the other side. It does not: that check measures
// `public/data/instrument_terms.json` minus non-framework gates and is
// completely insensitive to the cap. The cost of a wider pool is not in the
// snapshot at all — it is PHASE TWO, `hydrateGatesFor` over every selected leaf
// plus the regime each one inherits from, on every request.
//
// So measure that, per founder, from a cold corpus: pool size, the gate rows
// phase two pulls, and the bytes they serialise to. Run this at several values
// of POOL_LEAVES_PER_CHANNEL to get the curve.
//
//   COUNTRIES=DE,ES,FR,IT npx tsx scripts/probe_pool_cost.ts
import { readFileSync, writeFileSync } from "fs";
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* environment */ }

import {
  corpusProvenance, hydrateDbInstruments, loadDbInstruments, requireLiveCorpus,
  resetGateHydration,
} from "../lib/intelligence/corpus";
import { computeVerdict } from "../lib/intelligence/pipeline";
import { POOL_LEAVES_PER_CHANNEL } from "../lib/intelligence/shortlist";

/** Bytes the gates currently in memory would cost to ship. */
function gateBytes() {
  let gates = 0, bytes = 0;
  for (const i of loadDbInstruments()) {
    for (const g of i.gates ?? []) { gates++; bytes += JSON.stringify(g).length + 1; }
  }
  return { gates, bytes };
}

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("probe_pool_cost");
  const p = corpusProvenance();
  console.log(`corpus=${p.source} instruments=${p.instruments} at ${p.hydratedAt}`);
  console.log(`POOL_LEAVES_PER_CHANNEL=${POOL_LEAVES_PER_CHANNEL}`);

  resetGateHydration();
  const before = gateBytes();
  console.log(`phase one: ${before.gates} gates, ${(before.bytes / 1024).toFixed(0)} KB`);
  console.log("\ncountry  pool  phase2 gates  phase2 KB  ms");
  for (const country of (process.env.COUNTRIES ?? "DE,ES,FR,IT").split(",")) {
    resetGateHydration();
    const t0 = Date.now();
    const v = await computeVerdict("TestCo", country, {
      entityCountries: [country], sector: "other", activities: ["none"],
      borrowerModel: "operating", ticketBand: "b500k_2m5", consortium: "yes",
      useOfFunds: ["industrial_research", "experimental_development"],
    } as never, {
      targetMarkets: [country], capitalSought: ["grant", "loan"],
      description: "We build software for industrial automation.",
    } as never);
    const ms = Date.now() - t0;
    const after = gateBytes();
    const ids = (v.candidateInstrumentIds ?? []);
    const pool = ids.length;
    if (process.env.DUMP) {
      writeFileSync(`${process.env.DUMP}/${country}.txt`, [...ids].sort().join("\n") + "\n");
    }
    console.log(`${country.padEnd(7)} ${String(pool).padStart(5)} ` +
      `${String(after.gates - before.gates).padStart(13)} ` +
      `${((after.bytes - before.bytes) / 1024).toFixed(0).padStart(10)} ` +
      `${String(ms).padStart(5)}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
