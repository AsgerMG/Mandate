import { hydrateDbInstruments, publishableInstruments } from "../lib/intelligence/corpus";
import { computeVerdict } from "../lib/intelligence/pipeline";
import { ExclusionLog } from "../lib/intelligence/exclusions";
async function main() {
  const { ARCHETYPES, archetypeAnswers } = await import("../lib/intelligence/__archetypes");
  await hydrateDbInstruments();
  const a: any = ARCHETYPES.find((x: any) => /consumer banking/i.test(x.label));
  console.log(`${a.label}  country=${a.country}`);
  console.log(`description: ${String(a.description).slice(0, 110)}`);
  const pub = publishableInstruments();
  const inCountry = pub.filter((i) => i.country === a.country || i.country === "EU");
  console.log(`\npublishable: ${pub.length}   in ${a.country} or EU-wide: ${inCountry.length}`);
  const log = new ExclusionLog();
  const v = await computeVerdict("TestCo", a.country, archetypeAnswers(a) as never, {
    targetMarkets: [a.country], capitalSought: ["grant", "loan"], description: a.description, log,
  } as never);
  console.log(`candidates: ${v.candidateInstrumentIds?.length}`);
  const c = log.countsByRule();
  console.log("exclusions:", Object.entries(c).sort((x, y) => y[1] - x[1]).slice(0, 6));
  const detail = log.all().filter((e) => e.ruleId !== "SEL-COUNTRY").slice(0, 8);
  console.log("\nnon-country drops:");
  for (const e of detail) console.log(`   ${e.ruleId}  ${e.subject.slice(0, 46)}  ${(e.detail ?? "").slice(0, 60)}`);
}
main();
