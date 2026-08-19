/**
 * Traces the REAL memo candidate funnel: the accessible pool, the cut to
 * `VERDICT_POOL`, the display-name collapse, the writer cap, and what the
 * published table would be.
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
 * Run: npx tsx scripts/trace_pool.ts
 *
 * ── LIVE ONLY, AND IT SAYS SO RATHER THAN DEGRADING ───────────────────────
 * `NO_PG=1` used to run this against the JSON snapshot, and the docstring
 * warned in the same breath that it is "a DIFFERENT pool -- always confirm a
 * thematic mismatch against the live path before treating it as a bug". That
 * warning is the argument against the mode: the only column anybody runs this
 * for is the per-fund VERDICT, and a verdict needs `hydrateGatesFor`, which
 * needs the database. An offline run printed a verdict column computed from
 * whatever gates happened to be loaded, under the same heading as the real one.
 * So the offline path SKIPS, loudly, instead of answering a question it cannot.
 *
 * ── IT REIMPLEMENTED THE FUNNEL, AND ITS COPY WAS WRONG (wsGI) ─────────────
 * This file used to build the candidate list itself: its own `.slice(0, 18)`
 * with the pool depth typed in, its own blocked filter, and its own dedupe by
 * display name. Two of the three had drifted from the path they claim to trace:
 *
 *   THE DEDUPE DELETED. `alive.filter(...)` dropped every row whose display
 *     name it had already seen, first-wins. `rules.ts` declares SEL-DUPE-NAME
 *     `demote-not-delete` WITH the measurement attached (pool recall 97% ->
 *     83% when the sibling rule was a filter), and `nameCollision.ts` exists
 *     because of that and explicitly refutes first-wins survivor selection. So
 *     `deduped=` under-reported the writer's candidate count on every founder
 *     with a colliding pair, and `-> writer=` printed a funnel narrower than
 *     the one that runs.
 *
 *   THE POOL WAS UNHYDRATED. `buildInstrumentTable` without
 *     `hydrateGatesFor`, so `assessAll` judged every row on whatever gates
 *     happened to be loaded. Production hydrates the gates for exactly the rows
 *     it selects, and the verdict column here is the reason anyone runs this.
 *
 *   THE DEPTH WAS A LITERAL 18. `VERDICT_POOL` is an env lever and takes
 *     `all`; a sweep would have moved the pipeline and not this trace.
 *
 * The irony is written three lines above the offending log call in the old
 * version: it records that this same line once printed 9 while the writer cap
 * had been 7 for months, and fixed the number rather than the retyping. So it
 * now calls `accessiblePool` and `orderMemoCandidates` — production's own, the
 * same two `measure_funnel` and every other free harness call — and there is
 * one implementation of the candidate order in this repo.
 */
import { COMPANIES } from "../lib/intelligence/__benchCompanies";
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
const CREDS = requireCredentials("trace_pool", ["DATABASE_URL", "VOYAGE_KEY"]);

async function main() {
  if (CREDS === "offline") {
    console.log("trace_pool: skipped — NO_PG=1. This traces the memo's candidate order, "
      + "whose only interesting column is the per-fund verdict, and a verdict needs the "
      + "gates hydrated for exactly the rows in the pool. Run without NO_PG.");
    return;
  }
  const {
    hydrateDbInstruments, hydrateGatesFor, requireLiveCorpus, resetGateHydration,
  } = await import("../lib/intelligence/corpus");
  const P = await import("../lib/intelligence/shortlist");
  const { VERDICT_POOL, WRITER_CANDIDATE_CAP } = await import("../lib/intelligence/caps");
  const { BRIEF_LIMITS } = await import("../lib/intelligence/briefChecks");
  const { accessiblePool, orderMemoCandidates } =
    await import("../lib/intelligence/memoCandidates");
  const { evaluateEligibility } = await import("../lib/intelligence/eligibility");
  const { ExclusionLog } = await import("../lib/intelligence/exclusions");
  const { sanitizeEligibility } = await import("../lib/intelligence/sanitize");
  const { semanticFundMatch } = await import("../lib/intelligence/semantic");

  await hydrateDbInstruments();
  requireLiveCorpus("trace_pool");

  for (const t of COMPANIES) {
    // Gate hydration is per-founder in production. Resetting between companies
    // is what stops one archetype's gates deciding the next one's verdicts.
    resetGateHydration();
    const el = sanitizeEligibility({
      sector: t.sector, activities: t.activities ?? ["none"],
      useOfFunds: ["experimental_development", "industrial_research"],
      entityCountries: [t.country], exclusionFlags: ["none"],
      cofinancingBand: ">50%", consortium: "unsure",
      borrowerModel: t.borrowerModel ?? "operating",
      fteBand: t.fteBand, ticketBand: t.ticketBand,
      developmentStage: t.developmentStage,
    }) as never;
    const log = new ExclusionLog();
    const table = await P.buildInstrumentTableHydrated({
      fieldChannels: new Set<string>(),
      founderCountries: P.founderCountryList(t.country, [t.country]),
      capitalSought: ["grant", "loan"],
      description: t.description,
      semantic: await semanticFundMatch(t.description),
      ...P.tableInputFromAnswers(el),
      log,
    } as never);
    // Production's own order of operations: the blocked drop, THEN the cut, so
    // the cut can backfill rather than shrink the table. See `accessiblePool`.
    const accessible = P.applyProfileSignal(
      accessiblePool(table, el, log), undefined, undefined);
    const pool = accessible.slice(0, VERDICT_POOL);
    const poolIds = pool.map((r) => r.instrumentId).filter(Boolean) as string[];
    await hydrateGatesFor(poolIds);
    // ITS OWN LOG, and that is not tidiness. SEL-DUPE-NAME has TWO recorders --
    // `materialiseInstrumentTable` collapses the SCREEN's labels and this
    // collapses the MEMO's -- and one shared log would report their sum under
    // one surface's heading. One label per surface is exactly the arrangement
    // `nameCollision.ts` asks for; counting them together undoes it.
    const orderLog = new ExclusionLog();
    const { ordered, toWriter, assessments } = orderMemoCandidates({
      instrumentTable: pool,
      req: { company: t.company, country: t.country, description: t.description,
             capitalSought: ["grant", "loan"],
             eligibility: el } as never,
      records: [], dbPeers: [],
      eligibilityScreen: evaluateEligibility(el, poolIds),
      log: orderLog,
    });

    // `ordered` is a PERMUTATION of the pool — the collapse demotes, it does
    // not delete — so a "deduped" count would be the pool's own length and say
    // nothing. What the collapse costs is a PLACE, so that is what is printed.
    const demoted = orderLog.countsByRule()["SEL-DUPE-NAME"] ?? 0;
    console.log(
      `${t.company.padEnd(16)} table=${String(table.length).padEnd(3)} `
      + `accessible=${String(accessible.length).padEnd(3)} pool=${String(pool.length).padEnd(3)} `
      + `name-demoted=${String(demoted).padEnd(2)} -> writer=${toWriter.length}`
      + `/${WRITER_CANDIDATE_CAP} -> published<=${BRIEF_LIMITS.institutionsMax}`);
    for (const [i, c] of ordered.entries()) {
      const st = c.row.instrumentId ? assessments.get(c.row.instrumentId)?.status : "-";
      // Where the writer cap and the published cap fall, on the rows they fall
      // between, so a thin brief is diagnosable off this output alone.
      const mark = i < BRIEF_LIMITS.institutionsMax ? "PUB"
        : i < WRITER_CANDIDATE_CAP ? "wri" : "   ";
      console.log(`  ${mark} ${String(i + 1).padStart(2)} `
        + `${String(c.row.channel).padEnd(24)} `
        + `${P.displayInstitutionName(c.row).slice(0, 42).padEnd(43)} ${st}`);
    }
  }
}
main();
