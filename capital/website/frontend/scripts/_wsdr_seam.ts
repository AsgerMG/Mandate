// wsDR — THE SEAM, IN BOTH POSITIONS, ON ONE POOL OBJECT.
//
// ── The question ──────────────────────────────────────────────────────────
// wsDQ's first paid run found the model reaching a mean depth of 13.6 of 17 —
// to the bottom of what it was shown — while the fund a company actually wins
// is in those eighteen rows about a third of the time. Depth was binding, not
// judgement. wsDL had put the seam AFTER `accessiblePool(...).slice(0,
// VERDICT_POOL)` deliberately, to buy pool invariance, and said in as many
// words that moving it earlier was "the next measurement, not a silent
// default".
//
// This is that measurement. One lever, two settings:
//
//   late    `agentSelectMemoPool(pool.slice(0, VERDICT_POOL))` — today's
//           shipped position. The score picks the eighteen, the model permutes
//           them. Pool membership cannot move, by construction.
//   early   `agentSelectMemoPool(pool).slice(0, VERDICT_POOL)` — the model
//           reads `SELECT_DEPTH` rows of the whole accessible pool and the top
//           `VERDICT_POOL` of ITS order hold the seats. Membership moves.
//
// ── WHY BOTH ARMS RUN IN ONE PROCESS, OFF ONE ARRAY ───────────────────────
// A sequential before/after on the shared database is not a controlled
// comparison: 29 verdicts were published between one agent's two runs and moved
// its numbers. So the pool is built HERE, once per founder, and both settings
// are handed the same object. The lever is which array is passed, not an
// environment variable, so `AGENT_SELECT` stays read-once at module scope and
// there is no "between" for anything to drift in.
//
// ── THE PROPERTY THAT REPLACES POOL INVARIANCE ────────────────────────────
// Under `early` the pool moves BY DESIGN, so "the pool did not move" is no
// longer available as a safety property and something as strong has to be
// reported in the same output. POOL RECALL is that thing: how often the fund
// the company actually won survives each seam's cut. Six rows promoted from
// rank 19+ push six rows out of the eighteen, and if the answer is more often
// among the six pushed out than among the six pulled in, the arm has lost
// something no ranking gain redeems. It is printed for both settings, on the
// same founders, in the same table as the ranking numbers.
//
// ── What this deliberately does NOT do ────────────────────────────────────
// No writer, no memo, no `synthesize`. The owner ruled it out: "no need to
// write the memo, because when we have the right five funds we can feed into
// the memo." The published table here is the PROJECTION — production's own
// `orderMemoCandidates` on each arm's pool, cut to the published cap. wsDP
// established its standing: it is the last free step and it is not a proof,
// because the writer can reorder, omit and demote.
//
//   MODE=bench  AGENT_SELECT=adviser npx tsx scripts/_wsdr_seam.ts
//   MODE=recall AGENT_SELECT=adviser LIMIT=45 npx tsx scripts/_wsdr_seam.ts
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("wsdr_seam", ["DATABASE_URL", "VOYAGE_KEY", "ANTHROPIC_API_KEY"]);

import {
  AGENT_SELECT_ARM, AGENT_SELECT_SEAM, agentSelectLastTrace, agentSelectTallyLine,
  LOOKUP_MAX, resetAgentSelectTally, SELECT_COUNT, SELECT_DEPTH, setAgentSelectTracing,
  THINK_EFFORT, baseRateSentence,
} from "../lib/intelligence/agentSelect";
import { BRIEF_LIMITS } from "../lib/intelligence/briefChecks";
import { withCostTracking } from "../lib/intelligence/cost";
import {
  corpusProvenance, findPeersBySubsector, hydrateDbInstruments, hydrateGatesFor,
  isGenericSubsector, loadDbInstruments, matchCompany, publishableInstruments,
  requireLiveCorpus, resetGateHydration,
} from "../lib/intelligence/corpus";
import { evaluateEligibility } from "../lib/intelligence/eligibility";
import { ExclusionLog } from "../lib/intelligence/exclusions";
import { accessiblePool, orderMemoCandidates } from "../lib/intelligence/memoCandidates";
import { poolRecallAt, poolRecallN } from "../lib/intelligence/poolRecall";
import { rankerTallyLine, resetRankerTally, semanticFundMatch } from "../lib/intelligence/semantic";
import { sanitizeEligibility } from "../lib/intelligence/sanitize";
import {
  applyProfileSignal, buildInstrumentTableHydrated, founderCountryList,
  tableInputFromAnswers, VERDICT_POOL,
} from "../lib/intelligence/shortlist";
import { COMPANIES } from "../lib/intelligence/__benchCompanies";
import type { InstrumentRow } from "../lib/intelligence/types";
import { founderIntake, founderPolicyFromEnv, type FounderPolicy } from "./founderIntake";
import { isDescribed, loadRecallSet, partitionByOfferable, reattributeMissingAnswers } from "./recallSet";

const PUBLISH_CAP = BRIEF_LIMITS.institutionsMax;
const OUT = path.join(process.cwd(), "..", "..", "project-mgmt", "findings", "seam_wsDR");

/** One founder as this harness needs it, whichever population it came from. */
interface Case {
  label: string;
  company: string;
  country: string;
  description: string;
  eligibility: Record<string, unknown>;
  capitalSought: string[];
  /** The fund they actually won, where there IS an answer key. The bench
   *  twelve are archetypes chosen to be plausible, not recall pairs, so for
   *  them this is undefined and every EXACT figure below is undefined too —
   *  said rather than silently counted as a miss. */
  won?: string;
}

/** What one seam position did on one founder. */
interface Arm {
  menu: number;
  picks: number[];
  deepest: number;
  poolIds: string[];
  publishedIds: string[];
  /** 1-based rank of the won fund among the rows the writer is shown. */
  wonRank: number | null;
  /** Did the won fund survive this seam's cut into the 18-row pool at all. */
  wonInPool: boolean | null;
  fellBack: string | null;
  eur: number;
}

interface Row {
  label: string; company: string; country: string;
  accessible: number;
  wonRankAccessible: number | null;
  late: Arm; early: Arm;
  /** The control: the score's own cut, no model. */
  offPublishedIds: string[];
  offWonRank: number | null;
  offWonInPool: boolean | null;
}

function benchCases(): Case[] {
  return COMPANIES.map((c) => ({
    label: c.archetype,
    company: c.company,
    country: c.country,
    description: c.description,
    capitalSought: ["grant", "loan"],
    eligibility: sanitizeEligibility({
      sector: c.sector, entityCountries: [c.country], exclusionFlags: ["none"],
      cofinancingBand: ">50%", consortium: "unsure",
      borrowerModel: c.borrowerModel ?? "operating", activities: c.activities,
      fteBand: c.fteBand, ticketBand: c.ticketBand, developmentStage: c.developmentStage,
      useOfFunds: ["experimental_development", "industrial_research"],
    } as never)! as unknown as Record<string, unknown>,
  }));
}

function recallCases(limit: number): Case[] {
  const corpus = loadDbInstruments();
  const offerable = new Set(publishableInstruments().map((i) => i.id));
  const inCorpus = new Set(corpus.map((i) => i.id));
  const { rows: all } = loadRecallSet("wsdr seam");
  const fixed = reattributeMissingAnswers(all, (id) => inCorpus.has(id), (id) => offerable.has(id));
  const pop = partitionByOfferable(fixed.rows, (id) => offerable.has(id));
  // TUNE, deliberately: the floors are on tune and wsDQ's screen was on tune,
  // so this figure is comparable with both. The base rate the prompt quotes is
  // measured on HOLDOUT, which is what keeps the two apart.
  const graded = pop.graded.filter((r) => r.split === "tune" && isDescribed(r));
  // One founder per country|sector, best-described first — the same spread
  // wsDQ's screen used, so the two runs cover the same corpus rather than one
  // dense neighbourhood twice.
  const by = new Map<string, typeof graded[number]>();
  for (const r of [...graded].sort((a, b) => (b.description ?? "").length - (a.description ?? "").length)) {
    const key = `${r.sector}|${r.country}`;
    if (!by.has(key)) by.set(key, r);
  }
  const policy: FounderPolicy = founderPolicyFromEnv();
  return [...by.values()].slice(0, limit).map((t) => {
    const f = founderIntake(t, policy);
    return {
      label: `${t.sector ?? "other"}/${t.country}`,
      company: f.company, country: f.country,
      description: f.opts.description ?? "",
      capitalSought: f.opts.capitalSought ?? [],
      eligibility: f.eligibility as unknown as Record<string, unknown>,
      won: t.instrument,
    };
  });
}

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("wsdr_seam");
  resetRankerTally();
  resetAgentSelectTally();
  setAgentSelectTracing(true);

  const mode = (process.env.MODE ?? "bench").toLowerCase();
  const limit = Number(process.env.LIMIT ?? 45);
  const cases = mode === "recall" ? recallCases(limit) : benchCases().slice(0, limit || 99);
  console.log(`mode=${mode} · ${cases.length} founder(s) · both seam positions per founder\n`);

  const rows: Row[] = [];
  let spend = 0;

  for (const c of cases) {
    resetGateHydration();
    const req = {
      company: c.company, country: c.country, description: c.description,
      capitalSought: c.capitalSought, eligibility: c.eligibility,
    };
    const selfRecord = matchCompany(c.company, c.country);
    const targetSub =
      selfRecord.matched && !isGenericSubsector(selfRecord.subsector) ? selfRecord.subsector : "";
    const dbPeers = targetSub
      ? findPeersBySubsector(targetSub, { country: c.country, limit: 4, exclude: [c.company] })
      : [];
    const semantic = await semanticFundMatch(c.description);
    const log = new ExclusionLog();
    const hydrated = await buildInstrumentTableHydrated({
      fieldChannels: new Set<string>([
        ...(selfRecord.matched ? selfRecord.channels : []),
        ...dbPeers.flatMap((r) => r.channels),
      ]),
      founderCountries: founderCountryList(
        c.country, undefined, (c.eligibility as { entityCountries?: string[] }).entityCountries),
      capitalSought: c.capitalSought,
      description: c.description,
      semantic,
      ...tableInputFromAnswers(c.eligibility as never),
      log,
    } as never);

    // ── ONE POOL OBJECT. Everything below is a view of this array ──────────
    const poolFull: InstrumentRow[] = applyProfileSignal(
      accessiblePool(hydrated, c.eligibility as never, log), undefined, undefined);
    const idOf = (r: InstrumentRow) => r.instrumentId ?? r.channel;
    // Gates for every row EITHER seam can show, so the qualification line the
    // model reads is built from the same hydration on both. Hydrating only the
    // first eighteen would give the early arm blank verdicts on exactly the
    // rows it exists to reach.
    await hydrateGatesFor(
      poolFull.slice(0, Math.max(VERDICT_POOL, SELECT_DEPTH))
        .map((r) => r.instrumentId).filter((id): id is string => Boolean(id)));

    const poolOff = poolFull.slice(0, VERDICT_POOL);

    const runArm = async (input: InstrumentRow[], cut: boolean): Promise<Arm> => {
      const { result, eur: spent } = await withCostTracking(
        () => import("../lib/intelligence/agentSelect")
          .then((m) => m.agentSelectMemoPool(input, req as never)));
      spend += spent;
      const t = agentSelectLastTrace();
      const pool = cut ? result.slice(0, VERDICT_POOL) : result;
      const published = project(pool);
      const wonRank = c.won ? rankIn(published.map(idOf), c.won) : null;
      return {
        menu: t?.menu.length ?? 0,
        picks: t?.picks ?? [],
        deepest: Math.max(-1, ...(t?.picks ?? [])),
        poolIds: pool.map(idOf),
        publishedIds: published.slice(0, PUBLISH_CAP).map(idOf),
        wonRank,
        wonInPool: c.won ? pool.map(idOf).includes(c.won) : null,
        fellBack: t?.fellBack ?? null,
        eur: spent,
      };
    };

    /** Production's own ordering, on whichever pool it is handed. The
     *  eligibility screen is computed per arm over that arm's OWN pool ids —
     *  the SIGNAL scope pipeline.ts uses, not the six-row rendered scope two
     *  earlier harnesses copied by mistake. */
    function project(pool: InstrumentRow[]): InstrumentRow[] {
      const l = new ExclusionLog();
      const poolIds = pool.map((r) => r.instrumentId).filter((id): id is string => Boolean(id));
      return orderMemoCandidates({
        instrumentTable: pool,
        req: { ...req, targetMarkets: undefined } as never,
        records: [], dbPeers,
        eligibilityScreen: evaluateEligibility(c.eligibility as never, poolIds),
        semanticScores: semantic, log: l,
      }).toWriter.map((x) => x.row);
    }
    const rankIn = (ids: string[], won: string) => {
      const i = ids.indexOf(won);
      return i < 0 ? null : i + 1;
    };

    // ── BOTH SEAMS, SAME OBJECT, IN ORDER ─────────────────────────────────
    const late = await runArm(poolOff, false);
    const early = await runArm(poolFull, true);

    const offPublished = project(poolOff);
    const offIds = offPublished.slice(0, PUBLISH_CAP).map(idOf);
    rows.push({
      label: c.label, company: c.company, country: c.country,
      accessible: poolFull.length,
      wonRankAccessible: c.won ? rankIn(poolFull.map(idOf), c.won) : null,
      late, early,
      offPublishedIds: offIds,
      offWonRank: c.won ? rankIn(offPublished.map(idOf), c.won) : null,
      offWonInPool: c.won ? poolOff.map(idOf).includes(c.won) : null,
    });

    const mark = (b: boolean | null) => (b == null ? "-" : b ? "Y" : "n");
    console.log(
      `  ${c.company.slice(0, 26).padEnd(27)} accessible ${String(poolFull.length).padStart(3)}` +
      ` · late menu ${String(late.menu).padStart(2)} deepest ${String(late.deepest).padStart(2)}` +
      ` · early menu ${String(early.menu).padStart(2)} deepest ${String(early.deepest).padStart(2)}` +
      ` · won@pool off/late/early ${mark(rows.at(-1)!.offWonInPool)}/${mark(late.wonInPool)}/${mark(early.wonInPool)}` +
      ` · EUR ${(late.eur + early.eur).toFixed(4)}` +
      `${late.fellBack || early.fellBack ? "  ██ FELL BACK" : ""}`);
  }

  // ── The numbers, both seams, one lever ──────────────────────────────────
  const n = rows.length || 1;
  const keyed = rows.filter((r) => r.offWonInPool != null);
  const pct = (k: number, of: number) => `${((100 * k) / (of || 1)).toFixed(1)}%`;
  const exact = (get: (r: Row) => number | null, k: number) =>
    keyed.filter((r) => { const v = get(r); return v != null && v <= k; }).length;
  const mean = (get: (r: Row) => number) => (rows.reduce((a, r) => a + get(r), 0) / n).toFixed(1);

  const L: string[] = [];
  const p = (s = "") => L.push(s);
  const prov = corpusProvenance();
  p(`# wsDR — the seam in both positions (mode=${mode})`);
  p();
  p("```");
  p(`corpus=${prov.source} instruments=${prov.instruments} at ${prov.hydratedAt}`);
  p(rankerTallyLine());
  p(agentSelectTallyLine());
  p(`arm=${AGENT_SELECT_ARM} · LEVER=seam position (late|early), both run per founder ` +
    `in ONE process off ONE pool object`);
  p(`default seam for the product: AGENT_SELECT_SEAM=${AGENT_SELECT_SEAM}`);
  p(`levers: depth=${SELECT_DEPTH} count=${SELECT_COUNT} effort=${THINK_EFFORT} ` +
    `lookups=${LOOKUP_MAX} pool=${VERDICT_POOL} published_cap=${PUBLISH_CAP}`);
  p(`base rate quoted to the model: curve on ${poolRecallN()} held-out founders, ` +
    `P(won in first 6)=${((poolRecallAt(6) ?? 0) * 100).toFixed(1)}% ` +
    `P(won in first ${VERDICT_POOL})=${((poolRecallAt(VERDICT_POOL) ?? 0) * 100).toFixed(1)}% ` +
    `P(won in first ${SELECT_DEPTH})=${((poolRecallAt(SELECT_DEPTH) ?? 0) * 100).toFixed(1)}%`);
  p(`total EUR ${spend.toFixed(4)} over ${rows.length} founders x 2 seams`);
  p("```");
  p();
  p(`## The base-rate line, as the two seams print it`);
  p();
  p("```");
  p(`late  (list of ${VERDICT_POOL}):${baseRateSentence(VERDICT_POOL)}`);
  p("```");
  p("```");
  p(`early (list of ${SELECT_DEPTH}):${baseRateSentence(SELECT_DEPTH)}`);
  p("```");
  p();
  p(`## Depth`);
  p();
  p(`| | list shown | mean deepest reach |`);
  p(`|---|---:|---:|`);
  p(`| late (after the cut) | ${mean((r) => r.late.menu)} | ${mean((r) => r.late.deepest)} |`);
  p(`| early (before the cut) | ${mean((r) => r.early.menu)} | ${mean((r) => r.early.deepest)} |`);
  p();
  p(`mean accessible pool: **${mean((r) => r.accessible)}** rows`);
  p();
  if (keyed.length) {
    p(`## Pool recall — does the answer survive each cut (${keyed.length} founders with an answer key)`);
    p();
    p(`| cut | won fund in the ${VERDICT_POOL}-row pool |`);
    p(`|---|---:|`);
    p(`| the score's (control) | ${keyed.filter((r) => r.offWonInPool).length}/${keyed.length} — ${pct(keyed.filter((r) => r.offWonInPool).length, keyed.length)} |`);
    p(`| late seam | ${keyed.filter((r) => r.late.wonInPool).length}/${keyed.length} — ${pct(keyed.filter((r) => r.late.wonInPool).length, keyed.length)} |`);
    p(`| early seam | ${keyed.filter((r) => r.early.wonInPool).length}/${keyed.length} — ${pct(keyed.filter((r) => r.early.wonInPool).length, keyed.length)} |`);
    p();
    p(`The late seam is a pure permutation of the score's cut, so its pool recall is ` +
      `equal to the control BY CONSTRUCTION and any difference in that row is a bug. ` +
      `The early seam's is the number the membership change has to be bought with.`);
    p();
    const lost = keyed.filter((r) => r.offWonInPool && !r.early.wonInPool);
    const gained = keyed.filter((r) => !r.offWonInPool && r.early.wonInPool);
    p(`- **the early cut DROPPED the answer** the score's cut held: ${lost.length} ` +
      `(${lost.map((r) => `${r.company} — was accessible rank ${r.wonRankAccessible}`).join("; ") || "none"})`);
    p(`- **the early cut ADMITTED an answer** the score's cut missed: ${gained.length} ` +
      `(${gained.map((r) => `${r.company} — accessible rank ${r.wonRankAccessible}`).join("; ") || "none"})`);
    p();
    p(`## EXACT — the won fund in the published projection`);
    p();
    p(`| arm | EXACT@5 | EXACT@6 |`);
    p(`|---|---:|---:|`);
    for (const [name, get] of [
      ["off (score only)", (r: Row) => r.offWonRank],
      ["late seam", (r: Row) => r.late.wonRank],
      ["early seam", (r: Row) => r.early.wonRank],
    ] as [string, (r: Row) => number | null][]) {
      p(`| ${name} | ${exact(get, 5)}/${keyed.length} — ${pct(exact(get, 5), keyed.length)} ` +
        `| ${exact(get, 6)}/${keyed.length} — ${pct(exact(get, 6), keyed.length)} |`);
    }
    p();
  } else {
    p(`## EXACT is NOT REPORTABLE on this population`);
    p();
    p(`These founders are archetypes chosen to be plausible, not recall pairs with a ` +
      `known won fund. There is no answer key, so EXACT@5 and EXACT@6 are undefined ` +
      `here rather than zero, and pool recall cannot be computed. What IS measured is ` +
      `depth, reach and how far the published projection moves. Run \`MODE=recall\` ` +
      `for the graded numbers.`);
    p();
  }
  p(`## Movement in the published projection`);
  p();
  const moved = (get: (r: Row) => string[]) =>
    (rows.reduce((a, r) => a + get(r).filter((x) => !r.offPublishedIds.includes(x)).length, 0) / n).toFixed(1);
  p(`- mean rows the late seam changed: **${moved((r) => r.late.publishedIds)}** of ${PUBLISH_CAP}`);
  p(`- mean rows the early seam changed: **${moved((r) => r.early.publishedIds)}** of ${PUBLISH_CAP}`);
  p(`- fell back to the shipped order: late ${rows.filter((r) => r.late.fellBack).length}, ` +
    `early ${rows.filter((r) => r.early.fellBack).length}, of ${rows.length}`);
  p();
  p(`## Per founder`);
  p();
  p(`| founder | accessible | won @ accessible | late menu/deepest | early menu/deepest | ` +
    `won in pool off/late/early | won rank off/late/early | EUR |`);
  p(`|---|---:|---:|---|---|---|---|---:|`);
  const m = (b: boolean | null) => (b == null ? "—" : b ? "yes" : "**no**");
  const q = (v: number | null) => (v == null ? "—" : String(v));
  for (const r of rows) {
    p(`| ${r.company} (${r.country}) | ${r.accessible} | ${q(r.wonRankAccessible)} | ` +
      `${r.late.menu}/${r.late.deepest} | ${r.early.menu}/${r.early.deepest} | ` +
      `${m(r.offWonInPool)}/${m(r.late.wonInPool)}/${m(r.early.wonInPool)} | ` +
      `${q(r.offWonRank)}/${q(r.late.wonRank)}/${q(r.early.wonRank)} | ` +
      `${(r.late.eur + r.early.eur).toFixed(4)} |`);
  }
  p();

  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, `${mode}.md`), L.join("\n"));
  writeFileSync(path.join(OUT, `${mode}.json`), JSON.stringify(rows, null, 1));
  console.log(`\n${L.join("\n")}`);
  console.log(`wrote ${OUT}/${mode}.md`);
}

main().catch((e) => { console.error(e); process.exit(1); });
