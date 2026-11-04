/**
 * Run the out-of-scope cases and report what the product WOULD have offered.
 *
 * FREE — the selection path is model-free, so this is the deterministic half
 * of the question and costs nothing to run on every change.
 *
 * The green fixtures measure whether the product performs when it should. This
 * measures whether it knows when to stop. A thin brief is not the failure here;
 * a confident one is, because five rows handed to a company that cannot use any
 * of them costs a founder weeks before they find out.
 *
 * Run: NO_PG=1 npx tsx scripts/red_team.ts
 */
import {
  type HarnessStages, renderStageDeclaration, stageNotOnThisPath, stageRuns,
} from "../lib/intelligence/stageDeclaration";
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("red_team", ["DATABASE_URL", "VOYAGE_KEY"]);

async function main() {
  const { RED_TEAM } = await import("../lib/intelligence/__redTeam");
  const { computeVerdict } = await import("../lib/intelligence/pipeline");
  const { sanitizeEligibility } = await import("../lib/intelligence/sanitize");
  const { displayInstitutionName } = await import("../lib/intelligence/shortlist");
  const { assessAll } = await import("../lib/intelligence/verdict");

  // ── WHICH REQUEST PATH THIS IS ───────────────────────────────────────────
  // `computeVerdict`, and that is the whole answer. There are TWO request
  // paths: the memo route runs `runIntelligence`, which pays for a
  // web-search-grounded comparable search on every brief; the instant verdict
  // route runs this one, which is MODEL-FREE BY CONTRACT and has never called
  // it. So the search is not a stage this run is short of — it is a stage the
  // path this run reproduces does not have, and saying that is different from
  // apologising for it. Exhaustive over the request path's stages by the
  // compiler, so a stage added tomorrow stops this file building.
  const STAGES: HarnessStages = {
    discovering: stageNotOnThisPath(
      "`computeVerdict`, the instant verdict route, which is model-free by contract "
      + "and never calls `discoverAndResearch` for any founder either"),
    querying_db: stageRuns(),
    generating: stageNotOnThisPath(
      "`computeVerdict`, which publishes a table and no memo — there is no writer on "
      + "this path for any founder"),
    done: stageRuns(),
  };
  for (const line of renderStageDeclaration("`npm run redteam`", STAGES)) console.log(line);

  console.log("\nOut-of-scope cases: what would we have put in front of them?\n");
  for (const c of RED_TEAM) {
    const eligibility = sanitizeEligibility({
      sector: c.sector, entityCountries: [c.country],
      exclusionFlags: c.exclusionFlags ?? ["none"],
      activities: c.activities, cofinancingBand: ">50%", consortium: "unsure",
      borrowerModel: "operating", fteBand: c.fteBand, ticketBand: c.ticketBand,
      developmentStage: c.developmentStage,
      useOfFunds: ["experimental_development"],
    } as never);
    const v = await computeVerdict(c.label, c.country, eligibility, {
      capitalSought: ["grant", "loan"], description: c.description,
    });
    const ids = v.instrumentTable.map((r) => r.instrumentId).filter(Boolean) as string[];
    const a = assessAll(ids, eligibility);
    const shown = v.instrumentTable.filter(
      (r) => !r.instrumentId || a.get(r.instrumentId)?.status !== "blocked");
    const tally: Record<string, number> = {};
    for (const id of ids) { const st = a.get(id)?.status ?? "no-assessment"; tally[st] = (tally[st] ?? 0) + 1; }
    const blocked = ids.filter((id) => a.get(id)?.status === "blocked").length;

    console.log(`${c.label}  (${c.country})`);
    console.log(`  would show ${shown.length} rows, ${blocked} blocked | statuses: ${JSON.stringify(tally)}`);
    console.log(`  ${shown.slice(0, 5).map((r) => displayInstitutionName(r)).join(" | ") || "(none)"}`);
    console.log(`  expected: ${c.expect.split(". ")[0]}.`);
    console.log(`  watch for: ${c.failureMode.split(". ")[0]}.\n`);
  }
}

main();
