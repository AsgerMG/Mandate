// What the guard CANNOT see: production pins borrowerModel='operating'
// (panel.tsx:183). check_winner_not_gated deliberately leaves it undefined.
delete process.env.DATABASE_URL;
import { readFileSync } from "fs";
import path from "path";
import { mergeInheritedGates, type DbGate, type DbInstrument } from "../lib/intelligence/corpus";
import type { EligibilityAnswers } from "../lib/intelligence/types";
import { assessInstrument } from "../lib/intelligence/verdict";
import { loadRecallSet, type RecallRow } from "./recallSet";

const snap = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/instrument_terms.json"), "utf8"));
const records: any[] = snap.records ?? [];
const byId = new Map(records.map((i: any) => [i.id, i]));
const gatesFor = (id: string): DbGate[] => {
  const own = byId.get(id); if (!own) return [];
  return mergeInheritedGates(own.gates ?? [], own.parentId ? byId.get(own.parentId) : undefined);
};
const { rows } = loadRecallSet("wsgu");
function run(withBorrower: boolean) {
  let tested = 0, blocked = 0; const byField = new Map<string, number>(); const insts = new Map<string, number>();
  for (const r of rows as RecallRow[]) {
    const inst = byId.get(r.instrument); if (!inst) continue;
    const a: Record<string, unknown> = { entityCountries: [r.country] };
    if (r.sector) a.sector = r.sector;
    if (withBorrower) a.borrowerModel = "operating";
    const res = assessInstrument({ ...inst, gates: gatesFor(r.instrument) } as DbInstrument, a as EligibilityAnswers);
    if (res.checked === 0) continue;
    tested++;
    if (res.status !== "blocked") continue;
    blocked++;
    for (const b of res.blockers) byField.set(b.field, (byField.get(b.field) ?? 0) + 1);
    insts.set(r.instrument, (insts.get(r.instrument) ?? 0) + 1);
  }
  console.log(`borrowerModel ${withBorrower ? "= 'operating' (PRODUCTION)" : "undefined (the guard)"}: tested=${tested} blocked=${blocked}`);
  console.log(`  by field: ${[...byField].sort((a,b)=>b[1]-a[1]).map(([f,n])=>`${f} ${n}`).join(", ")}`);
  return { tested, blocked, insts };
}
const off = run(false), on = run(true);
console.log(`\nDELTA from the one pinned answer: +${on.blocked - off.blocked} wrongful deletions, ${on.tested - off.tested} more pairs judgeable`);
const gained = [...on.insts].filter(([k, v]) => v > (off.insts.get(k) ?? 0));
for (const [k, v] of gained.sort((a,b)=>b[1]-a[1])) console.log(`  ${k}: ${off.insts.get(k) ?? 0} -> ${v}`);
