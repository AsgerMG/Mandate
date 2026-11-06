// wsDL — WHAT THE MODEL IS ACTUALLY HANDED, printed, for nothing.
//
// ── Why this is a script and not a paragraph in a report ──────────────────
// The claim this workstream has to support is that the selector now sees the
// founder it is ranking for. That claim is only checkable by looking at the
// bytes, and wsDJ found nine defects in exactly this surface by doing so.
// Everything in this repo that has ever gone wrong about a prompt went wrong
// where nobody was reading it: fifteen labels of which three could never carry
// a value, a fixed list missing the two fields `ANSWER_USE` declares
// `ranks: true`, an eligibility verdict computed and then never shown.
//
// So this builds the pool exactly as `runIntelligence` does, calls the SAME
// `buildPrompt` the live arm calls, and prints it. No model call, no arm, no
// spend — `AGENT_SELECT` is irrelevant here because nothing is sent.
//
// A FOUNDER WHO HAS BEEN THROUGH THE ADAPTIVE ROUND. The `--full` flag fills
// the fields the adaptive round asks about, which is the state this seam
// actually runs in: `runIntelligence` is the last call the panel makes. Run it
// both ways and the difference IS the answer to "does the ranker get the whole
// founder".
//
//   npx tsx scripts/_wsdl_menu.ts            # first-screen answers only
//   FULL=1 npx tsx scripts/_wsdl_menu.ts     # after the adaptive round
import { loadEnvLocal, requireCredentials } from "../loadEnv";

loadEnvLocal();
requireCredentials("wsdl_menu", ["DATABASE_URL", "VOYAGE_KEY"]);

import { buildPrompt, intakeAnswerLines, unansweredRankingFields } from "../../lib/intelligence/agentSelect";
import {
  hydrateDbInstruments, hydrateGatesFor, requireLiveCorpus, resetGateHydration,
} from "../../lib/intelligence/corpus";
import { ExclusionLog } from "../../lib/intelligence/exclusions";
import { accessiblePool } from "../../lib/intelligence/memoCandidates";
import { rankerTallyLine, resetRankerTally, semanticFundMatch } from "../../lib/intelligence/semantic";
import {
  applyProfileSignal, buildInstrumentTableHydrated, founderCountryList,
  tableInputFromAnswers, VERDICT_POOL,
} from "../../lib/intelligence/shortlist";
import { assessAll } from "../../lib/intelligence/verdict";
import { ARCHETYPES } from "../../lib/intelligence/__archetypes";
import type { EligibilityAnswers } from "../../lib/intelligence/types";

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("wsdl_menu");
  resetRankerTally();
  resetGateHydration();

  const a = ARCHETYPES.find((x) => x.label === (process.env.ARCHETYPE ?? "Robotics")) ?? ARCHETYPES[0];
  // The first screen, and then everything the adaptive round exists to add.
  // Values are vocabulary-contract options; nothing here is invented prose.
  const firstScreen: EligibilityAnswers = {
    sector: a.sector,
    entityCountries: [a.country],
    ticketBand: "b500k_2m5",
    useOfFunds: ["rnd", "capex"],
    consortium: "unsure",
    ...(a.region ? { region: a.region } : {}),
    ...(a.activities ? { activities: a.activities } : {}),
    ...(a.borrowerModel
      ? { borrowerModel: a.borrowerModel as EligibilityAnswers["borrowerModel"] } : {}),
  };
  const adaptive: EligibilityAnswers = process.env.FULL ? {
    fteBand: "10-49",
    turnoverBand: "<2M",
    balanceBand: "<2M",
    developmentStage: "pilot_customers",
    organisationType: "private_company",
    cofinancingBand: "25-50%",
    institutionalBacking: "yes",
    bankRelationship: "no",
    needBy: "months_6",
    exclusionFlags: ["none"],
    lossesOverHalfCapital: "no",
    ownerOver25: "yes",
    institutionalOwner: "no",
    nonEuControl: "no",
    wouldOpenEntity: "depends",
    conditionality: ["local_entity"],
  } : {};
  const eligibility: EligibilityAnswers = { ...firstScreen, ...adaptive };

  const log = new ExclusionLog();
  const semantic = await semanticFundMatch(a.description);
  const hydrated = await buildInstrumentTableHydrated({
    fieldChannels: new Set<string>(),
    founderCountries: founderCountryList(a.country, eligibility.entityCountries),
    capitalSought: [],
    description: a.description,
    semantic,
    ...tableInputFromAnswers(eligibility),
    log,
  } as never);
  const pool = applyProfileSignal(
    accessiblePool(hydrated, eligibility, log).slice(0, VERDICT_POOL), undefined, undefined);
  const ids = pool.map((r) => r.instrumentId).filter((id): id is string => Boolean(id));
  await hydrateGatesFor(ids);
  const assessments = assessAll(ids, eligibility);

  const answers = intakeAnswerLines(eligibility);
  const unanswered = unansweredRankingFields(eligibility);
  const prompt = buildPrompt(pool, {
    country: a.country, sector: eligibility.sector, description: a.description,
    answers, unanswered, assessments,
  }, 0, 6);

  console.log(rankerTallyLine());
  console.log(`archetype=${a.label} adaptive_round=${process.env.FULL ? "ANSWERED" : "not yet"}`);
  console.log(`pool=${pool.length} rows, answer lines=${answers.length}, ` +
    `unanswered ranking fields=${unanswered.length}, prompt=${prompt.length} chars`);
  const byStatus = new Map<string, number>();
  for (const id of ids) {
    const s = assessments.get(id)?.status ?? "unknown";
    byStatus.set(s, (byStatus.get(s) ?? 0) + 1);
  }
  console.log(`  qualification on the rows the model reads: ` +
    [...byStatus].map(([k, n]) => `${k}=${n}`).join(" "));
  console.log(`\n${"=".repeat(78)}\n${prompt}\n${"=".repeat(78)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
