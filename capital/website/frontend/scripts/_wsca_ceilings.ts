// wsCA — what a FOUNDER-ANSWERABLE property buys on the sibling-class ceiling.
//
// Same metric, key and population as workstream BY, so the numbers compose with
// its 85.5%: publishable leaves in multi-leaf regimes, residual class under
// `admin_body | delivery_region | eligibility_text`, ceiling@5 = share of leaves
// whose class fits the five rows the product shows.
//
// A facet here is what the FUND DEMANDS on one intake field (its encoded
// comparators), not what the fund funds. A founder who answers that field is
// separated from a sibling only where the siblings demand DIFFERENT things.
import { readFileSync } from "fs";
import { Client } from "pg";
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("wsca_ceilings", ["DATABASE_URL"]);

const PUB = process.env.PUBLISHABLE;
const h = (s: any) => (s ? String(s).trim().toLowerCase().slice(0, 400) : "");

type Row = Record<string, any>;

function ceiling(groups: Row[][], key: (r: Row) => string) {
  const sizes: number[] = [];
  let unique = 0;
  for (const g of groups) {
    const cls = new Map<string, number>();
    for (const r of g) cls.set(key(r), (cls.get(key(r)) ?? 0) + 1);
    for (const r of g) { const n = cls.get(key(r))!; sizes.push(n); if (n === 1) unique++; }
  }
  const n = sizes.length;
  const le = (k: number) => sizes.filter((s) => s <= k).length;
  return { n, mean: sizes.reduce((a, b) => a + b, 0) / n, alone: 100 * unique / n, at5: 100 * le(5) / n };
}

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  const { rows } = await db.query(`
    SELECT id, parent_id, country, administering_body, delivery_region, capital_type,
           award_p50, eligibility_text, sector_mix, scheme_code
      FROM funding_instruments`);
  console.log(`instruments ${rows.length}`);

  let pop = rows;
  if (PUB) {
    const ids = new Set<string>(JSON.parse(readFileSync(PUB, "utf8")).map(String));
    if (ids.size === 0) { console.error("PUBLISHABLE allow-list is EMPTY — refusing to measure nothing"); process.exit(1); }
    pop = rows.filter((r) => ids.has(String(r.id)));
    console.log(`publishable ${pop.length} of ${rows.length}`);
  }

  // Gates, keyed leaf -> field -> sorted distinct decidable specs.
  const g = await db.query(`
    SELECT instrument_id, COALESCE(intake_field_resolved, intake_field) AS f,
           gate_role, value_spec, requirement
      FROM eligibility_gates`);
  const demandVal = new Map<string, Map<string, Set<string>>>();  // decidable spec (MATCHABLE)
  const demandAny = new Map<string, Map<string, Set<string>>>();  // any gate text (PRESENT)
  for (const r of g.rows) {
    const f = r.f ?? "none";
    const id = String(r.instrument_id);
    if (!demandVal.has(id)) { demandVal.set(id, new Map()); demandAny.set(id, new Map()); }
    const mv = demandVal.get(id)!, ma = demandAny.get(id)!;
    if (!mv.has(f)) { mv.set(f, new Set()); ma.set(f, new Set()); }
    ma.get(f)!.add(h(r.requirement));
    if (r.value_spec != null && r.gate_role === "filter") mv.get(f)!.add(JSON.stringify(r.value_spec));
  }
  const sig = (m: Map<string, Map<string, Set<string>>>) => (r: Row, f: string) => {
    const s = m.get(String(r.id))?.get(f);
    return s && s.size ? [...s].sort().join("~") : "";
  };
  const sigVal = sig(demandVal), sigAny = sig(demandAny);

  const byRegime = new Map<string, Row[]>();
  for (const r of pop) {
    const p = r.parent_id ?? r.id;
    (byRegime.get(p) ?? byRegime.set(p, []).get(p)!).push(r);
  }
  const groups = [...byRegime.values()].filter((x) => x.length > 1);
  console.log(`multi-leaf regimes ${groups.length}, holding ${groups.reduce((a, x) => a + x.length, 0)} leaves\n`);

  const base = (r: Row) => h(r.administering_body) + "|" + h(r.delivery_region) + "|" + h(r.eligibility_text);
  const b = ceiling(groups, base);
  console.log(`BASELINE (admin_body | delivery_region | eligibility_text)`);
  console.log(`  mean class ${b.mean.toFixed(2)}   alone ${b.alone.toFixed(1)}%   CEILING@5 ${b.at5.toFixed(1)}%\n`);

  const FIELDS = [...new Set(g.rows.map((r) => r.f ?? "none"))].filter((f) => f !== "none").sort();

  // How many leaves could the field even touch, and how many regimes hold a
  // DISAGREEMENT on it — a field every sibling demands identically cannot separate.
  const report: any[] = [];
  for (const f of FIELDS) {
    let touched = 0, regimesSplit = 0, leavesSplit = 0;
    for (const grp of groups) {
      const vals = new Set(grp.map((r) => sigVal(r, f)));
      const nonEmpty = grp.filter((r) => sigVal(r, f)).length;
      touched += nonEmpty;
      const distinct = new Set([...vals].filter(Boolean));
      if (distinct.size > 1 || (distinct.size === 1 && vals.has(""))) { regimesSplit++; leavesSplit += grp.length; }
    }
    const cv = ceiling(groups, (r) => base(r) + "|" + sigVal(r, f));
    const ca = ceiling(groups, (r) => base(r) + "|" + sigAny(r, f));
    report.push({ f, touched, regimesSplit, leavesSplit, at5: cv.at5, at5any: ca.at5, mean: cv.mean });
  }
  report.sort((x, y) => (y.at5 - x.at5) || (y.at5any - x.at5any));
  console.log("BASELINE + what funds DEMAND on one founder-answerable field");
  console.log("field".padEnd(24) + "leaves".padStart(7) + "regimes".padStart(9) + "  CEIL@5".padStart(9) + "   gain".padStart(8) + "  present-only".padStart(14));
  console.log("".padEnd(24) + "w/ spec".padStart(7) + "split".padStart(9));
  for (const r of report) {
    console.log(String(r.f).padEnd(24) + String(r.touched).padStart(7) + String(r.regimesSplit).padStart(9) +
      `   ${r.at5.toFixed(1)}%`.padStart(9) + `   ${(r.at5 - b.at5 >= 0 ? "+" : "")}${(r.at5 - b.at5).toFixed(1)}`.padStart(8) +
      `        ${r.at5any.toFixed(1)}%`.padStart(14));
  }

  // Corpus-column facets: founder-answerable properties that need no gate at all.
  console.log("\nBASELINE + a founder-answerable property read off the CORPUS");
  const decade = (v: any) => (v ? String(Math.round(Math.log10(Number(v) || 1))) : "");
  const topSector = (r: Row) => {
    const m = r.sector_mix; if (!m || typeof m !== "object") return "";
    const e = Object.entries(m as Record<string, number>).sort((a, c) => Number(c[1]) - Number(a[1]));
    return e.length ? e[0][0] : "";
  };
  const extras: [string, (r: Row) => string][] = [
    ["capital_type (what kind)", (r) => h(r.capital_type)],
    ["award decade (ticket)", (r) => decade(r.award_p50)],
    ["dominant sector", topSector],
    ["scheme_code", (r) => h(r.scheme_code)],
    ["capital + ticket + sector", (r) => h(r.capital_type) + decade(r.award_p50) + topSector(r)],
  ];
  for (const [label, k] of extras) {
    const c = ceiling(groups, (r) => base(r) + "|" + k(r));
    console.log(String(label).padEnd(30) + `CEILING@5 ${c.at5.toFixed(1)}%   gain ${(c.at5 - b.at5 >= 0 ? "+" : "")}${(c.at5 - b.at5).toFixed(1)}`);
  }

  // Everything a founder could answer, at once — the ceiling of the whole intake.
  const allFields = (r: Row) => FIELDS.map((f) => sigVal(r, f)).join("|");
  const cAll = ceiling(groups, (r) => base(r) + "|" + allFields(r));
  console.log(`\nBASELINE + EVERY encoded demand on EVERY intake field at once`);
  console.log(`  mean class ${cAll.mean.toFixed(2)}   CEILING@5 ${cAll.at5.toFixed(1)}%   gain ${(cAll.at5 - b.at5).toFixed(1)}`);
  await db.end();
})();
