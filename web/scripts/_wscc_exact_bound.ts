// wsCC — translate the ceiling into the metric the owner set the target on.
//
// CEILING@5 above is measured over the 605 publishable leaves that sit in a
// multi-leaf regime, each counted once. EXACT@5 is measured over recall-set
// PAIRS, where a fund that wins often is counted often and a fund with no
// siblings is trivially alone. The two are not the same number and must not be
// quoted against each other without this step.
//
// So: re-weight the same residual-class key by how often each fund is actually
// the answer, and read the EXACT@5 upper bound straight off it.
//
//   EXACT@5 <= P(won fund is in the pool) x P(its residual class fits in five)
//
// The first factor is measured by the shipped harness (`check_recall_floor`)
// and is quoted, not re-derived. The second is what this file computes.
//
// No model calls. No rule here names a fund, a country or a sector.
import { readFileSync } from "fs";
import { Client } from "pg";
import { loadEnvLocal, requireCredentials } from "./loadEnv";
import { canopy, loadGates, readPub, type GateRow } from "./_wscc_demand";

loadEnvLocal();
requireCredentials("wscc_exact_bound", ["DATABASE_URL"]);
const TAU = Number(process.env.TAU ?? 0.72);
const LABELS = process.env.LABELS;
const SET = process.env.RECALL_SET ?? "lib/intelligence/__recallSetDoors.json";
const SPLIT = process.env.SPLIT ?? "";
/** Pool rate from the shipped floor harness, quoted rather than re-derived. */
const POOL = Number(process.env.POOL_RATE ?? 0.93);
const h = (s: any) => (s ? String(s).trim().toLowerCase().slice(0, 400) : "");

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const ids = readPub();
  const { rows } = await db.query(
    `SELECT id, parent_id, delivery_region, capital_type, eligibility_text FROM funding_instruments`);
  const pop = ids ? rows.filter((r) => ids.has(String(r.id))) : rows;
  const all = await loadGates(db, ids);
  await db.end();
  const filters = all.filter((r) => r.role === "filter");
  const cid = canopy(filters, TAU);
  const clusterOf = new Map<GateRow, number>();
  filters.forEach((r, i) => clusterOf.set(r, cid[i]));
  const labels: Record<string, string> | null = LABELS ? JSON.parse(readFileSync(LABELS, "utf8")) : null;

  const byRegime = new Map<string, any[]>();
  for (const r of pop) { const p = String(r.parent_id ?? r.id); (byRegime.get(p) ?? byRegime.set(p, []).get(p)!).push(r); }

  const demandKey = (pick: (r: GateRow) => boolean) => {
    const per = new Map<string, Set<number>>();
    for (const r of filters) {
      if (!pick(r)) continue;
      (per.get(r.iid) ?? per.set(r.iid, new Set()).get(r.iid)!).add(clusterOf.get(r)!);
    }
    return (row: any) => {
      const s = per.get(String(row.id));
      return (s ? [...s].sort((a, b) => a - b).join(",") : "") + "|" + h(row.delivery_region) + "|" + h(row.capital_type);
    };
  };
  const specKey = (fields: string[]) => {
    const per = new Map<string, Map<string, Set<string>>>();
    for (const r of filters) {
      if (r.spec == null || !fields.includes(r.field)) continue;
      if (!per.has(r.iid)) per.set(r.iid, new Map());
      const m = per.get(r.iid)!;
      (m.get(r.field) ?? m.set(r.field, new Set()).get(r.field)!).add(r.spec);
    }
    return (row: any) => fields.map((f) => {
      const s = per.get(String(row.id))?.get(f);
      return s && s.size ? [...s].sort().join("~") : "";
    }).join("|") + "|" + h(row.delivery_region);
  };
  const cls = (r: GateRow) => (labels ? (labels[String(clusterOf.get(r))] ?? "C1") : "C1");

  const ARMS: [string, (row: any) => string][] = [
    ["TODAY: the six fields that already rank", specKey(
      ["ticketBand", "sector", "useOfFunds", "region", "consortium", "entityCountries"])],
    ["RICH-CRISP  C1+C2", demandKey((r) => cls(r) === "C1" || cls(r) === "C2")],
    ["RICH FULL   C1+C2+F", demandKey((r) => cls(r) !== "U")],
    ["[circular] verbatim eligibility_text", (row: any) =>
      h(row.eligibility_text) + "|" + h(row.delivery_region) + "|" + h(row.capital_type)],
  ];

  // Residual class size per instrument, under each arm.
  const sizeUnder = ARMS.map(([, key]) => {
    const m = new Map<string, number>();
    for (const g of byRegime.values()) {
      const c = new Map<string, number>();
      for (const r of g) c.set(key(r), (c.get(key(r)) ?? 0) + 1);
      for (const r of g) m.set(String(r.id), c.get(key(r))!);
    }
    return m;
  });

  const pairs = JSON.parse(readFileSync(SET, "utf8")) as any[];
  const sel = SPLIT ? pairs.filter((p) => p.split === SPLIT) : pairs;
  const named = sel.filter((p) => sizeUnder[0].has(String(p.instrument)));
  console.log(`recall set ${SET}${SPLIT ? ` split=${SPLIT}` : ""}: ${sel.length} pairs, ` +
    `${named.length} whose won fund is publishable (${(100 * named.length / sel.length).toFixed(1)}%)`);
  const single = named.filter((p) => sizeUnder[0].get(String(p.instrument)) === 1 &&
    (byRegime.get(String(pop.find((r) => String(r.id) === String(p.instrument))?.parent_id ??
      p.instrument))?.length ?? 1) === 1).length;
  console.log(`of those, ${single} (${(100 * single / named.length).toFixed(1)}%) are a fund with NO SIBLINGS — ` +
    `trivially alone under every arm\n`);

  console.log("PAIR-WEIGHTED upper bound on EXACT@5");
  console.log(`(a perfect chooser, x the measured pool rate ${(100 * POOL).toFixed(0)}% — funds the product never shows cannot be picked)`);
  console.log("arm".padEnd(42) + "class<=5".padStart(10) + "  x pool =  EXACT@5 CEILING");
  for (let i = 0; i < ARMS.length; i++) {
    const fits = named.filter((p) => (sizeUnder[i].get(String(p.instrument)) ?? 1) <= 5).length;
    const share = fits / named.length;
    console.log(ARMS[i][0].padEnd(42) + `${(100 * share).toFixed(1)}%`.padStart(10) +
      `            ${(100 * share * POOL).toFixed(1)}%`);
  }
  console.log(`\nfor comparison, the product SHIPS EXACT@5 25% on this set.`);

  // The same bound over the whole publishable offer, unweighted, so the two
  // denominators are never confused again.
  console.log("\nUNWEIGHTED over all 895 publishable instruments (each fund once)");
  for (let i = 0; i < ARMS.length; i++) {
    const fits = pop.filter((r) => (sizeUnder[i].get(String(r.id)) ?? 1) <= 5).length;
    console.log(ARMS[i][0].padEnd(42) + `${(100 * fits / pop.length).toFixed(1)}%`.padStart(10));
  }
})();
