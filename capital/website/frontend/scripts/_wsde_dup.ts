// wsDE — how much of the published table is the same thing said again.
//
// ── The question ───────────────────────────────────────────────────────────
// wsDC put the published row count at seven and stopped there, and NOT because
// the accuracy stopped: from row eight on EXACT@k keeps climbing about two
// points a row while REGIME@k and CHANNEL@k go flat. The blocker it named was
// the reading, from two rendered briefs: rows 4-7 of both were a catalogue,
// four rows carrying one legal basis, one sentence and one action.
//
// Two briefs is an anecdote. This file asks the same question of the whole
// gradable population and of the twelve archetypes, over the rows the founder
// actually receives, and it asks it as a MEASUREMENT PER AXIS: on which fields
// does a published row repeat the row above it, and on which does it differ?
//
// ── The property, stated once ──────────────────────────────────────────────
//
//   A ROW SAYS SOMETHING NEW IF IT CARRIES A FACT VALUE NO EARLIER PUBLISHED
//   ROW CARRIED. A ROW THAT CARRIES NONE IS THE SAME THING SAID AGAIN.
//
// Two things make that a property rather than a list.
//
//   IT IS NOT A FIELD REGISTER. `factAxes()` walks the row's OWN keys, so a
//   field added to InstitutionEntry tomorrow is inside the property with no
//   edit here. What is excluded is excluded by a stated reason, not by
//   omission: a row's IDENTITY (its name, its internal channel code, its
//   scheme code and the links derived from them) is what makes it a different
//   door, and a different door is exactly what wsCG2 proved must not be
//   collapsed. Identity is therefore never counted as saying something new,
//   because "it has a different name" is the claim the reader can already see
//   and is not an answer to "what would I learn from this row".
//
//   IT NAMES NOTHING. No fund, country, sector or regime appears below. The
//   axes are the row's fields and the population is whoever is in the set.
//
// ── What it cannot answer, and must not be read as answering ───────────────
// Nothing here is about SELECTION or ORDERING. The order is taken exactly as
// `orderMemoCandidates` produces it and never touched. This measures what the
// rows SAY.
//
// FREE: one Voyage embed and one Postgres read per founder. No model calls.
//
//   npx tsx scripts/_wsde_dup.ts                    # archetypes
//   POP=recall N=250 npx tsx scripts/_wsde_dup.ts   # the gradable population
import { writeFileSync } from "fs";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("wsde_dup", ["DATABASE_URL", "VOYAGE_KEY"]);

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
import {
  distinguishers, distinguishersWithin, factAxes, FRAMING_AXES, IDENTITY_AXES, rowGroups,
} from "../lib/intelligence/rowNovelty";
import { sanitizeEligibility } from "../lib/intelligence/sanitize";
import { rankerTallyLine, resetRankerTally, semanticFundMatch } from "../lib/intelligence/semantic";
import {
  applyProfileSignal, buildInstrumentTableHydrated, founderCountryList,
  tableInputFromAnswers, VERDICT_POOL,
} from "../lib/intelligence/shortlist";
import { COMPANIES } from "../lib/intelligence/__benchCompanies";
import type { InstitutionEntry } from "../lib/intelligence/types";
import { founderIntake, founderPolicyFromEnv, type FounderPolicy } from "./founderIntake";
import { DEFAULT_SEED, sampleRecall } from "./recallSample";
import {
  assertAncestorConvention, assertGradablePopulation, loadRecallSet,
  partitionByOfferable, reattributeMissingAnswers, type AnswerMode,
} from "./recallSet";

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);

/** Read past every cap, for the same reason wsDC did: a curve that stops at
 *  the cap cannot say what the cap is costing. */
const K_MAX = 12;

interface Founder {
  company: string;
  country: string;
  description: string;
  eligibility: Record<string, unknown>;
  capitalSought: string[];
  targetMarkets: string[];
}

/** The twelve archetypes, intake built exactly as check_memo_table builds it. */
function archetypeFounders(): Founder[] {
  return COMPANIES.map((c) => ({
    company: c.company,
    country: c.country,
    description: c.description,
    capitalSought: ["grant", "loan"],
    targetMarkets: [c.country],
    eligibility: sanitizeEligibility({
      sector: c.sector, activities: c.activities ?? ["none"],
      useOfFunds: ["experimental_development", "industrial_research"],
      entityCountries: [c.country], exclusionFlags: ["none"],
      cofinancingBand: ">50%", consortium: "unsure",
      borrowerModel: c.borrowerModel ?? "operating",
      fteBand: c.fteBand, ticketBand: c.ticketBand,
      developmentStage: c.developmentStage,
    }) as never,
  }));
}

/** The gradable recall population, intake exactly as _wsdc_rows builds it. */
function recallFounders(): Founder[] {
  const { file: setFile, rows: all } = loadRecallSet();
  const split = process.env.SPLIT ?? "tune";
  const corpus = loadDbInstruments();
  const offerable = new Set(publishableInstruments().map((i) => i.id));
  assertAncestorConvention(corpus);
  const inCorpus = new Set(corpus.map((i) => i.id));
  const fixed = reattributeMissingAnswers(all, (id) => inCorpus.has(id), (id) => offerable.has(id));
  const pop = partitionByOfferable(fixed.rows, (id) => offerable.has(id));
  assertGradablePopulation(pop, (id) => inCorpus.has(id), fixed.reattributed.length, setFile);
  const set = pop.graded.filter((r) => split === "all" || r.split === split);
  const N = Math.min(num(process.env.N, 250), set.length);
  const sample = sampleRecall(set, N, num(process.env.SEED, DEFAULT_SEED));
  const policy: FounderPolicy = {
    ...founderPolicyFromEnv(),
    answers: (process.env.ANSWERS ?? "off") as AnswerMode,
  };
  return sample.map((t) => {
    const f = founderIntake(t, policy);
    return {
      company: f.company,
      country: f.country,
      description: f.opts.description ?? "",
      capitalSought: (f.opts.capitalSought ?? []) as string[],
      targetMarkets: (f.opts.targetMarkets ?? []) as string[],
      eligibility: f.eligibility as Record<string, unknown>,
    };
  });
}

/** The rows a founder receives, in the memo's own order, writer fields empty.
 *  `buildRowsForCheck` is production's own builder called directly -- never a
 *  second implementation of the table this file is grading. */
async function rowsFor(f: Founder): Promise<InstitutionEntry[]> {
  resetGateHydration();
  const selfRecord = matchCompany(f.company, f.country);
  const targetSub =
    selfRecord.matched && !isGenericSubsector(selfRecord.subsector) ? selfRecord.subsector : "";
  const dbPeers = targetSub
    ? findPeersBySubsector(targetSub, { country: f.country, limit: 4, exclude: [f.company] })
    : [];
  const semantic = await semanticFundMatch(f.description);
  const log = new ExclusionLog();
  const hydrated = await buildInstrumentTableHydrated({
    fieldChannels: new Set<string>(dbPeers.flatMap((r) => r.channels)),
    founderCountries: founderCountryList(
      f.country, f.targetMarkets, (f.eligibility.entityCountries ?? []) as string[]),
    capitalSought: f.capitalSought,
    description: f.description,
    semantic,
    ...tableInputFromAnswers(f.eligibility as never),
    log,
  } as never);
  const instrumentTable = applyProfileSignal(
    accessiblePool(hydrated, f.eligibility as never).slice(0, VERDICT_POOL), undefined, undefined);
  const poolIds = instrumentTable.map((r) => r.instrumentId).filter(Boolean) as string[];
  await hydrateGatesFor(poolIds);
  const { ordered } = orderMemoCandidates({
    instrumentTable,
    req: {
      company: f.company, country: f.country, description: f.description,
      capitalSought: f.capitalSought, targetMarkets: f.targetMarkets, eligibility: f.eligibility,
    } as never,
    records: [], dbPeers,
    eligibilityScreen: evaluateEligibility(f.eligibility as never, poolIds),
    semanticScores: semantic, log,
  });
  return buildRowsForCheck(ordered.map((c) => c.row), [], dbPeers).slice(0, K_MAX);
}

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("wsde_dup");
  resetRankerTally();

  const pop = process.env.POP ?? "archetypes";
  const founders = pop === "recall" ? recallFounders() : archetypeFounders();

  const tables: InstitutionEntry[][] = [];
  for (const f of founders) tables.push(await rowsFor(f));

  const prov = corpusProvenance();
  console.log(`corpus=${prov.source} instruments=${prov.instruments} at ${prov.hydratedAt}`);
  console.log(rankerTallyLine());
  console.log(`population=${pop} founders=${tables.length} published cap=${BRIEF_LIMITS.institutionsMax}`);

  const cap = BRIEF_LIMITS.institutionsMax;
  const published = tables.map((t) => t.slice(0, cap));
  const allRows = published.flat();
  console.log(`published rows in this population: ${allRows.length} ` +
    `(median table ${published.map((t) => t.length).sort((a, b) => a - b)[Math.floor(published.length / 2)]})`);

  // ── [1] Per-axis repetition, over the published table ────────────────────
  // For each axis, of the rows that carry a value on it, what share carry a
  // value an EARLIER row in the same table already carried?
  console.log(`\n[1] PER-AXIS REPETITION INSIDE ONE PUBLISHED TABLE (cap ${cap})`);
  console.log(`  axis                     carried   repeats an earlier row      tables where 3+ rows share one value`);
  const axisNames = new Set<string>();
  for (const r of allRows) for (const k of Object.keys(factAxes(r))) axisNames.add(k);
  const rows1: [string, number, number, number][] = [];
  for (const axis of [...axisNames].sort()) {
    let carried = 0, repeated = 0, bigRuns = 0;
    for (const t of published) {
      const seen = new Set<string>();
      const counts = new Map<string, number>();
      for (const r of t) {
        const v = factAxes(r)[axis];
        if (v === undefined || v === "") continue;
        carried += 1;
        counts.set(v, (counts.get(v) ?? 0) + 1);
        if (seen.has(v)) repeated += 1;
        seen.add(v);
      }
      if ([...counts.values()].some((n) => n >= 3)) bigRuns += 1;
    }
    rows1.push([axis, carried, repeated, bigRuns]);
  }
  for (const [axis, carried, repeated, bigRuns] of rows1.sort((a, b) => (b[2] / (b[1] || 1)) - (a[2] / (a[1] || 1)))) {
    if (!carried) continue;
    console.log(`  ${axis.padEnd(24)} ${String(carried).padStart(6)}   ` +
      `${String(repeated).padStart(5)} (${(100 * repeated / carried).toFixed(0).padStart(3)}%)             ` +
      `${String(bigRuns).padStart(3)}/${published.length}`);
  }

  // ── [2] The property: does row k say anything new? ───────────────────────
  console.log(`\n[2] DOES ROW k CARRY A FACT NO EARLIER ROW CARRIED? (identity excluded: ${[...IDENTITY_AXES].join(", ")})`);
  console.log(`  k    rows k    any new fact      new fact OUTSIDE the framing   SAME framing as an earlier row`);
  for (let k = 2; k <= K_MAX; k++) {
    const have = tables.filter((t) => t.length >= k);
    if (!have.length) { console.log(`  ${String(k).padStart(2)}   none`); continue; }
    const news = have.map((t) => distinguishers(t[k - 1], t.slice(0, k - 1)));
    const within = have.map((t) => distinguishersWithin(t[k - 1], t.slice(0, k - 1)));
    const some = news.filter((d) => d.length > 0).length;
    const inner = within.filter((d) => d.length > 0).length;
    const sameFraming = news.filter((d) => !d.some((a) => FRAMING_AXES.includes(a))).length;
    console.log(`  ${String(k).padStart(2)}  ${String(have.length).padStart(6)}   ` +
      `${String(some).padStart(5)} (${(100 * some / have.length).toFixed(0).padStart(3)}%)       ` +
      `${String(inner).padStart(5)} (${(100 * inner / have.length).toFixed(0).padStart(3)}%)                  ` +
      `${String(sameFraming).padStart(5)} (${(100 * sameFraming / have.length).toFixed(0).padStart(3)}%)`);
  }

  // ── [3] What the marginal row differs ON, when it differs ────────────────
  console.log(`\n[3] WHEN ROW k SAYS SOMETHING NEW, WHICH AXIS CARRIES IT (share of such rows)`);
  for (const band of [[2, cap], [cap + 1, K_MAX]] as const) {
    const tally = new Map<string, number>();
    let n = 0;
    for (const t of tables) {
      for (let k = band[0]; k <= Math.min(band[1], t.length); k++) {
        const d = distinguishers(t[k - 1], t.slice(0, k - 1));
        if (!d.length) continue;
        n += 1;
        for (const a of d) tally.set(a, (tally.get(a) ?? 0) + 1);
      }
    }
    console.log(`  rows ${band[0]}-${band[1]}  (n=${n})  ` +
      [...tally].sort((a, b) => b[1] - a[1]).slice(0, 8)
        .map(([a, c]) => `${a} ${(100 * c / (n || 1)).toFixed(0)}%`).join("  "));
  }

  // ── [4] The catalogue shape wsDC read, counted ───────────────────────────
  // A GROUP: consecutive rows that are the same KIND of door -- same family,
  // same legal basis, same support shape, same route in. That is the "four
  // rows, one legal basis, one sentence, one action" shape, decided without
  // naming a fund, a country or a regime.
  console.log(`\n[4] GROUPS: CONSECUTIVE ROWS THAT ARE THE SAME KIND OF DOOR (cap ${cap})`);
  const gsizes: number[] = [];
  let inGroup = 0, biggest = 0;
  for (const t of published) {
    const gs = rowGroups(t);
    for (const g of gs) gsizes.push(g.size);
    const big = Math.max(0, ...gs.map((g) => g.size));
    biggest = Math.max(biggest, big);
    inGroup += gs.filter((g) => g.size > 1).reduce((s, g) => s + g.size, 0);
  }
  const gh = new Map<number, number>();
  for (const s of gsizes) gh.set(s, (gh.get(s) ?? 0) + 1);
  for (const [s, n] of [...gh].sort((a, b) => a[0] - b[0])) {
    console.log(`  groups of ${String(s).padStart(2)}: ${String(n).padStart(4)}` +
      `${s > 1 ? `   (${s * n} published rows)` : ""}`);
  }
  console.log(`  ${inGroup}/${allRows.length} published rows (${(100 * inGroup / allRows.length).toFixed(0)}%) ` +
    `sit in a group of two or more; largest group anywhere ${biggest}`);
  const tablesWithBig = published.filter((t) => rowGroups(t).some((g) => g.size >= 3)).length;
  console.log(`  tables with a group of 3+: ${tablesWithBig}/${published.length} ` +
    `(${(100 * tablesWithBig / published.length).toFixed(0)}%)`);
  // Inside a group, does a row still say something? This is the number that
  // decides whether the fix is presentation or selection.
  let inner = 0, innerSilent = 0;
  for (const t of published) {
    for (const g of rowGroups(t)) {
      for (let o = 1; o < g.size; o++) {
        inner += 1;
        if (distinguishersWithin(t[g.start + o], t.slice(0, g.start + o)).length === 0) innerSilent += 1;
      }
    }
  }
  console.log(`  of the ${inner} rows that follow another row of their own kind, ` +
    `${inner - innerSilent} (${(100 * (inner - innerSilent) / (inner || 1)).toFixed(0)}%) still carry a fact ` +
    `no earlier row carried, and ${innerSilent} carry none`);

  // ── [5] Regime concentration, as the standing rule requires ──────────────
  console.log(`\n[5] WHERE THE REPETITION SITS (published rows sharing a family with an earlier row)`);
  const famTally = new Map<string, number>();
  let famRepeat = 0, famCarried = 0;
  for (const t of published) {
    const seen = new Set<string>();
    for (const r of t) {
      const fam = r.familyName?.trim();
      if (!fam) continue;
      famCarried += 1;
      if (seen.has(fam)) { famRepeat += 1; famTally.set(fam, (famTally.get(fam) ?? 0) + 1); }
      seen.add(fam);
    }
  }
  console.log(`  ${famRepeat}/${famCarried} rows repeat a family already on the page, ` +
    `spread over ${famTally.size} famil(ies); largest ${Math.max(0, ...famTally.values())} ` +
    `(${famTally.size ? (100 * Math.max(...famTally.values()) / famRepeat).toFixed(0) : 0}% of the repetition)`);

  if (process.env.OUT) {
    writeFileSync(process.env.OUT, JSON.stringify(published, null, 1));
    console.log(`\nwrote ${process.env.OUT}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
