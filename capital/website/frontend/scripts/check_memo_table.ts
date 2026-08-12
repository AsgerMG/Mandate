/**
 * Does every archetype actually GET A TABLE, and does that table hold up?
 *
 * FREE and deterministic: the memo's own pool builder, gate hydration and
 * candidate order, and the code-built half of every published row. No model
 * call, no gitignored data.
 *
 * ── Why this exists, and why check_archetypes could not do its job ────────
 * FUND-1 says at least one row publishes. `checkBrief` has always been able to
 * say so -- and it runs in TWO PAID BENCH SCRIPTS AND NOWHERE ELSE. It is
 * absent from `npm run check`, absent from every route, and its only free
 * execution is over seven hand-written fixtures in a unit test. So no brief
 * this pipeline has ever produced was checked against any contract rule, and
 * an archetype receiving ZERO ROWS shipped until a human rendered the page and
 * looked at it.
 *
 * `check_archetypes.ts` is in the suite and could not see it either, for two
 * reasons worth writing down because both are general:
 *
 *   IT GRADES THE WRONG PATH. It calls `computeVerdict`, the instant screen,
 *   which caps at DISPLAY_CAP and never drops a blocked row. The memo builds a
 *   different pool, in a different order, and cuts it differently. The founder
 *   reads the memo.
 *   IT ASKS A DIFFERENT QUESTION. `minAccessible` counts what the corpus holds
 *   for that profile. The defect was that the RANKING never reached those
 *   funds: 22 were accessible and the first sat at rank 81, sixty-three places
 *   below the pool cut. Reachability in the corpus and reachability in the
 *   product are not the same number and only one of them is the product.
 *
 * ── The property ─────────────────────────────────────────────────────────
 *
 *   A FOUNDER FOR WHOM THE CORPUS HOLDS AN ACCESSIBLE FUND RECEIVES A TABLE.
 *   WHERE IT HOLDS NONE, THE BRIEF SAYS SO AND SAYS WHAT WOULD CHANGE IT.
 *
 * Both halves fail here. The second is FUND-1's own second sentence and is
 * checked through `explainNoDoors`, so the honest-empty answer is a thing the
 * build can distinguish from silence rather than a thing a human has to notice.
 *
 * The rows are then run through the code-decidable brief rules. The writer's
 * fields are absent at this stage, so the rules about them are skipped by
 * construction and named in the output rather than silently passing -- a check
 * that reports "ok" over rules it never evaluated is the fault this file exists
 * to stop.
 *
 * Run: npx tsx scripts/check_memo_table.ts
 */
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("check_memo_table", ["DATABASE_URL", "VOYAGE_KEY"]);

/** Rules whose predicate reads a field only the writer fills. They are named
 *  rather than skipped silently. */
const WRITER_RULES = new Set(["FUND-4", "FUND-5", "FUND-6", "BL-1", "BL-2", "BL-B1", "BRIEF-1", "BRIEF-2", "SOP-1", "SOP-2", "POS-1"]);

async function main() {
  const {
    findPeersBySubsector, hydrateDbInstruments, isGenericSubsector, matchCompany, resetGateHydration,
  } = await import("../lib/intelligence/corpus");
  const {
    applyProfileSignal, buildInstrumentTableHydrated, founderCountryList,
    tableInputFromAnswers, VERDICT_POOL,
  } = await import("../lib/intelligence/shortlist");
  const { evaluateEligibility } = await import("../lib/intelligence/eligibility");
  const { ExclusionLog } = await import("../lib/intelligence/exclusions");
  const { accessiblePool, explainNoDoors, orderMemoCandidates } = await import("../lib/intelligence/memoCandidates");
  const { buildRowsForCheck } = await import("../lib/intelligence/pipeline");
  const { BRIEF_LIMITS, checkBrief } = await import("../lib/intelligence/briefChecks");
  const { semanticFundMatch, rankerTallyLine, resetRankerTally } = await import("../lib/intelligence/semantic");
  const { COMPANIES } = await import("../lib/intelligence/__benchCompanies");
  const { sanitizeEligibility } = await import("../lib/intelligence/sanitize");

  await hydrateDbInstruments();
  resetRankerTally();

  let failures = 0;
  const skipped = new Set<string>();
  console.log("company".padEnd(20) + "ranked  accessible  rows  verdict");
  console.log("-".repeat(96));

  for (const c of COMPANIES) {
    resetGateHydration();
    const eligibility = sanitizeEligibility({
      sector: c.sector, activities: c.activities ?? ["none"],
      useOfFunds: ["experimental_development", "industrial_research"],
      entityCountries: [c.country], exclusionFlags: ["none"],
      cofinancingBand: ">50%", consortium: "unsure",
      borrowerModel: c.borrowerModel ?? "operating",
      fteBand: c.fteBand, ticketBand: c.ticketBand,
      developmentStage: c.developmentStage,
    }) as never;

    const selfRecord = matchCompany(c.company, c.country);
    const targetSub =
      selfRecord.matched && !isGenericSubsector(selfRecord.subsector) ? selfRecord.subsector : "";
    const dbPeers = targetSub
      ? findPeersBySubsector(targetSub, { country: c.country, limit: 4, exclude: [c.company] })
      : [];
    const semantic = await semanticFundMatch(c.description);
    const log = new ExclusionLog();
    const hydrated = await buildInstrumentTableHydrated({
      fieldChannels: new Set<string>([
        ...(selfRecord.matched ? selfRecord.channels : []),
        ...dbPeers.flatMap((r) => r.channels),
      ]),
      founderCountries: founderCountryList(c.country, [c.country], [c.country]),
      capitalSought: ["grant", "loan"],
      description: c.description,
      semantic,
      ...tableInputFromAnswers(eligibility),
      log,
    } as never);

    const accessible = accessiblePool(hydrated, eligibility, log);
    // `POOL=legacy` reproduces the cut as it stood before the pool held only
    // publishable rows. It exists so this check can be SEEN to go red on the
    // defect it was written for, rather than asserted to. On that arm, Neura
    // Robotics publishes zero rows while 22 accessible funds sit in the
    // ranking, and this file exits non-zero.
    const instrumentTable = applyProfileSignal(
      (process.env.POOL === "legacy" ? hydrated : accessible).slice(0, VERDICT_POOL),
      undefined, undefined);
    const poolIds = instrumentTable.map((r) => r.instrumentId).filter(Boolean) as string[];
    const { toWriter } = orderMemoCandidates({
      instrumentTable,
      req: { company: c.company, country: c.country, description: c.description,
             capitalSought: ["grant", "loan"], targetMarkets: [c.country], eligibility } as never,
      records: [], dbPeers,
      eligibilityScreen: evaluateEligibility(eligibility, poolIds.slice(0, 6)),
      log,
    });

    // The rows exactly as the memo builds them, writer fields still empty, cut
    // to the published cap. The writer may drop a candidate below this, so the
    // set here is the code-side UPPER bound on what publishes -- which is the
    // right set for every rule about what a row IS, and is stated as a bound
    // rather than presented as the finished table.
    const institutions = buildRowsForCheck(toWriter.map((x) => x.row), [], dbPeers)
      .slice(0, BRIEF_LIMITS.institutionsMax);
    const noDoors = accessible.length === 0 ? explainNoDoors(hydrated, eligibility) : undefined;

    const violations = checkBrief(
      { institutions, noDoors } as never, undefined,
      buildRowsForCheck(toWriter.map((x) => x.row), [], dbPeers).map((r) => r.institution))
      .filter((v) => {
        if (WRITER_RULES.has(v.ruleId)) { skipped.add(v.ruleId); return false; }
        return true;
      });

    const problems: string[] = violations.map((v) => `${v.ruleId}: ${v.detail}`);
    // The property, both halves.
    if (institutions.length === 0 && accessible.length > 0) {
      problems.push(`no rows published while ${accessible.length} accessible funds exist in the ranking`);
    }
    if (problems.length) failures += 1;
    console.log(
      c.company.slice(0, 19).padEnd(20) +
      String(hydrated.length).padStart(6) +
      String(accessible.length).padStart(12) +
      String(institutions.length).padStart(6) + "  " +
      (problems.length ? "FAIL" : "ok") +
      (problems.length ? "\n" + problems.map((p) => `${" ".repeat(22)}${p}`).join("\n") : ""));
  }

  console.log("-".repeat(96));
  console.log(rankerTallyLine());
  // Named, not silent. A check that reports ok over rules it never evaluated is
  // the fault this file exists to stop, so the rules it CANNOT evaluate here
  // are printed every run.
  console.log(`not evaluated at this stage (writer fields are empty): ` +
    `${[...WRITER_RULES].sort().join(", ")}`);
  console.log(failures === 0
    ? `all ${COMPANIES.length} archetypes publish a table that holds up`
    : `${failures} of ${COMPANIES.length} archetypes need attention`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main();
