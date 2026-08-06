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
const LEAF = `NOT COALESCE(is_framework,false) AND id NOT IN (SELECT parent_id FROM funding_instruments WHERE parent_id IS NOT NULL)`;

await q("end-date presence by id prefix", `
  SELECT split_part(id,'_',1) pfx, source_family_bucket sfb, count(*) n,
    count(scheme_end_date) with_end,
    count(*) FILTER (WHERE scheme_end_date::date < current_date) past_end,
    count(*) FILTER (WHERE scheme_end_date::date < current_date
        AND to_char(scheme_end_date::date,'MM-DD') IN ('12-30','06-29')) gber_boundary
  FROM funding_instruments WHERE ${LEAF}
  GROUP BY 1,2 HAVING count(scheme_end_date) > 0 ORDER BY with_end DESC LIMIT 30`);

await q("past-end leaves: boundary-day vs not, awards-after-end", `
  SELECT (to_char(scheme_end_date::date,'MM-DD') IN ('12-30','06-29')) boundary_day,
    count(*) n,
    count(*) FILTER (WHERE last_year > EXTRACT(year FROM scheme_end_date::date)::int) awarded_after,
    count(*) FILTER (WHERE successor_scheme IS NOT NULL) has_succ,
    round(avg(event_count)) avg_events
  FROM funding_instruments WHERE ${LEAF} AND scheme_end_date::date < current_date
  GROUP BY 1`);

await q("source horizon: max last_year per (country, id-prefix)", `
  SELECT country, split_part(id,'_',1) pfx, count(*) n, max(last_year) horizon,
         min(last_year) minly
  FROM funding_instruments WHERE ${LEAF} AND last_year IS NOT NULL
  GROUP BY 1,2 HAVING count(*) >= 8 ORDER BY 1,2 LIMIT 60`);

await c.end();
