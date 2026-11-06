// wsCA — the upper bound on ANY new question drawn from what funds demand but
// no intake field asks. Key = the verbatim requirement text of a leaf's
// unmapped filter gates. That is an IDENTITY key, so it is the most generous
// possible reading: it credits a question with separating two leaves whenever
// their requirement strings differ at all, matchable or not.
import { readFileSync } from "fs";
import { Client } from "pg";
import { loadEnvLocal, requireCredentials } from "./loadEnv";
loadEnvLocal();
requireCredentials("wsca_newq", ["DATABASE_URL"]);
const PUB = process.env.PUBLISHABLE;
const h = (s: any) => (s ? String(s).trim().toLowerCase() : "");
type Row = Record<string, any>;
const ceil5 = (groups: Row[][], key: (r: Row) => string) => {
  const sizes: number[] = [];
  for (const g of groups) {
    const cls = new Map<string, number>();
    for (const r of g) cls.set(key(r), (cls.get(key(r)) ?? 0) + 1);
    for (const r of g) sizes.push(cls.get(key(r))!);
  }
  return { at5: 100 * sizes.filter((s) => s <= 5).length / sizes.length,
           mean: sizes.reduce((a, b) => a + b, 0) / sizes.length };
};
(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const { rows } = await db.query(`SELECT id, parent_id, delivery_region FROM funding_instruments`);
  let pop = rows;
  if (PUB) {
    const ids = new Set<string>(JSON.parse(readFileSync(PUB, "utf8")).map(String));
    if (ids.size === 0) { console.error("PUBLISHABLE allow-list is EMPTY — refusing"); process.exit(1); }
    pop = rows.filter((r) => ids.has(String(r.id)));
  }
  const g = await db.query(`SELECT instrument_id, gate_role, requirement,
      COALESCE(intake_field_resolved, intake_field) AS f, value_spec FROM eligibility_gates`);
  const unmapped = new Map<string, Set<string>>(), mapped = new Map<string, Set<string>>();
  for (const r of g.rows) {
    const id = String(r.instrument_id);
    const isUn = r.f == null || r.f === "none";
    const m = isUn ? unmapped : mapped;
    if (!m.has(id)) m.set(id, new Set());
    if (r.gate_role === "filter") m.get(id)!.add(h(r.requirement));
  }
  const sig = (m: Map<string, Set<string>>) => (r: Row) => {
    const s = m.get(String(r.id)); return s && s.size ? [...s].sort().join("~") : "";
  };
  const byRegime = new Map<string, Row[]>();
  for (const r of pop) { const p = r.parent_id ?? r.id; (byRegime.get(p) ?? byRegime.set(p, []).get(p)!).push(r); }
  const groups = [...byRegime.values()].filter((x) => x.length > 1);
  console.log(`multi-leaf regimes ${groups.length}, holding ${groups.reduce((a, x) => a + x.length, 0)} leaves\n`);
  const u = sig(unmapped), m2 = sig(mapped);
  for (const [label, k] of [
    ["nothing asked", () => ""],
    ["every UNMAPPED filter requirement, verbatim", u],
    ["every MAPPED filter requirement, verbatim", m2],
    ["both, verbatim", (r: Row) => u(r) + "|" + m2(r)],
    ["both + region as the corpus records it", (r: Row) => u(r) + "|" + m2(r) + "|" + h(r.delivery_region)],
  ] as [string, (r: Row) => string][]) {
    const c = ceil5(groups, k);
    console.log(String(label).padEnd(44) + `mean ${c.mean.toFixed(2)}`.padStart(12) + `   CEILING@5 ${c.at5.toFixed(1)}%`);
  }
  await db.end();
})();
