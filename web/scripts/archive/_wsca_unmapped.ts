// wsCA — the largest bucket in the gate corpus is `intake_field = none`: 3,242
// gates on 826 instruments. If funds demand something recurring that no intake
// field asks about, that is where a NEW question would come from. This reads
// what they demand, and — the part that decides it — whether siblings of one
// regime DISAGREE on it, since a demand every sibling makes cannot separate.
import { readFileSync } from "fs";
import { Client } from "pg";
import { loadEnvLocal, requireCredentials } from "../loadEnv";
loadEnvLocal();
requireCredentials("wsca_unmapped", ["DATABASE_URL"]);
const PUB = process.env.PUBLISHABLE;
(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const ids = PUB ? new Set<string>(JSON.parse(readFileSync(PUB, "utf8")).map(String)) : null;
  if (ids && ids.size === 0) { console.error("PUBLISHABLE allow-list is EMPTY — refusing"); process.exit(1); }
  const g = await db.query(`
    SELECT eg.instrument_id, eg.gate_key, eg.gate_role, eg.requirement, eg.value_spec,
           fi.parent_id, fi.id
      FROM eligibility_gates eg JOIN funding_instruments fi ON fi.id = eg.instrument_id
     WHERE COALESCE(eg.intake_field_resolved, eg.intake_field) IS NULL
        OR COALESCE(eg.intake_field_resolved, eg.intake_field) = 'none'`);
  const rows = ids ? g.rows.filter((r) => ids.has(String(r.instrument_id))) : g.rows;
  console.log(`unmapped gates ${rows.length} on ${new Set(rows.map(r=>r.instrument_id)).size} publishable instruments`);
  const byRole = new Map<string, number>();
  for (const r of rows) byRole.set(r.gate_role, (byRole.get(r.gate_role) ?? 0) + 1);
  console.log("by role:", [...byRole].sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}=${v}`).join(" "));
  const key = new Map<string, number>();
  for (const r of rows) key.set(r.gate_key, (key.get(r.gate_key) ?? 0) + 1);
  console.log(`\ndistinct gate_key ${key.size}; top 40 by frequency:`);
  for (const [k, v] of [...key].sort((a,b)=>b[1]-a[1]).slice(0, 40)) console.log(`  ${String(v).padStart(4)}  ${k}`);
  // Only `filter` role can separate; how many carry a decidable spec at all?
  const filt = rows.filter((r) => r.gate_role === "filter");
  console.log(`\nfilter-role unmapped: ${filt.length}, of which decidable spec: ${filt.filter(r=>r.value_spec!=null).length}`);
  console.log("\n20 filter-role requirements at random (seeded), to read what they actually demand:");
  let s = 20260809;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const shuf = [...filt].sort(() => rnd() - 0.5).slice(0, 20);
  for (const r of shuf) console.log(`  [${r.gate_key}] ${String(r.requirement).slice(0, 150).replace(/\s+/g, " ")}`);
  await db.end();
})();
