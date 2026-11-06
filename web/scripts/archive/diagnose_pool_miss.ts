// WHY does the fund a company actually won never reach the pool?
//
// Measured on a representative sample, `profile` mode -- the national-scheme
// founder with no project text, and 84% of the corpus -- reaches the pool 61%
// of the time. Nothing downstream can recover the other 39%: ranking cannot
// order a candidate that was never a candidate.
//
// Five ranking experiments in this session moved that number by zero, because
// they were all tuning the order of a set that was missing the answer. This
// script changes nothing. It replays real misses and reports which rule removed
// the won fund, so the next change is aimed by evidence rather than guessed.
//
//   npx tsx scripts/diagnose_pool_miss.ts            # profile mode, n=120
//   MODE=project N=60 npx tsx scripts/diagnose_pool_miss.ts

import { loadEnvLocal, requireCredentials } from "../loadEnv";

loadEnvLocal();
requireCredentials("diagnose_pool_miss", ["DATABASE_URL", "VOYAGE_KEY"]);

import { hydrateDbInstruments, loadDbInstruments } from "../../lib/intelligence/corpus";
import { selectInstrumentRows, materialiseInstrumentTable } from "../../lib/intelligence/shortlist";
import { ExclusionLog } from "../../lib/intelligence/exclusions";
import { loadRecallSet } from "../recallSet";

async function main() {
  await hydrateDbInstruments();
  const byId = new Map(loadDbInstruments().map((i) => [i.id, i]));
  const { rows: all } = loadRecallSet();
  const mode = process.env.MODE ?? "profile";
  const set = all.filter((r) => r.split === "holdout" && r.mode === mode);
  const N = Math.min(Number(process.env.N ?? 120), set.length);
  const step = Math.max(1, Math.floor(set.length / N));
  const sample = set.filter((_, i) => i % step === 0).slice(0, N);

  const why = new Map<string, number>();
  const detailFor = new Map<string, string>();
  let hit = 0, missNoRecord = 0;
  const channelOf = new Map<string, number>();
  const noRecordEx: string[] = [];

  for (const t of sample) {
    const log = new ExclusionLog();
    const input = {
      fieldChannels: new Set<string>(),
      founderCountries: [t.country],
      capitalSought: ["grant", "loan"],
      ticketBand: "b500k_2m5",
      consortiumOk: true,
      description: t.description || undefined,
      founderSector: t.sector ?? "other",
      useOfFunds: ["industrial_research", "experimental_development"],
      log,
    } as never;
    const rows = materialiseInstrumentTable(selectInstrumentRows(input), input);
    const pool = rows.map((r: any) => r.instrumentId).filter(Boolean) as string[];
    if (pool.includes(t.instrument)) { hit++; continue; }

    // The won fund is absent. Did anything record removing it?
    const ev = log.all().filter((e) => e.subject === t.instrument);
    const want = byId.get(t.instrument);
    if (ev.length) {
      for (const e of ev) {
        why.set(e.ruleId, (why.get(e.ruleId) ?? 0) + 1);
        if (e.detail && !detailFor.has(e.ruleId)) detailFor.set(e.ruleId, e.detail);
      }
    } else {
      // Nothing logged it. Either its whole CHANNEL was dropped, or it was
      // never loaded at all -- two very different problems.
      const ch = want?.sourceFamilyBucket ?? "(unknown)";
      const chEv = log.all().filter((e) => e.subject === ch);
      if (!want) {
        why.set("NOT-IN-CORPUS", (why.get("NOT-IN-CORPUS") ?? 0) + 1);
      } else if (chEv.length) {
        why.set(`CHANNEL-DROPPED:${chEv[0].ruleId}`,
                (why.get(`CHANNEL-DROPPED:${chEv[0].ruleId}`) ?? 0) + 1);
      } else {
        missNoRecord++;
        why.set("UNRECORDED", (why.get("UNRECORDED") ?? 0) + 1);
        channelOf.set(ch, (channelOf.get(ch) ?? 0) + 1);
        if (noRecordEx.length < 6) {
          noRecordEx.push(`${t.instrument}  [${ch}]  ${want.country}  ` +
            `${(want.name ?? "").slice(0, 38)}`);
        }
      }
    }
  }

  const miss = sample.length - hit;
  console.log(`mode=${mode} holdout  replayed ${sample.length}`);
  console.log(`  reached the pool   ${hit}  (${(100 * hit / sample.length).toFixed(0)}%)`);
  console.log(`  MISSED             ${miss}\n`);
  console.log("  why the won fund was absent:");
  for (const [k, n] of [...why.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(n).padStart(4)}  ${k}`);
    const d = detailFor.get(k);
    if (d) console.log(`          e.g. ${d.slice(0, 88)}`);
  }
  if (missNoRecord) {
    console.log(`\n  UNRECORDED means it was in the corpus, its channel survived,`);
    console.log(`  and nothing logged removing it -- a silent drop. By channel:`);
    for (const [c, n] of [...channelOf.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${String(n).padStart(4)}  ${c}`);
    }
    console.log("  examples:");
    for (const e of noRecordEx) console.log(`    ${e}`);
  }
}

main();
