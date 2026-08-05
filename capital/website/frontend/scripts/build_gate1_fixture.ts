// Run gate 1 ONCE and cache what it produced, so gate 2 can be iterated on
// without recomputing it every time.
//
// ── Why this exists ────────────────────────────────────────────────────────
// Gate 1 (screen one -> candidate subset) takes minutes to replay across the
// holdout split and its output does not change while only the gate-2 prompt is
// being edited. Re-running it for every prompt tweak made each experiment cost
// minutes instead of seconds, which is why gate 2 went untested for so long.
//
// This writes a committed fixture: for each replayed company, the subset gate 1
// handed over, the deterministic top-5 baseline, and everything gate 2 needs to
// read (profiles, gates, names) already resolved. `measure_gate2.ts` then runs
// off the fixture alone -- no DB, no pipeline, no waiting.
//
// Regenerate whenever gate 1 changes. The fixture records the git SHA it was
// built at, so a gate-2 number can always be traced to the gate-1 behaviour it
// was measured against.
//
//   npx tsx scripts/build_gate1_fixture.ts            # 80 holdout companies
//   N=200 SPLIT=tune npx tsx scripts/build_gate1_fixture.ts
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { execSync } from "child_process";
import path from "path";

try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* rely on the process environment */ }

import { hydrateDbInstruments, loadDbInstruments, hydrateGatesFor } from "../lib/intelligence/corpus";
import { computeVerdict } from "../lib/intelligence/pipeline";
import { Client } from "pg";

const SUBSET = Number(process.env.SUBSET ?? 40);
const OUT_DIR = "fixtures";

async function main() {
  await hydrateDbInstruments();
  const insts = loadDbInstruments();
  await hydrateGatesFor(insts.map((i: any) => i.id));
  const byId = new Map(loadDbInstruments().map((i: any) => [i.id, i]));

  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();
  const profiles = new Map<string, string>(
    (await pg.query("SELECT instrument_id, profile_text FROM instrument_profiles")).rows
      .map((r: any) => [r.instrument_id, r.profile_text as string]));
  await pg.end();

  const all = JSON.parse(readFileSync(
    path.join(process.cwd(), "lib", "intelligence", "__recallSet.json"), "utf8")) as any[];
  const split = process.env.SPLIT ?? "holdout";
  const set = all.filter((r) => r.split === split);
  const N = Math.min(Number(process.env.N ?? 80), set.length);
  const step = Math.max(1, Math.floor(set.length / N));
  const sample = set.filter((_, i) => i % step === 0).slice(0, N);

  const cases: any[] = [];
  for (const t of sample) {
    const el: any = {
      entityCountries: [t.country], sector: t.sector ?? "other", activities: ["none"],
      borrowerModel: "operating", ticketBand: "b500k_2m5", consortium: "yes",
      useOfFunds: ["industrial_research", "experimental_development"],
    };
    const v: any = await computeVerdict("TestCo", t.country, el, {
      targetMarkets: [t.country], capitalSought: ["grant", "loan"],
      description: t.description || undefined,
    } as never);
    const ordered: string[] = (v.instrumentTable ?? []).map((r: any) => r.instrumentId).filter(Boolean);
    const pool: string[] = v.candidateInstrumentIds ?? [];
    const subset = [...ordered, ...pool.filter((id) => !ordered.includes(id))].slice(0, SUBSET);

    cases.push({
      name: t.name, country: t.country, sector: t.sector, description: t.description,
      want: t.instrument,
      wantRegime: (byId.get(t.instrument) as any)?.parentId ?? t.instrument,
      baselineTop5: ordered.slice(0, 5),
      poolSize: pool.length,
      subset: subset.map((id) => {
        const inst: any = byId.get(id);
        return {
          id,
          name: inst?.name ?? id,
          body: inst?.administeringBody ?? "",
          channel: inst?.sourceFamilyBucket ?? "",
          country: inst?.country ?? "",
          regime: inst?.parentId ?? id,
          profile: (profiles.get(id) ?? "").slice(0, 500),
          gates: (inst?.gates ?? [])
            .filter((g: any) => !g.gateRole || g.gateRole === "filter")
            .slice(0, 4).map((g: any) => g.requirement).filter(Boolean),
        };
      }),
    });
  }

  let sha = "unknown";
  try { sha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim(); } catch { /* not a checkout */ }
  mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, `gate1_${split}.json`);
  writeFileSync(out, JSON.stringify({ builtAt: new Date().toISOString(), gate1Sha: sha, split, subsetSize: SUBSET, cases }, null, 1));

  const inSubset = cases.filter((c) => c.subset.some((s: any) => s.id === c.want)).length;
  const baseline = cases.filter((c) => c.baselineTop5.includes(c.want)).length;
  console.log(`wrote ${out}  (gate1 @ ${sha})`);
  console.log(`  cases: ${cases.length}`);
  console.log(`  GATE 1 -- right fund inside the subset:  ${inSubset}/${cases.length} = ${(100 * inSubset / cases.length).toFixed(0)}%`);
  console.log(`  GATE 1 -- deterministic top-5 baseline:  ${baseline}/${cases.length} = ${(100 * baseline / cases.length).toFixed(0)}%`);
}

main();
