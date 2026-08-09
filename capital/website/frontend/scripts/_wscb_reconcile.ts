// wsCB — reconcile the two "unencoded" populations the brief puts side by side:
//   1,855 filter gates with a NULL value_spec   (counted whole-corpus)
//     406 unmapped-AND-filter gates             (wsCA, publishable only)
// and say which is the real encoding target.
import { readFileSync } from "fs";
import { Client } from "pg";
import { loadEnvLocal, requireCredentials } from "./loadEnv";
loadEnvLocal();
requireCredentials("wscb_reconcile", ["DATABASE_URL"]);
const PUB = process.env.PUBLISHABLE;

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const ids = PUB ? new Set<string>(JSON.parse(readFileSync(PUB, "utf8")).map(String)) : null;
  if (ids && ids.size === 0) { console.error("PUBLISHABLE allow-list is EMPTY — refusing"); process.exit(1); }

  const fi = await db.query(`SELECT id, parent_id FROM funding_instruments`);
  const parent = new Map<string, string>();
  for (const r of fi.rows) parent.set(String(r.id), String(r.parent_id ?? r.id));
  console.log(`instruments ${fi.rows.length}; publishable allow-list ${ids ? ids.size : "(none)"}`);

  const g = await db.query(`
    SELECT eg.id, eg.instrument_id, eg.gate_key, eg.gate_role, eg.requirement,
           eg.value_spec, eg.intake_field, eg.intake_field_resolved
      FROM eligibility_gates eg`);
  const all = g.rows.map((r) => ({
    ...r,
    iid: String(r.instrument_id),
    field: (r.intake_field_resolved ?? r.intake_field ?? "none") as string,
    pub: ids ? ids.has(String(r.instrument_id)) : true,
  }));
  console.log(`gates total ${all.length}`);

  const isFilter = (r: any) => r.gate_role === "filter" || r.gate_role == null;
  const roleFilter = (r: any) => r.gate_role === "filter";
  const mapped = (r: any) => r.field !== "none" && r.field !== null;
  const nullSpec = (r: any) => r.value_spec == null;

  const cells = [
    ["ALL gates", (r: any) => true],
    ["gate_role='filter'", roleFilter],
    ["filter (incl. NULL role, which isFilter() admits)", isFilter],
    ["filter AND value_spec IS NULL", (r: any) => roleFilter(r) && nullSpec(r)],
    ["filter AND value_spec IS NULL AND mapped field", (r: any) => roleFilter(r) && nullSpec(r) && mapped(r)],
    ["filter AND value_spec IS NULL AND UNmapped", (r: any) => roleFilter(r) && nullSpec(r) && !mapped(r)],
    ["filter AND value_spec NOT NULL", (r: any) => roleFilter(r) && !nullSpec(r)],
    ["filter AND value_spec NOT NULL AND mapped", (r: any) => roleFilter(r) && !nullSpec(r) && mapped(r)],
  ] as const;

  console.log("\npopulation".padEnd(52) + "whole corpus".padStart(14) + "publishable".padStart(14) +
              "pub multi-leaf".padStart(16));
  const bySize = new Map<string, number>();
  for (const r of fi.rows) { const p = String(r.parent_id ?? r.id); bySize.set(p, (bySize.get(p) ?? 0) + 1); }
  const pubLeafOfMulti = (r: any) => r.pub && (bySize.get(parent.get(r.iid) ?? "") ?? 0) > 1;

  for (const [label, pred] of cells) {
    const a = all.filter(pred as any);
    console.log(String(label).padEnd(52) +
      String(a.length).padStart(14) +
      String(a.filter((r) => r.pub).length).padStart(14) +
      String(a.filter(pubLeafOfMulti).length).padStart(16));
  }

  // Which fields do the NULL-spec filters claim?
  console.log("\n--- filter gates with NULL value_spec, by resolved intake_field (publishable) ---");
  const byField = new Map<string, { n: number; inst: Set<string>; multi: number }>();
  for (const r of all.filter((r) => roleFilter(r) && nullSpec(r) && r.pub)) {
    const e = byField.get(r.field) ?? { n: 0, inst: new Set<string>(), multi: 0 };
    e.n++; e.inst.add(r.iid); if (pubLeafOfMulti(r)) e.multi++;
    byField.set(r.field, e);
  }
  console.log("field".padEnd(24) + "gates".padStart(8) + "instruments".padStart(13) + "in multi-leaf".padStart(15));
  for (const [f, e] of [...byField].sort((a, b) => b[1].n - a[1].n)) {
    console.log(String(f).padEnd(24) + String(e.n).padStart(8) + String(e.inst.size).padStart(13) + String(e.multi).padStart(15));
  }

  // And the mapped-with-spec baseline, for contrast: what IS encoded today.
  console.log("\n--- filter gates WITH a value_spec, by field (publishable) ---");
  const byField2 = new Map<string, { n: number; inst: Set<string> }>();
  for (const r of all.filter((r) => roleFilter(r) && !nullSpec(r) && r.pub)) {
    const e = byField2.get(r.field) ?? { n: 0, inst: new Set<string>() };
    e.n++; e.inst.add(r.iid); byField2.set(r.field, e);
  }
  console.log("field".padEnd(24) + "gates".padStart(8) + "instruments".padStart(13));
  for (const [f, e] of [...byField2].sort((a, b) => b[1].n - a[1].n)) {
    console.log(String(f).padEnd(24) + String(e.n).padStart(8) + String(e.inst.size).padStart(13));
  }

  // Role census, since NULL role is admitted as a filter by the product.
  console.log("\n--- gate_role census (publishable) ---");
  const byRole = new Map<string, number>();
  for (const r of all.filter((r) => r.pub)) byRole.set(String(r.gate_role), (byRole.get(String(r.gate_role)) ?? 0) + 1);
  for (const [k, v] of [...byRole].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(6)}  ${k}`);

  await db.end();
})();
