// Scratch harness: run the full memo pipeline from the CLI (no dev server).
// Usage, from website/frontend:  npx tsx --env-file=.env.local .memo_harness.ts
import { runIntelligence } from "./lib/intelligence/pipeline";
import type { ProgressEvent } from "./lib/intelligence/types";

const req = {
  company: "Mistral AI",
  sector: "artificial intelligence",
  country: "France",
  companyType: "Deep-tech breakthrough",
  description:
    "Frontier AI lab building open and commercial large language models; scaling training compute and European data-centre capacity. Seeking EUR 20M+ of public or public-anchored capital for industrial-scale compute build-out.",
  capitalSought: ["loan", "equity", "grant"],
  targetMarkets: ["France", "Germany"],
  eligibility: {
    ticketBand: "b15m_50m",
    borrowerModel: "operating",
    entityCountries: ["France"],
    wouldOpenEntity: "depends",
    fteBand: "250+",
    turnoverBand: "10-50M",
    ownerOver25: "yes",
    cofinancingBand: ">50%",
    lossesOverHalfCapital: "no",
    conditionality: ["geo_commitments"],
    developmentStage: "scaling_revenue",
    activityCountries: ["France", "Germany"],
    consortium: "no",
    bankRelationship: "unsure",
    institutionalBacking: "yes",
    needBy: "months_6",
  },
};

const emit = (e: ProgressEvent) => {
  if (e.type === "status") console.error(`[${e.step}] ${e.detail ?? ""}`);
  if (e.type === "error") console.error("ERROR:", e.message);
  if (e.type === "report") {
    const r = e.data;
    console.log("\n=== HEADLINE ===\n" + r.overview.headline);
    console.log("\n=== BOTTOM LINE ===\n" + r.overview.bottomLine);
    console.log("\n=== LANDSCAPE OUTLOOK ===\n" + r.landscape.outlook);
    console.log("\n=== WATCH ITEMS ===");
    for (const w of r.landscape.watchItems)
      console.log(`- ${w.item} [${w.timeframe ?? "no date"}] (${w.source})\n  ${w.why}`);
    console.log("\n=== COMPARABLES (" + r.overview.competitors.length + ") ===");
    for (const c of r.overview.competitors.slice(0, 6))
      console.log(`- ${c.name} (${c.source}): ${c.euCapital}`);
    console.log("\n=== INSTRUMENT TABLE ===");
    for (const t of r.instrumentTable)
      console.log(`- ${t.instrument} [${t.ticket}]${t.usedInField ? " (used in field)" : ""}`);
    console.log("\n=== FUNDER MAP (" + r.funderMap.length + ") ===");
    for (const f of r.funderMap)
      console.log(`- ${f.funder}${f.nextDeadline ? " · " + f.nextDeadline : ""}`);
  }
};

runIntelligence(req, emit).catch((e) => {
  console.error(e);
  process.exit(1);
});
