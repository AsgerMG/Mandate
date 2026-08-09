// wsCM — what actually decides the final five, and where in the stack the won
// leaf loses its seat.
//
// wsCI's bucket 3 is 41.5% of the loss and is labelled "on the table, lost on
// score". That label is an assertion about a code path nobody had read against
// the claim. `materialiseInstrumentTable` orders rows in FIVE steps, and only
// the third of them is the score:
//
//   1  usedInField        BOOLEAN, channel-level. Above the score.
//   2  fitDemoted         BOOLEAN, channel-level. Above the score.
//   3  rowRelevance       the score.
//   4  INSTRUMENT_PRIORITY, then instrument id  -- tie-breaks
//   5  name-collision collapse, then applyPeerPrecedence, which for a founder
//      whose description does NOT discriminate re-fills slots 2..N in PEER
//      PRIOR order and demotes repeats of a notified scheme
//
// So a won leaf can sit below five having beaten every visible row on the
// score. This script asks, per miss, which of the five steps did it.
//
// FREE: one Voyage embed and one Postgres read per pair, exactly as
// `_wsci_autopsy.ts`. No model calls.
//
//   SPLIT=tune N=250 npx tsx scripts/_wscm_stages.ts
//   SPLIT=tune N=250 OUT=/tmp/stages.json npx tsx scripts/_wscm_stages.ts
import { writeFileSync } from "fs";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("wscm_stages", ["DATABASE_URL", "VOYAGE_KEY"]);

import {
  corpusProvenance, hydrateDbInstruments, loadDbInstruments, publishableInstruments,
  requireLiveCorpus, resetGateHydration,
} from "../lib/intelligence/corpus";
import { ExclusionLog } from "../lib/intelligence/exclusions";
import { computeVerdict } from "../lib/intelligence/pipeline";
import { rankerTallyLine, resetRankerTally } from "../lib/intelligence/semantic";
import { readTrace, traceOn, traceReset } from "../lib/intelligence/tableTrace";
import { DEFAULT_SEED, halfWidth, sampleRecall } from "./recallSample";
import {
  answersFor, assertAncestorConvention, assertGradablePopulation, isDescribed, loadRecallSet,
  partitionByOfferable, reattributeMissingAnswers, type AnswerMode,
} from "./recallSet";

/** Which step of the stack cost this leaf its seat.
 *
 *  Assigned by ASKING THE STACK, never by a rule of thumb: the won leaf's rank
 *  is read at three recorded stages, and the attribution is the first stage at
 *  which it was already below five. Where it was below five as early as
 *  `sorted`, the two boolean tiers decide between "score" and "tier", because
 *  those tiers are lexicographic — a row above it on a tier is above it no
 *  matter what either scored. */
type Cause =
  | "tier-usedInField"   // beaten on the proven-in-field boolean, not the score
  | "tier-fit"           // beaten on the startup-ready boolean, not the score
  | "score"              // genuinely outscored by five rows in its own tier
  | "collapse"           // demoted by the display-name collision
  | "peer-reorder"       // in the top five after the sort, out of it after peer precedence
  | "peer-scheme-repeat" // demoted as a second row of one notified scheme
  | "absent";            // never reached the table at all

interface Out {
  want: string; wantRegime: string; country: string;
  hit: boolean; classSize: number; winnable: boolean;
  rankSorted: number | null; rankCollapsed: number | null; rankFinal: number | null;
  cause: Cause;
  /** How many rows sit above it purely on a boolean tier, i.e. rows it BEAT on
   *  the score and still lost to. */
  aboveOnTierOnly: number;
  /** Its rank if the two boolean tiers were removed and the score alone
   *  ordered the table. Not a proposal — the headroom of the tiers, measured. */
  rankScoreOnly: number | null;
}

const num = (v: string | undefined, d: number) => (v === undefined ? d : Number(v));

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("wscm_stages");
  const corpus = loadDbInstruments();
  const byId = new Map(corpus.map((i) => [i.id, i]));
  const offerable = new Set(publishableInstruments().map((i) => i.id));

  const { file: setFile, rows: all } = loadRecallSet();
  const split = process.env.SPLIT ?? "tune";
  const answerMode = (process.env.ANSWERS ?? "off") as AnswerMode;
  assertAncestorConvention(corpus);
  const inCorpus = new Set(corpus.map((i) => i.id));
  const fixed = reattributeMissingAnswers(all, (id) => inCorpus.has(id), (id) => offerable.has(id));
  const pop = partitionByOfferable(fixed.rows, (id) => offerable.has(id));
  assertGradablePopulation(pop, (id) => inCorpus.has(id), fixed.reattributed.length, setFile);
  const set = pop.graded.filter((r) => (split === "all" || r.split === split)
    && (!process.env.DESCRIBED || isDescribed(r)));
  if (!set.length) throw new Error(`no rows match split=${split}`);
  const N = Math.min(num(process.env.N, 250), set.length);
  const sample = sampleRecall(set, N, num(process.env.SEED, DEFAULT_SEED));

  traceOn();
  resetRankerTally();
  resetGateHydration();
  const out: Out[] = [];
  for (const t of sample) {
    resetGateHydration();
    traceReset();
    const a = answersFor(t, answerMode);
    const v = await computeVerdict("TestCo", t.country, {
      entityCountries: [t.country], sector: t.sector ?? "other", activities: ["none"],
      borrowerModel: "operating", ticketBand: a.ticketBand, consortium: "yes",
      useOfFunds: ["industrial_research", "experimental_development"],
      region: a.region,
    } as never, {
      targetMarkets: [t.country], capitalSought: a.capitalSought,
      description: t.description || t.selfDescription || undefined,
      log: new ExclusionLog(),
    } as never);
    const want = t.instrument;
    const top5 = (v.instrumentTable ?? []).slice(0, 5)
      .map((r: { instrumentId?: string }) => r.instrumentId).filter(Boolean) as string[];
    const hit = top5.includes(want);
    const { stages, facts } = readTrace();
    // ONE table per verdict on this path. If that ever stops being true the
    // stage ranks below would silently describe a different founder's table,
    // so it is asserted rather than assumed.
    const sorted = stages.filter((s) => s.name === "sorted");
    if (sorted.length !== 1) {
      throw new Error(`expected exactly one table per verdict, saw ${sorted.length} ` +
        `-- the stage ranks below would describe the wrong table`);
    }
    const rankIn = (name: string): number | null => {
      const s = stages.find((x) => x.name === name);
      if (!s) return null;
      const i = s.ids.indexOf(want);
      return i < 0 ? null : i + 1;
    };
    const rankSorted = rankIn("sorted");
    const rankCollapsed = rankIn("collapsed");
    const rankFinal = rankIn("final");
    const factOf = new Map(facts.map((f) => [f.id, f]));
    const me = factOf.get(want);

    // How many rows sit above it ONLY because of a boolean tier: rows whose
    // score is no better than its own but which are above it in the sort.
    let aboveOnTierOnly = 0;
    let rankScoreOnly: number | null = null;
    if (me) {
      const idx = facts.findIndex((f) => f.id === want);
      aboveOnTierOnly = facts.slice(0, idx)
        .filter((f) => f.relevance <= me.relevance).length;
      // Score-only order, ties broken exactly as the shipped comparator's last
      // resort so the two are comparable.
      const byScore = [...facts].sort((x, y) =>
        (y.relevance - x.relevance) || x.id.localeCompare(y.id));
      rankScoreOnly = byScore.findIndex((f) => f.id === want) + 1;
    }

    let cause: Cause;
    if (rankSorted === null) cause = "absent";
    else if (hit) cause = "score"; // unused for hits; kept total
    else if (rankSorted <= 5 && rankCollapsed === null) cause = "collapse";
    else if (rankSorted <= 5 && (rankFinal ?? 1e9) > 5) {
      // Peer precedence moved it out. Two mechanisms, and they take different
      // medicine: a straight reorder into peer-prior order, or the demotion of
      // a second row carrying an already-seen scheme code.
      const final = stages.find((s) => s.name === "final")!;
      const mySchemeCode = me?.schemeCode ?? "";
      const aheadSameScheme = mySchemeCode
        ? final.ids.slice(0, final.ids.indexOf(want))
          .some((id) => (factOf.get(id)?.schemeCode ?? "") === mySchemeCode)
        : false;
      cause = aheadSameScheme ? "peer-scheme-repeat" : "peer-reorder";
    } else if (me && aboveOnTierOnly >= 1 && (rankScoreOnly ?? 1e9) <= 5) {
      // It would have been on the page had the two boolean tiers not existed.
      const idx = facts.findIndex((f) => f.id === want);
      const blockers = facts.slice(0, idx).filter((f) => f.relevance <= me.relevance);
      cause = blockers.some((f) => f.usedInField && !me.usedInField)
        ? "tier-usedInField"
        : blockers.some((f) => !f.fitDemoted && me.fitDemoted) ? "tier-fit" : "score";
    } else cause = "score";

    const classSize = 1; // not recomputed here; wsCI owns the ceiling number
    out.push({
      want, wantRegime: String(byId.get(want)?.parentId ?? want), country: t.country,
      hit, classSize, winnable: true,
      rankSorted, rankCollapsed, rankFinal, cause, aboveOnTierOnly, rankScoreOnly,
    });
  }

  const prov = corpusProvenance();
  console.log(`corpus=${prov.source} instruments=${prov.instruments} at ${prov.hydratedAt}`);
  console.log(rankerTallyLine());
  console.log(`set=${setFile} split=${split} replayed ${out.length}`);
  const hits = out.filter((r) => r.hit).length;
  console.log(`\nEXACT@5 ${hits}/${out.length} (${(100 * hits / out.length).toFixed(1)}% +/-${halfWidth(hits, out.length).toFixed(1)})`);

  const misses = out.filter((r) => !r.hit);
  console.log(`\nWHAT PUT THE WON LEAF BELOW FIVE  (${misses.length} misses, ALL of them,`);
  console.log(`  winnable or not -- the mechanism is a fact about the code, not about the ceiling)`);
  const causes = new Map<Cause, number>();
  for (const r of misses) causes.set(r.cause, (causes.get(r.cause) ?? 0) + 1);
  for (const [k, n] of [...causes].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(22)}${String(n).padStart(5)}  ${(100 * n / misses.length).toFixed(1)}% of misses`);
  }

  // The stage-by-stage attrition, which is the answer to "is the ranking even
  // the deciding step".
  console.log(`\nTHE WON LEAF'S RANK, STAGE BY STAGE (misses in the pool only)`);
  const inPool = misses.filter((r) => r.rankSorted !== null);
  const med = (xs: number[]) => xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : NaN;
  const le5 = (xs: (number | null)[]) => xs.filter((x) => x !== null && x <= 5).length;
  console.log(`  after the row SORT       median ${med(inPool.map((r) => r.rankSorted!))}   in top five: ${le5(inPool.map((r) => r.rankSorted))}`);
  console.log(`  after the name COLLAPSE  median ${med(inPool.map((r) => r.rankCollapsed).filter((x): x is number => x !== null))}   in top five: ${le5(inPool.map((r) => r.rankCollapsed))}`);
  console.log(`  after PEER PRECEDENCE    median ${med(inPool.map((r) => r.rankFinal).filter((x): x is number => x !== null))}   in top five: ${le5(inPool.map((r) => r.rankFinal))}`);
  console.log(`  if the SCORE alone ranked median ${med(inPool.map((r) => r.rankScoreOnly).filter((x): x is number => x !== null))}   in top five: ${le5(inPool.map((r) => r.rankScoreOnly))}`);

  // How much of the table's own top five is decided by something other than
  // the score, across every replay -- hits included, because a hit reached by
  // the peer prior is the same fact as a miss caused by it.
  console.log(`\nHOW OFTEN THE SCORE'S TOP FIVE IS NOT THE PUBLISHED FIVE`);
  const moved = out.filter((r) => r.rankSorted !== null &&
    ((r.rankSorted <= 5) !== ((r.rankFinal ?? 1e9) <= 5)));
  console.log(`  the won leaf crossed the five-row line between the sort and the page: ${moved.length}/${out.length}`);
  const tierBlocked = out.filter((r) => r.aboveOnTierOnly > 0);
  console.log(`  won leaf had >=1 row above it that it BEAT on the score: ${tierBlocked.length}/${out.length}` +
    `  (median ${med(tierBlocked.map((r) => r.aboveOnTierOnly))} such rows)`);

  console.log(`\nREGIME CONCENTRATION per cause (a cause that is one regime is not a finding)`);
  for (const [k] of [...causes].sort((a, b) => b[1] - a[1])) {
    const g = new Map<string, number>();
    for (const r of misses.filter((x) => x.cause === k)) g.set(r.wantRegime, (g.get(r.wantRegime) ?? 0) + 1);
    const s = [...g].sort((a, b) => b[1] - a[1]);
    const tot = s.reduce((a, [, n]) => a + n, 0);
    console.log(`  ${k.padEnd(22)} ${tot} across ${s.length} regime(s), largest ` +
      `${tot ? (100 * (s[0]?.[1] ?? 0) / tot).toFixed(0) : "0"}% -- ${s.slice(0, 3).map(([kk, n]) => `${kk}:${n}`).join(" ")}`);
  }

  if (process.env.OUT) {
    writeFileSync(process.env.OUT, JSON.stringify(out, null, 0));
    console.log(`\nper-pair -> ${process.env.OUT}`);
  }
}

main();
