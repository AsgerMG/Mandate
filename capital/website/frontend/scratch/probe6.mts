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

// Is the boundary-day signature the same thing as "date came from SATR"?
await q("bdns leaves: scheme_code present vs boundary-day end", `
  SELECT (coalesce(scheme_code,'') <> '') has_code,
         (to_char(scheme_end_date::date,'MM-DD') IN ('12-30','06-29')) boundary,
         count(*) n
  FROM funding_instruments WHERE ${LEAF} AND id LIKE 'bdns%' AND scheme_end_date IS NOT NULL
  GROUP BY 1,2 ORDER BY 1,2`);

await q("satr leaves: scheme_code present vs boundary-day end", `
  SELECT (coalesce(scheme_code,'') <> '') has_code,
         (to_char(scheme_end_date::date,'MM-DD') IN ('12-30','06-29')) boundary,
         count(*) n
  FROM funding_instruments WHERE ${LEAF} AND id LIKE 'satr%' AND scheme_end_date IS NOT NULL
  GROUP BY 1,2 ORDER BY 1,2`);

// Where does the declared end sit inside the observed award history?
await q("past-end leaves: end-date position in award span, by prefix", `
  SELECT split_part(id,'_',1) pfx,
    count(*) n,
    count(*) FILTER (WHERE EXTRACT(year FROM scheme_end_date::date)::int < first_year) end_before_first,
    count(*) FILTER (WHERE EXTRACT(year FROM scheme_end_date::date)::int BETWEEN first_year AND last_year) end_inside,
    count(*) FILTER (WHERE EXTRACT(year FROM scheme_end_date::date)::int > last_year) end_after_last,
    round(avg(last_year - first_year),2) avg_span
  FROM funding_instruments WHERE ${LEAF} AND scheme_end_date::date < current_date AND first_year IS NOT NULL
  GROUP BY 1 ORDER BY 2 DESC`);

// Fondo di garanzia and friends: full picture
await q("IT flagship rows", `
  SELECT scheme_end_date, first_year, last_year, event_count, scheme_code, left(name,50) nm
  FROM funding_instruments WHERE ${LEAF} AND country='IT' AND scheme_end_date::date < current_date
  ORDER BY event_count DESC LIMIT 12`);

// The corpus horizon test: does a past-end satr row still pay up to its cohort's horizon?
await q("satr past-end leaves: years behind their country's satr horizon", `
  WITH h AS (SELECT country, max(last_year) horizon FROM funding_instruments
             WHERE ${LEAF} AND id LIKE 'satr%' GROUP BY 1)
  SELECT (h.horizon - f.last_year) behind, count(*) n
  FROM funding_instruments f JOIN h USING (country)
  WHERE ${LEAF} AND f.id LIKE 'satr%' AND f.scheme_end_date::date < current_date
  GROUP BY 1 ORDER BY 1`);

await q("bdns past-end leaves: years behind their country's bdns horizon", `
  WITH h AS (SELECT country, max(last_year) horizon FROM funding_instruments
             WHERE ${LEAF} AND id LIKE 'bdns%' GROUP BY 1)
  SELECT (h.horizon - f.last_year) behind, count(*) n
  FROM funding_instruments f JOIN h USING (country)
  WHERE ${LEAF} AND f.id LIKE 'bdns%' AND f.scheme_end_date::date < current_date
  GROUP BY 1 ORDER BY 1`);

await c.end();
