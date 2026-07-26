/**
 * Traces the REAL memo candidate funnel: the VERDICT_POOL table, then blocked
 * rows dropped, then dedupe by display name, then the writer cap.
 *
 * FREE — no model calls. Use this before spending anything on memo_bench.ts:
 * it shows which instruments reach the writer and what verdict each carries,
 * which is where thin briefs and wrong-country rows are actually visible.
 * check_archetypes.ts asserts the machinery passes; this shows the contents.
 *
 * NOTE this deliberately differs from computeVerdict(), which caps at
 * DISPLAY_CAP (6) for the fast preliminary screen. Tracing that instead is how
 * an earlier debugging pass measured the wrong path entirely.
 *
 * Run: npx tsx scripts/trace_pool.ts          # against Postgres (live data)
 *      NO_PG=1 npx tsx scripts/trace_pool.ts  # against the JSON snapshot
 */
import { readFileSync } from "node:fs";
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
if (process.env.NO_PG) delete process.env.DATABASE_URL;
const CASES = [
  { c: "Nebius", country: "Netherlands", sector: "software_digital", tb: "gt50m", fte: "250+",
    d: "GPU cloud infrastructure and managed services for AI training workloads" },
  { c: "Corti", country: "Denmark", sector: "health_lifesciences", tb: "b2m5_15m", fte: "50-249",
    d: "Real-time AI copilot for clinical consultations and emergency triage" },
  { c: "Nortal", country: "Estonia", sector: "software_digital", tb: "b2m5_15m", fte: "250+",
    d: "Digital government platforms, e-identity and public sector data services" },
  { c: "BioNTech", country: "Germany", sector: "health_lifesciences", tb: "gt50m", fte: "250+",
    d: "mRNA immunotherapies and vaccines, clinical and commercial stage" },
  { c: "eAgronom", country: "Estonia", sector: "agrifood", tb: "b500k_2m5", fte: "10-49",
    d: "Farm management software and soil carbon programmes for arable growers" },
];
async function main() {
  const { hydrateDbInstruments } = await import("../lib/intelligence/corpus");
  const P = await import("../lib/intelligence/pipeline");
  const { assessAll } = await import("../lib/intelligence/verdict");
  await hydrateDbInstruments();
  for (const t of CASES) {
    const el = { sector: t.sector, entityCountries: [t.country], exclusionFlags: ["none"],
      cofinancingBand: ">50%", consortium: "unsure", borrowerModel: "operating",
      fteBand: t.fte, ticketBand: t.tb, developmentStage: "scaling_revenue" } as never;
    const table = P.applyProfileSignal(
      P.buildInstrumentTable(new Set<string>(), t.tb, true, [t.country], ["grant", "loan"], t.d, new Map()).slice(0, 18),
      undefined, undefined);
    const ids = table.map((r) => r.instrumentId).filter(Boolean) as string[];
    const a = assessAll(ids, el);
    const alive = table.filter((r) => r.instrumentId && a.get(r.instrumentId)?.status !== "blocked");
    const seen = new Set<string>();
    const deduped = alive.filter((r) => {
      const n = P.displayInstitutionName(r);
      if (seen.has(n)) return false; seen.add(n); return true;
    });
    console.log(`${t.c.padEnd(10)} pool=${String(table.length).padEnd(3)} alive=${String(alive.length).padEnd(3)} deduped=${String(deduped.length).padEnd(3)} -> writer=${Math.min(deduped.length, 9)}`);
    for (const r of table) {
      const st = r.instrumentId ? a.get(r.instrumentId)?.status : "-";
      console.log(`             ${String(r.channel).padEnd(24)} ${P.displayInstitutionName(r).slice(0,42).padEnd(43)} ${st}`);
    }
  }
}
main();
