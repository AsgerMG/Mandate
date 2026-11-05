// wsCA — the FOUNDER-SIDE ceiling.
//
// wsBY's 85.5% keys on `eligibility_text`, and every encoded gate is EXTRACTED
// from that text, so conditioning on it absorbs in advance everything a gate
// could add. That is why all 23 intake fields measure +0.0 there: the same
// tautology wsBY hit with the SA number, one level in.
//
// The founder never sees the eligibility text. So the ceiling that bounds a
// QUESTION is the class of siblings that remain indistinguishable given only
// what a founder can state about themselves. Baseline here is therefore
// "nothing asked" — the whole regime — and each facet is what the funds DEMAND
// on one intake field, which is what a founder's answer can be tested against.
//
// MATCHABLE = the leaf carries a decidable `filter` comparator on that field.
// PRESENT   = the leaf merely carries some gate mentioning it (wsAO's null model).
import { readFileSync } from "fs";
import { Client } from "pg";
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("wsca_founder", ["DATABASE_URL"]);
const PUB = process.env.PUBLISHABLE;
const h = (s: any) => (s ? String(s).trim().toLowerCase().slice(0, 400) : "");
type Row = Record<string, any>;

function ceiling(groups: Row[][], key: (r: Row) => string) {
  const sizes: number[] = []; let unique = 0;
  for (const g of groups) {
    const cls = new Map<string, number>();
    for (const r of g) cls.set(key(r), (cls.get(key(r)) ?? 0) + 1);
    for (const r of g) { const n = cls.get(key(r))!; sizes.push(n); if (n === 1) unique++; }
  }
  const n = sizes.length;
  return { n, mean: sizes.reduce((a, b) => a + b, 0) / n, alone: 100 * unique / n,
           at5: 100 * sizes.filter((s) => s <= 5).length / n };
}

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const { rows } = await db.query(`
    SELECT id, parent_id, country, administering_body, delivery_region, capital_type,
           award_p50, eligibility_text, sector_mix, catchment_regions FROM funding_instruments`);
  let pop = rows;
  if (PUB) {
    const ids = new Set<string>(JSON.parse(readFileSync(PUB, "utf8")).map(String));
    if (ids.size === 0) { console.error("PUBLISHABLE allow-list is EMPTY — refusing to measure nothing"); process.exit(1); }
    pop = rows.filter((r) => ids.has(String(r.id)));
  }
  console.log(`instruments ${rows.length}, population ${pop.length}`);

  const g = await db.query(`SELECT instrument_id, COALESCE(intake_field_resolved, intake_field) AS f,
                                   gate_role, value_spec, requirement FROM eligibility_gates`);
  const val = new Map<string, Map<string, Set<string>>>();
  const any = new Map<string, Map<string, Set<string>>>();
  for (const r of g.rows) {
    const f = r.f ?? "none", id = String(r.instrument_id);
    if (!val.has(id)) { val.set(id, new Map()); any.set(id, new Map()); }
    for (const m of [val, any]) if (!m.get(id)!.has(f)) m.get(id)!.set(f, new Set());
    any.get(id)!.get(f)!.add(h(r.requirement));
    if (r.value_spec != null && r.gate_role === "filter") val.get(id)!.get(f)!.add(JSON.stringify(r.value_spec));
  }
  const mk = (m: Map<string, Map<string, Set<string>>>) => (r: Row, f: string) => {
    const s = m.get(String(r.id))?.get(f); return s && s.size ? [...s].sort().join("~") : "";
  };
  const sigVal = mk(val), sigAny = mk(any);

  const byRegime = new Map<string, Row[]>();
  for (const r of pop) { const p = r.parent_id ?? r.id; (byRegime.get(p) ?? byRegime.set(p, []).get(p)!).push(r); }
  const groups = [...byRegime.values()].filter((x) => x.length > 1);
  console.log(`multi-leaf regimes ${groups.length}, holding ${groups.reduce((a, x) => a + x.length, 0)} leaves\n`);

  const b = ceiling(groups, () => "");
  console.log(`NOTHING ASKED (today): mean class ${b.mean.toFixed(2)}   alone ${b.alone.toFixed(1)}%   CEILING@5 ${b.at5.toFixed(1)}%\n`);

  const FIELDS = [...new Set(g.rows.map((r) => r.f ?? "none"))].filter((f) => f !== "none").sort();
  const rep: any[] = [];
  for (const f of FIELDS) {
    const cv = ceiling(groups, (r) => sigVal(r, f));
    const ca = ceiling(groups, (r) => sigAny(r, f));
    rep.push({ f, at5: cv.at5, at5any: ca.at5, mean: cv.mean });
  }
  // The one property with a precedent: region, as the corpus records it.
  const geo: [string, (r: Row) => string][] = [
    ["[corpus] delivery_region", (r) => h(r.delivery_region)],
    ["[corpus] catchment_regions", (r) => h(r.catchment_regions)],
    ["[corpus] administering_body", (r) => h(r.administering_body)],
    ["[corpus] capital_type", (r) => h(r.capital_type)],
    ["[corpus] award decade", (r) => (r.award_p50 ? String(Math.round(Math.log10(Number(r.award_p50) || 1))) : "")],
  ];
  for (const [f, k] of geo) { const c = ceiling(groups, k); rep.push({ f, at5: c.at5, at5any: c.at5, mean: c.mean }); }
  rep.sort((x, y) => y.at5 - x.at5);

  console.log("ONE property known, nothing else — the ceiling a single question could reach");
  console.log("property".padEnd(28) + "mean cls".padStart(9) + "  CEIL@5 (matchable)".padStart(21) + "   present-only".padStart(16));
  for (const r of rep) console.log(String(r.f).padEnd(28) + r.mean.toFixed(2).padStart(9) +
    `   ${r.at5.toFixed(1)}%`.padStart(21) + `   ${r.at5any.toFixed(1)}%`.padStart(16));

  const allF = (r: Row) => FIELDS.map((f) => sigVal(r, f)).join("|");
  const cAll = ceiling(groups, allF);
  const cAllGeo = ceiling(groups, (r) => allF(r) + "|" + h(r.delivery_region) + h(r.capital_type));
  console.log(`\nEVERY intake field answered perfectly, at once:  mean ${cAll.mean.toFixed(2)}   CEILING@5 ${cAll.at5.toFixed(1)}%`);
  console.log(`  + region + capital type off the corpus:       mean ${cAllGeo.mean.toFixed(2)}   CEILING@5 ${cAllGeo.at5.toFixed(1)}%`);
  console.log(`\nfor reference, the IDENTITY ceiling (adds verbatim eligibility_text, which no founder can state): 85.5%`);
  await db.end();
})();
