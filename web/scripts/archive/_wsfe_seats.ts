// wsFE — WHERE THE DUPLICATE SEATS ACTUALLY ARE, and on which key.
//
// ── The question ───────────────────────────────────────────────────────────
// A founder is shown seven rows and a selector is shown forty. When two of
// those are the same option, a seat is spent saying something the founder has
// already read. Two keys can be asked about a pair, and they disagree:
//
//   the RAW label       `r.instrument` as the pool holds it, after
//                       `distinguishRowNames` has appended the granting body,
//                       the delivery region or an id fragment to separate it
//                       from a twin.
//   the RENDERED label  the same string cut to `ROW_TITLE_CHARS` — which is
//                       what `renderRow` puts on the selector's menu and what
//                       a reader gets to read.
//
// They disagree because the disambiguator appends at the END and the renderer
// cuts the END. On the 200-character French and German legal titles this corpus
// is full of, every distinguisher lands past the cut.
//
// ── What it measured, 36 recall founders, live Postgres, arm off ──────────
// Before wsFE (collapse keyed on the raw label):
//     menu       18 duplicate options across  7 founders
//     published   6 duplicate seats   across  3 founders
//     raw label    0 across 0, on both surfaces
// After (collapse keyed on `rowRenderedLabel`): 0 and 0.
//
// One founder was spending NINE of forty menu slots on one option.
//
// ── Free, and it makes no model call ──────────────────────────────────────
// One Voyage embed and one Postgres read per founder. The pool, the order and
// the rows are production's own functions called directly — a second
// implementation of the table would be grading something no founder is served.
//
//   POP=recall N=36 npx tsx scripts/_wsfe_seats.ts
//   POP=archetypes  npx tsx scripts/_wsfe_seats.ts
import { loadEnvLocal, requireCredentials } from "../loadEnv";

loadEnvLocal();
requireCredentials("wsfe_seats", ["DATABASE_URL", "VOYAGE_KEY"]);

import { BRIEF_LIMITS } from "../../lib/intelligence/briefChecks";
import { SELECT_DEPTH } from "../../lib/intelligence/caps";
import {
  findPeersBySubsector, hydrateDbInstruments, hydrateGatesFor, isGenericSubsector,
  loadDbInstruments, matchCompany, publishableInstruments, requireLiveCorpus,
  resetGateHydration,
} from "../../lib/intelligence/corpus";
import { evaluateEligibility } from "../../lib/intelligence/eligibility";
import { ExclusionLog } from "../../lib/intelligence/exclusions";
import { accessiblePool, orderMemoCandidates } from "../../lib/intelligence/memoCandidates";
import { buildRowsForCheck } from "../../lib/intelligence/pipeline";
import { sanitizeEligibility } from "../../lib/intelligence/sanitize";
import { oneLine, ROW_TITLE_CHARS } from "../../lib/intelligence/schemeText";
import { semanticFundMatch } from "../../lib/intelligence/semantic";
import {
  applyProfileSignal, buildInstrumentTableHydrated, displayInstitutionName, founderCountryList,
  tableInputFromAnswers, VERDICT_POOL,
} from "../../lib/intelligence/shortlist";
import type { InstrumentRow } from "../../lib/intelligence/types";
import { COMPANIES } from "../../lib/intelligence/__benchCompanies";
import { founderIntake, founderPolicyFromEnv, type FounderPolicy } from "../founderIntake";
import { DEFAULT_SEED, sampleRecall } from "../recallSample";
import {
  assertAncestorConvention, assertGradablePopulation, loadRecallSet,
  partitionByOfferable, reattributeMissingAnswers, type AnswerMode,
} from "../recallSet";

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

/** Pairs of rows that render under one key, counted as seats spent twice. */
function dupSeats<T>(rows: T[], keyOf: (r: T) => string): { dup: number; groups: string[][] } {
  const by = new Map<string, T[]>();
  for (const r of rows) {
    const k = keyOf(r);
    if (!k) continue;
    by.set(k, [...(by.get(k) ?? []), r]);
  }
  let dup = 0;
  const groups: string[][] = [];
  for (const [k, peers] of by) {
    if (peers.length < 2) continue;
    dup += peers.length - 1;
    groups.push([k, String(peers.length)]);
  }
  return { dup, groups };
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
    published: buildRowsForCheck(
      ordered.map((c) => c.row), [], dbPeers).slice(0, BRIEF_LIMITS.institutionsMax),
    publishedRows: ordered.map((c) => c.row).slice(0, BRIEF_LIMITS.institutionsMax),
  };
}

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("wsfe_seats");
  const pop = process.env.POP ?? "recall";
  const founders = pop === "recall" ? recallFounders() : archetypeFounders();
  console.log(`population=${pop} founders=${founders.length} `
    + `menu depth=${SELECT_DEPTH} published cap=${BRIEF_LIMITS.institutionsMax}`);

  let menuDupRendered = 0, menuBriefsRendered = 0;
  let menuDupRaw = 0, menuBriefsRaw = 0;
  let pubDupRendered = 0, pubBriefsRendered = 0;
  let pubDupRaw = 0, pubBriefsRaw = 0;
  let pubDupInst = 0, pubBriefsInst = 0;
  let bareFunding = 0, noSectorClause = 0;
  const examples: string[] = [];

  for (const f of founders) {
    const { menu, published, publishedRows } = await poolFor(f);
    const mR = dupSeats(menu, (r) => oneLine(r.instrument, ROW_TITLE_CHARS).toLowerCase());
    const mW = dupSeats(menu, (r) => (r.instrument ?? "").trim().toLowerCase());
    if (mR.dup) { menuDupRendered += mR.dup; menuBriefsRendered++; }
    if (mW.dup) { menuDupRaw += mW.dup; menuBriefsRaw++; }

    const pR = dupSeats(publishedRows, (r) => oneLine(r.instrument, ROW_TITLE_CHARS).toLowerCase());
    const pW = dupSeats(publishedRows, (r) => (r.instrument ?? "").trim().toLowerCase());
    const pI = dupSeats(publishedRows, (r) => displayInstitutionName(r).trim().toLowerCase());
    if (pR.dup) { pubDupRendered += pR.dup; pubBriefsRendered++; }
    if (pW.dup) { pubDupRaw += pW.dup; pubBriefsRaw++; }
    if (pI.dup) { pubDupInst += pI.dup; pubBriefsInst++; }

    for (const e of published) {
      if ((e.descriptor ?? "").startsWith("Funding")) bareFunding++;
      const d = e.descriptor ?? "";
      if (d && !/mostly |% /.test(d)) noSectorClause++;
    }
    if (pR.dup && examples.length < 8) {
      examples.push(`${f.company} (${f.country}) published collisions: `
        + pR.groups.map(([k, n]) => `${n}x "${k.slice(0, 90)}"`).join(" | "));
    }
    if (mR.dup && examples.length < 16) {
      examples.push(`${f.company} (${f.country}) MENU collisions: `
        + mR.groups.map(([k, n]) => `${n}x "${k.slice(0, 90)}"`).join(" | "));
    }
  }

  console.log(`\nMENU (top ${SELECT_DEPTH} of the pool, what the selector reads)`);
  console.log(`  rendered title (oneLine ${ROW_TITLE_CHARS}) : ${menuDupRendered} duplicate options across ${menuBriefsRendered} founders`);
  console.log(`  raw title                          : ${menuDupRaw} duplicate options across ${menuBriefsRaw} founders`);
  console.log(`\nPUBLISHED TABLE (top ${BRIEF_LIMITS.institutionsMax}, arm off)`);
  console.log(`  rendered title (oneLine ${ROW_TITLE_CHARS}) : ${pubDupRendered} duplicate seats across ${pubBriefsRendered} founders`);
  console.log(`  raw title                          : ${pubDupRaw} duplicate seats across ${pubBriefsRaw} founders`);
  console.log(`  displayInstitutionName (printed)   : ${pubDupInst} duplicate seats across ${pubBriefsInst} founders`);
  console.log(`\nDESCRIPTOR`);
  console.log(`  published rows opening "Funding"    : ${bareFunding}`);
  console.log(`  published rows with no sector clause: ${noSectorClause}`);
  console.log("");
  for (const e of examples) console.log("  " + e);
}

main().catch((e) => { console.error(e); process.exit(1); });
