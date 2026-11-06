import { loadEnvLocal, requireCredentials } from "../loadEnv";
loadEnvLocal();
requireCredentials("fr_ademe", ["DATABASE_URL"]);
const h = (s: any) => (s ? String(s).trim().toLowerCase().slice(0, 400) : "");
async function main() {
  const { Client } = await import("pg");
  const { publishableInstruments, hydrateDbInstruments } = await import("../../lib/intelligence/corpus");
  await hydrateDbInstruments();
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const meta = new Map<string, any>();
  for (const r of (await db.query(
    `SELECT id, eligibility_text, eligibility_source_url, eligibility_confidence, scheme_code, application_url, description, scheme_end_date FROM funding_instruments WHERE country='FR'`)).rows) meta.set(r.id, r);
  await db.end();
  const target = process.argv[2] || "ademe_aid";
  const g = publishableInstruments().filter((r:any)=> (r.parentId ?? r.id) === target);
  const key = (r:any) => { const m = meta.get(r.id)||{}; const t = m.eligibility_text && String(m.eligibility_text).length>40 ? m.eligibility_text : "";
    return h(r.administeringBody)+"|"+h(r.deliveryRegion)+"|"+h(t); };
  const cls = new Map<string, number>(); for (const r of g) cls.set(key(r),(cls.get(key(r))??0)+1);
  // group by class key so identical siblings sit together
  const byKey = new Map<string, any[]>();
  for (const r of g) { const k = key(r); if(!byKey.has(k)) byKey.set(k,[]); byKey.get(k)!.push(r); }
  console.log(`${target}: ${g.length} publishable leaves, ${byKey.size} distinct classes, mean class ${(g.reduce((a,r)=>a+cls.get(key(r))!,0)/g.length).toFixed(1)}\n`);
  const ordered = [...byKey.entries()].sort((a,b)=>b[1].length-a[1].length);
  for (const [, members] of ordered) {
    const m0 = meta.get(members[0].id)||{};
    const t = m0.eligibility_text||"";
    console.log(`--- class of ${members.length} | text ${t.length>40?`${t.length}ch conf=${m0.eligibility_confidence} src=${(m0.eligibility_source_url||"").slice(0,70)}`:"NONE"}`);
    for (const r of members) console.log(`      ${r.id}  ${String(r.name).slice(0,80)}`);
    if (t.length>40) console.log(`      TEXT: ${t.replace(/\s+/g," ").slice(0,240)}`);
  }
}
main();
