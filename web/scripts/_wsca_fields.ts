import { Client } from "pg";
import { loadEnvLocal, requireCredentials } from "./loadEnv";
loadEnvLocal();
requireCredentials("wsca_fields", ["DATABASE_URL"]);
(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const q = await db.query(`
    SELECT COALESCE(intake_field_resolved, intake_field) AS f,
           COUNT(*) AS gates, COUNT(DISTINCT instrument_id) AS instruments,
           COUNT(*) FILTER (WHERE value_spec IS NOT NULL) AS with_spec,
           COUNT(DISTINCT gate_role) AS roles
      FROM eligibility_gates GROUP BY 1 ORDER BY 3 DESC`);
  console.log("field".padEnd(26), "gates".padStart(6), "instr".padStart(6), "spec".padStart(6));
  for (const r of q.rows) console.log(String(r.f ?? "(null)").padEnd(26), String(r.gates).padStart(6), String(r.instruments).padStart(6), String(r.with_spec).padStart(6));
  const roles = await db.query(`SELECT gate_role, COUNT(*) FROM eligibility_gates GROUP BY 1 ORDER BY 2 DESC`);
  console.log("\nroles:", roles.rows.map(r=>`${r.gate_role}=${r.count}`).join(" "));
  await db.end();
})();
