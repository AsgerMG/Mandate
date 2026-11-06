// How much of the 29-point sibling gap can a DOOR-level row actually pay?
//
// wsCC measured the ceiling: under full founder information EXACT@5 tops out at
// 66%, and 29 of the missing points are SIBLING INDISTINGUISHABILITY -- leaves
// that share a notified scheme, inherit one rulebook, and differ only in who
// administers them. The owner's response was to change what a ROW is: a row
// becomes "this scheme, via the body that would actually fund you", so that
// showing ANY leaf of the same door counts as showing the founder's answer.
//
// This script asks the arithmetic question that decides whether that works,
// BEFORE any ranking is involved: how many leaves share a door with another
// leaf at all? A door-level row can only pay where two leaves COLLAPSE INTO ONE
// DOOR. If every sibling carries a different body -- which is the very premise
// that made them indistinguishable -- then every door holds exactly one leaf,
// the key is a slower spelling of the id, and the recoverable ceiling is ZERO.
//
// Run: npx tsx scripts/measure_door_recovery.ts
import { Client } from "pg";

import { doorKey, nameableBody, BODY_SHARE_FLOOR } from "../../lib/intelligence/rowIdentity";
import { loadEnvLocal, requireCredentials } from "../loadEnv";

loadEnvLocal();
requireCredentials("measure_door_recovery", ["DATABASE_URL"]);

interface Leaf {
  id: string; parent_id: string | null; scheme_code: string | null;
  administering_body: string | null; administering_body_share: number | null;
  country: string | null;
}

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const { rows } = await db.query<Leaf>(`
    SELECT id, parent_id, scheme_code, administering_body,
           administering_body_share, country
      FROM funding_instruments`);
  await db.end();

  const bearing = (r: Leaf) => ({
    administeringBody: r.administering_body,
    administeringBodyShare: r.administering_body_share == null
      ? null : Number(r.administering_body_share),
    schemeCode: r.scheme_code,
  });

  // Only the leaves a ranker actually has to ORDER: a fund alone in its regime
  // has no sibling to be confused with, so it is not part of the 29 points and
  // must not dilute the denominator.
  const byRegime = new Map<string, Leaf[]>();
  for (const r of rows) {
    const p = r.parent_id ?? r.id;
    const g = byRegime.get(p) ?? [];
    g.push(r);
    byRegime.set(p, g);
  }
  const groups = [...byRegime.values()].filter((g) => g.length > 1);
  const leaves = groups.flat();
  console.log(`corpus ${rows.length} instruments; ` +
    `${groups.length} multi-leaf regimes holding ${leaves.length} leaves\n`);

  // ── 1. Can a body be named at all? ────────────────────────────────────────
  let hasBody = 0, nameable = 0, hasScheme = 0, doorable = 0;
  for (const r of leaves) {
    if (r.administering_body) hasBody++;
    if (nameableBody(bearing(r))) nameable++;
    if (r.scheme_code) hasScheme++;
    if (doorKey(r.id, r.parent_id, bearing(r)).startsWith("door::")) doorable++;
  }
  console.log(`carries an administering_body at all      ${pc(hasBody, leaves.length)}`);
  console.log(`  ...that may be NAMED (share >= ${BODY_SHARE_FLOOR}, not a ministry)  ${pc(nameable, leaves.length)}`);
  console.log(`carries a notified scheme_code            ${pc(hasScheme, leaves.length)}`);
  console.log(`  ...so the door key is a real DOOR       ${pc(doorable, leaves.length)}   <- the reachable population\n`);

  // ── 2. Does the door key MERGE anything? ──────────────────────────────────
  // This is the whole question. A door holding one leaf pays nothing: the
  // founder still has to be shown their exact leaf, and DOOR@5 == EXACT@5.
  const doors = new Map<string, Leaf[]>();
  for (const r of leaves) {
    const k = doorKey(r.id, r.parent_id, bearing(r));
    const g = doors.get(k) ?? [];
    g.push(r);
    doors.set(k, g);
  }
  const realDoors = [...doors.entries()].filter(([k]) => k.startsWith("door::"));
  const merging = realDoors.filter(([, g]) => g.length > 1);
  const mergedLeaves = merging.reduce((a, [, g]) => a + g.length, 0);
  console.log(`doors formed ${realDoors.length}, of which hold MORE THAN ONE leaf: ${merging.length}`);
  console.log(`leaves that share their door with a sibling: ` +
    `${pc(mergedLeaves, leaves.length)}   <- the ONLY leaves a door row can pay on`);
  const sizes = merging.map(([, g]) => g.length).sort((a, b) => b - a);
  console.log(`  largest doors: ${sizes.slice(0, 8).join(", ") || "(none)"}`);
  for (const [k, g] of merging.slice(0, 10)) {
    console.log(`    ${k}  x${g.length}  (${g.map((r) => r.id).slice(0, 3).join(", ")})`);
  }

  // ── 3. What DOES separate siblings, when the door does not? ───────────────
  // If siblings inside one regime carry DIFFERENT bodies, the door key cannot
  // merge them -- and "different body" is precisely the premise that made them
  // indistinguishable to a founder. Reported so the zero above is explained
  // rather than merely stated.
  let sameSchemeDiffBody = 0, sameSchemeSameBody = 0, noScheme = 0;
  for (const g of groups) {
    const bySch = new Map<string, Leaf[]>();
    for (const r of g) {
      if (!r.scheme_code) { noScheme++; continue; }
      const s = bySch.get(r.scheme_code) ?? [];
      s.push(r);
      bySch.set(r.scheme_code, s);
    }
    for (const s of bySch.values()) {
      if (s.length < 2) continue;
      const bodies = new Set(s.map((r) => (r.administering_body ?? "").toLowerCase()));
      if (bodies.size === 1) sameSchemeSameBody += s.length;
      else sameSchemeDiffBody += s.length;
    }
  }
  console.log(`\nWITHIN one notified scheme, leaves sharing that scheme with a sibling:`);
  console.log(`  same scheme, SAME body (a door row merges these)      ${sameSchemeSameBody}`);
  console.log(`  same scheme, DIFFERENT body (a door row keeps these apart) ${sameSchemeDiffBody}`);
  console.log(`  leaves in a multi-leaf regime carrying NO scheme code ${noScheme}`);
}

const pc = (n: number, d: number) => `${String(n).padStart(5)}/${d} (${(100 * n / d).toFixed(1)}%)`;

main();
