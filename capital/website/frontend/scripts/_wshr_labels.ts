// wsHR — DOES A PUBLISHED ROW'S NAME REVEAL AN INTERNAL IDENTIFIER, and what
// would removing the branch that does it cost?
//
// ── The question ───────────────────────────────────────────────────────────
// `distinguishRowNames` (shortlist.ts) separates two rows that render under
// one title. Its last-resort token was the instrument's own id with the
// underscores turned into spaces, and a real founder read
// "· rnd  sa 111728  ministere de l economie et des finances ·" in the middle
// of a fund's name on two of her seven rows (wsHP run 1). Removing that branch
// is the obvious fix and the dangerous one: the disambiguator exists because
// same-name siblings are this project's central defect, and a row that loses
// its distinguisher collapses onto its twin and is demoted out of the table.
//
// So this measures BOTH, on the same founders, before and after:
//
//   THE DEFECT   published and menu rows whose name carries a word that came
//                from the id and from no field a human wrote
//                (`internalIdWordsIn`, rowIdentity.ts).
//   THE COST     duplicate seats on the RENDERED label — the key the collapse
//                uses and the one wsFE showed is the only one a reader can
//                check. A rise here is a fund pushed off the page.
//
// ── Free, and it makes no model call ──────────────────────────────────────
// One Voyage embed and one Postgres read per founder. The pool, the order and
// the rows are production's own functions, called directly.
//
//   POP=recall N=36 npx tsx scripts/_wshr_labels.ts
//   POP=archetypes  npx tsx scripts/_wshr_labels.ts
//
// Cited by project-mgmt/findings/row_identity_wsHR.md, which holds the before
// and after numbers this printed.
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("wshr_labels", ["DATABASE_URL", "VOYAGE_KEY"]);

import { BRIEF_LIMITS } from "../lib/intelligence/briefChecks";
import { SELECT_DEPTH } from "../lib/intelligence/caps";
import {
  findPeersBySubsector, hydrateDbInstruments, hydrateGatesFor, isGenericSubsector,
  loadDbInstruments, matchCompany, publishableInstruments, requireLiveCorpus,
  resetGateHydration,
} from "../lib/intelligence/corpus";
import { evaluateEligibility } from "../lib/intelligence/eligibility";
import { ExclusionLog } from "../lib/intelligence/exclusions";
import { accessiblePool, orderMemoCandidates } from "../lib/intelligence/memoCandidates";
import { regionNameFor } from "../lib/intelligence/regions.generated";
import { internalIdWordsIn, qualifierSegments } from "../lib/intelligence/rowIdentity";
import { sanitizeEligibility } from "../lib/intelligence/sanitize";
import { rowRenderedLabels } from "../lib/intelligence/shortlist";
import { semanticFundMatch } from "../lib/intelligence/semantic";
import {
  applyProfileSignal, buildInstrumentTableHydrated, founderCountryList,
  tableInputFromAnswers, VERDICT_POOL,
} from "../lib/intelligence/shortlist";
import type { InstrumentRow } from "../lib/intelligence/types";
import { COMPANIES } from "../lib/intelligence/__benchCompanies";
import { founderIntake, founderPolicyFromEnv, type FounderPolicy } from "./founderIntake";
import { DEFAULT_SEED, sampleRecall } from "./recallSample";
import {
  assertAncestorConvention, assertGradablePopulation, loadRecallSet,
  partitionByOfferable, reattributeMissingAnswers, type AnswerMode,
} from "./recallSet";

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);

interface Founder {
  company: string; country: string; description: string;
  eligibility: Record<string, unknown>; capitalSought: string[];
}

function archetypeFounders(): Founder[] {
  return COMPANIES.map((c) => ({
    company: c.company, country: c.country, description: c.description,
    capitalSought: ["grant", "loan"],
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
  const N = Math.min(num(process.env.N, 36), set.length);
  const sample = sampleRecall(set, N, num(process.env.SEED, DEFAULT_SEED));
  const policy: FounderPolicy = {
    ...founderPolicyFromEnv(),
    answers: (process.env.ANSWERS ?? "off") as AnswerMode,
  };
  return sample.map((t) => {
    const f = founderIntake(t, policy);
    return {
      company: f.company, country: f.country, description: f.opts.description ?? "",
      capitalSought: (f.opts.capitalSought ?? []) as string[],
      eligibility: f.eligibility as Record<string, unknown>,
    };
  });
}

/** Seats spent twice: rows a reader cannot tell apart on the label they read. */
function dupSeats(rows: InstrumentRow[]): number {
  // The label is a fact about the TABLE, not about a row: `cutTitlesApart`
  // spends the budget on what separates the rows in front of one reader. Asking
  // it row by row would grade a string nobody is shown.
  const { labelOf } = rowRenderedLabels(rows);
  const by = new Map<string, number>();
  for (const r of rows) by.set(labelOf(r), (by.get(labelOf(r)) ?? 0) + 1);
  return [...by.values()].filter((n) => n > 1).reduce((a, n) => a + n - 1, 0);
}

/**
 * The fields of a ROW whose text a human wrote about this fund, and which we
 * may show. `administeringBody` raw is deliberately absent — see the note on
 * `internalIdWordsIn`. The row's own TITLE is absent too, and does not need to
 * be here: only the appended qualifiers are graded, and the title is never one.
 */
function humanFields(r: InstrumentRow): (string | undefined)[] {
  return [
    r.schemeCode, r.capitalType, r.country, r.descriptor, r.familyName, r.ticket,
    regionNameFor(r.deliveryRegion ?? "") ?? undefined,
  ];
}

/** Every appended qualifier on this row that reveals an internal identifier. */
function idLeak(r: InstrumentRow): string[] {
  return qualifierSegments(r.instrument)
    .filter((seg) => internalIdWordsIn(seg, r.instrumentId, humanFields(r)).length > 0);
}

async function poolFor(f: Founder) {
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
      f.country, (f.eligibility.entityCountries ?? []) as string[]),
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
      capitalSought: f.capitalSought, eligibility: f.eligibility,
    } as never,
    records: [], dbPeers,
    eligibilityScreen: evaluateEligibility(f.eligibility as never, poolIds),
    log,
  });
  return {
    menu: instrumentTable.slice(0, SELECT_DEPTH) as InstrumentRow[],
    published: ordered.map((c) => c.row).slice(0, BRIEF_LIMITS.institutionsMax),
  };
}

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("wshr_labels");
  const pop = process.env.POP ?? "recall";
  const founders = pop === "recall" ? recallFounders() : archetypeFounders();
  console.log(`population=${pop} founders=${founders.length}  `
    + `menu depth=${SELECT_DEPTH} published cap=${BRIEF_LIMITS.institutionsMax}`);

  let menuRows = 0, pubRows = 0;
  let menuLeak = 0, pubLeak = 0, menuLeakF = 0, pubLeakF = 0;
  let menuDup = 0, pubDup = 0, menuDupF = 0, pubDupF = 0;
  let qualified = 0;
  const examples: string[] = [];

  for (const f of founders) {
    const { menu, published } = await poolFor(f);
    menuRows += menu.length; pubRows += published.length;
    const mL = menu.filter((r) => idLeak(r).length);
    const pL = published.filter((r) => idLeak(r).length);
    menuLeak += mL.length; pubLeak += pL.length;
    if (mL.length) menuLeakF++;
    if (pL.length) pubLeakF++;
    qualified += published.filter((r) => qualifierSegments(r.instrument).length).length;
    const md = dupSeats(menu), pd = dupSeats(published);
    if (process.env.DUPDUMP && md) {
      const by = new Map<string, InstrumentRow[]>();
      const { labelOf: menuLabel } = rowRenderedLabels(menu);
      for (const r of menu) by.set(menuLabel(r), [...(by.get(menuLabel(r)) ?? []), r]);
      for (const [k, g] of by) {
        if (g.length < 2) continue;
        console.log(`\nDUP ${f.company}  x${g.length}  "${k.slice(0, 100)}"`);
        for (const r of g) console.log(`    ${r.instrumentId}  ->  ${r.instrument}`);
      }
    }
    menuDup += md; pubDup += pd;
    if (md) menuDupF++;
    if (pd) pubDupF++;
    for (const r of pL) {
      if (examples.length < 12) {
        examples.push(`${f.company} (${f.country})  ${r.instrumentId}\n      -> ${r.instrument}`);
      }
    }
    // The whole published table for one named founder, read rather than
    // counted. A count cannot say whether what replaced the id fragment is a
    // name a founder can act on.
    if (process.env.DUMP && f.company === process.env.DUMP) {
      console.log(`\nDUMP ${f.company}`);
      published.forEach((r, i) => console.log(`  ${i + 1}. ${r.instrument}\n     [${r.instrumentId}]`));
    }
  }

  console.log(`\nID REVEALED IN A ROW'S NAME  (the defect)`);
  console.log(`  published : ${pubLeak} of ${pubRows} rows across ${pubLeakF} founders`);
  console.log(`  menu      : ${menuLeak} of ${menuRows} rows across ${menuLeakF} founders`);
  console.log(`\nDUPLICATE SEATS ON THE RENDERED LABEL  (what the disambiguator buys)`);
  console.log(`  published : ${pubDup} across ${pubDupF} founders`);
  console.log(`  menu      : ${menuDup} across ${menuDupF} founders`);
  console.log(`\npublished rows carrying ANY appended qualifier: ${qualified} of ${pubRows}`);
  console.log("");
  for (const e of examples) console.log("  " + e);
}

main().catch((e) => { console.error(e); process.exit(1); });
