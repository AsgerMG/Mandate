// Phase 2a: what outranks the fund a company actually won?
import { readFileSync } from "fs";
import { hydrateDbInstruments, loadDbInstruments } from "../lib/intelligence/corpus";
import { computeVerdict } from "../lib/intelligence/pipeline";
async function main() {
  await hydrateDbInstruments();
  const byId = new Map(loadDbInstruments().map((i) => [i.id, i]));
  const truth = JSON.parse(readFileSync("/tmp/ground_truth.json", "utf8")) as any[];
  const N = Number(process.env.N ?? 40);
  const aboveChannel = new Map<string, number>();
  const rightChannel = new Map<string, number>();
  let sameChannelAbove = 0, cases = 0;
  for (const t of truth.slice(0, N)) {
    const v = await computeVerdict("TestCo", t.country, {
      entityCountries: [t.country], sector: t.sector ?? "other", activities: ["none"],
      borrowerModel: "operating", ticketBand: "b500k_2m5", consortium: "yes",
    } as never, { targetMarkets: [t.country], capitalSought: ["grant","loan"], description: t.description } as never);
    const pool: string[] = v.candidateInstrumentIds ?? [];
    const idx = pool.indexOf(t.instrument);
    if (idx < 6) continue;              // already shown
    if (idx < 0) continue;              // never considered
    cases++;
    const right = byId.get(t.instrument);
    if (right?.sourceFamilyBucket) rightChannel.set(right.sourceFamilyBucket, (rightChannel.get(right.sourceFamilyBucket) ?? 0) + 1);
    for (const id of pool.slice(0, 6)) {
      const inst = byId.get(id);
      const ch = inst?.sourceFamilyBucket ?? "?";
      aboveChannel.set(ch, (aboveChannel.get(ch) ?? 0) + 1);
      if (ch === right?.sourceFamilyBucket) sameChannelAbove++;
    }
  }
  const top = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([k, n]) => `${k}:${n}`).join("  ");
  console.log(`cases where the right fund is in the pool but below rank 6: ${cases}`);
  console.log(`\nchannels of the SIX SHOWN rows:      ${top(aboveChannel)}`);
  console.log(`channels of the RIGHT fund:          ${top(rightChannel)}`);
  console.log(`\nshown rows in the SAME channel as the right fund: ${sameChannelAbove} of ${cases*6}`);
}
main();
