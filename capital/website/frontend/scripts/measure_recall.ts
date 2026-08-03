// Does retrieval return the fund a company ACTUALLY won?
//
// Ground truth we own: real companies, real awards, replayed as if the company
// were a founder filling in the intake. Row count is not correctness; this is.
//
// TWO MODES, because the corpus supports two different questions and mixing them
// hid both. Measured: state_aid_satr and national_dev_banks have ZERO distinct
// per-project titles per leaf, while horizon_eu_pillar_ii has 534 and eic 438.
//
//   project  a real per-project title as the founder's description. Only EU
//            programmes can be tested this way. Pairs whose title is one of the
//            instrument's own sample_project_titles are excluded at build time:
//            for SATR the "title" IS the scheme's description repeated on every
//            award, which makes the replay circular, and that circularity was
//            reading as 90% recall until it was checked.
//   profile  no project text at all, which is what a national-scheme applicant
//            actually has. Retrieval must work from country and sector alone.
//
// SPLIT ON PURPOSE. `tune` is what a change may be measured against while it is
// being made; `holdout` is not looked at until it is finished. Split by a hash
// of the COMPANY so one company can never appear on both sides.
//
//   npx tsx scripts/measure_recall.ts                       # holdout, both modes
//   SPLIT=tune MODE=profile npx tsx scripts/measure_recall.ts
import { readFileSync } from "fs";
import path from "path";

// Same loader as trace_pool.ts. Without it an unexported shell measures the
// LEXICAL fallback while production ranks on embeddings -- the harness would be
// grading a different system from the one that ships.
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* rely on the process environment */ }
if (process.env.NO_PG) delete process.env.DATABASE_URL;

import { hydrateDbInstruments, loadDbInstruments } from "../lib/intelligence/corpus";
import { computeVerdict } from "../lib/intelligence/pipeline";

async function main() {
  await hydrateDbInstruments();
  const byId = new Map(loadDbInstruments().map((i) => [i.id, i]));
  const all = JSON.parse(readFileSync(
    path.join(process.cwd(), "lib", "intelligence", "__recallSet.json"), "utf8")) as any[];
  const split = process.env.SPLIT ?? "holdout";
  const mode = process.env.MODE;
  const set = all.filter((r) => (split === "all" || r.split === split)
                             && (!mode || r.mode === mode));
  const N = Math.min(Number(process.env.N ?? 250), set.length);

  const stat = { pool: 0, exact5: 0, regime5: 0, chan5: 0, done: 0 };
  const byMode = new Map<string, { n: number; pool: number; e5: number; r5: number }>();
  for (const t of set.slice(0, N)) {
    const v = await computeVerdict("TestCo", t.country, {
      entityCountries: [t.country], sector: t.sector ?? "other", activities: ["none"],
      borrowerModel: "operating", ticketBand: "b500k_2m5", consortium: "yes",
      // What the money is for, and the one field here that could leak.
      //
      // Setting it from the won scheme's registered objective would make the
      // objective signal grade itself -- the same shape as the project-title
      // leak that read 90% and was really 10%.
      // UNIFORM across every pair, which is what makes it leak-free: a constant
      // cannot carry information about which scheme won. It also matches the
      // modal founder this product serves -- someone seeking innovation funding
      // for R&D. Schemes registered under Art. 25(2)(b)/(c) should therefore
      // outrank siblings registered for plant (Art. 17) or renewables (Art. 41).
      useOfFunds: ["industrial_research", "experimental_development"],
    } as never, {
      targetMarkets: [t.country], capitalSought: ["grant", "loan"],
      // A `profile` pair has no PROJECT text -- national schemes carry none --
      // but a real founder still describes themselves on screen one. Passing
      // nothing modelled a founder who typed nothing, which no founder does,
      // and made the mode untestable: semantic matching never ran, so profile
      // richness could not affect it either way.
      description: t.description || t.selfDescription || undefined,
    } as never);
    const pool: string[] = v.candidateInstrumentIds ?? [];
    const top5 = (v.instrumentTable ?? []).slice(0, 5)
      .map((r: any) => r.instrumentId).filter(Boolean) as string[];
    const want = byId.get(t.instrument);
    const wantRegime = want?.parentId ?? t.instrument;
    const inPool = pool.includes(t.instrument);
    const e5 = top5.includes(t.instrument);
    const r5 = top5.some((id) => (byId.get(id)?.parentId ?? id) === wantRegime);
    const c5 = top5.some((id) => byId.get(id)?.sourceFamilyBucket === want?.sourceFamilyBucket);

    stat.done++;
    if (inPool) stat.pool++;
    if (e5) stat.exact5++;
    if (r5) stat.regime5++;
    if (c5) stat.chan5++;
    const m = byMode.get(t.mode) ?? { n: 0, pool: 0, e5: 0, r5: 0 };
    m.n++; if (inPool) m.pool++; if (e5) m.e5++; if (r5) m.r5++;
    byMode.set(t.mode, m);
  }
  const pc = (n: number, d = stat.done) => `${n}/${d} (${(100 * n / d).toFixed(0)}%)`;
  console.log(`split=${split}${mode ? ` mode=${mode}` : ""}  replayed ${stat.done}`);
  console.log(`  in pool                  ${pc(stat.pool)}`);
  console.log(`  EXACT scheme in top 5    ${pc(stat.exact5)}`);
  console.log(`  same REGIME in top 5     ${pc(stat.regime5)}   <- the operational number`);
  console.log(`  same CHANNEL in top 5    ${pc(stat.chan5)}`);
  for (const [k, m] of byMode) {
    console.log(`    mode=${k.padEnd(8)} n=${String(m.n).padStart(4)}  pool ${(100*m.pool/m.n).toFixed(0)}%  exact5 ${(100*m.e5/m.n).toFixed(0)}%  regime5 ${(100*m.r5/m.n).toFixed(0)}%`);
  }
}
main();
