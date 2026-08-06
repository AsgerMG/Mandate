import { readFileSync } from "fs";
import { Client } from "pg";
for (const line of readFileSync("/Users/asgermollergrimberg/Wincent/.env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const q = async (label: string, sql: string) => {
  const r = await c.query(sql);
  console.log("\n== " + label);
  console.table(r.rows);
};
await q("tables", `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1`);
await q("ADEME-ish rows", `SELECT id, country, scheme_end_date, last_year, first_year, event_count, scheme_code, left(name,60) nm
  FROM funding_instruments WHERE administering_body ILIKE '%ADEME%' OR name ILIKE '%ADEME%'
  ORDER BY scheme_end_date NULLS LAST LIMIT 40`);
await c.end();
