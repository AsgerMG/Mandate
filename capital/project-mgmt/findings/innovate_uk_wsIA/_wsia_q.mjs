import fs from 'node:fs';
import pg from 'pg';
const env = fs.readFileSync('/Users/asgermollergrimberg/Wincent/.env.local','utf8');
const url = env.split('\n').find(l=>l.startsWith('DATABASE_URL')).split('=').slice(1).join('=').trim().replace(/^["']|["']$/g,'');
const c = new pg.Client({connectionString:url});
await c.connect();
const q = async (s,p=[])=>{const r=await c.query(s,p); return r.rows;};
console.log('gates total:', (await q('select count(*) from eligibility_gates'))[0]);
console.log('\n--- innovate_uk ticketBand filters ---');
console.table(await q(`select gate_key, gate_role, requirement, value_spec::text, source_file
  from eligibility_gates where instrument_id='innovate_uk' and value_spec::text like '%ticketBand%'`));
console.log('\n--- same-instrument same-field filter groups ---');
console.table(await q(`select count(*) as groups, sum(n-1) as surplus, count(distinct instrument_id) as instruments
  from (select instrument_id, value_spec->>'field' as f, count(*) n
        from eligibility_gates where gate_role='filter' and value_spec is not null
          and value_spec->>'field' is not null
        group by 1,2 having count(*)>1) t`));
await c.end();
