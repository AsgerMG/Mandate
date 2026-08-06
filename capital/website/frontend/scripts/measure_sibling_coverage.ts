// Manager check: is the "indistinguishable sibling" class really indistinguishable,
// or only indistinguishable on the six facets workstream J happened to read?
//
// J bounded every offer-facet chooser at 27.0% @1 by measuring the size of the
// class of siblings identical on capital type, award magnitude, GBER article,
// registered purpose, encoded gates and closing date. Three recorded columns are
// not among those six -- administering_body, delivery_region and the verbatim
// eligibility_text -- and J also found that one field it trusted had never been
// loaded at all. So the bound is only a bound if these add nothing.
import { readFileSync } from "fs";
import { Client } from "pg";
for (const line of readFileSync("/Users/asgermollergrimberg/Wincent/.env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const h = (s: string | null) => (s ? String(s).trim().toLowerCase().slice(0, 400) : "");

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const { rows } = await db.query(`
    SELECT id, parent_id, country, administering_body, delivery_region,
           capital_type, award_p50, scheme_end_date, is_framework,
           eligibility_text, eligibility_confidence, name
      FROM funding_instruments`);

  const byRegime = new Map<string, any[]>();
  for (const r of rows) {
    const p = r.parent_id ?? r.id;
    (byRegime.get(p) ?? byRegime.set(p, []).get(p)!).push(r);
  }

  // Only the groups the ranker actually has to order.
  const groups = [...byRegime.values()].filter((g) => g.length > 1);
  const leaves = groups.reduce((a, g) => a + g.length, 0);
  console.log(`multi-leaf regimes ${groups.length}, holding ${leaves} leaves\n`);

  // For each candidate discriminator, how far does it cut the group down?
  // "mean class" = the number of siblings a founder is still left choosing
  // between once this field is known. 1.0 would be a perfect chooser.
  const facets: [string, (r: any) => string][] = [
    ["capital_type only", (r) => String(r.capital_type ?? "")],
    ["award magnitude only", (r) => String(r.award_p50 ? Math.round(Math.log10(Number(r.award_p50) || 1)) : "")],
    ["administering_body", (r) => h(r.administering_body)],
    ["delivery_region", (r) => h(r.delivery_region)],
    ["eligibility_text", (r) => h(r.eligibility_text)],
    ["admin_body + delivery_region", (r) => h(r.administering_body) + "|" + h(r.delivery_region)],
    ["ALL THREE J OMITTED", (r) => h(r.administering_body) + "|" + h(r.delivery_region) + "|" + h(r.eligibility_text)],
  ];

  for (const [label, key] of facets) {
    let classSum = 0, unique = 0, present = 0;
    for (const g of groups) {
      const cls = new Map<string, number>();
      for (const r of g) cls.set(key(r), (cls.get(key(r)) ?? 0) + 1);
      for (const r of g) {
        const n = cls.get(key(r))!;
        classSum += n;
        if (n === 1) unique++;
        if (key(r).replace(/\|/g, "")) present++;
      }
    }
    console.log(`${label.padEnd(30)} mean class ${(classSum / leaves).toFixed(1).padStart(6)}` +
      `   uniquely identified ${(100 * unique / leaves).toFixed(0).padStart(3)}%` +
      `   field present ${(100 * present / leaves).toFixed(0).padStart(3)}%`);
  }

  // Coverage of the verbatim text, which is the one that could be extended.
  const withText = rows.filter((r) => r.eligibility_text && String(r.eligibility_text).trim().length > 40);
  console.log(`\neligibility_text over 40 chars: ${withText.length} of ${rows.length} instruments`);
  const byCountry = new Map<string, [number, number]>();
  for (const r of rows) {
    const c = r.country ?? "??";
    const e = byCountry.get(c) ?? [0, 0];
    e[1]++;
    if (r.eligibility_text && String(r.eligibility_text).trim().length > 40) e[0]++;
    byCountry.set(c, e);
  }
  const top = [...byCountry.entries()].sort((a, b) => b[1][1] - a[1][1]).slice(0, 12);
  for (const [c, [w, n]] of top) {
    console.log(`  ${c}  ${String(w).padStart(4)}/${String(n).padStart(4)}  ${(100 * w / n).toFixed(0)}%`);
  }
  await db.end();
}
main();
