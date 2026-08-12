// wsDL — THE ARM-OFF EQUIVALENCE PROOF.
//
// ── What has to be true, and why prose is not enough ──────────────────────
// A selection seat was opened on the path a founder's brief actually takes.
// The licence for that WAS that with `AGENT_SELECT` unset the shipped path is
// what it was before the seam existed. As of wsGB the default is `adviser` and
// the seam is the shipped path, so `off` is the CONTROL rather than the
// product — and this proof is what says the control is still a clean control.
// Its refusal below is unchanged and is now the thing that makes it honest:
// run it without `AGENT_SELECT=off` and it exits rather than comparing the
// treatment with itself. This repo has twice published a
// figure that turned out to be the control's — once because every model call
// failed authentication and fell back silently, once because a typo in a flag
// read as "off". Both were caught by an attestation, not by a reading of the
// code. So this asserts the property instead of describing it.
//
// ── The three claims, strongest first ─────────────────────────────────────
//
//   1. REFERENCE IDENTITY. `agentSelectMemoPool` returns the ARRAY IT WAS
//      GIVEN, `===`, on the off arm. Not an equal array: the same object. That
//      is stronger than element-wise equality because it also proves nothing
//      was computed — no `assessAll`, no answer rendering, no allocation — so
//      there is no work whose failure could change a result.
//
//   2. ORDER IDENTITY THROUGH THE MEMO. The ids `orderMemoCandidates` yields
//      with the seam in place equal the ids it yields when the seam is skipped
//      entirely, per founder, in order. This is the claim about the PRODUCT:
//      the writer is shown the same candidates in the same order.
//
//   3. NO CALLS. The arm tally says `no calls made`. A run that quietly billed
//      would be a different run.
//
// It also prints the pool, so the membership invariant is visible rather than
// asserted: the set of ids in the pool before and after the seam, compared as
// sets AND as sequences.
//
// FREE. One Voyage embed and one Postgres read per founder, no model calls.
// The seam is off, so this cannot spend on Anthropic even if a key is present.
//
//   N=60 npx tsx scripts/_wsdl_equiv.ts
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("wsdl_equiv", ["DATABASE_URL", "VOYAGE_KEY"]);

import {
  agentSelectMemoPool, AGENT_SELECT_ARM, agentSelectTallyLine, resetAgentSelectTally,
} from "../lib/intelligence/agentSelect";
import {
  corpusProvenance, findPeersBySubsector, hydrateDbInstruments, hydrateGatesFor,
  isGenericSubsector, matchCompany, requireLiveCorpus, resetGateHydration,
} from "../lib/intelligence/corpus";
import { evaluateEligibility } from "../lib/intelligence/eligibility";
import { ExclusionLog } from "../lib/intelligence/exclusions";
import { accessiblePool, orderMemoCandidates } from "../lib/intelligence/memoCandidates";
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
import { publishableInstruments, loadDbInstruments } from "../lib/intelligence/corpus";

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);

async function main() {
  // The proof is about the DEFAULT arm and only about it. Running this with an
  // arm on would compare the treatment against itself and report green, which
  // is precisely the failure this file exists to make impossible.
  if (AGENT_SELECT_ARM !== "off") {
    console.error(`_wsdl_equiv: REFUSING to run with AGENT_SELECT=${AGENT_SELECT_ARM}. ` +
      `This proves the OFF arm is unchanged; with an arm on it would compare the ` +
      `treatment with itself and print a meaningless pass.`);
    process.exit(1);
  }

  await hydrateDbInstruments();
  requireLiveCorpus("wsdl_equiv");
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

  let sameRef = 0, sameMembership = 0, sameSequence = 0, sameMemoOrder = 0;
  const failures: string[] = [];

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

    // ── The control: the pool exactly as it stood before the seam ──────────
    const logA = new ExclusionLog();
    const hydratedA = await buildInstrumentTableHydrated({
      fieldChannels: new Set<string>(dbPeers.flatMap((r) => r.channels)),
      founderCountries: founderCountryList(
        f.country, f.opts.targetMarkets, f.eligibility.entityCountries),
      capitalSought: f.opts.capitalSought,
      description: f.opts.description,
      semantic,
      ...tableInputFromAnswers(f.eligibility),
      log: logA,
    } as never);
    const poolBefore: InstrumentRow[] = applyProfileSignal(
      accessiblePool(hydratedA, f.eligibility as never, logA).slice(0, VERDICT_POOL),
      undefined, undefined);

    // ── The treatment: the SAME pool through the seam ──────────────────────
    const poolAfter = await agentSelectMemoPool(poolBefore, {
      country: f.country, description: f.opts.description, eligibility: f.eligibility as never,
    });

    // 1. reference identity — the strongest available statement
    if (poolAfter === poolBefore) sameRef++;
    else failures.push(`${f.company}: seam returned a NEW array on the off arm`);

    const idsBefore = poolBefore.map((r) => r.instrumentId ?? r.channel);
    const idsAfter = poolAfter.map((r) => r.instrumentId ?? r.channel);
    // 2a. membership: the invariant the whole design rests on
    const setBefore = new Set(idsBefore), setAfter = new Set(idsAfter);
    const membershipOk = setBefore.size === setAfter.size
      && [...setBefore].every((id) => setAfter.has(id));
    if (membershipOk) sameMembership++;
    else failures.push(`${f.company}: POOL MEMBERSHIP MOVED`);
    // 2b. sequence
    if (idsBefore.length === idsAfter.length && idsBefore.every((id, i) => id === idsAfter[i])) {
      sameSequence++;
    } else failures.push(`${f.company}: pool sequence differs`);

    // 3. what the writer is shown, through production's own ordering
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
      }).toWriter.map((c) => c.row.instrumentId ?? c.row.channel);
    };
    const writerBefore = await order(poolBefore);
    const writerAfter = await order(poolAfter);
    if (writerBefore.length === writerAfter.length
      && writerBefore.every((id, i) => id === writerAfter[i])) sameMemoOrder++;
    else failures.push(`${f.company}: THE WRITER'S CANDIDATES DIFFER`);
  }

  const prov = corpusProvenance();
  console.log(`corpus=${prov.source} instruments=${prov.instruments} at ${prov.hydratedAt}`);
  console.log(rankerTallyLine());
  console.log(agentSelectTallyLine());
  console.log(`\n── ARM OFF (AGENT_SELECT=${AGENT_SELECT_ARM}), ${sample.length} replayed founders ──`);
  const row = (label: string, v: number) =>
    console.log(`  ${label.padEnd(46)} ${String(v).padStart(4)}/${sample.length}` +
      `${v === sample.length ? "  ok" : "  <- FAILED"}`);
  row("seam returns its argument BY REFERENCE", sameRef);
  row("pool membership identical", sameMembership);
  row("pool sequence identical", sameSequence);
  row("candidates shown to the WRITER identical", sameMemoOrder);

  if (failures.length) {
    console.error(`\n_wsdl_equiv: FAILED — ${failures.length} founder(s) differ with the arm off:`);
    for (const f of failures.slice(0, 20)) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`\n_wsdl_equiv: ok — with the arm off the memo path is the same path, ` +
    `by reference and through production's own ordering.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
