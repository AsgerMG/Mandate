import { loadEnvLocal, requireCredentials } from "./loadEnv";
loadEnvLocal(); requireCredentials("_wsgt_cols", ["DATABASE_URL"]);
import { Client } from "pg";
(async()=>{const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();
const {rows}=await c.query(`select table_name, column_name from information_schema.columns where table_name in ('funding_instruments') order by ordinal_position`);
console.log(rows.map(r=>r.column_name).join('\n'));
const t=await c.query(`select table_name from information_schema.tables where table_schema='public' order by 1`);
console.log('--- tables ---'); console.log(t.rows.map(r=>r.table_name).join('\n'));
await c.end();})();
