// wsGT probe: the closed population, and what the corpus holds beside it.
import { loadEnvLocal, requireCredentials } from "./loadEnv";
loadEnvLocal();
requireCredentials("_wsgt_probe", ["DATABASE_URL"]);
import { Client } from "pg";
import { isClosed, today } from "../lib/intelligence/liveness";

const asOf = today();
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const { rows } = await c.query(`
    select id, parent_id, name, country, administering_body, scheme_code,
           scheme_end_date, scheme_end_date_basis, source_window_policy,
           last_year, successor_scheme, is_framework, event_count
      from funding_instruments`);
  await c.end();
  const facts = (r: any) => ({
    schemeEndDate: r.scheme_end_date, schemeEndBasis: r.scheme_end_date_basis,
    lastYear: r.last_year, successorScheme: r.successor_scheme,
    sourceWindowPolicy: r.source_window_policy,
  });
  const closed = rows.filter((r) => isClosed(facts(r), asOf));
  console.log(`asOf ${asOf}  rows ${rows.length}  closed ${closed.length}`);
  const by = new Map<string, number>();
  for (const r of closed) {
    const k = `${String(r.id).split("__")[0]} | ${r.scheme_end_date_basis ?? "NULL"}`;
    by.set(k, (by.get(k) ?? 0) + 1);
  }
  for (const [k, n] of [...by].sort((a, b) => b[1] - a[1])) console.log(`  ${n}\t${k}`);
  const hasChildren = new Set(rows.map((r) => r.parent_id).filter(Boolean));
  const leafClosed = closed.filter((r) => !r.is_framework && !hasChildren.has(r.id));
  console.log(`closed LEAF non-framework: ${leafClosed.length}`);
})();
