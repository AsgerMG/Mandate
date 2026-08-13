// wsHA — DOES A FACT THAT SEPARATES TWO DOORS OF ONE REGIME EXIST?
//
// `rank_shape_wsGY.md` §2 closes on a hand-off: of the 454 founders who pass
// their gates and never see the fund they won, **287 (63.2%) already see a
// SIBLING of that fund** in their six rows and 389 (85.7%) see the same
// channel. Its words: *"The failure at the median is a choice of DOOR inside a
// regime we already put on the page, not a founder sent to the wrong place."*
// It then states the open question and explicitly declines to answer it:
// whether a fact that separates two DOORS OF ONE REGIME exists — a CONTENT
// question, not a ranking one.
//
// This harness isolates that population and asks the content question the only
// way it can be asked honestly: mechanically, field by field, over the pairs
// themselves.
//
// ── WHAT IT PRODUCES ───────────────────────────────────────────────────────
//
//   1  THE PAIRS.  For every founder in the funnel's own draw who misses with
//      a sibling on the page: the door they WON, the sibling door(s) we SHOWED,
//      and the regime both sit in. This is the working set, and it is written
//      out as evidence rather than described.
//
//   2  A SNAPSHOT OF EVERY INSTRUMENT IN THOSE PAIRS.  Every column the corpus
//      holds on an instrument, plus its EFFECTIVE gate set (after inheritance,
//      which is what a verdict actually reads). Serialised so the field-by-
//      field analysis in `_wsha_report.ts` is offline and free to re-run.
//
// ── THE PROPERTY THIS IS BUILT TO TEST, AND WHY IT IS NOT A LIST ───────────
//
//   A FIELD THAT IS CONSTANT WITHIN A SIBLING GROUP CANNOT SEPARATE ITS DOORS.
//
// `ARCHITECTURE.md`'s dead-routes table records per-fund evidence (state-aid
// case register, SATR fields) at +0.0 "and structurally so", because both join
// on the SA number and the loader splits a regime on that number — so those
// columns are constant inside a leaf's cell BY CONSTRUCTION. That is a
// statement of exactly this property about two named sources. Here it is
// TESTED over every column instead of trusted for two, so a column nobody has
// thought about gets the same verdict from the same expression.
//
// ── FREE, NOT OFFLINE ──────────────────────────────────────────────────────
// One Voyage embedding and one gate hydration per founder — the same cost as
// `measure_funnel.ts` and `_wsgy_rankshape.ts`, and for the same reason: the
// lexical fallback is a different ranker, so a pool built on it would be a
// population no founder is served by. ANTHROPIC_API_KEY is deleted before
// anything that could reach it is imported. NO PAID MODEL CALL.
//
// ── THE ANSWER KEY MAY NOT REACH THE PRODUCT ───────────────────────────────
// The won fund is read off the RECALL SET ROW, which is this harness's own
// object. Nothing under `lib/` is told anything and no production path can
// construct the pair set. `check_answer_not_reachable.ts` stays green.
//
//   N=30 npx tsx scripts/_wsha_doors.ts                    # smoke
//   OUT=/tmp/wsha.json npx tsx scripts/_wsha_doors.ts      # the population
//
// @ws-active until 2026-09-30
import { createHash } from "crypto";
import { writeFileSync } from "fs";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
// Free by construction, not by intention. Verbatim from `_wsgy_rankshape.ts`.
delete process.env.ANTHROPIC_API_KEY;
if (requireCredentials("wsha_doors", ["DATABASE_URL", "VOYAGE_KEY"]) === "offline") {
  throw new Error(
    "_wsha_doors: NO_PG is set. It deletes DATABASE_URL, which serves the "
    + "committed snapshot AND drops every `rankerUsed` call site to the lexical "
    + "index. One flag, two defects. The pairs this harness isolates are the "
    + "pairs the SHIPPED ranker produces; taken off the lexical fallback they "
    + "would be a working set for a product nobody is served by.");
}

import { VERDICT_POOL, WRITER_CANDIDATE_CAP } from "../lib/intelligence/caps";
import { BRIEF_LIMITS } from "../lib/intelligence/briefChecks";
import {
  corpusProvenance, type DbGate, type DbInstrument, findPeersBySubsector,
  hydrateDbInstruments, hydrateGatesFor, isGenericSubsector, loadDbInstruments,
  matchCompany, publishableInstruments, requireLiveCorpus, resetGateHydration,
} from "../lib/intelligence/corpus";
import { evaluateEligibility } from "../lib/intelligence/eligibility";
import { ExclusionLog } from "../lib/intelligence/exclusions";
import { accessiblePool, orderMemoCandidates } from "../lib/intelligence/memoCandidates";
import {
  rankerTallyLine, requireCleanRanker, resetRankerTally, semanticFundMatch,
} from "../lib/intelligence/semantic";
import {
  applyProfileSignal, buildInstrumentTableHydrated, founderCountryList,
  tableInputFromAnswers,
} from "../lib/intelligence/shortlist";
import type { InstrumentRow } from "../lib/intelligence/types";
import { founderIntake, founderPolicyFromEnv, type FounderPolicy } from "./founderIntake";
import { DEFAULT_SEED, sampleRecall } from "./recallSample";
import {
  assertAncestorConvention, assertGradablePopulation, isDescribed, loadRecallSet,
  partitionByOfferable, reattributeMissingAnswers, type RecallRow,
} from "./recallSet";

const num = (v: string | undefined, d: number) =>
  (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : d);

/** The row count the owner reads the brief at, and the depth wsGY's 63.2% is
 *  quoted at. Named once rather than typed at three call sites. */
const SHOWN_ROWS = 6;

/** One founder's contribution. Deliberately narrow: this harness answers a
 *  CONTENT question, so it records identities and leaves every ranking
 *  quantity to `_wsgy_rankshape.ts`, which already measured them. */
export interface DoorRow {
  company: string;
  country: string;
  /** The door the founder actually won. */
  won: string;
  /** The regime both doors sit in — `measure_recall.ts`'s own definition,
   *  `parentId ?? id`, so a REGIME figure here is comparable with every one
   *  this repo has published. */
  wonRegime: string;
  offerable: boolean;
  /** 1-based rank of the won door in the accessible pool; null = its gates
   *  conclusively failed. Carried so this file's population reconciles with
   *  wsGY's without re-deriving it. */
  rankAccessible: number | null;
  accessibleLen: number;
  /** The six rows the founder reads, in order. */
  shown: string[];
  /** Did the won door itself reach the six. */
  hit: boolean;
  /** The shown rows that are SIBLINGS of the won door — same regime, different
   *  id. In shown order, so `[0]` is the door we put highest. */
  siblingsShown: string[];
  /** Same channel, `sourceFamilyBucket`. wsGY's second reading. */
  channelAt6: boolean;
}

/** Every instrument named by any pair, snapshotted whole so the analysis can
 *  run offline. `unknown` rather than a shape: the point is to enumerate the
 *  columns mechanically, not to re-declare them here and go stale. */
export interface InstrumentSnapshot {
  id: string;
  fields: Record<string, unknown>;
  gates: {
    id: string;
    gateFamily?: string;
    gateRole?: string;
    intakeFieldResolved?: string;
    requirement: string;
    value: string;
    valueSpec: unknown;
    verificationLevel?: string;
    inherited: boolean;
    borrowed: boolean;
  }[];
}

/** ── THE COLUMNS ───────────────────────────────────────────────────────────
 *
 *  Every field the corpus SELECTs onto a `DbInstrument`, plus the two it
 *  attaches afterwards (`callRecurrence`, `application`). Read straight off the
 *  object by key, so a column added to `corpus.ts`'s SELECT and to the
 *  interface arrives here as soon as it is loaded — this is a projection of the
 *  type, not a second copy of it.
 *
 *  `gates` is excluded from this list and handled separately: it is a
 *  collection, not a value, and "do the two doors carry different RULES" is a
 *  different question from "do they carry a different number".
 *
 *  Nested leaves (`application.channel` and friends) are flattened, because
 *  comparing the object would report a difference in the URL as a difference in
 *  "application" and hide which half moved. */
export const NESTED = ["application"] as const;

function fieldsOf(inst: DbInstrument): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(inst as unknown as Record<string, unknown>)) {
    if (k === "gates") continue;
    if ((NESTED as readonly string[]).includes(k)) {
      const obj = (v ?? {}) as Record<string, unknown>;
      for (const [k2, v2] of Object.entries(obj)) out[`${k}.${k2}`] = v2 ?? null;
      if (v === null || v === undefined) out[`${k}.channel`] = null;
      continue;
    }
    out[k] = v ?? null;
  }
  return out;
}

const gateOf = (g: DbGate) => ({
  id: g.id,
  gateFamily: g.gateFamily,
  gateRole: g.gateRole,
  intakeFieldResolved: g.intakeFieldResolved,
  requirement: g.requirement,
  value: g.value,
  valueSpec: g.valueSpec ?? null,
  verificationLevel: g.verificationLevel,
  inherited: Boolean(g.inherited),
  borrowed: Boolean(g.borrowed),
});

async function main() {
  const startedAt = new Date().toISOString();
  await hydrateDbInstruments();
  requireLiveCorpus("_wsha_doors");
  const store = corpusProvenance().source;
  if (store !== "postgres") {
    throw new Error(
      `_wsha_doors: the corpus came from ${store}, not Postgres. The whole `
      + "question is which COLUMNS separate two doors, and the snapshot carries "
      + "a different set of them — it predates `schemeEndBasis` entirely. "
      + "Measuring it would answer a question about a corpus nobody is served "
      + "by.");
  }
  resetRankerTally();

  const corpus = loadDbInstruments();
  assertAncestorConvention(corpus);
  const byId = new Map(corpus.map((i) => [i.id, i]));
  const inCorpus = new Set(corpus.map((i) => i.id));
  const offerable = new Set(publishableInstruments().map((i) => i.id));
  const regimeOf = (id: string) => String(byId.get(id)?.parentId ?? id);
  const channelOf = (id: string) => String(byId.get(id)?.sourceFamilyBucket ?? "");

  const { file: setFile, rows: all } = loadRecallSet("wsHA door separation");
  const fixed = reattributeMissingAnswers(
    all, (id) => inCorpus.has(id), (id) => offerable.has(id));
  const pop = partitionByOfferable(fixed.rows, (id) => offerable.has(id));
  assertGradablePopulation(pop, (id) => inCorpus.has(id), fixed.reattributed.length, setFile);

  // ── THE POPULATION, IDENTICAL TO `measure_funnel.ts` AND wsGY ─────────────
  // Drawn from `fixed.rows` (before the offerability cut), held out, described,
  // one founder per company, sorted by name. The fingerprint is asserted below
  // rather than merely printed: a working set that does not compose with
  // `one_funnel/latest.md` is a different study wearing this one's name.
  const split = process.env.SPLIT ?? "holdout";
  const seed = num(process.env.SEED, DEFAULT_SEED);
  let population = fixed.rows.filter((r) =>
    (split === "all" || r.split === split) && isDescribed(r));
  {
    const seen = new Set<string>();
    population = [...population].sort((a, b) => a.name.localeCompare(b.name))
      .filter((r) => (seen.has(r.name) ? false : (seen.add(r.name), true)));
  }
  if (!population.length) {
    throw new Error(`_wsha_doors: no rows match split=${split} with a description.`);
  }
  const n = num(process.env.N, 0);
  const drawn = (n > 0 ? sampleRecall(population, n, seed) : population) as RecallRow[];
  const fingerprint = createHash("sha256")
    .update(drawn.map((r) => `${r.name}::${r.instrument}`).join("\n"))
    .digest("hex").slice(0, 16);

  /** The draw `one_funnel/latest.md` and `rank_shape_wsGY.md` are both computed
   *  on. Asserted on a full-population run so a silent change to the recall set
   *  cannot make this file's 287 a different 287 from the one it cites. */
  const FUNNEL_DRAW = "13cb71cf3a1d1847";
  if (n === 0 && split === "holdout" && fingerprint !== FUNNEL_DRAW) {
    throw new Error(
      `_wsha_doors: draw ${fingerprint} is not the funnel's ${FUNNEL_DRAW}. `
      + "wsGY's 454 misses and 287 sibling misses are quoted on that draw and "
      + "this working set has to be the same founders, or nothing here composes "
      + "with them.");
  }

  console.log(
    `wsHA doors · set=${setFile} split=${split} · ${drawn.length} founder(s)`
    + `${n > 0 ? ` sampled of ${population.length}` : " (the whole population)"}`
    + ` · draw ${fingerprint}\n`);

  const policy: FounderPolicy = founderPolicyFromEnv();
  const out: DoorRow[] = [];

  for (const t of drawn) {
    resetGateHydration();
    const f = founderIntake(t, policy);
    const won = t.instrument;
    const isOfferable = offerable.has(won);

    const row: DoorRow = {
      company: t.name, country: t.country, won, wonRegime: regimeOf(won),
      offerable: isOfferable, rankAccessible: null, accessibleLen: 0,
      shown: [], hit: false, siblingsShown: [], channelAt6: false,
    };

    if (isOfferable) {
      // ── VERBATIM FROM `measure_funnel.ts` / `_wsgy_rankshape.ts` ─────────
      // The founder's own channels are WITHHELD: replayed against the fund they
      // actually won, their history CONTAINS the answer and `fieldChannels` is
      // tier 1 of the row sort. Peers are kept, which is what production does
      // for a founder who is not in the corpus.
      const selfRecord = matchCompany(f.company, f.country);
      const targetSub = selfRecord.matched && !isGenericSubsector(selfRecord.subsector)
        ? selfRecord.subsector : "";
      const dbPeers = targetSub
        ? findPeersBySubsector(targetSub, { country: f.country, limit: 4, exclude: [f.company] })
        : [];
      const semantic = await semanticFundMatch(f.opts.description ?? "");
      const log = new ExclusionLog();
      const founderCountries = founderCountryList(
        f.country, f.opts.targetMarkets, f.eligibility.entityCountries);
      const hydrated = await buildInstrumentTableHydrated({
        fieldChannels: new Set<string>(dbPeers.flatMap((r) => r.channels)),
        founderCountries,
        capitalSought: f.opts.capitalSought,
        description: f.opts.description,
        semantic,
        ...tableInputFromAnswers(f.eligibility),
        log,
      } as never);

      const accessible = applyProfileSignal(
        accessiblePool(hydrated, f.eligibility as never, log), undefined, undefined);
      row.accessibleLen = accessible.length;
      const iAcc = accessible.map((r) => r.instrumentId).indexOf(won);
      row.rankAccessible = iAcc < 0 ? null : iAcc + 1;

      const poolCut = accessible.slice(0, VERDICT_POOL);
      const poolIds = poolCut.map((r) => r.instrumentId)
        .filter((id): id is string => Boolean(id));
      const toWriter = orderMemoCandidates({
        instrumentTable: poolCut,
        req: {
          company: f.company, country: f.country, description: f.opts.description,
          capitalSought: f.opts.capitalSought, eligibility: f.eligibility,
          targetMarkets: undefined,
        } as never,
        records: [], dbPeers,
        eligibilityScreen: evaluateEligibility(f.eligibility as never, poolIds),
        log: new ExclusionLog(),
      }).toWriter.map((x) => x.row.instrumentId ?? x.row.channel);

      row.shown = toWriter.slice(0, SHOWN_ROWS);
      row.hit = row.shown.includes(won);
      row.siblingsShown = row.shown.filter(
        (id) => id !== won && regimeOf(id) === regimeOf(won));
      row.channelAt6 = row.shown.some(
        (id) => channelOf(id) !== "" && channelOf(id) === channelOf(won));
    }

    out.push(row);
    if (out.length % 25 === 0) console.log(`  ${out.length}/${drawn.length}`);
  }

  // ── ATTESTATION, BEFORE ANYTHING IS WRITTEN TO DISK ───────────────────────
  requireCleanRanker("_wsha_doors");
  console.log(`\n${rankerTallyLine()}`);

  // ── THE SNAPSHOT ─────────────────────────────────────────────────────────
  // Every instrument named by a sibling pair, with its EFFECTIVE gate set —
  // after inheritance, because that is what a verdict reads. Gates are hydrated
  // in one batch here rather than per founder: `resetGateHydration()` in the
  // loop above discards them, which is correct for a replay and useless for a
  // snapshot.
  const pairIds = new Set<string>();
  for (const r of out) {
    if (r.hit || !r.siblingsShown.length) continue;
    pairIds.add(r.won);
    for (const s of r.siblingsShown) pairIds.add(s);
  }
  resetGateHydration();
  await hydrateGatesFor([...pairIds]);
  const fresh = new Map(loadDbInstruments().map((i) => [i.id, i]));
  const snapshot: InstrumentSnapshot[] = [...pairIds].sort().map((id) => {
    const inst = fresh.get(id);
    if (!inst) throw new Error(`_wsha_doors: ${id} is in a pair and not in the corpus.`);
    return { id, fields: fieldsOf(inst), gates: (inst.gates ?? []).map(gateOf) };
  });

  const meta = {
    startedAt, finishedAt: new Date().toISOString(),
    set: setFile, split, seed, n: out.length,
    populationSize: population.length, fingerprint,
    store, instruments: corpus.length,
    levers: {
      VERDICT_POOL, WRITER_CANDIDATE_CAP,
      publishedCap: BRIEF_LIMITS.institutionsMax, shown: SHOWN_ROWS,
    },
    ranker: rankerTallyLine(),
  };
  const dest = process.env.OUT ?? "/tmp/wsha_doors.json";
  writeFileSync(dest, JSON.stringify({ meta, rows: out, snapshot }, null, 1));
  console.log(
    `wrote ${dest}  (${out.length} founders, ${pairIds.size} instruments in pairs)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
