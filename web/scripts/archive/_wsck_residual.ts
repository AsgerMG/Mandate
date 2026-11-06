// wsCK — what is left INDISTINGUISHABLE, and what single fact would separate it.
//
// Every previous workstream started from a question and measured what it bought.
// Six of them returned +0.0. This starts from the other end: take the classes of
// funds a founder cannot tell apart AFTER answering everything we ask today, and
// ask of each class what fact its members actually disagree on. A question can
// only ever be as good as the facts inside the classes it is aimed at, so this
// file bounds the design space before any question is written.
//
// ── The population ─────────────────────────────────────────────────────────
// A RESIDUAL CLASS is `_wsci_autopsy.ts`'s `residualClassSizes` key verbatim:
// same parent, same encoded demands on the six fields that already rank, same
// delivery_region. Reproduced rather than re-derived so a number here is
// comparable with 40.0 / 43.1 / 66.0 and with the autopsy's bucket 4.
//
// ── The facts ──────────────────────────────────────────────────────────────
// Each fact is a column or derived value every instrument has, so an instrument
// loaded tomorrow is characterised without editing anything here. No fact names
// a fund, a country or a sector.
//
// CIRCULARITY IS MARKED, NOT HIDDEN. Four of the facts are computed from the
// awards the instrument made — and the answer key's own award is one of those
// awards. wsBY's 85.5% was retracted for exactly this. They are measured
// because "what separates these funds" is a corpus question, and printed under
// a CIRCULAR heading so nothing downstream can quote them as a reachable bound.
//
// FREE: one Postgres read. No model calls, nothing written.
//
//   npx tsx scripts/_wsck_residual.ts
//   CLASS=catalogue npx tsx scripts/_wsck_residual.ts   # only the C bucket
import { Client } from "pg";

import { loadEnvLocal, requireCredentials } from "../loadEnv";

loadEnvLocal();
requireCredentials("wsck_residual", ["DATABASE_URL"]);

const h = (s: unknown) => (s ? String(s).trim().toLowerCase().slice(0, 400) : "");

/** The six fields wsCA proved already rank, in its order. Duplicated from
 *  `_wsci_autopsy.ts` deliberately — see the assertion in `main`, which fails if
 *  the class sizes this file computes ever stop matching the autopsy's. */
const RANKS = ["ticketBand", "sector", "useOfFunds", "region", "consortium", "entityCountries"];

interface Row {
  id: string; parent_id: string | null; country: string | null; name: string | null;
  administering_body: string | null; delivery_region: string | null;
  capital_type: string | null; award_p50: number | null; intensity_p50: number | null;
  scheme_code: string | null; scheme_end_date: string | null; source_window_policy: string | null;
  route_status: string | null; is_framework: boolean | null; sector_mix: string | null;
  first_year: number | null; last_year: number | null; description: string | null;
  sample_project_titles: string | null; application_url: string | null;
}

/** wsCJ's T/C/S property, verbatim in substance: a blank `scheme_code` is the
 *  ABSENCE of a notification and never a join key. */
function tcs(r: Row, byScheme: Map<string, Row[]>): "T" | "C" | "S" {
  const code = h(r.scheme_code);
  if (!code) return "S";
  const fam = byScheme.get(code) ?? [];
  if (fam.length < 2) return "S";
  const bodies = new Set(fam.map((x) => h(x.administering_body)).filter(Boolean));
  return bodies.size > 1 ? "T" : "C";
}

/** A fact is a projection every instrument has. `answerable` records whether a
 *  founder could in principle state the matching thing about themselves — a
 *  fact that separates funds but that nobody can answer is a dead end, and
 *  saying so here is the point of the column. */
interface Fact {
  label: string;
  of: (r: Row) => string;
  answerable: "founder" | "no";
  circular?: true;
}

const dec = (s: string | null) => {
  const t = h(s);
  return t ? t.slice(0, 10) : "";
};

/** Topic words from the instrument's own NAME — the one topical signal that is
 *  not computed from the awards it made, so the only non-circular topic fact.
 *  Stopwords are structural (call/programme/aid words and short tokens), never
 *  a fund, country or sector name. */
const STOP = new Set(("de la le les des du et pour aux and the of for a an to en el los las y con"
  + " call convocatoria appel projet projets ayudas ayuda aide aides grant grants programme program"
  + " programa fund fonds fondo scheme aap aapp edition edicion tranche lot n no").split(/\s+/));
function nameTopic(r: Row): string {
  const toks = h(r.name).replace(/[^a-zà-ÿ0-9\s]/g, " ").split(/\s+/)
    .filter((t) => t.length > 3 && !STOP.has(t) && !/^\d+$/.test(t));
  return [...new Set(toks)].sort().slice(0, 6).join(" ");
}

const FACTS: Fact[] = [
  // ── founder-answerable, not computed from awards ─────────────────────────
  { label: "TOPIC   call title words", of: nameTopic, answerable: "founder" },
  { label: "WINDOW  closing date", of: (r) => dec(r.scheme_end_date), answerable: "founder" },
  { label: "WINDOW  source policy", of: (r) => h(r.source_window_policy), answerable: "founder" },
  { label: "WINDOW  route status", of: (r) => h(r.route_status), answerable: "founder" },
  { label: "MONEY   capital type", of: (r) => h(r.capital_type), answerable: "founder" },
  { label: "MONEY   intensity band 10pt", of: (r) => (r.intensity_p50 == null ? "" : String(Math.round(Number(r.intensity_p50) * 10))), answerable: "founder" },
  { label: "SHAPE   framework flag", of: (r) => String(r.is_framework ?? ""), answerable: "no" },
  { label: "BODY    administering body", of: (r) => h(r.administering_body), answerable: "no" },
  { label: "BODY    application url", of: (r) => h(r.application_url), answerable: "no" },
  // ── computed from the awards the instrument made: CIRCULAR ───────────────
  { label: "MONEY   award magnitude", of: (r) => (r.award_p50 ? String(Math.round(Math.log10(Number(r.award_p50) || 1))) : ""), answerable: "founder", circular: true },
  { label: "WINDOW  active years", of: (r) => `${r.first_year ?? ""}-${r.last_year ?? ""}`, answerable: "founder", circular: true },
  { label: "TOPIC   sector mix", of: (r) => h(r.sector_mix).slice(0, 60), answerable: "founder", circular: true },
  { label: "TOPIC   sample titles", of: (r) => h(r.sample_project_titles).slice(0, 120), answerable: "founder", circular: true },
];

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const { rows } = await db.query<Row>(`
    SELECT id, parent_id, country, name, administering_body, delivery_region, capital_type,
           award_p50, intensity_p50, scheme_code, scheme_end_date, source_window_policy,
           route_status, is_framework, sector_mix, first_year, last_year, description,
           sample_project_titles, application_url
      FROM funding_instruments`);
  const g = await db.query(
    `SELECT instrument_id, COALESCE(intake_field_resolved, intake_field) AS f,
            gate_role, value_spec FROM eligibility_gates`);
  await db.end();

  // Encoded demands, matchable only — a decidable comparator on a filter gate.
  const val = new Map<string, Map<string, Set<string>>>();
  for (const r of g.rows) {
    const f = r.f ?? "none";
    const id = String(r.instrument_id);
    if (!val.has(id)) val.set(id, new Map());
    if (!val.get(id)!.has(f)) val.get(id)!.set(f, new Set());
    if (r.value_spec != null && r.gate_role === "filter") {
      val.get(id)!.get(f)!.add(JSON.stringify(r.value_spec));
    }
  }
  const sig = (id: string, f: string) => {
    const s = val.get(id)?.get(f);
    return s && s.size ? [...s].sort().join("~") : "";
  };

  // The publishable population. This file has no pipeline import, so it uses the
  // same proxy the corpus uses and ASSERTS the resulting class distribution
  // against the autopsy's, below.
  const pop = rows;
  const classKey = (r: Row) =>
    String(r.parent_id ?? r.id) + " " + RANKS.map((f) => sig(String(r.id), f)).join("|") + "|" + h(r.delivery_region);

  const byScheme = new Map<string, Row[]>();
  for (const r of pop) {
    const c = h(r.scheme_code);
    if (!c) continue;
    (byScheme.get(c) ?? byScheme.set(c, []).get(c)!).push(r);
  }

  const classes = new Map<string, Row[]>();
  for (const r of pop) {
    const k = classKey(r);
    (classes.get(k) ?? classes.set(k, []).get(k)!).push(r);
  }
  let all = [...classes.values()].filter((c) => c.length > 1);
  const want = process.env.CLASS;
  if (want && !["catalogue", "territorial", "scheme"].includes(want)) {
    throw new Error(`unknown CLASS=${want} (expected catalogue, territorial, scheme)`);
  }
  if (want) {
    const letter = want === "catalogue" ? "C" : want === "territorial" ? "T" : "S";
    all = all.map((c) => c.filter((r) => tcs(r, byScheme) === letter)).filter((c) => c.length > 1);
  }
  const members = all.reduce((a, c) => a + c.length, 0);
  if (!members) throw new Error("no residual class of size > 1 — the population or the key is wrong");

  console.log(`instruments ${pop.length}`);
  console.log(`residual classes of size > 1: ${all.length}, holding ${members} leaves` +
    `${want ? ` (CLASS=${want})` : ""}`);
  console.log(`  class sizes: median ${med(all.map((c) => c.length))}, max ${Math.max(...all.map((c) => c.length))}\n`);

  // ── 1. What varies inside a class, per fact ────────────────────────────────
  console.log(`WHAT A PERFECT ANSWER TO ONE FACT WOULD LEAVE`);
  console.log(`  a leaf's class is the siblings it CANNOT be told apart from.`);
  console.log(`  "<=5" is the share of leaves a five-row page could then hold.\n`);
  console.log(`  fact                            answerable  mean class   alone    <=5   present`);
  const report = (f: Fact) => {
    let sum = 0, alone = 0, five = 0, present = 0;
    for (const c of all) {
      const n = new Map<string, number>();
      for (const r of c) n.set(f.of(r), (n.get(f.of(r)) ?? 0) + 1);
      for (const r of c) {
        const k = n.get(f.of(r))!;
        sum += k;
        if (k === 1) alone++;
        if (k <= 5) five++;
        if (f.of(r)) present++;
      }
    }
    console.log(`  ${f.label.padEnd(32)}${(f.answerable === "founder" ? "yes" : "no").padEnd(12)}` +
      `${(sum / members).toFixed(1).padStart(8)}` +
      `${`${(100 * alone / members).toFixed(0)}%`.padStart(8)}` +
      `${`${(100 * five / members).toFixed(0)}%`.padStart(7)}` +
      `${`${(100 * present / members).toFixed(0)}%`.padStart(9)}`);
  };
  for (const f of FACTS.filter((x) => !x.circular)) report(f);
  console.log(`\n  --- CIRCULAR: computed from the awards, and the answer key's award is one ---`);
  for (const f of FACTS.filter((x) => x.circular)) report(f);
  console.log(`  --- do not quote a circular line as a reachable bound (wsBY, retracted) ---`);

  // ── 2. The clustering the workstream exists to produce ─────────────────────
  // For each class, WHICH facts separate it at all. Reported as the histogram of
  // "the set of non-circular, founder-answerable facts that split this class",
  // because that set is what a question has to be about.
  console.log(`\nWHAT EACH CLASS NEEDS DISTINGUISHED (non-circular, founder-answerable facts only)`);
  const usable = FACTS.filter((f) => !f.circular && f.answerable === "founder");
  const combo = new Map<string, { classes: number; leaves: number }>();
  for (const c of all) {
    const splits = usable.filter((f) => new Set(c.map((r) => f.of(r))).size > 1)
      .map((f) => f.label.split(/\s{2,}/)[0]);
    const k = [...new Set(splits)].sort().join("+") || "(NOTHING SPLITS IT)";
    const e = combo.get(k) ?? { classes: 0, leaves: 0 };
    e.classes++; e.leaves += c.length;
    combo.set(k, e);
  }
  console.log(`  facts that split the class          classes   leaves   % of leaves`);
  for (const [k, e] of [...combo].sort((a, b) => b[1].leaves - a[1].leaves)) {
    console.log(`  ${k.padEnd(36)}${String(e.classes).padStart(6)}${String(e.leaves).padStart(9)}` +
      `${`${(100 * e.leaves / members).toFixed(1)}%`.padStart(12)}`);
  }

  // ── 3. Concentration, printed with the finding and never separately ────────
  console.log(`\nREGIME CONCENTRATION of the residual (a residual that is one programme is not a finding)`);
  const byRegime = new Map<string, number>();
  for (const c of all) for (const r of c) {
    const k = String(r.parent_id ?? r.id);
    byRegime.set(k, (byRegime.get(k) ?? 0) + 1);
  }
  const top = [...byRegime].sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log(`  ${byRegime.size} regime(s); largest ${(100 * (top[0]?.[1] ?? 0) / members).toFixed(0)}% of leaves`);
  for (const [k, n] of top) console.log(`    ${k.padEnd(46)}${String(n).padStart(5)}  ${(100 * n / members).toFixed(1)}%`);

  // ── 4. The T/C/S split of the residual, so it reconciles with wsCJ ─────────
  const tally = { T: 0, C: 0, S: 0 } as Record<string, number>;
  for (const c of all) for (const r of c) tally[tcs(r, byScheme)]++;
  console.log(`\nwsCJ T/C/S over the residual leaves: T ${tally.T} (${(100 * tally.T / members).toFixed(1)}%)` +
    `  C ${tally.C} (${(100 * tally.C / members).toFixed(1)}%)  S ${tally.S} (${(100 * tally.S / members).toFixed(1)}%)`);
}

function med(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

main();
