// Does the founder's ticket band change what they are shown?
//
// Renamed from `check_ticket_effect` on 2026-08-08. It prints a table and
// asserts nothing -- there is no threshold here and no exit code that means
// "wrong" -- so the `check_` prefix made a measurement indistinguishable from a
// guard in every listing, and an audit for guards that never run had to open it
// to find out which it was. `measure_*` is what this repo calls the other
// eighteen scripts that do exactly this.
//
// `measure_recall.ts` cannot answer this: it feeds every replay the same
// `ticketBand`, so a signal that discriminates BY ticket is invisible to it.
// The question has to be asked directly -- vary the one field, hold everything
// else, and look at the size of cheque the shown funds actually write.
//
//   npx tsx scripts/measure_ticket_effect.ts
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("measure_ticket_effect", ["DATABASE_URL", "VOYAGE_KEY"]);

import { hydrateDbInstruments, loadDbInstruments } from "../lib/intelligence/corpus";
import { computeVerdict } from "../lib/intelligence/pipeline";

import { TICKET_BANDS } from "../lib/intelligence/types";

// Derived, never listed: a hand-written copy here would keep sweeping the bands
// the intake USED to offer, and would report a clean sweep across a scale no
// founder is shown any more.
const BANDS = TICKET_BANDS.map((b) => b.value);

async function main() {
  await hydrateDbInstruments();
  const byId = new Map(loadDbInstruments().map((i) => [i.id, i]));
  const countries = ["DE", "FR", "IT", "NL"];
  const sectors = ["software_data_ai", "industrial_manufacturing", "health_biotech"];

  console.log("mean awardP50 of the five shown rows, by ticket band\n");
  const header = ["country|sector".padEnd(34), ...BANDS.map((b) => b.padStart(12))].join("");
  console.log(header);
  const perBand = new Map<string, number[]>();
  const rowsByBand = new Map<string, string[][]>();
  for (const country of countries) {
    for (const sector of sectors) {
      const cells: string[] = [];
      for (const band of BANDS) {
        const v = await computeVerdict("TestCo", country, {
          entityCountries: [country], sector, activities: ["none"],
          borrowerModel: "operating", ticketBand: band, consortium: "yes",
          useOfFunds: ["industrial_research", "experimental_development"],
        } as never, {
          capitalSought: ["grant", "loan"],
          description: "We develop and commercialise software, data and AI products. "
            + "We are seeking public funding for research and development work.",
        } as never);
        const ids = (v.instrumentTable ?? []).slice(0, 5)
          .map((r: any) => r.instrumentId).filter(Boolean) as string[];
        const meds = ids.map((id) => byId.get(id)?.awardP50)
          .filter((x): x is number => typeof x === "number" && x > 0);
        const m = meds.length ? meds.reduce((a, b) => a + b, 0) / meds.length : 0;
        cells.push(m ? `${Math.round(m).toLocaleString()}` : "-");
        (perBand.get(band) ?? perBand.set(band, []).get(band)!).push(m);
        (rowsByBand.get(band) ?? rowsByBand.set(band, []).get(band)!).push(ids);
      }
      console.log(`${country}|${sector}`.padEnd(34) + cells.map((c) => c.padStart(12)).join(""));
    }
  }
  console.log("\nacross all 12 profiles:");
  for (const b of BANDS) {
    const v = perBand.get(b) ?? [];
    console.log(`  ${b.padEnd(12)} mean awardP50 ${Math.round(
      v.reduce((a, c) => a + c, 0) / v.length).toLocaleString().padStart(12)}`);
  }
  // How many of the five actually differ between the smallest and largest ask.
  const lo = rowsByBand.get("lt500k") ?? [], hi = rowsByBand.get("gt50m") ?? [];
  let differ = 0, total = 0;
  for (let i = 0; i < lo.length; i++) {
    const s = new Set(lo[i]);
    differ += hi[i].filter((id) => !s.has(id)).length;
    total += hi[i].length;
  }
  console.log(`\nrows differing between the smallest and largest ask: ${differ}/${total}`);
}
main();
