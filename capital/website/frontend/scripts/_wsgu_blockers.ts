// scratch: enumerate the exact gate ROWS behind check_winner_not_gated's blocks
delete process.env.DATABASE_URL;
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { mergeInheritedGates, type DbGate, type DbInstrument } from "../lib/intelligence/corpus";
import type { EligibilityAnswers } from "../lib/intelligence/types";
import type { ValueSpec } from "../lib/intelligence/comparator";
import { assessInstrument } from "../lib/intelligence/verdict";
import { evaluateSpec } from "../lib/intelligence/comparator";
import { isFilter } from "../lib/intelligence/verdict";
import { loadRecallSet, type RecallRow } from "./recallSet";

const snap = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/instrument_terms.json"), "utf8"));
const records: any[] = snap.records ?? [];
const byId = new Map(records.map((i: any) => [i.id, i]));
const gatesFor = (id: string): DbGate[] => {
  const own = byId.get(id);
  if (!own) return [];
  const parent = own.parentId ? byId.get(own.parentId) : undefined;
  return mergeInheritedGates(own.gates ?? [], parent);
};
function answers(r: RecallRow): EligibilityAnswers {
  const a: Record<string, unknown> = { entityCountries: [r.country] };
  if (r.sector) a.sector = r.sector;
  return a as EligibilityAnswers;
}
const { rows } = loadRecallSet("wsgu");
const agg = new Map<string, any>();
let blocked = 0, tested = 0;
for (const r of rows) {
  const inst = byId.get(r.instrument);
  if (!inst) continue;
  const gates = gatesFor(r.instrument);
  const a = assessInstrument({ ...inst, gates } as DbInstrument, answers(r));
  if (a.checked === 0) continue;
  tested++;
  if (a.status !== "blocked") continue;
  blocked++;
  const ans = answers(r) as Record<string, unknown>;
  for (const g of gates as any[]) {
    if (!isFilter(g)) continue;
    const spec = g.valueSpec as ValueSpec | null;
    if (!spec?.field) continue;
    const res = evaluateSpec(spec, ans[spec.field]);
    if (res !== false) continue;
    const key = `${r.instrument}::${g.id}`;
    let e = agg.get(key);
    if (!e) {
      e = { instrument: r.instrument, instName: inst.name, parentId: inst.parentId, gateId: g.id,
        field: spec.field, requirement: g.requirement, quote: g.quote ?? "", valueSpec: spec,
        gateRole: g.gateRole, gateFamily: g.gateFamily, verified: g.verified, verificationLevel: g.verificationLevel,
        borrowed: g.borrowed, intakeField: g.intakeField, intakeFieldResolved: g.intakeFieldResolved,
        owner: (inst.gates ?? []).some((x: any) => x.id === g.id) ? "own" : "inherited",
        pairs: [], sectors: {} };
      agg.set(key, e);
    }
    e.pairs.push(`${r.name} (${r.country}) sector=${r.sector ?? "-"}`);
    const s = r.sector ?? "-";
    e.sectors[s] = (e.sectors[s] ?? 0) + 1;
  }
}
const out = [...agg.values()].sort((a, b) => b.pairs.length - a.pairs.length);
console.log(`tested=${tested} blocked=${blocked} distinct failing gate rows=${out.length}`);
writeFileSync(process.argv[2] ?? "/tmp/wsgu_blockers.json", JSON.stringify(out, null, 1));
for (const e of out) console.log(`${String(e.pairs.length).padStart(4)}  ${e.field.padEnd(16)} ${e.instrument} [${e.gateId}] ${JSON.stringify(e.valueSpec.allowed ?? e.valueSpec.value)} op=${e.valueSpec.op} ${e.owner} | ${e.requirement.slice(0,90)} | SECTORS ${JSON.stringify(e.sectors)}`);
