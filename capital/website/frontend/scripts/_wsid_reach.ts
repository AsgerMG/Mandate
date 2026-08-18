// wsID — WHAT THE OLD CUT WAS COSTING, COUNTED ON THE ROWS A FOUNDER IS SERVED.
//
// Free: one Voyage embed and one Postgres read per founder, no model call, no
// write. Production's own table build, pool and candidate order — a second
// implementation would grade rows nobody is served.
//
// ── Why this is a single run and not a before/after pair ──────────────────
// The old collapse key is `oneLine(r.instrument, ROW_TITLE_CHARS)` per row, and
// it is a pure function of a row this run already holds. So the counterfactual
// is EXACT rather than estimated: every row the old key would have demoted is
// computable beside the row the new key keeps, on the same founder, the same
// draw and the same corpus. No cross-run drift, no second arm.
//
// ── What each line means ──────────────────────────────────────────────────
//   WOULD-DEMOTE  rows that render alike under the old per-row cut while their
//                 full names DIFFER. The collapse sent these to the back of the
//                 table, behind every visible row, so a row here was out of the
//                 pool the writer sees.
//   RECOVERED     of those, the ones now inside the published six — a seat a
//                 founder gets back, on a fund whose name really is its own.
//   SAME NAME     rows that collide on their FULL names too. Not this
//                 workstream's: one corpus name on two rows is one option shown
//                 twice and the collapse is right to demote it.
//
//   SPLIT=all N=897 npx tsx scripts/_wsid_reach.ts
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("wsid_reach", ["DATABASE_URL", "VOYAGE_KEY"]);

import { BRIEF_LIMITS } from "../lib/intelligence/briefChecks";
import {
  findPeersBySubsector, hydrateDbInstruments, hydrateGatesFor, isGenericSubsector,
  loadDbInstruments, matchCompany, publishableInstruments, requireLiveCorpus, resetGateHydration,
} from "../lib/intelligence/corpus";
import { evaluateEligibility } from "../lib/intelligence/eligibility";
import { ExclusionLog } from "../lib/intelligence/exclusions";
import { accessiblePool, orderMemoCandidates } from "../lib/intelligence/memoCandidates";
import { oneLine, ROW_TITLE_CHARS } from "../lib/intelligence/schemeText";
import { semanticFundMatch } from "../lib/intelligence/semantic";
import {
  applyProfileSignal, buildInstrumentTableHydrated, founderCountryList, rowRenderedLabels,
  tableInputFromAnswers, VERDICT_POOL,
} from "../lib/intelligence/shortlist";
import type { InstrumentRow } from "../lib/intelligence/types";
import { founderIntake, founderPolicyFromEnv, type FounderPolicy } from "./founderIntake";
import { DEFAULT_SEED, sampleRecall } from "./recallSample";
import {
  assertAncestorConvention, assertGradablePopulation, loadRecallSet,
  partitionByOfferable, reattributeMissingAnswers, type AnswerMode, type RecallRow,
} from "./recallSet";

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);
/** The key the collapse used before wsID: one row at a time, first 120 chars. */
const oldKey = (r: InstrumentRow) => oneLine(r.instrument, ROW_TITLE_CHARS).toLowerCase();

function founders(): RecallRow[] {
  const { file, rows: all } = loadRecallSet();
  const split = process.env.SPLIT ?? "tune";
  const corpus = loadDbInstruments();
  const offerable = new Set(publishableInstruments().map((i) => i.id));
  assertAncestorConvention(corpus);
  const inCorpus = new Set(corpus.map((i) => i.id));
  const fixed = reattributeMissingAnswers(all, (id) => inCorpus.has(id), (id) => offerable.has(id));
  const pop = partitionByOfferable(fixed.rows, (id) => offerable.has(id));
  assertGradablePopulation(pop, (id) => inCorpus.has(id), fixed.reattributed.length, file);
  const set = pop.graded.filter((r) => split === "all" || r.split === split);
  return sampleRecall(set, Math.min(num(process.env.N, 40), set.length),
    num(process.env.SEED, DEFAULT_SEED));
}

async function servedRows(t: RecallRow, policy: FounderPolicy) {
  resetGateHydration();
  const f = founderIntake(t, policy);
  const self = matchCompany(f.company, f.country);
  const sub = self.matched && !isGenericSubsector(self.subsector) ? self.subsector : "";
  const dbPeers = sub
    ? findPeersBySubsector(sub, { country: f.country, limit: 4, exclude: [f.company] }) : [];
  const semantic = await semanticFundMatch(f.opts.description ?? "");
  const log = new ExclusionLog();
  const table = await buildInstrumentTableHydrated({
    fieldChannels: new Set<string>(dbPeers.flatMap((r) => r.channels)),
    founderCountries: founderCountryList(
      f.country, (f.opts.targetMarkets ?? []) as string[],
      (f.eligibility.entityCountries ?? []) as string[]),
    capitalSought: (f.opts.capitalSought ?? []) as string[],
    description: f.opts.description ?? "",
    semantic,
    ...tableInputFromAnswers(f.eligibility as never),
    log,
  } as never);
  const pool = applyProfileSignal(
    accessiblePool(table, f.eligibility as never).slice(0, VERDICT_POOL), undefined, undefined);
  const poolIds = pool.map((r) => r.instrumentId).filter(Boolean) as string[];
  await hydrateGatesFor(poolIds);
  const { ordered } = orderMemoCandidates({
    instrumentTable: pool,
    req: {
      company: f.company, country: f.country, description: f.opts.description ?? "",
      capitalSought: f.opts.capitalSought, targetMarkets: f.opts.targetMarkets,
      eligibility: f.eligibility,
    } as never,
    records: [], dbPeers,
    eligibilityScreen: evaluateEligibility(f.eligibility as never, poolIds),
    log,
  });
  return {
    table, pool,
    six: ordered.map((c) => c.row).slice(0, BRIEF_LIMITS.institutionsMax - 1),
  };
}

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("wsid_reach");
  const policy: FounderPolicy = {
    ...founderPolicyFromEnv(), answers: (process.env.ANSWERS ?? "off") as AnswerMode,
  };
  const set = founders();
  console.log(`founders=${set.length} split=${process.env.SPLIT ?? "tune"} pool=${VERDICT_POOL}`);

  let fWouldDemote = 0, fRecovered = 0, fSameName = 0, fUnseparable = 0, fPool = 0;
  let nWouldDemote = 0, nRecovered = 0, nSameName = 0, nPool = 0;
  let wonRecovered = 0, wonPool = 0;
  const examples: string[] = [];

  for (const t of set) {
    const { table, pool, six } = await servedRows(t, policy);
    const { labelOf, merged } = rowRenderedLabels(table);
    if (merged.length) fUnseparable++;
    // Under the OLD key, every row behind the first of its group was demoted.
    const seen = new Map<string, InstrumentRow>();
    const wouldDemote: InstrumentRow[] = [];
    let sameName = 0;
    for (const r of table) {
      const k = oldKey(r);
      const first = seen.get(k);
      if (!first) { seen.set(k, r); continue; }
      if (first.instrument.trim().toLowerCase() === r.instrument.trim().toLowerCase()) sameName++;
      else wouldDemote.push(r);
    }
    const inSix = wouldDemote.filter((r) => six.includes(r));
    const inPool = wouldDemote.filter((r) => pool.includes(r));
    nWouldDemote += wouldDemote.length; nRecovered += inSix.length; nSameName += sameName;
    nPool += inPool.length;
    if (wouldDemote.length) fWouldDemote++;
    if (inSix.length) fRecovered++;
    if (inPool.length) fPool++;
    if (sameName) fSameName++;
    if (inSix.some((r) => r.instrumentId === t.instrument)) wonRecovered++;
    if (inPool.some((r) => r.instrumentId === t.instrument)) wonPool++;
    if (inSix.length && examples.length < 8) {
      examples.push(`${t.name} (${t.country}) — ${inSix.length} recovered seat(s) in the six:\n`
        + inSix.map((r) => `      ${r.instrumentId}\n        now reads: ${labelOf(r)}`).join("\n"));
    }
  }

  const pct = (n: number) => `${(100 * n / set.length).toFixed(1)}%`;
  console.log("");
  console.log(`WOULD-DEMOTE  founders with >=1 distinct fund the old cut merged   ${fWouldDemote} (${pct(fWouldDemote)})`);
  console.log(`              rows, total                                          ${nWouldDemote}`);
  console.log(`IN THE POOL   founders gaining >=1 of them in the ${VERDICT_POOL}-row menu       ${fPool} (${pct(fPool)})`);
  console.log(`              seats, total                                          ${nPool}`);
  console.log(`              ...and the recovered row is the fund they WON         ${wonPool} (${pct(wonPool)})`);
  console.log(`RECOVERED     founders gaining >=1 of them in the published six     ${fRecovered} (${pct(fRecovered)})`);
  console.log(`              seats, total                                          ${nRecovered}`);
  console.log(`              ...and the recovered row is the fund they WON         ${wonRecovered} (${pct(wonRecovered)})`);
  console.log(`SAME NAME     founders with >=1 pair sharing a FULL name            ${fSameName} (${pct(fSameName)})   rows ${nSameName}`);
  console.log(`UNSEPARABLE   founders where no cut could separate a distinct pair  ${fUnseparable} (${pct(fUnseparable)})`);
  console.log("");
  for (const e of examples) console.log("  " + e + "\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
