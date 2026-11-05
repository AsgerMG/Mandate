/**
 * What the wsIE currency corrections do to a founder's verdict.
 *
 * FREE. One committed tape and the committed snapshot, through the product's
 * own verdict engine. No model call, no network, no credential, no write.
 *
 * ── Why this is not `_wsic_band_counterfactual.ts` ────────────────────────
 * That harness reads the verdict on the row the founder WON, because
 * `innovate_uk` was won by 109 of the 897 and the whole effect landed there.
 * The currency class is the opposite shape: it is nine gates spread over eight
 * small instruments, and only TEN founders in the tape won any of them. Reading
 * won rows alone would report this as nearly nothing, and that reading would be
 * false -- `innovasjon_norge_grant_innovation` has 4,045 awards and EUR 687M,
 * and a `band_min` two bands above its own floor excludes founders from a row
 * whether or not they went on to win it.
 *
 * So this measures BOTH, side by side:
 *
 *   WON ROW      the wsIC measure, for comparability. Small here, and saying so
 *                is the point.
 *   EVERY PAIR   every founder in the tape against every corrected instrument,
 *                which is the population the gate actually decides. Not a menu:
 *                a menu is what the ranker chose, and no tape prints instrument
 *                ids for the rows the founder did not win. This is the verdict
 *                the engine WOULD return, which is what a gate correction can
 *                be held responsible for and nothing more.
 *
 * ── The trap wsIC exposed, restated because it applies here too ───────────
 * `blocked` counts by FIELD. Two gates on one field are ONE thing in the way,
 * so a flat blocked count is not evidence that nothing changed. Both counts are
 * printed and the transitions are printed by name.
 *
 *   cd web && npx tsx scripts/_wsie_currency_counterfactual.ts
 */
delete process.env.DATABASE_URL;

import { readFileSync } from "fs";
import path from "path";

import { mergeInheritedGates, type DbGate, type DbInstrument } from "../lib/intelligence/corpus";
import type { EligibilityAnswers } from "../lib/intelligence/types";
import { assessInstrument } from "../lib/intelligence/verdict";
import { applyCorrections, loadCorrections } from "./gateCorrections";

const SNAPSHOT = path.join("public", "data", "instrument_terms.json");
const CORRECTIONS = path.join("..", "capital", "project-mgmt", "evidence",
  "wsie_currency_band_corrections_2026-08-19.jsonl");
const TAPE = path.join("..", "capital", "project-mgmt", "findings",
  "indicative_wsHW", "free.json");

interface TapeRow {
  company: string; country: string; won: string; sector?: string;
  ticketBand?: string; stratum: string; controlSix: string[]; hitControl: boolean;
}

const records = JSON.parse(readFileSync(path.join(process.cwd(), SNAPSHOT), "utf8")).records ?? [];
const corrections = loadCorrections(CORRECTIONS);
const fixed = applyCorrections(records, corrections);
const rows: TapeRow[] = JSON.parse(readFileSync(path.join(process.cwd(), TAPE), "utf8")).rows;
const touched = [...new Set(corrections.map((c) => c.instrument_id))].sort();

function assessor(recs: any[]) {
  const byId = new Map(recs.map((i: any) => [i.id, i]));
  const gatesFor = (id: string): DbGate[] => {
    const own = byId.get(id);
    if (!own) return [];
    return mergeInheritedGates(own.gates ?? [], own.parentId ? byId.get(own.parentId) : undefined);
  };
  // The guard's own answers, exactly as `_wsic_band_counterfactual.ts` and
  // `check_winner_not_gated.ts` set them: country, sector and ticket band off
  // the tape, `borrowerModel` pinned to the constant panel.tsx sends for every
  // founder alive, and every other field left undefined so a comparator on an
  // unasked field reads `unknown` and never as a failure.
  return (r: TapeRow, instrumentId: string) => {
    const inst = byId.get(instrumentId);
    if (!inst) return undefined;
    const a: Record<string, unknown> = {
      entityCountries: [r.country], borrowerModel: "operating",
    };
    if (r.sector) a.sector = r.sector;
    if (r.ticketBand) a.ticketBand = r.ticketBand;
    return assessInstrument(
      { ...inst, gates: gatesFor(instrumentId) } as DbInstrument, a as EligibilityAnswers);
  };
}

const before = assessor(records), after = assessor(fixed);
const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
const table = (title: string, b: Map<string, number>, a: Map<string, number>) => {
  console.log(`\n${title}`);
  console.log(`  ${"band".padEnd(14)} ${"before".padStart(7)} ${"after".padStart(7)}`);
  for (const k of [...new Set([...b.keys(), ...a.keys()])].sort()) {
    console.log(`  ${k.padEnd(14)} ${String(b.get(k) ?? 0).padStart(7)} `
      + `${String(a.get(k) ?? 0).padStart(7)}`);
  }
};

console.log(`population   ${rows.length} founders`);
console.log(`corrections  ${corrections.length} on ${touched.length} instruments`);
for (const t of touched) console.log(`               ${t}`);

// ── 1. The wsIC measure: the row the founder actually won ──────────────────
const wonB = new Map<string, number>(), wonA = new Map<string, number>();
const wonMoved: TapeRow[] = [];
let wonInScope = 0;
for (const r of rows) {
  const b = before(r, r.won), a = after(r, r.won);
  if (!b || !a) continue;
  bump(wonB, b.status); bump(wonA, a.status);
  if (touched.includes(r.won)) wonInScope += 1;
  if (b.status !== a.status) wonMoved.push(r);
}
console.log(`\nin scope on the WON row: ${wonInScope} founders `
  + `(${((100 * wonInScope) / rows.length).toFixed(1)}% of ${rows.length})`);
table("VERDICT ON THE WON ROW, whole population", wonB, wonA);
console.log(`\nFOUNDERS WHOSE WON ROW CHANGES BAND: ${wonMoved.length}`);
const wonFrom = new Map<string, number>();
for (const r of wonMoved) bump(wonFrom, `${before(r, r.won)!.status} -> ${after(r, r.won)!.status}`);
for (const [k, n] of [...wonFrom].sort((x, y) => y[1] - x[1])) {
  console.log(`  ${String(n).padStart(4)}  ${k}`);
}

// ── 2. Every founder against every corrected instrument ────────────────────
const pairB = new Map<string, number>(), pairA = new Map<string, number>();
const perInstrument = new Map<string, Map<string, number>>();
const foundersMoved = new Set<string>();
const byCountry = new Map<string, number>();
for (const r of rows) {
  for (const id of touched) {
    const b = before(r, id), a = after(r, id);
    if (!b || !a) continue;
    bump(pairB, b.status); bump(pairA, a.status);
    if (b.status !== a.status) {
      foundersMoved.add(r.company);
      if (!perInstrument.has(id)) perInstrument.set(id, new Map());
      bump(perInstrument.get(id)!, `${b.status} -> ${a.status}`);
      bump(byCountry, r.country);
    }
  }
}
table(`VERDICT ON EVERY (FOUNDER x CORRECTED INSTRUMENT) PAIR `
  + `— ${rows.length} x ${touched.length}`, pairB, pairA);
console.log(`\nPAIRS THAT CHANGE BAND, by instrument`);
for (const [id, m] of [...perInstrument].sort()) {
  console.log(`  ${id}`);
  for (const [k, n] of [...m].sort((x, y) => y[1] - x[1])) {
    console.log(`      ${String(n).padStart(4)}  ${k}`);
  }
}
console.log(`\nDISTINCT FOUNDERS REACHED: ${foundersMoved.size} of ${rows.length} `
  + `(${((100 * foundersMoved.size) / rows.length).toFixed(1)}%)`);
console.log(`  by country: ${[...byCountry].sort((x, y) => y[1] - x[1])
  .map(([k, n]) => `${k} ${n}`).join(", ")}`);

const bl = (m: Map<string, number>) => m.get("blocked") ?? 0;
console.log(`\nblocked, for contrast: won row ${bl(wonB)} -> ${bl(wonA)}, `
  + `pairs ${bl(pairB)} -> ${bl(pairA)}`);
console.log("  `blocked` counts by FIELD, so two gates on one field are ONE obstacle. "
  + "A flat count here is not evidence that nothing moved.");
