/** Which of the inert numeric specs could become a SOUND, NON-VACUOUS band spec.
 *  Sound = excludes only founders who genuinely fail the sentence.
 *  For `numeric_gte T`, band_min(band containing T) is always sound (bands below
 *  B lie entirely under B's lower edge <= T). It is VACUOUS iff B is the lowest
 *  band: then nobody is excluded and the "fix" only hides the inertness. */
import { Client } from "pg";
import { loadEnvLocal, requireCredentials } from "../loadEnv";
import { BAND_ORDERS } from "../../lib/intelligence/vocabulary";
loadEnvLocal();
requireCredentials("_wsig_classify", ["DATABASE_URL"]);
// Lower edge of each band, in the field's own natural unit (EUR, %, headcount).
const EDGES: Record<string, number[]> = {
  turnoverBand:    [0, 2e6, 1e7, 5e7],
  balanceBand:     [0, 2e6, 4.3e7],
  ticketBand:      [0, 25e3, 100e3, 500e3, 2.5e6, 15e6, 50e6],
  cofinancingBand: [0, 25, 50],
  fteBand:         [1, 10, 50, 250],
};
function bandOf(field: string, v: number): number {
  const e = EDGES[field]; let i = 0;
  for (let k = 0; k < e.length; k++) if (v >= e[k]) i = k;
  return i;
}
const c = new Client({ connectionString: process.env.DATABASE_URL });
const J = `nullif(value_spec,'')::jsonb`;
(async () => {
  await c.connect();
  const r = await c.query(`select id,instrument_id,gate_key,requirement,quote,value_spec from eligibility_gates where ${J}->>'op' in ('numeric_gte','numeric_lte') order by ${J}->>'field',instrument_id`);
  // sibling working comparators on the same instrument+field
  const sib = await c.query(`select instrument_id, ${J}->>'field' f, gate_key, ${J}->>'op' op from eligibility_gates where value_spec is not null and value_spec<>'' and (gate_role is null or gate_role='filter') and ${J}->>'op' not in ('numeric_gte','numeric_lte')`);
  const sibs = new Map<string,string[]>();
  for (const s of sib.rows) { const k=`${s.instrument_id}|${s.f}`; sibs.set(k,[...(sibs.get(k)??[]),`${s.gate_key}:${s.op}`]); }
  console.log("field|inst|gate|threshold|band-of-T|vacuous?|sibling on same field");
  for (const g of r.rows) {
    const s = JSON.parse(g.value_spec);
    const order = BAND_ORDERS[s.field];
    const e = EDGES[s.field];
    let verdict = "field has no ordered money/count scale";
    if (order && e) {
      const b = bandOf(s.field, s.threshold);
      verdict = `T=${s.threshold} -> band[${b}] "${order[b]}"` + (b===0 ? "  ** VACUOUS (lowest band: excludes nobody) **" : "  sound+non-vacuous IF unit & subject match");
    }
    const k=`${g.instrument_id}|${s.field}`;
    console.log(`\n${s.field} ${s.op} ${g.instrument_id} ${g.gate_key}\n   ${verdict}\n   sibling: ${(sibs.get(k)??["none"]).join(", ")}\n   req: ${(g.requirement||"").slice(0,110)}`);
  }
  await c.end();
})().catch(e=>{console.error(e.message);process.exit(1)});
