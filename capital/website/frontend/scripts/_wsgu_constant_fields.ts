delete process.env.DATABASE_URL;
import { readFileSync } from "fs";
import path from "path";
import { evaluateSpec } from "../lib/intelligence/comparator";
import { FIELD_REACH } from "../lib/intelligence/types";
import type { ValueSpec } from "../lib/intelligence/comparator";
import { isFilter, isCited } from "../lib/intelligence/verdict";
import { isStructural } from "../lib/intelligence/verdict";

const snap = JSON.parse(readFileSync(path.join(process.cwd(), "public/data/instrument_terms.json"), "utf8"));
const CONSTANT: Record<string, unknown> = { borrowerModel: "operating" };
let rejects = 0, passes = 0, inert = 0;
const rejectInst = new Set<string>(); const inertInst = new Set<string>();
for (const r of snap.records as any[]) {
  for (const g of r.gates ?? []) {
    const spec = g.valueSpec as ValueSpec | null;
    if (!spec?.field) continue;
    if ((FIELD_REACH as any)[spec.field]?.via !== "constant") continue;
    const res = evaluateSpec(spec, CONSTANT[spec.field]);
    if (res === null) { inert++; inertInst.add(r.id); continue; }
    if (res) { passes++; continue; }
    rejects++; rejectInst.add(r.id);
    console.log(`REJECTS-EVERY-FOUNDER  ${r.id} [${g.id}] role=${g.gateRole} cited=${isCited(g)} filter=${isFilter(g)} structural=${isStructural(spec.field)}`);
    console.log(`   ${JSON.stringify(spec)}`);
    console.log(`   req: ${g.requirement}`);
    console.log(`   quote: ${(g.quote ?? "").slice(0,160)}`);
  }
}
console.log(`\nconstant-field specs: ${rejects} always-false (${rejectInst.size} instruments), ${passes} always-true, ${inert} inert (evaluateSpec null)`);
console.log(`inert instruments: ${[...inertInst].join(", ")}`);
