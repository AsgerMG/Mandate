// wsEO — which definition of "says nothing" gives 134? Reported, not guessed.
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
delete process.env.ANTHROPIC_API_KEY;
requireCredentials("wsey_variants", ["DATABASE_URL"]);

import {
  hydrateDbInstruments, hydrateGatesFor, loadDbInstruments, publishableInstruments,
  requireLiveCorpus,
} from "../lib/intelligence/corpus";
import OBJECTIVES from "../lib/intelligence/__objectives.json";

const objectives = OBJECTIVES as Record<string, { useOfFunds?: string[] }>;

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("wsey_variants");
  const all = loadDbInstruments();
  await hydrateGatesFor(all.map((i) => i.id));
  const open = publishableInstruments();
  const ids = open.map((i) => i.id);
  const { Client } = await import("pg");
  const cl = new Client({ connectionString: process.env.DATABASE_URL });
  await cl.connect();
  const set = async (sql: string) => new Set(
    (await cl.query(sql, [ids])).rows.map((r: { instrument_id: string }) => r.instrument_id));

  const variants: [string, Set<string>][] = [
    ["own G5 only", await set(
      `SELECT DISTINCT instrument_id FROM eligibility_gates
        WHERE instrument_id = ANY($1) AND gate_family = 'G5_use_of_funds'`)],
    ["own G5 filter", await set(
      `SELECT DISTINCT instrument_id FROM eligibility_gates
        WHERE instrument_id = ANY($1) AND gate_family = 'G5_use_of_funds'
          AND gate_role = 'filter'`)],
    ["own useOfFunds filter", await set(
      `SELECT DISTINCT instrument_id FROM eligibility_gates
        WHERE instrument_id = ANY($1) AND gate_role = 'filter'
          AND intake_field_resolved = 'useOfFunds'`)],
    ["own useOfFunds filter w/ value_spec", await set(
      `SELECT DISTINCT instrument_id FROM eligibility_gates
        WHERE instrument_id = ANY($1) AND gate_role = 'filter'
          AND intake_field_resolved = 'useOfFunds' AND value_spec IS NOT NULL`)],
  ];
  const desc = new Set(open.filter((i) => (i.description ?? "").trim()).map((i) => i.id));
  const obj = new Set(open.filter((i) => (objectives[i.id]?.useOfFunds?.length ?? 0) > 0).map((i) => i.id));
  console.log(`open=${open.length} described=${desc.size} objective=${obj.size}`);
  for (const [label, s] of variants) {
    const mute = ids.filter((i) => !desc.has(i) && !s.has(i) && !obj.has(i));
    console.log(`  scope-gate := ${label.padEnd(38)} present=${String(s.size).padStart(4)}  ` +
      `mute=${mute.length}`);
  }
  // The positive/negative balance of the encoded layer, corpus-wide and open-only.
  for (const [label, where] of [["corpus", ""], ["open pool", "AND g.instrument_id = ANY($1)"]] as const) {
    const r = await cl.query(
      `SELECT COALESCE(value_spec::json->>'op','(none)') AS op, COUNT(*)::int AS n
         FROM eligibility_gates g WHERE value_spec IS NOT NULL ${where}
        GROUP BY 1 ORDER BY 2 DESC`, where ? [ids] : []);
    console.log(`\n${label} comparators: ` +
      r.rows.map((x: { op: string; n: number }) => `${x.op}=${x.n}`).join(" "));
  }
  await cl.end();
}
main();
