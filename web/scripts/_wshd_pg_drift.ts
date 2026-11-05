/**
 * READ ONLY. Does the store the funnel actually reads hold the 63 gates the
 * wsGU corrections were written against?
 *
 * The corrections were authored against the committed snapshot
 * (`public/data/instrument_terms.json`) and `_wsgu_counterfactual.ts` measures
 * them there. `npm run stages` reads POSTGRES. wsHC has since measured that the
 * two stores do not hold the same gate table, so "the correction matches the
 * snapshot" is not evidence that it matches the store a founder is served from.
 * This asks the store directly, and it only ever SELECTs.
 *
 * It also answers the question the funnel's own aggregate report deliberately
 * cannot: WHICH funds the proposal is about, and how many founders in the
 * funnel's population won one of them. `measure_funnel.ts` is aggregate-only by
 * construction — no won-fund id leaves that process — so the attribution lives
 * here, where the population is the answer key and nothing is published.
 *
 *   cd web && npx tsx scripts/_wshd_pg_drift.ts
 *   cd web && npx tsx scripts/_wshd_pg_drift.ts --winners
 */
import { readFileSync } from "fs";
import path from "path";

import { loadEnvLocal, requireCredentials } from "./loadEnv";
import { isDescribed, loadRecallSet, type RecallRow } from "./recallSet";

loadEnvLocal();
delete process.env.ANTHROPIC_API_KEY;
// The whole question here is what POSTGRES holds — the header says so twice.
// Undeclared, a run without the key would have read the committed snapshot and
// answered a question about the store it exists to distinguish itself from.
requireCredentials("wshd_pg_drift", ["DATABASE_URL"]);

const CORRECTIONS = path.join("..", "capital", "project-mgmt", "evidence",
  "wsgu_gate_encoding_corrections_2026-08-13.jsonl");

interface Correction {
  instrument_id: string;
  gate_key: string;
  action: string;
  current_value_spec: unknown;
  proposed_value_spec: unknown;
}

/** Key order is not part of a comparator's identity. */
const canon = (o: unknown): string => {
  if (o === null || o === undefined) return "null";
  const v = typeof o === "string" ? JSON.parse(o) : o;
  return JSON.stringify(v, Object.keys(v as object).sort());
};

/** How many founders of the funnel's own population won a fund one of these
 *  corrections touches. Held out, described, one per company — the same three
 *  restrictions `measure_funnel` applies, so the counts are commensurable with
 *  its rows rather than with a different draw. */
function winners(corrections: Correction[]): void {
  const { rows } = loadRecallSet("wshd winners");
  const seen = new Set<string>();
  const population = (rows as RecallRow[])
    .filter((r) => r.split === "holdout" && isDescribed(r))
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((r) => (seen.has(r.name) ? false : (seen.add(r.name), true)));
  const wonBy = new Map<string, number>();
  for (const r of population) wonBy.set(r.instrument, (wonBy.get(r.instrument) ?? 0) + 1);

  const byInstrument = new Map<string, { gates: number; won: number }>();
  for (const c of corrections) {
    const e = byInstrument.get(c.instrument_id) ?? { gates: 0, won: wonBy.get(c.instrument_id) ?? 0 };
    e.gates += 1;
    byInstrument.set(c.instrument_id, e);
  }
  const ranked = [...byInstrument].sort((a, b) => b[1].won - a[1].won);
  const reach = ranked.filter(([, e]) => e.won > 0);
  console.log(`\n${population.length} founders in the funnel's population `
    + `(holdout, described, one per company)`);
  console.log(`${byInstrument.size} instruments carry the ${corrections.length} corrections; `
    + `${reach.length} of them were won by somebody in that population`);
  console.log(`${reach.reduce((a, [, e]) => a + e.won, 0)} founders won a fund this proposal `
    + `touches — the ceiling on what it can move, before any gate is evaluated\n`);
  for (const [id, e] of ranked) {
    console.log(`  ${String(e.won).padStart(4)} founders  ${String(e.gates).padStart(2)} gate(s)  ${id}`);
  }
}

async function main() {
  if (process.argv.includes("--winners")) {
    const corrections = readFileSync(path.join(process.cwd(), CORRECTIONS), "utf8")
      .split("\n").filter(Boolean).map((l) => JSON.parse(l) as Correction);
    winners(corrections);
    return;
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("_wshd_pg_drift: no DATABASE_URL — this question is about Postgres");
  const corrections = readFileSync(path.join(process.cwd(), CORRECTIONS), "utf8")
    .split("\n").filter(Boolean).map((l) => JSON.parse(l) as Correction);

  const { Client } = await import("pg");
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    const total = await client.query("SELECT COUNT(*)::int AS n FROM eligibility_gates");
    console.log(`postgres holds ${total.rows[0].n.toLocaleString()} gate rows`);

    const ids = [...new Set(corrections.map((c) => c.instrument_id))];
    const res = await client.query(
      `SELECT instrument_id, gate_key, value_spec, encoding_method
         FROM eligibility_gates WHERE instrument_id = ANY($1::text[])`, [ids]);
    const held = new Map<string, { spec: string | null; method: string | null }>();
    for (const r of res.rows) {
      held.set(`${r.instrument_id} ${r.gate_key}`,
        { spec: r.value_spec, method: r.encoding_method });
    }

    let match = 0;
    const missing: string[] = [];
    const drifted: string[] = [];
    const alreadyApplied: string[] = [];
    for (const c of corrections) {
      const got = held.get(`${c.instrument_id} ${c.gate_key}`);
      if (!got) { missing.push(`${c.instrument_id} [${c.gate_key}]`); continue; }
      if (canon(got.spec) === canon(c.current_value_spec)) { match += 1; continue; }
      if (canon(got.spec) === canon(c.proposed_value_spec)) {
        alreadyApplied.push(`${c.instrument_id} [${c.gate_key}]`); continue;
      }
      drifted.push(`${c.instrument_id} [${c.gate_key}]: postgres holds ${got.spec}, `
        + `written against ${JSON.stringify(c.current_value_spec)}`);
    }
    console.log(`${corrections.length} corrections: ${match} match postgres exactly, `
      + `${alreadyApplied.length} already applied, ${drifted.length} drifted, `
      + `${missing.length} absent`);
    for (const m of missing) console.log(`  ABSENT   ${m}`);
    for (const d of drifted) console.log(`  DRIFTED  ${d}`);
    for (const a of alreadyApplied) console.log(`  APPLIED  ${a}`);
    process.exitCode = (drifted.length || missing.length) ? 1 : 0;
  } finally {
    await client.end();
  }
}

main();
