import { Client } from "pg";
import { loadEnvLocal, requireCredentials } from "./loadEnv";
import { evaluateSpec, type ValueSpec } from "../lib/intelligence/comparator";
import { VOCABULARY } from "../lib/intelligence/vocabulary";
import { sanitizeEligibility } from "../lib/intelligence/sanitize";
import { FIELD_ENUM_HINTS, FIELD_REACH } from "../lib/intelligence/types";
import { REGIONS_BY_COUNTRY } from "../lib/intelligence/regions.generated";
loadEnvLocal();
requireCredentials("_wsig_inert_all", ["DATABASE_URL"]);
const REGION_FIELDS: Record<string,string[]> = { region: Object.values(REGIONS_BY_COUNTRY).flatMap(rs=>rs.map(r=>r.id)) };
const isMulti=(f:string)=>Boolean(VOCABULARY[f]?.multi);
function declaredValues(f:string){const v=VOCABULARY[f];if(v?.values.length)return [...v.values];if(f in REGION_FIELDS)return REGION_FIELDS[f];const h=FIELD_ENUM_HINTS[f];if(h?.options?.length)return h.options.map((o:any)=>o.value);return [];}
function namedValues(s:any){const o:any[]=[];if(Array.isArray(s.allowed))o.push(...s.allowed);for(const k of ["value","maxAllowed","minAllowed"])if(s[k]!==undefined)o.push(s[k]);return o;}
function admissible(f:string,s:any){const reach=(FIELD_REACH as any)[f];const tried=reach?.via==="constant"&&reach.pinned!==undefined?[reach.pinned]:[...namedValues(s),...declaredValues(f),...(typeof s.threshold==="number"?[s.threshold,s.threshold+1,s.threshold-1]:[]),"a-value-no-comparator-names"];
 const seen=new Set<string>();const out:any[]=[];for(const v of tried){const k=`${typeof v}:${String(v)}`;if(seen.has(k))continue;seen.add(k);const probe=isMulti(f)?[v]:v;const kept=(sanitizeEligibility({[f]:probe} as any)??{}) as any;const got=kept[f];const ok=Array.isArray(probe)?Array.isArray(got)&&got.includes(v):got===v;if(ok)out.push(probe);}return out;}
const c=new Client({connectionString:process.env.DATABASE_URL});
(async()=>{await c.connect();
 const r=await c.query(`select id,instrument_id,gate_key,requirement,value_spec,encoding_method,verification_level from eligibility_gates where value_spec is not null and value_spec<>'' and (gate_role is null or gate_role='filter')`);
 let inert=0; const bySrc=new Map<string,number>(); const rows:any[]=[];
 for(const g of r.rows){ let s:any; try{s=JSON.parse(g.value_spec)}catch{continue}
  if(!s||typeof s.field!=="string")continue;
  const ans=admissible(s.field,s); if(!ans.length)continue;
  let acc=false,rej=false; for(const a of ans){const v=evaluateSpec(s as ValueSpec,a); if(v===true){acc=true;break;} if(v===false)rej=true;}
  if(acc||rej)continue; inert++;
  const kind=/^scheme_text_/.test(g.gate_key)?"scheme_text (encode_scheme_text_gates.py)":"gate extractor (encode_gates.py)";
  bySrc.set(kind,(bySrc.get(kind)??0)+1);
  rows.push({id:g.id,inst:g.instrument_id,key:g.gate_key,op:s.op,field:s.field,kind});
 }
 console.log(`INERT in Postgres (filters only): ${inert}`);
 console.table([...bySrc].map(([k,n])=>({source:k,n})));
 const numeric=rows.filter(x=>x.op.startsWith("numeric"));
 console.log(`  of which numeric: ${numeric.length} (scheme_text ${numeric.filter(x=>x.kind.startsWith("scheme")).length})`);
 console.log(`  non-numeric     : ${rows.length-numeric.length} (scheme_text ${rows.filter(x=>!x.op.startsWith("numeric")&&x.kind.startsWith("scheme")).length})`);
 await c.end();})().catch(e=>{console.error(e.message);process.exit(1)});
