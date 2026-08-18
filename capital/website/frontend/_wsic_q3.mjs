import fs from 'node:fs'; import pg from 'pg';
const env = fs.readFileSync('/Users/asgermollergrimberg/Wincent/.env.local', 'utf8');
const url = env.split('\n').find(l => l.startsWith('DATABASE_URL')).split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
const c = new pg.Client({ connectionString: url }); await c.connect();
const q = async s => (await c.query(s)).rows;
const F = `gate_role='filter' and value_spec is not null and value_spec<>'' and value_spec::jsonb->>'field' is not null`;
const rows = await q(`select instrument_id, gate_key, requirement, value_spec::jsonb->>'field' f, value_spec::text spec from eligibility_gates where ${F}`);
const groups = new Map();
for (const r of rows) { const k = r.instrument_id + ' ' + r.f; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
const nums = s => [...new Set((s.match(/\d[\d.,]*\s*(?:%|million|billion|m\b|k\b)?/gi) || []).map(x => x.trim().toLowerCase()))].sort();
const canon = s => { const v = JSON.parse(s); return JSON.stringify(v, Object.keys(v).sort()); };
const out = [];
for (const [k, g] of groups) {
  if (g.length < 2) continue;
  if (new Set(g.map(r => canon(r.spec))).size !== 1) continue;
  if (new Set(g.map(r => r.requirement)).size !== g.length) continue;
  const numSets = g.map(r => nums(r.requirement).join('|'));
  if (new Set(numSets).size < 2) continue;
  if (numSets.some(s => s === '')) continue;
  out.push({
    instrument: k.split(' ')[0], field: k.split(' ')[1], n: g.length,
    spec: JSON.parse(g[0].spec),
    branches: g.map(r => ({ gate: r.gate_key, req: r.requirement.slice(0, 120), nums: nums(r.requirement) })),
  });
}
console.log('groups where requirement texts carry DIFFERENT numeric thresholds yet the specs are identical:', out.length);
console.log(JSON.stringify(out, null, 1));
await c.end();
