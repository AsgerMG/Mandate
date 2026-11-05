// Is the one non-zero marginal field a general property or one regime?
import { readFileSync } from "fs";
import { Client } from "pg";
import { loadEnvLocal, requireCredentials } from "./loadEnv";
loadEnvLocal(); requireCredentials("wsca_fte", ["DATABASE_URL"]);
const PUB = process.env.PUBLISHABLE!;
(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL }); await db.connect();
  const ids = new Set<string>(JSON.parse(readFileSync(PUB, "utf8")).map(String));
  if (ids.size === 0) { console.error("EMPTY allow-list — refusing"); process.exit(1); }
  const { rows } = await db.query(`SELECT id, parent_id, country, name FROM funding_instruments`);
  const pop = rows.filter(r => ids.has(String(r.id)));
  const byR = new Map<string, any[]>();
  for (const r of pop) { const p = r.parent_id ?? r.id; (byR.get(p) ?? byR.set(p, []).get(p)!).push(r); }
  const groups = [...byR.values()].filter(x => x.length > 1);
  const g = await db.query(`SELECT instrument_id, value_spec FROM eligibility_gates
     WHERE COALESCE(intake_field_resolved,intake_field)=$1 AND gate_role='filter' AND value_spec IS NOT NULL`, ["fteBand"]);
  const spec = new Map<string, Set<string>>();
  for (const r of g.rows) { const id=String(r.instrument_id); if(!spec.has(id)) spec.set(id,new Set()); spec.get(id)!.add(JSON.stringify(r.value_spec)); }
  const sig = (r:any) => { const s=spec.get(String(r.id)); return s&&s.size?[...s].sort().join("~"):""; };
  for (const grp of groups) {
    const vals = new Set(grp.map(sig));
    if (vals.size > 1) {
      const parent = grp[0].parent_id ?? grp[0].id;
      const withSpec = grp.filter(r => sig(r)).length;
      console.log(`regime ${parent}  country ${grp[0].country}  leaves ${grp.length}  leaves with an fteBand spec ${withSpec}  distinct specs ${[...vals].filter(Boolean).length}`);
    }
  }
  await db.end();
})();
