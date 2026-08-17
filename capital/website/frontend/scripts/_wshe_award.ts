// wsHE — IS THE AWARD BAND WORKING BACKWARDS?
//
// wsHA measured that inside the 287 sibling-miss pairs the `award` scorer
// favours the door we SHOWED over the door the founder WON, 33.1% to 5.6%. That
// is a property of the pairs. It does not say WHY, and two readings of it imply
// opposite fixes:
//
//   (A) THE SIGNAL IS WRONG. A founder's stated band is what they want to
//       RAISE; `awardP50` is what a scheme has historically PAID. Matching the
//       two is a category error and the term should go.
//
//   (B) THE SIGNAL IS FINE AND THE TARGET IS ODD. Companies often win a
//       SMALLER, EARLIER cheque than the round they name — a first ticket. Then
//       band matching is right and we are matching the wrong side of the
//       distribution: the median rather than the lower quartile.
//
// The two are TELLABLE APART, and this script tells them apart. The
// discriminating quantity is the SIGN of log10(awardP50 / bandMid):
//
//   under (A) the won door is no closer to the ask than the shown door on
//   either side — the ask carries no information about which door, and the
//   33.1/5.6 is then just the shown door being the one nearer the ask BECAUSE
//   THE SCORER PUT IT THERE, which is a tautology, not a finding.
//
//   under (B) the won door sits SYSTEMATICALLY BELOW the ask and the shown door
//   sits nearer it — a directional bias, not a symmetric one — and moving the
//   target from awardP50 to awardP25, or from the band midpoint to the band
//   floor, would recover it.
//
// It also asks the wsGX question before any arm is proposed: HOW MANY DISTINCT
// VALUES does `awardScorer` take inside a real pool? `AWARD_MATCH / (1 +
// max(0, decades - 1))` is exactly 1.35 for EVERY fund within one order of
// magnitude of the ask, so a term that looks continuous can be two-valued in
// practice — and a two-valued term on a bit the screen already used is a dead
// arm (`A_POPULATION_PRIOR_IS_NOT_A_ROW_SIGNAL`).
//
// FREE. Reads the wsHA door dump plus Postgres. ANTHROPIC_API_KEY is deleted
// before import; no Voyage call, no model call.
//
//   IN=/tmp/wsha_doors.json npx tsx scripts/_wshe_award.ts
//
// @ws-active until 2026-09-30
import { readFileSync } from "fs";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
delete process.env.ANTHROPIC_API_KEY;
if (requireCredentials("wshe_award", ["DATABASE_URL"]) === "offline") {
  throw new Error(
    "_wshe_award: NO_PG is set, which deletes DATABASE_URL and serves the "
    + "committed snapshot. The snapshot's award columns are a different vintage "
    + "from the store the product ranks on, and the whole question here is what "
    + "the SHIPPED award medians do.");
}

import {
  corpusProvenance, type DbInstrument, hydrateDbInstruments, loadDbInstruments,
  publishableInstruments, requireLiveCorpus,
} from "../lib/intelligence/corpus";
import { instrumentServesCountry } from "../lib/intelligence/capitalPreference";
import { awardScorer, bandMidEur } from "../lib/intelligence/shortlist";
import type { DoorRow, InstrumentSnapshot } from "./_wsha_doors";
import { founderIntake, founderPolicyFromEnv } from "./founderIntake";
import { loadRecallSet, reattributeMissingAnswers, type RecallRow } from "./recallSet";

interface Dump {
  meta: Record<string, unknown> & { fingerprint: string; n: number };
  rows: DoorRow[];
  snapshot: InstrumentSnapshot[];
}

const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : "—");
const q = (xs: number[], f: number) =>
  xs.length ? xs[Math.min(xs.length - 1, Math.floor(f * xs.length))] : NaN;
const fmt = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : "—");

/** The scorer's own eligibility test for an award median, restated once so the
 *  two places below that need it cannot drift from each other. */
const USABLE = (i: DbInstrument) =>
  i.awardP50 != null && i.awardP50 > 0 && (i.awardN ?? 0) >= 5;

function main() {
  const src = process.env.IN ?? "/tmp/wsha_doors.json";
  const dump = JSON.parse(readFileSync(src, "utf8")) as Dump;

  const { rows: all } = loadRecallSet("wsHE award direction");
  const corpus = loadDbInstruments();
  const inCorpus = new Set(corpus.map((i) => i.id));
  const fixed = reattributeMissingAnswers(all, (id) => inCorpus.has(id), () => true);
  const byKey = new Map<string, RecallRow>();
  for (const r of fixed.rows) byKey.set(`${r.name}::${r.instrument}`, r);
  const inst = new Map(corpus.map((i) => [i.id, i]));

  const policy = founderPolicyFromEnv();
  const pairs = dump.rows.filter(
    (r) => r.offerable && r.rankAccessible !== null && !r.hit && r.siblingsShown.length > 0);

  console.log("# wsHE — is the award band working backwards\n");
  console.log("```");
  console.log(`draw fingerprint    ${dump.meta.fingerprint}`);
  console.log(`corpus              ${corpusProvenance().source} instruments=${corpus.length}`);
  console.log(`pairs               ${pairs.length}`);
  console.log("```\n");

  // ── §1 SIGNED DECADES: the quantity that decides the fork ────────────────
  // d = log10(awardP50 / bandMid). NEGATIVE means the door pays LESS than the
  // founder asked for; positive means it pays more. wsHA's 33.1/5.6 is about
  // |d|; the fork is about sign.
  const dWon: number[] = [], dShown: number[] = [];
  const bandCount = new Map<string, number>();
  let bothUsable = 0, wonOnly = 0, shownOnly = 0, neither = 0;
  let wonBelow = 0, shownBelow = 0, wonCloser = 0, shownCloser = 0, tie = 0;
  let wonSmaller = 0;
  // Would the LOWER QUARTILE have been the better target? Answered directly:
  // reading each door's own p25 instead of its p50 against the same ask.
  let p25WonCloser = 0, p25ShownCloser = 0, p25Both = 0;
  // And the other side of (B): is the WON door's own p25 near the ask while its
  // p50 is above it — i.e. the founder took the small end of a big scheme.
  const skipped: string[] = [];

  for (const p of pairs) {
    const rec = byKey.get(`${p.company}::${p.won}`);
    const won = inst.get(p.won);
    const sib = inst.get(p.siblingsShown[0]);
    if (!rec || !won || !sib) { skipped.push(p.company); continue; }
    const f = founderIntake(rec, policy);
    const band = f.eligibility.ticketBand;
    bandCount.set(band ?? "(none)", (bandCount.get(band ?? "(none)") ?? 0) + 1);
    const want = bandMidEur(band);
    if (!want) { skipped.push(p.company); continue; }

    const uw = USABLE(won), us = USABLE(sib);
    if (uw && us) bothUsable++; else if (uw) wonOnly++; else if (us) shownOnly++; else neither++;
    if (!uw || !us) continue;

    const dw = Math.log10(won.awardP50! / want);
    const ds = Math.log10(sib.awardP50! / want);
    dWon.push(dw); dShown.push(ds);
    if (dw < 0) wonBelow++;
    if (ds < 0) shownBelow++;
    if (won.awardP50! < sib.awardP50!) wonSmaller++;
    if (Math.abs(dw) < Math.abs(ds)) wonCloser++;
    else if (Math.abs(ds) < Math.abs(dw)) shownCloser++;
    else tie++;

    if (won.awardP25 != null && won.awardP25 > 0 && sib.awardP25 != null && sib.awardP25 > 0) {
      p25Both++;
      const pw = Math.abs(Math.log10(won.awardP25 / want));
      const ps = Math.abs(Math.log10(sib.awardP25 / want));
      if (pw < ps) p25WonCloser++; else if (ps < pw) p25ShownCloser++;
    }
  }

  const s = (xs: number[]) => [...xs].sort((a, b) => a - b);
  const sw = s(dWon), ss = s(dShown);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

  console.log("## 1. Where each door sits RELATIVE TO THE ASK\n");
  console.log("`d = log10(awardP50 / bandMid)`. Negative = the door pays LESS than the founder asked.\n");
  console.log("```");
  console.log(`both doors carry a usable award median           ${bothUsable}`);
  console.log(`  ...won only / shown only / neither             ${wonOnly} / ${shownOnly} / ${neither}`);
  console.log(`d(WON)    mean ${fmt(mean(dWon))}  p10 ${fmt(q(sw, 0.1))}  p25 ${fmt(q(sw, 0.25))}  MEDIAN ${fmt(q(sw, 0.5))}  p75 ${fmt(q(sw, 0.75))}  p90 ${fmt(q(sw, 0.9))}`);
  console.log(`d(SHOWN)  mean ${fmt(mean(dShown))}  p10 ${fmt(q(ss, 0.1))}  p25 ${fmt(q(ss, 0.25))}  MEDIAN ${fmt(q(ss, 0.5))}  p75 ${fmt(q(ss, 0.75))}  p90 ${fmt(q(ss, 0.9))}`);
  console.log("");
  console.log(`WON door pays BELOW the ask                      ${wonBelow}  ${pct(wonBelow, dWon.length)}`);
  console.log(`SHOWN door pays BELOW the ask                    ${shownBelow}  ${pct(shownBelow, dShown.length)}`);
  console.log(`WON door is the SMALLER of the two               ${wonSmaller}  ${pct(wonSmaller, dWon.length)}`);
  console.log("");
  console.log(`|d| smaller for WON (the ask points at it)       ${wonCloser}  ${pct(wonCloser, dWon.length)}`);
  console.log(`|d| smaller for SHOWN (the ask points away)      ${shownCloser}  ${pct(shownCloser, dShown.length)}`);
  console.log(`exact tie                                        ${tie}  ${pct(tie, dWon.length)}`);
  console.log("");
  console.log(`on the LOWER QUARTILE instead (awardP25 vs ask), n=${p25Both}`);
  console.log(`  closer for WON                                 ${p25WonCloser}  ${pct(p25WonCloser, p25Both)}`);
  console.log(`  closer for SHOWN                               ${p25ShownCloser}  ${pct(p25ShownCloser, p25Both)}`);
  console.log("```\n");

  console.log("| founder's derived ticketBand | pairs |");
  console.log("|---|--:|");
  for (const [k, v] of [...bandCount.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`| \`${k}\` | ${v} |`);
  }
  console.log("");

  // ── §2 THE wsGX QUESTION: how coarse is this term inside a real pool ─────
  // `AWARD_MATCH / (1 + max(0, decades - 1))` is exactly AWARD_MATCH for every
  // fund within one decade of the ask, so the term can be two-valued in
  // practice even though its input is continuous. Measured over the ACCESSIBLE
  // POOL the dump recorded for each founder, which is the population the row
  // sort actually orders.
  //
  // The dump does not carry the pool's MEMBERS (only its length), and
  // rebuilding the real one costs a Voyage embedding per founder. The stand-in
  // is every publishable leaf this founder's country can reach — the population
  // `selectInstrumentRows` screens down from, before theme. It is WIDER than
  // the served pool, which biases §2 towards MORE distinct values, so a coarse
  // reading here is a floor on how coarse the served term is.
  const distinct: number[] = [], atCeiling: number[] = [], neutralShare: number[] = [];
  const leaves = publishableInstruments().filter((i) => !i.isFramework);
  const poolFor = (country: string) =>
    leaves.filter((i) => i.country && instrumentServesCountry(i.country, [country]));
  const poolCache = new Map<string, DbInstrument[]>();
  const reachable = (country: string) => {
    let p = poolCache.get(country);
    if (!p) { p = poolFor(country); poolCache.set(country, p); }
    return p;
  };
  for (const p of pairs) {
    const rec = byKey.get(`${p.company}::${p.won}`);
    if (!rec) continue;
    const pool = reachable(p.country);
    if (pool.length < 2) continue;
    const f = founderIntake(rec, policy);
    const sc = awardScorer(pool, f.eligibility.ticketBand);
    const vals = pool.map((i) => Math.round(sc(i) * 1e6) / 1e6);
    distinct.push(new Set(vals).size);
    atCeiling.push(vals.filter((v) => Math.abs(v - 1.35) < 1e-6).length / vals.length);
    neutralShare.push(vals.filter((v) => Math.abs(v - 1) < 1e-6).length / vals.length);
  }
  const sd = s(distinct), sa = s(atCeiling), sn = s(neutralShare);
  console.log("## 2. How many values does `awardScorer` take inside a real pool\n");
  console.log("```");
  console.log(`pools measured                                   ${distinct.length}`);
  console.log(`DISTINCT values per pool   min ${q(sd, 0)}  p25 ${q(sd, 0.25)}  MEDIAN ${q(sd, 0.5)}  p75 ${q(sd, 0.75)}  max ${sd[sd.length - 1]}`);
  console.log(`share at the 1.35 CEILING  p25 ${fmt(q(sa, 0.25))}  MEDIAN ${fmt(q(sa, 0.5))}  p75 ${fmt(q(sa, 0.75))}`);
  console.log(`share at NEUTRAL 1.0       p25 ${fmt(q(sn, 0.25))}  MEDIAN ${fmt(q(sn, 0.5))}  p75 ${fmt(q(sn, 0.75))}`);
  console.log("```\n");

  // ── §3 THE SAME QUESTION AT POOL LEVEL, not inside the sibling cell ──────
  // wsGY measured `awardP50` at +0.047 over the WHOLE pool and concluded the
  // score is indifferent. If the won door's percentile in its own pool is flat
  // while the sibling-cell effect is 33.1/5.6, the defect is a SIBLING-CELL
  // defect and a whole-pool re-weighting cannot reach it. Stated here so the
  // two claims are on one page.
  const wonPctile: number[] = [];
  for (const p of pairs) {
    const won = inst.get(p.won);
    if (!won || !USABLE(won)) continue;
    const pool = reachable(p.country).filter(USABLE);
    if (pool.length < 5) continue;
    const below = pool.filter((i) => i.awardP50! < won.awardP50!).length;
    wonPctile.push(below / pool.length);
  }
  const sp = s(wonPctile);
  console.log("## 3. The won door's award-median percentile in its OWN accessible pool\n");
  console.log("```");
  console.log(`founders                                         ${wonPctile.length}`);
  console.log(`percentile  p10 ${fmt(q(sp, 0.1))}  p25 ${fmt(q(sp, 0.25))}  MEDIAN ${fmt(q(sp, 0.5))}  p75 ${fmt(q(sp, 0.75))}  p90 ${fmt(q(sp, 0.9))}`);
  console.log(`(0.5 = the won door is a median-sized payer among what we could show)`);
  console.log("```\n");

  if (skipped.length) {
    console.log(`(${skipped.length} pair(s) skipped — no recall row, instrument or band: `
      + `${skipped.slice(0, 5).join(", ")})`);
  }
}

async function boot() {
  await hydrateDbInstruments();
  requireLiveCorpus("_wshe_award");
  main();
}

boot().catch((e) => { console.error(e); process.exit(1); });
