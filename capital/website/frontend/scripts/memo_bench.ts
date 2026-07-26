/**
 * Run REAL companies — one per next-generation archetype — through the actual
 * memo pipeline, and dump each brief for quality review.
 *
 * This is an OUTPUT-QUALITY harness, not a unit test. check_archetypes.ts
 * asserts the machinery behaves; this reads what a founder would actually be
 * handed and asks whether it is any good.
 *
 * Calls runIntelligence() directly rather than POSTing to /api/intelligence:
 * the route rate-limits at 5 per hour per IP, which a 12-company sweep would
 * trip immediately. Same pipeline, same prompts, same model calls.
 *
 * COSTS REAL MONEY — each company is a full research + synthesis run.
 *
 * Runs a SMALL ROTATING SAMPLE by default (2 companies), not the whole set.
 * Each run picks the ones least recently tested and records the timestamp in
 * memo-bench/history.json, so repeated runs cover everything over time while
 * keeping any single batch cheap. A full 12-company sweep is real money.
 *
 * Run: npx tsx scripts/memo_bench.ts                    # 2 least-recently-tested
 *      npx tsx scripts/memo_bench.ts --sample 4
 *      npx tsx scripts/memo_bench.ts --only "Robotics,MedTech"
 *      npx tsx scripts/memo_bench.ts --all              # everything, costs the most
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

/** Real European companies, one per archetype. Chosen to be genuinely of that
 *  nature and plausibly present in the public-funding record, so the memo has
 *  something real to work with. */
const COMPANIES = [
  { archetype: "Robotics", company: "Neura Robotics", country: "Germany",
    description: "Cognitive humanoid and cobot systems for industrial automation",
    sector: "hardware_robotics", fteBand: "250+", ticketBand: "b15m_50m", developmentStage: "scaling_revenue" },
  { archetype: "Hardware", company: "SMART Photonics", country: "Netherlands",
    description: "Indium phosphide photonic integrated circuits foundry",
    sector: "hardware_robotics", fteBand: "50-249", ticketBand: "b15m_50m", developmentStage: "scaling_revenue" },
  { archetype: "FinTech (business lending)", company: "Silvr", country: "France",
    description: "Revenue-based financing for e-commerce and SME businesses",
    sector: "financial_services", borrowerModel: "balance_sheet_lender",
    fteBand: "50-249", ticketBand: "b2m5_15m", developmentStage: "scaling_revenue" },
  { archetype: "FinTech (consumer banking)", company: "bunq", country: "Netherlands",
    description: "Licensed consumer neobank offering current accounts, cards and savings",
    sector: "financial_services", fteBand: "250+", ticketBand: "b15m_50m", developmentStage: "scaling_revenue" },
  { archetype: "AI B2C software", company: "Photoroom", country: "France",
    description: "Consumer generative AI app for product photography and image editing",
    sector: "software_digital", fteBand: "50-249", ticketBand: "b2m5_15m", developmentStage: "scaling_revenue" },
  { archetype: "AI B2B software", company: "Aleph Alpha", country: "Germany",
    description: "Sovereign large language models and AI infrastructure for enterprise and government",
    sector: "software_digital", fteBand: "50-249", ticketBand: "b15m_50m", developmentStage: "scaling_revenue" },
  { archetype: "GovTech", company: "Nortal", country: "Estonia",
    description: "Digital government platforms, e-identity and public sector data services",
    sector: "software_digital", fteBand: "250+", ticketBand: "b2m5_15m", developmentStage: "scaling_revenue" },
  { archetype: "Platform", company: "sennder", country: "Germany",
    description: "Digital road freight forwarding platform matching shippers with carriers",
    sector: "software_digital", fteBand: "250+", ticketBand: "b2m5_15m", developmentStage: "scaling_revenue" },
  { archetype: "Cloud / NeoCloud", company: "Nebius", country: "Netherlands",
    description: "GPU cloud infrastructure and managed services for AI training workloads",
    sector: "software_digital", fteBand: "250+", ticketBand: "gt50m", developmentStage: "scaling_revenue" },
  { archetype: "MedTech", company: "Corti", country: "Denmark",
    description: "Real-time AI copilot for clinical consultations and emergency triage",
    sector: "health_lifesciences", fteBand: "50-249", ticketBand: "b2m5_15m", developmentStage: "pilot_customers" },
  { archetype: "Life sciences", company: "BioNTech", country: "Germany",
    description: "mRNA immunotherapies and vaccines, clinical and commercial stage",
    sector: "health_lifesciences", fteBand: "250+", ticketBand: "gt50m", developmentStage: "scaling_revenue" },
  { archetype: "AgriTech", company: "eAgronom", country: "Estonia",
    description: "Farm management software and soil carbon programmes for arable growers",
    sector: "agrifood", fteBand: "10-49", ticketBand: "b500k_2m5", developmentStage: "pilot_customers" },
];

async function main() {
  const args = process.argv.slice(2);
  const onlyArg = args.indexOf("--only");
  const only = onlyArg !== -1 ? args[onlyArg + 1].split(",").map((s) => s.trim()) : null;
  const concArg = args.indexOf("--concurrency");
  const concurrency = concArg !== -1 ? Number(args[concArg + 1]) : 3;

  const { hydrateDbInstruments } = await import("../lib/intelligence/corpus");
  const { runIntelligence } = await import("../lib/intelligence/pipeline");
  await hydrateDbInstruments();

  const sampleArg = args.indexOf("--sample");
  const sample = sampleArg !== -1 ? Number(args[sampleArg + 1]) : 2;
  const all = args.includes("--all");

  // Least-recently-tested first, so successive small runs sweep the set.
  const HISTORY = "memo-bench/history.json";
  const history: Record<string, number> = existsSync(HISTORY)
    ? JSON.parse(readFileSync(HISTORY, "utf8"))
    : {};
  let targets = COMPANIES.filter((c) => !only || only.includes(c.archetype));
  if (!only && !all) {
    targets = [...targets]
      .sort((a, b) => (history[a.archetype] ?? 0) - (history[b.archetype] ?? 0))
      .slice(0, sample);
  }
  const untested = COMPANIES.filter((c) => !history[c.archetype]).length;
  console.log(`${untested} of ${COMPANIES.length} archetypes never tested\n`);
  mkdirSync("memo-bench", { recursive: true });
  console.log(`running ${targets.length} companies, concurrency ${concurrency}\n`);

  const results: Record<string, unknown>[] = [];
  const queue = [...targets];
  const workers = Array.from({ length: concurrency }, async () => {
    for (;;) {
      const c = queue.shift();
      if (!c) return;
      const t0 = Date.now();
      const { archetype, company, country, description, sector, ...rest } = c;
      const eligibility = {
        sector, entityCountries: [country], exclusionFlags: ["none"],
        cofinancingBand: ">50%", consortium: "unsure",
        borrowerModel: (rest as Record<string, string>).borrowerModel ?? "operating",
        fteBand: (rest as Record<string, string>).fteBand,
        ticketBand: (rest as Record<string, string>).ticketBand,
        developmentStage: (rest as Record<string, string>).developmentStage,
      };
      let report: Record<string, unknown> | null = null;
      let error: string | null = null;
      try {
        await runIntelligence(
          { company, country, description, capitalSought: ["grant", "loan"], eligibility } as never,
          (e: { type: string; data?: unknown; message?: string }) => {
            if (e.type === "report") report = e.data as Record<string, unknown>;
            if (e.type === "error") error = e.message ?? "unknown error";
          },
        );
      } catch (err) {
        error = String(err);
      }
      const secs = Math.round((Date.now() - t0) / 1000);
      results.push({ archetype, company, country, secs, error, report });
      console.log(`  ${archetype.padEnd(28)} ${company.padEnd(18)} ${secs}s ${error ? "ERROR: " + error : "ok"}`);
    }
  });
  await Promise.all(workers);

  const stamp = Date.now();
  for (const r of results) if (!r.error) history[r.archetype as string] = stamp;
  writeFileSync(HISTORY, JSON.stringify(history, null, 1));
  writeFileSync(`memo-bench/run-${stamp}.json`, JSON.stringify(results, null, 1));
  const remaining = COMPANIES.filter((c) => !history[c.archetype]).map((c) => c.archetype);
  console.log(`\nwrote memo-bench/run-${stamp}.json`);
  console.log(remaining.length ? `still untested: ${remaining.join(", ")}` : "every archetype has been tested");
}

main();
