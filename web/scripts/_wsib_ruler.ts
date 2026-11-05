// wsIB — THE RULER, GRADED AGAINST THE ONE ROW ON EVERY MENU WE KNOW IS RIGHT.
//
// @ws-active until 2026-09-30
//
// Everything this repo has published about "picks that fail the prompt's own
// two disqualifiers" comes from one pair of tests. This runs BOTH the retired
// pair and the calibrated one, over the same tapes and the same menus, and puts
// their false-disqualification rates side by side. One implementation of each,
// imported from `_ruler.ts`, so the before and the after cannot be two
// different rulers wearing one name.
//
//   npx tsx scripts/_wsib_ruler.ts [tape.jsonl ...]
//   npx tsx scripts/_wsib_ruler.ts --slots [dir]     the eighteen-row prompts
//
// ── THE CALIBRATION TARGET, AND WHY IT IS LEGITIMATE ─────────────────────
// The tape records `won`: the fund the company actually won, and `poolRank
// Control`, its 1-based place in the shipped order. So the won fund's row on
// the menu is recoverable EXACTLY, without a title join and without a model.
// That is a labelled set of 78 rows per tape whose correctness is not in
// question, and a ruler that throws them out is broken however good its numbers
// look elsewhere.
//
// This reads the answer off a TAPE in project-mgmt/findings, which is a
// measurement artefact. Nothing here is imported by `lib/intelligence/
// pipeline.ts` or by anything it reaches, so `check_answer_not_reachable.ts` is
// untouched: the product still cannot see what this script grades against.
//
// ── OFFLINE ──────────────────────────────────────────────────────────────
// Pinned for `_wsho_harvest.ts`'s reason: every module below reads DATABASE_URL
// and VOYAGE_KEY lazily, so destroying them here is what makes "no DB, no key"
// true rather than merely stated.
import { readFileSync, existsSync, readdirSync } from "fs";
import path from "path";

delete process.env.DATABASE_URL;
delete process.env.VOYAGE_KEY;

import { SECTOR_WORD } from "../lib/intelligence/shortlist";
import { SELECT_COUNT } from "../lib/intelligence/agentSelect";
import { COMPANIES } from "../lib/intelligence/__benchCompanies";
import {
  awardMedian, awardMismatch, categoryError, menuRows, neighbourhood,
  resolveTitle, snapshot, themeMismatch, titleIndex, type Neighbourhood,
} from "./_ruler";

interface Turn { round: number; prompt: string; reply: string; thinking: string }
interface TapeRow {
  company: string; country: string; stratum: string; sector: string; ticketBand: string;
  won: string; called: boolean; picks: number[]; menu: number;
  poolRankControl: number | null; poolRankTreatment: number | null;
  turns: Turn[];
}

const pct = (a: number, b: number) => `${((100 * a) / (b || 1)).toFixed(1)}%`;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** A row's verdict under one ruler. `null` anywhere means CANNOT SAY, and a row
 *  we cannot check is counted as surviving — the generous reading both earlier
 *  harnesses used, kept so the before-and-after are the same arithmetic. */
interface Verdict { money: boolean | null; theme: boolean | null }
const fails = (v: Verdict) => v.money === true || v.theme === true;

function gradeLegacy(block: string, sector: string, band: string): Verdict {
  return {
    money: awardMismatch(awardMedian(block), band),
    theme: themeMismatch(block, SECTOR_WORD[sector]),
  };
}

function gradeCalibrated(
  block: string, title: string, sector: string, band: string,
  nb: Neighbourhood, byName: Map<string, string[]>, mixOf: Map<string, Record<string, number> | null>,
): Verdict {
  const ids = resolveTitle(title, byName);
  // Siblings share a name. A row is only a category error if EVERY instrument
  // it could be is one; anything else would convict a row on its namesake.
  const verdicts = ids.map((id) => categoryError(mixOf.get(id), sector, nb));
  const theme = !verdicts.length ? null
    : verdicts.every((v) => v === true) ? true
    : verdicts.some((v) => v === false) ? false : null;
  return { money: awardMismatch(awardMedian(block), band), theme };
}

function report(tape: string, nb: Neighbourhood, byName: Map<string, string[]>,
  mixOf: Map<string, Record<string, number> | null>) {
  const rows = readFileSync(tape, "utf8").trim().split("\n")
    .filter(Boolean).map((l) => JSON.parse(l) as TapeRow);
  const called = rows.filter((r) => r.called && r.turns?.length && r.picks?.length);
  console.log(`\n${"=".repeat(78)}\n${path.basename(path.dirname(tape))}/${path.basename(tape)}`
    + `   ${called.length} called founder(s)\n${"=".repeat(78)}`);

  let wonN = 0, wonOld = 0, wonNew = 0, wonMoney = 0;
  let menuN = 0, menuOld = 0, menuNew = 0;
  let pickN = 0, pickOld = 0, pickNew = 0;
  const survOld: number[] = [], survNew: number[] = [], survMoney: number[] = [];
  let shortOld = 0, shortNew = 0, shortMoney = 0, unresolved = 0;
  const stillFires: string[] = [];

  for (const r of called) {
    const first = r.turns.find((t) => t.round === 1);
    if (!first) continue;
    const cands = menuRows(first.prompt);
    if (!cands.length) continue;

    const okOld = new Set<number>(), okNew = new Set<number>(), okMoney = new Set<number>();
    for (const c of cands) {
      const ids = resolveTitle(c.title, byName);
      if (!ids.length) unresolved++;
      const o = gradeLegacy(c.block, r.sector, r.ticketBand);
      const n = gradeCalibrated(c.block, c.title, r.sector, r.ticketBand, nb, byName, mixOf);
      menuN++;
      if (fails(o)) menuOld++; else okOld.add(c.i);
      if (fails(n)) menuNew++; else okNew.add(c.i);
      if (n.money !== true) okMoney.add(c.i);
    }
    survOld.push(okOld.size); survNew.push(okNew.size); survMoney.push(okMoney.size);
    if (okOld.size < SELECT_COUNT) shortOld++;
    if (okNew.size < SELECT_COUNT) shortNew++;
    if (okMoney.size < SELECT_COUNT) shortMoney++;
    for (const i of r.picks) {
      if (i < 0 || i >= cands.length) continue;
      pickN++;
      if (!okOld.has(i)) pickOld++;
      if (!okNew.has(i)) pickNew++;
    }

    // THE LABELLED ROW. Recovered exactly, from the tape's own rank.
    const at = (r.poolRankControl ?? 0) - 1;
    const w = cands.find((c) => c.i === at);
    if (!w) continue;
    wonN++;
    const o = gradeLegacy(w.block, r.sector, r.ticketBand);
    const n = gradeCalibrated(w.block, w.title, r.sector, r.ticketBand, nb, byName, mixOf);
    if (fails(o)) wonOld++;
    if (fails(n)) wonNew++;
    if (o.money === true) wonMoney++;
    if (n.theme === true) stillFires.push(`${r.company} (${r.sector}) won ${r.won}`);
  }

  console.log(`\n1. THE FALSE-DISQUALIFICATION RATE — the fund the company actually won`);
  console.log(`   labelled rows recovered from the tape        ${wonN}`);
  console.log(`   RETIRED ruler disqualifies it                ${wonOld} (${pct(wonOld, wonN)})`);
  console.log(`   CALIBRATED ruler disqualifies it             ${wonNew} (${pct(wonNew, wonN)})`);
  console.log(`   ...of which the MONEY rule alone             ${wonMoney} (${pct(wonMoney, wonN)})`);
  console.log(`   the money rule is the prompt's own and is NOT fixed here. Every number`);
  console.log(`   quoted from the calibrated ruler carries its ${pct(wonMoney, wonN)} with it.`);
  if (stillFires.length) {
    console.log(`\n   the theme rule still fires on the won fund of:`);
    for (const s of stillFires) console.log(`     ${s}`);
  } else console.log(`\n   the theme rule fires on no won fund at all.`);

  console.log(`\n2. THE BASE RATE — every row of every menu`);
  console.log(`   menu rows graded                             ${menuN}`);
  console.log(`   RETIRED ruler disqualifies                   ${menuOld} (${pct(menuOld, menuN)})`);
  console.log(`   CALIBRATED ruler disqualifies                ${menuNew} (${pct(menuNew, menuN)})`);
  console.log(`   rows no title join could resolve             ${unresolved} (counted as surviving)`);

  console.log(`\n3. SURVIVORS AND SEATS — the case for \`atMost\`, re-derived`);
  console.log(`   MEAN SURVIVING ROWS, retired ruler           ${mean(survOld).toFixed(1)}`);
  console.log(`   MEAN SURVIVING ROWS, calibrated ruler        ${mean(survNew).toFixed(1)}`);
  console.log(`   fewer survivors than the ${SELECT_COUNT} seats, retired    ${shortOld}/${survOld.length} (${pct(shortOld, survOld.length)})`);
  console.log(`   fewer survivors than the ${SELECT_COUNT} seats, calibrated ${shortNew}/${survNew.length} (${pct(shortNew, survNew.length)})`);
  console.log(`   MEAN SURVIVING ROWS, MONEY RULE ONLY         ${mean(survMoney).toFixed(1)}`);
  console.log(`   fewer survivors than the ${SELECT_COUNT} seats, money only ${shortMoney}/${survMoney.length} (${pct(shortMoney, survMoney.length)})`);
  console.log(`   the calibrated and money-only lines are all but the same number: once`);
  console.log(`   the theme test may not condemn the answer key, the money rule is the ruler.`);

  console.log(`\n4. THE HEADLINE — picks said to fail the prompt's own disqualifiers`);
  console.log(`   picks graded                                 ${pickN}`);
  console.log(`   RETIRED ruler calls a failure                ${pickOld} (${pct(pickOld, pickN)})`);
  console.log(`   CALIBRATED ruler calls a failure             ${pickNew} (${pct(pickNew, pickN)})`);
}

/** The eighteen-row prompts wsDY measured, where "2.1 of 18" and "ten of the
 *  twelve" came from. Re-derived with the same two rulers. */
function slots(dir: string, nb: Neighbourhood, byName: Map<string, string[]>,
  mixOf: Map<string, Record<string, number> | null>) {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  console.log(`\n${"=".repeat(78)}\nwsDY's eighteen-row prompts: ${dir}\n${"=".repeat(78)}`);
  console.log(`\n  ${"company".padEnd(20)}${"menu".padStart(6)}${"retired".padStart(10)}${"calibrated".padStart(13)}${"money only".padStart(13)}`);
  const old: number[] = [], neu: number[] = [], mon: number[] = [];
  let shortOld = 0, shortNew = 0, shortMon = 0, rowsSeen = 0, unresolved = 0;
  for (const c of COMPANIES) {
    const f = path.join(dir, slug(c.company), "prompt_r1.txt");
    if (!existsSync(f)) continue;
    const cands = menuRows(readFileSync(f, "utf8"));
    if (!cands.length) continue;
    let o = 0, n = 0, m = 0;
    for (const cand of cands) {
      rowsSeen++;
      if (!resolveTitle(cand.title, byName).length) unresolved++;
      if (!fails(gradeLegacy(cand.block, c.sector, c.ticketBand))) o++;
      const cal = gradeCalibrated(cand.block, cand.title, c.sector, c.ticketBand, nb, byName, mixOf);
      if (!fails(cal)) n++;
      if (cal.money !== true) m++;
    }
    old.push(o); neu.push(n); mon.push(m);
    if (m < 6) shortMon++;
    // wsDY's own comparison was against SIX seats, which is what shipped then.
    if (o < 6) shortOld++;
    if (n < 6) shortNew++;
    console.log(`  ${c.company.padEnd(20)}${String(cands.length).padStart(6)}`
      + `${String(o).padStart(10)}${String(n).padStart(13)}${String(m).padStart(13)}`);
  }
  console.log(`\n  MEAN SURVIVORS, retired ruler       ${mean(old).toFixed(1)}   (published as "2.1 of 18")`);
  console.log(`  MEAN SURVIVORS, calibrated ruler    ${mean(neu).toFixed(1)}`);
  console.log(`  fewer than the six seats, retired   ${shortOld}/${old.length}   (published as "ten of the twelve")`);
  console.log(`  fewer than the six seats, calibrated ${shortNew}/${neu.length}`);
  console.log(`  MEAN SURVIVORS, MONEY RULE ONLY     ${mean(mon).toFixed(1)}`);
  console.log(`  fewer than the six seats, money only ${shortMon}/${mon.length}`
    + `  <- the whole residual, and this is the rule that`);
  console.log(`                                            throws out the won fund one time in eight`);
  console.log(`  rows no title join could resolve    ${unresolved}/${rowsSeen}`
    + ` — counted as surviving, so the calibrated mean is an UPPER bound here`);
}

function main() {
  const corpus = snapshot();
  const nb = neighbourhood(corpus);
  const byName = titleIndex(corpus);
  const mixOf = new Map(corpus.map((r) => [r.id, r.sectorMix]));
  console.log(`corpus snapshot: ${corpus.length} instruments, `
    + `${nb.base.size} sector keys, neighbourhood derived from co-funding lift`);

  const args = process.argv.slice(2);
  const root = path.join(process.cwd(), "..", "..", "project-mgmt", "findings");
  if (args[0] === "--slots") {
    slots(args[1] ?? path.join(root, "first_test_wsDQ"), nb, byName, mixOf);
    return;
  }
  const tapes = args.length ? args : [
    path.join(root, "indicative_wsHO", "main_tape.jsonl"),
    path.join(root, "indicative_wsHW", "main_tape.jsonl"),
  ];
  for (const t of tapes) report(t, nb, byName, mixOf);
  if (existsSync(path.join(root, "first_test_wsDQ"))) {
    slots(path.join(root, "first_test_wsDQ"), nb, byName, mixOf);
  }
}

main();
