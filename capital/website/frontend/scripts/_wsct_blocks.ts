// wsCT — why the memo deletes a fund the founder demonstrably won.
//
// wsCR established that the memo's candidate order holds the won leaf in six
// rows half as often as the screen does (30.0% -> 15.6% on tune), and that
// EVERY leaf the pool held and the memo dropped was dropped by `VER-BLOCKED`:
// `assessAll` decided an encoded gate conclusively fails for a company the
// award register records as having won that exact scheme.
//
// An aggregate of 58 is not actionable. A rule that correctly blocks forty and
// wrongly blocks eighteen needs a different response from one that is wrong
// fifty-eight times, so this classifies EVERY case rather than sampling.
//
// ── The classification, and the confound it has to survive ────────────────
// The harness replays every founder as "TestCo" with a synthetic profile
// (wsCQ: 18 of 23 intake fields are never supplied). A gate that fails because
// the answer behind it was invented is an ARTEFACT of the harness, not a
// defect in the product. Two of the fields the replay supplies come from the
// award register itself and are therefore REAL for this company:
//
//   entityCountries  <- the register's country for the winning company
//   sector           <- the register's sector, where it has one
//
// The rest — activities, borrowerModel, consortium, useOfFunds, ticketBand —
// are constants this harness invents for everybody.
//
// So the split is computed, not asserted: the SAME production function
// (`assessInstrument`) is run twice, once on the full synthetic profile and
// once on an answer object carrying ONLY the register-derived fields. A block
// that still stands when the invented answers are withdrawn SURVIVES REAL
// ANSWERS and is a defect in the rule, the evidence behind it, or the
// attribution. A block that does not is an artefact and must be re-measured
// when wsCQ lands.
//
// This names no fund, country or sector: the field-origin split is a property
// of where the replay got each answer, and an instrument loaded tomorrow is
// classified by the same two runs with no edit here.
//
// FREE: one Voyage embed and one Postgres read per pair. No model calls.
//
//   SPLIT=tune    N=250 npx tsx scripts/_wsct_blocks.ts
//   SPLIT=holdout N=250 npx tsx scripts/_wsct_blocks.ts   # ONCE
import { writeFileSync } from "fs";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("wsct_blocks", ["DATABASE_URL", "VOYAGE_KEY"]);

import {
  corpusProvenance, hydrateDbInstruments, hydrateGatesFor, loadDbInstruments,
  publishableInstruments, requireLiveCorpus, resetGateHydration,
} from "../lib/intelligence/corpus";
import { evaluateEligibility } from "../lib/intelligence/eligibility";
import { ExclusionLog } from "../lib/intelligence/exclusions";
import { orderMemoCandidates } from "../lib/intelligence/memoCandidates";
import { rankerTallyLine, resetRankerTally, semanticFundMatch } from "../lib/intelligence/semantic";
import {
  applyProfileSignal, buildInstrumentTableHydrated, DISPLAY_CAP, founderCountryList,
  tableInputFromAnswers, VERDICT_POOL,
} from "../lib/intelligence/shortlist";
import { assessInstrument, isStructural } from "../lib/intelligence/verdict";
import type { EligibilityAnswers } from "../lib/intelligence/types";
import { DEFAULT_SEED, sampleRecall } from "./recallSample";
import {
  answersFor, assertAncestorConvention, assertGradablePopulation, isDescribed, loadRecallSet,
  partitionByOfferable, reattributeMissingAnswers, type AnswerMode,
} from "./recallSet";

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);

/** Which intake fields this replay fills from the award register, and which it
 *  invents. Stated once; the "survives real answers" run is built from it. */
const REGISTER_DERIVED = ["entityCountries", "sector"] as const;

interface BlockerDetail {
  field: string;
  cited: boolean;
  verified: boolean;
  structural: boolean;
  /** The gate's own verification level, recovered from the corpus so the
   *  evidence tier behind a block is visible and not just its boolean. */
  tier: string;
  requirement: string;
}

interface Case {
  company: string;
  want: string;
  country: string;
  poolRank: number;
  /** Status on the full synthetic profile — this is what production saw. */
  status: string;
  /** Status when only the register-derived answers are supplied. */
  statusReal: string;
  survivesRealAnswers: boolean;
  blockers: BlockerDetail[];
  /** Blockers that remain when the invented answers are withdrawn. */
  realBlockers: BlockerDetail[];
  /** How the status was reached: one structural cited failure, or >=2 of
   *  anything. The second route condemns on uncited evidence. */
  route: "structural_cited" | "two_or_more" | "other";
}

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("wsct_blocks");
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

  resetRankerTally();
  resetGateHydration();
  const cases: Case[] = [];
  let inPool = 0;
  for (const t of sample) {
    resetGateHydration();
    const a = answersFor(t, answerMode);
    // ── replayed EXACTLY as every other harness here replays, wsCQ owns this ─
    const eligibility = {
      entityCountries: [t.country], sector: t.sector ?? "other", activities: ["none"],
      borrowerModel: "operating", ticketBand: a.ticketBand, consortium: "yes",
      useOfFunds: ["industrial_research", "experimental_development"],
      region: a.region,
    } as never;
    const description = t.description || t.selfDescription || undefined;
    const opts = {
      targetMarkets: [t.country], capitalSought: a.capitalSought, description,
    };

    const semantic = await semanticFundMatch(description ?? "");
    const log = new ExclusionLog();
    const hydrated = await buildInstrumentTableHydrated({
      fieldChannels: new Set<string>(),
      founderCountries: founderCountryList(t.country, opts.targetMarkets, [t.country]),
      capitalSought: a.capitalSought,
      description,
      semantic,
      ...tableInputFromAnswers(eligibility),
      log,
    } as never);
    const instrumentTable = applyProfileSignal(hydrated.slice(0, VERDICT_POOL), undefined, undefined);
    const poolIds = instrumentTable
      .map((r) => r.instrumentId).filter((id): id is string => Boolean(id));
    await hydrateGatesFor(poolIds);
    const poolIdx = poolIds.indexOf(t.instrument);
    if (poolIdx < 0) continue;
    inPool += 1;

    // Run the real ordering so the block is attributed by the code that ships,
    // not by a reimplementation of it.
    const eligibilityScreen = evaluateEligibility(eligibility, poolIds.slice(0, DISPLAY_CAP));
    const { assessments } = orderMemoCandidates({
      instrumentTable,
      req: { company: "TestCo", country: t.country, eligibility, ...opts } as never,
      records: [], dbPeers: [], eligibilityScreen, log,
    });
    const assessment = assessments.get(t.instrument);
    if (assessment?.status !== "blocked") continue;

    const inst = byId.get(t.instrument);
    if (!inst) continue;

    // ── the counterfactual: only the register-derived answers ──────────────
    const realOnly: Record<string, unknown> = {};
    for (const f of REGISTER_DERIVED) {
      const v = (eligibility as Record<string, unknown>)[f];
      if (v !== undefined) realOnly[f] = v;
    }
    // `sector` is register-derived only where the register HAS one; the
    // fallback "other" is invented like everything else.
    if (!t.sector) delete realOnly.sector;
    const real = assessInstrument(inst, realOnly as EligibilityAnswers);

    const detail = (b: { field: string; requirement: string; verified: boolean; cited: boolean }): BlockerDetail => {
      const gate = inst.gates.find((g) => g.requirement === b.requirement);
      return {
        field: b.field,
        cited: b.cited,
        verified: b.verified,
        structural: isStructural(b.field),
        tier: gate?.verificationLevel ?? "(unknown)",
        requirement: b.requirement.replace(/\s+/g, " ").slice(0, 140),
      };
    };
    const blockers = assessment.blockers.map(detail);
    const structuralCited = blockers.filter((b) => b.structural && b.cited);
    cases.push({
      company: t.name ?? "(unnamed)",
      want: t.instrument,
      country: t.country,
      poolRank: poolIdx + 1,
      status: assessment.status,
      statusReal: real.status,
      survivesRealAnswers: real.status === "blocked",
      blockers,
      realBlockers: real.blockers.map(detail),
      route: structuralCited.length > 0 ? "structural_cited"
        : blockers.length >= 2 ? "two_or_more" : "other",
    });
  }

  const prov = corpusProvenance();
  console.log(`corpus=${prov.source} instruments=${prov.instruments} at ${prov.hydratedAt}`);
  console.log(rankerTallyLine());
  console.log(`set=${setFile} split=${split} replayed ${sample.length}`);
  console.log(`won leaf inside the memo pool (top ${VERDICT_POOL}): ${inPool}/${sample.length}`);
  console.log(`\n██ VER-BLOCKED on a fund the register says the company WON: ${cases.length} ██`);

  const tally = (label: string, pick: (c: Case) => string) => {
    const m = new Map<string, number>();
    for (const c of cases) m.set(pick(c), (m.get(pick(c)) ?? 0) + 1);
    console.log(`\n── ${label} ──`);
    for (const [k, n] of [...m].sort((x, y) => y[1] - x[1])) {
      console.log(`  ${k.padEnd(46)}${String(n).padStart(4)}  ${(100 * n / (cases.length || 1)).toFixed(1)}%`);
    }
  };

  tally("SURVIVES REAL ANSWERS? (the confound, resolved per case)",
    (c) => c.survivesRealAnswers ? "YES — defect: rule, evidence or attribution"
      : `NO  — artefact of an invented answer (-> ${c.statusReal})`);
  tally("HOW THE BLOCK WAS REACHED", (c) => c.route === "structural_cited"
    ? "one CITED STRUCTURAL failure (the documented rule)"
    : c.route === "two_or_more" ? ">=2 blockers of any tier (condemns uncited)"
    : "(other)");
  tally("DECIDING FIELD(S)", (c) => {
    const sc = c.blockers.filter((b) => b.structural && b.cited).map((b) => b.field);
    return (sc.length ? [...new Set(sc)] : [...new Set(c.blockers.map((b) => b.field))]).sort().join("+");
  });
  tally("EVIDENCE TIER OF THE DECIDING GATE(S)", (c) => {
    const sc = c.blockers.filter((b) => b.structural && b.cited);
    return [...new Set((sc.length ? sc : c.blockers).map((b) => b.tier))].sort().join("+");
  });

  // Regime concentration, beside every count as the standing rule requires.
  const regimes = new Set(cases.map((c) => String(byId.get(c.want)?.parentId ?? c.want)));
  const top = new Map<string, number>();
  for (const c of cases) {
    const k = String(byId.get(c.want)?.parentId ?? c.want);
    top.set(k, (top.get(k) ?? 0) + 1);
  }
  console.log(`\n── CONCENTRATION ──`);
  console.log(`  ${cases.length} blocks across ${regimes.size} regimes and `
    + `${new Set(cases.map((c) => c.country)).size} countries`);
  for (const [k, n] of [...top].sort((x, y) => y[1] - x[1]).slice(0, 8)) {
    console.log(`    ${k.padEnd(48)}${String(n).padStart(4)}`);
  }

  console.log(`\n── EVERY CASE (all ${cases.length}, not a sample) ──`);
  for (const c of cases) {
    const mark = c.survivesRealAnswers ? "DEFECT " : "artefact";
    console.log(`  ${mark} ${c.want.padEnd(34)} ${c.country}  pool#${String(c.poolRank).padStart(2)}  ${c.company.slice(0, 28)}`);
    for (const b of c.blockers) {
      const real = c.realBlockers.some((r) => r.requirement === b.requirement) ? " *STANDS*" : "";
      console.log(`        ${b.field.padEnd(18)} ${b.structural ? "structural" : "choice    "} `
        + `${b.cited ? "CITED  " : "uncited"} ${b.tier.padEnd(20)}${real}  ${b.requirement.slice(0, 78)}`);
    }
  }

  if (process.env.OUT) {
    writeFileSync(process.env.OUT, JSON.stringify(cases, null, 1));
    console.log(`\nwrote ${process.env.OUT}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
