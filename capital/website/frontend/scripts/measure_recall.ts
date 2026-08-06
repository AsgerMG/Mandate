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
// WHICH SET. The default is the one active set (`scripts/recallSet.ts`), and
// the banner naming it prints on every run. `SET=` still loads a retired set,
// loudly, so a published number stays reproducible -- never quietly.
//
//   npx tsx scripts/measure_recall.ts                       # holdout, both modes
//   SPLIT=tune MODE=profile npx tsx scripts/measure_recall.ts
//   DESCRIBED=1 npx tsx scripts/measure_recall.ts
//   REGION=any npx tsx scripts/measure_recall.ts
//   SET=__recallSet.json npx tsx scripts/measure_recall.ts  # retired, says so
//
// REGION answers the intake's region question, which no other run does. A real
// founder always knows where they are; the harness has to recover it from the
// register (ETL/terms/repair_recall_attribution.py). Two settings, because the
// provenance changes what the number means:
//
//   REGION=strict  only pairs whose region comes from an award under a
//                  DIFFERENT notified scheme. Cannot be circular, covers ~37%.
//   REGION=any     also pairs whose region comes from their own award. The two
//                  agree at NUTS-1 92.1% of the time and rank siblings
//                  identically, which is what licenses the wider population.
//
// That same script also repairs the ANSWER KEY, and without it region cannot be
// measured at all: `scheme_code = call_id` credits an award to every body
// delivering that notified scheme, so for the 24% of holdout pairs whose answer
// sits in a same-name group the shipped label is close to a uniform draw over
// the siblings. Region ranks the won leaf first 24.9% of the time against that
// key and 66.2% against the repaired one -- same rows, same scorer.
//
// DESCRIBED=1 keeps only rows carrying a leak-free real description, which is
// the population the product is actually trying to serve. The active set
// recovers those descriptions from an award under a DIFFERENT regime and
// re-verifies them against `instrument_profiles.profile_text` in Postgres; a
// row whose description sits inside the won fund's own profile is excluded
// rather than counted, because it would grade retrieval on a query copied out
// of the answer. That defect covered 46% of the old set's holdout `project`
// rows and is what `check_recall_leaks.ts` now keeps out of CI.
import { readFileSync } from "fs";

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
import { isDescribed, loadRecallSet } from "./recallSet";

async function main() {
  await hydrateDbInstruments();
  const byId = new Map(loadDbInstruments().map((i) => [i.id, i]));
  const { file: setFile, rows: all } = loadRecallSet();
  const split = process.env.SPLIT ?? "holdout";
  const mode = process.env.MODE;
  // A row whose description leaks into the won fund's profile is excluded from
  // the DESCRIBED population rather than counted as described: it would grade
  // retrieval on a query copied out of the answer. `isDescribed` is shared, so
  // no two harnesses can disagree about which rows that is.
  const described = isDescribed;
  // "strict" restricts the POPULATION as well as the answer, because a pair
  // with no leak-free region is not a pair whose region we withhold — it is one
  // we cannot honestly supply, and scoring it as if the founder had refused to
  // answer would mix two different questions into one number.
  const regionMode = process.env.REGION;
  const regionOf = (r: any): string | undefined =>
    !regionMode ? undefined
      : regionMode === "strict"
        ? (r.regionSource === "other_scheme" ? r.region : undefined)
        : r.region || undefined;
  const set = all.filter((r) => (split === "all" || r.split === split)
                             && (!mode || r.mode === mode)
                             && (!process.env.DESCRIBED || described(r))
                             && (regionMode !== "strict" || Boolean(regionOf(r))));
  const N = Math.min(Number(process.env.N ?? 250), set.length);
  // Stride, not the head of the list.
  //
  // The set is grouped by mode and `project` comes first, so slicing took ALL
  // 131 project pairs and only 69 profile ones -- 66% project against a true
  // population of 16%. Every figure measured this way was the easy third of the
  // corpus: pool read 92% where it is really 74%, EXACT@5 read 49% where it is
  // 35%. Deterministic, so runs stay comparable.
  const step = Math.max(1, Math.floor(set.length / N));
  const sample = set.filter((_, i) => i % step === 0).slice(0, N);

  const stat = { pool: 0, exact5: 0, regime5: 0, chan5: 0, done: 0 };
  const byMode = new Map<string, { n: number; pool: number; e5: number; r5: number }>();
  // The set a row came from, reported separately, because a change can move
  // one population and not the other and the headline hides that. The
  // corrected peer-prior join is the case in point: it costs the rows the
  // ORIGINAL joins could trace and wins far more on the rows they could not.
  const byPop = new Map<string, { n: number; pool: number; e5: number; r5: number }>();
  // ── The anti-overfitting axis ──────────────────────────────────────────────
  // The aggregate is dominated by one shape of company: the won fund sits in a
  // regime of median 76 siblings (p10 12, p90 103, and only 3% of won funds sit
  // in a regime of five or fewer -- `project-mgmt/research/target_arithmetic.md`).
  // A change tuned to that shape can gain three points overall while destroying
  // the founder whose fund stands nearly alone, and the headline will applaud.
  //
  // So report by the size of the group the ranker actually had to order. A
  // signal that only works on crowds is a signal fitted to this corpus's
  // distribution, not to what makes a fund the right one -- and it will break
  // on the next country we load, whose regimes are shaped differently.
  const byRegime = new Map<string, { n: number; pool: number; e5: number; r5: number }>();
  const regimeSize = new Map<string, number>();
  for (const i of loadDbInstruments()) {
    const p = (i as any).parentId ?? i.id;
    regimeSize.set(p, (regimeSize.get(p) ?? 0) + 1);
  }
  const sizeBucket = (n: number) =>
    n <= 1 ? "regime 1 (alone)" : n <= 5 ? "regime 2-5" : n <= 20 ? "regime 6-20"
      : n <= 50 ? "regime 21-50" : "regime 51+";
  for (const t of sample) {
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
      // Where the founder is. Absent unless REGION is set, so every run made
      // before this stays comparable with every run made after it.
      region: regionOf(t),
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
    const popKey = t.traced ? `traced:${t.traced}` : "original join";
    const p = byPop.get(popKey) ?? { n: 0, pool: 0, e5: 0, r5: 0 };
    p.n++; if (inPool) p.pool++; if (e5) p.e5++; if (r5) p.r5++;
    byPop.set(popKey, p);
    const rk = sizeBucket(regimeSize.get(wantRegime) ?? 1);
    const g = byRegime.get(rk) ?? { n: 0, pool: 0, e5: 0, r5: 0 };
    g.n++; if (inPool) g.pool++; if (e5) g.e5++; if (r5) g.r5++;
    byRegime.set(rk, g);
  }
  const pc = (n: number, d = stat.done) => `${n}/${d} (${(100 * n / d).toFixed(0)}%)`;
  console.log(`set=${setFile} split=${split}${mode ? ` mode=${mode}` : ""}` +
              `${process.env.DESCRIBED ? " described-only" : ""}` +
              `${regionMode ? ` region=${regionMode}` : ""}  replayed ${stat.done}`);
  console.log(`  in pool                  ${pc(stat.pool)}`);
  console.log(`  EXACT scheme in top 5    ${pc(stat.exact5)}`);
  console.log(`  same REGIME in top 5     ${pc(stat.regime5)}   <- the operational number`);
  console.log(`  same CHANNEL in top 5    ${pc(stat.chan5)}`);
  const line = (label: string, m: { n: number; pool: number; e5: number; r5: number }) =>
    console.log(`    ${label.padEnd(26)} n=${String(m.n).padStart(4)}  pool ${(100*m.pool/m.n).toFixed(0)}%` +
                `  exact5 ${(100*m.e5/m.n).toFixed(0)}%  regime5 ${(100*m.r5/m.n).toFixed(0)}%`);
  for (const [k, m] of byMode) line(`mode=${k}`, m);
  if (byPop.size > 1) for (const [k, m] of byPop) line(k, m);
  // Ordered smallest group first: the top rows are the founders an
  // overfitted change abandons, and they are the ones to read first.
  const order = ["regime 1 (alone)", "regime 2-5", "regime 6-20", "regime 21-50", "regime 51+"];
  console.log(`  by SIZE OF THE GROUP THE RANKER HAD TO ORDER (overfitting shows here, not above)`);
  for (const k of order) { const m = byRegime.get(k); if (m) line(k, m); }
}
main();
