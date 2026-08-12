// wsFX — read-only. Prints the instruments table schema and the raw columns
// for the two populations, because the corpus loader drops every URL column
// and a per-row evidence file needs the source page.
//
//   npx tsx scripts/_wsfx_cols.ts [sql]

import { loadEnvLocal, requireCredentials } from "./loadEnv";
loadEnvLocal();
requireCredentials("_wsfx_cols", ["DATABASE_URL"]);

import { Client } from "pg";

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const sql = process.argv[2];
  if (sql) {
    if (!/^\s*(select|with)\b/i.test(sql)) throw new Error("read-only: SELECT/WITH only");
    const r = await c.query(sql);
    process.stdout.write(JSON.stringify(r.rows, null, 1));
  } else {
    const t = await c.query(
      `select table_name from information_schema.tables
       where table_schema='public' order by 1`);
    const cols = await c.query(
      `select table_name, column_name, data_type from information_schema.columns
       where table_schema='public' order by 1,2`);
    process.stdout.write(JSON.stringify({
      tables: t.rows.map((r) => r.table_name),
      columns: cols.rows,
    }, null, 1));
  }
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
