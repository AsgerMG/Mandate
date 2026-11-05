/**
 * wsCY — the memo funnel for the twelve bench companies, WITHOUT the writer.
 *
 * FREE: one Voyage embed and one Postgres read per company. No model calls.
 *
 * ── Why this exists, and what it found in its first run ────────────────────
 * A rendered brief showed one archetype receiving ZERO ROWS. Nothing that runs
 * for free could see it, because the only funnel diagnostic in the repo was
 * tracing a different, healthier path: `trace_pool.ts` builds its pool with
 * `buildInstrumentTable` and then calls `assessAll` WITHOUT hydrating gates, so
 * every verdict it prints is `unknown` and the blocked-drop it claims to trace
 * can never fire. It also answers the intake on the founder's behalf and never
 * resolves the founder's own corpus record, so `fieldChannels` — tier 1 of the
 * row sort — is empty on every row. It reported `pool=18 alive=18` for the
 * founder who was getting nothing.
 *
 * This traces the path production takes: the same pool builder, the same gate
 * hydration, the same `orderMemoCandidates`, with only the web-comparable call
 * omitted (it is a model call, and it can only ADD channels, so this is a lower
 * bound on the pool, never an upper one).
 *
 * ── The two questions it answers ──────────────────────────────────────────
 * REACH   how many of the rows the ranker could have chosen from are
 *         conclusively blocked, where the first accessible one sits in that
 *         ranking, and therefore whether the pool cut lands before or after it.
 * FUNNEL  what actually reaches the writer, and what route each row asserts.
 *
 * Run: npx tsx scripts/_wscy_funnel.ts                 # reach summary only
 *      npx tsx scripts/_wscy_funnel.ts --rows          # every candidate row
 *      npx tsx scripts/_wscy_funnel.ts --only Robotics
 */
import { COMPANIES } from "../lib/intelligence/__benchCompanies";
import { sanitizeEligibility } from "../lib/intelligence/sanitize";
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("wscy_funnel", ["DATABASE_URL", "VOYAGE_KEY"]);

async function main() {
  const args = process.argv.slice(2);
  const onlyArg = args.indexOf("--only");
  const only = onlyArg !== -1 ? args[onlyArg + 1].split(",").map((s) => s.trim()) : null;
  const showRows = args.includes("--rows");

  const {
    findPeersBySubsector, hydrateDbInstruments, hydrateGatesFor, isGenericSubsector,
    loadDbInstruments, matchCompany, resetGateHydration,
  } = await import("../lib/intelligence/corpus");
  const {
    applyProfileSignal, buildInstrumentTableHydrated, displayInstitutionName, DISPLAY_CAP,
    founderCountryList, tableInputFromAnswers, VERDICT_POOL,
  } = await import("../lib/intelligence/shortlist");
  const { evaluateEligibility } = await import("../lib/intelligence/eligibility");
  const { ExclusionLog } = await import("../lib/intelligence/exclusions");
  const { accessiblePool, orderMemoCandidates, WRITER_CANDIDATE_CAP } = await import("../lib/intelligence/memoCandidates");
  const { BRIEF_LIMITS } = await import("../lib/intelligence/briefChecks");
  const { assessAll } = await import("../lib/intelligence/verdict");
  const { rankerTallyLine, resetRankerTally, semanticFundMatch } = await import("../lib/intelligence/semantic");

  await hydrateDbInstruments();
  resetRankerTally();
  const byId = new Map(loadDbInstruments().map((i) => [i.id, i]));

  const targets = COMPANIES.filter((c) => !only || only.includes(c.archetype));
  console.log(
    "company".padEnd(19) + "fte".padEnd(8) + "ranked  alive  poolAlive  firstAlive  " +
    "->writer  blocked by");
  console.log("-".repeat(118));

  for (const c of targets) {
    resetGateHydration();
    const eligibility = sanitizeEligibility({
      sector: c.sector,
      activities: c.activities ?? ["none"],
      useOfFunds: ["experimental_development", "industrial_research"],
      entityCountries: [c.country],
      exclusionFlags: ["none"],
      cofinancingBand: ">50%",
      consortium: "unsure",
      borrowerModel: c.borrowerModel ?? "operating",
      fteBand: c.fteBand,
      ticketBand: c.ticketBand,
      developmentStage: c.developmentStage,
    }) as never;

    // Peers and field channels exactly as runIntelligence resolves them for a
    // founder whose web comparables came back empty.
    const selfRecord = matchCompany(c.company, c.country);
    const targetSub =
      selfRecord.matched && !isGenericSubsector(selfRecord.subsector) ? selfRecord.subsector : "";
    const dbPeers = targetSub
      ? findPeersBySubsector(targetSub, { country: c.country, limit: 4, exclude: [c.company] })
      : [];
    const fieldChannels = new Set<string>([
      ...(selfRecord.matched ? selfRecord.channels : []),
      ...dbPeers.flatMap((r) => r.channels),
    ]);

    const semantic = await semanticFundMatch(c.description);
    const log = new ExclusionLog();
    const hydrated = await buildInstrumentTableHydrated({
      fieldChannels,
      founderCountries: founderCountryList(c.country, [c.country]),
      capitalSought: ["grant", "loan"],
      description: c.description,
      semantic,
      ...tableInputFromAnswers(eligibility),
      log,
    } as never);

    // ── REACH: the whole ranked list, assessed ──────────────────────────────
    // Gates for every one of these are ALREADY in memory —
    // `buildInstrumentTableHydrated` fetched them for exactly the rows it
    // selected, not for the head of the list. So assessing the full ranking
    // costs nothing over assessing the pool.
    const ranked = applyProfileSignal(hydrated, undefined, undefined);
    const rankedIds = ranked.map((r) => r.instrumentId).filter((id): id is string => Boolean(id));
    await hydrateGatesFor(rankedIds);
    const assessedAll = assessAll(rankedIds, eligibility);
    const isBlocked = (r: { instrumentId?: string }) =>
      Boolean(r.instrumentId) && assessedAll.get(r.instrumentId!)?.status === "blocked";
    const alive = ranked.filter((r) => !isBlocked(r));
    const firstAlive = ranked.findIndex((r) => !isBlocked(r));
    const poolAlive = ranked.slice(0, VERDICT_POOL).filter((r) => !isBlocked(r)).length;
    const reasons = new Map<string, number>();
    for (const r of ranked.slice(0, VERDICT_POOL)) {
      const a = r.instrumentId ? assessedAll.get(r.instrumentId) : undefined;
      if (a?.status === "blocked") {
        for (const b of a.blockers) reasons.set(b.field ?? "?", (reasons.get(b.field ?? "?") ?? 0) + 1);
      }
    }

    // ── FUNNEL: production's own pool cut and candidate order ───────────────
    // The cut is taken through `accessiblePool` exactly as runIntelligence
    // takes it. Running the OLD cut here instead is how the previous tracer
    // came to report a healthy funnel for a founder receiving nothing: a
    // diagnostic that builds its own pool grades a path that does not ship.
    const instrumentTable = applyProfileSignal(
      accessiblePool(hydrated, eligibility, log).slice(0, VERDICT_POOL), undefined, undefined);
    const poolIds = instrumentTable
      .map((r) => r.instrumentId).filter((id): id is string => Boolean(id));
    const eligibilityScreen = evaluateEligibility(eligibility, poolIds.slice(0, DISPLAY_CAP));
    const { toWriter, assessments } = orderMemoCandidates({
      instrumentTable,
      req: { company: c.company, country: c.country, description: c.description,
             capitalSought: ["grant", "loan"], eligibility } as never,
      records: [], dbPeers, eligibilityScreen, log,
    });

    console.log(
      c.company.slice(0, 18).padEnd(19) +
      String(c.fteBand).padEnd(8) +
      String(ranked.length).padStart(6) +
      String(alive.length).padStart(7) +
      String(poolAlive).padStart(11) + `/${VERDICT_POOL}` +
      String(firstAlive < 0 ? "none" : firstAlive + 1).padStart(9) +
      String(toWriter.length).padStart(10) + `/${WRITER_CANDIDATE_CAP}  ` +
      JSON.stringify(Object.fromEntries(reasons)) +
      (toWriter.length === 0
        ? `\n${" ".repeat(19)}██ ZERO CANDIDATES REACH THE WRITER — this founder gets an EMPTY memo`
        : ""));

    if (!showRows) continue;
    for (const [i, cand] of toWriter.entries()) {
      const row = cand.row;
      const leaf = row.instrumentId ? byId.get(row.instrumentId) : undefined;
      const parent = leaf?.parentId ? byId.get(leaf.parentId) : undefined;
      const route = row.applicationChannel ?? "";
      const parentRoute = parent?.application?.channel ?? "";
      const inherited = Boolean(route) && route === parentRoute;
      const st = assessments.get(row.instrumentId ?? "")?.status ?? "unknown";
      console.log(
        `   ${String(i + 1).padStart(2)}. [${st.padEnd(11)}] ` +
        `${displayInstitutionName(row).slice(0, 56).padEnd(56)} ` +
        `${(row.country ?? "").padEnd(3)} ${(row.deliveryRegion ?? "-").padEnd(6)} ` +
        `${(row.administeringBody ?? "-").slice(0, 44)}`);
      console.log(route
        ? `       route${inherited ? " [INHERITED]" : " [own]     "}: ${route.slice(0, 104)}`
        : `       route: (none recorded)`);
    }
  }
  console.log(`\npublished cap ${BRIEF_LIMITS.institutionsMax}`);
  console.log(rankerTallyLine());
}

main();
