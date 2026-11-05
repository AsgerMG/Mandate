// wsCA — the only question that matters for the 17: what does WIRING IT IN buy,
// on top of the six fields that already rank? A field with a fine ceiling alone
// is worth nothing if the six already separate the same leaves.
import { readFileSync } from "fs";
import { Client } from "pg";
import { loadEnvLocal, requireCredentials } from "./loadEnv";
loadEnvLocal();
requireCredentials("wsca_marginal", ["DATABASE_URL"]);
const PUB = process.env.PUBLISHABLE;
const h = (s: any) => (s ? String(s).trim().toLowerCase().slice(0, 400) : "");
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
  const { rows } = await db.query(`SELECT id, parent_id, delivery_region, capital_type, award_p50 FROM funding_instruments`);
  let pop = rows;
  if (PUB) {
    const ids = new Set<string>(JSON.parse(readFileSync(PUB, "utf8")).map(String));
    if (ids.size === 0) { console.error("PUBLISHABLE allow-list is EMPTY — refusing to measure nothing"); process.exit(1); }
    pop = rows.filter((r) => ids.has(String(r.id)));
  }
  const g = await db.query(`SELECT instrument_id, COALESCE(intake_field_resolved, intake_field) AS f,
                                   gate_role, value_spec FROM eligibility_gates`);
  const val = new Map<string, Map<string, Set<string>>>();
  for (const r of g.rows) {
    const f = r.f ?? "none", id = String(r.instrument_id);
    if (!val.has(id)) val.set(id, new Map());
    if (!val.get(id)!.has(f)) val.get(id)!.set(f, new Set());
    if (r.value_spec != null && r.gate_role === "filter") val.get(id)!.get(f)!.add(JSON.stringify(r.value_spec));
  }
  const sig = (r: Row, f: string) => { const s = val.get(String(r.id))?.get(f); return s && s.size ? [...s].sort().join("~") : ""; };
  const byRegime = new Map<string, Row[]>();
  for (const r of pop) { const p = r.parent_id ?? r.id; (byRegime.get(p) ?? byRegime.set(p, []).get(p)!).push(r); }
  const groups = [...byRegime.values()].filter((x) => x.length > 1);
  console.log(`multi-leaf regimes ${groups.length}, holding ${groups.reduce((a, x) => a + x.length, 0)} leaves\n`);

  // The six proved to rank (ANSWER_USE ranks:true). region is read as the
  // corpus records it, since that is what regionScorer actually compares against.
  const RANKS = ["ticketBand", "sector", "useOfFunds", "region", "consortium", "entityCountries"];
  const shipped = (r: Row) => RANKS.map((f) => sig(r, f)).join("|") + "|" + h(r.delivery_region);
  const b = ceil5(groups, shipped);
  console.log(`THE SIX THAT ALREADY RANK (+ region as the corpus records it)`);
  console.log(`  mean class ${b.mean.toFixed(2)}   CEILING@5 ${b.at5.toFixed(1)}%\n`);

  const MEMO = ["activities","exclusionFlags","lossesOverHalfCapital","fteBand","borrowerModel",
    "developmentStage","cofinancingBand","turnoverBand","nonEuControl","ownerOver25",
    "institutionalBacking","bankRelationship","conditionality","balanceBand","wouldOpenEntity",
    "institutionalOwner","needBy","activityCountries","foundedYear"];
  const rep = MEMO.map((f) => {
    const c = ceil5(groups, (r) => shipped(r) + "|" + sig(r, f));
    return { f, at5: c.at5, gain: c.at5 - b.at5 };
  }).sort((x, y) => y.gain - x.gain);
  console.log("MARGINAL gain of wiring one memo-only field into the ranker");
  console.log("field".padEnd(26) + "CEIL@5".padStart(8) + "   marginal gain".padStart(16));
  for (const r of rep) console.log(String(r.f).padEnd(26) + `${r.at5.toFixed(1)}%`.padStart(8) +
    `   ${r.gain >= 0 ? "+" : ""}${r.gain.toFixed(1)}`.padStart(16));
  const all = ceil5(groups, (r) => shipped(r) + "|" + MEMO.map((f) => sig(r, f)).join("|"));
  console.log(`\nALL SEVENTEEN wired in at once: CEILING@5 ${all.at5.toFixed(1)}%   gain ${(all.at5 - b.at5 >= 0 ? "+" : "")}${(all.at5 - b.at5).toFixed(1)}`);
  await db.end();
})();
