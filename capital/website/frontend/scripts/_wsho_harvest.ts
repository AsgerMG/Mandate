// wsHO — THE FREE HARVEST FROM THE PAID TAPE. OFFLINE. NO MODEL, NO DB, NO KEY.
//
// @ws-active until 2026-09-30
//
// `_wsho_strata.ts` bought something nobody in this repo has held before: REAL
// REPLIES AT A FORTY-ROW MENU, with the prompt exactly as sent beside each one.
// Everything below is read out of that tape, so it costs nothing, can be re-run
// forever, and cannot describe a prompt other than the one that was sent.
//
// Separated from the measurement for `_wshh_report.ts`'s reason: a formatting
// change must never cost the run again.
//
//   npx tsx scripts/_wsho_harvest.ts [tape.jsonl]
//
// ── THE QUESTION ──────────────────────────────────────────────────────────
//
// `AGENT_SELECT_COUNT_MODE` ships as `exactly`: the model is told to return
// EXACTLY seven picks. `atMost` exists and is off. `_wsdy_slots.ts` measured a
// mean of **2.1 of 18 rows** surviving the prompt's own two disqualifiers, with
// 10 of 12 founders holding fewer qualifying rows than seats — and the model
// SAID SO, in the reasoning wsDS had already paid for:
//
//   "I'm constrained to pick 6 from this list of 18, so I need to identify
//    which ones are least egregiously mismatched"
//   "the requirement is to return exactly six selections regardless of fit
//    quality, so I'll have to rank them with the best matches first"
//
// At forty rows the pressure is worse, not better — unless the extra
// twenty-two rows are qualifying ones, which is precisely what nobody knew.
//
// ── AND WHY THIS DOES IT BY BEHAVIOUR AND NOT BY QUOTATION ────────────────
//
// wsDY's evidence is the model's own words, and those words came from effort
// `high`. THE SHIPPED RUNG IS `low`, AT WHICH THE MODEL EMITS NO REASONING AT
// ALL — measured on this very tape and reported below. So in production the
// admission wsDY rests on is not merely unread, it does not exist.
//
// What does exist is the CHOICE, and the choice is the stronger evidence:
//
//   IF A FOUNDER HAS FEWER QUALIFYING ROWS THAN SEATS, EVERY PICK BEYOND THE
//   QUALIFYING ONES IS A SEAT FILLED REGARDLESS OF FIT, BY CONSTRUCTION.
//
// That is countable without asking the model anything, it is a property rather
// than a register, and it holds for a founder nobody has looked at.
//
// ── THE TWO DISQUALIFIERS, AND THEY ARE THE PROMPT'S OWN ──────────────────
//
//   "a scheme whose typical cheque is an order of magnitude away from what this
//    company needs is the wrong scheme however well the rest fits"
//   "where two are equally good, prefer the one whose title is specific to what
//    this company does"
//
// Applied GENEROUSLY and in wsDY's own direction, so the two numbers compare:
// a row with no award median counts as the right size, a row with no descriptor
// counts as on-theme, and the money rule is read one-sided at the BOTTOM of the
// founder's band. Every survivor count below is therefore an UPPER BOUND.
//
// @ws-active until 2026-09-30
import { readFileSync } from "fs";
import path from "path";

// The label a row actually prints. Imported rather than retyped: a map copied
// into a harness goes stale silently and would report a sector mismatch that
// the founder never saw.
import { SECTOR_WORD } from "../lib/intelligence/shortlist";
import { SELECT_COUNT, SELECT_COUNT_MODE } from "../lib/intelligence/agentSelect";

const TAPE = process.argv[2] ?? path.join(
  process.cwd(), "..", "..", "project-mgmt", "findings", "indicative_wsHO", "main_tape.jsonl");

/** The bottom of what the founder said they need, in euro. wsDY's own map, and
 *  the generous reading of "an order of magnitude": the band FLOOR over ten. A
 *  band this map does not know makes every row survive, which cannot inflate
 *  the seat-filling count. */
const BAND_FLOOR: Record<string, number> = {
  b100k_500k: 100_000, b500k_2m5: 500_000, b2m5_15m: 2_500_000,
  b15m_50m: 15_000_000, gt50m: 50_000_000,
};

interface Turn { round: number; prompt: string; reply: string; thinking: string }
interface Row {
  company: string; country: string; stratum: string; sector: string; ticketBand: string;
  called: boolean; picks: number[]; menu: number; hitControl: boolean; hitTreatment: boolean;
  turns: Turn[];
}

/** A rendered candidate, `[i] title` plus its indented block. */
function rowsOf(prompt: string): { i: number; head: string; block: string }[] {
  const start = prompt.indexOf("\nCANDIDATES\n");
  const body = start < 0 ? prompt : prompt.slice(start + 12);
  const out: { i: number; head: string; block: string }[] = [];
  let cur: { i: number; head: string; block: string } | null = null;
  for (const line of body.split("\n")) {
    const m = /^\[(\d+)\] /.exec(line);
    if (m) { if (cur) out.push(cur); cur = { i: Number(m[1]), head: line, block: line }; }
    else if (cur && line.startsWith("     ")) cur.block += `\n${line}`;
    else if (cur && !line.trim()) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out;
}

const money = (s: string): number | null => {
  const m = /typical award EUR ([\d.]+)([MkB]?)/.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2] === "B" ? n * 1e9 : m[2] === "M" ? n * 1e6 : m[2] === "k" ? n * 1e3 : n;
};

const pct = (a: number, b: number) => `${((100 * a) / (b || 1)).toFixed(1)}%`;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Phrases in which a model tells you it is filling a seat. NOT a banned-word
 *  list: this is a SEARCH over text nobody has read, reported with its hit
 *  count so that zero hits is legible as "the text does not say this" and never
 *  as "we did not look". The behavioural count below is the measurement. */
const SEAT_TALK = [
  /regardless of fit/i, /fill(?:ing)? (?:the )?(?:remaining )?(?:slots|seats|spots)/i,
  /constrained to pick/i, /need(?:ed)? (?:to name|to pick|to choose) \d+/i,
  /least (?:egregiously )?mismatched/i, /forced to (?:pick|choose|include)/i,
  /only \w+ (?:options?|schemes?|rows?) (?:actually |really )?(?:match|fit)/i,
  /none of the remaining/i, /poor fit/i, /weak(?:er)? (?:fit|match)/i,
  /not a (?:good |great )?(?:fit|match)/i, /stretch/i,
];

function main() {
  const rows = readFileSync(TAPE, "utf8").trim().split("\n")
    .filter(Boolean).map((l) => JSON.parse(l) as Row);
  const called = rows.filter((r) => r.called && r.turns?.length);
  if (!called.length) throw new Error(`_wsho_harvest: ${TAPE} holds no called founder with a transcript.`);

  console.log(`wsHO harvest · ${TAPE}`);
  console.log(`${called.length} called founder(s) with a full transcript, `
    + `${called.reduce((a, r) => a + r.turns.length, 0)} API turn(s)`);
  console.log(`levers as recorded: SELECT_COUNT=${SELECT_COUNT} `
    + `SELECT_COUNT_MODE=${SELECT_COUNT_MODE}\n`);

  // ── 0. IS THERE ANY REASONING TO READ AT ALL? ────────────────────────────
  const withThinking = called.filter((r) => r.turns.some((t) => t.thinking.trim().length));
  console.log("0. IS THERE ANY REASONING TO READ?");
  console.log(`  founders whose reply carried ANY reasoning text  ${withThinking.length}/${called.length}`);
  if (!withThinking.length) {
    console.log("  ██ NONE. At the SHIPPED effort the model emits no reasoning, so the");
    console.log("     self-report wsDY's finding rests on does not exist in production.");
    console.log("     Everything below is measured from the CHOICE instead.");
  }

  // ── 1. THE MODEL'S OWN WORDS, WHERE THERE ARE ANY ────────────────────────
  console.log("\n1. DOES IT SAY, IN ITS OWN WORDS, THAT IT IS FILLING SEATS?");
  let quoted = 0;
  for (const r of called) {
    for (const t of r.turns) {
      const text = `${t.thinking}\n${t.reply}`;
      for (const re of SEAT_TALK) {
        const m = re.exec(text);
        if (!m) continue;
        quoted++;
        const at = Math.max(0, (m.index ?? 0) - 120);
        console.log(`  ${r.company} (round ${t.round}): "...${text.slice(at, at + 300).replace(/\s+/g, " ")}..."`);
        break;
      }
    }
  }
  console.log(`  ${quoted} transcript(s) of ${called.reduce((a, r) => a + r.turns.length, 0)} `
    + `matched any of ${SEAT_TALK.length} seat-filling phrasings`);

  // ── 2. THE HEDGE CHANNEL THE PROMPT ACTUALLY OFFERS ─────────────────────
  // The reply schema has ONE place to express doubt: `unsure`. It is the only
  // hedge the contract admits, so its rate IS the observable hedging rate.
  let unsureBriefs = 0, unsureNamed = 0;
  for (const r of called) {
    const first = r.turns.find((t) => t.round === 1);
    if (!first) continue;
    const m = /"unsure"\s*:\s*\[([^\]]*)\]/.exec(first.reply);
    const named = m && m[1].trim() ? m[1].split(",").filter((x) => x.trim()).length : 0;
    if (named > 0) { unsureBriefs++; unsureNamed += named; }
  }
  console.log("\n2. THE ONLY HEDGE THE REPLY CONTRACT ADMITS: `unsure`");
  console.log(`  briefs naming at least one unsure row   ${unsureBriefs}/${called.length} `
    + `(${pct(unsureBriefs, called.length)})`);
  console.log(`  rows named unsure in total              ${unsureNamed}`);
  console.log("  The prompt invites this explicitly and caps it at 5. A model that");
  console.log("  cannot separate two funds has exactly one way to say so.");

  // ── 3. HOW MANY ROWS SURVIVE THE PROMPT'S OWN DISQUALIFIERS AT FORTY ─────
  console.log("\n3. OF THE ROWS THE MODEL READ, HOW MANY SURVIVE THE PROMPT'S OWN");
  console.log("   TWO DISQUALIFIERS — GENEROUSLY, SO EVERY NUMBER IS AN UPPER BOUND");
  const survivors: number[] = [];
  const menus: number[] = [];
  const offSet: number[] = [];
  const fewerThanSeats: Row[] = [];
  let unknownBand = 0;
  const per: { r: Row; menu: number; ok: number; outside: number }[] = [];
  for (const r of called) {
    const first = r.turns.find((t) => t.round === 1);
    if (!first) continue;
    const cands = rowsOf(first.prompt);
    if (!cands.length) continue;
    const floor = BAND_FLOOR[r.ticketBand];
    if (floor === undefined) unknownBand++;
    const theme = SECTOR_WORD[r.sector];
    const okIdx = new Set<number>();
    for (const c of cands) {
      const m = money(c.block);
      const sizeOk = floor === undefined || m === null || m >= floor / 10;
      const dm = /mostly ([^·\n]+)/.exec(c.block);
      const themeOk = !dm || !theme || dm[1].trim() === theme;
      if (sizeOk && themeOk) okIdx.add(c.i);
    }
    const outside = r.picks.filter((i) => !okIdx.has(i)).length;
    survivors.push(okIdx.size);
    menus.push(cands.length);
    offSet.push(outside);
    if (okIdx.size < SELECT_COUNT) fewerThanSeats.push(r);
    per.push({ r, menu: cands.length, ok: okIdx.size, outside });
  }
  const hist = new Map<number, number>();
  for (const s of survivors) hist.set(s, (hist.get(s) ?? 0) + 1);
  console.log(`  founders measured                        ${survivors.length}`);
  console.log(`  mean menu length                         ${mean(menus).toFixed(1)} rows`);
  console.log(`  MEAN SURVIVING ROWS                      ${mean(survivors).toFixed(1)}  `
    + `(wsDY measured 2.1 of 18)`);
  console.log(`  median / min / max                       ${
    [...survivors].sort((a, b) => a - b)[Math.floor(survivors.length / 2)]} / `
    + `${Math.min(...survivors)} / ${Math.max(...survivors)}`);
  console.log(`  FEWER SURVIVORS THAN THE ${SELECT_COUNT} SEATS         ${fewerThanSeats.length}/`
    + `${survivors.length} (${pct(fewerThanSeats.length, survivors.length)})  `
    + `(wsDY: 10 of 12 at eighteen rows)`);
  if (unknownBand) {
    console.log(`  founders whose band this map does not know ${unknownBand} — every row `
      + "survives for them, which cannot inflate the count above");
  }
  console.log(`  survivor histogram: ${[...hist].sort((a, b) => a[0] - b[0])
    .map(([k, v]) => `${k}:${v}`).join(" ")}`);

  // ── 4. THE SEAT-FILLING COUNT, FROM THE CHOICE ───────────────────────────
  const totalPicks = per.reduce((a, x) => a + x.r.picks.length, 0);
  const totalOutside = offSet.reduce((a, b) => a + b, 0);
  console.log("\n4. SEATS FILLED WITH A ROW THAT FAILS THE PROMPT'S OWN RULES");
  console.log(`  picks made                               ${totalPicks}`);
  console.log(`  picks OUTSIDE the surviving set          ${totalOutside} (${pct(totalOutside, totalPicks)})`);
  console.log(`  mean per founder                         ${mean(offSet).toFixed(2)} of ${SELECT_COUNT} seats`);
  console.log(`  founders with at least one such pick     ${offSet.filter((x) => x > 0).length}/${offSet.length}`);
  console.log("  With SELECT_COUNT_MODE=exactly the model cannot decline a seat, so on");
  console.log("  a founder with fewer survivors than seats these picks are not a");
  console.log("  judgement it made — they are the only reply the contract allows.");

  // ── 5. DOES IT COST THE FOUNDER ANYTHING? ────────────────────────────────
  // The seats a filler occupies are seats. If the won fund is in the menu and
  // below the six, a filler above it is the mechanism by which it stays there.
  const fillerAndMiss = per.filter((x) => x.outside > 0 && x.r.stratum === "R" && !x.r.hitTreatment).length;
  const inR = per.filter((x) => x.r.stratum === "R").length;
  console.log("\n5. WHERE THE FILLERS LAND RELATIVE TO THE ANSWER");
  console.log(`  stratum R founders (won fund in the forty, not in our six)  ${inR}`);
  console.log(`  ...of those, at least one filler picked AND still a miss    ${fillerAndMiss}`);
  console.log("  This is an association on a small n, not a mechanism. It says where to");
  console.log("  point an `atMost` arm, and it does not price one.");

  console.log("\n6. PER FOUNDER");
  console.log(`  ${"founder".padEnd(34)}${"str".padEnd(4)}${"menu".padStart(5)}`
    + `${"survive".padStart(9)}${"picks off".padStart(11)}  six c/m`);
  for (const x of per.sort((a, b) => a.ok - b.ok)) {
    console.log(`  ${x.r.company.slice(0, 32).padEnd(34)}${x.r.stratum.padEnd(4)}`
      + `${String(x.menu).padStart(5)}${String(x.ok).padStart(9)}${String(x.outside).padStart(11)}`
      + `  ${x.r.hitControl ? "Y" : "n"}/${x.r.hitTreatment ? "Y" : "n"}`);
  }
}

main();
