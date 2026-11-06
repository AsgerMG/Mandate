// wsIF — read-only schema probe. Free, no write.
import { loadEnvLocal, requireCredentials } from "../loadEnv";

loadEnvLocal();
requireCredentials("wsif_tables", ["DATABASE_URL"]);

import { Pool } from "pg";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const t = await pool.query(
    "select table_name from information_schema.tables where table_schema=current_schema() order by 1");
  console.log("== tables ==");
  console.log(t.rows.map((r) => r.table_name).join("  "));
  console.log("");
  for (const name of ["funding_events", "events", "funding_event"]) {
    const c = await pool.query(
      "select column_name from information_schema.columns where table_name=$1 order by ordinal_position",
      [name]);
    if (!c.rows.length) continue;
    console.log("== " + name + " ==");
    console.log(c.rows.map((r) => r.column_name).join("  "));
  }
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
