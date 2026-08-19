import { readFileSync } from "fs";
import path from "path";
import { evaluateSpec, type ValueSpec } from "../lib/intelligence/comparator";
import { VOCABULARY, BAND_ORDERS } from "../lib/intelligence/vocabulary";
import { sanitizeEligibility } from "../lib/intelligence/sanitize";
import { FIELD_ENUM_HINTS, FIELD_REACH } from "../lib/intelligence/types";
import { REGIONS_BY_COUNTRY } from "../lib/intelligence/regions.generated";
const corpusPath = path.join(process.cwd(), "public", "data", "instrument_terms.json");
const REGION_FIELDS: Record<string,string[]> = { region: Object.values(REGIONS_BY_COUNTRY).flatMap(rs=>rs.map(r=>r.id)) };
const isMulti = (f:string)=>Boolean(VOCABULARY[f]?.multi);
function namedValues(s:any){const o:any[]=[];if(Array.isArray(s.allowed))o.push(...s.allowed);for(const k of ["value","maxAllowed","minAllowed"])if(s[k]!==undefined)o.push(s[k]);return o;}
function declaredValues(f:string){const v=VOCABULARY[f];if(v?.values.length)return [...v.values];if(f in REGION_FIELDS)return REGION_FIELDS[f];const h=FIELD_ENUM_HINTS[f];if(h?.options?.length)return h.options.map((o:any)=>o.value);return [];}
function admissible(f:string,s:any){const reach=(FIELD_REACH as any)[f];const tried=reach?.via==="constant"&&reach.pinned!==undefined?[reach.pinned]:[...namedValues(s),...declaredValues(f),...(typeof s.threshold==="number"?[s.threshold,s.threshold+1,s.threshold-1]:[]),"a-value-no-comparator-names"];
 const seen=new Set<string>();const out:any[]=[];for(const v of tried){const k=`${typeof v}:${String(v)}`;if(seen.has(k))continue;seen.add(k);const probe=isMulti(f)?[v]:v;const kept=(sanitizeEligibility({[f]:probe} as any)??{}) as any;const got=kept[f];const ok=Array.isArray(probe)?Array.isArray(got)&&got.includes(v):got===v;if(ok)out.push(probe);}return out;}
const records=(JSON.parse(readFileSync(corpusPath,"utf8")).records??[]) as any[];
for(const rec of records) for(const gate of rec.gates??[]){
  if(gate.gateRole&&gate.gateRole!=="filter")continue;
  const spec=(typeof gate.valueSpec==="string"?JSON.parse(gate.valueSpec):gate.valueSpec);
  if(!spec||typeof spec.field!=="string")continue;
  if(spec.op==="numeric_gte"||spec.op==="numeric_lte")continue;
  const ans=admissible(spec.field,spec); if(!ans.length)continue;
  let acc=false,rej=false;
  for(const a of ans){const r=evaluateSpec(spec as ValueSpec,a); if(r===true){acc=true;break;} if(r===false)rej=true;}
  if(acc||rej)continue;
  console.log(`\n--- ${rec.id} [${spec.field} ${spec.op}] ${JSON.stringify(spec)}`);
  console.log(`REQ : ${(gate.requirement||"").slice(0,200)}`);
  console.log(`ORDER: ${JSON.stringify(BAND_ORDERS[spec.field]??null)}`);
}
