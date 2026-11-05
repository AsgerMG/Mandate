/**
 * The blast radius of the two German branch pairs — what publishing them costs,
 * and what quarantining them costs instead.
 *
 * FREE. One committed tape and the committed snapshot, through the product's
 * own verdict engine. No model call, no network, no credential, no write.
 *
 * ── THE ARM STRUCTURE IS DIFFERENT HERE, AND THE REASON MATTERS ───────────
 * wsIC, wsIE and wsIG all priced a correction against what is PUBLISHED. These
 * two comparators are not published: `satr_de_equity [scheme_text_3]` and
 * `satr_de_rnd [scheme_text_2]` are NULL in both the snapshot and Postgres, and
 * hold a comparator only in local SQLite, where a partial `make eligibility`
 * pass wrote one an hour ago. So "what does the correction cost" is the wrong
 * question and would answer zero. The question is what the PENDING PUBLISH
 * costs, and that needs the publish as an arm of its own.
 *
 *   ARM 0  today's production: the committed snapshot, unmodified.
 *   ARM 1  what `make eligibility` would ship: ARM 0 plus the two comparators
 *          the encode pass produced. Read out of SQLite and restated here, so
 *          the harness is reproducible from committed files alone.
 *   ARM 2  the proposal: ARM 1 with all four gates of both pairs quarantined.
 *
 * ARM 0 -> ARM 1 prices doing nothing. ARM 1 -> ARM 2 prices the write.
 * ARM 0 -> ARM 2 is what a founder would actually notice, because ARM 0 is
 * what they see today.
 *
 * ── THE BANDS ARE ANSWERED, OR THE ZERO IS WORTHLESS ──────────────────────
 * wsIG's rule, kept: `evaluateSpec` returns null for an unanswered field just
 * as it does for an operator the field cannot carry, so a harness that leaves
 * turnoverBand and fteBand undefined prints the same zero whether these
 * comparators work perfectly or not at all. Every field the four comparators
 * are keyed to is swept across its whole vocabulary, so if a comparator can
 * fire, some assignment fires it.
 *
 * Nobody in the 897-founder tape won either instrument, so a won-row measure
 * reports nothing. That is a fact about the tape, not about the funds: KfW's
 * ERP-Digitalisierungskredit and ZIM are two of Germany's largest SME
 * programmes. The (founder x instrument x answer) sweep is what can see them.
 *
 *   cd web && npx tsx scripts/_wsih_de_branch_counterfactual.ts
 */
delete process.env.DATABASE_URL;

import { readFileSync } from "fs";
import path from "path";

import { mergeInheritedGates, type DbGate, type DbInstrument } from "../lib/intelligence/corpus";
import type { EligibilityAnswers } from "../lib/intelligence/types";
import { assessInstrument } from "../lib/intelligence/verdict";
import { applyCorrections, loadCorrections, type Correction } from "./gateCorrections";

const SNAPSHOT = path.join("public", "data", "instrument_terms.json");
const PROPOSAL = path.join("..", "capital", "project-mgmt", "evidence",
  "wsih_de_branch_corrections_2026-08-19.jsonl");
const TAPE = path.join("..", "capital", "project-mgmt", "findings",
  "indicative_wsHW", "free.json");

const EQ = "satr_de_equity__sa_111002__kreditanstalt_fur_wiederaufbau";
const RD = "satr_de_rnd__sa_117839__bundesministerium_fur_wirtschaft_und_klimaschutz";

/** What the pending pass put in SQLite and would publish. Restated rather than
 *  read from the DB so this harness runs from committed files alone; the
 *  applier throws if the snapshot does not hold what these claim to replace. */
const PENDING: Correction[] = [
  { instrument_id: EQ, gate_key: "scheme_text_3", action: "publish", clause: "pending_encode",
    current_value_spec: null,
    proposed_value_spec: { op: "band_max", field: "turnoverBand", maxAllowed: "10-50M" } },
  { instrument_id: RD, gate_key: "scheme_text_2", action: "publish", clause: "pending_encode",
    current_value_spec: null,
    proposed_value_spec: { op: "band_max", field: "fteBand", maxAllowed: "250+" } },
];

interface TapeRow {
  company: string; country: string; won: string; sector?: string;
  ticketBand?: string; stratum: string; controlSix: string[]; hitControl: boolean;
}

const records = JSON.parse(readFileSync(path.join(process.cwd(), SNAPSHOT), "utf8")).records ?? [];
const shipped = applyCorrections(records, PENDING);
const proposal = loadCorrections(PROPOSAL);
const quarantined = applyCorrections(shipped, proposal);
const rows: TapeRow[] = JSON.parse(readFileSync(path.join(process.cwd(), TAPE), "utf8")).rows;

function assessor(recs: any[]) {
  const byId = new Map(recs.map((i: any) => [i.id, i]));
  const gatesFor = (id: string): DbGate[] => {
    const own = byId.get(id);
    if (!own) return [];
    return mergeInheritedGates(own.gates ?? [], own.parentId ? byId.get(own.parentId) : undefined);
  };
  return (r: TapeRow, id: string, extra: Record<string, unknown>) => {
    const inst = byId.get(id);
    if (!inst) return undefined;
    const a: Record<string, unknown> = { entityCountries: [r.country], borrowerModel: "operating" };
    if (r.sector) a.sector = r.sector;
    if (r.ticketBand) a.ticketBand = r.ticketBand;
    Object.assign(a, extra);
    return assessInstrument({ ...inst, gates: gatesFor(id) } as DbInstrument, a as EligibilityAnswers);
  };
}

const SWEEP: Record<string, string[]> = {
  turnoverBand: ["<2M", "2-10M", "10-50M", ">50M"],
  balanceBand: ["<2M", "2-43M", ">43M"],
  fteBand: ["1-9", "10-49", "50-249", "250+"],
  consortium: ["yes", "no", "unsure"],
};
/** Both fields of both pairs, plus the two the proposal's reasoning turns on:
 *  balanceBand is the disjunction's other limb, consortium the near-miss branch
 *  selector. Sweeping them is what lets the output say whether either could
 *  have carried the rule. */
const FIELDS: Record<string, string[]> = {
  [EQ]: ["turnoverBand", "balanceBand", "fteBand"],
  [RD]: ["fteBand", "consortium"],
};

function assignments(id: string): Record<string, unknown>[] {
  let out: Record<string, unknown>[] = [{}];
  for (const f of FIELDS[id]) {
    const next: Record<string, unknown>[] = [];
    for (const base of out) for (const v of SWEEP[f]) next.push({ ...base, [f]: v });
    out = next;
  }
  return out;
}

const arm = [assessor(records), assessor(shipped), assessor(quarantined)];
const NAME = ["ARM 0 production", "ARM 1 pending publish", "ARM 2 proposal"];
const fingerprint = (a: any) =>
  `${a.status}|checked=${a.checked}|passed=${a.passed}|`
  + a.blockers.map((b: any) => b.field).sort().join(",");

console.log(`population   ${rows.length} founders x 2 instruments x every band answer`);
console.log(`won-row reach: ${rows.filter((r) => r.won === EQ || r.won === RD).length} founders `
  + `won either fund; ${rows.filter((r) => r.controlSix.includes(EQ) || r.controlSix.includes(RD)).length} `
  + `carry one in our published six\n`);

for (const id of [EQ, RD]) {
  const total = rows.length * assignments(id).length;
  console.log(`===== ${id}`);
  console.log(`      ${assignments(id).length} answer assignments over ${FIELDS[id].join(", ")}  -> ${total} assessments per arm`);
  const bands = [new Map<string, number>(), new Map<string, number>(), new Map<string, number>()];
  const bandMoved = [0, 0, 0], fpMoved = [0, 0, 0];   // 0->1, 1->2, 0->2
  const foundersMoved = [new Set<string>(), new Set<string>(), new Set<string>()];
  const PAIRS: [number, number][] = [[0, 1], [1, 2], [0, 2]];
  for (const r of rows) {
    for (const extra of assignments(id)) {
      const v = arm.map((f) => f(r, id, extra));
      if (v.some((x) => !x)) continue;
      v.forEach((x, i) => bands[i].set(x!.status, (bands[i].get(x!.status) ?? 0) + 1));
      PAIRS.forEach(([x, y], i) => {
        if (v[x]!.status !== v[y]!.status) { bandMoved[i] += 1; foundersMoved[i].add(r.company); }
        if (fingerprint(v[x]) !== fingerprint(v[y])) fpMoved[i] += 1;
      });
    }
  }
  const keys = [...new Set(bands.flatMap((b) => [...b.keys()]))].sort();
  console.log(`      ${"band".padEnd(14)} ${NAME.map((n) => n.padStart(22)).join(" ")}`);
  for (const k of keys) {
    console.log(`      ${k.padEnd(14)} ${bands.map((b) => String(b.get(k) ?? 0).padStart(22)).join(" ")}`);
  }
  // BAND and FINGERPRINT are reported apart on purpose. Adding or removing a
  // comparator always changes `checked`, so the fingerprint moves on every
  // assessment by construction and says only that the arm did something. The
  // BAND is what a founder is shown and what agentSelect.ts is told.
  const label = ["ARM 0 -> ARM 1  doing nothing, then publishing",
                 "ARM 1 -> ARM 2  the write itself             ",
                 "ARM 0 -> ARM 2  what a founder would notice   "];
  for (let i = 0; i < 3; i += 1) {
    console.log(`      ${label[i]} : band ${String(bandMoved[i]).padStart(6)}`
      + `  founders ${String(foundersMoved[i].size).padStart(4)}/${rows.length}`
      + `  (filters checked moved on ${fpMoved[i]})`);
  }
  console.log("");
}

// ── THE THIRD BRANCH CONFLATION, ONE FIELD OVER AND UNFLAGGED ─────────────
// check_gate_branches counts two comparators on ONE field, so it cannot see
// this: satr_de_equity [scheme_text_1] is the ONLY comparator on fteBand, and
// it is `band_max "50-249"` -- an SME headcount ceiling on a fund whose own
// page admits larger mid-caps up to EUR 500M group turnover. Quarantining the
// turnoverBand pair therefore only half-frees the mid-cap branch: the founders
// it stops blocking on turnover are still blocked on headcount. Priced here so
// the number exists, NOT proposed: it is a third gate on a third sentence and
// belongs in its own decision.
{
  const THIRD: Correction[] = [{
    instrument_id: EQ, gate_key: "scheme_text_1", action: "quarantine", clause: "not_proposed",
    current_value_spec: { op: "band_max", field: "fteBand", maxAllowed: "50-249" },
    proposed_value_spec: null }];
  const arm3 = assessor(applyCorrections(quarantined, THIRD));
  let moved = 0, total = 0;
  const b2 = new Map<string, number>(), b3 = new Map<string, number>();
  for (const r of rows) {
    for (const extra of assignments(EQ)) {
      const a = arm[2](r, EQ, extra), c = arm3(r, EQ, extra);
      if (!a || !c) continue;
      total += 1;
      b2.set(a.status, (b2.get(a.status) ?? 0) + 1);
      b3.set(c.status, (b3.get(c.status) ?? 0) + 1);
      if (a.status !== c.status) moved += 1;
    }
  }
  console.log(`NOT PROPOSED, priced only — ${EQ} [scheme_text_1] fteBand <= "50-249"`);
  console.log(`  the SME headcount ceiling that survives ARM 2 and re-blocks the mid-cap branch`);
  for (const k of [...new Set([...b2.keys(), ...b3.keys()])].sort()) {
    console.log(`  ${k.padEnd(14)} ARM 2 ${String(b2.get(k) ?? 0).padStart(7)}`
      + `   also quarantined ${String(b3.get(k) ?? 0).padStart(7)}`);
  }
  console.log(`  band moves on ${moved} of ${total} assessments`);
}
