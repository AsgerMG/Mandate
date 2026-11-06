// wsDQ — the pool, printed, for one founder at a time. FREE.
//
// The screen (`_wsdq_pick.ts`) answers "where is the won fund"; this answers
// "what is in there instead", which is the question the reader of a trace
// actually asks. Same construction, same policy, no model and no key.
//
//   COMPANY="Lailaps Films" npx tsx scripts/_wsdq_probe.ts
import { loadEnvLocal, requireCredentials } from "../loadEnv";

loadEnvLocal();
delete process.env.ANTHROPIC_API_KEY;
requireCredentials("wsdq_probe", ["DATABASE_URL", "VOYAGE_KEY"]);

import {
  findPeersBySubsector, hydrateDbInstruments, hydrateGatesFor, isGenericSubsector,
  loadDbInstruments, matchCompany, publishableInstruments, requireLiveCorpus, resetGateHydration,
} from "../../lib/intelligence/corpus";
import { ExclusionLog } from "../../lib/intelligence/exclusions";
import { accessiblePool } from "../../lib/intelligence/memoCandidates";
import { rankerTallyLine, resetRankerTally, semanticFundMatch } from "../../lib/intelligence/semantic";
import {
  applyProfileSignal, buildInstrumentTableHydrated, founderCountryList,
  tableInputFromAnswers, VERDICT_POOL,
} from "../../lib/intelligence/shortlist";
import { intakeAnswerLines, unansweredRankingFields } from "../../lib/intelligence/agentSelect";
import { founderIntake, founderPolicyFromEnv, INTAKE_SOURCE } from "../founderIntake";
import { loadRecallSet, partitionByOfferable, reattributeMissingAnswers } from "../recallSet";

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("wsdq_probe");
  const corpus = loadDbInstruments();
  const offerable = new Set(publishableInstruments().map((i) => i.id));
  const inCorpus = new Set(corpus.map((i) => i.id));
  const { rows: all } = loadRecallSet("wsdq probe");
  const fixed = reattributeMissingAnswers(all, (id) => inCorpus.has(id), (id) => offerable.has(id));
  const pop = partitionByOfferable(fixed.rows, (id) => offerable.has(id));
  const want = process.env.COMPANY ?? "";
  const t = pop.graded.find((r) => r.name.toLowerCase().includes(want.toLowerCase()));
  if (!t) throw new Error(`no graded recall row matching COMPANY="${want}"`);

  resetRankerTally();
  resetGateHydration();
  const policy = founderPolicyFromEnv();
  const f = founderIntake(t, policy);
  const selfRecord = matchCompany(f.company, f.country);
  const targetSub =
    selfRecord.matched && !isGenericSubsector(selfRecord.subsector) ? selfRecord.subsector : "";
  const dbPeers = targetSub
    ? findPeersBySubsector(targetSub, { country: f.country, limit: 4, exclude: [f.company] })
    : [];
  const semantic = await semanticFundMatch(f.opts.description ?? "");
  const log = new ExclusionLog();
  const hydrated = await buildInstrumentTableHydrated({
    fieldChannels: new Set<string>(dbPeers.flatMap((r) => r.channels)),
    founderCountries: founderCountryList(
      f.country, f.eligibility.entityCountries),
    capitalSought: f.opts.capitalSought,
    description: f.opts.description,
    semantic,
    ...tableInputFromAnswers(f.eligibility),
    log,
  } as never);
  const pool = applyProfileSignal(
    accessiblePool(hydrated, f.eligibility as never, log).slice(0, VERDICT_POOL),
    undefined, undefined);
  await hydrateGatesFor(pool.map((r) => r.instrumentId ?? ""));

  console.log(`\n${"=".repeat(78)}`);
  console.log(`${f.company}  (${f.country}, sector=${t.sector})`);
  console.log(`${"=".repeat(78)}`);
  console.log(`won: ${t.instrument}\n     ${t.instrumentName}`);
  console.log(`\ndescription (${(f.opts.description ?? "").length} chars, ` +
    `source=${t.descriptionSource}):\n${f.opts.description}`);
  console.log(`\nmatched in the corpus: ${selfRecord.matched}` +
    `${selfRecord.matched ? ` subsector=${selfRecord.subsector}` : ""}`);
  console.log(`db peers: ${dbPeers.map((p) => p.name).join(", ") || "(none)"}`);
  console.log(`\nintake lines the selector would be handed:`);
  for (const l of intakeAnswerLines(f.eligibility)) console.log(`  ${l}`);
  console.log(`unanswered RANKING fields: ${unansweredRankingFields(f.eligibility).join(", ") || "(none)"}`);
  console.log(`withheld by policy: ${Object.entries(INTAKE_SOURCE)
    .filter(([, d]) => d.supply === "withheld").map(([k]) => k).join(", ")}`);
  console.log(`\nhydrated candidates ${hydrated.length} -> accessible pool cut to ${pool.length}:`);
  pool.forEach((r, i) => {
    console.log(`  [${String(i).padStart(2)}] ${r.instrumentId}`);
    console.log(`       ${String(r.instrument).replace(/\s+/g, " ").slice(0, 110)}`);
    console.log(`       ${r.administeringBody ?? "?"} · ${r.country ?? "?"} · ${r.capitalType ?? "?"}` +
      ` · ${r.descriptor ?? ""}`);
    if (r.description) console.log(`       funds: ${String(r.description).slice(0, 150)}`);
  });
  const at = pool.findIndex((r) => r.instrumentId === t.instrument);
  console.log(`\nwon fund's position in the pool: ${at < 0 ? "NOT IN THE POOL" : at}`);
  console.log(rankerTallyLine());
}

main().catch((e) => { console.error(e); process.exit(1); });
