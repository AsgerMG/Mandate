import fs from 'node:fs'; import pg from 'pg';
const env=fs.readFileSync('/Users/asgermollergrimberg/Wincent/.env.local','utf8');
const url=env.split('\n').find(l=>l.startsWith('DATABASE_URL')).split('=').slice(1).join('=').trim().replace(/^["']|["']$/g,'');
const c=new pg.Client({connectionString:url}); await c.connect();
const q=async s=>(await c.query(s)).rows;
console.log('same-field filter groups:', JSON.stringify(await q(`
 select count(*) groups, sum(n-1) surplus, count(distinct instrument_id) instruments,
        sum(case when d=1 then 1 else 0 end) identical_spec_groups
 from (select instrument_id, value_spec::jsonb->>'field' f, count(*) n,
              count(distinct value_spec::jsonb::text) d
       from eligibility_gates
       where gate_role='filter' and value_spec is not null and value_spec <> ''
         and value_spec::jsonb->>'field' is not null
       group by 1,2 having count(*)>1) t`)));
console.log('\ninstruments whose ticketBand filter excludes b500k_2m5:', JSON.stringify(await q(`
 select count(distinct instrument_id) n from eligibility_gates
 where gate_role='filter' and value_spec is not null and value_spec<>''
   and value_spec::jsonb->>'field'='ticketBand'
   and value_spec::jsonb->>'op'='in'
   and not (value_spec::jsonb->'allowed' ? 'b500k_2m5')`)));
console.log('\ntotal instruments with any ticketBand filter:', JSON.stringify(await q(`
 select count(distinct instrument_id) n from eligibility_gates
 where gate_role='filter' and value_spec is not null and value_spec<>'' and value_spec::jsonb->>'field'='ticketBand'`)));
console.log('\nsame-field groups where requirements differ but spec identical (branch collapse):');
console.table(await q(`
 select instrument_id, value_spec::jsonb->>'field' f, count(*) n,
        count(distinct requirement) reqs, count(distinct value_spec::jsonb::text) specs
 from eligibility_gates
 where gate_role='filter' and value_spec is not null and value_spec<>'' and value_spec::jsonb->>'field' is not null
 group by 1,2 having count(*)>1 and count(distinct requirement)=count(*) and count(distinct value_spec::jsonb::text)=1
 order by n desc limit 15`));
await c.end();
