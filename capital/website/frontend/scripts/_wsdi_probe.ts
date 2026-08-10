import { Client } from "pg";
import { loadEnvLocal, requireCredentials } from "./loadEnv";
loadEnvLocal();
requireCredentials("probe", ["DATABASE_URL"]);
(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const t = await db.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1`);
  console.log(t.rows.map(r=>r.table_name).join("\n"));
  for (const tbl of ["funding_instruments","eligibility_clauses","instrument_application"]) {
    const c = await db.query(`SELECT column_name,data_type FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position`,[tbl]);
    console.log(`\n== ${tbl}: ` + c.rows.map(r=>r.column_name).join(", "));
  }
  await db.end();
})();
