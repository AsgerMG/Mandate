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
 *      NO_PG=1 npx tsx scripts/trace_pool.ts  # JSON snapshot, no semantic layer
 *
 * Semantic matching needs DATABASE_URL + VOYAGE_KEY. Under NO_PG it degrades
 * to the lexical fallback, which is a DIFFERENT pool -- always confirm a
 * thematic mismatch against the live path before treating it as a bug.
 */
import { COMPANIES } from "../lib/intelligence/__benchCompanies";
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("trace_pool", ["DATABASE_URL", "VOYAGE_KEY"]);

async function main() {
  const { hydrateDbInstruments } = await import("../lib/intelligence/corpus");
  const P = await import("../lib/intelligence/shortlist");
  const { assessAll } = await import("../lib/intelligence/verdict");
  const { semanticFundMatch } = await import("../lib/intelligence/semantic");
  await hydrateDbInstruments();
  for (const t of COMPANIES) {
    const el = { sector: t.sector, entityCountries: [t.country], exclusionFlags: ["none"],
      cofinancingBand: ">50%", consortium: "unsure",
      borrowerModel: t.borrowerModel ?? "operating",
      fteBand: t.fteBand, ticketBand: t.ticketBand,
      developmentStage: t.developmentStage } as never;
    const table = P.applyProfileSignal(
      P.buildInstrumentTable({
        fieldChannels: new Set<string>(),
        ticketBand: t.ticketBand,
        consortiumOk: true,
        founderCountries: [t.country],
        capitalSought: ["grant", "loan"],
        description: t.description,
        semantic: await semanticFundMatch(t.description),
      }).slice(0, 18),
      undefined, undefined);
    const ids = table.map((r) => r.instrumentId).filter(Boolean) as string[];
    const a = assessAll(ids, el);
    const alive = table.filter((r) => r.instrumentId && a.get(r.instrumentId)?.status !== "blocked");
    const seen = new Set<string>();
    const deduped = alive.filter((r) => {
      const n = P.displayInstitutionName(r);
      if (seen.has(n)) return false; seen.add(n); return true;
    });
    console.log(`${t.company.padEnd(16)} pool=${String(table.length).padEnd(3)} alive=${String(alive.length).padEnd(3)} deduped=${String(deduped.length).padEnd(3)} -> writer=${Math.min(deduped.length, 9)}`);
    for (const r of table) {
      const st = r.instrumentId ? a.get(r.instrumentId)?.status : "-";
      console.log(`             ${String(r.channel).padEnd(24)} ${P.displayInstitutionName(r).slice(0,42).padEnd(43)} ${st}`);
    }
  }
}
main();
