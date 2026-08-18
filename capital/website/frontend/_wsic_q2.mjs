import fs from 'node:fs'; import pg from 'pg';
const env=fs.readFileSync('/Users/asgermollergrimberg/Wincent/.env.local','utf8');
const url=env.split('\n').find(l=>l.startsWith('DATABASE_URL')).split('=').slice(1).join('=').trim().replace(/^["']|["']$/g,'');
const c=new pg.Client({connectionString:url}); await c.connect();
const q=async s=>(await c.query(s)).rows;
const F=`gate_role='filter' and value_spec is not null and value_spec<>'' and value_spec::jsonb->>'field' is not null`;
console.log('total gates:', JSON.stringify(await q('select count(*) n from eligibility_gates')));
console.log('filter gates with a spec:', JSON.stringify(await q(`select count(*) n from eligibility_gates where ${F}`)));
console.log('\n== groups: same instrument + same spec field, >1 filter gate ==');
console.log(JSON.stringify(await q(`
 select count(*) groups, sum(n) gates, count(distinct instrument_id) instruments,
   sum(case when reqs=n and specs=1 then 1 else 0 end) collapse_groups,
   sum(case when reqs=n and specs=1 then n else 0 end) collapse_gates,
   sum(case when specs>1 then 1 else 0 end) differing_spec_groups
 from (select instrument_id, value_spec::jsonb->>'field' f, count(*) n,
              count(distinct requirement) reqs, count(distinct value_spec::jsonb::text) specs
       from eligibility_gates where ${F} group by 1,2 having count(*)>1) t`), null, 1));
console.log('\n== THE COLLAPSE CLASS: different requirement texts, identical spec ==');
console.log(JSON.stringify(await q(`
 select instrument_id, value_spec::jsonb->>'field' f, count(*) n
 from eligibility_gates where ${F}
 group by 1,2 having count(*)>1 and count(distinct requirement)=count(*) and count(distinct value_spec::jsonb::text)=1
 order by n desc, 1`), null, 1));
await c.end();
