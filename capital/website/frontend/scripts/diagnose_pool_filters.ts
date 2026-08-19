// WHICH rule removes each publishable leaf a founder never sees.
//
// Workstream Z established the shape of the loss and named the next question:
// a German founder gets 81 of 103 publishable SATR leaves at EVERY cap from 90
// upward, so the 22 die to something that runs BEFORE the cap. `probe_leafcap_
// effect.ts` counts rules across the whole request; that aggregate cannot say
// which of the 22 died to what, because SEL-CAPITAL fires 45 times across every
// channel and only some of those are the leaves in question.
//
// This attributes per INSTRUMENT. For every publishable leaf in a channel that
// the founder's country can draw on, print whether it reached the pool and, if
// not, every ExclusionLog event recorded against its own id. A leaf that is
// absent with NO event against it is the interesting case: it means the removal
// happened somewhere that does not report, which is the defect class this
// project has hit three times.
//
//   COUNTRIES=DE CHANNEL=state_aid_satr npx tsx scripts/diagnose_pool_filters.ts
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("diagnose_pool_filters", ["DATABASE_URL", "VOYAGE_KEY"]);

import {
  corpusProvenance, hydrateDbInstruments, publishableInstruments, requireLiveCorpus,
  resetGateHydration,
} from "../lib/intelligence/corpus";
import { ExclusionLog } from "../lib/intelligence/exclusions";
import { computeVerdict } from "../lib/intelligence/pipeline";
import { POOL_LEAVES_PER_CHANNEL } from "../lib/intelligence/shortlist";

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("diagnose_pool_filters");
  const p = corpusProvenance();
  console.log(`corpus=${p.source} instruments=${p.instruments} at ${p.hydratedAt}`);
  console.log(`POOL_LEAVES_PER_CHANNEL=${POOL_LEAVES_PER_CHANNEL}`);
  const capitalSought = (process.env.CAPITAL ?? "grant,loan").split(",");
  console.log(`capitalSought=${capitalSought.join("+")}\n`);

  const pub = publishableInstruments();
  const channel = process.env.CHANNEL ?? "state_aid_satr";
  for (const country of (process.env.COUNTRIES ?? "DE").split(",")) {
    resetGateHydration();
    const log = new ExclusionLog();
    const v = await computeVerdict("TestCo", country, {
      entityCountries: [country], sector: process.env.SECTOR ?? "other", activities: ["none"],
      borrowerModel: "operating", ticketBand: "b500k_2m5", consortium: "yes",
      useOfFunds: ["industrial_research", "experimental_development"],
    } as never, {
      capitalSought,
      description: "We build software for industrial automation.", log,
    } as never);
    const ids = new Set(v.candidateInstrumentIds ?? []);
    const reachable = pub.filter((i) => (channel === "*" || i.sourceFamilyBucket === channel)
      && (i.country === country || i.country === "EU"));
    const missing = reachable.filter((i) => !ids.has(i.id));
    console.log(`${country}/${channel}: publishable=${reachable.length} ` +
      `in pool=${reachable.length - missing.length} missing=${missing.length}`);

    // Events keyed by the instrument id they were recorded against.
    const byId = new Map<string, string[]>();
    for (const e of log.all()) {
      (byId.get(e.subject) ?? byId.set(e.subject, []).get(e.subject)!)
        .push(`${e.ruleId}: ${e.detail ?? ""}`);
    }
    const tally = new Map<string, number>();
    for (const i of missing) {
      const evs = byId.get(i.id) ?? [];
      const key = evs.length ? [...new Set(evs.map((e) => e.split(":")[0]))].sort().join("+")
        : "(NO EVENT RECORDED)";
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
    console.log("  attribution of the missing:");
    for (const [k, n] of [...tally].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${String(n).padStart(3)}  ${k}`);
    }
    if (process.env.VERBOSE) {
      console.log("  per instrument:");
      const only = process.env.ONLY_RULE;
      for (const i of missing) {
        const evs = byId.get(i.id) ?? ["(NO EVENT RECORDED)"];
        const key = (byId.get(i.id) ?? []).length
          ? [...new Set(evs.map((e) => e.split(":")[0]))].sort().join("+") : "(NO EVENT RECORDED)";
        if (only && key !== only) continue;
        console.log(`    ${i.id}  [${i.sourceFamilyBucket}/${i.country}]  cap=${i.capitalType}` +
          `  ${String(i.name).replace(/\s+/g, " ").slice(0, 60)}`);
        for (const e of new Set(evs)) console.log(`        ${e.slice(0, 170)}`);
      }
    }
    console.log("  whole-request rule counts: " + log.summary());
    console.log();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
