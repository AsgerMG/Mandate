// wsIF — WHAT ONE CORPUS NAME ON TWO ROWS COSTS THE FOUNDER, AND WHAT A RENAME
// WOULD BUY. Measured on the rows a founder is actually served.
//
// Free: one Postgres read and one Voyage embed per founder, NO model call, NO
// write. `NO_PG` is never set — the whole point is production's own pool.
//
// ── Two arms, and the second one is the counterfactual ────────────────────
// ARM A is production. ARM B is the SAME founder, the SAME draw, the SAME
// corpus, with one thing changed: every leaf that shares a full name with a
// sibling is given a name of its own. The names are synthetic on purpose — the
// reach of "give the row its own name" does not depend on WHICH name, only on
// the name being distinct, and using the real curated names would confound the
// measurement with whatever else those strings do to a cut. Arm B asserts that
// nothing it renames still collides, so the arm really is the repair.
//
// The corpus is mutated IN MEMORY, on the hydrated objects, and never written.
//
// ── What each line means ─────────────────────────────────────────────────
//   UNNAMED PAIR  the founder is shown two rows the CORPUS calls the same
//                 thing. Counted on the 40-row menu and on the published six,
//                 because those are two different products.
//   DEMOTED       a row the collapse sent to the back of the table because it
//                 rendered as a label another row already held. Still in the
//                 universe, out of the pool the writer reads.
//   GAINED        arm B has it in the menu / the six and arm A does not.
//
//   SPLIT=all N=897 npx tsx scripts/_wsif_reach.ts
import { loadEnvLocal, requireCredentials } from "../loadEnv";

loadEnvLocal();
requireCredentials("wsif_reach", ["DATABASE_URL", "VOYAGE_KEY"]);

import { BRIEF_LIMITS } from "../../lib/intelligence/briefChecks";
import {
  findPeersBySubsector, hydrateDbInstruments, hydrateGatesFor, isGenericSubsector,
  loadDbInstruments, matchCompany, publishableInstruments, requireLiveCorpus, resetGateHydration,
  type DbInstrument,
} from "../../lib/intelligence/corpus";
import { evaluateEligibility } from "../../lib/intelligence/eligibility";
import { ExclusionLog } from "../../lib/intelligence/exclusions";
import { accessiblePool, orderMemoCandidates } from "../../lib/intelligence/memoCandidates";
import { semanticFundMatch } from "../../lib/intelligence/semantic";
import {
  applyProfileSignal, buildInstrumentTableHydrated, distinguishRowNames, founderCountryList,
  nameRowsAsDoors, rowRenderedLabels, tableInputFromAnswers, VERDICT_POOL,
} from "../../lib/intelligence/shortlist";
import type { InstrumentRow } from "../../lib/intelligence/types";
import { founderIntake, founderPolicyFromEnv, type FounderPolicy } from "../founderIntake";
import { DEFAULT_SEED, sampleRecall } from "../recallSample";
import {
  assertAncestorConvention, assertGradablePopulation, loadRecallSet,
  partitionByOfferable, reattributeMissingAnswers, type AnswerMode, type RecallRow,
} from "../recallSet";

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);

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

/** The classes this repair is ABOUT: leaves a founder in one country could be
 *  shown side by side that the corpus calls the same thing, asked of the widest
 *  table that market can produce. Derived, never listed. */
function sameNameClasses(): Map<string, string> {
  const rowOf = (i: DbInstrument): InstrumentRow => ({
    channel: i.sourceFamilyBucket ?? i.id, instrument: i.name, ticket: "", usedInField: false,
    fit: "", instrumentId: i.id, country: i.country, capitalType: i.capitalType,
    administeringBody: i.administeringBody, administeringBodyShare: i.administeringBodyShare,
    schemeCode: i.schemeCode, deliveryRegion: i.deliveryRegion, schemeOperators: i.schemeOperators,
  } as InstrumentRow);
  const byCountry = new Map<string, DbInstrument[]>();
  for (const i of publishableInstruments()) {
    const c = i.country ?? "??";
    byCountry.set(c, [...(byCountry.get(c) ?? []), i]);
  }
  const classOf = new Map<string, string>();
  for (const [country, group] of byCountry) {
    const rows = group.map(rowOf);
    distinguishRowNames(rows);
    nameRowsAsDoors(rows);
    const by = new Map<string, string[]>();
    for (const r of rows) {
      const k = country + "|" + r.instrument.trim().toLowerCase();
      by.set(k, [...(by.get(k) ?? []), r.instrumentId as string]);
    }
    for (const [k, ids] of by) if (ids.length > 1) for (const id of ids) classOf.set(id, k);
  }
  return classOf;
}

interface Served { table: InstrumentRow[]; pool: InstrumentRow[]; six: InstrumentRow[] }

async function servedRows(t: RecallRow, policy: FounderPolicy): Promise<Served> {
  resetGateHydration();
  const f = founderIntake(t, policy);
  const self = matchCompany(f.company, f.country);
  const sub = self.matched && !isGenericSubsector(self.subsector) ? self.subsector : "";
  const dbPeers = sub
    ? findPeersBySubsector(sub, { country: f.country, limit: 4, exclude: [f.company] }) : [];
  // Fetched per founder per arm rather than shared across them. A shared
  // result was measurably NOT equivalent: every table came back 24 rows of
  // EU-level programmes, identical for a Norwegian and a British founder, which
  // is production for nobody. The embed is a few thousandths of a cent and
  // being wrong about the population is not.
  const semantic = await semanticFundMatch(f.opts.description ?? "");
  const log = new ExclusionLog();
  const table = await buildInstrumentTableHydrated({
    fieldChannels: new Set<string>(dbPeers.flatMap((r) => r.channels)),
    founderCountries: founderCountryList(
      f.country,
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
      capitalSought: f.opts.capitalSought,
      eligibility: f.eligibility,
    } as never,
    records: [], dbPeers,
    eligibilityScreen: evaluateEligibility(f.eligibility as never, poolIds),
    log,
  });
  return { table, pool, six: ordered.map((c) => c.row).slice(0, BRIEF_LIMITS.institutionsMax - 1) };
}

/** How many rows of ONE same-name class the founder holds, worst class first. */
function pairDepth(rows: readonly InstrumentRow[], classOf: Map<string, string>): number[] {
  const n = new Map<string, number>();
  for (const r of rows) {
    const k = r.instrumentId ? classOf.get(r.instrumentId) : undefined;
    if (k) n.set(k, (n.get(k) ?? 0) + 1);
  }
  return [...n.values()].filter((v) => v > 1).sort((a, b) => b - a);
}

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("wsif_reach");
  const classOf = sameNameClasses();
  const classCount = new Set(classOf.values()).size;
  console.log(`same-name classes ${classCount} over ${classOf.size} offerable rows`);

  const policy: FounderPolicy = {
    ...founderPolicyFromEnv(), answers: (process.env.ANSWERS ?? "strict") as AnswerMode,
  };
  const set = founders();
  console.log(`founders=${set.length} split=${process.env.SPLIT ?? "tune"} pool=${VERDICT_POOL}`);

  // Keyed by POSITION, never by a field off the row. `RecallRow` has no
  // `company`, so an id-or-company key folded all 897 founders onto one slot
  // and every table in the run was the LAST founder's — 24 EU rows, identical
  // for a Norwegian and an Estonian, and the summary read a clean 0.0%.
  const armA: Served[] = [];
  for (const t of set) armA.push(await servedRows(t, policy));

  // ── ARM B: every same-name leaf given a name of its own, in memory only ──
  const before = new Map<string, string>();
  for (const i of loadDbInstruments()) {
    if (!classOf.has(i.id)) continue;
    before.set(i.id, i.name);
    // Short and leading, so it cannot be lost to the 120-character cut and
    // cannot itself merge two names under it.
    i.name = `[${i.id.slice(-14)}] ${i.name}`;
  }
  console.log(`arm B renames ${before.size} rows in memory (no write)`);

  const armB: Served[] = [];
  for (const t of set) armB.push(await servedRows(t, policy));
  for (const i of loadDbInstruments()) { const n = before.get(i.id); if (n) i.name = n; }

  let fMenu = 0, fMenu3 = 0, fSix = 0, fSix3 = 0, fTable = 0;
  let nMenu = 0, nSix = 0;
  let fGainedMenu = 0, fGainedSix = 0, nGainedMenu = 0, nGainedSix = 0;
  let wonGainedMenu = 0, wonGainedSix = 0, fStillMerged = 0;
  let fResolvedMenu = 0, fResolvedSix = 0;
  let fSix2B = 0, fSix3B = 0;
  const byClassMenu = new Map<string, number>();
  const examples: string[] = [];

  for (let fi = 0; fi < set.length; fi++) {
    const t = set[fi];
    const a = armA[fi], b = armB[fi];
    const dt = pairDepth(a.table, classOf);
    const dm = pairDepth(a.pool, classOf);
    const ds = pairDepth(a.six, classOf);
    if (dt.length) fTable++;
    if (dm.length) { fMenu++; nMenu += dm.reduce((x, y) => x + y, 0); }
    if (dm.some((v) => v >= 3)) fMenu3++;
    if (ds.length) { fSix++; nSix += ds.reduce((x, y) => x + y, 0); }
    if (ds.some((v) => v >= 3)) fSix3++;
    for (const r of a.pool) {
      const k = r.instrumentId ? classOf.get(r.instrumentId) : undefined;
      if (k) byClassMenu.set(k, (byClassMenu.get(k) ?? 0) + 1);
    }
    // Did arm B actually resolve the founder's unnamed pairs?
    if (dm.length && !pairDepth(b.pool, classOf).length) fResolvedMenu++;
    if (ds.length && !pairDepth(b.six, classOf).length) fResolvedSix++;
    // Arm B must not leave a merge behind: that would mean the rename did not
    // separate what it claims to.
    if (rowRenderedLabels(b.table).merged.length) fStillMerged++;

    const inA = new Set(a.pool.map((r) => r.instrumentId));
    const sixA = new Set(a.six.map((r) => r.instrumentId));
    const gm = b.pool.filter((r) => r.instrumentId && !inA.has(r.instrumentId));
    const gs = b.six.filter((r) => r.instrumentId && !sixA.has(r.instrumentId));
    if (gm.length) { fGainedMenu++; nGainedMenu += gm.length; }
    if (gs.length) { fGainedSix++; nGainedSix += gs.length; }
    if (gm.some((r) => r.instrumentId === t.instrument)) wonGainedMenu++;
    if (gs.some((r) => r.instrumentId === t.instrument)) wonGainedSix++;
    // Concentration, arm B: giving six leaves of one funder six names lets that
    // funder take seats the collapse was accidentally rationing. Reported
    // rather than assumed away — it is the cost side of this repair.
    const depthB6 = pairDepth(b.six, classOf);
    if (depthB6.some((v) => v >= 3)) fSix3B++;
    if (depthB6.length) fSix2B++;
    if (gs.length && examples.length < 10) {
      examples.push(`${t.name} (${t.country}) — six gains ${gs.length}:\n`
        + `      A: ${a.six.map((r) => r.instrumentId).join(", ")}\n`
        + `      B: ${b.six.map((r) => r.instrumentId).join(", ")}`);
    }
  }

  if (armA.length !== set.length || armB.length !== set.length) {
    throw new Error("arm length mismatch — the two arms are not the same population");
  }
  const pct = (n: number) => `${(100 * n / set.length).toFixed(1)}%`;
  console.log("");
  console.log(`TABLE     founders whose served table holds an unnamed pair       ${fTable} (${pct(fTable)})`);
  console.log(`MENU      founders shown an unnamed pair in the ${VERDICT_POOL}-row menu     ${fMenu} (${pct(fMenu)})   rows ${nMenu}`);
  console.log(`          ...three or more rows of ONE name                       ${fMenu3} (${pct(fMenu3)})`);
  console.log(`SIX       founders shown an unnamed pair in the published six     ${fSix} (${pct(fSix)})   rows ${nSix}`);
  console.log(`          ...three or more rows of ONE name                       ${fSix3} (${pct(fSix3)})`);
  console.log("");
  console.log(`RESOLVED  founders who stop seeing an unnamed pair in the menu    ${fResolvedMenu} (${pct(fResolvedMenu)})`);
  console.log(`          ...in the published six                                 ${fResolvedSix} (${pct(fResolvedSix)})`);
  console.log(`GAINED    founders whose menu gains a row the collapse demoted    ${fGainedMenu} (${pct(fGainedMenu)})   rows ${nGainedMenu}`);
  console.log(`          ...and it is the fund they WON                          ${wonGainedMenu} (${pct(wonGainedMenu)})`);
  console.log(`          founders whose SIX gains such a row                     ${fGainedSix} (${pct(fGainedSix)})   rows ${nGainedSix}`);
  console.log(`          ...and it is the fund they WON                          ${wonGainedSix} (${pct(wonGainedSix)})`);
  console.log(`COST      arm B founders whose six holds >=2 rows of ONE class      ${fSix2B} (${pct(fSix2B)})`);
  console.log(`          ...>=3 rows of one class                                ${fSix3B} (${pct(fSix3B)})`);
  console.log(`CHECK     arm B founders still holding an unseparable pair        ${fStillMerged} (must be 0 for the rename to be the repair)`);
  console.log("");
  console.log("== menu rows by class ==");
  for (const [k, n] of [...byClassMenu].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${k.slice(0, 100)}`);
  }
  console.log("");
  for (const e of examples) console.log("  " + e + "\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
