// wsCE — the ceiling each CRISP tranche buys, credited from the MATCHABLE
// column only, on wsCA's key so the numbers compose with its 40.0 / 43.1.
//
// Two things this does that `_wscb_tranche.ts` does not.
//
// 1. It separates the two axes the pilot proved I had collapsed:
//      A  is there a determinant?   crisp vs fuzzy
//      B  may this pass encode it?  tier, reach, ownership
//    A tranche is now (A ∧ B), and each guard's cost is priced on its own line
//    rather than being silently folded into "fuzzy".
//
// 2. It credits a gate only where a READER confirmed the determinant, on the
//    287-gate adjudicated sample. The free notation test's CRISP call runs at
//    48% precision, so crediting it unread reports a ceiling that half the
//    tranche cannot deliver. Where the sample does not reach, the per-class
//    reader rate is applied as an explicit, labelled projection — never mixed
//    into a measured line.
//
// Credit is the gate's verbatim text, exactly as wsCB: the most separation any
// comparator over that text could produce, and strictly more than a real one
// will. Every gain here is an UPPER BOUND on that tranche's ceiling.
//
// Concentration is printed beside every gain. A gain living in one regime is a
// fact about that regime, not a feature.
import { readFileSync } from "fs";
import { Client } from "pg";
import { loadEnvLocal, requireCredentials } from "../loadEnv";
loadEnvLocal();
requireCredentials("wsce_ceiling", ["DATABASE_URL"]);

const ROOT = process.cwd() + "/../capital";
const VOCAB = JSON.parse(readFileSync(`${ROOT}/data/vocabularies.json`, "utf8"));
const REACH: Record<string, string> = VOCAB.fieldReach;
const PUB = process.env.PUBLISHABLE!;
const CLASSIFIED = process.env.CLASSIFIED!;
const ADJUDICATED = process.env.ADJUDICATED!;

const h = (s: any) => (s ? String(s).trim().toLowerCase().slice(0, 400) : "");
type Row = Record<string, any>;

function ceil5(groups: Row[][], key: (r: Row) => string) {
  const cls: { r: Row; n: number }[] = [];
  for (const g of groups) {
    const c = new Map<string, number>();
    for (const r of g) c.set(key(r), (c.get(key(r)) ?? 0) + 1);
    for (const r of g) cls.push({ r, n: c.get(key(r))! });
  }
  return {
    at5: (100 * cls.filter((x) => x.n <= 5).length) / cls.length,
    fits: new Set(cls.filter((x) => x.n <= 5).map((x) => String(x.r.id))),
  };
}

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const ids = new Set<string>(JSON.parse(readFileSync(PUB, "utf8")).map(String));
  if (!ids.size) { console.error("PUBLISHABLE allow-list is EMPTY — refusing"); process.exit(1); }

  const classified: any[] = JSON.parse(readFileSync(CLASSIFIED, "utf8"));
  const adj: any[] = JSON.parse(readFileSync(ADJUDICATED, "utf8")).adjudications;
  const verdict = new Map<number, any>(adj.map((a) => [Number(a.id), a]));

  const { rows } = await db.query(
    `SELECT id, parent_id, delivery_region FROM funding_instruments`);
  const pop = rows.filter((r) => ids.has(String(r.id)));
  const regimeOf = new Map<string, string>(rows.map((r) => [String(r.id), String(r.parent_id ?? r.id)]));

  const g = await db.query(
    `SELECT id, instrument_id, requirement, value, gate_role, value_spec,
            verification_level, COALESCE(intake_field_resolved, intake_field) AS f
       FROM eligibility_gates`);
  const gates = g.rows.map((r) => ({ ...r, iid: String(r.instrument_id), field: (r.f ?? "none") as string }));

  // ── the baseline: wsCA's six that already rank, at 40.0 ───────────────────
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

  const RANKS = ["ticketBand", "sector", "useOfFunds", "region", "consortium", "entityCountries"];
  const shipped = (r: Row) => RANKS.map((f) => sig(r, f)).join("|") + "|" + h(r.delivery_region);
  const base = ceil5(groups, shipped);
  console.log(`publishable ${pop.length}, multi-leaf regimes ${groups.length}, leaves ${groups.reduce((a, x) => a + x.length, 0)}`);
  console.log(`BASELINE — the six that already rank: CEILING@5 ${base.at5.toFixed(1)}%\n`);

  // ── the reader-confirmed rate per free class, measured on the sample ──────
  const rate = new Map<string, { n: number; crisp: number }>();
  for (const a of adj) {
    const e = rate.get(a.cls) ?? { n: 0, crisp: 0 };
    e.n++; if (a.verdict === "crisp") e.crisp++;
    rate.set(a.cls, e);
  }
  const pop_ = new Map<string, number>();
  for (const c of classified) pop_.set(c.cls, (pop_.get(c.cls) ?? 0) + 1);

  console.log("READER-CONFIRMED CRISP RATE per free class (sample), and the projection");
  console.log("free class".padEnd(28) + "pop".padStart(6) + "sampled".padStart(9) +
              "crisp".padStart(7) + "rate".padStart(8) + "projected crisp".padStart(17));
  let projTotal = 0;
  for (const [cls, e] of [...rate].sort((a, b) => (pop_.get(b[0]) ?? 0) - (pop_.get(a[0]) ?? 0))) {
    const p = pop_.get(cls) ?? 0;
    const proj = Math.round((p * e.crisp) / e.n);
    projTotal += proj;
    console.log(cls.padEnd(28) + String(p).padStart(6) + String(e.n).padStart(9) +
      String(e.crisp).padStart(7) + `${(100 * e.crisp / e.n).toFixed(0)}%`.padStart(8) +
      String(proj).padStart(17));
  }
  console.log(`${"ALL".padEnd(28)}${classified.length.toString().padStart(6)}${adj.length.toString().padStart(9)}` +
    `${adj.filter((a) => a.verdict === "crisp").length.toString().padStart(7)}` +
    `${(100 * adj.filter((a) => a.verdict === "crisp").length / adj.length).toFixed(0)}%`.padStart(8) +
    String(projTotal).padStart(17));

  // ── the tranches ─────────────────────────────────────────────────────────
  // Axis B, priced separately so each guard's cost is visible rather than
  // silently folded into "not crisp".
  const cited = (id: number) => {
    const r = gates.find((x) => Number(x.id) === id);
    return r ? r.verification_level !== "llm_classified" : false;
  };
  const gateById = new Map<number, any>(gates.map((r) => [Number(r.id), r]));
  const readerField = (id: number) => verdict.get(id)?.field ?? "none";

  type T = { name: string; pick: (a: any) => boolean; target: (a: any) => string };
  const TRANCHES: T[] = [
    { name: "1  reader-crisp, reachable, cited, not region",
      pick: (a) => a.verdict === "crisp" && REACH[readerField(a.id)] &&
        REACH[readerField(a.id)] !== "unreachable" && readerField(a.id) !== "region" && cited(a.id),
      target: (a) => readerField(a.id) },
    { name: "2  ...+ region (encode_regions.py owns it)",
      pick: (a) => a.verdict === "crisp" && REACH[readerField(a.id)] &&
        REACH[readerField(a.id)] !== "unreachable" && cited(a.id),
      target: (a) => readerField(a.id) },
    { name: "3  ...+ the llm_classified tier (crisp but unquoted)",
      pick: (a) => a.verdict === "crisp" && REACH[readerField(a.id)] &&
        REACH[readerField(a.id)] !== "unreachable",
      target: (a) => readerField(a.id) },
    { name: "4  ...+ unreachable fields  [refuse_unreachable]",
      pick: (a) => a.verdict === "crisp", target: (a) => readerField(a.id) },
    { name: "5  FREE-CRISP UNREAD (what encoding without a reader buys)",
      pick: (a) => a.cls.startsWith("CRISP"), target: (a) => a.field },
    { name: "6  reader-FUZZY (wsCD's half — a comparator would guess)",
      pick: (a) => a.verdict === "fuzzy", target: (a) => a.field },
  ];

  const textOf = (id: number) => {
    const r = gateById.get(id);
    return r ? h(r.value ?? r.requirement) : "";
  };

  console.log("\nCEILING@5 on wsCA's key, credited from the MATCHABLE column only.");
  console.log("MEASURED lines credit only the 287 adjudicated gates, so they are a floor on");
  console.log("what the full tranche would buy, not an estimate of it.\n");
  console.log("tranche".padEnd(52) + "gates".padStart(7) + "CEIL@5".padStart(9) +
              "gain".padStart(7) + "leaves".padStart(8) + "regimes".padStart(9) + "top share".padStart(11));
  for (const t of TRANCHES) {
    const sel = adj.filter(t.pick);
    const add = new Map<string, Map<string, Set<string>>>();
    for (const a of sel) {
      const r = gateById.get(Number(a.id)); if (!r) continue;
      const f = t.target(a);
      if (!add.has(r.iid)) add.set(r.iid, new Map());
      const m = add.get(r.iid)!;
      if (!m.has(f)) m.set(f, new Set());
      m.get(f)!.add(textOf(Number(a.id)));
    }
    const fields = [...new Set(sel.map(t.target))].sort();
    const c = ceil5(groups, (r) => shipped(r) + "#" + fields.map((f) => {
      const s = add.get(String(r.id))?.get(f);
      return s && s.size ? [...s].sort().join("~") : "";
    }).join("|"));
    const gained = [...c.fits].filter((id) => !base.fits.has(id));
    const byReg = new Map<string, number>();
    for (const id of gained) { const p = regimeOf.get(id)!; byReg.set(p, (byReg.get(p) ?? 0) + 1); }
    const top = [...byReg].sort((a, b) => b[1] - a[1])[0];
    console.log(t.name.padEnd(52) + String(sel.length).padStart(7) +
      `${c.at5.toFixed(1)}%`.padStart(9) +
      `${c.at5 - base.at5 >= 0 ? "+" : ""}${(c.at5 - base.at5).toFixed(1)}`.padStart(7) +
      String(gained.length).padStart(8) + String(byReg.size).padStart(9) +
      `${top ? (100 * top[1] / Math.max(1, gained.length)).toFixed(0) : 0}%`.padStart(11));
  }
  await db.end();
})();
