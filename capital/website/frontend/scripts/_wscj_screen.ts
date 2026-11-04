// wsCJ, part 2 — the OTHER thing an address could do, bounded before it is built.
//
// Part 1 (`_wscj_territory.ts`) killed the door lookup: only 7.0% of
// instruments are territorial siblings and a PERFECT address→door oracle is
// worth +0.4 points. But "derive it from the address" has a second, different
// mechanism that the door analysis does not cover, and it would be dishonest to
// report the first without bounding the second:
//
//   A DOOR LOOKUP picks one of several bodies delivering ONE notified scheme.
//   A CATCHMENT SCREEN removes a SEPARATELY NOTIFIED scheme whose own
//   notification declares a region of application the founder is not in.
//
// The second is the one Rule Zero actually supports: `catchment_regions` with
// `catchment_source = ec_case_register` is the EC State aid case register's own
// declared region, not an inference from our award history. 16.9% of tune
// misses sit on a leaf that is the sole door of its notified scheme, which is
// exactly the population a screen acts on.
//
// ── THE GUARD, and why it comes before the measurement ────────────────────
// A screen is a REMOVAL, and a wrongly-derived removal is worse than no
// derivation: an org-type encoding measured on 2026-08-09 would have blocked 43
// named companies from schemes they had actually received. So this file
// computes, FIRST and over the whole answer key rather than a sample, the thing
// that decides whether the screen may exist at all:
//
//   BLOCKED WINNERS. A pair (company, leaf) in the answer key where the
//   register says the company received that leaf, the company's region is known
//   from a DIFFERENT scheme's award (so the region is not read off the answer),
//   and the leaf's official catchment does NOT contain that region.
//
//   Every such pair is a founder the screen would tell "this is not your
//   programme" about a programme they demonstrably won. The count is reported
//   with the companies NAMED, because a rate hides which ones.
//
// ── FREE ───────────────────────────────────────────────────────────────────
// One Postgres read plus an existing wsCI pool dump. No model calls, no embeds.
//
//   DUMP=/tmp/wscj/tune.json SPLIT=tune N=250 npx tsx scripts/_wscj_screen.ts
import { readFileSync } from "fs";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("_wscj_screen", ["DATABASE_URL"]);

import { Client } from "pg";

import {
  hydrateDbInstruments, loadDbInstruments, publishableInstruments, requireLiveCorpus,
} from "../lib/intelligence/corpus";
import { regionsOverlap } from "../lib/intelligence/regions.generated";
import { DEFAULT_SEED, sampleRecall } from "./recallSample";
import {
  assertAncestorConvention, assertGradablePopulation, isDescribed, loadRecallSet,
  partitionByOfferable, reattributeMissingAnswers, type RecallRow,
} from "./recallSet";

interface Pair { want: string; hit: boolean; pool?: [string, string, string][] }

/** The founder's region, taken ONLY where it was recovered from a different
 *  scheme's award. `own_award` region is read off the very award that is the
 *  answer, so using it to judge whether the answer is admissible is circular —
 *  the screen would be graded on a region the answer supplied. */
const leakFreeRegion = (r: RecallRow): string | undefined =>
  (r as { regionSource?: string }).regionSource === "other_scheme"
    ? ((r as { region?: string }).region || undefined) : undefined;

/** Does an officially declared catchment admit a founder in `region`?
 *
 *  UNKNOWN, not false, when no catchment is declared: a screen that removed
 *  every instrument the case register is silent about would remove 61% of the
 *  corpus on no evidence at all. Returns undefined for "the official source
 *  does not say", and callers must keep those. */
function admits(catchment: string[] | null, region: string): boolean | undefined {
  if (!catchment || !catchment.length) return undefined;
  return catchment.some((c) => regionsOverlap(c, region));
}

function pct(n: number, d: number) { return d ? `${((100 * n) / d).toFixed(1)}%` : "n/a"; }

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("_wscj_screen");
  const corpus = loadDbInstruments();
  const offerable = new Set(publishableInstruments().map((i) => i.id));

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const { rows } = await db.query<{
    id: string; catchment_regions: string | null; catchment_source: string | null;
  }>(`SELECT id, catchment_regions, catchment_source FROM funding_instruments`);
  await db.end();
  const catchment = new Map<string, string[] | null>();
  let official = 0, narrower = 0;
  for (const r of rows) {
    // OFFICIAL ONLY. A catchment from any other source is evidence about where
    // money has landed, not a statement about who may apply, and must never
    // remove a row.
    const isOfficial = (r.catchment_source ?? "").startsWith("ec_case_register");
    const list = isOfficial && r.catchment_regions ? JSON.parse(r.catchment_regions) as string[] : null;
    catchment.set(r.id, list);
    if (list) { official++; if (list.some((x) => x.length > 2)) narrower++; }
  }
  console.log("=".repeat(78));
  console.log("0  WHAT THE OFFICIAL SOURCE ACTUALLY DECLARES");
  console.log("=".repeat(78));
  console.log(`  instruments                                        ${rows.length}`);
  console.log(`  with an EC case register catchment                 ${official}  ${pct(official, rows.length)}`);
  console.log(`  ...of which narrower than the whole country        ${narrower}  ${pct(narrower, rows.length)}`);
  console.log(`  the rest are country-wide or silent, and a screen cannot act on either.`);

  const { file: setFile, rows: all } = loadRecallSet();
  assertAncestorConvention(corpus);
  const inCorpus = new Set(corpus.map((i) => i.id));
  const fixed = reattributeMissingAnswers(all, (id) => inCorpus.has(id), (id) => offerable.has(id));
  const popn = partitionByOfferable(fixed.rows, (id) => offerable.has(id));
  assertGradablePopulation(popn, (id) => inCorpus.has(id), fixed.reattributed.length, setFile);

  console.log("\n" + "=".repeat(78));
  console.log("1  THE GUARD — would the screen block a company from a fund it WON?");
  console.log("=".repeat(78));
  let tested = 0, blocked = 0, unknown = 0;
  const names: string[] = [];
  for (const r of popn.graded) {
    const region = leakFreeRegion(r);
    if (!region) continue;
    const verdict = admits(catchment.get(r.instrument) ?? null, region);
    if (verdict === undefined) { unknown++; continue; }
    tested++;
    if (!verdict) {
      blocked++;
      if (names.length < 25) names.push(`${r.name} (${r.country}, ${region}) -> ${r.instrument}`);
    }
  }
  console.log(`  pairs with a leak-free region AND an official catchment  ${tested}`);
  console.log(`  pairs the register is silent about (kept, never removed) ${unknown}`);
  console.log(`  VERIFIED WINNERS THE SCREEN WOULD BLOCK                  ${blocked}  ${pct(blocked, tested)}`);
  for (const n of names) console.log(`      ${n}`);
  if (blocked === 0 && tested === 0) {
    throw new Error("_wscj_screen: guard tested nothing — a green light on an empty population is not a green light");
  }

  console.log("\n" + "=".repeat(78));
  console.log("2  THE ORACLE — what the screen is worth even if it were sound");
  console.log("=".repeat(78));
  const dumpPath = process.env.DUMP;
  if (!dumpPath) { console.log("  (set DUMP= to compute)"); return; }
  const pairs: Pair[] = JSON.parse(readFileSync(dumpPath, "utf8"));
  const split = process.env.SPLIT ?? "tune";
  const set = popn.graded.filter((r) => (split === "all" || r.split === split)
    && (!process.env.MODE || r.mode === process.env.MODE)
    && (!process.env.DESCRIBED || isDescribed(r)));
  const sample = sampleRecall(set, Math.min(Number(process.env.N ?? 250), set.length),
    Number(process.env.SEED ?? DEFAULT_SEED));

  // The join is ASSERTED, not assumed. Two harnesses drawing "the same" sample
  // from two code paths is exactly how a result gets attributed to the wrong
  // rows, and the assertion costs nothing.
  if (sample.length !== pairs.length) {
    throw new Error(`_wscj_screen: dump has ${pairs.length} pairs, sample has ${sample.length}`);
  }
  for (let i = 0; i < sample.length; i++) {
    if (sample[i].instrument !== pairs[i].want) {
      throw new Error(`_wscj_screen: dump row ${i} is ${pairs[i].want}, sample row ${i} is `
        + `${sample[i].instrument} — the two are not the same draw`);
    }
  }
  console.log(`  join asserted: ${sample.length} dump rows match the sample row for row`);

  let withRegion = 0, base = 0, screened = 0, wouldBlockWinner = 0;
  for (let i = 0; i < sample.length; i++) {
    const p = pairs[i];
    const region = leakFreeRegion(sample[i]);
    const pool = (p.pool ?? []).map((x) => x[0]);
    if (pool.slice(0, 5).includes(p.want)) base++;
    if (!region) { if (pool.slice(0, 5).includes(p.want)) screened++; continue; }
    withRegion++;
    const kept = pool.filter((id) => admits(catchment.get(id) ?? null, region) !== false);
    if (!kept.includes(p.want)) wouldBlockWinner++;
    if (kept.slice(0, 5).includes(p.want)) screened++;
  }
  console.log(`  pairs in the draw with a leak-free region  ${withRegion}/${sample.length}`);
  console.log(`  base EXACT@5                              ${base}/${sample.length} = ${pct(base, sample.length)}`);
  console.log(`  with the official catchment screen        ${screened}/${sample.length} = ${pct(screened, sample.length)}`
    + `   delta ${(((screened - base) / sample.length) * 100).toFixed(1)}`);
  console.log(`  draws where the screen removed the WON leaf ${wouldBlockWinner}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
