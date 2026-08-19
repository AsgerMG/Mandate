import { Client } from "pg";
import { loadEnvLocal } from "./loadEnv";
loadEnvLocal();
const c=new Client({connectionString:process.env.DATABASE_URL});
const J=`nullif(value_spec,'')::jsonb`;
const INSTS=["eis_reaalajamajanduse_lahend","eis_reaalajamajanduse_ritark","eis_reaalajamajanduse_tervik","eis_rohetoetus_arendustegevu","eit_urban_mobility_portfolio","satr_ee_rnd__sa_119771__ettevotluse_ja_innovatsiooni_sihtasutus","eit_health_catapult","tesi_equity"];
(async()=>{await c.connect();
 for(const i of INSTS){
  const r=await c.query(`select gate_key, ${J}->>'field' f, ${J}->>'op' op, value_spec, left(requirement,90) req, gate_role from eligibility_gates where instrument_id=$1 and (gate_role is null or gate_role='filter') order by gate_key`,[i]);
  console.log(`\n### ${i} — ${r.rows.length} filter gates`);
  for(const g of r.rows) console.log(`   ${g.gate_key.padEnd(34)} ${String(g.f??"-").padEnd(16)} ${String(g.op??"-").padEnd(14)} ${g.req}`);
 }
 await c.end();})().catch(e=>{console.error(e.message);process.exit(1)});
