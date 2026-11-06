// wsDE — READ what the writer is handed, before paying for what it writes.
//
// The catalogue tails were diagnosed from two rendered briefs at roughly five
// dollars each. The block those briefs were written FROM costs nothing to
// build, and every claim in this workstream is about that block, so it is read
// directly. `writerCandidateEvidence` is production's own function, called --
// never reimplemented, or this would be grading text no founder is served.
//
// FREE: one Voyage embed and one Postgres read per company. No model calls.
//
//   npx tsx scripts/_wsde_prompt.ts             # all twelve archetypes
//   ONLY=Neura npx tsx scripts/_wsde_prompt.ts  # one, by name prefix
import { loadEnvLocal, requireCredentials } from "../loadEnv";

loadEnvLocal();
requireCredentials("wsde_prompt", ["DATABASE_URL", "VOYAGE_KEY"]);

import { BRIEF_LIMITS } from "../../lib/intelligence/briefChecks";
import { WRITER_CANDIDATE_CAP } from "../../lib/intelligence/caps";
import {
  findPeersBySubsector, hydrateDbInstruments, hydrateGatesFor, isGenericSubsector,
  matchCompany, requireLiveCorpus, resetGateHydration,
} from "../../lib/intelligence/corpus";
import { evaluateEligibility } from "../../lib/intelligence/eligibility";
import { ExclusionLog } from "../../lib/intelligence/exclusions";
import { accessiblePool, orderMemoCandidates } from "../../lib/intelligence/memoCandidates";
import { isQuantityValue, MONEY_BASIS, moneyBasisBlock } from "../../lib/intelligence/money";
import { buildRowsForCheck, writerCandidateEvidence } from "../../lib/intelligence/pipeline";
import { sanitizeEligibility } from "../../lib/intelligence/sanitize";
import { rankerTallyLine, resetRankerTally, semanticFundMatch } from "../../lib/intelligence/semantic";
import {
  applyProfileSignal, buildInstrumentTableHydrated, founderCountryList,
  tableInputFromAnswers, VERDICT_POOL,
} from "../../lib/intelligence/shortlist";
import { COMPANIES } from "../../lib/intelligence/__benchCompanies";

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("wsde_prompt");
  resetRankerTally();

  const only = process.env.ONLY;
  for (const c of COMPANIES.filter((x) => !only || x.company.startsWith(only))) {
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
      founderCountries: founderCountryList(c.country, [c.country]),
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
             capitalSought: ["grant", "loan"], eligibility } as never,
      records: [], dbPeers,
      eligibilityScreen: evaluateEligibility(eligibility, poolIds),
      log,
    });
    const baseRows = toWriter.map((x) => x.row);
    // The verdict fields the writer's block reads are attached in synthesize()
    // the same way; without them every row would read "not assessable" here and
    // the preview would be of a prompt nobody is sent.
    const institutions = buildRowsForCheck(baseRows, [], dbPeers).map((e, i) => {
      const a = baseRows[i].instrumentId ? assessments.get(baseRows[i].instrumentId!) : undefined;
      return { ...e, verdict: a?.status ?? "unknown", blocker: a?.blockers[0]?.requirement,
        gatesChecked: a?.checked ?? 0, lastAwardYear: baseRows[i].lastAwardYear };
    });
    const seen = new Set<string>();
    const rowKeys = baseRows.map((r) => {
      let key = r.instrumentId ?? r.channel;
      while (seen.has(key)) key += "#";
      seen.add(key);
      return key;
    });

    console.log(`\n${"=".repeat(100)}\n${c.company} (${c.country})  ` +
      `candidates ${institutions.length}/${WRITER_CANDIDATE_CAP}, publishes ${BRIEF_LIMITS.institutionsMax}`);
    console.log(writerCandidateEvidence(institutions, rowKeys, baseRows));
    // And the block that says what the euros on those rows ARE (wsHM). It is
    // part of the same user message, so a preview without it would be a
    // preview of a prompt nobody is sent -- which is this script's whole rule.
    console.log("\n" + moneyBasisBlock([...new Set(institutions.flatMap((r) =>
      Object.entries(r as unknown as Record<string, unknown>)
        .filter(([axis, v]) => MONEY_BASIS[axis] && isQuantityValue(axis, v))
        .map(([axis]) => axis)))]));
  }
  console.log(`\n${rankerTallyLine()}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
