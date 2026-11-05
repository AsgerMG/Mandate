/**
 * What the wsIG quarantines do to a founder's verdict, and what the ONE
 * translation I refused would have done instead.
 *
 * FREE. One committed tape and the committed snapshot, through the product's
 * own verdict engine. No model call, no network, no credential, no write.
 *
 * ── Why this measures a NULL result on purpose ────────────────────────────
 * wsIC's harness reads the won row because its effect landed there; wsIE's
 * reads every (founder x corrected instrument) pair because its effect was
 * spread over instruments almost nobody won. This one keeps wsIE's design and
 * adds the reason it matters here: THESE COMPARATORS ARE CLAIMED TO BE INERT,
 * so the correct measurement is a proof that nothing moves, and a proof has to
 * be capable of failing. Any movement at all would mean the inertness claim was
 * wrong and the quarantines are taking real rules away from the engine.
 *
 * It therefore compares more than `status`, which is coarse enough to hide a
 * change: `checked`, `passed` and the blocker fields are compared too. If a
 * quarantine altered how many filters the engine could evaluate for a founder,
 * that would show here even where the band did not move.
 *
 * ── AND IT ANSWERS THE BANDS, WHICH IS THE WHOLE VALIDITY OF THE ZERO ─────
 * The harness wsIC and wsIE inherited from `check_winner_not_gated` sets four
 * answers -- country, borrowerModel, sector, ticketBand -- and leaves every
 * other field undefined. Run that way this measurement returns zero movement,
 * AND THAT ZERO PROVES NOTHING: `evaluateSpec` returns null for an unanswered
 * field just as it does for a numeric operator on a string, so the two causes
 * are indistinguishable and the harness would report zero even if the
 * comparators worked perfectly.
 *
 * So every field the 43 comparators are keyed to is ANSWERED, and swept across
 * its whole vocabulary: each founder is run against each instrument once per
 * assignment in the cartesian product of the vocabularies of that instrument's
 * own inert fields. If any of these comparators could fire, some assignment
 * makes it fire, and the difference appears. A zero here is a real zero.
 *
 * ── ARM 2 is the refused translation, priced ──────────────────────────────
 * eis_tugiteenus_ja_arenduskes passes every mechanical test: 25M sits inside
 * `10-50M`, so `band_min "10-50M"` excludes only founders who genuinely fail.
 * The measure's own description says the 25M is the GROUP's CONSOLIDATED
 * revenue and that it is open to companies operating in at least two countries
 * within such a group, while our intake asks the applicant for its own annual
 * turnover. Arm 2 prices what writing it anyway would have cost, because "I
 * decided not to" is worth less than "here is the number I decided against".
 *
 *   cd web && npx tsx scripts/_wsig_inert_counterfactual.ts
 */
delete process.env.DATABASE_URL;

import { readFileSync } from "fs";
import path from "path";

import { mergeInheritedGates, type DbGate, type DbInstrument } from "../lib/intelligence/corpus";
import type { EligibilityAnswers } from "../lib/intelligence/types";
import { assessInstrument } from "../lib/intelligence/verdict";
import { applyCorrections, loadCorrections, type Correction } from "./gateCorrections";

const SNAPSHOT = path.join("public", "data", "instrument_terms.json");
const CORRECTIONS = path.join("..", "capital", "project-mgmt", "evidence",
  "wsig_inert_comparator_corrections_2026-08-19.jsonl");
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

// ARM 2: the refused translation, applied on top of nothing else.
const REFUSED: Correction[] = [{
  instrument_id: "eis_tugiteenus_ja_arenduskes", gate_key: "scheme_text_1",
  action: "convert", clause: "refused_translation",
  current_value_spec: { op: "numeric_gte", field: "turnoverBand", threshold: 25000000 },
  proposed_value_spec: { op: "band_min", field: "turnoverBand", minAllowed: "10-50M" },
}];
const translated = applyCorrections(records, REFUSED);

function assessor(recs: any[]) {
  const byId = new Map(recs.map((i: any) => [i.id, i]));
  const gatesFor = (id: string): DbGate[] => {
    const own = byId.get(id);
    if (!own) return [];
    return mergeInheritedGates(own.gates ?? [], own.parentId ? byId.get(own.parentId) : undefined);
  };
  return (r: TapeRow, instrumentId: string, extra: Record<string, unknown> = {}) => {
    const inst = byId.get(instrumentId);
    if (!inst) return undefined;
    const a: Record<string, unknown> = {
      entityCountries: [r.country], borrowerModel: "operating",
    };
    if (r.sector) a.sector = r.sector;
    if (r.ticketBand) a.ticketBand = r.ticketBand;
    Object.assign(a, extra);
    return assessInstrument(
      { ...inst, gates: gatesFor(instrumentId) } as DbInstrument, a as EligibilityAnswers);
  };
}

/** Every value a founder can give for each field the 43 comparators use, so the
 *  sweep can put each comparator in front of an answer that would fire it. */
const SWEEP: Record<string, string[]> = {
  turnoverBand: ["<2M", "2-10M", "10-50M", ">50M"],
  balanceBand: ["<2M", "2-43M", ">43M"],
  cofinancingBand: ["<25%", "25-50%", ">50%"],
  fteBand: ["1-9", "10-49", "50-249", "250+"],
  ticketBand: ["lt25k", "b25k_100k", "b100k_500k", "b500k_2m5", "b2m5_15m", "b15m_50m", "gt50m"],
  ownerOver25: ["yes", "no", "unsure"],
  nonEuControl: ["yes", "no", "unsure"],
  lossesOverHalfCapital: ["yes", "no", "unsure"],
  exclusionFlags: ["none", "insolvency", "losses_over_half_capital", "recovery_order", "sanctions", "tax_arrears"],
  useOfFunds: ["industrial_research", "experimental_development", "feasibility_study",
    "rd_facilities", "ip_protection", "production_capex", "market_launch", "working_capital"],
};
const MULTI = new Set(["exclusionFlags", "useOfFunds"]);
/** The fields THIS instrument's quarantined comparators are keyed to. */
const fieldsFor = new Map<string, string[]>();
for (const c of corrections) {
  const f = (c.current_value_spec as any).field as string;
  const cur = fieldsFor.get(c.instrument_id) ?? [];
  if (!cur.includes(f)) fieldsFor.set(c.instrument_id, [...cur, f]);
}
/** Cartesian product of those fields' vocabularies. */
function assignments(id: string): Record<string, unknown>[] {
  let out: Record<string, unknown>[] = [{}];
  for (const f of fieldsFor.get(id) ?? []) {
    const next: Record<string, unknown>[] = [];
    for (const base of out) {
      for (const v of SWEEP[f] ?? []) next.push({ ...base, [f]: MULTI.has(f) ? [v] : v });
    }
    out = next;
  }
  return out;
}

const before = assessor(records), after = assessor(fixed), arm2 = assessor(translated);
const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
/** The whole assessment, not just the band — a coarse comparison could pass
 *  while the engine quietly evaluated a different number of filters. */
const fingerprint = (a: any) =>
  `${a.status}|checked=${a.checked}|passed=${a.passed}|`
  + a.blockers.map((b: any) => b.field).sort().join(",");

console.log(`population   ${rows.length} founders`);
console.log(`corrections  ${corrections.length} quarantines on ${touched.length} instruments`);
console.log(`             (3 more numeric comparators sit in wsIE's unapplied write)`);

// ── ARM 1: every founder against every corrected instrument ────────────────
const pairB = new Map<string, number>(), pairA = new Map<string, number>();
let pairs = 0, moved = 0, fpMoved = 0;
const movedDetail: string[] = [];
for (const r of rows) {
  for (const id of touched) {
    for (const extra of assignments(id)) {
      const b = before(r, id, extra), a = after(r, id, extra);
      if (!b || !a) continue;
      pairs += 1;
      bump(pairB, b.status); bump(pairA, a.status);
      if (b.status !== a.status) { moved += 1; movedDetail.push(`${r.company} x ${id} ${JSON.stringify(extra)}: ${b.status} -> ${a.status}`); }
      if (fingerprint(b) !== fingerprint(a)) fpMoved += 1;
    }
  }
}
console.log(`\nARM 1 — QUARANTINE THE 43. Every (founder x instrument x band-answer) triple: ${pairs}`);
console.log(`  band fields swept: ${[...new Set(corrections.map((c)=>(c.current_value_spec as any).field))].sort().join(", ")}`);
console.log(`  ${"band".padEnd(14)} ${"before".padStart(8)} ${"after".padStart(8)}`);
for (const k of [...new Set([...pairB.keys(), ...pairA.keys()])].sort()) {
  console.log(`  ${k.padEnd(14)} ${String(pairB.get(k) ?? 0).padStart(8)} ${String(pairA.get(k) ?? 0).padStart(8)}`);
}
console.log(`\n  pairs whose BAND changes                    : ${moved}`);
console.log(`  pairs whose FULL assessment changes         : ${fpMoved}`);
console.log(`     (status + filters checked + filters passed + which fields block)`);
for (const d of movedDetail.slice(0, 20)) console.log(`     ${d}`);

// The won row, for comparability with wsIC and wsIE.
let wonMoved = 0, wonInScope = 0;
for (const r of rows) {
  if (touched.includes(r.won)) wonInScope += 1;
  for (const extra of assignments(r.won)) {
    const b = before(r, r.won, extra), a = after(r, r.won, extra);
    if (!b || !a) continue;
    if (fingerprint(b) !== fingerprint(a)) { wonMoved += 1; break; }
  }
}
console.log(`\n  founders who WON a corrected instrument     : ${wonInScope}`);
console.log(`  of those, whose won row changes at all      : ${wonMoved}`);

// ── ARM 2: the refused translation ─────────────────────────────────────────
const ID = "eis_tugiteenus_ja_arenduskes";
const t2 = new Map<string, number>();
let newlyBlocked = 0, lostOwnWonFund = 0;
const perAnswer = new Map<string, number>();
for (const r of rows) {
  for (const v of SWEEP.turnoverBand) {
    const b = before(r, ID, { turnoverBand: v }), a = arm2(r, ID, { turnoverBand: v });
    if (!b || !a) continue;
    if (b.status !== a.status) {
      bump(t2, `${b.status} -> ${a.status}`);
      bump(perAnswer, v);
      newlyBlocked += 1;
      if (r.won === ID) lostOwnWonFund += 1;
    }
  }
}
console.log(`\nARM 2 — THE REFUSED TRANSLATION on ${ID}`);
console.log(`  turnoverBand numeric_gte 25000000  ->  band_min "10-50M"`);
if (!t2.size) console.log("  no founder moves");
for (const [k, n] of [...t2].sort((x, y) => y[1] - x[1])) console.log(`  ${String(n).padStart(4)}  ${k}`);
console.log(`  founder x turnover-answer pairs obstructed  : ${newlyBlocked} of ${rows.length * 4}`);
console.log(`  by the turnover the founder declares:`);
for (const v of SWEEP.turnoverBand) {
  console.log(`      ${v.padEnd(8)} ${String(perAnswer.get(v) ?? 0).padStart(4)} of ${rows.length} founders newly obstructed`);
}
console.log(`  founders who WON this instrument            : ${rows.filter((r) => r.won === ID).length}`);
console.log(`  of those, who would LOSE their own won fund : ${lostOwnWonFund}`);

console.log("\n`blocked` counts by FIELD, so two gates on one field are ONE obstacle. "
  + "That is why ARM 1 compares whole assessments and not the band alone.");
