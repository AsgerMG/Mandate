// wsCB — the CEILING each tranche of re-encoding would buy, on wsCA's key so
// the numbers compose with its 40.0 / 43.1.
//
// Baseline is wsCA's "six that already rank": the leaf's DECIDABLE comparators
// on ticketBand / sector / useOfFunds / region / consortium / entityCountries,
// plus region as the corpus records it. That is 40.0%.
//
// A tranche is a set of filter gates that today carry NO value_spec. Encoding
// one means the leaf gains a comparator on the tranche's target field. We do
// not know what comparator the encoder would emit, so the tranche is credited
// with its VERBATIM requirement text — which is the most separation any
// comparator over that text could produce, and strictly more than a real one
// will, because a comparator collapses distinct sentences onto one spec. Every
// number here is therefore an UPPER BOUND on the tranche's ceiling gain.
//
// The collapse is measured rather than assumed: for each field, `collapse`
// prints distinct specs / distinct requirement texts among the gates that ARE
// encoded, which is the discount the upper bound needs.
//
// Concentration is reported with every gain: a gain that lives in one regime is
// a fact about that regime, not a feature (wsCA's fteBand).
import { readFileSync } from "fs";
import { Client } from "pg";
import { loadEnvLocal, requireCredentials } from "./loadEnv";
loadEnvLocal();
requireCredentials("wscb_tranche", ["DATABASE_URL"]);
const PUB = process.env.PUBLISHABLE;
const VOCAB = JSON.parse(readFileSync(process.cwd() + "/../capital/data/vocabularies.json", "utf8"));
const REACH: Record<string, string> = VOCAB.fieldReach;

const h = (s: any) => (s ? String(s).trim().toLowerCase().slice(0, 400) : "");
type Row = Record<string, any>;

/** A subnational location rule: the text names an area INSIDE a country.
 *  Stated as a property, tested against the NUTS reference the product itself
 *  resolves against — never a list of region names written out here. */
const NUTS_ID = /\b([A-Z]{2}[0-9A-Z]{1,3})\b/;

function ceil5(groups: Row[][], key: (r: Row) => string) {
  const sizes = new Map<string, number>();
  const cls: { r: Row; n: number }[] = [];
  for (const g of groups) {
    const c = new Map<string, number>();
    for (const r of g) c.set(key(r), (c.get(key(r)) ?? 0) + 1);
    for (const r of g) cls.push({ r, n: c.get(key(r))! });
  }
  void sizes;
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

  const { rows } = await db.query(
    `SELECT id, parent_id, country, delivery_region, capital_type, name FROM funding_instruments`);
  const pop = ids ? rows.filter((r) => ids.has(String(r.id))) : rows;
  const nameOf = new Map<string, string>(rows.map((r) => [String(r.id), String(r.parent_id ?? r.id)]));

  const g = await db.query(
    `SELECT instrument_id, gate_key, requirement, value, gate_role, value_spec,
            verification_level, COALESCE(intake_field_resolved, intake_field) AS f
       FROM eligibility_gates`);
  const gates = g.rows.map((r) => ({ ...r, iid: String(r.instrument_id), field: (r.f ?? "none") as string }));

  // ── what is DECIDABLE today ───────────────────────────────────────────────
  const spec = new Map<string, Map<string, Set<string>>>();
  for (const r of gates) {
    if (r.value_spec == null || r.gate_role !== "filter") continue;
    if (!spec.has(r.iid)) spec.set(r.iid, new Map());
    const m = spec.get(r.iid)!;
    if (!m.has(r.field)) m.set(r.field, new Set());
    m.get(r.field)!.add(JSON.stringify(r.value_spec));
  }
  const sig = (r: Row, f: string) => {
    const s = spec.get(String(r.id))?.get(f);
    return s && s.size ? [...s].sort().join("~") : "";
  };

  const byRegime = new Map<string, Row[]>();
  for (const r of pop) { const p = String(r.parent_id ?? r.id); (byRegime.get(p) ?? byRegime.set(p, []).get(p)!).push(r); }
  const groups = [...byRegime.values()].filter((x) => x.length > 1);
  console.log(`instruments ${rows.length}, publishable ${pop.length}, multi-leaf regimes ${groups.length}, leaves ${groups.reduce((a, x) => a + x.length, 0)}\n`);

  const RANKS = ["ticketBand", "sector", "useOfFunds", "region", "consortium", "entityCountries"];
  const shipped = (r: Row) => RANKS.map((f) => sig(r, f)).join("|") + "|" + h(r.delivery_region);
  const base = ceil5(groups, shipped);
  console.log(`BASELINE — the six that already rank: mean ${base.mean.toFixed(2)}  CEILING@5 ${base.at5.toFixed(1)}%`);

  // ── the unencoded population, split into tranches ─────────────────────────
  const unenc = gates.filter((r) => r.gate_role === "filter" && r.value_spec == null &&
    (ids ? ids.has(r.iid) : true));
  const cited = (r: any) => r.verification_level !== "llm_classified";
  const locatable = (r: any) =>
    NUTS_ID.test(String(r.value ?? "")) || NUTS_ID.test(String(r.requirement ?? ""));

  type Tranche = { name: string; pick: (r: any) => boolean; target: (r: any) => string; note: string };
  const TRANCHES: Tranche[] = [
    { name: "A  region-refile (activityCountries, NUTS-bearing)",
      pick: (r) => cited(r) && r.field === "activityCountries" && locatable(r),
      target: () => "region",
      note: "unreachable field carrying a subnational location; refiled to `region`, which IS reachable" },
    { name: "A' region-refile (activityCountries, all)",
      pick: (r) => cited(r) && r.field === "activityCountries",
      target: () => "region",
      note: "the same tranche without the NUTS test, as an upper bound on refiling" },
    { name: "B  first_page fields",
      pick: (r) => cited(r) && REACH[r.field] === "first_page",
      target: (r) => r.field,
      note: "asked on the opening form; every founder answers them" },
    { name: "C  adaptive fields",
      pick: (r) => cited(r) && REACH[r.field] === "adaptive",
      target: (r) => r.field,
      note: "offered by the grounded adaptive round; a minority of founders answer" },
    { name: "D  derived (lossesOverHalfCapital)",
      pick: (r) => cited(r) && REACH[r.field] === "derived",
      target: (r) => r.field, note: "computed from exclusionFlags" },
    { name: "E  constant (borrowerModel)",
      pick: (r) => cited(r) && REACH[r.field] === "constant",
      target: (r) => r.field, note: "pinned to 'operating'; the founder never states it" },
    { name: "F  UNMAPPED (intake_field_resolved = none)  [REFUSED]",
      pick: (r) => cited(r) && (r.field === "none" || r.field == null),
      target: () => "none", note: "no field decides it — refuse_unemittable" },
    { name: "G  llm_classified, no quote  [REFUSED]",
      pick: (r) => !cited(r), target: (r) => r.field,
      note: "no verbatim quote; encode_gates excludes the tier by design" },
    { name: "H  unreachable, NOT refilable (foundedYear + non-NUTS)  [REFUSED]",
      pick: (r) => cited(r) && REACH[r.field] === "unreachable" && !(r.field === "activityCountries" && locatable(r)),
      target: (r) => r.field, note: "refuse_unreachable — no question reaches the field" },
  ];

  const textOf = (r: any) => h(r.value ?? r.requirement);

  const report: any[] = [];
  for (const t of TRANCHES) {
    const sel = unenc.filter(t.pick);
    const add = new Map<string, Map<string, Set<string>>>();
    for (const r of sel) {
      const f = t.target(r);
      if (!add.has(r.iid)) add.set(r.iid, new Map());
      const m = add.get(r.iid)!;
      if (!m.has(f)) m.set(f, new Set());
      m.get(f)!.add(textOf(r));
    }
    const fields = [...new Set(sel.map(t.target))].sort();
    const key = (r: Row) => shipped(r) + "#" + fields.map((f) => {
      const s = add.get(String(r.id))?.get(f);
      return s && s.size ? [...s].sort().join("~") : "";
    }).join("|");
    const c = ceil5(groups, key);
    // Concentration: which regimes hold the leaves that newly fit in five?
    const gained = [...c.fits].filter((id) => !base.fits.has(id));
    const byReg = new Map<string, number>();
    for (const id of gained) { const p = nameOf.get(id)!; byReg.set(p, (byReg.get(p) ?? 0) + 1); }
    const top = [...byReg].sort((a, b) => b[1] - a[1])[0];
    report.push({
      name: t.name, gates: sel.length, insts: new Set(sel.map((r) => r.iid)).size,
      at5: c.at5, gain: c.at5 - base.at5, leaves: gained.length,
      regimes: byReg.size, topShare: top ? top[1] / Math.max(1, gained.length) : 0,
      topName: top ? top[0] : "-", note: t.note,
    });
  }

  console.log("\nUPPER-BOUND ceiling if the tranche were encoded (verbatim text as the comparator)");
  console.log("tranche".padEnd(52) + "gates".padStart(7) + "inst".padStart(6) +
              "CEIL@5".padStart(9) + "gain".padStart(7) + "leaves".padStart(8) +
              "regimes".padStart(9) + "top-regime share".padStart(18));
  for (const r of report.sort((a, b) => b.gain - a.gain)) {
    console.log(String(r.name).padEnd(52) + String(r.gates).padStart(7) + String(r.insts).padStart(6) +
      `${r.at5.toFixed(1)}%`.padStart(9) + `${r.gain >= 0 ? "+" : ""}${r.gain.toFixed(1)}`.padStart(7) +
      String(r.leaves).padStart(8) + String(r.regimes).padStart(9) +
      `${(100 * r.topShare).toFixed(0)}%`.padStart(18));
  }

  // Encodable-in-principle, all at once (A + B + C + D), and with E.
  const combos: [string, (r: any) => boolean, (r: any) => string][] = [
    ["A+B+C+D  everything reachable and cited",
      (r) => cited(r) && (REACH[r.field] === "first_page" || REACH[r.field] === "adaptive" ||
        REACH[r.field] === "derived" || (r.field === "activityCountries" && locatable(r))),
      (r) => (r.field === "activityCountries" ? "region" : r.field)],
    ["A+B+C+D+E  ...plus the pinned borrowerModel",
      (r) => cited(r) && (REACH[r.field] === "first_page" || REACH[r.field] === "adaptive" ||
        REACH[r.field] === "derived" || REACH[r.field] === "constant" ||
        (r.field === "activityCountries" && locatable(r))),
      (r) => (r.field === "activityCountries" ? "region" : r.field)],
    ["EVERYTHING, including what the guards refuse",
      () => true, (r) => (r.field === "activityCountries" ? "region" : r.field)],
  ];
  console.log("");
  for (const [label, pick, target] of combos) {
    const sel = unenc.filter(pick);
    const add = new Map<string, Map<string, Set<string>>>();
    for (const r of sel) {
      const f = target(r);
      if (!add.has(r.iid)) add.set(r.iid, new Map());
      const m = add.get(r.iid)!;
      if (!m.has(f)) m.set(f, new Set());
      m.get(f)!.add(textOf(r));
    }
    const fields = [...new Set(sel.map(target))].sort();
    const c = ceil5(groups, (r) => shipped(r) + "#" + fields.map((f) => {
      const s = add.get(String(r.id))?.get(f); return s && s.size ? [...s].sort().join("~") : "";
    }).join("|"));
    const gained = [...c.fits].filter((id) => !base.fits.has(id));
    const byReg = new Map<string, number>();
    for (const id of gained) { const p = nameOf.get(id)!; byReg.set(p, (byReg.get(p) ?? 0) + 1); }
    const top = [...byReg].sort((a, b) => b[1] - a[1])[0];
    console.log(`${label.padEnd(52)}${String(sel.length).padStart(7)}${" ".repeat(6)}` +
      `${c.at5.toFixed(1)}%`.padStart(9) + `${(c.at5 - base.at5 >= 0 ? "+" : "")}${(c.at5 - base.at5).toFixed(1)}`.padStart(7) +
      String(gained.length).padStart(8) + String(byReg.size).padStart(9) +
      `${top ? (100 * top[1] / Math.max(1, gained.length)).toFixed(0) : 0}%`.padStart(18));
  }

  // ── the discount the upper bound needs, MEASURED ──────────────────────────
  console.log("\nCOLLAPSE — how much separation a real comparator loses against verbatim text");
  console.log("(distinct value_specs / distinct requirement texts, among gates that ARE encoded)");
  const enc = gates.filter((r) => r.gate_role === "filter" && r.value_spec != null && (ids ? ids.has(r.iid) : true));
  const byF = new Map<string, { t: Set<string>; s: Set<string> }>();
  for (const r of enc) {
    const e = byF.get(r.field) ?? { t: new Set<string>(), s: new Set<string>() };
    e.t.add(textOf(r)); e.s.add(JSON.stringify(r.value_spec)); byF.set(r.field, e);
  }
  console.log("field".padEnd(24) + "texts".padStart(7) + "specs".padStart(7) + "collapse".padStart(10));
  let ts = 0, ss = 0;
  for (const [f, e] of [...byF].sort((a, b) => b[1].t.size - a[1].t.size)) {
    ts += e.t.size; ss += e.s.size;
    console.log(String(f).padEnd(24) + String(e.t.size).padStart(7) + String(e.s.size).padStart(7) +
      `${(e.s.size / e.t.size).toFixed(2)}`.padStart(10));
  }
  console.log(String("ALL FIELDS").padEnd(24) + String(ts).padStart(7) + String(ss).padStart(7) + `${(ss / ts).toFixed(2)}`.padStart(10));
  await db.end();
})();
