/** wsCZ — Aleph Alpha's published rows, on whichever corpus is named. FREE.
 *
 *   npx tsx scripts/_wscz_aleph.ts                                  # today
 *   SNAPSHOT_FILE=/tmp/wscz_after.json npx tsx scripts/_wscz_aleph.ts
 *
 * CORPUS=json is implied: the point is to compare two snapshots. DATABASE_URL is
 * removed for hydration only and restored, so the ranker is the production
 * embedding one in both arms and the film scheme's disappearance cannot be an
 * artefact of a different ranker.
 */
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("wscz_aleph", ["DATABASE_URL", "VOYAGE_KEY"]);

const COMPANY = process.env.COMPANY ?? "Aleph Alpha";

async function main() {
  const {
    hydrateDbInstruments, loadDbInstruments, hydrateGatesFor, matchCompany,
    findPeersBySubsector, isGenericSubsector,
  } = await import("../lib/intelligence/corpus");
  const { semanticFundMatch, rankerTallyLine, resetRankerTally } =
    await import("../lib/intelligence/semantic");
  const { sanitizeEligibility } = await import("../lib/intelligence/sanitize");
  const { COMPANIES } = await import("../lib/intelligence/__benchCompanies");
  const { ExclusionLog } = await import("../lib/intelligence/exclusions");
  const { evaluateEligibility } = await import("../lib/intelligence/eligibility");
  const { accessiblePool, orderMemoCandidates } = await import("../lib/intelligence/memoCandidates");
  const {
    applyProfileSignal, buildInstrumentTableHydrated, DISPLAY_CAP, founderCountryList,
    tableInputFromAnswers, VERDICT_POOL,
  } = await import("../lib/intelligence/shortlist");

  const liveUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  await hydrateDbInstruments();
  if (liveUrl) process.env.DATABASE_URL = liveUrl;
  resetRankerTally();

  const c = COMPANIES.find((x) => x.company === COMPANY);
  if (!c) throw new Error(`no bench company ${COMPANY}`);
  const byId = new Map(loadDbInstruments().map((i) => [i.id, i]));

  const self = matchCompany(c.company, c.country);
  const sub = self.matched && !isGenericSubsector(self.subsector) ? self.subsector : "";
  const dbPeers = sub
    ? findPeersBySubsector(sub, { country: c.country, limit: 4, exclude: [c.company] })
    : [];
  const fieldChannels = new Set<string>(dbPeers.flatMap((r) => r.channels));
  const semantic = await semanticFundMatch(c.description);
  const log = new ExclusionLog();
  // The archetype intake, built exactly as check_memo_table.ts builds it, so
  // this is the same founder the archetype suite serves.
  const eligibility = sanitizeEligibility({
    sector: c.sector, activities: c.activities ?? ["none"],
    useOfFunds: ["experimental_development", "industrial_research"],
    entityCountries: [c.country], exclusionFlags: ["none"],
    cofinancingBand: ">50%", consortium: "unsure",
    borrowerModel: c.borrowerModel ?? "operating",
    fteBand: c.fteBand, ticketBand: c.ticketBand,
    developmentStage: c.developmentStage,
  }) as never;
  const hydrated = await buildInstrumentTableHydrated({
    fieldChannels,
    founderCountries: founderCountryList(c.country, [c.country], [c.country]),
    capitalSought: ["grant", "loan"],
    description: c.description,
    semantic,
    ...tableInputFromAnswers(eligibility),
    log,
  } as never);
  const instrumentTable = applyProfileSignal(
    accessiblePool(hydrated, eligibility, log).slice(0, VERDICT_POOL), undefined, undefined);
  const poolIds = instrumentTable
    .map((r) => r.instrumentId).filter((id): id is string => Boolean(id));
  await hydrateGatesFor(poolIds);
  const eligibilityScreen = evaluateEligibility(eligibility, poolIds.slice(0, DISPLAY_CAP));
  const { ordered } = orderMemoCandidates({
    instrumentTable,
    req: { company: c.company, country: c.country, description: c.description,
           capitalSought: ["grant", "loan"], targetMarkets: [c.country], eligibility } as never,
    records: [], dbPeers, eligibilityScreen, log,
  });

  // Where the row sits in the FULL ranking, before any cut -- the number that
  // says whether the corpus correction moved it at all.
  const fullRank = new Map<string, number>();
  hydrated.forEach((r, i) => { if (r.instrumentId) fullRank.set(r.instrumentId, i + 1); });
  const filmish = loadDbInstruments().filter((i) =>
    /Film|Fernseh|audiovis|medienboard|industries techniques|Screen Flanders/i.test(i.name));
  console.log(rankerTallyLine());
  console.log(`\nranked candidates: ${hydrated.length}`);
  console.log(`audiovisual instruments in this founder's FULL ranking:`);
  for (const f of filmish.sort((x, y) => (fullRank.get(x.id) ?? 1e9) - (fullRank.get(y.id) ?? 1e9)).slice(0, 6)) {
    const mix = f.sectorMix ?? {};
    const tot = Object.values(mix).reduce((a, b) => a + b, 0);
    const dom = tot ? Object.entries(mix).sort((a, b) => b[1] - a[1])[0] : null;
    console.log(`   rank ${String(fullRank.get(f.id) ?? "absent").padStart(5)}  `
      + `mix ${dom ? `${dom[0]} ${(100 * dom[1] / tot).toFixed(0)}%` : "none"}  ${f.name.slice(0, 52)}`);
  }
  console.log(`\n${c.company} (${c.country}) — the rows the writer is handed\n`);
  ordered.forEach((cand, idx) => {
    const id = cand.row.instrumentId as string;
    const inst = byId.get(id);
    const mix = inst?.sectorMix ?? null;
    const total = mix ? Object.values(mix).reduce((a, b) => a + b, 0) : 0;
    const dom = mix && total
      ? Object.entries(mix).sort((a, b) => b[1] - a[1])[0]
      : null;
    console.log(`  ${idx + 1}. ${(inst?.name ?? id).slice(0, 68)}`);
    console.log(`       ${inst?.country ?? "?"}  ${inst?.capitalType ?? "?"}  `
      + `mix ${dom ? `${dom[0]} ${(100 * dom[1] / total).toFixed(0)}%` : "none"}`);
  });
}

main();
