/**
 * What `project-mgmt/evidence/wsgu_gate_encoding_corrections_2026-08-13.jsonl`
 * would do to the gate screen.
 *
 * FREE — no model calls, no network, no credentials. The committed snapshot and
 * the committed answer key, run through the product's own verdict engine.
 *
 * ── Why a counterfactual rather than a measurement ────────────────────────
 * The corrections are a PROPOSAL. Applying them means writing `value_spec` in
 * Railway Postgres, which this workstream may not do, and the two things that
 * report on the gate screen read two different stores:
 *
 *   check_winner_not_gated   the committed snapshot — so a correction shows up
 *                            here only once a publish has regenerated it
 *   npm run stages           Postgres — so it cannot move at all until the
 *                            corrections are applied
 *
 * So this applies them in memory to the snapshot and re-runs exactly what
 * `check_winner_not_gated` runs: the same inheritance rule, the same verdict
 * engine, the same answer key, the same register-derived answers. The delta it
 * prints is what that guard's number becomes on the day the proposal lands,
 * and nothing else.
 *
 * ── And it reports the number the guard cannot see ────────────────────────
 * `check_winner_not_gated` leaves every field it would have to invent
 * undefined, on purpose. `borrowerModel` is not one of those: FIELD_REACH
 * declares it `constant` and panel.tsx pins it to 'operating' for every
 * founder who ever asks. A comparator on it is decided at encode time. So the
 * second pair of rows below supplies it — not an invention, a fact about the
 * product — and the gap between the two pairs is the part of this defect that
 * no guard in the repo currently watches.
 *
 *   cd website/frontend && npx tsx scripts/_wsgu_counterfactual.ts
 */
delete process.env.DATABASE_URL;

import { readFileSync } from "fs";
import path from "path";

import { mergeInheritedGates, type DbGate, type DbInstrument } from "../lib/intelligence/corpus";
import type { EligibilityAnswers } from "../lib/intelligence/types";
import { assessInstrument } from "../lib/intelligence/verdict";
import { applyCorrections, loadCorrections, type Correction } from "./gateCorrections";
import { loadRecallSet, type RecallRow } from "./recallSet";

const SNAPSHOT = path.join("public", "data", "instrument_terms.json");
const CORRECTIONS = path.join("..", "..", "project-mgmt", "evidence",
  "wsgu_gate_encoding_corrections_2026-08-13.jsonl");

function load(): { records: any[]; corrections: Correction[] } {
  const records = JSON.parse(readFileSync(path.join(process.cwd(), SNAPSHOT), "utf8")).records ?? [];
  return { records, corrections: loadCorrections(CORRECTIONS) };
}

const { rows } = loadRecallSet("wsgu counterfactual");

function measure(records: any[], withPinnedConstant: boolean) {
  const byId = new Map(records.map((i: any) => [i.id, i]));
  const gatesFor = (id: string): DbGate[] => {
    const own = byId.get(id);
    if (!own) return [];
    return mergeInheritedGates(own.gates ?? [], own.parentId ? byId.get(own.parentId) : undefined);
  };
  let tested = 0, blocked = 0;
  const byField = new Map<string, number>();
  const byInstrument = new Map<string, number>();
  for (const r of rows as RecallRow[]) {
    const inst = byId.get(r.instrument);
    if (!inst) continue;
    const a: Record<string, unknown> = { entityCountries: [r.country] };
    if (r.sector) a.sector = r.sector;
    if (withPinnedConstant) a.borrowerModel = "operating";
    const res = assessInstrument(
      { ...inst, gates: gatesFor(r.instrument) } as DbInstrument, a as EligibilityAnswers);
    if (res.checked === 0) continue;
    tested += 1;
    if (res.status !== "blocked") continue;
    blocked += 1;
    for (const b of res.blockers) byField.set(b.field, (byField.get(b.field) ?? 0) + 1);
    byInstrument.set(r.instrument, (byInstrument.get(r.instrument) ?? 0) + 1);
  }
  return { tested, blocked, byField, byInstrument };
}

function line(label: string, m: ReturnType<typeof measure>) {
  const pct = m.tested ? ((100 * m.blocked) / m.tested).toFixed(1) : "n/a";
  console.log(`  ${label.padEnd(34)} ${String(m.blocked).padStart(4)} of ${m.tested} (${pct}%)`
    + `   ${[...m.byField].sort((a, b) => b[1] - a[1]).map(([f, n]) => `${f} ${n}`).join(", ")}`);
}

function main() {
  const { records, corrections } = load();
  const fixed = applyCorrections(records, corrections);
  const byAction = new Map<string, number>();
  const byClause = new Map<string, number>();
  for (const c of corrections) {
    byAction.set(c.action, (byAction.get(c.action) ?? 0) + 1);
    byClause.set(c.clause, (byClause.get(c.clause) ?? 0) + 1);
  }
  console.log(`${corrections.length} corrections applied in memory to ${SNAPSHOT}`);
  console.log(`  by action: ${[...byAction].map(([k, n]) => `${k} ${n}`).join(", ")}`);
  console.log(`  by clause: ${[...byClause].map(([k, n]) => `${k} ${n}`).join(", ")}\n`);

  console.log(`VERIFIED WINNERS THE GATE SCREEN DELETES — ${rows.length.toLocaleString()} pairs`);
  const a = measure(records, false), b = measure(fixed, false);
  line("as check_winner_not_gated runs", a);
  line("  ... with the corrections", b);
  const c = measure(records, true), dd = measure(fixed, true);
  line("with borrowerModel pinned", c);
  line("  ... with the corrections", dd);

  console.log(`\n  the guard's own number:      ${a.blocked} -> ${b.blocked}  `
    + `(ceiling 207, ${b.blocked <= 207 ? "REACHED" : `${b.blocked - 207} short`})`);
  console.log(`  what a founder really sees:  ${c.blocked} -> ${dd.blocked}`);

  console.log(`\nWHAT REMAINS, by instrument (corrections applied, guard's answers):`);
  const residue = [...b.byInstrument].sort((x, y) => y[1] - x[1]);
  for (const [id, n] of residue.slice(0, 30)) console.log(`  ${String(n).padStart(4)}  ${id}`);
  if (residue.length > 30) console.log(`  ... and ${residue.length - 30} more instruments`);
}

main();
