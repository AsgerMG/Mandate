// wsEI — THE DEPTH SWEEP. DESIGNED, PRICED, AND NOT RUN.
//
// ── Why this exists at all, given wsDR ────────────────────────────────────
// wsDR is quoted as having settled the depth question: EXACT@5 17.8% at a
// 33-row menu against 22.2% at 18, and on nine founders the won fund was inside
// the longer list and the model took it zero times. Read as a verdict that is
// decisive. Read as data it is not a result:
//
//   * The EXACT@6 arms were 10/45 and 9/45, and the PAIRING is one discordant
//     founder — late-only 1, early-only 0. McNemar on (1,0) is p=1.0. Two
//     percentages three points apart, reported unpaired, made one founder look
//     like a finding.
//   * The nine were not nine chances. wsDV read all nine prompts: 0 of 9 won
//     rows carried a sentence saying what the fund pays for, 39 of the 54 rows
//     the model chose instead did, and on 4 of the 9 the answer key attributes
//     a description and an award to two different projects of one organisation.
//     wsDW then repaired the splitter that suppressed those sentences.
//   * The "early" arm never showed the pool. `SELECT_DEPTH` is 40 and the
//     accessible pools ran to a median of 91, so the arm labelled "before the
//     cut" was a 40-row cut. `AGENT_SELECT_DEPTH=all` is the arm its own header
//     described.
//
// So the depth question is OPEN, and it is open on legible rows for the first
// time. This is the harness that would close it.
//
// ── ONE LEVER, AND THE CONTROL IS NOT ON DISK ─────────────────────────────
// The lever is MENU DEPTH and nothing else moves: one seam, one count, one
// effort, one pool object per founder, all arms in one process.
//
// The control is generated here rather than read from wsDR's committed run,
// and it has to be: that run predates wsDW, so its menus are a different
// document. It is also EXACT rather than approximate, and that is worth
// stating precisely, because it is what makes this a sweep of one variable.
// `agentSelectRows` returns `[...chosen, ...everything else in the shipped
// order]` and the caller cuts to `VERDICT_POOL`, so the pool at depth D is
//
//     {the <=SELECT_COUNT rows the model named from the first D}
//   ∪ {the first VERDICT_POOL - SELECT_COUNT of the score's order not named}
//
// At D = VERDICT_POOL every named row is already inside the score's eighteen,
// so that set IS the shipped late seam's eighteen, reordered. The D=18 arm is
// therefore a bit-exact stand-in for what ships, produced on the same founders,
// the same pool object and the same corpus fingerprint as every other arm.
//
// ── HOW DEPTH IS VARIED WITHOUT AN ENVIRONMENT VARIABLE ───────────────────
// `SELECT_DEPTH` is read once at module scope, on purpose, so it cannot be
// swept from inside one process — and sweeping it across processes reintroduces
// exactly the drift wsDR built the one-pool-object discipline to remove (29
// verdicts were published between one agent's two runs and moved its numbers).
//
// So the process runs at `AGENT_SELECT_DEPTH=all` and each arm is handed
// `pool.slice(0, D)`. That is identical: `agentSelectRows` computes `head =
// rows.slice(0, min(SELECT_DEPTH, rows.length))`, and with SELECT_DEPTH
// infinite the head IS the array it was handed. The requirement is asserted at
// startup rather than trusted, because a run made at the default 40 would cap
// every arm at 40 and report the 40-row menu three times under three names.
//
// ── WHAT IT COSTS, from wsDR's own recorded per-call spend ────────────────
// Fitting the 90 recorded calls in `findings/seam_wsDR/recall.json`:
//
//     EUR per call ≈ 0.0109 + 0.000431 × menu rows      (adviser, effort=low)
//
// which is EUR 0.019 at 18 rows, EUR 0.028 at 40, and EUR 0.048 at a mean
// whole pool of 87. Four arms (6 / 18 / 40 / all) is about EUR 0.11 per
// founder:
//
//     n =  45   EUR   5      ± 12 points on EXACT@6 — wsDR's precision, useless
//     n = 250   EUR  28      ±  5 points
//     n = 434   EUR  48      powers an 8-point paired move at 80%
//     n = 846   EUR  93      the whole holdout split, ± 2.8 points
//
// The honest recommendation is n = 250 at EUR ~28. Below 250 the interval is
// wider than any move worth acting on, and this repo has now twice published a
// difference smaller than its own noise.
//
// ── WHAT IS REPORTED, AND WHY PAIRED ──────────────────────────────────────
// Every arm sees the same founder, so the arms are PAIRED and the unpaired
// percentages are the weaker reading of the same data. wsDR published the
// unpaired pair and the paired table would have said "one founder". Both are
// printed here, discordance first.
//
//   npx tsx scripts/_wsei_depth_arms.ts                      # NOT YET RUN
//   AGENT_SELECT=adviser AGENT_SELECT_DEPTH=all LIMIT=250 \
//     MODE=recall npx tsx scripts/_wsei_depth_arms.ts
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("wsei_depth_arms", ["DATABASE_URL", "VOYAGE_KEY", "ANTHROPIC_API_KEY"]);

import {
  AGENT_SELECT_ARM, agentSelectLastTrace, agentSelectTallyLine, LOOKUP_MAX,
  resetAgentSelectTally, SELECT_COUNT, SELECT_DEPTH, setAgentSelectTracing, THINK_EFFORT,
} from "../lib/intelligence/agentSelect";
import { BRIEF_LIMITS } from "../lib/intelligence/briefChecks";
import { withCostTracking } from "../lib/intelligence/cost";
import {
  corpusProvenance, findPeersBySubsector, hydrateDbInstruments, hydrateGatesFor,
  isGenericSubsector, matchCompany, publishableInstruments, requireLiveCorpus,
  resetGateHydration, loadDbInstruments,
} from "../lib/intelligence/corpus";
import { evaluateEligibility } from "../lib/intelligence/eligibility";
import { ExclusionLog } from "../lib/intelligence/exclusions";
import { accessiblePool, orderMemoCandidates } from "../lib/intelligence/memoCandidates";
import { poolRecallAt, poolRecallN } from "../lib/intelligence/poolRecall";
import { rankerTallyLine, resetRankerTally, semanticFundMatch } from "../lib/intelligence/semantic";
import {
  applyProfileSignal, buildInstrumentTableHydrated, founderCountryList,
  tableInputFromAnswers, VERDICT_POOL,
} from "../lib/intelligence/shortlist";
import type { InstrumentRow } from "../lib/intelligence/types";
import { founderIntake, founderPolicyFromEnv, type FounderPolicy } from "./founderIntake";
import { isDescribed, loadRecallSet, partitionByOfferable, reattributeMissingAnswers } from "./recallSet";

const PUBLISH_CAP = BRIEF_LIMITS.institutionsMax;
const OUT = path.join(process.cwd(), "..", "..", "project-mgmt", "findings", "depth_wsEI");

/** The arms. `0` reads as the whole accessible pool. `VERDICT_POOL` is the
 *  control and is derived, never typed, so a pool cap that moves moves the
 *  control with it instead of leaving it grading a depth nobody ships. */
const ARMS: number[] = [VERDICT_POOL, 40, 0];

interface Arm {
  depth: number;
  menu: number;
  picks: number[];
  deepest: number;
  poolIds: string[];
  publishedIds: string[];
  wonRank: number | null;
  wonInPool: boolean;
  fellBack: string | null;
  eur: number;
}

interface Row {
  company: string;
  country: string;
  accessible: number;
  wonRankAccessible: number | null;
  /** Did the won fund's own row say what it funds? The wsDV question, recorded
   *  per founder so a null result can be read against legibility rather than
   *  argued about afterwards. */
  wonDescribed: boolean | null;
  arms: Arm[];
}

function cases(limit: number) {
  const corpus = loadDbInstruments();
  const offerable = new Set(publishableInstruments().map((i) => i.id));
  const inCorpus = new Set(corpus.map((i) => i.id));
  const { rows: all } = loadRecallSet("wsei depth arms");
  const fixed = reattributeMissingAnswers(all, (id) => inCorpus.has(id), (id) => offerable.has(id));
  const pop = partitionByOfferable(fixed.rows, (id) => offerable.has(id));
  // The same population wsDQ and wsDR screened, for the same reason: a founder
  // described out of the WON fund's own text hands the selector the answer in
  // the query, and `cross_regime_summary` is the only provenance
  // `check_recall_leaks` clears at the sibling level.
  const graded = pop.graded.filter((r) =>
    r.split === "tune" && isDescribed(r)
    && r.descriptionSource === "cross_regime_summary" && (r.description ?? "").length >= 320);
  const by = new Map<string, typeof graded[number]>();
  for (const r of [...graded].sort((a, b) => (b.description ?? "").length - (a.description ?? "").length)) {
    const key = `${r.sector}|${r.country}`;
    if (!by.has(key)) by.set(key, r);
  }
  const policy: FounderPolicy = founderPolicyFromEnv();
  return [...by.values()].slice(0, limit).map((t) => {
    const f = founderIntake(t, policy);
    return {
      company: f.company, country: f.country,
      description: f.opts.description ?? "",
      capitalSought: f.opts.capitalSought ?? [],
      eligibility: f.eligibility as unknown as Record<string, unknown>,
      won: t.instrument,
    };
  });
}

async function main() {
  // ── THE ONE PRECONDITION THAT CANNOT BE LEFT TO A COMMENT ───────────────
  // Depth is varied by slicing the input array, which is only equivalent to
  // moving `SELECT_DEPTH` while `SELECT_DEPTH` is slack. At the default 40 the
  // `all` arm would silently be a 40-row arm and the run would report the same
  // menu twice under two names — the precise failure mode this workstream was
  // asked to stop repeating.
  if (Number.isFinite(SELECT_DEPTH)) {
    throw new Error(
      `this harness varies menu depth by slicing the pool it hands the selector, which is ` +
      `only the lever it claims to be while SELECT_DEPTH is slack. It is ${SELECT_DEPTH}, so ` +
      `every arm deeper than that would be capped at ${SELECT_DEPTH} and reported under its ` +
      `own name. Run with AGENT_SELECT_DEPTH=all.`);
  }
  if (AGENT_SELECT_ARM === "off") {
    throw new Error(`AGENT_SELECT is off, so every arm returns the score's order by reference ` +
      `and the sweep would report one number three times. Set AGENT_SELECT=adviser.`);
  }

  await hydrateDbInstruments();
  requireLiveCorpus("wsei_depth_arms");
  resetRankerTally();
  resetAgentSelectTally();
  setAgentSelectTracing(true);

  const limit = Number(process.env.LIMIT ?? 250);
  const cs = cases(limit);
  console.log(`${cs.length} founder(s) x ${ARMS.length} depth arm(s), one pool object each\n`);

  const rows: Row[] = [];
  let spend = 0;

  for (const c of cs) {
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

    // ── ONE POOL OBJECT. Every arm below is a VIEW of this array ───────────
    const pool: InstrumentRow[] = applyProfileSignal(
      accessiblePool(hydrated, c.eligibility as never, log), undefined, undefined);
    const idOf = (r: InstrumentRow) => r.instrumentId ?? r.channel;
    // Gates for EVERY row any arm can show. Hydrating only the head would give
    // the deep arms blank qualification lines on exactly the rows they exist to
    // reach, and the run would measure hydration rather than depth.
    await hydrateGatesFor(pool.map((r) => r.instrumentId).filter((id): id is string => Boolean(id)));

    const rankIn = (ids: string[], won: string) => {
      const i = ids.indexOf(won);
      return i < 0 ? null : i + 1;
    };
    /** Production's own ordering, on whichever pool it is handed. */
    const project = (p: InstrumentRow[]): InstrumentRow[] => {
      const l = new ExclusionLog();
      const ids = p.map((r) => r.instrumentId).filter((id): id is string => Boolean(id));
      return orderMemoCandidates({
        instrumentTable: p,
        req: { ...req, targetMarkets: undefined } as never,
        records: [], dbPeers,
        eligibilityScreen: evaluateEligibility(c.eligibility as never, ids),
        semanticScores: semantic, log: l,
      }).toWriter.map((x) => x.row);
    };

    const arms: Arm[] = [];
    for (const d of ARMS) {
      const input = d === 0 ? pool : pool.slice(0, Math.min(d, pool.length));
      const { result, eur } = await withCostTracking(
        () => import("../lib/intelligence/agentSelect")
          .then((m) => m.agentSelectMemoPool(input, req as never)));
      spend += eur;
      const t = agentSelectLastTrace();
      const out = result.slice(0, VERDICT_POOL);
      const published = project(out);
      arms.push({
        depth: d,
        menu: t?.menu.length ?? input.length,
        picks: t?.picks ?? [],
        deepest: Math.max(-1, ...(t?.picks ?? [])),
        poolIds: out.map(idOf),
        publishedIds: published.slice(0, PUBLISH_CAP).map(idOf),
        wonRank: rankIn(published.map(idOf), c.won),
        wonInPool: out.map(idOf).includes(c.won),
        fellBack: t?.fellBack ?? null,
        eur,
      });
    }

    const wonRankAccessible = rankIn(pool.map(idOf), c.won);
    rows.push({
      company: c.company, country: c.country,
      accessible: pool.length,
      wonRankAccessible,
      wonDescribed: wonRankAccessible == null
        ? null : Boolean(pool[wonRankAccessible - 1].description),
      arms,
    });
    console.log(`  ${c.company.slice(0, 26).padEnd(27)} pool ${String(pool.length).padStart(3)} ` +
      `won@${String(wonRankAccessible ?? "—").padStart(3)} ` +
      `${arms.map((a) => `[${a.depth || "all"}] menu ${a.menu} deepest ${a.deepest} ` +
        `won ${a.wonInPool ? "Y" : "n"}${a.wonRank ? `@${a.wonRank}` : ""}`).join(" · ")} ` +
      `EUR ${arms.reduce((s, a) => s + a.eur, 0).toFixed(4)}`);
  }

  // ── THE NUMBERS ─────────────────────────────────────────────────────────
  const n = rows.length || 1;
  const pct = (k: number, of: number) => `${((100 * k) / (of || 1)).toFixed(1)}%`;
  const arm = (r: Row, i: number) => r.arms[i];
  const mean = (get: (r: Row) => number) => (rows.reduce((a, r) => a + get(r), 0) / n).toFixed(1);
  const exactAt = (i: number, k: number) =>
    rows.filter((r) => { const v = arm(r, i).wonRank; return v != null && v <= k; }).length;

  const L: string[] = [];
  const p = (s = "") => L.push(s);
  const prov = corpusProvenance();
  p(`# wsEI — menu depth, one lever, ${ARMS.length} arms`);
  p();
  p("```");
  p(`corpus=${prov.source} instruments=${prov.instruments} at ${prov.hydratedAt}`);
  p(rankerTallyLine());
  p(agentSelectTallyLine());
  p(`LEVER=menu depth. arm=${AGENT_SELECT_ARM} count=${SELECT_COUNT} effort=${THINK_EFFORT} ` +
    `lookups=${LOOKUP_MAX} pool=${VERDICT_POOL} published_cap=${PUBLISH_CAP}`);
  p(`arms: ${ARMS.map((d) => (d === 0 ? "the whole pool" : d)).join(" / ")} ` +
    `— the ${VERDICT_POOL}-row arm IS the shipped late seam's set`);
  p(`base rate: curve on ${poolRecallN()} held-out founders, ` +
    `P(won in first 6)=${((poolRecallAt(6) ?? 0) * 100).toFixed(1)}%`);
  p(`total EUR ${spend.toFixed(4)} over ${rows.length} founders x ${ARMS.length} arms`);
  p("```");
  p();
  p(`mean accessible pool: **${mean((r) => r.accessible)}** rows · ` +
    `won fund in it at all ${rows.filter((r) => r.wonRankAccessible != null).length}/${n}`);
  p();
  p(`## Each arm`);
  p();
  p(`| menu depth | rows shown | mean deepest reach | won in the ${VERDICT_POOL}-row pool | EXACT@5 | EXACT@6 | EUR/founder |`);
  p(`|---|---:|---:|---:|---:|---:|---:|`);
  ARMS.forEach((d, i) => {
    const inPool = rows.filter((r) => arm(r, i).wonInPool).length;
    p(`| ${d === 0 ? "the whole pool" : d} | ${mean((r) => arm(r, i).menu)} | ` +
      `${mean((r) => arm(r, i).deepest)} | ${inPool}/${n} — ${pct(inPool, n)} | ` +
      `${exactAt(i, 5)}/${n} — ${pct(exactAt(i, 5), n)} | ` +
      `${exactAt(i, 6)}/${n} — ${pct(exactAt(i, 6), n)} | ` +
      `${mean((r) => arm(r, i).eur)} |`);
  });
  p();
  p(`## PAIRED against the control, which is the reading that decides this`);
  p();
  p(`Every arm saw the same founder, so two percentages are the weaker view of ` +
    `one dataset. wsDR published 22.2% against 17.8% on n=45 and the pairing behind ` +
    `it was ONE discordant founder — late-only 1, early-only 0, McNemar p=1.0. ` +
    `Discordance is printed first here so that cannot happen twice.`);
  p();
  p(`| arm vs the ${VERDICT_POOL}-row control | it wins, control loses | control wins, it loses | both | neither |`);
  p(`|---|---:|---:|---:|---:|`);
  ARMS.forEach((d, i) => {
    if (i === 0) return;
    const hit = (r: Row, j: number) => { const v = arm(r, j).wonRank; return v != null && v <= 6; };
    const a = rows.filter((r) => hit(r, i) && !hit(r, 0)).length;
    const b = rows.filter((r) => !hit(r, i) && hit(r, 0)).length;
    const both = rows.filter((r) => hit(r, i) && hit(r, 0)).length;
    p(`| ${d === 0 ? "the whole pool" : d} | ${a} | ${b} | ${both} | ${n - a - b - both} |`);
  });
  p();
  p(`## Legibility, so a null result can be read rather than argued about`);
  p();
  const known = rows.filter((r) => r.wonRankAccessible != null);
  p(`${known.filter((r) => r.wonDescribed).length}/${known.length} won rows carry a ` +
    `\`funds:\` line. wsDV measured 0 of 9 on the founders wsDR's deep arm was handed the ` +
    `answer for; if this figure is still low, this run measures the corpus and not depth.`);
  p();
  p(`## Per founder`);
  p();
  p(`| founder | pool | won @ pool | won row readable | ` +
    `${ARMS.map((d) => `${d === 0 ? "all" : d}: menu/deepest/rank`).join(" | ")} | EUR |`);
  p(`|---|---:|---:|---|${ARMS.map(() => "---").join("|")}|---:|`);
  for (const r of rows) {
    p(`| ${r.company} (${r.country}) | ${r.accessible} | ${r.wonRankAccessible ?? "—"} | ` +
      `${r.wonDescribed == null ? "—" : r.wonDescribed ? "yes" : "**no**"} | ` +
      `${r.arms.map((a) => `${a.menu}/${a.deepest}/${a.wonRank ?? "—"}`).join(" | ")} | ` +
      `${r.arms.reduce((s, a) => s + a.eur, 0).toFixed(4)} |`);
  }
  p();

  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, "arms.md"), L.join("\n"));
  writeFileSync(path.join(OUT, "arms.json"), JSON.stringify(rows, null, 1));
  console.log(`\n${L.join("\n")}`);
  console.log(`wrote ${OUT}/arms.md`);
}

main().catch((e) => { console.error(e); process.exit(1); });
