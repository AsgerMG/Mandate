/**
 * Regression check across the next-generation company archetypes.
 *
 * Deterministic and free: no model calls, no API spend. Exercises
 * computeVerdict + assessAll, which is where sector, exclusions and the
 * encoded eligibility rules actually bite.
 *
 * Run: npx tsx scripts/check_archetypes.ts
 */
import { loadEnvLocal, requireCredentials } from "../loadEnv";

loadEnvLocal();
requireCredentials("check_archetypes", ["DATABASE_URL", "VOYAGE_KEY"]);

async function main() {
  const { hydrateDbInstruments } = await import("../../lib/intelligence/corpus");
  const { displayInstitutionName } = await import("../../lib/intelligence/shortlist");
  const { computeVerdict } = await import("../../lib/intelligence/pipeline");
  const { assessAll } = await import("../../lib/intelligence/verdict");
  const { ARCHETYPES, archetypeAnswers } = await import("../../lib/intelligence/__archetypes");
  await hydrateDbInstruments();

  let failures = 0;
  console.log(
    "archetype".padEnd(30) + "rows  pool  verdicted  reachable  statuses",
  );
  console.log("-".repeat(96));

  for (const a of ARCHETYPES) {
    const answers = archetypeAnswers(a) as never;
    const v = await computeVerdict("TestCo", a.country, answers, {
      targetMarkets: [a.country],
      capitalSought: ["grant", "loan"],
      description: a.description,
    });
    const assessed = assessAll(v.candidateInstrumentIds, answers);
    const statuses: Record<string, number> = {};
    for (const x of assessed.values()) statuses[x.status] = (statuses[x.status] ?? 0) + 1;
    const reachable = [...assessed.values()].filter((x) => x.status !== "blocked").length;
    const verdicted = [...assessed.values()].filter((x) => x.checked > 0).length;

    // Compare what a FOUNDER sees, not the raw corpus name. Two children of
    // one granting body under two different notified schemes share a raw name
    // and are genuinely different instruments; what would be a defect is the
    // same ROW appearing twice, and the row is rendered by
    // displayInstitutionName.
    const names = v.instrumentTable.map((r) => displayInstitutionName(r));
    const dups = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];

    const problems: string[] = [];
    if (reachable < a.expect.minAccessible) problems.push(`only ${reachable} reachable`);
    if (dups.length) problems.push(`duplicate rows: ${dups.join(", ")}`);
    // A verdict on nothing means sector and exclusions did no work at all.
    if (verdicted === 0) problems.push("no fund could be assessed");
    if (problems.length) failures += 1;

    console.log(
      a.label.padEnd(30) +
        String(names.length).padEnd(6) +
        String(assessed.size).padEnd(6) +
        String(verdicted).padEnd(11) +
        String(reachable).padEnd(11) +
        JSON.stringify(statuses) +
        (problems.length ? `\n${" ".repeat(30)}FAIL: ${problems.join("; ")}` : ""),
    );
  }

  console.log("-".repeat(96));
  console.log(
    failures === 0
      ? `all ${ARCHETYPES.length} archetypes pass`
      : `${failures} of ${ARCHETYPES.length} archetypes need attention`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

main();
