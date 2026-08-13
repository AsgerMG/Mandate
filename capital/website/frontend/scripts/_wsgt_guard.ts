import { loadEnvLocal, requireCredentials } from "./loadEnv";
loadEnvLocal(); requireCredentials("_wsgt_guard", ["DATABASE_URL"]);
import { Client } from "pg";
(async()=>{const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();
const cols=await c.query(`select column_name from information_schema.columns where table_name='guard_verdicts' order by ordinal_position`);
console.log(cols.rows.map(r=>r.column_name).join(', '));
const r=await c.query(`select * from guard_verdicts where guard like '%recall%' order by 1 desc limit 4`);
for(const row of r.rows) console.log(JSON.stringify(row).slice(0,1400));
await c.end();})();
