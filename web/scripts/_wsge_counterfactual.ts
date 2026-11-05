// wsGE — WHAT THE VER-BLOCKED LOSSES WOULD COST TO RECOVER, ARM BY ARM.
//
// FREE and OFFLINE. It reads the per-founder blocker record `_wsge_attribution
// .ts` wrote and re-decides `assessInstrument`'s status ladder under three
// rules. No corpus, no model, no network — every input is already on disk, so
// the arms can be compared without paying for a second replay.
//
// The three arms, and what each one CLAIMS:
//
//   as-is       one cited structural blocker, OR two blockers of any kind.
//               What ships.
//   by-field    the same ladder, counting DISTINCT INTAKE FIELDS instead of
//               gate rows. Claim: two gates on one field are two encodings of
//               ONE requirement, and a founder cannot fix "ticket band" twice.
//   severity    only a cited structural blocker is conclusive; the arithmetic
//               clause is deleted. This is what verdict.ts's own severity
//               docstring says the rule became ("what makes a failure fatal is
//               not how many friends it has") and is not what the code does.
//
//   npx tsx scripts/_wsge_counterfactual.ts /path/to/attrib.json
import { readFileSync } from "fs";

interface Blocker { field: string; cited: boolean; structural: boolean }
interface Row {
  name: string; instrument: string; country: string; stage: string;
  rule?: string; blockers?: Blocker[];
}

/** `assessInstrument`'s ladder, parameterised on what a "blocker" is counted
 *  as. Kept in one function so the arms cannot drift from each other; the
 *  as-is arm is a transcription of verdict.ts and any divergence between it
 *  and production shows up as an as-is arm that does not reproduce the
 *  measured stage counts. */
function status(bs: Blocker[], arm: "as-is" | "by-field" | "severity"): string {
  if (bs.some((b) => b.cited && b.structural)) return "blocked";
  if (arm === "severity") return bs.length ? "one_blocker" : "open";
  const n = arm === "by-field" ? new Set(bs.map((b) => b.field)).size : bs.length;
  if (n === 0) return "open";
  return n === 1 ? "one_blocker" : "blocked";
}

const file = process.argv[2];
if (!file) { console.error("usage: _wsge_counterfactual.ts <attrib.json>"); process.exit(1); }
const doc = JSON.parse(readFileSync(file, "utf8")) as { n: number; set: string; rows: Row[] };
const rows = doc.rows;
const n = rows.length;
const present = rows.filter((r) => r.stage === "present").length;
const blockedRows = rows.filter((r) => r.stage.startsWith("ver_blocked"));

console.log(`${doc.set}  n=${n}  present as shipped: ${present} (${((100 * present) / n).toFixed(1)}%)`);
console.log(`VER-BLOCKED: ${blockedRows.length} (${((100 * blockedRows.length) / n).toFixed(1)}%)\n`);

for (const arm of ["as-is", "by-field", "severity"] as const) {
  const recovered = blockedRows.filter((r) => status(r.blockers ?? [], arm) !== "blocked");
  const inPool = present + recovered.length;
  console.log(`  ${arm.padEnd(10)} recovers ${String(recovered.length).padStart(4)} of `
    + `${blockedRows.length} blocked  ->  inPoolAtAll ${((100 * inPool) / n).toFixed(1)}%`);
}

// WHY each blocked founder is blocked, so the recoverable share is attributable
// to a named cause rather than to an arm label.
console.log("\n  the blocked, by shape:");
const shapes = new Map<string, number>();
for (const r of blockedRows) {
  const bs = r.blockers ?? [];
  const fields = new Set(bs.map((b) => b.field));
  const shape = bs.some((b) => b.cited && b.structural)
    ? "cited structural filter fails — conclusive under every arm"
    : fields.size === 1
      ? `ONE field encoded ${bs.length}x, all failing — arithmetic only`
      : `${fields.size} distinct fields fail`;
  shapes.set(shape, (shapes.get(shape) ?? 0) + 1);
}
for (const [s, k] of [...shapes].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${String(k).padStart(4)}  ${((100 * k) / n).toFixed(1).padStart(5)}% of all  ${s}`);
}

// WHICH FUND, because a loss concentrated on one instrument is a data defect
// and a loss spread across the corpus is a rule defect. They need different fixes.
console.log("\n  the blocked, by the fund the founder actually won:");
const byInst = new Map<string, number>();
for (const r of blockedRows) byInst.set(r.instrument, (byInst.get(r.instrument) ?? 0) + 1);
for (const [id, k] of [...byInst].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`    ${String(k).padStart(4)}  ${((100 * k) / n).toFixed(1).padStart(5)}%  ${id}`);
}
console.log(`    (${byInst.size} distinct instruments)`);
