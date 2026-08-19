import { BAND_ORDERS, VOCABULARY } from "../lib/intelligence/vocabulary";
for (const f of ["ticketBand","turnoverBand","balanceBand","cofinancingBand","fteBand","exclusionFlags","useOfFunds","ownerOver25","nonEuControl","lossesOverHalfCapital","developmentStage","conditionality"]) {
  console.log(`${f}:`);
  console.log(`   BAND_ORDERS: ${JSON.stringify(BAND_ORDERS[f] ?? null)}`);
  const v = VOCABULARY[f];
  console.log(`   VOCAB: multi=${v?.multi} values=${JSON.stringify(v?.values ?? null)}`);
  if (v && (v as any).labels) console.log(`   LABELS: ${JSON.stringify((v as any).labels)}`);
}
