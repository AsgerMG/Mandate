/**
 * What the offer-route axis costs, read OUT OF POSTGRES.
 *
 * FREE — no model calls.
 *
 * Reports where the axis is applied, that no withheld row is publishable, and
 * the publishable count. Re-opening a row moves the sibling class the WRONG
 * way, because the denominator grows faster than the discrimination does; that
 * is expected and correct, and `measure_country_class.ts` is where it is read.
 *
 * Uses `publishableInstruments()` itself, not a reproduction of it in SQL:
 * `measure_country_class.ts` reproduces the predicate and omits `meetsDataFloor`,
 * so its absolute count runs ~18 rows high. For a before/after on publishability
 * the only trustworthy source is the function the product calls.
 *
 * Run: npx tsx scripts/measure_offer_route.ts
 */
import {
  hydrateDbInstruments, requireLiveCorpus, corpusProvenance,
  loadDbInstruments, publishableInstruments,
} from "../../lib/intelligence/corpus";
import { ROUTE_STATUS } from "../../lib/intelligence/offerRoute";

import { loadEnvLocal, requireCredentials } from "../loadEnv";

loadEnvLocal();
requireCredentials("measure_offer_route", ["DATABASE_URL"]);

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("measure_offer_route");
  const p = corpusProvenance();
  console.log(`corpus: ${p.source}, ${p.instruments} instruments\n`);

  const all = loadDbInstruments();
  const pub = publishableInstruments();
  const pubIds = new Set(pub.map((i) => i.id));

  const byStatus = new Map<string, number>();
  for (const i of all) {
    const k = i.routeStatus ?? "(null)";
    byStatus.set(k, (byStatus.get(k) ?? 0) + 1);
  }
  console.log("route_status over the whole corpus");
  for (const [k, v] of [...byStatus].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(12)} ${String(v).padStart(5)}`);
  }
  const withheld = all.filter((i) => i.routeStatus === ROUTE_STATUS.none);
  console.log(`\nwithheld as not-an-offer: ${withheld.length}`);
  for (const i of withheld) console.log(`  ${i.id.padEnd(24)} ${i.name}`);
  const leaked = withheld.filter((i) => pubIds.has(i.id));
  console.log(leaked.length
    ? `\n!! ${leaked.length} withheld rows are PUBLISHABLE: ${leaked.map((i) => i.id).join(", ")}`
    : "\nnone of them is publishable — the axis is doing its job");

  // Sibling class is NOT recomputed here. `measure_country_class.ts` owns it,
  // reads it from Postgres, and has now been taught this axis. A third
  // implementation keyed on slightly different columns is exactly the drift
  // this workstream is cleaning up -- and it cannot be computed from
  // `DbInstrument` anyway, which does not carry `eligibility_text`.
  console.log(`\npublishable          ${pub.length}`);
  console.log("sibling class        npx tsx scripts/measure_country_class.ts");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
