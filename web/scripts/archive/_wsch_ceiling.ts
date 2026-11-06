// wsCH — STEP 2: what does knowing ORGANISATION TYPE buy, in residual sibling
// class and in CEILING@5?
//
// Keyed exactly as `_wscc_ceiling.ts` keys its arms — same population, same
// `specKey` over the six shipped fields, same geography suffix — so the numbers
// here compose with the standing figures (40.0 today, 43.1 with every mapped
// field answered perfectly, ~66 under a full founder profile) rather than
// forming a fourth incompatible scale.
//
// ── THE FAILURE MODE THIS FILE IS BUILT TO EXPOSE ─────────────────────────
// A candidate question scored +1.7 of ceiling here once and was rejected,
// because the +1.7 was seven leaves inside ONE regime: a question that helps
// exactly one fund family is a patch with a metric's face on. So every arm
// prints the number of DISTINCT REGIMES the gained leaves fall in and the share
// held by the largest of them, beside the gain, and neither is optional.
//
// FREE. No model calls.
//
// Run from web:
//   PUBLISHABLE=/tmp/pub.json npx tsx scripts/_wsch_ceiling.ts
import { readFileSync } from "fs";
import { Client } from "pg";
import { loadEnvLocal, requireCredentials } from "../loadEnv";
import { loadGates, readPub, type GateRow } from "./_wscc_demand";
import { detect } from "./_wsch_derive";

loadEnvLocal();
requireCredentials("wsch_ceiling", ["DATABASE_URL"]);
const h = (s: unknown) => (s ? String(s).trim().toLowerCase().slice(0, 400) : "");
type Row = Record<string, unknown>;

function ceil5(groups: Row[][], key: (r: Row) => string) {
  const cls: { r: Row; n: number }[] = [];
  for (const g of groups) {
    const c = new Map<string, number>();
    for (const r of g) c.set(key(r), (c.get(key(r)) ?? 0) + 1);
    for (const r of g) cls.push({ r, n: c.get(key(r))! });
  }
  return {
    at5: (100 * cls.filter((x) => x.n <= 5).length) / cls.length,
    at1: (100 * cls.filter((x) => x.n === 1).length) / cls.length,
    mean: cls.reduce((a, x) => a + x.n, 0) / cls.length,
    fits: new Set(cls.filter((x) => x.n <= 5).map((x) => String(x.r.id))),
  };
}

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const ids = readPub();
  const { rows } = await db.query(
    `SELECT id, parent_id, delivery_region, capital_type FROM funding_instruments`);
  const pop = ids ? rows.filter((r) => ids.has(String(r.id))) : rows;
  const parentOf = new Map<string, string>(rows.map((r) => [String(r.id), String(r.parent_id ?? r.id)]));

  const all = await loadGates(db, ids);
  const filters = all.filter((r) => r.role === "filter");

  const byRegime = new Map<string, Row[]>();
  for (const r of pop) { const p = String(r.parent_id ?? r.id); (byRegime.get(p) ?? byRegime.set(p, []).get(p)!).push(r); }
  const groups = [...byRegime.values()].filter((x) => x.length > 1);
  const leaves = groups.reduce((a, x) => a + x.length, 0);
  console.log(`publishable ${pop.length}; multi-leaf regimes ${groups.length}; leaves ${leaves}; filter gates ${filters.length}\n`);

  // ── the shipped comparators, keyed as wsCA/wsCC key them ─────────────────
  const specKey = (fields: string[] | null) => {
    const per = new Map<string, Map<string, Set<string>>>();
    for (const r of filters) {
      if (r.spec == null) continue;
      if (fields && !fields.includes(r.field)) continue;
      if (!per.has(r.iid)) per.set(r.iid, new Map());
      const m = per.get(r.iid)!;
      (m.get(r.field) ?? m.set(r.field, new Set()).get(r.field)!).add(r.spec);
    }
    const fs = fields ?? [...new Set(filters.map((r) => r.field))].sort();
    return (row: Row) => fs.map((f) => {
      const s = per.get(String(row.id))?.get(f);
      return s && s.size ? [...s].sort().join("~") : "";
    }).join("|");
  };

  // ── the ORGANISATION-TYPE answer, as a perfect answer would separate ─────
  // A leaf's organisation-type signature is the SET OF KINDS it admits. Two
  // siblings are separated by the question exactly when those sets differ, and
  // a founder of a given kind is admitted by one and not the other. Nothing
  // here reads a fund name; the sets come from the gate text via the derived
  // property in _wsch_derive.ts.
  const orgOf = new Map<string, Set<string>>();
  for (const r of filters) {
    const d = detect(r.requirement);
    if (!d.types.size) continue;
    const s = orgOf.get(r.iid) ?? orgOf.set(r.iid, new Set()).get(r.iid)!;
    for (const k of d.types) s.add(k);
  }
  const orgKey = (row: Row) => {
    const s = orgOf.get(String(row.id));
    return s ? [...s].sort().join("+") : "";
  };
  // The SIZE control. wsCA read this same demand bucket as SME status and
  // mapped it to fteBand; if the gain below were really size, this arm would
  // carry it. It is printed so the claim is falsifiable rather than asserted.
  const sizeOf = new Map<string, boolean>();
  for (const r of filters) {
    const d = detect(r.requirement);
    if (d.sizeOnly) sizeOf.set(r.iid, true);
  }
  const sizeKey = (row: Row) => (sizeOf.get(String(row.id)) ? "size" : "");

  const SIX = ["ticketBand", "sector", "useOfFunds", "region", "consortium", "entityCountries"];
  const six = specKey(SIX);
  const allSpec = specKey(null);
  const geo = (r: Row) => h(r.delivery_region);
  const geoCap = (r: Row) => h(r.delivery_region) + "|" + h(r.capital_type);

  const arms: [string, (r: Row) => string][] = [
    ["nothing asked", () => ""],
    ["TODAY: the six fields that already rank", (r) => six(r) + "|" + geo(r)],
    ["TODAY + size-only demand (the wsCA reading)", (r) => six(r) + "|" + geo(r) + "|" + sizeKey(r)],
    ["TODAY + ORGANISATION TYPE", (r) => six(r) + "|" + geo(r) + "|" + orgKey(r)],
    ["every mapped field's comparator (43.1 arm)", (r) => allSpec(r) + "|" + geoCap(r)],
    ["every mapped field + ORGANISATION TYPE", (r) => allSpec(r) + "|" + geoCap(r) + "|" + orgKey(r)],
  ];

  const base = ceil5(groups, arms[1][1]);
  console.log("arm".padEnd(46) + "mean".padStart(7) + "alone".padStart(8) + "CEIL@5".padStart(9) +
    "gain".padStart(7) + "regimes".padStart(9) + "top share".padStart(11));
  for (const [label, key] of arms) {
    const c = ceil5(groups, key);
    const gained = [...c.fits].filter((id) => !base.fits.has(id));
    const byReg = new Map<string, number>();
    for (const id of gained) { const p = parentOf.get(id)!; byReg.set(p, (byReg.get(p) ?? 0) + 1); }
    const top = [...byReg].sort((a, b) => b[1] - a[1])[0];
    console.log(label.padEnd(46) + c.mean.toFixed(2).padStart(7) + `${c.at1.toFixed(1)}%`.padStart(8) +
      `${c.at5.toFixed(1)}%`.padStart(9) +
      `${c.at5 - base.at5 >= 0 ? "+" : ""}${(c.at5 - base.at5).toFixed(1)}`.padStart(7) +
      String(byReg.size).padStart(9) +
      (top && gained.length ? `${Math.round(100 * top[1] / gained.length)}%` : "-").padStart(11));
  }

  // ── sibling class, the other half of the brief's question ────────────────
  console.log("\nRESIDUAL SIBLING CLASS (how many funds a founder is still choosing between)");
  for (const [label, key] of [arms[1], arms[3]] as [string, (r: Row) => string][]) {
    const sizes: number[] = [];
    for (const g of groups) {
      const c = new Map<string, number>();
      for (const r of g) c.set(key(r), (c.get(key(r)) ?? 0) + 1);
      for (const r of g) sizes.push(c.get(key(r))!);
    }
    const n = sizes.length, le = (k: number) => sizes.filter((s) => s <= k).length;
    console.log(`  ${label.padEnd(44)} mean ${(sizes.reduce((a, b) => a + b, 0) / n).toFixed(2)}` +
      `   <=1 ${(100 * le(1) / n).toFixed(0)}%   <=3 ${(100 * le(3) / n).toFixed(0)}%   <=5 ${(100 * le(5) / n).toFixed(0)}%`);
  }

  // ── which regimes the org-type answer actually splits ────────────────────
  let split = 0;
  const splitLeaves: number[] = [];
  for (const g of groups) {
    const sig = new Set(g.map(orgKey));
    if (sig.size > 1) { split++; splitLeaves.push(g.length); }
  }
  console.log(`\nregimes whose siblings demand DIFFERENT organisation types: ${split} of ${groups.length}` +
    ` (${splitLeaves.reduce((a, b) => a + b, 0)} leaves)`);
  const covered = pop.filter((r) => orgOf.has(String(r.id))).length;
  console.log(`publishable instruments carrying an organisation-type demand: ${covered} of ${pop.length}` +
    ` (${(100 * covered / pop.length).toFixed(0)}%)`);

  await db.end();
})();
