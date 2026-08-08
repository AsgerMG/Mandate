import { loadEnvLocal, requireCredentials } from "./loadEnv";
loadEnvLocal();
requireCredentials("fr_diag", ["DATABASE_URL"]);
const h = (s: any) => (s ? String(s).trim().toLowerCase().slice(0, 400) : "");
async function main() {
  const { Client } = await import("pg");
  const { publishableInstruments, hydrateDbInstruments } = await import("../lib/intelligence/corpus");
  await hydrateDbInstruments();
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const meta = new Map<string, any>();
  for (const r of (await db.query(
    `SELECT id, eligibility_text, eligibility_source_url, eligibility_confidence, scheme_code, application_url, description FROM funding_instruments WHERE country='FR'`)).rows) meta.set(r.id, r);
  await db.end();
  const all = publishableInstruments();
  const byRegime = new Map<string, any[]>();
  for (const r of all) { const p = r.parentId ?? r.id; if(!byRegime.has(p)) byRegime.set(p,[]); byRegime.get(p)!.push(r); }
  const key = (r:any) => h(r.administeringBody)+"|"+h(r.deliveryRegion)+"|"+h((meta.get(r.id)||{}).eligibility_text && String((meta.get(r.id)||{}).eligibility_text).length>40 ? (meta.get(r.id)||{}).eligibility_text : "");
  const groups = [...byRegime.entries()].filter(([,g])=>g.length>1 && g.some((r:any)=>r.country==="FR"));
  // rank regimes by total residual-class burden contributed by FR leaves
  const rows: any[] = [];
  for (const [pid,g] of groups) {
    const cls = new Map<string, number>();
    for (const r of g) cls.set(key(r),(cls.get(key(r))??0)+1);
    const fr = g.filter((r:any)=>r.country==="FR");
    const burden = fr.reduce((a,r)=>a+cls.get(key(r))!,0);
    rows.push({pid, n:g.length, nfr:fr.length, burden, mean: burden/fr.length,
      body: fr[0].administeringBody, parentName: (all.find((x:any)=>x.id===pid)||{}).name || pid,
      withText: fr.filter((r:any)=>{const m=meta.get(r.id); return m && m.eligibility_text && m.eligibility_text.length>40;}).length,
      names: fr.map((r:any)=>r.name)});
  }
  rows.sort((a,b)=>b.burden-a.burden);
  const tot = rows.reduce((a,r)=>a+r.burden,0), totn = rows.reduce((a,r)=>a+r.nfr,0);
  console.log(`FR leaves in multi-leaf regimes: ${totn}; mean class ${(tot/totn).toFixed(1)}\n`);
  let cum=0;
  for (const r of rows) { cum+=r.burden;
    console.log(`burden ${String(r.burden).padStart(4)} (cum ${(100*cum/tot).toFixed(0)}%)  leaves ${r.nfr}/${r.n}  text ${r.withText}/${r.nfr}  meanclass ${r.mean.toFixed(1)}  body=${(r.body||"").slice(0,45)}  regime=${String(r.parentName).slice(0,55)}`);
  }
}
main();
