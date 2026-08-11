import { loadEnvLocal } from "../loadEnv";
loadEnvLocal();
(async () => {
const { hydrateDbInstruments, resetGateHydration } = await import("../../lib/intelligence/corpus");
const { buildInstrumentTableHydrated, founderCountryList, tableInputFromAnswers, VERDICT_POOL } = await import("../../lib/intelligence/shortlist");
const { ExclusionLog } = await import("../../lib/intelligence/exclusions");
const { accessiblePool, orderMemoCandidates } = await import("../../lib/intelligence/memoCandidates");
const { lateAnsweredFields, withCoveredFields } = await import("../../lib/intelligence/answerProvenance");
const { openFieldsForShortlist } = await import("../../lib/intelligence/gateReach");
const { semanticFundMatch } = await import("../../lib/intelligence/semantic");
const { sanitizeEligibility } = await import("../../lib/intelligence/sanitize");
const { COMPANIES } = await import("../../lib/intelligence/__benchCompanies");
const { FIELD_ENUM_HINTS, FIRST_PAGE_FIELDS } = await import("../../lib/intelligence/types");
type EA = import("../../lib/intelligence/types").EligibilityAnswers;
await hydrateDbInstruments();
const PROVE = process.env.PROVE === "1";
const cases: {field:string;value:unknown}[] = [];
for (const [field,hint] of Object.entries(FIELD_ENUM_HINTS)) {
  if (FIRST_PAGE_FIELDS.has(field)) continue;
  for (const o of hint.options) cases.push({field, value: hint.multi ? [o.value] : o.value});
}
const answersFor = (c:any, over:Record<string,unknown>={}) => sanitizeEligibility({
  sector:c.sector, activities:c.activities??["none"], useOfFunds:["experimental_development","industrial_research"],
  entityCountries:[c.country], exclusionFlags:["none"], cofinancingBand:">50%", consortium:"unsure",
  borrowerModel:c.borrowerModel??"operating", fteBand:c.fteBand, ticketBand:c.ticketBand,
  developmentStage:c.developmentStage, ...over }) as EA;
async function run(c:any, before:EA, after:EA, sem:Map<string,number>) {
  resetGateHydration();
  const log = new ExclusionLog();
  const h = await buildInstrumentTableHydrated({ fieldChannels:new Set<string>(),
    founderCountries: founderCountryList(c.country,[c.country],[c.country]),
    capitalSought:["grant","loan"], description:c.description, semantic:sem,
    ...tableInputFromAnswers(after), log } as never);
  const late = PROVE ? new Set<string>() : lateAnsweredFields(before, after,
    withCoveredFields(openFieldsForShortlist(h.map((r:any)=>r.instrumentId).filter(Boolean), before).map((f:any)=>f.field)));
  const acc = accessiblePool(h, after, log, late);
  const { toWriter } = orderMemoCandidates({ instrumentTable: acc.slice(0,VERDICT_POOL),
    req:{company:c.company,country:c.country,description:c.description,capitalSought:["grant","loan"],targetMarkets:[c.country],eligibility:after} as never,
    records:[], dbPeers:[], eligibilityScreen:[], semanticScores:sem, log, lateFields: late });
  return { hyd: h.map((r:any)=>r.instrumentId).filter(Boolean) as string[],
           acc: acc.map((r:any)=>r.instrumentId).filter(Boolean) as string[],
           w: toWriter.map((x:any)=>x.row.instrumentId ?? x.row.channel) as string[], late };
}
let n=0, lossHyd=0, lossAccCommon=0, lossW=0;
const ex: string[] = [];
for (const c of COMPANIES) {
  const sem = await semanticFundMatch(c.description);
  const base = new Map<string, any>();
  for (const {field,value} of cases) {
    const before = answersFor(c,{[field]:undefined});
    const key = JSON.stringify(before);
    if (!base.has(key)) base.set(key, await run(c, before, before, sem));
    const b = base.get(key);
    const after = answersFor(c,{[field]:value});
    if (JSON.stringify((after as any)[field]) === JSON.stringify((before as any)[field])) continue;
    const a = await run(c, before, after, sem);
    n++;
    const aHyd = new Set(a.hyd), aAcc = new Set(a.acc), aW = new Set(a.w);
    if (b.hyd.some((id:string)=>!aHyd.has(id))) lossHyd++;
    const common = b.hyd.filter((id:string)=>aHyd.has(id));
    const bAccSet = new Set(b.acc);
    const lostAcc = common.filter((id:string)=>bAccSet.has(id) && !aAcc.has(id));
    if (lostAcc.length) { lossAccCommon++; if (ex.length<20) ex.push(`${c.company} ${field}=${JSON.stringify(value)} late=[${[...a.late]}] lost ${lostAcc.slice(0,3)}`); }
    if (b.w.some((id:string)=>!aW.has(id))) lossW++;
  }
}
console.log(`cases ${n}`);
console.log(`answers that changed the SELECTED pool (lost a row from hydrated) ${lossHyd}`);
console.log(`answers that REMOVED a commonly-selected fund at accessiblePool   ${lossAccCommon}`);
console.log(`answers that cost a fund its seat in toWriter                     ${lossW}`);
for (const e of ex) console.log("   ", e);
})();
