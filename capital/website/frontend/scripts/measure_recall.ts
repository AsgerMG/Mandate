// Does retrieval return the fund a company ACTUALLY won?
//
// Ground truth is the only kind we own that cannot be argued with: real
// companies, real awards, replayed as if they were founders filling in the
// intake. Row count is not correctness; this is.
//
// SPLIT ON PURPOSE. `tune` is what a change may be measured against while it is
// being made; `holdout` is never looked at until the change is finished. Fitting
// a ranking to the set you keep checking is how you get a number that only
// works on this database. Split by a hash of the COMPANY, so the same company
// can never appear on both sides.
//
// The set is capped at 12 pairs per instrument and includes national schemes
// recovered via scheme_code -> call_id, which funding_instrument_sources cannot
// express. Without that half, the measure would only cover EU programmes and
// would quietly push the product toward them.
//
//   npx tsx scripts/measure_recall.ts                 # holdout (the real number)
//   SPLIT=tune npx tsx scripts/measure_recall.ts      # while iterating
//   SPLIT=all N=400 npx tsx scripts/measure_recall.ts
import { readFileSync } from "fs";
import path from "path";
import { hydrateDbInstruments } from "../lib/intelligence/corpus";
import { computeVerdict } from "../lib/intelligence/pipeline";

async function main() {
  await hydrateDbInstruments();
  const all = JSON.parse(readFileSync(
    path.join(process.cwd(), "lib", "intelligence", "__recallSet.json"), "utf8")) as any[];
  const want = process.env.SPLIT ?? "holdout";
  const set = want === "all" ? all : all.filter((r) => r.split === want);
  const N = Math.min(Number(process.env.N ?? 250), set.length);

  const ranks: number[] = [];
  const missByChannel = new Map<string, number>();
  let done = 0;
  for (const t of set.slice(0, N)) {
    const v = await computeVerdict("TestCo", t.country, {
      entityCountries: [t.country], sector: t.sector ?? "other", activities: ["none"],
      borrowerModel: "operating", ticketBand: "b500k_2m5", consortium: "yes",
    } as never, {
      targetMarkets: [t.country], capitalSought: ["grant", "loan"], description: t.description,
    } as never);
    const pool: string[] = v.candidateInstrumentIds ?? [];
    done++;
    const r = pool.indexOf(t.instrument);
    if (r >= 0) ranks.push(r + 1);
    else {
      const ch = t.instrument.split("__")[0];
      missByChannel.set(ch, (missByChannel.get(ch) ?? 0) + 1);
    }
  }
  const at = (k: number) => ranks.filter((x) => x <= k).length;
  const p = (n: number) => `${n}/${done} (${(100 * n / done).toFixed(0)}%)`;
  ranks.sort((a, b) => a - b);
  console.log(`split=${want}  replayed ${done} real recipients`);
  console.log(`  in pool     ${p(ranks.length)}`);
  console.log(`  recall@3    ${p(at(3))}`);
  console.log(`  recall@5    ${p(at(5))}`);
  console.log(`  recall@10   ${p(at(10))}`);
  console.log(`  median rank ${ranks[Math.floor(ranks.length / 2)] ?? "-"}`);
  const worst = [...missByChannel].sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (worst.length) console.log(`  never considered, by fund: ${worst.map(([k, n]) => `${k}:${n}`).join("  ")}`);
}
main();
