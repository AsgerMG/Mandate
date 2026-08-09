// wsCB — what encoding a tranche would REALLY buy, as opposed to what its
// verbatim text could in principle distinguish.
//
// `_wscb_tranche.ts` credits an unencoded gate with its whole sentence. That is
// an upper bound and a loose one: measured over the gates that ARE encoded, 823
// distinct requirement texts collapse onto 253 distinct value_specs — a ratio
// of 0.31, and 0.04 on lossesOverHalfCapital, 0.07 on consortium, 0.11 on
// fteBand. A comparator cannot say more than its field's vocabulary can say,
// and most of these vocabularies are three values long.
//
// So the estimate here does not guess a discount. It SIMULATES the encoder with
// the encoder's own output: for each unencoded gate, the spec assigned is the
// spec the corpus already carries for the most similar text on the same field.
// Nearest neighbour over token overlap, on the corpus's own (text -> spec)
// pairs. Below a similarity floor the gate is left unencoded, which is what
// `skip` does today and what the encoder does whenever a lossy fit is the only
// one available.
//
// This is neither an upper nor a lower bound. It is the answer to "if this text
// is encoded the way texts like it were already encoded, what changes?", which
// is the question a costed plan needs.
import { readFileSync } from "fs";
import { Client } from "pg";
import { loadEnvLocal, requireCredentials } from "./loadEnv";
loadEnvLocal();
requireCredentials("wscb_realistic", ["DATABASE_URL"]);
const PUB = process.env.PUBLISHABLE;
const VOCAB = JSON.parse(readFileSync(process.cwd() + "/../../data/vocabularies.json", "utf8"));
const REACH: Record<string, string> = VOCAB.fieldReach;
const NUTS_ID = /\b([A-Z]{2}[0-9A-Z]{1,3})\b/;
const h = (s: any) => (s ? String(s).trim().toLowerCase().slice(0, 400) : "");
type Row = Record<string, any>;

const STOP = new Set(("the a an of to and or for in on be must is are with as at by that this " +
  "which not no any all their its from than more least under per any such").split(" "));
const toks = (s: string) => new Set(String(s).toLowerCase().match(/[a-z0-9%€]+/g)?.filter((t) => !STOP.has(t) && t.length > 2) ?? []);
const jac = (a: Set<string>, b: Set<string>) => {
  let i = 0; for (const x of a) if (b.has(x)) i++;
  const u = a.size + b.size - i; return u ? i / u : 0;
};

function ceil5(groups: Row[][], key: (r: Row) => string) {
  const cls: { r: Row; n: number }[] = [];
  for (const g of groups) {
    const c = new Map<string, number>();
    for (const r of g) c.set(key(r), (c.get(key(r)) ?? 0) + 1);
    for (const r of g) cls.push({ r, n: c.get(key(r))! });
  }
  return {
    at5: (100 * cls.filter((x) => x.n <= 5).length) / cls.length,
    mean: cls.reduce((a, x) => a + x.n, 0) / cls.length,
    fits: new Set(cls.filter((x) => x.n <= 5).map((x) => String(x.r.id))),
  };
}

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const ids = PUB ? new Set<string>(JSON.parse(readFileSync(PUB, "utf8")).map(String)) : null;
  if (ids && ids.size === 0) { console.error("PUBLISHABLE allow-list is EMPTY — refusing"); process.exit(1); }
  const { rows } = await db.query(`SELECT id, parent_id, delivery_region FROM funding_instruments`);
  const pop = ids ? rows.filter((r) => ids.has(String(r.id))) : rows;
  const regimeOf = new Map<string, string>(rows.map((r) => [String(r.id), String(r.parent_id ?? r.id)]));

  const g = await db.query(
    `SELECT instrument_id, requirement, value, gate_role, value_spec, verification_level,
            COALESCE(intake_field_resolved, intake_field) AS f FROM eligibility_gates`);
  const gates = g.rows.map((r) => ({ ...r, iid: String(r.instrument_id), field: (r.f ?? "none") as string }));

  const spec = new Map<string, Map<string, Set<string>>>();
  const put = (m: Map<string, Map<string, Set<string>>>, iid: string, f: string, v: string) => {
    if (!m.has(iid)) m.set(iid, new Map());
    const x = m.get(iid)!; if (!x.has(f)) x.set(f, new Set()); x.get(f)!.add(v);
  };
  for (const r of gates) {
    if (r.value_spec == null || r.gate_role !== "filter") continue;
    put(spec, r.iid, r.field, JSON.stringify(r.value_spec));
  }
  const sig = (m: Map<string, Map<string, Set<string>>>) => (r: Row, f: string) => {
    const s = m.get(String(r.id))?.get(f); return s && s.size ? [...s].sort().join("~") : "";
  };
  const sigNow = sig(spec);

  const byRegime = new Map<string, Row[]>();
  for (const r of pop) { const p = String(r.parent_id ?? r.id); (byRegime.get(p) ?? byRegime.set(p, []).get(p)!).push(r); }
  const groups = [...byRegime.values()].filter((x) => x.length > 1);

  const RANKS = ["ticketBand", "sector", "useOfFunds", "region", "consortium", "entityCountries"];
  const shipped = (r: Row) => RANKS.map((f) => sigNow(r, f)).join("|") + "|" + h(r.delivery_region);
  const base = ceil5(groups, shipped);
  console.log(`publishable ${pop.length}, multi-leaf regimes ${groups.length}, leaves ${groups.reduce((a, x) => a + x.length, 0)}`);
  console.log(`BASELINE — the six that already rank: mean ${base.mean.toFixed(2)}  CEILING@5 ${base.at5.toFixed(1)}%\n`);

  // ── the encoder's own (text -> spec) memory, per field ────────────────────
  const memory = new Map<string, { t: Set<string>; s: string }[]>();
  for (const r of gates) {
    if (r.value_spec == null || r.gate_role !== "filter") continue;
    const list = memory.get(r.field) ?? [];
    list.push({ t: toks(String(r.value ?? r.requirement ?? "")), s: JSON.stringify(r.value_spec) });
    memory.set(r.field, list);
  }
  for (const [f, l] of memory) console.log(`  memory ${f}: ${l.length} encoded examples, ${new Set(l.map(x=>x.s)).size} distinct specs`);

  const unenc = gates.filter((r) => r.gate_role === "filter" && r.value_spec == null && (ids ? ids.has(r.iid) : true));
  const cited = (r: any) => r.verification_level !== "llm_classified";
  const locatable = (r: any) => NUTS_ID.test(String(r.value ?? "")) || NUTS_ID.test(String(r.requirement ?? ""));

  const FIELDS_ALL = [...new Set(unenc.filter((r)=>cited(r) && ["first_page","adaptive","derived","constant"].includes(REACH[r.field])).map((r)=>r.field))].sort();
  const TRANCHES: [string, (r: any) => boolean, (r: any) => string][] = FIELDS_ALL.map((F) => [`${REACH[F]} / ${F}`, (r: any) => cited(r) && r.field === F, (r: any) => r.field] as [string,(r:any)=>boolean,(r:any)=>string]);
  const _OLD: [string, (r: any) => boolean, (r: any) => string][] = [
    ["A  region-refile (activityCountries -> region)", (r) => cited(r) && r.field === "activityCountries" && locatable(r), () => "region"],
    ["B  first_page fields", (r) => cited(r) && REACH[r.field] === "first_page", (r) => r.field],
    ["C  adaptive fields", (r) => cited(r) && REACH[r.field] === "adaptive", (r) => r.field],
    ["D  derived (lossesOverHalfCapital)", (r) => cited(r) && REACH[r.field] === "derived", (r) => r.field],
    ["E  constant (borrowerModel)", (r) => cited(r) && REACH[r.field] === "constant", (r) => r.field],
    ["B+C  every reachable ASKED field", (r) => cited(r) && ["first_page", "adaptive"].includes(REACH[r.field]), (r) => r.field],
    ["A+B+C+D  everything reachable and cited",
      (r) => cited(r) && (["first_page", "adaptive", "derived"].includes(REACH[r.field]) || (r.field === "activityCountries" && locatable(r))),
      (r) => (r.field === "activityCountries" ? "region" : r.field)],
    ["A+B+C+D+E  ...plus the pinned borrowerModel",
      (r) => cited(r) && (["first_page", "adaptive", "derived", "constant"].includes(REACH[r.field]) || (r.field === "activityCountries" && locatable(r))),
      (r) => (r.field === "activityCountries" ? "region" : r.field)],
  ];

  void _OLD;
  const FLOORS = [0.0, 0.2, 0.35];
  console.log("\nSIMULATED ENCODING — nearest already-encoded text on the same field decides the spec");
  console.log("tranche".padEnd(46) + "gates".padStart(6) +
              FLOORS.map((f) => `  sim>=${f.toFixed(2)}`).join("") + "   verbatim UB".padStart(14) + "  top-regime");
  for (const [name, pick, target] of TRANCHES) {
    const sel = unenc.filter(pick);
    const cells: string[] = [];
    let lastGained: string[] = [];
    for (const floor of FLOORS) {
      const add = new Map<string, Map<string, Set<string>>>();
      // seed with what is already decidable, then layer the simulated specs on
      for (const [iid, m] of spec) for (const [f, s] of m) for (const v of s) put(add, iid, f, v);
      let assigned = 0;
      for (const r of sel) {
        const f = target(r);
        const mem = memory.get(f) ?? [];
        if (!mem.length) continue;
        const t = toks(String(r.value ?? r.requirement ?? ""));
        let best = mem[0], bs = -1;
        for (const m of mem) { const s = jac(t, m.t); if (s > bs) { bs = s; best = m; } }
        if (bs < floor) continue;          // the encoder's `skip`
        put(add, r.iid, f, best.s); assigned++;
      }
      const sigNew = sig(add);
      const fields = [...new Set([...RANKS, ...sel.map(target)])];
      const c = ceil5(groups, (r) => fields.map((f) => sigNew(r, f)).join("|") + "|" + h(r.delivery_region));
      const gained = [...c.fits].filter((id) => !base.fits.has(id));
      lastGained = gained;
      cells.push(`${c.at5.toFixed(1)}/${(c.at5 - base.at5 >= 0 ? "+" : "")}${(c.at5 - base.at5).toFixed(1)}(${assigned})`);
    }
    const byReg = new Map<string, number>();
    for (const id of lastGained) { const p = regimeOf.get(id)!; byReg.set(p, (byReg.get(p) ?? 0) + 1); }
    const top = [...byReg].sort((a, b) => b[1] - a[1])[0];
    console.log(String(name).padEnd(46) + String(sel.length).padStart(6) +
      cells.map((c) => c.padStart(13)).join("") +
      `   ${top ? `${(100 * top[1] / Math.max(1, lastGained.length)).toFixed(0)}% of ${lastGained.length} in ${byReg.size} regimes` : "-"}`);
  }
  console.log("\nlegend: CEIL@5 / gain (gates the simulation actually assigned a spec to).");
  console.log("sim>=0.00 assigns every gate the nearest spec however unlike it; sim>=0.35 only");
  console.log("assigns where the corpus has really seen text like it, which is nearer the encoder.");
  await db.end();
})();
