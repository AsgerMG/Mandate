// Per-country sibling class, over BOTH populations, read from Postgres.
//
// Why this exists next to measure_sibling_coverage.ts: that script reports one
// global mean class over all 1,014 rows. Two things make it the wrong number to
// steer coverage work by.
//
//  1. The product publishes 721, not 1,014. Frameworks, rows that have children
//     and rows the register says have closed never reach a founder, so text
//     bought for them buys nothing. `publishableInstruments()` in
//     lib/intelligence/corpus.ts is the predicate; this reproduces it in SQL.
//  2. Mean class is a COUNTRY property. FR + ES + SE hold most of the sibling
//     mass, and a global mean hides which country a batch of text actually
//     moved. A workstream that cannot see its own country's number cannot tell
//     a win from a rounding artifact -- which is how a whole France batch got
//     reported as landed while Postgres still read 18%.
//
// Every number printed comes out of Postgres, the store the product reads.
//
// Usage:
//   npx tsx website/frontend/scripts/measure_country_class.ts
//   npx tsx website/frontend/scripts/measure_country_class.ts FR
import { readFileSync } from "fs";
import { Client } from "pg";
import { isClosed, today } from "../lib/intelligence/liveness";
import { hasOfferRoute } from "../lib/intelligence/offerRoute";
for (const line of readFileSync(
  new URL("../../../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const h = (s: string | null) => (s ? String(s).trim().toLowerCase().slice(0, 400) : "");

type Row = {
  id: string; parent_id: string | null; country: string | null;
  administering_body: string | null; delivery_region: string | null;
  eligibility_text: string | null; is_framework: boolean | null;
  scheme_end_date: string | null; scheme_end_date_basis: string | null;
  last_year: number | null; scheme_code: string | null;
  successor_scheme: string | null; route_status: string | null;
};

/** Not a framework, has no children, and not closed -- where a closed row naming
 *  a successor we do not already hold as an open leaf is republished under the
 *  successor's identity rather than dropped.
 *
 *  Liveness itself is IMPORTED, not mirrored. The hand-copy that used to sit
 *  here read a SATR notification expiry as a closure, so this script reported
 *  119 live leaves as unpublishable and steered coverage work by that number. */
function publishable(all: Row[]): Set<string> {
  const hasChildren = new Set(all.map((r) => r.parent_id).filter(Boolean) as string[]);
  const asOf = today();
  const closed = (r: Row) => isClosed({
    schemeEndDate: r.scheme_end_date,
    schemeEndBasis: r.scheme_end_date_basis,
    lastYear: r.last_year,
  }, asOf);
  const liveCodes = new Set(all
    .filter((r) => !r.is_framework && !hasChildren.has(r.id) && !closed(r) && r.scheme_code)
    .map((r) => r.scheme_code as string));
  const out = new Set<string>();
  for (const r of all) {
    if (r.is_framework || hasChildren.has(r.id)) continue;
    // IMPORTED, for the same reason liveness is: a row that is not an offer is
    // withheld on a different axis from a row whose window has shut, and a
    // hand-copy of either is how this script came to report 119 live leaves as
    // unpublishable.
    if (!hasOfferRoute({ routeStatus: r.route_status })) continue;
    const revived = closed(r) && r.successor_scheme && !liveCodes.has(r.successor_scheme);
    if (closed(r) && !revived) continue;
    out.add(r.id);
  }
  return out;
}

/** The class a founder is still choosing between once everything recorded is
 *  known. Computed over the WHOLE regime -- a sibling that is unpublishable
 *  still is not shown, so it cannot be part of the choice -- hence the group is
 *  restricted to the population first, then classed. */
function meanClass(rows: Row[]) {
  const byRegime = new Map<string, Row[]>();
  for (const r of rows) {
    const p = r.parent_id ?? r.id;
    if (!byRegime.has(p)) byRegime.set(p, []);
    byRegime.get(p)!.push(r);
  }
  const groups = [...byRegime.values()].filter((g) => g.length > 1);
  const leaves = groups.reduce((a, g) => a + g.length, 0);
  if (!leaves) return { leaves: 0, groups: 0, all: 0, body: 0, unique: 0 };
  const key = (r: Row) => h(r.administering_body) + "|" + h(r.delivery_region) + "|" + h(r.eligibility_text);
  const bodyKey = (r: Row) => h(r.administering_body);
  let sum = 0, bodySum = 0, unique = 0;
  for (const g of groups) {
    const cls = new Map<string, number>(), bcls = new Map<string, number>();
    for (const r of g) {
      cls.set(key(r), (cls.get(key(r)) ?? 0) + 1);
      bcls.set(bodyKey(r), (bcls.get(bodyKey(r)) ?? 0) + 1);
    }
    for (const r of g) {
      sum += cls.get(key(r))!;
      bodySum += bcls.get(bodyKey(r))!;
      if (cls.get(key(r)) === 1) unique++;
    }
  }
  return { leaves, groups: groups.length, all: sum / leaves, body: bodySum / leaves, unique: 100 * unique / leaves };
}

async function main() {
  const only = process.argv[2]?.toUpperCase();
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const { rows } = await db.query<Row>(`
    SELECT id, parent_id, country, administering_body, delivery_region,
           eligibility_text, is_framework, scheme_end_date,
           scheme_end_date_basis, last_year, scheme_code,
           successor_scheme, route_status
      FROM funding_instruments`);
  await db.end();

  const pub = publishable(rows);
  console.log(`Postgres: ${rows.length} instruments, ${pub.size} publishable\n`);

  const countries = [...new Set(rows.map((r) => r.country ?? "??"))]
    .filter((c) => !only || c === only);

  const line = (label: string, rs: Row[]) => {
    const n = rs.length;
    if (!n) return;
    const withText = rs.filter((r) => (r.eligibility_text ?? "").trim().length > 40).length;
    const m = meanClass(rs);
    console.log(
      `  ${label.padEnd(12)} n ${String(n).padStart(4)}` +
      `   text ${String(withText).padStart(4)}/${String(n).padStart(4)} ${String(Math.round(100 * withText / n)).padStart(3)}%` +
      `   multi-leaf ${String(m.leaves).padStart(4)}` +
      `   class body-only ${m.body.toFixed(1).padStart(5)}` +
      `   class all-facets ${m.all.toFixed(1).padStart(5)}` +
      `   unique ${m.unique.toFixed(0).padStart(3)}%`);
  };

  const ranked = countries
    .map((c) => ({ c, rs: rows.filter((r) => (r.country ?? "??") === c) }))
    .sort((a, b) => b.rs.length - a.rs.length);

  for (const { c, rs } of ranked) {
    console.log(c);
    line("all", rs);
    line("publishable", rs.filter((r) => pub.has(r.id)));
  }
}
main();
