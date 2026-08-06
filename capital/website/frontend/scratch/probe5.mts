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
const LEAF = `NOT COALESCE(is_framework,false) AND id NOT IN (SELECT parent_id FROM funding_instruments WHERE parent_id IS NOT NULL)`;

// Does "awarded after end" separate the populations, as asserted?
await q("SPAIN bdns past-end leaves: do they award after end?", `
  SELECT count(*) n,
    count(*) FILTER (WHERE last_year > EXTRACT(year FROM scheme_end_date::date)::int) awarded_after_year,
    count(*) FILTER (WHERE last_year = EXTRACT(year FROM scheme_end_date::date)::int) same_year,
    count(*) FILTER (WHERE last_year < EXTRACT(year FROM scheme_end_date::date)::int) before
  FROM funding_instruments WHERE ${LEAF} AND country='ES' AND id LIKE 'bdns%'
    AND scheme_end_date::date < current_date`);

await q("SPAIN bdns: the ones that DID award after end (would be reopened)", `
  SELECT scheme_end_date, first_year, last_year, event_count, left(name,60) nm
  FROM funding_instruments WHERE ${LEAF} AND country='ES' AND id LIKE 'bdns%'
    AND scheme_end_date::date < current_date
    AND last_year > EXTRACT(year FROM scheme_end_date::date)::int
  ORDER BY event_count DESC`);

await q("ADEME 6: the closed calls", `
  SELECT scheme_end_date, first_year, last_year, event_count, left(name,60) nm
  FROM funding_instruments WHERE ${LEAF} AND id LIKE 'ademe%' AND scheme_end_date IS NOT NULL
  ORDER BY scheme_end_date`);

// How many past-end leaves fall on a GBER notified-duration boundary AND award after?
await q("cross-tab: boundary-day x awarded-after (past-end leaves)", `
  SELECT (to_char(scheme_end_date::date,'MM-DD') IN ('12-30','06-29')) boundary,
         (last_year > EXTRACT(year FROM scheme_end_date::date)::int) awarded_after,
         count(*) n, sum(event_count) events
  FROM funding_instruments WHERE ${LEAF} AND scheme_end_date::date < current_date
  GROUP BY 1,2 ORDER BY 1,2`);

await q("past-end leaves by prefix x awarded-after", `
  SELECT split_part(id,'_',1) pfx,
    count(*) n,
    count(*) FILTER (WHERE last_year > EXTRACT(year FROM scheme_end_date::date)::int) awarded_after
  FROM funding_instruments WHERE ${LEAF} AND scheme_end_date::date < current_date
  GROUP BY 1 ORDER BY 2 DESC`);

await c.end();
