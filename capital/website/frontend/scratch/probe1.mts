import { readFileSync } from "fs";
import { Client } from "pg";
for (const line of readFileSync("/Users/asgermollergrimberg/Wincent/.env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
console.log("READ AT (UTC):", new Date().toISOString());
const q = async (label: string, sql: string) => {
  const r = await c.query(sql);
  console.log("\n== " + label);
  console.table(r.rows);
};
await q("totals", `SELECT count(*) total,
   count(scheme_end_date) with_end,
   count(*) FILTER (WHERE scheme_end_date::date < current_date) past_end,
   count(*) FILTER (WHERE successor_scheme IS NOT NULL) with_successor
   FROM funding_instruments`);
await q("past-end by country", `SELECT country, count(*) n FROM funding_instruments
   WHERE scheme_end_date::date < current_date GROUP BY 1 ORDER BY 2 DESC LIMIT 30`);
await q("columns", `SELECT column_name, data_type FROM information_schema.columns
   WHERE table_name='funding_instruments' ORDER BY ordinal_position`);
await c.end();
