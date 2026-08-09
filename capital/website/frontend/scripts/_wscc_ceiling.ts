// wsCC — STEPS 2 and 3: the crisp/fuzzy split, and the ceiling under a RICH
// founder profile.
//
// ── WHY EVERY EARLIER CEILING ANSWERED A NARROWER QUESTION ────────────────
//
//  85.5% (wsBY)  keys on verbatim `eligibility_text`. Encoded gates are
//                EXTRACTED from that text, so the key absorbs in advance
//                anything a question could add. CIRCULAR. Retracted.
//  62.0% (wsCA)  keys on verbatim REQUIREMENT text. Smaller circle, same
//                shape: two funds demanding the same thing in different words
//                are credited as separated, and no founder answer can produce
//                that separation, because the founder answers the DEMAND, not
//                the sentence.
//  43.1% (wsCA)  keys on decidable comparators only — right for what a
//                comparator can decide, and structurally blind to every
//                requirement that has no fixed answer set.
//
// ── THE KEY THIS FILE USES, AND WHY IT IS NOT CIRCULAR ────────────────────
//
// A leaf's key is the set of DEMAND CLASSES it makes, where a demand class is
// a cluster of requirement texts that mean the same thing (`_wscc_demand.ts`,
// canopy over the corpus's own voyage-3.5 gate embeddings). Two funds that
// demand the same thing in different words therefore collapse into ONE class
// and are NOT credited as separated.
//
// That is the exact repair for the circularity: wording cannot separate, only
// demand can, and a founder's answer is a function of the demand. TAU is swept
// rather than fitted; TAU -> 1 recovers the circular verbatim number, and that
// recovery is printed as the check that the collapse is doing real work.
//
// ── THE SPLIT, STATED AS A PROPERTY WITH A TEST FOR UNSEEN CASES ──────────
//
//  C1  DECLARED ENUMERATION — the requirement's truth is a function of an
//      applicant attribute with a fixed, printable answer set (headcount band,
//      turnover band, country, region, stage, exclusion status, ticket).
//      TEST: two applicants agreeing on every printable attribute always get
//      the same verdict, and the question could appear on a form unchanged for
//      every fund in the corpus. A comparator is RIGHT here; a model is
//      overkill.
//
//  C2  DECLARED BESPOKE QUANTITY — the truth is a function of a number or a
//      yes/no the founder holds, stated in the SCHEME'S OWN units (installed
//      capacity, collector area, project cost floor, partner count, whether
//      work has started, prior participation). Crisp, but the set of possible
//      questions is unbounded across schemes, so no fixed answer set exists.
//      TEST: the verdict follows deterministically once one number is known,
//      but the question cannot be printed on a form that serves every fund.
//      A comparator is right in principle and cannot be BUILT; a model reading
//      a rich profile decides it.
//
//  F   JUDGEMENT — the verdict depends on what the project IS, read against
//      the fund's purpose. TEST: two applicants identical on every declared
//      attribute AND every bespoke number can still get different correct
//      verdicts. A comparator will always be wrong here; a model reading
//      founder prose plausibly can decide it.
//
//  U   NOT DETERMINED BY THE APPLICANT — discretion, competitive assessment,
//      budget availability, or a fact the applicant cannot hold at intake.
//      TEST: no true statement the founder could make changes the verdict.
//      NOTHING can decide it, and it is credited to no arm.
//
// The split is applied from LABELS=<json> when supplied (one label per demand
// cluster). With no LABELS it falls back to a STRUCTURAL PROXY that can only
// separate C1 from "not C1" — a gate whose resolved intake field carries a
// vocabulary is C1; everything else is pooled. The proxy is free, is reported
// as a proxy, and is the floor the labelled run is compared against.
//
// No rule, threshold or label in this file names a fund, a country or a sector.
import { readFileSync } from "fs";
import { Client } from "pg";
import { loadEnvLocal, requireCredentials } from "./loadEnv";
import { canopy, loadGates, readPub, type GateRow } from "./_wscc_demand";

loadEnvLocal();
requireCredentials("wscc_ceiling", ["DATABASE_URL"]);
const VOCAB = JSON.parse(readFileSync(process.cwd() + "/../../data/vocabularies.json", "utf8"));
const ENUMS: Set<string> = new Set(Object.keys(VOCAB.enumValues));
/** Geographic fields carry a derived option list rather than a literal one, so
 *  they are enumerable in the same sense: the founder picks from a set. */
const GEO_ENUM = new Set(["region", "entityCountries"]);
const TAU = Number(process.env.TAU ?? 0.72);
const LABELS = process.env.LABELS;
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
    `SELECT id, parent_id, country, delivery_region, capital_type, award_p50,
            eligibility_text, catchment_regions FROM funding_instruments`);
  const pop = ids ? rows.filter((r) => ids.has(String(r.id))) : rows;
  const parentOf = new Map<string, string>(rows.map((r) => [String(r.id), String(r.parent_id ?? r.id)]));

  const all = await loadGates(db, ids);
  const filters = all.filter((r) => r.role === "filter");
  const cid = canopy(filters, TAU);
  const clusterOf = new Map<GateRow, number>();
  filters.forEach((r, i) => clusterOf.set(r, cid[i]));

  const byRegime = new Map<string, Row[]>();
  for (const r of pop) { const p = String(r.parent_id ?? r.id); (byRegime.get(p) ?? byRegime.set(p, []).get(p)!).push(r); }
  const groups = [...byRegime.values()].filter((x) => x.length > 1);
  const leaves = groups.reduce((a, x) => a + x.length, 0);
  console.log(`instruments ${rows.length}, publishable ${pop.length}, multi-leaf regimes ${groups.length}, leaves ${leaves}`);
  console.log(`filter gates ${filters.length}; demand clusters at TAU ${TAU}: ${new Set(cid).size}\n`);

  // ── the split ─────────────────────────────────────────────────────────────
  const labels: Record<string, string> | null = LABELS ? JSON.parse(readFileSync(LABELS, "utf8")) : null;
  const structural = (r: GateRow) =>
    (r.field !== "none" && (ENUMS.has(r.field) || GEO_ENUM.has(r.field))) ? "C1" : "C2F";
  const classOf = (r: GateRow): string => {
    if (labels) {
      const l = labels[String(clusterOf.get(r))];
      if (l) return l;
    }
    return structural(r);
  };
  const klass = new Map<GateRow, string>(filters.map((r) => [r, classOf(r)]));

  {
    const n = new Map<string, { g: number; c: Set<number>; i: Set<string>; enc: number }>();
    for (const r of filters) {
      const k = klass.get(r)!;
      const e = n.get(k) ?? { g: 0, c: new Set<number>(), i: new Set<string>(), enc: 0 };
      e.g++; e.c.add(clusterOf.get(r)!); e.i.add(r.iid); if (r.spec != null) e.enc++;
      n.set(k, e);
    }
    console.log(`SPLIT of the filter population  (${labels ? "MODEL LABELS " + LABELS : "STRUCTURAL PROXY — C1 vs not-C1 only"})`);
    console.log("class".padEnd(6) + "gates".padStart(7) + "clusters".padStart(10) + "instruments".padStart(13) + "already encoded".padStart(17));
    for (const [k, e] of [...n].sort((a, b) => b[1].g - a[1].g))
      console.log(k.padEnd(6) + String(e.g).padStart(7) + String(e.c.size).padStart(10) +
        String(e.i.size).padStart(13) + `${e.enc} (${Math.round(100 * e.enc / e.g)}%)`.padStart(17));
    // The unencoded population, split the same way — the coordinator's question.
    const un = filters.filter((r) => r.spec == null);
    const m = new Map<string, number>();
    for (const r of un) m.set(klass.get(r)!, (m.get(klass.get(r)!) ?? 0) + 1);
    console.log(`\nUNENCODED filter gates (value_spec IS NULL): ${un.length}`);
    for (const [k, v] of [...m].sort((a, b) => b[1] - a[1]))
      console.log(`  ${k.padEnd(6)} ${String(v).padStart(5)}  ${(100 * v / un.length).toFixed(1)}%`);
  }

  // ── the arms ──────────────────────────────────────────────────────────────
  // Every arm names, in its label, WHAT THE FOUNDER HAS TO SAY to earn it.
  const demandKey = (pick: (r: GateRow) => boolean) => {
    const per = new Map<string, Set<number>>();
    for (const r of filters) {
      if (!pick(r)) continue;
      (per.get(r.iid) ?? per.set(r.iid, new Set()).get(r.iid)!).add(clusterOf.get(r)!);
    }
    return (row: Row) => {
      const s = per.get(String(row.id));
      return s ? [...s].sort((a, b) => a - b).join(",") : "";
    };
  };
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
  const verbatimKey = (pick: (r: GateRow) => boolean) => {
    const per = new Map<string, Set<string>>();
    for (const r of filters) {
      if (!pick(r)) continue;
      (per.get(r.iid) ?? per.set(r.iid, new Set()).get(r.iid)!).add(h(r.value ?? r.requirement));
    }
    return (row: Row) => {
      const s = per.get(String(row.id));
      return s ? [...s].sort().join("~") : "";
    };
  };

  const SIX = ["ticketBand", "sector", "useOfFunds", "region", "consortium", "entityCountries"];
  const geo = (r: Row) => h(r.delivery_region);
  const geoCap = (r: Row) => h(r.delivery_region) + "|" + h(r.capital_type);
  const six = specKey(SIX);
  const allSpec = specKey(null);
  const isC1 = (r: GateRow) => klass.get(r) === "C1";
  const isC2 = (r: GateRow) => klass.get(r) === "C2";
  const isF = (r: GateRow) => klass.get(r) === "F";
  const notU = (r: GateRow) => klass.get(r) !== "U";
  const c1k = demandKey(isC1), c2k = demandKey(isC2), fk = demandKey(isF);
  const c2fk = demandKey((r) => klass.get(r) === "C2F" || isC2(r) || isF(r));

  type Arm = [string, (r: Row) => string, string];
  const arms: Arm[] = [
    ["nothing asked", () => "", "—"],
    ["TODAY: the six fields that already rank", (r) => six(r) + "|" + geo(r),
      "the six first-page answers"],
    ["+ every mapped field's comparator (wsCA 43.1)", (r) => allSpec(r) + "|" + geoCap(r),
      "every one of today's 25 fields, answered perfectly"],
    ["RICH-CRISP-ENUM  C1 demands, at demand granularity", (r) => c1k(r) + "|" + geoCap(r),
      "every printable attribute of the company: size, money, place, stage, status"],
    ["RICH-BESPOKE     C2 demands, at demand granularity", (r) => c2k(r) + "|" + geoCap(r),
      "every number about the project in the scheme's own units"],
    ["RICH-FUZZY       F  demands, at demand granularity", (r) => fk(r) + "|" + geoCap(r),
      "prose about the technology, the plan and the money"],
    ["RICH-CRISP  C1+C2", (r) => c1k(r) + "#" + c2k(r) + "|" + geoCap(r), "attributes + bespoke numbers"],
    ["RICH FULL   C1+C2+F  — THE CEILING UNDER A RICH PROFILE",
      (r) => c1k(r) + "#" + c2k(r) + "#" + fk(r) + "#" + c2fk(r) + "|" + geoCap(r),
      "everything a founder or their VC could truthfully say"],
    ["  [circular, for reference] verbatim requirement text", (r) => verbatimKey(() => true)(r) + "|" + geoCap(r),
      "the fund's own sentence, word for word — a founder cannot state this"],
    ["  [circular, for reference] verbatim eligibility_text", (r) => h(r.eligibility_text) + "|" + geoCap(r),
      "the fund's whole eligibility page — a founder cannot state this"],
  ];

  const base = ceil5(groups, arms[1][1]);
  console.log("\n=== CEILING@5 on wsCA's population, so the numbers compose with 40.0 / 43.1 / 62.0 / 85.5 ===");
  console.log("arm".padEnd(56) + "mean".padStart(8) + "alone".padStart(8) + "CEIL@5".padStart(9) +
    "gain/today".padStart(12) + "regimes".padStart(9) + "top share".padStart(11));
  for (const [label, key] of arms) {
    const c = ceil5(groups, key);
    const gained = [...c.fits].filter((id) => !base.fits.has(id));
    const byReg = new Map<string, number>();
    for (const id of gained) { const p = parentOf.get(id)!; byReg.set(p, (byReg.get(p) ?? 0) + 1); }
    const top = [...byReg].sort((a, b) => b[1] - a[1])[0];
    console.log(label.padEnd(56) + c.mean.toFixed(2).padStart(8) + `${c.at1.toFixed(1)}%`.padStart(8) +
      `${c.at5.toFixed(1)}%`.padStart(9) +
      `${c.at5 - base.at5 >= 0 ? "+" : ""}${(c.at5 - base.at5).toFixed(1)}`.padStart(12) +
      String(byReg.size).padStart(9) +
      (top ? `${Math.round(100 * top[1] / gained.length)}%` : "-").padStart(11));
  }
  console.log("\nwhat the founder must SAY to earn each arm:");
  for (const [label, , says] of arms) console.log(`  ${label.trim().padEnd(54)} ${says}`);

  // ── TAU sweep: does the collapse do real work, and does TAU -> 1 recover
  //    the circular number? ───────────────────────────────────────────────────
  console.log("\n=== GRANULARITY SWEEP — the ceiling as a function of how coarsely two demands are");
  console.log("    allowed to mean the same thing. TAU -> 1 is the circular verbatim reading. ===");
  console.log("TAU".padEnd(7) + "clusters".padStart(10) + "RICH FULL CEIL@5".padStart(19));
  // TAU > 1 means "no two demands ever mean the same thing": the cluster id is
  // the normalised requirement TEXT, which is exactly wsCA's circular reading.
  const textIds = (() => {
    const m = new Map<string, number>();
    return filters.map((r) => {
      const k = h(r.value ?? r.requirement);
      if (!m.has(k)) m.set(k, m.size);
      return m.get(k)!;
    });
  })();
  for (const tau of [1.01, 0.95, 0.9, 0.85, 0.8, 0.75, 0.72, 0.7, 0.65, 0.6]) {
    const c2 = tau > 1 ? textIds : canopy(filters, tau);
    const co = new Map<GateRow, number>(); filters.forEach((r, i) => co.set(r, c2[i]));
    const per = new Map<string, Set<number>>();
    for (const r of filters) {
      if (klass.get(r) === "U") continue;
      (per.get(r.iid) ?? per.set(r.iid, new Set()).get(r.iid)!).add(co.get(r)!);
    }
    const c = ceil5(groups, (row) => {
      const s = per.get(String(row.id));
      return (s ? [...s].sort((a, b) => a - b).join(",") : "") + "|" + geoCap(row);
    });
    console.log((tau > 1 ? "verbatim" : tau.toFixed(2)).padEnd(7) + String(new Set(c2).size).padStart(10) +
      `${c.at5.toFixed(1)}%`.padStart(19));
  }

  // ── QUESTION BUDGET — the ceiling if the intake covers only the k most
  //    demanded clusters. "95% if we ask forty things" is not a product. ──────
  console.log("\n=== QUESTION BUDGET — ceiling if the profile answers only the k demand clusters");
  console.log("    that the most funds ask about (ranked by instrument reach, never by fund name) ===");
  const reach = new Map<number, Set<string>>();
  for (const r of filters) {
    if (klass.get(r) === "U") continue;
    (reach.get(clusterOf.get(r)!) ?? reach.set(clusterOf.get(r)!, new Set()).get(clusterOf.get(r)!)!).add(r.iid);
  }
  const ranked = [...reach.entries()].sort((a, b) => b[1].size - a[1].size).map(([c]) => c);
  console.log("k".padStart(5) + "CEIL@5".padStart(9) + "  cumulative share of filter gates covered");
  for (const k of [1, 2, 3, 5, 8, 12, 20, 30, 50, 80, 150, 300, ranked.length]) {
    if (k > ranked.length) continue;
    const keep = new Set(ranked.slice(0, k));
    const per = new Map<string, Set<number>>();
    let covered = 0;
    for (const r of filters) {
      const c0 = clusterOf.get(r)!;
      if (klass.get(r) === "U" || !keep.has(c0)) continue;
      covered++;
      (per.get(r.iid) ?? per.set(r.iid, new Set()).get(r.iid)!).add(c0);
    }
    const c = ceil5(groups, (row) => {
      const s = per.get(String(row.id));
      return (s ? [...s].sort((a, b) => a - b).join(",") : "") + "|" + geoCap(row);
    });
    console.log(String(k).padStart(5) + `${c.at5.toFixed(1)}%`.padStart(9) +
      `        ${(100 * covered / filters.length).toFixed(1)}%`);
  }

  // ── The whole publishable offer, not only the contested half ──────────────
  const singles = pop.length - leaves;
  console.log(`\nNOTE ON DENOMINATOR: ${leaves} of ${pop.length} publishable instruments sit in a multi-leaf`);
  console.log(`regime; the other ${singles} are their own regime and are trivially "alone". A ceiling of C on`);
  console.log(`the ${leaves} is a ceiling of (${singles} + ${leaves}*C/100)/${pop.length} over the whole offer.`);
  await db.end();
})();
