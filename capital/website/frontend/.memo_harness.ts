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
    lossesOverHalfCapital: undefined as never,
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

let partialSeenAt: number | null = null;
const t0 = Date.now();

const emit = (e: ProgressEvent) => {
  if (e.type === "status") console.error(`[${e.step}] ${e.detail ?? ""}`);
  if (e.type === "error") console.error("ERROR:", e.message);
  if (e.type === "partial") {
    partialSeenAt = Date.now() - t0;
    console.error(
      `[partial @ ${partialSeenAt}ms] self.matched=${e.data.self.matched} ` +
        `eligibilityScreen=${e.data.eligibilityScreen.length} rows, ` +
        `institutions=${e.data.institutions.length} rows ` +
        `(whyEligible empty on all: ${e.data.institutions.every((i) => !i.whyEligible)})`,
    );
    for (const inst of e.data.institutions)
      console.error(`  - ${inst.institution} [${inst.ticket}] peers: ${inst.comparableFirms.map((f) => f.name).join(", ") || "none"}`);
  }
  if (e.type === "report") {
    console.error(`[report @ ${Date.now() - t0}ms]${partialSeenAt !== null ? ` (partial arrived ${Date.now() - t0 - partialSeenAt}ms earlier)` : " (NO partial event was ever seen!)"}`);
    const r = e.data;
    const wc = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
    console.log("\n=== BOTTOM LINE ===");
    for (const b of r.bottomLine) console.log(`- (${wc(b)}w) ${b}`);
    console.log("\n=== ELIGIBILITY SCREEN ===");
    for (const c of r.eligibilityScreen ?? [])
      console.log(`- [${c.status}] ${c.check}: ${c.finding.slice(0, 90)}${c.cure ? " | PATH: " + c.cure.slice(0, 60) : ""} (${c.source.file} ${c.source.locator})`);
    console.log("\n=== WHERE TO TARGET (" + r.institutions.length + ") ===");
    for (const inst of r.institutions) {
      console.log(`- ${inst.institution} [${inst.ticket}] (${inst.supportType})`);
      console.log(`  where/basis: ${[inst.country, inst.legalBasis].filter(Boolean).join(" · ") || "(none on record)"}`);
      console.log(`  why: ${inst.whyEligible}`);
      console.log(`  move: ${inst.nextStep}`);
      console.log(`  peers: ${inst.comparableFirms.map((f) => `${f.name} (${f.amount})`).join(", ") || "none traced yet"}`);
    }
    console.log(`\n=== POSITIONING (${wc(r.positioning)}w) ===\n` + r.positioning);
    console.log(`\n=== STATE OF PLAY (${wc(r.stateOfPlay)}w) ===\n` + r.stateOfPlay);
    const totalWords = r.bottomLine.reduce((n, b) => n + wc(b), 0) + wc(r.positioning) + wc(r.stateOfPlay);
    console.log(`\n=== TOTAL PROSE WORDS: ${totalWords} ===`);
    console.log("\n=== CAVEATS ===\n" + r.caveats);
  }
};

runIntelligence(req, emit).catch((e) => {
  console.error(e);
  process.exit(1);
});
