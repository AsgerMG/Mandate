// wsDR — HOW OFTEN IS THE ANSWER IN THE LIST, AT EVERY DEPTH THE LIST COULD BE.
//
// ── The defect this exists to close ───────────────────────────────────────
// Every selector prompt this repo has ever sent contains this sentence:
//
//   "measured on held-out companies the scheme that actually paid out is in
//    its first six rows about a quarter of the time, and somewhere in this
//    list about three quarters of the time. So the fund you are looking for is
//    usually here, and it is usually NOT at the top."
//
// The 75% was measured on `computeVerdict`'s candidate list, whose median
// length is 105 rows. THE LIST THE SELECTOR IS SHOWN IS 18. wsDQ's free screen
// of 45 real recall founders found the won fund in that 18-row pool on 15 of
// them -- one in three, not three in four. So the model is told something false
// about the list in front of it, and the falsehood is the sentence that
// licenses reaching to the bottom of it.
//
// A second hard-coded number would be the same defect with a different value,
// because the seam is about to move and the list is about to get longer. So
// this measures the WHOLE CURVE -- P(the won fund is within the first K rows of
// the accessible pool), for every K the list could plausibly be -- and commits
// it. `poolRecallAt()` in agentSelect.ts then reads the point that matches the
// list actually being shown, so the sentence is true at whatever depth the seam
// ends up at, and stays true if VERDICT_POOL or SELECT_DEPTH ever changes.
//
// ── Measured where the sentence says it is measured ───────────────────────
// "held-out companies" -- so the HOLDOUT split, not the tune split the floors
// and the arm comparison run on. A base rate quoted to the model out of the
// same founders a lever was tuned on is not a base rate.
//
// ── FREE BY CONSTRUCTION ──────────────────────────────────────────────────
// ANTHROPIC_API_KEY is deleted before anything that could use it is imported.
// The only paid call is the Voyage embedding behind `semanticFundMatch`, which
// is the shipped ranker and prints its own `all N request(s) on EMBEDDING` line.
//
//   npx tsx scripts/_wsdr_curve.ts
//   LIMIT=20 npx tsx scripts/_wsdr_curve.ts     (a smoke run)
import { writeFileSync } from "fs";
import path from "path";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
// Free by construction, not by intention.
delete process.env.ANTHROPIC_API_KEY;
requireCredentials("wsdr_curve", ["DATABASE_URL", "VOYAGE_KEY"]);

import {
  corpusProvenance, findPeersBySubsector, hydrateDbInstruments, isGenericSubsector,
  loadDbInstruments, matchCompany, publishableInstruments, requireLiveCorpus,
  resetGateHydration,
} from "../lib/intelligence/corpus";
import { ExclusionLog } from "../lib/intelligence/exclusions";
import { accessiblePool } from "../lib/intelligence/memoCandidates";
import { rankerTallyLine, resetRankerTally, semanticFundMatch } from "../lib/intelligence/semantic";
import {
  applyProfileSignal, buildInstrumentTableHydrated, founderCountryList,
  tableInputFromAnswers,
} from "../lib/intelligence/shortlist";
import { POOL_RECALL_FILE, POOL_RECALL_KS } from "../lib/intelligence/poolRecall";
import { founderIntake, founderPolicyFromEnv, type FounderPolicy } from "./founderIntake";
import { isDescribed, loadRecallSet, partitionByOfferable, reattributeMissingAnswers } from "./recallSet";

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("wsdr_curve");
  const corpus = loadDbInstruments();
  const offerable = new Set(publishableInstruments().map((i) => i.id));
  const inCorpus = new Set(corpus.map((i) => i.id));

  const { rows: all } = loadRecallSet("wsdr curve");
  const fixed = reattributeMissingAnswers(all, (id) => inCorpus.has(id), (id) => offerable.has(id));
  const pop = partitionByOfferable(fixed.rows, (id) => offerable.has(id));
  // HELD OUT, and DESCRIBED. A founder with no description is a founder the
  // selector cannot read, so including them would measure the ranker's
  // behaviour on a population the sentence is not about.
  let graded = pop.graded.filter((r) => r.split === "holdout" && isDescribed(r));
  // One founder per company, so a company with many awards cannot carry the
  // curve. Sorted by id first so the sample is deterministic across runs.
  const seen = new Set<string>();
  graded = [...graded].sort((a, b) => a.name.localeCompare(b.name))
    .filter((r) => (seen.has(r.name) ? false : (seen.add(r.name), true)));
  const limit = Number(process.env.LIMIT ?? 0);
  if (limit > 0) graded = graded.slice(0, limit);
  console.log(`measuring the pool-recall curve on ${graded.length} held-out described founders`);

  const policy: FounderPolicy = founderPolicyFromEnv();
  resetRankerTally();

  /** Where the won fund sits in the accessible pool, 1-based, or null if the
   *  pool does not contain it at all. That distinction is the whole point:
   *  "ranked badly" is a judgement problem and "not there" is a depth problem,
   *  and only the second is what this curve is about. */
  const ranks: (number | null)[] = [];
  let poolLenTotal = 0;
  let done = 0;
  for (const t of graded) {
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
    // NO SLICE. The curve is about the ranked accessible pool, which is the
    // list every candidate seam position cuts out of.
    const pool = applyProfileSignal(
      accessiblePool(hydrated, f.eligibility as never, log), undefined, undefined);
    poolLenTotal += pool.length;
    const i = pool.map((r) => r.instrumentId).indexOf(t.instrument);
    ranks.push(i < 0 ? null : i + 1);
    if (++done % 25 === 0) console.log(`  ${done}/${graded.length}`);
  }

  const n = ranks.length;
  const at = (k: number) => ranks.filter((r) => r != null && r <= k).length / (n || 1);
  const curve = POOL_RECALL_KS.map((k) => [k, Number(at(k).toFixed(4))] as [number, number]);
  const prov = corpusProvenance();
  const artifact = {
    what: "P(the fund a company actually won is within the first K rows of the "
      + "ranked accessible memo pool). The base rate the selector prompt quotes "
      + "for the list it is actually shown.",
    generatedBy: "scripts/_wsdr_curve.ts",
    measuredOn: "the holdout split of the described recall population, one founder per company",
    n,
    meanPoolLength: Number((poolLenTotal / (n || 1)).toFixed(1)),
    inPoolAtAll: Number((ranks.filter((r) => r != null).length / (n || 1)).toFixed(4)),
    corpus: `${prov.source} instruments=${prov.instruments}`,
    generatedAt: new Date().toISOString(),
    recallAtK: curve,
  };
  // The literal appears here as well as in `poolRecall.ts`, and that is not a
  // second definition to keep in sync — `check_artifact_reachability.py` proves
  // a producer by finding the artifact's own name bound to the variable that is
  // written, so a path assembled purely out of an imported constant makes this
  // script unprovable as the producer of the file it writes. The duplication is
  // therefore ENFORCED rather than commented: if the two ever disagree this
  // throws before writing anything, so the failure is a loud stop rather than a
  // reader pointed at a file nobody produces.
  const OUT = path.join(process.cwd(), "lib", "intelligence", "poolRecallCurve.generated.json");
  if (!OUT.endsWith(POOL_RECALL_FILE)) {
    throw new Error(
      `this script writes ${path.basename(OUT)} and lib/intelligence/poolRecall.ts reads ` +
      `${POOL_RECALL_FILE}. One of the two moved. The prompt would have kept quoting a ` +
      `stale base rate with no error anywhere, which is the failure this artifact exists ` +
      `to remove.`);
  }
  writeFileSync(OUT, `${JSON.stringify(artifact, null, 1)}\n`);

  console.log(`\ncorpus=${prov.source} instruments=${prov.instruments} at ${prov.hydratedAt}`);
  console.log(rankerTallyLine());
  console.log(`n=${n} held-out described founders, mean accessible pool ${artifact.meanPoolLength} rows`);
  for (const [k, v] of curve) console.log(`  won fund within first ${String(k).padStart(4)}: ${(v * 100).toFixed(1)}%`);
  console.log(`in the accessible pool at any depth: ${(artifact.inPoolAtAll * 100).toFixed(1)}%`);
  console.log(`wrote ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
