// Does the founder's ticket band change what they are shown?
//
// `measure_recall.ts` cannot answer this: it feeds every replay the same
// `ticketBand`, so a signal that discriminates BY ticket is invisible to it.
// The question has to be asked directly -- vary the one field, hold everything
// else, and look at the size of cheque the shown funds actually write.
//
//   npx tsx scripts/check_ticket_effect.ts
import { readFileSync } from "fs";
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* rely on the process environment */ }
if (process.env.NO_PG) delete process.env.DATABASE_URL;

import { hydrateDbInstruments, loadDbInstruments } from "../lib/intelligence/corpus";
import { computeVerdict } from "../lib/intelligence/pipeline";

const BANDS = ["lt500k", "b500k_2m5", "b2m5_15m", "b15m_50m", "gt50m"];

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
          targetMarkets: [country], capitalSought: ["grant", "loan"],
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
