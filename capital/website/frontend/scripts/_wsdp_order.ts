// wsDP — DOES THE SELECTOR'S ORDER REACH THE PUBLISHED MEMO?
//
// ── The circularity this breaks ────────────────────────────────────────────
// The owner's gate is 1-3 real companies end to end and not one euro until an
// 11-point checklist is true. Line 1 is "the model's order reaches the
// published memo — arm on vs off produces a different memo order on the same
// founder". Every other line is green. Line 1 needed a model call, which is
// exactly what the gate forbids until line 1 is green.
//
// The claim is not about the MODEL. It is about the SEAM: that a permutation
// applied at `agentSelectMemoPool` survives `orderMemoCandidates`, the
// display-name collapse and the writer cap, and reaches the rows a founder
// reads. Nothing in that chain cares whether the permutation is a good one. So
// `AGENT_SELECT=reverse` supplies a free, deterministic, obviously-wrong one
// and this file follows it to the last point reachable without spending.
//
// ── The control, and why it is not a second process ────────────────────────
// The standing rule is that a before/after on a shared database is not a
// controlled comparison — 29 verdicts published between one agent's two runs
// moved its numbers overnight — and that arms must be run concurrently in
// separate worktrees.
//
// This is stronger than that, not weaker. Both arms are evaluated inside ONE
// process, on ONE founder, from THE SAME pool object, in the same millisecond
// of corpus state: the control is `poolBefore`, the array as it stood at the
// seam, and the treatment is what the seam returns when handed it. There is no
// second query, no second hydration and no second snapshot for anything to
// drift between. `scripts/_wsdl_equiv.ts` is what licenses reading `poolBefore`
// as the off arm: with `AGENT_SELECT` unset the seam returns its argument BY
// REFERENCE, 60/60 founders, so "the pool before the seam" and "the pool the
// off arm produces" are the same object and not merely equal ones.
//
// ── The four points, and which of them a model is needed for ───────────────
//
//   1. THE POOL ORDER DIFFERS AND THE SET DOES NOT. The safety property.
//   2. THE WRITER'S CANDIDATES DIFFER. `orderMemoCandidates(...).toWriter`,
//      production's own function, not a reimplementation of it.
//   3. THE PUBLISHED ROWS DIFFER. This is the claim the checklist makes and
//      the one that has been FALSE before — a whole arm was once measured on a
//      table the memo ignored. It is reached here in two ways, and neither
//      renders a memo:
//
//      (a) A THEOREM, which needs no writer at all. `buildInstitutions` maps
//          `toWriter` one-to-one, the writer may drop and reorder rows but can
//          never add one, and the published table is cut to
//          `BRIEF_LIMITS.institutionsMax`. So every published table is a
//          subset of that arm's own `toWriter`, and two published tables can
//          agree on at most |toWriter(off) ∩ toWriter(reverse)| rows. Where
//          that intersection is smaller than the published cap, a full table
//          MUST differ, by at least cap − |intersection| rows, WHATEVER THE
//          WRITER DOES. That is a statement about publication with no model in
//          it.
//
//      (b) THE WRITER'S OWN CONTRACT. The writer is told: "These rows are
//          already ranked and already cut. Write one note per row, in the
//          order given. Do not reorder them, do not omit one." A writer that
//          obeys publishes `toWriter.slice(0, cap)` in that order. That
//          projection is computed here, through production's own row builder,
//          and compared as the founder would read it: institution names, in
//          order.
//
//      (b) IS NOW EXACT, AND IT WAS NOT WHEN IT WAS WRITTEN. This read "what
//      (b) is NOT is a proof: the writer can still demote a row to watch-only
//      on the strength of its own prose, and that is a model output." That
//      demotion is gone (wsGK) — it evicted the fund it matched on at any
//      rank, including the model's first. With it went the last thing between
//      `toWriter.slice(0, cap)` and the page: the publish order is the
//      candidate order, a row the writer wrote nothing about publishes anyway
//      (wsGC), and no property of its prose moves a row. So the projection
//      below is the finished table, not an estimate of it, and it is
//      computable for free.
//
//   4. THE FLOORS ARE UNMOVED. `check_winner_not_gated` (207) and
//      `check_winner_not_blocked` (15) under both arms, run separately.
//
// FREE, and structurally so: ANTHROPIC_API_KEY is DELETED from the environment
// before anything is imported that could use it, so this harness cannot spend
// even if the arm were wired wrong. One Voyage embed and one Postgres read per
// founder, exactly as `_wsdl_equiv`.
//
//   N=60 AGENT_SELECT=reverse npx tsx scripts/_wsdp_order.ts
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
// Before the corpus, before the seam, before anything. A run that cannot
// authenticate cannot bill, and that is a stronger statement than a tally of
// zero calls: the tally says nothing happened, this says nothing COULD.
delete process.env.ANTHROPIC_API_KEY;
requireCredentials("wsdp_order", ["DATABASE_URL", "VOYAGE_KEY"]);

import {
  agentSelectMemoPool, AGENT_SELECT_ARM, agentSelectCostPerBrief, agentSelectTallyLine,
  resetAgentSelectTally,
} from "../lib/intelligence/agentSelect";
import { BRIEF_LIMITS } from "../lib/intelligence/briefChecks";
import {
  corpusProvenance, findPeersBySubsector, hydrateDbInstruments, hydrateGatesFor,
  isGenericSubsector, loadDbInstruments, matchCompany, publishableInstruments,
  requireLiveCorpus, resetGateHydration,
} from "../lib/intelligence/corpus";
import { evaluateEligibility } from "../lib/intelligence/eligibility";
import { ExclusionLog } from "../lib/intelligence/exclusions";
import {
  accessiblePool, orderMemoCandidates, WRITER_CANDIDATE_CAP,
} from "../lib/intelligence/memoCandidates";
import { buildRowsForCheck } from "../lib/intelligence/pipeline";
import { rankerTallyLine, resetRankerTally, semanticFundMatch } from "../lib/intelligence/semantic";
import {
  applyProfileSignal, buildInstrumentTableHydrated, DISPLAY_CAP, founderCountryList,
  tableInputFromAnswers, VERDICT_POOL,
} from "../lib/intelligence/shortlist";
import type { InstrumentRow } from "../lib/intelligence/types";
import { founderIntake, founderPolicyFromEnv, type FounderPolicy } from "./founderIntake";
import { DEFAULT_SEED, sampleRecall } from "./recallSample";
import {
  isDescribed, loadRecallSet, partitionByOfferable, reattributeMissingAnswers, type AnswerMode,
} from "./recallSet";

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);

/** The published cap. Read, never retyped — the same constant `pipeline.ts`
 *  slices the founder's table with. */
const PUBLISH_CAP = BRIEF_LIMITS.institutionsMax;

const sameSeq = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);
const sameSet = (a: string[], b: string[]) => {
  const A = new Set(a), B = new Set(b);
  return A.size === B.size && [...A].every((x) => B.has(x));
};
const overlap = (a: string[], b: string[]) => {
  const B = new Set(b);
  return new Set(a.filter((x) => B.has(x))).size;
};

interface Case {
  company: string;
  pool: number;
  poolOrderDiffers: boolean;
  poolSetSame: boolean;
  writerOrderDiffers: boolean;
  writerSetDiffers: boolean;
  writerOverlap: number;
  writerN: number;
  /** cap − |intersection|, floored at 0: rows that MUST differ in a full
   *  published table whatever the writer does. */
  forcedRowDiff: number;
  publishedOrderDiffers: boolean;
  publishedSetDiffers: boolean;
  offTop: string[];
  revTop: string[];
}

async function main() {
  // This file proves the arm ON differs from the arm OFF. With the arm off it
  // would compare the control with itself and print a green wall of "no
  // difference", which is the exact inversion of `_wsdl_equiv`'s failure mode
  // and just as misleading. With a MODEL arm on it would spend money.
  if (AGENT_SELECT_ARM !== "reverse") {
    console.error(
      `_wsdp_order: REFUSING to run with AGENT_SELECT=${AGENT_SELECT_ARM}. ` +
      `This proves a permutation at the seam reaches the published rows, and it ` +
      `must run on the free deterministic arm: AGENT_SELECT=reverse. With the arm ` +
      `off it would compare the control with itself; with a model arm it would spend.`);
    process.exit(1);
  }

  await hydrateDbInstruments();
  requireLiveCorpus("wsdp_order");
  const corpus = loadDbInstruments();
  const offerable = new Set(publishableInstruments().map((i) => i.id));
  const inCorpus = new Set(corpus.map((i) => i.id));

  const { rows: all } = loadRecallSet();
  const split = process.env.SPLIT ?? "tune";
  const fixed = reattributeMissingAnswers(all, (id) => inCorpus.has(id), (id) => offerable.has(id));
  const pop = partitionByOfferable(fixed.rows, (id) => offerable.has(id));
  const set = pop.graded.filter((r) => (split === "all" || r.split === split)
    && (!process.env.DESCRIBED || isDescribed(r)));
  const N = Math.min(num(process.env.N, 60), set.length);
  const sample = sampleRecall(set, N, num(process.env.SEED, DEFAULT_SEED));

  const policy: FounderPolicy = {
    ...founderPolicyFromEnv(), answers: (process.env.ANSWERS ?? "off") as AnswerMode,
  };
  resetRankerTally();
  resetAgentSelectTally();
  resetGateHydration();

  const cases: Case[] = [];

  for (const t of sample) {
    resetGateHydration();
    const f = founderIntake(t, policy);
    const selfRecord = matchCompany(f.company, f.country);
    const targetSub =
      selfRecord.matched && !isGenericSubsector(selfRecord.subsector) ? selfRecord.subsector : "";
    const dbPeers = targetSub
      ? findPeersBySubsector(targetSub, { country: f.country, limit: 4, exclude: [f.company] })
      : [];
    const semantic = await semanticFundMatch(f.opts.description ?? "");

    // ── The pool, built exactly as `runIntelligence` builds it ─────────────
    const logA = new ExclusionLog();
    const hydratedA = await buildInstrumentTableHydrated({
      fieldChannels: new Set<string>(dbPeers.flatMap((r) => r.channels)),
      founderCountries: founderCountryList(
        f.country, f.eligibility.entityCountries),
      capitalSought: f.opts.capitalSought,
      description: f.opts.description,
      semantic,
      ...tableInputFromAnswers(f.eligibility),
      log: logA,
    } as never);
    // THE CONTROL. `_wsdl_equiv` proves the off arm returns this array by
    // reference, so this IS the off arm's pool and not a reconstruction of it.
    const poolOff: InstrumentRow[] = applyProfileSignal(
      accessiblePool(hydratedA, f.eligibility as never, logA).slice(0, VERDICT_POOL),
      undefined, undefined);
    // THE TREATMENT. Production's own seam, the same call `runIntelligence`
    // makes, on the same object.
    const poolRev = await agentSelectMemoPool(poolOff, {
      country: f.country, description: f.opts.description, eligibility: f.eligibility as never,
    });

    const idsOff = poolOff.map((r) => r.instrumentId ?? r.channel);
    const idsRev = poolRev.map((r) => r.instrumentId ?? r.channel);

    // ── Through production's own ordering, to the writer's input ───────────
    const order = async (pool: InstrumentRow[]) => {
      const ids = pool.map((r) => r.instrumentId).filter((id): id is string => Boolean(id));
      await hydrateGatesFor(ids);
      const log = new ExclusionLog();
      return orderMemoCandidates({
        instrumentTable: pool,
        req: { company: f.company, country: f.country, eligibility: f.eligibility, ...f.opts } as never,
        records: [], dbPeers,
        eligibilityScreen: evaluateEligibility(f.eligibility as never, ids.slice(0, DISPLAY_CAP)),
        log,
      }).toWriter.map((c) => c.row);
    };
    const writerOff = await order(poolOff);
    const writerRev = await order(poolRev);
    const wOff = writerOff.map((r) => r.instrumentId ?? r.channel);
    const wRev = writerRev.map((r) => r.instrumentId ?? r.channel);

    // ── The published projection: production's own row builder, cut to the
    //    published cap. What a writer that obeys its instructions publishes.
    const published = (rows: InstrumentRow[]) =>
      buildRowsForCheck(rows, [], dbPeers).slice(0, PUBLISH_CAP).map((e) => e.institution);
    const pOff = published(writerOff);
    const pRev = published(writerRev);

    const k = overlap(wOff, wRev);
    cases.push({
      company: f.company,
      pool: poolOff.length,
      poolOrderDiffers: !sameSeq(idsOff, idsRev),
      poolSetSame: sameSet(idsOff, idsRev) && idsOff.length === idsRev.length,
      writerOrderDiffers: !sameSeq(wOff, wRev),
      writerSetDiffers: !sameSet(wOff, wRev),
      writerOverlap: k,
      writerN: Math.min(wOff.length, wRev.length),
      forcedRowDiff: Math.max(0, Math.min(PUBLISH_CAP, wOff.length, wRev.length) - k),
      publishedOrderDiffers: !sameSeq(pOff, pRev),
      publishedSetDiffers: !sameSet(pOff, pRev),
      offTop: pOff,
      revTop: pRev,
    });
  }

  // ── Report ────────────────────────────────────────────────────────────────
  const n = cases.length;
  const count = (p: (c: Case) => boolean) => cases.filter(p).length;
  const prov = corpusProvenance();
  console.log(`corpus=${prov.source} instruments=${prov.instruments} at ${prov.hydratedAt}`);
  console.log(rankerTallyLine());
  console.log(agentSelectTallyLine());
  console.log(`caps: pool ${VERDICT_POOL} -> writer ${WRITER_CANDIDATE_CAP} -> published ${PUBLISH_CAP}`);
  console.log(`\n── AGENT_SELECT=reverse vs off, ${n} replayed founders, one pool each ──`);
  const row = (label: string, v: number, want = n) =>
    console.log(`  ${label.padEnd(52)} ${String(v).padStart(4)}/${n}` +
      `${v === want ? "  ok" : "  <- NOT ALL"}`);

  console.log(`\n  1. THE POOL`);
  row("pool ORDER differs", count((c) => c.poolOrderDiffers));
  row("pool SET identical  (the safety property)", count((c) => c.poolSetSame));

  console.log(`\n  2. WHAT THE WRITER IS SHOWN`);
  row("writer's candidate ORDER differs", count((c) => c.writerOrderDiffers));
  row("writer's candidate SET differs", count((c) => c.writerSetDiffers));
  const meanOverlap = cases.reduce((a, c) => a + c.writerOverlap, 0) / (n || 1);
  const meanN = cases.reduce((a, c) => a + c.writerN, 0) / (n || 1);
  console.log(`  ${"mean shared candidates".padEnd(52)} ${meanOverlap.toFixed(1)} of ${meanN.toFixed(1)}`);

  console.log(`\n  3. WHAT PUBLISHES`);
  console.log(`     (a) forced by arithmetic — true whatever the writer does`);
  row("a full published table MUST differ", count((c) => c.forcedRowDiff > 0));
  const meanForced = cases.reduce((a, c) => a + c.forcedRowDiff, 0) / (n || 1);
  console.log(`  ${"mean rows FORCED to differ (of the cap)".padEnd(52)}` +
    ` ${meanForced.toFixed(1)} of ${PUBLISH_CAP}`);
  console.log(`     (b) the projection — what a writer obeying "do not reorder,`);
  console.log(`         do not omit" publishes. NOT a proof: the writer can`);
  console.log(`         reorder, omit and demote, and those are model outputs.`);
  row("published row ORDER differs", count((c) => c.publishedOrderDiffers));
  row("published row SET differs", count((c) => c.publishedSetDiffers));

  const sample3 = cases.filter((c) => c.publishedSetDiffers).slice(0, 3);
  if (sample3.length) {
    console.log(`\n  A published table, both arms (institution names, in order):`);
    for (const c of sample3) {
      console.log(`\n    ${c.company}  (pool ${c.pool}, ${c.writerOverlap} shared candidate(s))`);
      console.log(`      off      ${c.offTop.join(" | ")}`);
      console.log(`      reverse  ${c.revTop.join(" | ")}`);
    }
  }

  // ── What would make this run meaningless ─────────────────────────────────
  const problems: string[] = [];
  if (agentSelectCostPerBrief() !== 0) problems.push("the arm spent money");
  if (count((c) => c.poolSetSame) !== n) problems.push("the pool's MEMBERSHIP moved — the arm is not a pure permutation");
  if (count((c) => c.poolOrderDiffers) !== n) problems.push("the pool's order did not change on every founder");
  if (!count((c) => c.writerOrderDiffers)) problems.push("the writer's candidates never changed");
  if (!count((c) => c.forcedRowDiff > 0)) problems.push("no founder's published table is forced to change");
  if (problems.length) {
    console.error(`\n_wsdp_order: FAILED\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`\n_wsdp_order: a permutation at the seam reaches the writer's input on ` +
    `${count((c) => c.writerOrderDiffers)}/${n} founders and forces a different published ` +
    `table on ${count((c) => c.forcedRowDiff > 0)}/${n}, with the pool's membership unmoved ` +
    `on all ${n}. No model call was made and none was possible.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
