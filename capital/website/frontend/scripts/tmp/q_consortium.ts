import { Client } from "pg";
import { loadEnvLocal } from "../loadEnv";
loadEnvLocal();
async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const r = await c.query(`
    SELECT value_spec::json->>'field' AS field, count(*)::int AS specs,
           count(distinct instrument_id)::int AS insts
    FROM eligibility_gates
    WHERE value_spec IS NOT NULL AND value_spec <> '' AND value_spec::json->>'field' IS NOT NULL
    GROUP BY 1 ORDER BY 2 DESC`);
  console.table(r.rows);
  const cons = await c.query(`
    SELECT instrument_id, gate_role, left(requirement,90) AS req, value_spec
    FROM eligibility_gates WHERE value_spec IS NOT NULL AND value_spec <> ''
      AND value_spec::json->>'field' = 'consortium' LIMIT 30`);
  console.log("\nconsortium specs:", cons.rowCount);
  for (const row of cons.rows) console.log(row.instrument_id, "|", row.gate_role, "|", row.value_spec, "|", row.req);
  await c.end();
}
main();
