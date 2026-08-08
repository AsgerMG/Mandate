// Which of the two suspects costs the pool three points?
//
// ── The finding this exists to settle ──────────────────────────────────────
// Giving every replayed founder their OWN `ticketBand` and `capitalSought`
// (ETL/terms/enrich_recall_answers.py) dropped the candidate pool from 94% to
// 91% on every seed. `EXACT@5` can never exceed `P(in pool)`, so those three
// points are a hard ceiling that no ranking change can lift.
//
// Two causes were named and could not be separated from the aggregate:
//
//   1  the capital filter is too strict, and cuts funds that would in fact
//      serve the founder                                    -> a code defect
//   2  a company's past awards are not what a founder would SAY on the intake,
//      so the derived answers are wrong                     -> a harness defect
//
// They have opposite fixes, so guessing is not an option.
//
// ── How this separates them ────────────────────────────────────────────────
// Same population, same sampler, same seeds and the same `computeVerdict` as
// `measure_recall.ts` -- every pair replayed TWICE in one process, once on the
// constants and once on its own derived answers, so the difference is an
// effect and not a change of sample. Every pair that reaches the pool on the
// constants and loses it on the derived answers is a FLIP, and each flip is
// attributed from the `ExclusionLog` rather than reasoned about.
//
// For flips the capital filter caused, the log alone cannot say which cause it
// is -- so each one is asked the only question that decides it:
//
//   DID THIS FUND PAY THIS COMPANY THE KIND OF CAPITAL IT ASKED FOR?
//
// The register answers that per award. If yes, the fund serves the founder and
// we cut it anyway: cause 1, and the encoding is at fault. If the fund has
// never paid that kind to anyone, the founder was asking for something it does
// not offer, and the question moves to whether a founder would really have
// asked: cause 2.
//
//   npx tsx scripts/diagnose_capital_pool.ts
//   SEED=7 N=250 npx tsx scripts/diagnose_capital_pool.ts
import { execFileSync } from "child_process";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("diagnose_capital_pool", ["DATABASE_URL", "VOYAGE_KEY"]);

import {
  corpusProvenance, hydrateDbInstruments, loadDbInstruments, publishableInstruments,
  requireLiveCorpus, resetGateHydration,
} from "../lib/intelligence/corpus";
import { ExclusionLog } from "../lib/intelligence/exclusions";
import { computeVerdict } from "../lib/intelligence/pipeline";
import { CAPITAL_SOUGHT_TO_DB } from "../lib/intelligence/shortlist";
import { DEFAULT_SEED, sampleRecall } from "./recallSample";
import {
  answersFor, assertAncestorConvention, assertGradablePopulation, loadRecallSet,
  partitionByOfferable, reattributeMissingAnswers,
} from "./recallSet";

/** What the record says a fund actually pays. See ETL/terms/recall_capital_facts.py.
 *
 *  Three independent records, because `capital_type` is one value chosen by a
 *  majority vote and the losing kinds are discarded — so the label alone can
 *  never answer "does this fund pay grants". */
interface AwardFacts {
  /** the single rolled-up `capital_type` */
  label: string | null;
  /** what the vote behind that label was: unanimous | lossy | split | unknown */
  vote: { kind: string; agreed: number; total: number; kinds: string[] };
  /** whether any per-award capital record exists for this fund at all */
  hasAwardRecord: boolean;
  /** kinds this company was paid UNDER this scheme */
  ownKinds: string[];
  /** kinds this scheme has paid ANYONE */
  schemeKinds: string[];
  /** kinds this company took anywhere EXCEPT this scheme */
  elsewhereKinds: string[];
}

/** Capital types that dilute. `blended` is deliberately NOT here: see the
 *  finding — every `blended` instrument in the corpus is a vote that failed to
 *  reach its threshold, not a fund with an equity component. */
const DILUTIVE_KINDS = new Set(["equity"]);

function registerFacts(pairs: { name: string; instrument: string }[]): Map<string, AwardFacts> {
  const out = new Map<string, AwardFacts>();
  const payload = JSON.stringify(pairs);
  const raw = execFileSync("python3",
    ["../../ETL/terms/recall_capital_facts.py"],
    { input: payload, maxBuffer: 256 * 1024 * 1024, encoding: "utf8" });
  for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, AwardFacts>)) {
    out.set(k, v);
  }
  assertFactsCoverage(pairs, out);
  return out;
}

/**
 * Every pair must resolve, or the run stops.
 *
 * Not a nicety. A lookup that quietly misses does not produce a missing
 * number, it produces a CONFIDENT WRONG ONE: an unresolved pair has no capital
 * record, no record looks exactly like "this fund does not pay that", and the
 * verdict lands on the harness. The first run of this script read 14 of 14
 * lost pairs as harness defects for precisely that reason -- a NUL byte in the
 * key -- and the output gave no sign of it, because "every fund cut was one
 * the founder had not asked for" is a perfectly sensible-looking finding.
 *
 * The record for a fund we hold nothing about is `hasAwardRecord: false`, which
 * is a real answer. A key that does not resolve at all is a broken join, and
 * there is no honest way to score one.
 */
function assertFactsCoverage(
  pairs: { name: string; instrument: string }[], facts: Map<string, AwardFacts>,
): void {
  const missing = pairs.filter((p) => !facts.has(`${p.name} ${p.instrument}`));
  if (!missing.length) return;
  throw new Error(
    `register lookup resolved ${pairs.length - missing.length}/${pairs.length} pairs. ` +
    `A pair that does not resolve is a broken join, and it would be scored as ` +
    `"this fund does not pay that" -- i.e. as evidence for one of the two ` +
    `hypotheses under test. First unresolved: ${missing.slice(0, 3)
      .map((p) => `${p.name} ${p.instrument}`).join(" | ")}`);
}

/** The intake option a DB `capital_type` answers to, or undefined when the
 *  value answers to none of them -- which is itself a finding, because such an
 *  instrument is cut for EVERY founder who states any preference at all. */
const DB_TO_INTAKE = new Map<string, string>();
for (const [opt, dbTypes] of Object.entries(CAPITAL_SOUGHT_TO_DB)) {
  for (const t of dbTypes) if (!DB_TO_INTAKE.has(t)) DB_TO_INTAKE.set(t, opt);
}

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("diagnose_capital_pool");
  const byId = new Map(loadDbInstruments().map((i) => [i.id, i]));
  const { file: setFile, rows: all } = loadRecallSet();
  const corpus = loadDbInstruments();
  assertAncestorConvention(corpus);
  const inCorpus = new Set(corpus.map((i) => i.id));
  const offerable = new Set(publishableInstruments().map((i) => i.id));
  const fixed = reattributeMissingAnswers(
    all, (id) => inCorpus.has(id), (id) => offerable.has(id));
  const pop = partitionByOfferable(fixed.rows, (id) => offerable.has(id));
  assertGradablePopulation(pop, (id) => inCorpus.has(id), fixed.reattributed.length);
  const split = process.env.SPLIT ?? "holdout";
  const set = pop.graded.filter((r) => split === "all" || r.split === split);
  const N = Math.min(Number(process.env.N ?? 250), set.length);
  const seed = Number(process.env.SEED ?? DEFAULT_SEED);
  const sample = sampleRecall(set, N, seed);

  const facts = registerFacts(sample.map((r) => ({ name: r.name, instrument: r.instrument })));

  const replay = async (t: (typeof sample)[number], mode: "off" | "real") => {
    resetGateHydration();
    const a = answersFor(t, mode as never);
    const log = new ExclusionLog();
    const v = await computeVerdict("TestCo", t.country, {
      entityCountries: [t.country], sector: t.sector ?? "other", activities: ["none"],
      borrowerModel: "operating", ticketBand: a.ticketBand, consortium: "yes",
      useOfFunds: ["industrial_research", "experimental_development"],
      region: a.region,
    } as never, {
      targetMarkets: [t.country], capitalSought: a.capitalSought,
      description: t.description || (t as { selfDescription?: string }).selfDescription || undefined,
      log,
    } as never);
    return { pool: (v.candidateInstrumentIds ?? []) as string[], log, answers: a };
  };

  const flipRule = new Map<string, number>();
  const cause = new Map<string, number>();
  const examples = new Map<string, string[]>();
  const byCountry = new Map<string, { n: number; flip: number; defect: number; harness: number }>();
  const regimeSize = new Map<string, number>();
  for (const i of corpus) {
    const p = (i as { parentId?: string }).parentId ?? i.id;
    regimeSize.set(p, (regimeSize.get(p) ?? 0) + 1);
  }
  const sizeBucket = (n: number) =>
    n <= 1 ? "regime 1 (alone)" : n <= 5 ? "regime 2-5" : n <= 20 ? "regime 6-20"
      : n <= 50 ? "regime 21-50" : "regime 51+";
  const byRegime = new Map<string, { n: number; flip: number; defect: number; harness: number }>();
  const bump = (m: Map<string, { n: number; flip: number; defect: number; harness: number }>,
    k: string, f: boolean, d: boolean, h: boolean) => {
    const e = m.get(k) ?? { n: 0, flip: 0, defect: 0, harness: 0 };
    e.n++; if (f) e.flip++; if (d) e.defect++; if (h) e.harness++; m.set(k, e);
  };

  let poolOff = 0, poolReal = 0, flips = 0, gains = 0;
  for (const t of sample) {
    const off = await replay(t, "off");
    const real = await replay(t, "real");
    const inOff = off.pool.includes(t.instrument);
    const inReal = real.pool.includes(t.instrument);
    if (inOff) poolOff++;
    if (inReal) poolReal++;
    if (inOff && !inReal) flips++;
    if (!inOff && inReal) gains++;

    let defect = false, harness = false;
    if (inOff && !inReal) {
      const ev = real.log.all().filter((e) => e.subject === t.instrument);
      const ids = ev.length ? [...new Set(ev.map((e) => e.ruleId))] : ["UNRECORDED"];
      for (const id of ids) flipRule.set(id, (flipRule.get(id) ?? 0) + 1);
      if (ids.includes("SEL-CAPITAL")) {
        const want = byId.get(t.instrument);
        const f = facts.get(`${t.name} ${t.instrument}`);
        const asked = new Set(real.answers.capitalSought);
        const rollup = want?.capitalType ?? "(none)";
        const rollupOpt = DB_TO_INTAKE.get(rollup);
        // ── The three-way split, and why the third bucket exists ───
        // A two-way split between "code defect" and "harness defect" has to put
        // every fund we hold no per-award capital record for into one of them,
        // and it lands in "harness": no record means no kind to match, which
        // reads exactly like "this fund does not pay that". That is absence of
        // evidence counted AS evidence, in favour of one of the two hypotheses
        // this script exists to separate.
        //
        // It is not hypothetical. The first run of this file reported 14 of 14
        // lost pairs as harness defects, on funds whose award record it had
        // simply failed to look up -- a NUL byte in the lookup key meant every
        // `facts.get` missed and fell through to an empty default. The reading
        // was unanimous, plausible, and entirely an artefact. So: no default,
        // a missing record is its own bucket, and `assertFactsCoverage` below
        // makes a lookup failure fatal rather than quiet.
        let key: string;
        if (!f) {
          key = "3. UNDECIDABLE: no record found for this pair at all";
        } else if (!rollupOpt) {
          key = `1. CODE DEFECT: capital_type "${rollup}" answers to no intake option, so this fund is cut for EVERY founder who states any preference`;
          defect = true;
        } else if (f.vote.kind === "split" && !f.vote.kinds.some((k) => DILUTIVE_KINDS.has(k))) {
          key = "1. CODE DEFECT: a vote that failed its threshold is labelled blended, which only a founder asking for EQUITY can reach -- and nothing in it dilutes";
          defect = true;
        } else if (f.ownKinds.some((k) => asked.has(k))) {
          key = "1. CODE DEFECT: this fund paid THIS company a kind it asked for; the single rollup label denies it";
          defect = true;
        } else if (f.schemeKinds.some((k) => asked.has(k))) {
          key = "1. CODE DEFECT: this fund pays that kind to OTHER companies; the single rollup label denies it";
          defect = true;
        } else if (f.vote.kind === "lossy") {
          key = "1. CODE DEFECT (kind not nameable): the label's own vote denies some of this fund's awards, so it cannot be read as a statement of what the fund pays";
          defect = true;
        } else if (f.hasAwardRecord || f.vote.kind === "unanimous") {
          // Positive evidence that the fund pays only what its label says:
          // either every award voted the same way, or the register lists this
          // scheme's kinds and none of them is the one asked for.
          key = f.ownKinds.length && !f.ownKinds.some((k) => f.elsewhereKinds.includes(k))
            ? "2. HARNESS DEFECT: the kind this fund paid was taken ONLY here, so excluding the won scheme GUARANTEES the derived answer contradicts it"
            : "2. HARNESS DEFECT: the fund really pays only what its label says; the founder's derived answer is what is wrong";
          harness = true;
        } else {
          key = `3. UNDECIDABLE: no per-award capital record for this fund (vote=${f.vote.kind})`;
        }
        cause.set(key, (cause.get(key) ?? 0) + 1);
        const ex = examples.get(key) ?? [];
        if (ex.length < 5) {
          ex.push(`${t.instrument} [${rollup}] asked=${[...asked].join("+")}` +
            ` vote=${f ? f.vote.kind + (f.vote.total ? ` ${f.vote.agreed}/${f.vote.total}` : "") : "-"}` +
            ` paidHere=${f?.ownKinds.join("+") || "-"} schemePays=${f?.schemeKinds.join("+") || "-"}` +
            ` src=${(t as { answerCapitalSource?: string }).answerCapitalSource}`);
          examples.set(key, ex);
        }
      }
    }
    bump(byCountry, t.country || "(none)", inOff && !inReal, defect, harness);
    const wantRegime = byId.get(t.instrument)?.parentId ?? t.instrument;
    bump(byRegime, sizeBucket(regimeSize.get(wantRegime) ?? 1), inOff && !inReal, defect, harness);
  }

  const prov = corpusProvenance();
  console.log(`corpus=${prov.source} instruments=${prov.instruments} at ${prov.hydratedAt}`);
  console.log(`set=${setFile} split=${split} seed=${seed} replayed ${sample.length} pairs twice`);
  const pc = (n: number) => `${n}/${sample.length} (${(100 * n / sample.length).toFixed(1)}%)`;
  console.log(`  in pool, CONSTANT answers   ${pc(poolOff)}`);
  console.log(`  in pool, DERIVED answers    ${pc(poolReal)}`);
  console.log(`  LOST (in pool -> out)       ${pc(flips)}`);
  console.log(`  gained (out -> in pool)     ${pc(gains)}`);
  console.log(`\n  which rule removed the won fund, on the pairs that were LOST:`);
  for (const [k, n] of [...flipRule].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(n).padStart(4)}  ${k}`);
  }
  console.log(`\n  and for the capital cuts, WHICH CAUSE -- decided against the register:`);
  for (const [k, n] of [...cause].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(n).padStart(4)}  ${k}`);
    for (const e of examples.get(k) ?? []) console.log(`          ${e}`);
  }
  const line = (label: string, m: { n: number; flip: number; defect: number; harness: number }) =>
    console.log(`    ${label.padEnd(26)} n=${String(m.n).padStart(4)}  lost ${m.flip}` +
      `  of which code-defect ${m.defect}  harness ${m.harness}`);
  console.log(`\n  by FOUNDER COUNTRY`);
  for (const [k, m] of [...byCountry].sort((a, b) => b[1].n - a[1].n)) if (m.flip) line(k, m);
  console.log(`  by SIZE OF THE GROUP THE RANKER HAD TO ORDER`);
  for (const k of ["regime 1 (alone)", "regime 2-5", "regime 6-20", "regime 21-50", "regime 51+"]) {
    const m = byRegime.get(k); if (m) line(k, m);
  }
}

main();
