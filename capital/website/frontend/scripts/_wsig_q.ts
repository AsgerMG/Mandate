import { Client } from "pg";
import { loadEnvLocal } from "./loadEnv";
loadEnvLocal();
const c = new Client({ connectionString: process.env.DATABASE_URL });
const J = `nullif(value_spec,'')::jsonb`;
(async () => {
  await c.connect();
  console.log("total gates:", (await c.query(`select count(*)::int n from eligibility_gates`)).rows[0].n);
  console.table((await c.query(`select ${J}->>'op' op, count(*)::int n from eligibility_gates where value_spec is not null and value_spec<>'' group by 1 order by 2 desc`)).rows);
  console.log("=== NUMERIC by field/op ===");
  console.table((await c.query(`select ${J}->>'field' field, ${J}->>'op' op, count(*)::int n from eligibility_gates where ${J}->>'op' in ('numeric_gte','numeric_lte') group by 1,2 order by 3 desc`)).rows);
  console.log("=== NUMERIC by gate_role / encoding_method / verification_level ===");
  console.table((await c.query(`select gate_role, encoding_method, verification_level, count(*)::int n from eligibility_gates where ${J}->>'op' in ('numeric_gte','numeric_lte') group by 1,2,3 order by 4 desc`)).rows);
  console.log("=== ALL foundedYear specs (any op) ===");
  console.table((await c.query(`select ${J}->>'op' op, count(*)::int n from eligibility_gates where ${J}->>'field'='foundedYear' group by 1 order by 2 desc`)).rows);
  await c.end();
})().catch(e=>{console.error(e.message);process.exit(1)});
