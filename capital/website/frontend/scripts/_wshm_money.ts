// wsHM — every money-shaped quantity the WRITER is handed, on the exact rows
// production hands it, with the ask beside them.
//
// FREE: one Voyage embed and one Postgres read per company. NO MODEL CALL.
// Walks the same path as `scripts/_wsde_prompt.ts` (production's own
// `writerCandidateEvidence`), and reports the numbers that block prints rather
// than the prose it produces.
//
//   npx tsx scripts/_wshm_money.ts
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("wshm_money", ["DATABASE_URL", "VOYAGE_KEY"]);

import { BRIEF_LIMITS } from "../lib/intelligence/briefChecks";
import {
  findPeersBySubsector, hydrateDbInstruments, hydrateGatesFor, isGenericSubsector,
  matchCompany, requireLiveCorpus, resetGateHydration,
} from "../lib/intelligence/corpus";
import { evaluateEligibility } from "../lib/intelligence/eligibility";
import { ExclusionLog } from "../lib/intelligence/exclusions";
import { accessiblePool, orderMemoCandidates } from "../lib/intelligence/memoCandidates";
import { buildRowsForCheck, writerCandidateEvidence } from "../lib/intelligence/pipeline";
import { distinguisherPhrases } from "../lib/intelligence/rowNovelty";
import { sanitizeEligibility } from "../lib/intelligence/sanitize";
import { rankerTallyLine, resetRankerTally, semanticFundMatch } from "../lib/intelligence/semantic";
import {
  applyProfileSignal, buildInstrumentTableHydrated, founderCountryList,
  tableInputFromAnswers, VERDICT_POOL,
} from "../lib/intelligence/shortlist";
import { bandFloorEur, TICKET_BANDS } from "../lib/intelligence/types";
import { COMPANIES } from "../lib/intelligence/__benchCompanies";

const CAP = BRIEF_LIMITS.institutionsMax;

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("wshm_money");
  resetRankerTally();

  let rows = 0, belowFloor = 0, row0NoMedian = 0, tables = 0;
  const decades: number[] = [];
  const lines: string[] = [];

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
      fieldChannels: new Set<string>(dbPeers.flatMap((r) => r.channels)),
      founderCountries: founderCountryList(c.country, [c.country], [c.country]),
      capitalSought: ["grant", "loan"],
      description: c.description,
      semantic,
      ...tableInputFromAnswers(eligibility),
      log,
    } as never);
    const instrumentTable = applyProfileSignal(
      accessiblePool(hydrated, eligibility, log).slice(0, VERDICT_POOL), undefined, undefined);
    const poolIds = instrumentTable.map((r) => r.instrumentId).filter(Boolean) as string[];
    await hydrateGatesFor(poolIds);
    const { toWriter, assessments } = orderMemoCandidates({
      instrumentTable,
      req: { company: c.company, country: c.country, description: c.description,
             capitalSought: ["grant", "loan"], targetMarkets: [c.country], eligibility } as never,
      records: [], dbPeers,
      eligibilityScreen: evaluateEligibility(eligibility, poolIds),
      log,
    });
    const baseRows = toWriter.map((x) => x.row);
    const institutions = buildRowsForCheck(baseRows, [], dbPeers).map((e, i) => {
      const a = baseRows[i].instrumentId ? assessments.get(baseRows[i].instrumentId!) : undefined;
      return { ...e, verdict: a?.status ?? "unknown", blocker: a?.blockers[0]?.requirement,
        gatesChecked: a?.checked ?? 0, lastAwardYear: baseRows[i].lastAwardYear };
    });

    const band = TICKET_BANDS.find((b) => b.value === c.ticketBand);
    const floor = bandFloorEur(c.ticketBand) ?? 0;
    const ceil = band?.maxEur ?? Infinity;
    // The geometric midpoint of the band, which is the target the score used to
    // read (`awardScorer`) and the number a reader matches "€15M-€50M" against.
    const mid = Number.isFinite(ceil) ? Math.sqrt(Math.max(floor, 1) * ceil) : floor * 2;
    tables += 1;
    lines.push(`\n${"=".repeat(92)}\n${c.company} (${c.country})  ask "${band?.label}"  ` +
      `floor €${floor.toLocaleString("en-GB")}  geometric mid €${Math.round(mid).toLocaleString("en-GB")}`);
    institutions.slice(0, CAP).forEach((e, i) => {
      const apart = i === 0 ? [] : distinguisherPhrases(e, institutions.slice(0, i));
      const seesMedian = apart.some((p) => p.startsWith("typical award"));
      const a = e.typicalAward;
      const d = a && a > 0 ? Math.log10(a / mid) : null;
      rows += 1;
      if (a && a > 0) { decades.push(d!); if (a < floor) belowFloor += 1; }
      if (i === 0 && !seesMedian) row0NoMedian += 1;
      lines.push(
        `  [${i}] award=${a ? "€" + Math.round(a).toLocaleString("en-GB") : "n/a"}` +
        `  n=${e.typicalAwardN ?? 0}` +
        `  ${d != null ? `${d.toFixed(2)} decades vs mid` : ""}` +
        `  belowFloor=${a && a > 0 ? a < floor : "n/a"}` +
        `  writerSeesMedian=${seesMedian}` +
        `\n        ticket="${e.ticket ?? ""}"` +
        `\n        ${e.institution.slice(0, 60)}`);
    });
    // Nothing here is used but calling it keeps the block identical to production's.
    void writerCandidateEvidence;
  }

  console.log(lines.join("\n"));
  decades.sort((a, b) => a - b);
  const med = decades[Math.floor(decades.length / 2)];
  console.log(`\n${"=".repeat(92)}`);
  console.log(`tables=${tables} published rows=${rows}`);
  console.log(`rows with a median: ${decades.length}`);
  console.log(`rows whose median is BELOW the ask's floor: ${belowFloor}/${decades.length} ` +
    `(${(100 * belowFloor / decades.length).toFixed(1)}%)`);
  console.log(`median gap to the band's geometric midpoint: ${med.toFixed(2)} decades ` +
    `(factor ${(1 / Math.pow(10, med)).toFixed(1)} below)`);
  console.log(`rank-1 rows the writer is shown NO measured median for: ${row0NoMedian}/${tables}`);
  console.log(`\n${rankerTallyLine()}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
