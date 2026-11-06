import fs from 'node:fs'; import pg from 'pg';
const env=fs.readFileSync('/Users/asgermollergrimberg/Wincent/.env.local','utf8');
const url=env.split('\n').find(l=>l.startsWith('DATABASE_URL')).split('=').slice(1).join('=').trim().replace(/^["']|["']$/g,'');
const c=new pg.Client({connectionString:url}); await c.connect();
const q=async s=>(await c.query(s)).rows;
console.table(await q(`
 select instrument_id, gate_key, requirement, value_spec from eligibility_gates
 where gate_role='filter' and value_spec is not null and value_spec<>''
   and value_spec::jsonb->>'field'='ticketBand' and value_spec::jsonb->>'op'='in'
   and not (value_spec::jsonb->'allowed' ? 'b500k_2m5')`));
await c.end();
