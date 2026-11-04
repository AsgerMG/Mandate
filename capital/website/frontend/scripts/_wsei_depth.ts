// wsEI — WHAT A DEEPER MENU WOULD COST, AND WHETHER IT WOULD BE READABLE.
//
// ── The question this closes before anybody spends ────────────────────────
// The product owner's architecture says the ranker is handed THE SUBSET. It is
// not: `accessiblePool(...).slice(0, VERDICT_POOL)` hands it eighteen rows out
// of a pool whose median is ninety-one, and the won fund is inside eighteen
// 44.2% of the time against 77.5% inside the whole pool.
//
// wsDR is read as having settled that a deeper menu is worse. It did not, and
// its own recorded run says so: late 10/45 and early 9/45 on EXACT@6 differ on
// ONE FOUNDER — one discordant pair, zero the other way. That is not a negative
// result, it is no result. And the run was made while 51 of 133 menu rows
// carried no sentence saying what the fund pays for (wsDV, wsDW), so the model
// was choosing among rows it could not read.
//
// Before re-running it for money, two things have to be true and neither was
// checked: the deep rows have to be READABLE now, and the deeper prompt has to
// be AFFORDABLE. Both are free to measure. If the rows at rank 19-105 are
// materially less legible than the rows at 1-18, a depth arm would fail for
// wsDR's reason all over again and should not be bought.
//
// ── FREE BY CONSTRUCTION ──────────────────────────────────────────────────
// ANTHROPIC_API_KEY is deleted before anything that could use it is imported,
// exactly as `_wsdr_curve.ts` does it. The prompt is built through the
// EXPORTED, pure `buildPrompt` — production's own, not a reconstruction — and
// then measured rather than sent. The only paid call is the Voyage embedding
// behind `semanticFundMatch`, which is the shipped ranker and prints its own
// `all N request(s) on EMBEDDING` line.
//
//   LIMIT=45 npx tsx scripts/_wsei_depth.ts
//   MODE=holdout npx tsx scripts/_wsei_depth.ts     (the full curve population)
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
// Free by construction, not by intention.
delete process.env.ANTHROPIC_API_KEY;
requireCredentials("wsei_depth", ["DATABASE_URL", "VOYAGE_KEY"]);

import {
  corpusProvenance, findPeersBySubsector, hydrateDbInstruments, isGenericSubsector,
  loadDbInstruments, matchCompany, publishableInstruments, requireLiveCorpus,
  resetGateHydration,
} from "../lib/intelligence/corpus";
import { ExclusionLog } from "../lib/intelligence/exclusions";
import { accessiblePool } from "../lib/intelligence/memoCandidates";
import { assessAll } from "../lib/intelligence/verdict";
import { buildPrompt, intakeAnswerLines, unansweredRankingFields } from "../lib/intelligence/agentSelect";
import { rankerTallyLine, resetRankerTally, semanticFundMatch } from "../lib/intelligence/semantic";
import {
  applyProfileSignal, buildInstrumentTableHydrated, founderCountryList,
  tableInputFromAnswers,
} from "../lib/intelligence/shortlist";
import { SELECT_COUNT } from "../lib/intelligence/agentSelect";
import type { InstrumentRow } from "../lib/intelligence/types";
import { founderIntake, founderPolicyFromEnv, type FounderPolicy } from "./founderIntake";
import { isDescribed, loadRecallSet, partitionByOfferable, reattributeMissingAnswers } from "./recallSet";

/** The depths a menu could be. 18 is what ships, 40 is what wsDR's early arm
 *  actually showed, and `all` is what its own header claimed it showed. */
const DEPTHS = [6, 18, 40, 0] as const; // 0 reads as "the whole accessible pool"
const OUT = path.join(process.cwd(), "..", "..", "project-mgmt", "findings", "depth_wsEI");

/** Anthropic bills input by token and this script may not call Anthropic to
 *  count them, so characters are what it reports and the ratio is stated rather
 *  than assumed. ~3.6 chars/token is what wsDR's own recorded spend implies for
 *  these prompts; every euro figure downstream is derived from that run's
 *  measured cost-per-menu-row, not from this constant. */
const CHARS_PER_TOKEN = 3.6;

interface PerFounder {
  company: string;
  country: string;
  pool: number;
  wonRank: number | null;
  /** Rows carrying a readable `funds:` line, cumulative at each depth. */
  describedAt: Record<string, { rows: number; described: number }>;
  /** The prompt production would build at each depth, in characters. */
  promptChars: Record<string, number>;
  /** Does the won fund's own row say what it funds? The wsDV question. */
  wonDescribed: boolean | null;
}

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("wsei_depth");
  const corpus = loadDbInstruments();
  const offerable = new Set(publishableInstruments().map((i) => i.id));
  const inCorpus = new Set(corpus.map((i) => i.id));

  const { rows: all } = loadRecallSet("wsei depth");
  const fixed = reattributeMissingAnswers(all, (id) => inCorpus.has(id), (id) => offerable.has(id));
  const pop = partitionByOfferable(fixed.rows, (id) => offerable.has(id));
  let graded = pop.graded.filter((r) => r.split === "holdout" && isDescribed(r));
  const seen = new Set<string>();
  graded = [...graded].sort((a, b) => a.name.localeCompare(b.name))
    .filter((r) => (seen.has(r.name) ? false : (seen.add(r.name), true)));
  const limit = Number(process.env.LIMIT ?? 45);
  if (limit > 0) graded = graded.slice(0, limit);
  console.log(`measuring menu depth on ${graded.length} held-out described founders`);

  const policy: FounderPolicy = founderPolicyFromEnv();
  resetRankerTally();
  const out: PerFounder[] = [];

  for (const t of graded) {
    resetGateHydration();
    const f = founderIntake(t, policy);
    const selfRecord = matchCompany(f.company, f.country);
    const targetSub =
      selfRecord.matched && !isGenericSubsector(selfRecord.subsector) ? selfRecord.subsector : "";
    const dbPeers = targetSub
      ? findPeersBySubsector(targetSub, { country: f.country, limit: 4, exclude: [f.company] })
      : [];
    const semantic = await semanticFundMatch(f.opts.description ?? "");
    const log = new ExclusionLog();
    const hydrated = await buildInstrumentTableHydrated({
      fieldChannels: new Set<string>(dbPeers.flatMap((r) => r.channels)),
      founderCountries: founderCountryList(
        f.country, f.eligibility.entityCountries),
      capitalSought: f.opts.capitalSought,
      description: f.opts.description,
      semantic,
      ...tableInputFromAnswers(f.eligibility),
      log,
    } as never);
    // The same pool object every seam position cuts out of. NO SLICE.
    const pool: InstrumentRow[] = applyProfileSignal(
      accessiblePool(hydrated, f.eligibility as never, log), undefined, undefined);
    const i = pool.map((r) => r.instrumentId).indexOf(t.instrument);
    const wonRank = i < 0 ? null : i + 1;

    const ids = pool.map((r) => r.instrumentId).filter((id): id is string => Boolean(id));
    const ctx = {
      country: f.country,
      sector: f.eligibility?.sector ?? undefined,
      description: f.opts.description,
      answers: intakeAnswerLines(f.eligibility as never),
      unanswered: unansweredRankingFields(f.eligibility as never),
      assessments: assessAll(ids, f.eligibility as never),
    };

    const describedAt: PerFounder["describedAt"] = {};
    const promptChars: PerFounder["promptChars"] = {};
    for (const d of DEPTHS) {
      const k = d === 0 ? pool.length : Math.min(d, pool.length);
      const head = pool.slice(0, k);
      describedAt[String(d)] = {
        rows: head.length,
        described: head.filter((r) => Boolean(r.description)).length,
      };
      // Production's own prompt builder, with production's own arguments. A
      // reconstruction here would price a different prompt, which is the exact
      // defect `dry` was written to avoid.
      promptChars[String(d)] = buildPrompt(head, ctx as never, 0, SELECT_COUNT).length;
    }

    out.push({
      company: f.company,
      country: f.country,
      pool: pool.length,
      wonRank,
      describedAt,
      promptChars,
      wonDescribed: wonRank == null ? null : Boolean(pool[wonRank - 1].description),
    });
    if (out.length % 10 === 0) console.log(`  ${out.length}/${graded.length}`);
  }

  const prov = corpusProvenance();
  const n = out.length;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)] : 0;
  };

  const lines: string[] = [];
  lines.push(`# wsEI — the depth question, measured for nothing\n`);
  lines.push("```");
  lines.push(`corpus=${prov.source} instruments=${prov.instruments} at ${prov.hydratedAt}`);
  lines.push(rankerTallyLine());
  lines.push(`n=${n} held-out described founders, ANTHROPIC_API_KEY deleted before import`);
  lines.push("```\n");
  if (limit > 0) {
    lines.push(`> **LIMIT=${limit}, so this is the alphabetical HEAD of the holdout split and its `
      + `pool-recall levels are a sample's, not the population's.** The population figure is the `
      + `committed \`poolRecallCurve.generated.json\`, measured on all 846: 44.2% at 18 rows, `
      + `63.8% at 40, 77.5% at any depth, mean pool 77.1. The columns this run exists for — `
      + `LEGIBILITY and PROMPT SIZE — are per-row over thousands of rows and are not sensitive `
      + `to which founders were drawn. Run with LIMIT=0 for the whole split.\n`);
  }

  lines.push(`## The pool the seam cuts out of\n`);
  const pools = out.map((r) => r.pool);
  lines.push(`mean **${mean(pools).toFixed(1)}** rows · median **${median(pools)}** · `
    + `min ${Math.min(...pools)} · max ${Math.max(...pools)}\n`);
  const inPool = out.filter((r) => r.wonRank != null).length;
  lines.push(`the won fund is in that pool at all on ${inPool}/${n} `
    + `(${((100 * inPool) / n).toFixed(1)}%)\n`);

  lines.push(`## Recall, legibility and prompt size at each depth\n`);
  lines.push(`| menu | mean rows shown | won fund inside | rows with a \`funds:\` line | prompt chars | ~tokens |`);
  lines.push(`|---|---:|---:|---:|---:|---:|`);
  for (const d of DEPTHS) {
    const key = String(d);
    const rows = out.map((r) => r.describedAt[key].rows);
    const desc = out.reduce((a, r) => a + r.describedAt[key].described, 0);
    const tot = out.reduce((a, r) => a + r.describedAt[key].rows, 0);
    const hit = out.filter((r) => r.wonRank != null
      && r.wonRank <= (d === 0 ? r.pool : d)).length;
    const chars = mean(out.map((r) => r.promptChars[key]));
    lines.push(`| ${d === 0 ? "the whole pool" : d} | ${mean(rows).toFixed(1)} | `
      + `${hit}/${n} — ${((100 * hit) / n).toFixed(1)}% | `
      + `${((100 * desc) / (tot || 1)).toFixed(1)}% | ${chars.toFixed(0)} | `
      + `${(chars / CHARS_PER_TOKEN).toFixed(0)} |`);
  }
  lines.push("");

  lines.push(`## Legibility BY BAND — the wsDR-invalidating question\n`);
  lines.push(`wsDR's early arm was measured while 51 of 133 rows on the audited menus said `
    + `nothing about what the fund pays for. If the rows a deeper menu ADDS are still less `
    + `readable than the rows already shown, a depth arm buys unreadable rows and fails for `
    + `wsDW's reason rather than for depth's.\n`);
  lines.push(`| band | rows | with a \`funds:\` line |`);
  lines.push(`|---|---:|---:|`);
  const bands: [string, number, number][] = [
    ["1-6", 1, 6], ["7-18", 7, 18], ["19-40", 19, 40], ["41+", 41, Infinity],
  ];
  // Recomputed from the cumulative counts, which is exact: band(a,b) is the
  // cumulative count at b minus the cumulative count at a-1.
  const cum = (r: PerFounder, k: number) => {
    // Cumulative described counts exist only at the measured depths, so bands
    // are read off those boundaries and nothing is interpolated.
    const key = k === 6 ? "6" : k === 18 ? "18" : k === 40 ? "40" : "0";
    return r.describedAt[key];
  };
  for (const [label, lo] of bands) {
    const prevKey = lo === 1 ? null : lo === 7 ? 6 : lo === 19 ? 18 : 40;
    const hiKey = lo === 1 ? 6 : lo === 7 ? 18 : lo === 19 ? 40 : Infinity;
    let rows = 0; let desc = 0;
    for (const r of out) {
      const hi = cum(r, hiKey === Infinity ? Infinity : hiKey);
      const prev = prevKey == null ? { rows: 0, described: 0 } : cum(r, prevKey);
      rows += hi.rows - prev.rows;
      desc += hi.described - prev.described;
    }
    lines.push(`| ${label} | ${rows} | ${rows ? ((100 * desc) / rows).toFixed(1) : "—"}% |`);
  }
  lines.push("");

  const wonKnown = out.filter((r) => r.wonRank != null);
  const wonDesc = wonKnown.filter((r) => r.wonDescribed).length;
  lines.push(`## The won fund's own row\n`);
  lines.push(`${wonDesc}/${wonKnown.length} won rows now carry a \`funds:\` line. `
    + `wsDV measured 0 of 9 on the nine founders whose answer the early seam was handed; `
    + `wsDW repaired the splitter. This is that number on the whole population.\n`);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, "depth.json"), `${JSON.stringify(out, null, 1)}\n`);
  writeFileSync(path.join(OUT, "depth.md"), `${lines.join("\n")}\n`);
  console.log(`\n${lines.join("\n")}`);
  console.log(`wrote ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
