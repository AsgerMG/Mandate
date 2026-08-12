// wsDQ — CHOOSING THE THREE COMPANIES, BEFORE ANY MONEY IS SPENT.
//
// The owner asked for three real companies, "different from each other", with
// a reason given for each. A reason drawn from taste is not a reason; this
// script supplies the facts the choice is made on, and it is FREE:
// ANTHROPIC_API_KEY is deleted before anything that could use it is imported,
// so the screen cannot spend even if it were wired wrong.
//
// WHAT IT MEASURES, per candidate, on the SHIPPED path with the arm off:
//
//   pool          how many rows the memo pool holds for this founder
//   won rank      where the fund they actually won sits in that pool, and in
//                 the list the writer is shown. `-` means the pool does not
//                 contain it at all, which is a different and much worse case
//                 than "ranked badly" -- no selector can pick what it was not
//                 shown, so such a founder tests nothing about judgement.
//   published     whether a writer that obeys its instructions would publish
//                 it, computed through production's own row builder.
//
// The three axes that make a set of founders informative rather than merely
// numerous, and the reason each is a separate case:
//
//   HARM      the shipped order already publishes the right fund. The only
//             thing a selector can do here is destroy a correct answer, and
//             an arm that never risks that has not been tested.
//   GAIN      the fund is in the pool and buried. This is the case the whole
//             architecture is premised on -- the ranker's own measurement says
//             the won scheme is in its top six a quarter of the time and
//             somewhere in the list three quarters of the time.
//   FLOOR     the founder told us almost nothing. What happens when judgement
//             has nothing to bite on is the question wsDO's finding 4 left
//             open, and it is the majority case in this corpus: 73% of pairs
//             carry one of eleven canned sector sentences.
//
//   npx tsx scripts/_wsdq_pick.ts
import { writeFileSync } from "fs";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
// Free by construction, not by intention.
delete process.env.ANTHROPIC_API_KEY;
requireCredentials("wsdq_pick", ["DATABASE_URL", "VOYAGE_KEY"]);

import { BRIEF_LIMITS } from "../lib/intelligence/briefChecks";
import {
  corpusProvenance, findPeersBySubsector, hydrateDbInstruments, hydrateGatesFor,
  isGenericSubsector, loadDbInstruments, matchCompany, publishableInstruments,
  requireLiveCorpus, resetGateHydration,
} from "../lib/intelligence/corpus";
import { evaluateEligibility } from "../lib/intelligence/eligibility";
import { ExclusionLog } from "../lib/intelligence/exclusions";
import { accessiblePool, orderMemoCandidates } from "../lib/intelligence/memoCandidates";
import { buildRowsForCheck } from "../lib/intelligence/pipeline";
import { rankerTallyLine, resetRankerTally, semanticFundMatch } from "../lib/intelligence/semantic";
import {
  applyProfileSignal, buildInstrumentTableHydrated, DISPLAY_CAP, founderCountryList,
  tableInputFromAnswers, VERDICT_POOL,
} from "../lib/intelligence/shortlist";
import { founderIntake, founderPolicyFromEnv, type FounderPolicy } from "./founderIntake";
import { loadRecallSet, partitionByOfferable, reattributeMissingAnswers } from "./recallSet";
import type { RecallRow } from "./recallSet";

const PUBLISH_CAP = BRIEF_LIMITS.institutionsMax;

interface Screened {
  name: string;
  country: string;
  sector: string;
  descriptionSource: string;
  descriptionChars: number;
  wonInstrument: string;
  wonInstrumentName: string;
  pool: number;
  poolRank: number | null;
  writerRank: number | null;
  publishedRank: number | null;
  publishedNames: string[];
}

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("wsdq_pick");
  const corpus = loadDbInstruments();
  const offerable = new Set(publishableInstruments().map((i) => i.id));
  const inCorpus = new Set(corpus.map((i) => i.id));

  const { rows: all } = loadRecallSet("wsdq pick");
  const fixed = reattributeMissingAnswers(all, (id) => inCorpus.has(id), (id) => offerable.has(id));
  const pop = partitionByOfferable(fixed.rows, (id) => offerable.has(id));
  const graded = pop.graded.filter((r) => r.split === "tune");

  // The one company the owner named, plus a spread of DESCRIBED founders. The
  // description source matters more than its length: `cross_regime_summary` is
  // prose about the company recovered from an award under a different regime,
  // which is the only provenance `check_recall_leaks` clears at the sibling
  // level. A founder described out of the won fund's own text would hand the
  // selector the answer in the query.
  const named = graded.filter((r) => r.name.startsWith("Lailaps Films"));
  const described = graded.filter((r) =>
    r.descriptionSource === "cross_regime_summary" && (r.description ?? "").length >= 320);
  // One per sector, best-described first, so the screen spans the corpus
  // rather than sampling one dense neighbourhood twice.
  const bySector = new Map<string, RecallRow>();
  for (const r of [...described].sort(
    (a, b) => (b.description ?? "").length - (a.description ?? "").length)) {
    const key = `${r.sector}|${r.country}`;
    if (!bySector.has(key)) bySector.set(key, r);
  }
  const candidates = [...named, ...[...bySector.values()].slice(0, 44)];
  console.log(`screening ${candidates.length} founders (1 named by the owner, ` +
    `${candidates.length - named.length} described)\n`);

  const policy: FounderPolicy = founderPolicyFromEnv();
  resetRankerTally();
  const out: Screened[] = [];

  for (const t of candidates) {
    resetGateHydration();
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
        f.country, f.opts.targetMarkets, f.eligibility.entityCountries),
      capitalSought: f.opts.capitalSought,
      description: f.opts.description,
      semantic,
      ...tableInputFromAnswers(f.eligibility),
      log,
    } as never);
    const pool = applyProfileSignal(
      accessiblePool(hydrated, f.eligibility as never, log).slice(0, VERDICT_POOL),
      undefined, undefined);
    const ids = pool.map((r) => r.instrumentId).filter((id): id is string => Boolean(id));
    await hydrateGatesFor(ids);
    const ordered = orderMemoCandidates({
      instrumentTable: pool,
      req: { company: f.company, country: f.country, eligibility: f.eligibility, ...f.opts } as never,
      records: [], dbPeers,
      eligibilityScreen: evaluateEligibility(f.eligibility as never, ids.slice(0, DISPLAY_CAP)),
      log,
    }).toWriter.map((c) => c.row);
    // `buildInstitutions` maps `toWriter` one-to-one (wsDP), so the published
    // projection is `ordered` cut to the cap. The names are built anyway,
    // because a rank with no fund name beside it is not readable evidence.
    const publishedNames = buildRowsForCheck(ordered, [], dbPeers)
      .slice(0, PUBLISH_CAP).map((e) => e.institution);

    const at = (arr: (string | undefined)[]) => {
      const i = arr.indexOf(t.instrument);
      return i < 0 ? null : i + 1;
    };
    const writerRank = at(ordered.map((r) => r.instrumentId));
    out.push({
      name: f.company, country: f.country, sector: t.sector ?? "other",
      descriptionSource: t.descriptionSource ?? "none",
      descriptionChars: (f.opts.description ?? "").length,
      wonInstrument: t.instrument, wonInstrumentName: t.instrumentName ?? "",
      pool: pool.length,
      poolRank: at(pool.map((r) => r.instrumentId)),
      writerRank,
      publishedRank: writerRank != null && writerRank <= PUBLISH_CAP ? writerRank : null,
      publishedNames,
    });
  }

  const prov = corpusProvenance();
  console.log(`corpus=${prov.source} instruments=${prov.instruments} at ${prov.hydratedAt}`);
  console.log(rankerTallyLine());
  console.log(`caps: pool ${VERDICT_POOL} -> published ${PUBLISH_CAP}\n`);
  const n = (v: number | null) => (v == null ? "  -" : String(v).padStart(3));
  console.log(`${"company".padEnd(34)} ${"cc".padEnd(3)}${"sector".padEnd(28)}` +
    `${"desc".padStart(5)} pool  won@pool won@writer won@published`);
  for (const s of [...out].sort((a, b) =>
    (a.publishedRank ?? 99) - (b.publishedRank ?? 99) || (a.poolRank ?? 999) - (b.poolRank ?? 999))) {
    console.log(`${s.name.slice(0, 33).padEnd(34)} ${s.country.padEnd(3)}` +
      `${s.sector.padEnd(28)}${String(s.descriptionChars).padStart(5)} ` +
      `${String(s.pool).padStart(4)}  ${n(s.poolRank)}      ${n(s.writerRank)}        ${n(s.publishedRank)}`);
  }
  const has = out.filter((s) => s.poolRank != null).length;
  const pub = out.filter((s) => s.publishedRank != null).length;
  console.log(`\n${has}/${out.length} have the won fund in the pool at all; ` +
    `${pub}/${out.length} would publish it with the arm off.`);
  writeFileSync("_wsdq_pick.json", JSON.stringify(out, null, 1));
  console.log("wrote _wsdq_pick.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
