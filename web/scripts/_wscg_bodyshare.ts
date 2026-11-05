// wsCG measurement 1: is `administering_body` a nameable DOOR, or a plurality?
//
// The row-identity change turns "SA.111723" into "SA.111723 via Region
// Normandie". That is only honest where the register really says this leaf's
// money was granted by that body. `administering_body` is a MAJORITY VOTE over
// the raw per-award granting authority, so the vote's margin --
// `administering_body_share` -- is the evidence standard, and this prints its
// distribution so a threshold is chosen off the data rather than picked.
//
// Split by whether the leaf sits in a multi-leaf regime, because that is the
// only population where a body-level row can buy anything at all.
import { Client } from "pg";
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("_wscg_bodyshare", ["DATABASE_URL"]);

const MINISTRY = /^(minist\w*|department|departement|dipartimento|direction g[eé]n[eé]rale)\b/i;

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const { rows } = await db.query(`
    SELECT id, parent_id, country, name, administering_body, administering_body_share,
           award_n, is_framework
      FROM funding_instruments`);
  const size = new Map<string, number>();
  for (const r of rows) {
    const p = r.parent_id ?? r.id;
    size.set(p, (size.get(p) ?? 0) + 1);
  }
  const multi = rows.filter((r) => (size.get(r.parent_id ?? r.id) ?? 1) > 1);
  console.log(`instruments ${rows.length}, of which in a multi-leaf regime ${multi.length}`);

  const buckets = [0, 0.25, 0.5, 0.6, 0.75, 0.9, 0.99];
  for (const [label, pop] of [["ALL", rows], ["MULTI-LEAF", multi]] as const) {
    const withBody = pop.filter((r) => r.administering_body);
    const share = withBody.filter((r) => r.administering_body_share != null);
    console.log(`\n${label}: body present ${withBody.length}/${pop.length}` +
      ` (${(100 * withBody.length / pop.length).toFixed(0)}%),` +
      ` share present ${share.length}`);
    for (const b of buckets) {
      const n = share.filter((r) => Number(r.administering_body_share) >= b).length;
      console.log(`  share >= ${b.toFixed(2)}   ${String(n).padStart(4)}` +
        `  ${(100 * n / pop.length).toFixed(0)}% of population`);
    }
    const ministries = withBody.filter((r) => MINISTRY.test(String(r.administering_body)));
    console.log(`  body is a ministry/department (cannot be applied to): ${ministries.length}`);
    // The combination the row rule would actually use.
    for (const t of [0.6, 0.75, 0.9]) {
      const ok = withBody.filter((r) => r.administering_body_share != null
        && Number(r.administering_body_share) >= t
        && !MINISTRY.test(String(r.administering_body)));
      console.log(`  NAMEABLE at share>=${t}: ${ok.length} (${(100 * ok.length / pop.length).toFixed(0)}%)`);
    }
  }

  // How much of the sibling class does the body actually cut, RESTRICTED to
  // leaves where it may be named? A cut measured over bodies we would refuse to
  // print is a cut the product cannot use.
  for (const t of [0, 0.6, 0.75, 0.9]) {
    const key = (r: any) => {
      const b = r.administering_body;
      const s = r.administering_body_share;
      const ok = b && !MINISTRY.test(String(b)) && (t === 0 || (s != null && Number(s) >= t));
      return ok ? String(b).trim().toLowerCase() : `__leaf_${r.id}`;
    };
    const byRegime = new Map<string, any[]>();
    for (const r of multi) {
      const p = r.parent_id ?? r.id;
      (byRegime.get(p) ?? byRegime.set(p, []).get(p)!).push(r);
    }
    let classSum = 0, alone = 0, le5 = 0, n = 0;
    for (const g of byRegime.values()) {
      const cls = new Map<string, number>();
      for (const r of g) cls.set(key(r), (cls.get(key(r)) ?? 0) + 1);
      for (const r of g) {
        const c = cls.get(key(r))!;
        classSum += c; n++;
        if (c === 1) alone++;
        if (c <= 5) le5++;
      }
    }
    console.log(`\nDOOR class, nameable-body threshold ${t}: mean ${(classSum / n).toFixed(1)}` +
      `  alone ${(100 * alone / n).toFixed(0)}%  <=5 ${(100 * le5 / n).toFixed(0)}%`);
  }

  // Regime concentration: is any gain going to come from one programme?
  const byRegimeBodies = new Map<string, Set<string>>();
  for (const r of multi) {
    const p = r.parent_id ?? r.id;
    const b = r.administering_body;
    if (!b || MINISTRY.test(String(b))) continue;
    if (!(Number(r.administering_body_share ?? 0) >= 0.75)) continue;
    (byRegimeBodies.get(p) ?? byRegimeBodies.set(p, new Set()).get(p)!).add(String(b));
  }
  const top = [...byRegimeBodies.entries()].sort((a, b) => b[1].size - a[1].size).slice(0, 12);
  console.log(`\nREGIMES with the most nameable distinct bodies (share>=0.75)`);
  for (const [p, s] of top) {
    console.log(`  ${String(p).padEnd(28)} ${String(s.size).padStart(3)} bodies of ${size.get(p)} leaves`);
  }
  await db.end();
}
main();
