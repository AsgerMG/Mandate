// wsHZ — DOES THE `atMost` DIAGNOSIS SURVIVE THE TAPE? OFFLINE. NO MODEL, NO DB, NO KEY.
//
// @ws-active until 2026-09-30
//
// wsHO and wsHW both reported ~48% of the model's picks failing the prompt's own
// two disqualifiers, and both concluded the cause is `SELECT_COUNT_MODE=exactly`
// forcing the model to fill a seat it does not believe in. That conclusion is
// drawn from an AGGREGATE RATE, and an aggregate rate cannot tell two different
// defects apart:
//
//   FORCED    the founder held fewer qualifying rows than seats, so some picks
//             HAD to fail. `atMost` fixes exactly this and nothing else.
//   ELECTIVE  a qualifying row was sitting on the menu UNPICKED while the model
//             spent the seat on a disqualified one. `atMost` cannot fix this:
//             the model was never short of somewhere better to go.
//
// Both are countable from the tape with no model, because `picks` and the
// rendered prompt are both on it. The split is the whole question.
//
// ── AND THE COUNTERFACTUAL, WHICH THE TAPE ALSO ADMITS ────────────────────
//
// `agentSelectRows` returns a PERMUTATION: chosen rows first in the model's
// order, every other row keeping its shipped relative position. So the six a
// founder sees under any pick list is a pure function of the pick list and the
// won fund's shipped rank, both of which are recorded. That identity is
// ASSERTED below against `poolRankTreatment` on every founder before any
// counterfactual is believed — if the reconstruction cannot reproduce the run
// that happened, it may not be trusted about one that did not.
//
// The counterfactual replayed is the MOST FAVOURABLE `atMost` there is: the
// model declines precisely the picks that fail our reconstruction of the two
// disqualifiers and keeps every other pick in place. A real model would not be
// that obedient. So the harm this measures is a LOWER bound on harm and the
// gain an UPPER bound on gain.
//
//   npx tsx scripts/_wshz_replay.ts [tape.jsonl ...]
import { readFileSync } from "fs";
import path from "path";
import { SECTOR_WORD } from "../lib/intelligence/shortlist";
import { SELECT_COUNT } from "../lib/intelligence/agentSelect";

// Pinned OFFLINE for `_wsho_harvest.ts`'s reason: every module below reads these
// lazily, so destroying them is what makes "no DB, no key" true rather than
// merely stated.
delete process.env.DATABASE_URL;
delete process.env.VOYAGE_KEY;

const SHOWN = 6;

const TAPES = process.argv.slice(2).length ? process.argv.slice(2) : [
  path.join(process.cwd(), "..", "..", "project-mgmt", "findings", "indicative_wsHO", "main_tape.jsonl"),
  path.join(process.cwd(), "..", "..", "project-mgmt", "findings", "indicative_wsHW", "main_tape.jsonl"),
];

/** wsDY's own map and the generous reading of "an order of magnitude": the band
 *  FLOOR over ten. Identical to `_wsho_harvest.ts` on purpose — a second
 *  definition of the survivor set would make this file's numbers incomparable
 *  with the two findings it is auditing. */
const BAND_FLOOR: Record<string, number> = {
  b100k_500k: 100_000, b500k_2m5: 500_000, b2m5_15m: 2_500_000,
  b15m_50m: 15_000_000, gt50m: 50_000_000,
};

interface Turn { round: number; prompt: string; reply: string; thinking: string }
interface Row {
  company: string; country: string; stratum: string; sector: string; ticketBand: string;
  called: boolean; picks: number[]; menu: number;
  hitControl: boolean; hitTreatment: boolean;
  poolRankControl: number | null; poolRankTreatment: number | null;
  turns: Turn[];
}

function rowsOf(prompt: string): { i: number; block: string }[] {
  const start = prompt.indexOf("\nCANDIDATES\n");
  const body = start < 0 ? prompt : prompt.slice(start + 12);
  const out: { i: number; block: string }[] = [];
  let cur: { i: number; block: string } | null = null;
  for (const line of body.split("\n")) {
    const m = /^\[(\d+)\] /.exec(line);
    if (m) { if (cur) out.push(cur); cur = { i: Number(m[1]), block: line }; }
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

/** THE PERMUTATION, exactly as `agentSelectRows` builds it: chosen first in the
 *  model's order, everyone else keeping the shipped order behind them. Returns
 *  the 0-based seat the row at shipped index `w` ends up in. */
function seatOf(w: number, chosen: number[]): number {
  const at = chosen.indexOf(w);
  if (at >= 0) return at;
  const set = new Set(chosen);
  let behind = 0;
  for (let i = 0; i < w; i++) if (!set.has(i)) behind++;
  return chosen.length + behind;
}

interface Case {
  r: Row; survivors: Set<number>; off: number[]; kept: number[];
  forced: number; elective: number; passedOver: number[];
  wonIdx: number | null;
}

function analyse(tape: string, strict = false) {
  const rows = readFileSync(tape, "utf8").trim().split("\n")
    .filter(Boolean).map((l) => JSON.parse(l) as Row);
  const called = rows.filter((r) => r.called && r.turns?.length && r.picks?.length);

  const cases: Case[] = [];
  for (const r of called) {
    const first = r.turns.find((t) => t.round === 1);
    if (!first) continue;
    const cands = rowsOf(first.prompt);
    if (!cands.length) continue;
    const floor = BAND_FLOOR[r.ticketBand];
    const theme = SECTOR_WORD[r.sector];
    const survivors = new Set<number>();
    for (const c of cands) {
      const m = money(c.block);
      const dm = /mostly ([^·\n]+)/.exec(c.block);
      // GENEROUS (the harvest's own reading, so the numbers stay comparable):
      // an unknown band, an unpriced row and an undescribed row all survive.
      // STRICT: a row we cannot check is not a row we can vouch for. The two
      // together bracket the answer, which is the only honest way to use a
      // survivor set built by regex.
      const sizeOk = strict
        ? (floor !== undefined && m !== null && m >= floor / 10)
        : (floor === undefined || m === null || m >= floor / 10);
      const themeOk = strict
        ? (Boolean(dm) && Boolean(theme) && dm![1].trim() === theme)
        : (!dm || !theme || dm[1].trim() === theme);
      if (sizeOk && themeOk) survivors.add(c.i);
    }
    const off = r.picks.filter((i) => !survivors.has(i));
    const kept = r.picks.filter((i) => survivors.has(i));
    // The floor on fillers a founder cannot avoid: with S survivors and N seats
    // and a DISTINCTNESS rule, at least N-S picks must fail whatever the model
    // believes. Everything above that floor is a survivor left on the table.
    const forced = Math.max(0, SELECT_COUNT - survivors.size);
    const elective = Math.max(0, off.length - forced);
    const passedOver = [...survivors].filter((i) => !r.picks.includes(i)).sort((a, b) => a - b);
    const wonIdx = r.poolRankControl != null && r.poolRankControl >= 1
      && r.poolRankControl <= r.menu ? r.poolRankControl - 1 : null;
    cases.push({ r, survivors, off, kept, forced, elective, passedOver, wonIdx });
  }
  return cases;
}

function report(tape: string) {
  const cases = analyse(tape);
  const name = path.basename(path.dirname(tape));
  console.log(`\n${"=".repeat(78)}\n${name} · ${cases.length} called founder(s) with a transcript\n${"=".repeat(78)}`);

  // ── 0. THE RECONSTRUCTION MUST REPRODUCE THE RUN THAT HAPPENED ──────────
  let checked = 0, agreed = 0;
  for (const c of cases) {
    if (c.wonIdx == null || c.r.poolRankTreatment == null) continue;
    checked++;
    if (seatOf(c.wonIdx, c.r.picks) + 1 === c.r.poolRankTreatment) agreed++;
  }
  console.log(`\n0. SELF-TEST — the permutation model against the run's own record`);
  console.log(`  founders where the won fund is on the menu   ${checked}`);
  console.log(`  rebuilt poolRankTreatment matches the tape   ${agreed}/${checked}`);
  if (agreed !== checked) {
    console.log("  ██ STOP. The reconstruction does not reproduce the run that happened,");
    console.log("     so nothing it says about a run that did not may be believed.");
    return;
  }

  // ── 1. FORCED OR ELECTIVE — THE WHOLE QUESTION ──────────────────────────
  const totOff = cases.reduce((a, c) => a + c.off.length, 0);
  const totForced = cases.reduce((a, c) => a + c.forced, 0);
  const totElective = cases.reduce((a, c) => a + c.elective, 0);
  const totPicks = cases.reduce((a, c) => a + c.r.picks.length, 0);
  const anyElective = cases.filter((c) => c.elective > 0).length;
  const passedOverWhileOff = cases.filter((c) => c.off.length > 0 && c.passedOver.length > 0);
  console.log(`\n1. WHEN A PICK FAILED, WAS THERE SOMEWHERE BETTER TO GO?`);
  console.log(`  picks made                                       ${totPicks}`);
  console.log(`  picks failing the two disqualifiers              ${totOff} (${pct(totOff, totPicks)})`);
  console.log(`  ...FORCED  (fewer survivors than the ${SELECT_COUNT} seats)   ${totForced} (${pct(totForced, totOff)} of the failures)`);
  console.log(`  ...ELECTIVE (a survivor was left on the menu)    ${totElective} (${pct(totElective, totOff)} of the failures)`);
  console.log(`  founders with at least one ELECTIVE filler       ${anyElective}/${cases.length} (${pct(anyElective, cases.length)})`);
  console.log(`  founders who spent a seat off-list while a`);
  console.log(`    qualifying row sat unpicked on the menu        ${passedOverWhileOff.length}/${cases.length} (${pct(passedOverWhileOff.length, cases.length)})`);
  const survivorsLeft = passedOverWhileOff.reduce((a, c) => a + c.passedOver.length, 0);
  console.log(`  qualifying rows left unpicked on those founders  ${survivorsLeft} (mean ${(survivorsLeft / (passedOverWhileOff.length || 1)).toFixed(1)})`);

  // ── 2. WOULD DECLINING HAVE HELPED? THE MOST FAVOURABLE atMost ──────────
  // Decline exactly the failures, keep every other pick, let the shipped order
  // take the seats back. This is the ceiling on what the arm can buy.
  let shorter = 0, seatsDeclined = 0;
  let hitBefore = 0, hitAfter = 0, gained: string[] = [], lost: string[] = [];
  const backfillRows: number[] = [];   // shipped rows that reach the six by declining
  let backfillSurvive = 0;
  for (const c of cases) {
    const before = c.r.picks;
    const after = c.kept;
    if (after.length < before.length) { shorter++; seatsDeclined += before.length - after.length; }
    // Which shipped rows newly reach the six because seats were handed back.
    const sixBefore = new Set<number>();
    const sixAfter = new Set<number>();
    for (let i = 0; i < c.r.menu; i++) {
      if (seatOf(i, before) < SHOWN) sixBefore.add(i);
      if (seatOf(i, after) < SHOWN) sixAfter.add(i);
    }
    for (const i of sixAfter) if (!sixBefore.has(i)) {
      backfillRows.push(i); if (c.survivors.has(i)) backfillSurvive++;
    }
    if (c.wonIdx == null) continue;
    const wasHit = seatOf(c.wonIdx, before) < SHOWN;
    const isHit = seatOf(c.wonIdx, after) < SHOWN;
    if (wasHit) hitBefore++;
    if (isHit) hitAfter++;
    if (!wasHit && isHit) gained.push(`${c.r.company} (${c.r.stratum})`);
    if (wasHit && !isHit) lost.push(`${c.r.company} (${c.r.stratum})`);
  }
  console.log(`\n2. THE FREE COUNTERFACTUAL — the most favourable \`atMost\` there is`);
  console.log(`  founders who would have returned FEWER picks     ${shorter}/${cases.length} (${pct(shorter, cases.length)})`);
  console.log(`  seats handed back to the shipped order           ${seatsDeclined} (mean ${(seatsDeclined / (shorter || 1)).toFixed(1)} on those founders)`);
  console.log(`  founders whose SIX would change at all           ${backfillRows.length ? "see below" : "none"}`);
  console.log(`  won fund in the six BEFORE (of ${cases.filter((c) => c.wonIdx != null).length} gradable)   ${hitBefore}`);
  console.log(`  won fund in the six AFTER                        ${hitAfter}`);
  console.log(`  ██ WON FUND GAINED  ${gained.length}${gained.length ? `: ${gained.join(", ")}` : ""}`);
  console.log(`  ██ WON FUND LOST    ${lost.length}${lost.length ? `: ${lost.join(", ")}` : ""}`);

  // ── 3. AND WHAT BACKFILLS — the question the pick-rate cannot answer ────
  console.log(`\n3. WHAT ACTUALLY REACHES THE FOUNDER IN A DECLINED SEAT`);
  console.log(`  rows promoted into the six by declining          ${backfillRows.length}`);
  console.log(`  ...that survive the SAME two disqualifiers       ${backfillSurvive} (${pct(backfillSurvive, backfillRows.length)})`);
  console.log(`  ...that FAIL them, i.e. the founder sees a`);
  console.log(`     disqualified row either way                   ${backfillRows.length - backfillSurvive} (${pct(backfillRows.length - backfillSurvive, backfillRows.length)})`);

  // ── 4. THE SIX AS SHOWN, WHICH IS WHAT A FOUNDER ACTUALLY READS ─────────
  let sixOffBefore = 0, sixOffAfter = 0, sixTot = 0;
  for (const c of cases) {
    for (let i = 0; i < c.r.menu; i++) {
      if (seatOf(i, c.r.picks) < SHOWN) { sixTot++; if (!c.survivors.has(i)) sixOffBefore++; }
      if (seatOf(i, c.kept) < SHOWN && !c.survivors.has(i)) sixOffAfter++;
    }
  }
  console.log(`\n4. THE SIX SHOWN, WHICH IS WHAT A FOUNDER ACTUALLY READS`);
  console.log(`  rows shown across all founders                   ${sixTot}`);
  console.log(`  ...failing the two disqualifiers, TODAY          ${sixOffBefore} (${pct(sixOffBefore, sixTot)})`);
  console.log(`  ...failing them under the favourable \`atMost\`    ${sixOffAfter} (${pct(sixOffAfter, sixTot)})`);
  console.log(`  READ THIS WITH ITS ARTEFACT NAMED. A pick-rate falls whenever picks`);
  console.log(`  fall, so 48% -> anything is not evidence. This is better but it is not`);
  console.log(`  clean either: the picks KEPT are survivors by construction, so this`);
  console.log(`  counterfactual seats ${(cases.reduce((a, c) => a + c.kept.length, 0) / cases.length).toFixed(1)} guaranteed survivors at the front of every`);
  console.log(`  six. It is an upper bound on the arm, not a reading of it. Section 7`);
  console.log(`  is the comparison that does not depend on the arm behaving perfectly.`);


  // ── 5. IS THE SURVIVOR SET EVEN WHAT THE MODEL IS SELECTING ON? ─────────
  // Generosity cannot be argued away, so test the thing generosity cannot
  // touch: how much MORE likely a survivor is to be picked than a non-survivor.
  // If the enrichment is small the two disqualifiers simply do not describe how
  // this model picks, and no count mode can make them describe it.
  let sPick = 0, sTot = 0, nPick = 0, nTot = 0;
  for (const c of cases) {
    const picked = new Set(c.r.picks);
    for (let i = 0; i < c.r.menu; i++) {
      if (c.survivors.has(i)) { sTot++; if (picked.has(i)) sPick++; }
      else { nTot++; if (picked.has(i)) nPick++; }
    }
  }
  const pS = sPick / (sTot || 1), pN = nPick / (nTot || 1);
  console.log(`\n5. DOES THE MODEL SELECT ON THESE TWO RULES AT ALL?`);
  console.log(`  P(picked | survives both rules)                  ${(100 * pS).toFixed(1)}%  (${sPick}/${sTot})`);
  console.log(`  P(picked | fails at least one)                   ${(100 * pN).toFixed(1)}%  (${nPick}/${nTot})`);
  console.log(`  enrichment                                       ${(pS / (pN || 1)).toFixed(2)}x`);

  // ── 6. THE CONTROL, WHICH IS THE ONLY THING A DECLINED SEAT REVERTS TO ──
  // Declining every seat IS the shipped order. So the shipped order's own
  // off-rate is the floor `atMost` is walking toward, and if it is no better
  // than the model's the arm is buying a reversion rather than a repair.
  let ctrlOff = 0, ctrlTot = 0, ctrlHit = 0;
  for (const c of cases) {
    for (let i = 0; i < SHOWN && i < c.r.menu; i++) { ctrlTot++; if (!c.survivors.has(i)) ctrlOff++; }
    if (c.wonIdx != null && c.wonIdx < SHOWN) ctrlHit++;
  }
  const menuTot = cases.reduce((a, c) => a + c.r.menu, 0);
  const menuOff = menuTot - cases.reduce((a, c) => a + c.survivors.size, 0);
  console.log(`\n6. THE SHIPPED ORDER ON THE SAME RULER — no model at all`);
  console.log(`  the WHOLE MENU failing the two disqualifiers     ${menuOff}/${menuTot} (${pct(menuOff, menuTot)})  <- the base rate`);
  console.log(`  control six failing the two disqualifiers        ${ctrlOff}/${ctrlTot} (${pct(ctrlOff, ctrlTot)})`);
  console.log(`  the model\u0027s SIX                                ${sixOffBefore}/${sixTot} (${pct(sixOffBefore, sixTot)})`);
  console.log(`  ...the favourable \`atMost\`                      ${sixOffAfter}/${sixTot} (${pct(sixOffAfter, sixTot)})`);
  console.log(`  EXACT@6  control ${ctrlHit}  ·  model today ${hitBefore}  ·  favourable atMost ${hitAfter}`);
  console.log(`  ██ THE MODEL'S SIX AND THE FREE SCORE'S SIX FAIL THESE RULES AT THE SAME`);
  console.log(`     RATE (${pct(ctrlOff, ctrlTot)} vs ${pct(sixOffBefore, sixTot)}), and both are ~25 points better than the`);
  console.log(`     menu they were cut from. So the ~48% headline is a property of the`);
  console.log(`     POOL under this ruler, not a symptom of the count mode. A selector`);
  console.log(`     that never read the prompt scores the same.`);
  console.log(`  The ${pct(sixOffAfter, sixTot)} above is BELOW the control only because the counterfactual`);
  console.log(`  retains picks that are survivors by construction. Declining EVERY seat`);
  console.log(`  is the control at ${pct(ctrlOff, ctrlTot)} — that is the true floor of the licence.`);

  // ── 7. THE SENSITIVITY THAT DECIDES WHETHER 1. SURVIVES ─────────────────
  const strictCases = analyse(tape, true);
  const sOff = strictCases.reduce((a, c) => a + c.off.length, 0);
  const sForced = strictCases.reduce((a, c) => a + c.forced, 0);
  const sElect = strictCases.reduce((a, c) => a + c.elective, 0);
  console.log(`\n7. THE SAME SPLIT UNDER A STRICT SURVIVOR SET — the bracket`);
  console.log(`  a row we cannot price or cannot describe now FAILS, so survivors`);
  console.log(`  collapse and every failure that CAN be forced now is.`);
  console.log(`  mean survivors  generous ${(cases.reduce((a, c) => a + c.survivors.size, 0) / cases.length).toFixed(1)}`
    + `  ->  strict ${(strictCases.reduce((a, c) => a + c.survivors.size, 0) / strictCases.length).toFixed(1)}`);
  console.log(`  failures  ${sOff}   FORCED ${sForced} (${pct(sForced, sOff)})   ELECTIVE ${sElect} (${pct(sElect, sOff)})`);
  console.log(`  generous  ${totOff}   FORCED ${totForced} (${pct(totForced, totOff)})   ELECTIVE ${totElective} (${pct(totElective, totOff)})`);

  // ── 8. THE CASES THAT DECIDE IT ─────────────────────────────────────────
  console.log(`\n8. FOUNDERS WITH NO SEAT PRESSURE AT ALL AND OFF-LIST PICKS ANYWAY`);
  const ample = cases.filter((c) => c.survivors.size >= SELECT_COUNT);
  const ampleOff = ample.reduce((a, c) => a + c.off.length, 0);
  const amplePicks = ample.reduce((a, c) => a + c.r.picks.length, 0);
  console.log(`  founders with >= ${SELECT_COUNT} survivors                    ${ample.length}/${cases.length}`);
  console.log(`  their picks failing the disqualifiers            ${ampleOff}/${amplePicks} (${pct(ampleOff, amplePicks)})`);
  console.log(`  every one of these is ELECTIVE by construction. \`atMost\` addresses none of them.`);
  const worst = [...cases].sort((a, b) => b.elective - a.elective).slice(0, 12);
  console.log(`\n  worst ELECTIVE cases (survivors on the menu, seat spent elsewhere)`);
  console.log(`  ${"founder".padEnd(34)}${"str".padStart(4)}${"surv".padStart(6)}${"off".padStart(5)}`
    + `${"forced".padStart(8)}${"elect".padStart(7)}${"unpicked survivors".padStart(20)}`);
  for (const c of worst) {
    console.log(`  ${c.r.company.slice(0, 32).padEnd(34)}${c.r.stratum.padStart(4)}`
      + `${String(c.survivors.size).padStart(6)}${String(c.off.length).padStart(5)}`
      + `${String(c.forced).padStart(8)}${String(c.elective).padStart(7)}`
      + `${String(c.passedOver.length).padStart(20)}`);
  }
}

for (const t of TAPES) report(t);
