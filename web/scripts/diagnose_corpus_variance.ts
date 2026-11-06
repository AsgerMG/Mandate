// WHY DID THE SAME MEASUREMENT READ 97% AND 77%?
//
// Replays EXACTLY check_recall_floor.ts's pinned 150-pair tune sample and
// reports pool/EXACT@5/REGIME@5 alongside a description of the corpus the run
// actually ranked on — because on 2026-08-06 that was the whole difference, and
// nothing on screen said so.
//
// The arms exist so the question is answered by SUBTRACTION rather than by a
// plausible story. Each holds the semantic index, the sample and the seed
// fixed and moves one thing:
//
//   CORPUS=pg     hydrate from Postgres — production's path
//   CORPUS=json   hydrate from the committed instrument_terms.json snapshot,
//                 which is what any Postgres failure silently degrades to.
//                 DATABASE_URL is restored immediately after, so semantic
//                 ranking is IDENTICAL between the two arms and cannot be
//                 confounded with the corpus.
//   CORPUS=auto   whatever hydration does unaided (default)
//   FIELDS=a,b    overwrite exactly these fields on the snapshot corpus with
//                 today's Postgres values. This is what named the cause:
//
//     arm                                      pool   mean pool   dead in pool
//     json (snapshot)                          95.3      102          20.3
//       + eventCount,companyCount,totalEur…    95.3      102             —
//       + lastYear / successorScheme           95.3      102             —
//       + JSON gates replaced by PG's          95.3      102             —
//       + schemeEndDate                        75.3     82.8             —
//     pg (production)                          75.3     90.7           1.1
//
//   REPS=n        repeat the measurement n times in one process
//
// Determinism: 8 runs, sequential and concurrent, on one corpus state produced
// byte-identical pool, ranking AND exclusion counts. Retrieval does not vary.
// The corpus underneath it does.

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("diagnose_corpus_variance", ["DATABASE_URL", "VOYAGE_KEY"]);

import { hydrateDbInstruments, loadDbInstruments } from "../lib/intelligence/corpus";
import { ExclusionLog } from "../lib/intelligence/exclusions";
import { isClosed } from "../lib/intelligence/liveness";
import { computeVerdict } from "../lib/intelligence/pipeline";
import { loadRecallSet } from "./recallSet";

const N = Number(process.env.N ?? 150);

function corpusFingerprint() {
  const inst = loadDbInstruments();
  let gates = 0;
  let withGates = 0;
  for (const i of inst) {
    const n = i.gates?.length ?? 0;
    gates += n;
    if (n) withGates++;
  }
  return { instruments: inst.length, gates, withGates };
}

async function main() {
  const mode = process.env.CORPUS ?? "auto";
  const realUrl = process.env.DATABASE_URL;
  if (mode !== "pg" && mode !== "auto") delete process.env.DATABASE_URL;
  const t0 = Date.now();
  await hydrateDbInstruments();
  const hydrateMs = Date.now() - t0;
  process.env.DATABASE_URL = realUrl;

  // ── The isolating arms ───────────────────────────────────────────────────
  // FIELDS=a,b,c overwrites exactly those camelCase fields on the snapshot
  // corpus with today's Postgres values, so a 20-point move is attributable to
  // a named column rather than to "the corpus". "json-nogates" is the mirror
  // for the gate layer: the snapshot with every non-framework gate array
  // emptied, which is the shape the Postgres path actually hands to selection.
  // Gates were the obvious suspect and are ruled out by it — they move the
  // headline not at all.
  const COL: Record<string, string> = {
    eventCount: "event_count", companyCount: "company_count", totalEur: "total_eur",
    schemeEndDate: "scheme_end_date", schemeEndBasis: "scheme_end_date_basis",
    schemeEndDateBasis: "scheme_end_date_basis",
    lastYear: "last_year", sectorMix: "sector_mix",
    deliveryRegion: "delivery_region", deliveryRegionShare: "delivery_region_share",
    awardP50: "award_p50", awardN: "award_n", intensityP50: "intensity_p50",
    administeringBody: "administering_body", schemeOperators: "scheme_operators",
    parentId: "parent_id", country: "country", capitalType: "capital_type",
    sourceFamilyBucket: "source_family_bucket", sampleProjectTitles: "sample_project_titles",
    name: "name", schemeCode: "scheme_code", successorScheme: "successor_scheme",
  };
  const fields = (process.env.FIELDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (fields.length) {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: realUrl });
    await client.connect();
    const res = await client.query('SELECT * FROM funding_instruments ORDER BY id COLLATE "C"');
    await client.end();
    const pgById = new Map(res.rows.map((r: any) => [r.id, r]));
    for (const i of loadDbInstruments()) {
      const r: any = pgById.get(i.id);
      if (!r) continue;
      for (const f of fields) (i as any)[f] = r[COL[f] ?? f] ?? null;
    }
  }
  if (mode === "json-nogates") {
    for (const i of loadDbInstruments()) if (!(i as any).isFramework) i.gates = [];
  }

  // Postgres is the truth about liveness for this measurement, whatever corpus
  // the run itself is ranking on. A row the register says is closed and the
  // table shows anyway is a founder being sent at a deadline that has passed.
  const truthClosed = new Set<string>();
  {
    const { Client } = await import("pg");
    const c2 = new Client({ connectionString: realUrl });
    await c2.connect();
    const r2 = await c2.query(
      `SELECT id, scheme_end_date, scheme_end_date_basis, last_year, successor_scheme
         FROM funding_instruments`);
    await c2.end();
    for (const r of r2.rows as any[]) {
      if (isClosed({ schemeEndDate: r.scheme_end_date, schemeEndBasis: r.scheme_end_date_basis,
                     lastYear: r.last_year, successorScheme: r.successor_scheme })) truthClosed.add(r.id);
    }
  }

  const fp = corpusFingerprint();
  const byId = new Map(loadDbInstruments().map((i) => [i.id, i]));
  const { file, rows: all } = loadRecallSet("wsS probe");
  const tune = all.filter((r) => r.split === "tune");
  const step = Math.max(1, Math.floor(tune.length / N));
  let set = tune.filter((_, i) => i % step === 0).slice(0, N);
  // LIVE_ANSWERS=1 drops pairs whose answer is a fund the register says has
  // CLOSED. Retrieval is right to omit a call whose deadline has passed, so
  // grading it on one measures the age of the answer key, not the ranker. This
  // is a diagnostic filter only — the recall set itself belongs to another
  // workstream and is not touched here.
  const droppedDead = process.env.LIVE_ANSWERS
    ? set.filter((t) => truthClosed.has(t.instrument)).length : 0;
  if (process.env.LIVE_ANSWERS) set = set.filter((t) => !truthClosed.has(t.instrument));

  const reps = Number(process.env.REPS ?? 1);
  for (let rep = 0; rep < reps; rep++) {
    let pool = 0, exact5 = 0, regime5 = 0;
    let poolSize = 0;
    let deadShown = 0, deadInPool = 0, runsWithDeadShown = 0;
    const started = new Date().toISOString();
    const excl: Record<string, number> = {};
    for (const t of set) {
      const log = new ExclusionLog();
      const v = await computeVerdict("TestCo", t.country, {
        entityCountries: [t.country], sector: t.sector ?? "other", activities: ["none"],
        borrowerModel: "operating", ticketBand: "b500k_2m5", consortium: "yes",
        useOfFunds: ["industrial_research", "experimental_development"],
      } as never, {
        capitalSought: ["grant", "loan"],
        description: t.description || t.selfDescription || undefined,
        log,
      } as never);
      for (const [k, n] of Object.entries(log.countsByRule())) excl[k] = (excl[k] ?? 0) + n;
      const ids = v.candidateInstrumentIds ?? [];
      poolSize += ids.length;
      const top5 = (v.instrumentTable ?? []).slice(0, 5)
        .map((r: any) => r.instrumentId).filter(Boolean) as string[];
      const d5 = top5.filter((id) => truthClosed.has(id)).length;
      deadShown += d5;
      if (d5) runsWithDeadShown++;
      deadInPool += ids.filter((id) => truthClosed.has(id)).length;
      const wantRegime = byId.get(t.instrument)?.parentId ?? t.instrument;
      if (ids.includes(t.instrument)) pool++;
      if (top5.includes(t.instrument)) exact5++;
      if (top5.some((id) => (byId.get(id)?.parentId ?? id) === wantRegime)) regime5++;
    }
    const pc = (n: number) => ((100 * n) / set.length).toFixed(1);
    console.log(JSON.stringify({
      rep, mode, started, finished: new Date().toISOString(), hydrateMs,
      pid: process.pid, fields: process.env.FIELDS ?? "", set: file, n: set.length,
      pool: Number(pc(pool)), exact5: Number(pc(exact5)), regime5: Number(pc(regime5)),
      meanPoolSize: Number((poolSize / set.length).toFixed(1)),
      corpus: fp, excl, droppedDeadAnswers: droppedDead,
      // What a founder would be shown that the register says has closed.
      deadShownPerFounder: Number((deadShown / set.length).toFixed(2)),
      foundersShownADeadCall: Number(((100 * runsWithDeadShown) / set.length).toFixed(1)),
      deadInPoolPerFounder: Number((deadInPool / set.length).toFixed(1)),
    }));
  }
}

main();
