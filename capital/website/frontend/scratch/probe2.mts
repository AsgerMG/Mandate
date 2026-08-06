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

// leaves only (not framework, no children) -- the population the product can publish
const LEAF = `NOT COALESCE(is_framework,false) AND id NOT IN (SELECT parent_id FROM funding_instruments WHERE parent_id IS NOT NULL)`;

await q("leaf population", `SELECT count(*) leaves,
  count(*) FILTER (WHERE scheme_end_date::date < current_date) past_end,
  count(*) FILTER (WHERE scheme_end_date::date >= current_date) future_end,
  count(*) FILTER (WHERE scheme_end_date IS NULL) no_end
  FROM funding_instruments WHERE ${LEAF}`);

await q("past-end leaves: award year vs end year", `
  SELECT (last_year - EXTRACT(year FROM scheme_end_date::date)::int) AS years_after_end,
         count(*) n, sum(event_count) events
  FROM funding_instruments
  WHERE ${LEAF} AND scheme_end_date::date < current_date AND last_year IS NOT NULL
  GROUP BY 1 ORDER BY 1`);

await q("past-end leaves by end month-day (is it a notification-window artefact?)", `
  SELECT to_char(scheme_end_date::date,'MM-DD') md, count(*) n
  FROM funding_instruments WHERE ${LEAF} AND scheme_end_date::date < current_date
  GROUP BY 1 ORDER BY 2 DESC LIMIT 12`);

await q("all leaves with end date: end year distribution", `
  SELECT EXTRACT(year FROM scheme_end_date::date)::int y, count(*) n
  FROM funding_instruments WHERE ${LEAF} AND scheme_end_date IS NOT NULL
  GROUP BY 1 ORDER BY 1`);

await q("top past-end leaves that awarded after end", `
  SELECT country, scheme_end_date, last_year, event_count, successor_scheme IS NOT NULL succ, left(name,52) nm
  FROM funding_instruments
  WHERE ${LEAF} AND scheme_end_date::date < current_date
    AND last_year > EXTRACT(year FROM scheme_end_date::date)::int
  ORDER BY event_count DESC NULLS LAST LIMIT 25`);

await q("past-end leaves with NO award after end, top by events", `
  SELECT country, scheme_end_date, last_year, event_count, left(name,52) nm
  FROM funding_instruments
  WHERE ${LEAF} AND scheme_end_date::date < current_date
    AND (last_year IS NULL OR last_year <= EXTRACT(year FROM scheme_end_date::date)::int)
  ORDER BY event_count DESC NULLS LAST LIMIT 25`);

await q("recency: last_year distribution for past-end leaves", `
  SELECT last_year, count(*) n FROM funding_instruments
  WHERE ${LEAF} AND scheme_end_date::date < current_date GROUP BY 1 ORDER BY 1`);

await c.end();
