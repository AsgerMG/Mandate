import { Client } from "pg";
import { loadEnvLocal, requireCredentials } from "../loadEnv";
import { writeFileSync } from "fs";
loadEnvLocal();
requireCredentials("_wsig_dump", ["DATABASE_URL"]);
const c = new Client({ connectionString: process.env.DATABASE_URL });
const J = `nullif(value_spec,'')::jsonb`;
(async () => {
  await c.connect();
  const r = await c.query(`select id, instrument_id, gate_key, gate_family, requirement, value, value_spec, intake_field, quote, source_file, source_locator, verification_level, gate_role, encoding_method
    from eligibility_gates where ${J}->>'op' in ('numeric_gte','numeric_lte') order by ${J}->>'field', instrument_id, gate_key`);
  writeFileSync("/tmp/wsig_numeric.json", JSON.stringify(r.rows, null, 1));
  console.log("rows:", r.rows.length, "instruments:", new Set(r.rows.map(x=>x.instrument_id)).size);
  for (const g of r.rows) {
    const s = JSON.parse(g.value_spec);
    console.log(`\n--- id=${g.id} ${g.instrument_id} ${g.gate_key} [${s.field} ${s.op} ${s.threshold}] ${g.verification_level}`);
    console.log(`REQ  : ${(g.requirement||"").slice(0,240)}`);
    console.log(`QUOTE: ${(g.quote||"").slice(0,300)}`);
    console.log(`SRC  : ${g.source_file} | ${g.source_locator}`);
  }
  await c.end();
})().catch(e=>{console.error(e.message);process.exit(1)});
