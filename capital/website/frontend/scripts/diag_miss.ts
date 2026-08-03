import { hydrateDbInstruments, loadDbInstruments, publishableInstruments } from "../lib/intelligence/corpus";
import { computeVerdict } from "../lib/intelligence/pipeline";
import { semanticFundMatch } from "../lib/intelligence/semantic";
import { ExclusionLog } from "../lib/intelligence/exclusions";
async function main() {
  await hydrateDbInstruments();
  const target = "horizon_eu_cl4";
  const desc = "My Personal AI Mediator for Virtual MEETtings BetWEEN People";
  const inst = loadDbInstruments().find((i) => i.id === target);
  console.log(`target: ${target}  present=${!!inst}  publishable=${publishableInstruments().some((i)=>i.id===target)}`);
  const sem = await semanticFundMatch(desc);
  const scores = [...sem].sort((a, b) => b[1] - a[1]);
  console.log(`semantic rank of ${target}: ${scores.findIndex(([k]) => k === target) + 1} of ${scores.length}  score=${sem.get(target)?.toFixed(3)}`);
  console.log(`top semantic: ${scores.slice(0, 5).map(([k, v]) => `${k}:${v.toFixed(2)}`).join("  ")}`);
  const log = new ExclusionLog();
  const v = await computeVerdict("TestCo", "IT", {
    entityCountries: ["IT"], sector: "other", activities: ["none"],
    borrowerModel: "operating", ticketBand: "b500k_2m5", consortium: "yes",
  } as never, { targetMarkets: ["IT"], capitalSought: ["grant","loan"], description: desc, log } as never);
  console.log(`pool: ${v.candidateInstrumentIds?.length}  contains target: ${v.candidateInstrumentIds?.includes(target)}`);
  const hits = log.all().filter((e) => e.subject.includes(target) || e.subject.includes("horizon"));
  console.log("exclusions touching horizon:", hits.slice(0, 6).map((e) => `${e.ruleId}:${e.subject.slice(0,24)}`).join("  ") || "(none)");
}
main();
