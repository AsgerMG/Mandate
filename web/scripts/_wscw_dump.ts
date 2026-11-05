// wsCW — the TAPE the seat question needs, cut once and read many times.
//
// The question this workstream was set is not "does arm X win". It is: the
// peer prior and the score are two near-orthogonal predictors and the split
// between them is a fixed constant; is there anything that says, FOR THIS
// FOUNDER, which of the two is right?
//
// Answering that by running the harness once per candidate rule is the wrong
// shape. `applyPeerPrecedence` is a PURE REORDER of the rows it is handed: it
// adds nothing, removes nothing, and reads only (row order, row score, scheme
// code, peer prior). So every seat allocation and every router over them is a
// function of ONE replay's tape. Cut the tape once — one Voyage embed and one
// Postgres read per pair, no model spend — and the whole space is offline
// arithmetic on a 250-row JSON file.
//
// WHAT IS ON THE TAPE, per replay:
//   * the `collapsed` order — the exact array `applyPeerPrecedence` receives
//   * each row's score, scheme code, regime and channel, so EXACT@5, REGIME@5
//     and CHANNEL@5 can all be recomputed offline against the same
//     definitions `measure_recall.ts` uses (parentId, sourceFamilyBucket)
//   * the peer prior's rank for every row in the pool, and the cell's size
//   * the recorded `final` order, so any offline simulation of the shipped
//     seat count can be CHECKED against what the code actually produced rather
//     than believed
//   * the founder-side features a router could legally read at request time:
//     the description's skewness, the branch, the pool's shape. Nothing here
//     may read the answer key.
//
// The intake is `founderIntake` under `founderPolicyFromEnv`, exactly as
// `measure_recall.ts` builds it, so the tape describes the same founder every
// published EXACT@5 came out of. The sample is `sampleRecall` with the same
// seed, so `SPLIT=tune N=250` here draws the same 250 rows it draws there.
//
// FREE. No model calls.
//
//   SPLIT=tune N=250 OUT=/tmp/tape.json npx tsx scripts/_wscw_dump.ts
import { writeFileSync } from "fs";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("wscw_dump", ["DATABASE_URL", "VOYAGE_KEY"]);

import {
  corpusProvenance, hydrateDbInstruments, loadDbInstruments, publishableInstruments,
  requireLiveCorpus, resetGateHydration,
} from "../lib/intelligence/corpus";
import { computeVerdict } from "../lib/intelligence/pipeline";
import { rankerTallyLine, resetRankerTally, semanticSeparation } from "../lib/intelligence/semantic";
import { peerPrior } from "../lib/intelligence/shortlist";
import { readTrace, traceOn, traceReset } from "../lib/intelligence/tableTrace";
import {
  founderIntake, founderPolicyFromEnv, IntakeTally, type FounderPolicy,
} from "./founderIntake";
import { DEFAULT_SEED, sampleRecall } from "./recallSample";
import {
  assertAncestorConvention, assertGradablePopulation, isDescribed, loadRecallSet,
  partitionByOfferable, reattributeMissingAnswers, type AnswerMode,
} from "./recallSet";

/** One replay, everything a reorder could possibly read. */
export interface Tape {
  want: string;
  wantRegime: string;
  wantChannel: string;
  country: string;
  sector: string;
  mode: string;
  /** The order `applyPeerPrecedence` was handed. */
  collapsed: string[];
  /** Row score, scheme code, regime and channel, aligned to `collapsed`. */
  rel: number[];
  scheme: string[];
  regime: string[];
  channel: string[];
  /** Peer-prior rank per row of `collapsed`; -1 = the prior has never seen it. */
  peerRank: number[];
  /** How many funds the prior holds for this (country, sector) cell. */
  priorLen: number;
  /** Which branch the shipped code took, and how many seats it awarded. */
  branch: "specific" | "flat" | "none";
  seatsHeld: number;
  /** The published order's first five, as the code actually produced it. */
  finalTop5: string[];
  /** Skewness of the raw similarities for this description; undefined when the
   *  index was never consulted. A candidate router input. */
  spread: number | null;
  descLen: number;
  inPool: boolean;
}

const num = (v: string | undefined, d: number) => (v === undefined ? d : Number(v));

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("wscw_dump");
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

  const consortiumEnv = process.env.CONSORTIUM ?? "yes";
  const policy: FounderPolicy = {
    ...founderPolicyFromEnv(),
    answers: answerMode,
    consortium: consortiumEnv === "none" ? undefined : consortiumEnv as "yes" | "no" | "unsure",
  };
  const tally = new IntakeTally();

  traceOn();
  resetRankerTally();
  resetGateHydration();
  const out: Tape[] = [];
  for (const t of sample) {
    resetGateHydration();
    traceReset();
    const f = founderIntake(t, policy);
    tally.add(f);
    const v = await computeVerdict(f.company, f.country, f.eligibility as never, { ...f.opts } as never);
    const { stages, facts, peerBranch, scoreSeats } = readTrace();
    const sorted = stages.filter((s) => s.name === "sorted");
    if (sorted.length !== 1) {
      throw new Error(`expected exactly one table per verdict, saw ${sorted.length}`);
    }
    const collapsed = stages.find((s) => s.name === "collapsed")?.ids ?? [];
    const final = stages.find((s) => s.name === "final")?.ids ?? [];
    const factOf = new Map(facts.map((x) => [x.id, x]));
    const prior = peerPrior(t.country, t.sector ?? "other");
    const rankOfP = new Map(prior.map((id, i) => [id, i]));
    const want = t.instrument;
    out.push({
      want,
      wantRegime: String(byId.get(want)?.parentId ?? want),
      wantChannel: String((byId.get(want) as { sourceFamilyBucket?: string } | undefined)?.sourceFamilyBucket ?? ""),
      country: t.country,
      sector: t.sector ?? "other",
      mode: t.mode,
      collapsed,
      rel: collapsed.map((id) => factOf.get(id)?.relevance ?? 0),
      scheme: collapsed.map((id) => factOf.get(id)?.schemeCode ?? ""),
      regime: collapsed.map((id) => String(byId.get(id)?.parentId ?? id)),
      channel: collapsed.map((id) =>
        String((byId.get(id) as { sourceFamilyBucket?: string } | undefined)?.sourceFamilyBucket ?? "")),
      peerRank: collapsed.map((id) => rankOfP.get(id) ?? -1),
      priorLen: prior.length,
      branch: peerBranch,
      seatsHeld: scoreSeats,
      finalTop5: final.slice(0, 5),
      spread: semanticSeparation(f.opts.description) ?? null,
      descLen: (f.opts.description ?? "").length,
      inPool: (v.candidateInstrumentIds ?? []).includes(want),
    });
  }

  const prov = corpusProvenance();
  console.log(`corpus=${prov.source} instruments=${prov.instruments} at ${prov.hydratedAt}`);
  console.log(rankerTallyLine());
  for (const l of tally.lines(policy)) console.log(l);
  console.log(`set=${setFile} split=${split} replayed ${out.length}`);
  const hits = out.filter((r) => r.finalTop5.includes(r.want)).length;
  console.log(`EXACT@5 (as published, from the tape) ${hits}/${out.length} ` +
    `(${(100 * hits / out.length).toFixed(1)}%)`);
  const dest = process.env.OUT ?? "/tmp/wscw_tape.json";
  writeFileSync(dest, JSON.stringify(out));
  console.log(`tape -> ${dest}`);
}

main();
