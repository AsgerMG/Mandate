// wsCV — WHAT the arm publishes, not where the answer ranks.
//
// ── Why a rank number is not enough ───────────────────────────────────────
// An ordering that scored 1.2 points more than the shipped one was rejected on
// 2026-08-09 because it won by putting rows on the page that carry an obstacle.
// EXACT@5 cannot see that: it asks only whether the won fund is among the five
// and is indifferent to what the other four are. So an arm has to be read on
// both, and this is the second half.
//
// Five properties of the PUBLISHED FIVE, per arm:
//
//   verdict mix       open / one_blocker / unknown, from the encoded gates. A
//                     `one_blocker` row is not a defect — it states its
//                     obstacle and FUND-12 forbids ranking rows — but an arm
//                     that shifts the mix towards obstacles is buying its
//                     EXACT@5 with rows a founder can do less with.
//   off-country       national schemes in a country the founder cannot draw
//                     on. This is the wrongly-shown row this product treats as
//                     worse than a missing one, and the blend's largest weight
//                     is PROXIMITY, so the arm moves exactly this quantity.
//                     Reported in both directions: promoting home schemes is
//                     the intended effect, publishing an unusable one is not.
//   home / EU mix     how much of the table is the founder's own country. The
//                     failure mode to watch: proximity at weight 4.06 turning
//                     the table into "your country's five schemes" and
//                     deleting the pan-European programmes that fund the most
//                     companies in Europe.
//   distinct regimes  the answer to "is this a catalogue". Five rows from
//                     three notified schemes is a shorter brief than it looks.
//   shared body       pairs where two of the five publish under one
//                     administering body. The memo already reads as a
//                     catalogue -- rows 1 and 2 the same ministry unit, four
//                     sharing a word-for-word "How to apply" -- and an arm
//                     that makes that worse matters more than a point of
//                     EXACT@5.
//
// ONE ARM PER RUN, because `POOL_BLEND` is read once at module scope and must
// stay that way: a flag that could differ within a request is not a flag.
//
// FREE: one Voyage embed and one Postgres read per pair. No model calls.
//
//   POOL_BLEND=off SPLIT=tune N=250 npx tsx scripts/_wscv_publishes.ts
import { loadEnvLocal, requireCredentials } from "../loadEnv";

loadEnvLocal();
requireCredentials("wscv_publishes", ["DATABASE_URL", "VOYAGE_KEY"]);

import {
  corpusProvenance, hydrateDbInstruments, loadDbInstruments, publishableInstruments,
  requireLiveCorpus, resetGateHydration, toIso2,
} from "../../lib/intelligence/corpus";
import { computeVerdict } from "../../lib/intelligence/pipeline";
import { POOL_BLEND } from "../../lib/intelligence/poolBlend";
import { rankerTallyLine, resetRankerTally } from "../../lib/intelligence/semantic";
import { assessInstrument } from "../../lib/intelligence/verdict";
import {
  founderIntake, founderPolicyFromEnv, IntakeTally, type FounderPolicy,
} from "../founderIntake";
import { DEFAULT_SEED, halfWidth, sampleRecall } from "../recallSample";
import {
  assertAncestorConvention, assertGradablePopulation, loadRecallSet,
  partitionByOfferable, reattributeMissingAnswers, type AnswerMode,
} from "../recallSet";

/** The cut the product publishes. */
const TOP = 5;
const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("wscv_publishes");
  const corpus = loadDbInstruments();
  const byId = new Map(corpus.map((i) => [i.id, i]));
  const offerable = new Set(publishableInstruments().map((i) => i.id));

  const { file: setFile, rows: all } = loadRecallSet();
  const split = process.env.SPLIT ?? "tune";
  assertAncestorConvention(corpus);
  const inCorpus = new Set(corpus.map((i) => i.id));
  const fixed = reattributeMissingAnswers(all, (id) => inCorpus.has(id), (id) => offerable.has(id));
  const pop = partitionByOfferable(fixed.rows, (id) => offerable.has(id));
  assertGradablePopulation(pop, (id) => inCorpus.has(id), fixed.reattributed.length, setFile);
  const set = pop.graded.filter((r) => split === "all" || r.split === split);
  if (!set.length) throw new Error(`no rows match split=${split}`);
  const N = Math.min(num(process.env.N, 250), set.length);
  const sample = sampleRecall(set, N, num(process.env.SEED, DEFAULT_SEED));

  // The SAME resolver `measure_recall.ts` and `check_recall_floor.ts` use, at
  // the same defaults, so the founder this describes and the founder every
  // EXACT@5 beside it describes are one founder.
  const policy: FounderPolicy = {
    ...founderPolicyFromEnv(),
    answers: (process.env.ANSWERS ?? "off") as AnswerMode,
  };
  const tally = new IntakeTally();
  resetRankerTally();
  resetGateHydration();

  const verdicts = new Map<string, number>();
  let rows = 0, offCountry = 0, home = 0, euWide = 0, pairsWithOffCountry = 0;
  const regimeCounts: number[] = [];
  let sharedBody = 0, bodyKnown = 0;

  for (const t of sample) {
    resetGateHydration();
    const f = founderIntake(t, policy);
    tally.add(f);
    const v = await computeVerdict(f.company, f.country, f.eligibility as never,
      { ...f.opts } as never);
    const five = (v.instrumentTable ?? []).slice(0, TOP);
    const insts = five.map((r: { instrumentId?: string }) =>
      (r.instrumentId ? byId.get(r.instrumentId) : undefined))
      .filter((i): i is NonNullable<typeof i> => Boolean(i));
    const founderIso = [f.country].map((c) => toIso2(c));
    let offHere = 0;
    for (const i of insts) {
      rows++;
      const st = assessInstrument(i, f.eligibility as never).status;
      verdicts.set(st, (verdicts.get(st) ?? 0) + 1);
      if (!i.country || i.country === "EU") euWide++;
      else if (founderIso.includes(i.country)) home++;
      else { offCountry++; offHere++; }
    }
    if (offHere) pairsWithOffCountry++;
    regimeCounts.push(new Set(insts.map((i) => i.parentId ?? i.id)).size);
    // Only counted where the register can name a body for at least two rows;
    // otherwise "no repeat" would be free credit for a gap in our data.
    const bodies = insts.map((i) => i.administeringBody).filter((b): b is string => Boolean(b));
    if (bodies.length >= 2) {
      bodyKnown++;
      if (new Set(bodies).size < bodies.length) sharedBody++;
    }
  }

  const prov = corpusProvenance();
  console.log(`corpus=${prov.source} instruments=${prov.instruments} at ${prov.hydratedAt}`);
  console.log(rankerTallyLine());
  console.log(`set=${setFile} split=${split} replayed ${sample.length}  ██ POOL_BLEND=${POOL_BLEND} ██`);
  for (const line of tally.lines(policy)) console.log(line);

  const pc = (n: number, d: number) =>
    `${n}/${d} (${(100 * n / d).toFixed(1)}% +/-${halfWidth(n, d).toFixed(1)})`;
  console.log(`\nWHAT THE PUBLISHED FIVE ARE MADE OF  (${rows} rows over ${sample.length} founders)`);
  for (const k of ["open", "one_blocker", "unknown", "blocked"]) {
    console.log(`  verdict ${k.padEnd(14)} ${pc(verdicts.get(k) ?? 0, rows)}`);
  }
  console.log(`  home country       ${pc(home, rows)}`);
  console.log(`  EU-wide            ${pc(euWide, rows)}`);
  console.log(`  ██ off-country     ${pc(offCountry, rows)}` +
    `  on ${pc(pairsWithOffCountry, sample.length)} of founders -- a fund they cannot draw on`);
  const meanRegimes = regimeCounts.reduce((a, b) => a + b, 0) / regimeCounts.length;
  const allFive = regimeCounts.filter((n) => n >= TOP).length;
  console.log(`  distinct REGIMES among the five: mean ${meanRegimes.toFixed(2)}` +
    `   all five distinct ${pc(allFive, sample.length)}`);
  console.log(`  two rows under ONE administering body: ${pc(sharedBody, bodyKnown)}` +
    `  (of ${bodyKnown}/${sample.length} founders whose five name >=2 bodies)`);
}

main();
