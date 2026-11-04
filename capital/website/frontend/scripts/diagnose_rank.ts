// The fund reaches the pool, and is not in the five rows. WHERE does it sit,
// and what is above it?
//
// ── The premise below is RETIRED (2026-08-06, workstream K) ────────────────
// This opened "the fund reaches the pool 97% of the time" and "the pool
// question is closed (SEL-LEAF-CAP, fixed by raising the cap)". Both are now
// false and the second is the more expensive of the two:
//
//   the 97%   came from a STRIDE-sampled n=200 run. The sampler aliased
//             against the set's ordering (95f5fce) and the harness decayed
//             along a run (dac300a). It is not reproducible by any unbiased
//             draw.
//   measured  holdout, seeded shuffle, n=600, three seeds, leak-free index:
//             pool 75%, and 60% on the regime-51+ population that is most of
//             the corpus.
//
// So this script's question is still worth asking, and it is no longer the
// ONLY question: a quarter of won funds are not in the pool to be ranked. See
// project-mgmt/findings/leak_audit_wsK.md -- the cause of the fall is recorded
// as unresolved, and it is measurably not the leak that workstream closed.
//
// No changes -- evidence only, because five weight changes in one session
// moved nothing.
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("diagnose_rank", ["DATABASE_URL", "VOYAGE_KEY"]);
import { hydrateDbInstruments, loadDbInstruments } from "../lib/intelligence/corpus";
import { selectInstrumentRows, materialiseInstrumentTable } from "../lib/intelligence/shortlist";
import { loadRecallSet } from "./recallSet";

async function main() {
  await hydrateDbInstruments();
  const byId = new Map(loadDbInstruments().map((i) => [i.id, i]));
  const { rows: all } = loadRecallSet();
  const set = all.filter((r) => r.split === "holdout" && r.mode === (process.env.MODE ?? "profile"));
  const N = Math.min(Number(process.env.N ?? 100), set.length);
  const step = Math.max(1, Math.floor(set.length / N));
  const sample = set.filter((_, i) => i % step === 0).slice(0, N);

  const buckets = new Map<string, number>();
  const aboveChannel = new Map<string, number>();
  const sameChannelAbove: number[] = [];
  let notInPool = 0, top5 = 0;
  const ranks: number[] = [];

  for (const t of sample) {
    const input = {
      fieldChannels: new Set<string>(), founderCountries: [t.country],
      capitalSought: ["grant", "loan"], ticketBand: "b500k_2m5", consortiumOk: true,
      description: t.description || undefined, founderSector: t.sector ?? "other",
      useOfFunds: ["industrial_research", "experimental_development"],
    } as never;
    const rows = materialiseInstrumentTable(selectInstrumentRows(input), input);
    const ids = rows.map((r: any) => r.instrumentId).filter(Boolean) as string[];
    const at = ids.indexOf(t.instrument);
    if (at < 0) { notInPool++; continue; }
    if (at < 5) { top5++; continue; }
    ranks.push(at + 1);
    const b = at < 10 ? "6-10" : at < 20 ? "11-20" : at < 40 ? "21-40" : "41+";
    buckets.set(b, (buckets.get(b) ?? 0) + 1);
    const wantCh = byId.get(t.instrument)?.sourceFamilyBucket;
    let same = 0;
    for (const id of ids.slice(0, 5)) {
      const ch = byId.get(id)?.sourceFamilyBucket ?? "?";
      aboveChannel.set(ch, (aboveChannel.get(ch) ?? 0) + 1);
      if (ch === wantCh) same++;
    }
    sameChannelAbove.push(same);
  }
  const med = (a: number[]) => a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0;
  console.log(`replayed ${sample.length}  |  top5 ${top5}  below-5 ${ranks.length}  no-pool ${notInPool}`);
  console.log(`\nwhere the won fund actually sits (when in pool, below 5):`);
  console.log(`  median rank ${med(ranks)}   worst ${Math.max(...ranks, 0)}`);
  for (const [k, n] of [...buckets].sort()) console.log(`    ${String(n).padStart(3)}  rank ${k}`);
  console.log(`\nchannel of the 5 rows shown INSTEAD:`);
  const tot = [...aboveChannel.values()].reduce((a, b) => a + b, 0);
  for (const [k, n] of [...aboveChannel].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log(`    ${String(Math.round(100 * n / tot)).padStart(3)}%  ${k}`);
  }
  const sc = sameChannelAbove.filter((x) => x > 0).length;
  console.log(`\nof those misses, ${sc}/${sameChannelAbove.length} had a SIBLING from the`);
  console.log(`same channel shown instead -- i.e. right regime, wrong scheme.`);
}
main();
