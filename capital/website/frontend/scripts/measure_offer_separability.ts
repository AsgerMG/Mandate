// Can the leaf's OWN OFFER tell it apart from its siblings at all?
//
//   npx tsx scripts/measure_offer_separability.ts
//   SPLIT=all npx tsx scripts/measure_offer_separability.ts
//
// ── THE 27% / 39% THIS PRINTS IS NOT THE CORPUS'S CEILING ─────────────────
// Corrected 2026-08-08. The class this sizes is indistinguishable ON THESE SIX
// FACETS. Three recorded columns are missing from them -- administering_body,
// delivery_region and the verbatim eligibility_text -- and they separate
// better: keyed on all three, `measure_sibling_coverage.ts` measures mean class
// 18.0 against the 31.3 here, over the same population. So this is a bound on a
// chooser that reads only the offer, and a FLOOR on the bound for a chooser
// that reads what the corpus actually holds. The method is still the point --
// a ceiling computed off the corpus, needing no answers and no fitting, bounds
// every such chooser at once -- but do not quote the number as the ceiling.
// See project-mgmt/research/target_arithmetic.md and
// project-mgmt/findings/leaf_separation_wsAO.md.
//
// ── Why this runs before any chooser is built ─────────────────────────────
// Every within-regime signal measured so far is a posterior over award
// history: who a fund has PAID. Sector reaches 14.7% @1 and then collapses
// 34.5% -> 10.9% across a temporal split, because it is fitting this corpus's
// history rather than what makes a fund the right answer. The proposed
// replacement is a chooser built on the leaf's own offer — the form of money,
// the order of magnitude of its cheques, its registered basis and admitted use
// of funds — matched against what the founder states about themselves. Those
// are properties of the instrument, true of a fund that has never made an
// award, and a founder can answer all of them without looking anything up.
//
// Before fitting anything to that idea, it is worth asking what its CEILING
// is, because the ceiling is computable exactly and needs no founder answers,
// no fitting and no evaluation. If two siblings record the same capital type,
// the same award magnitude, the same article and the same use of funds, then
// NO chooser reading those facts can prefer one over the other, however
// perfectly the founder answers. The size of that indistinguishable class is
// the whole story.
//
// ── The bound, stated exactly ─────────────────────────────────────────────
// A sibling can only be ruled out when the corpus RECORDS a fact about it that
// differs from the founder's requirement. So two leaves are indistinguishable
// when, on every facet, they either agree or at least one of them has no value
// on record — a gap in our data is not evidence of difference, and must never
// be read as one. That is deliberately the GENEROUS reading in the chooser's
// favour on agreement and the honest one on absence.
//
// If the won leaf sits in an indistinguishable class of size k inside its
// regime, a perfect offer chooser scores at best 1/k on that case: it can
// narrow the group to the class and must then guess inside it. Averaging 1/k
// over cases gives the oracle @1 of ANY chooser built from these facts.
//
// This number cannot be argued with by building a better chooser. It is a
// property of the corpus.
import { readFileSync } from "fs";

try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* rely on the process environment */ }
if (process.env.NO_PG) delete process.env.DATABASE_URL;

import path from "path";
import {
  hydrateDbInstruments, hydrateGatesFor, type DbInstrument,
} from "../lib/intelligence/corpus";
import { TICKET_BANDS } from "../lib/intelligence/types";
import { buildRegimeCases, sizeQuantiles, type RegimeCase } from "./regimeCases";

/** Upper edge of each ticket band, in euros; the last is open-ended. A founder
 *  answers at BAND resolution, so that is the resolution at which two award
 *  medians are genuinely different offers. Finer would credit the chooser with
 *  a distinction the intake cannot express. */
const BAND_MAX: Record<string, number> = {
  lt500k: 500_000, b500k_2m5: 2_500_000, b2m5_15m: 15_000_000,
  b15m_50m: 50_000_000, gt50m: Infinity,
};
const bandOf = (eur: number): string =>
  TICKET_BANDS.map((b) => b.value).find((v) => eur < BAND_MAX[v]) ?? "gt50m";

/** Below this many priced awards a "typical" award is one or two events
 *  wearing a statistic's clothing — corpus.ts's own rule for awardP50. */
const AWARD_N_FLOOR = 5;

type Objectives = Record<string, { useOfFunds: string[]; articles: string[] }>;
const objectives: Objectives = (() => {
  try {
    return JSON.parse(readFileSync(
      path.join(process.cwd(), "lib", "intelligence", "__objectives.json"), "utf8"));
  } catch { return {}; }
})();

/** One facet of what a leaf OFFERS. `undefined` means the corpus records
 *  nothing — never a value in its own right, because "we did not capture it"
 *  and "it does not do that" are different statements and only the second one
 *  may exclude a fund. */
type Facet = (i: DbInstrument) => string | undefined;

const FACETS: [string, string, Facet][] = [
  // Form of money. The founder answers this as `capitalSought`, and it is the
  // hardest of the facets: a grant and a loan are not substitutes for each
  // other whatever else they share.
  ["capital", "capitalType (grant/loan/equity/...)",
    (i) => i.capitalType || undefined],
  // Order of magnitude of the cheque, at the resolution `ticketBand` asks it.
  ["magnitude", "awardP50 bucketed to the founder's ticket band",
    (i) => (i.awardP50 != null && i.awardP50 > 0 && (i.awardN ?? 0) >= AWARD_N_FLOOR)
      ? bandOf(i.awardP50) : undefined],
  // Registered legal basis. A property of the REGISTRATION, not of anyone it
  // has paid — true on the day the scheme opens.
  ["article", "registered GBER article(s)",
    (i) => { const a = objectives[i.id]?.articles; return a?.length ? [...a].sort().join("+") : undefined; }],
  // What the registration admits the money may be spent on, which is what
  // `useOfFunds` asks the founder.
  ["purpose", "registered use of funds",
    (i) => { const u = objectives[i.id]?.useOfFunds; return u?.length ? [...u].sort().join("+") : undefined; }],
  // Whether it is still open. publishableInstruments() already drops closed
  // schemes, so this is expected to separate nothing — reported anyway, because
  // "we checked and it was already handled" is a finding and an assumption is not.
  ["open", "still open to applications",
    (i) => i.schemeEndDate ? (i.schemeEndDate < new Date().toISOString().slice(0, 10) ? "closed" : "open") : undefined],
  // Encoded eligibility. `measure_sibling_choice` grades this as a COUNT of
  // gates and gets the guessing baseline, but a count is not what a gate is
  // for: two leaves are told apart by WHICH intake field each one screens on
  // and what it demands, which is exactly what a founder answers. Only filter
  // gates carrying a value_spec are used — those are the ones that can decide
  // anything — and an instrument's OWN gates only, since a gate inherited from
  // the parent is by construction shared with every sibling and can separate
  // nobody.
  ["gates", "own encoded filter gates (field + spec)",
    (i) => {
      const own = i.gates.filter((g) =>
        !g.inherited && g.valueSpec != null && (!g.gateRole || g.gateRole === "filter"));
      if (!own.length) return undefined;
      return [...new Set(own.map((g) =>
        `${g.intakeFieldResolved ?? g.intakeField}=${JSON.stringify(g.valueSpec)}`))].sort().join("|");
    }],
];

/** Indistinguishable on a facet set: agree wherever both are on record. */
const compatible = (a: DbInstrument, b: DbInstrument, facets: typeof FACETS): boolean =>
  facets.every(([, , f]) => {
    const x = f(a), y = f(b);
    return x === undefined || y === undefined || x === y;
  });

/** |class| of the won leaf, and hence the best a perfect chooser can do. */
const classSize = (c: RegimeCase, facets: typeof FACETS): number =>
  c.group.filter((i) => compatible(c.want, i, facets)).length;

async function main() {
  await hydrateDbInstruments();
  const { file, split, narrow, cases, alone } = buildRegimeCases();
  const q = sizeQuantiles(cases);
  console.log(`\nset=${file} split=${split} country-narrowed=${narrow}`);
  console.log(`  cases ${cases.length}  (${alone} skipped: no sector, or won fund alone in its regime here)`);
  console.log(`  regime size  p10 ${q(0.1)}  median ${q(0.5)}  p90 ${q(0.9)}`);

  // ── Coverage first ────────────────────────────────────────────────────────
  // A facet that is absent cannot separate anything, so coverage bounds every
  // number below it. Reported over the LEAVES the chooser must actually order,
  // not over the corpus, because the corpus average is not what it sees.
  const leaves = new Map<string, DbInstrument>();
  for (const c of cases) for (const i of c.group) leaves.set(i.id, i);
  const universe = [...leaves.values()];
  // ── Gates are LAZY, and a harness that forgets it measures an empty array ──
  // The Postgres path loads FRAMEWORK gates only (corpus.ts, "PHASE ONE"), so
  // every leaf here arrives with `gates: []` until phase two is asked for by
  // id. Grading an eligibility signal without this call does not measure a weak
  // signal, it measures nothing at all, and it returns the tie-break baseline
  // that looks exactly like a signal that does not separate. No-op on the JSON
  // path, which ships every gate already.
  await hydrateGatesFor(universe.map((i) => i.id));
  console.log(`\n── facet coverage over the ${universe.length} leaves that appear in a graded group ──`);
  console.log(`  ${"facet".padEnd(12)} ${"on record".padStart(10)}   ${"distinct".padStart(8)}   what it is`);
  for (const [name, desc, f] of FACETS) {
    const vals = universe.map(f).filter((v): v is string => v !== undefined);
    console.log(`  ${name.padEnd(12)} ${`${(100 * vals.length / universe.length).toFixed(1)}%`.padStart(10)}`
      + `   ${String(new Set(vals).size).padStart(8)}   ${desc}`);
  }

  // ── The ceiling ───────────────────────────────────────────────────────────
  const oracle = (facets: typeof FACETS, subset = cases) =>
    100 * subset.reduce((a, c) => a + 1 / classSize(c, facets), 0) / subset.length;
  // What the founder's own group costs them: how many siblings survive.
  const meanClass = (facets: typeof FACETS, subset = cases) =>
    subset.reduce((a, c) => a + classSize(c, facets), 0) / subset.length;
  const uniform = (subset: RegimeCase[]) =>
    100 * subset.reduce((a, c) => a + 1 / c.group.length, 0) / subset.length;

  // @3 as well as @1, because the collapse shape puts five regimes on the page
  // and the brief asks both. A perfect chooser can put the whole
  // indistinguishable class in the top three when it fits, so its @3 is
  // min(1, 3/k) — the same bound, read three seats wide.
  const oracleAt = (n: number, facets: typeof FACETS, subset = cases) =>
    100 * subset.reduce((a, c) => a + Math.min(1, n / classSize(c, facets)), 0) / subset.length;

  console.log(`\n── ORACLE: the best ANY chooser reading these facts can do ──`);
  console.log(`  ${"facets used".padEnd(34)} ${"class".padStart(7)} ${"oracle@1".padStart(9)} ${"oracle@3".padStart(9)}`);
  console.log(`  ${"none (the whole regime)".padEnd(34)} `
    + `${meanClass([]).toFixed(1).padStart(7)} ${uniform(cases).toFixed(1).padStart(8)}%`
    + ` ${oracleAt(3, []).toFixed(1).padStart(8)}%`);
  for (const facet of FACETS) {
    console.log(`  ${`${facet[0]} alone`.padEnd(34)} `
      + `${meanClass([facet]).toFixed(1).padStart(7)} ${oracle([facet]).toFixed(1).padStart(8)}%`
      + ` ${oracleAt(3, [facet]).toFixed(1).padStart(8)}%`);
  }
  console.log(`  ${"ALL FACETS TOGETHER".padEnd(34)} `
    + `${meanClass(FACETS).toFixed(1).padStart(7)} ${oracle(FACETS).toFixed(1).padStart(8)}%`
    + ` ${oracleAt(3, FACETS).toFixed(1).padStart(8)}%`);

  // Sensitivity: read a missing value as its own answer. This is the version
  // that OVERSTATES the ceiling — it lets the chooser exclude a sibling for a
  // gap in our data — and it is printed only to show how much of the ceiling
  // rests on absence rather than on recorded difference.
  const strictFacets = FACETS.map(([n, d, f]) =>
    [n, d, (i: DbInstrument) => f(i) ?? "<not on record>"] as [string, string, Facet]);
  console.log(`  ${"...if absence counted as a value".padEnd(34)} `
    + `${meanClass(strictFacets).toFixed(1).padStart(7)} ${oracle(strictFacets).toFixed(1).padStart(8)}%`
    + `   <- overstates: excludes on a data gap`);

  // ── Where the ceiling is binding ──────────────────────────────────────────
  // The aggregate is dominated by one shape (median-60 regimes in five
  // countries). A ceiling that is comfortable on small regimes and impossible
  // on large ones is not one number, and the product lives in the large ones.
  const strat = (label: string, subset: RegimeCase[]) => {
    if (subset.length < 5) { console.log(`  ${label.padEnd(26)} ${String(subset.length).padStart(5)}   (too few to read)`); return; }
    console.log(`  ${label.padEnd(26)} ${String(subset.length).padStart(5)} `
      + `${uniform(subset).toFixed(1).padStart(7)}% ${meanClass(FACETS, subset).toFixed(1).padStart(7)} `
      + `${oracle(FACETS, subset).toFixed(1).padStart(8)}%`);
  };
  const header = (title: string) => {
    console.log(`\n══ ${title} ${"═".repeat(Math.max(0, 40 - title.length))}`);
    console.log(`  ${"stratum".padEnd(26)} ${"n".padStart(5)} ${"guessing".padStart(8)} ${"class".padStart(7)} ${"oracle@1".padStart(9)}`);
  };
  header("by REGIME SIZE");
  for (const [lo, hi] of [[2, 5], [6, 20], [21, 50], [51, 999]] as const) {
    strat(`${lo}-${hi === 999 ? "+" : hi} siblings`,
      cases.filter((c) => c.group.length >= lo && c.group.length <= hi));
  }
  header("by MODE");
  for (const m of ["project", "profile"]) strat(m, cases.filter((c) => c.mode === m));

  header("by COUNTRY WEIGHT in the corpus");
  const perCountry = new Map<string, number>();
  for (const c of cases) perCountry.set(c.country, (perCountry.get(c.country) ?? 0) + 1);
  const big = new Set([...perCountry].filter(([, n]) => n >= 0.05 * cases.length).map(([k]) => k));
  strat(`large corpus countries (${big.size})`, cases.filter((c) => big.has(c.country)));
  strat(`thin countries (${perCountry.size - big.size})`, cases.filter((c) => !big.has(c.country)));
  for (const [k, n] of [...perCountry].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
    strat(`  ${k} (n=${n})`, cases.filter((c) => c.country === k));
  }

  // ── How much of the regime does the offer actually cut away? ──────────────
  // The complement of the ceiling, in the units the PM's mechanism argument is
  // made in: a founder asking for a EUR 400k grant should not be shown the
  // sibling writing EUR 5M loans. How often is there such a sibling to not show?
  header("what the offer RULES OUT");
  const ruledOut = cases.map((c) => 1 - classSize(c, FACETS) / c.group.length);
  const mean = ruledOut.reduce((a, b) => a + b, 0) / ruledOut.length;
  const sorted = [...ruledOut].sort((a, b) => a - b);
  console.log(`  siblings excluded by the offer: mean ${(100 * mean).toFixed(1)}%`
    + `  median ${(100 * sorted[Math.floor(0.5 * sorted.length)]).toFixed(1)}%`);
  const nothing = cases.filter((c) => classSize(c, FACETS) === c.group.length).length;
  console.log(`  cases where the offer excludes NOTHING: ${nothing}`
    + ` (${(100 * nothing / cases.length).toFixed(1)}%)`);
  const alone1 = cases.filter((c) => classSize(c, FACETS) === 1).length;
  console.log(`  cases where the offer isolates the won leaf ALONE: ${alone1}`
    + ` (${(100 * alone1 / cases.length).toFixed(1)}%)   <- the only cases a perfect offer chooser gets right for certain`);

  // ── Is this chooser temporally stable? Answered by construction ───────────
  // The sector posterior collapsed 34.5% -> 10.9% across a cut year because it
  // is FITTED to who a fund has paid, and last cohort's mix is not next
  // cohort's. The right question for these facets is not "does it survive a
  // refit" but "is there anything here to refit at all", and for five of the
  // six there is not: capital type, GBER article, registered purpose, encoded
  // gates and the closing date are all properties of the REGISTRATION. They are
  // recorded when the scheme is notified, they are true of a scheme that has
  // never paid anyone, and no cut year changes them.
  //
  // Exactly one facet is derived from award history — `magnitude`, the median
  // cheque — so the whole temporal exposure of the chooser is the gap between
  // these two lines. If it is small, there is nothing here for a cut year to
  // break, and no refit experiment is needed to say so.
  const registrationOnly = FACETS.filter(([n]) => n !== "magnitude");
  header("temporal exposure: what rests on award history");
  console.log(`  ${"registration facts only".padEnd(26)} ${String(cases.length).padStart(5)} `
    + `${uniform(cases).toFixed(1).padStart(7)}% ${meanClass(registrationOnly).toFixed(1).padStart(7)} `
    + `${oracle(registrationOnly).toFixed(1).padStart(8)}%`);
  console.log(`  ${"+ award magnitude".padEnd(26)} ${String(cases.length).padStart(5)} `
    + `${uniform(cases).toFixed(1).padStart(7)}% ${meanClass(FACETS).toFixed(1).padStart(7)} `
    + `${oracle(FACETS).toFixed(1).padStart(8)}%`);
  console.log(`  the second line is the ONLY part a cut year can move.`);

  // ── What the missing 2/3 of the register would buy ────────────────────────
  // `article` and `purpose` are the two facets that separate anything, and both
  // are on record for only a third of the leaves. That is a COVERAGE fact, not
  // a fact about the signal, and the two must not be confused: the ceiling
  // below is what the same chooser would reach if the register were complete.
  // If it is much higher than the headline, the binding constraint is an ETL
  // job rather than a modelling one, and that is a different instruction to the
  // PM than "this cannot work".
  const registered = cases.filter((c) => FACETS
    .filter(([n]) => n === "article" || n === "purpose")
    .every(([, , f]) => f(c.want) !== undefined));
  header("if the REGISTER were complete");
  console.log(`  cases whose won leaf has a registered basis today: ${registered.length}`
    + ` (${(100 * registered.length / cases.length).toFixed(1)}%)`);
  if (registered.length >= 5) {
    console.log(`  ${"...their oracle@1".padEnd(26)} ${String(registered.length).padStart(5)} `
      + `${uniform(registered).toFixed(1).padStart(7)}% ${meanClass(FACETS, registered).toFixed(1).padStart(7)} `
      + `${oracle(FACETS, registered).toFixed(1).padStart(8)}%`);
    // The same cases scored WITHOUT the register, which isolates what the
    // register itself is worth from what those cases are worth.
    const noReg = FACETS.filter(([n]) => n !== "article" && n !== "purpose");
    console.log(`  ${"...the same cases, no register".padEnd(26)} ${String(registered.length).padStart(5)} `
      + `${uniform(registered).toFixed(1).padStart(7)}% ${meanClass(noReg, registered).toFixed(1).padStart(7)} `
      + `${oracle(noReg, registered).toFixed(1).padStart(8)}%`);
  }

  // ── Does the offer ADD to the signal that already exists? ─────────────────
  // The ceiling above is the offer's own. The product question is different and
  // sharper: sector already reaches 14.7% @1, so is the offer worth wiring in
  // at all? Answered as an oracle over BOTH — narrow the group to the
  // indistinguishable class (a perfect founder, perfectly matched), then order
  // what is left by the shipped sector scorer. That is the strongest hybrid
  // these two facts can support, and it is still an upper bound: no real
  // founder answers the offer facets as perfectly as the won leaf's own record.
  const { sectorScorer } = await import("../lib/intelligence/sectorPrior");
  const rankIn = (group: DbInstrument[], c: RegimeCase) => {
    const sc = sectorScorer(group, c.sector);
    return [...group].sort((x, y) => (sc(y) - sc(x)) || x.id.localeCompare(y.id))
      .findIndex((i) => i.id === c.want.id) + 1;
  };
  let sectorOnly1 = 0, sectorOnly3 = 0, hybrid1 = 0, hybrid3 = 0;
  for (const c of cases) {
    const r = rankIn(c.group, c);
    if (r === 1) sectorOnly1++;
    if (r <= 3) sectorOnly3++;
    const cls = c.group.filter((i) => compatible(c.want, i, FACETS));
    const h = rankIn(cls, c);
    if (h === 1) hybrid1++;
    if (h <= 3) hybrid3++;
  }
  const p = (x: number) => `${(100 * x / cases.length).toFixed(1)}%`;
  header("does the offer ADD to the sector signal already measured?");
  console.log(`  sector alone, whole regime          @1 ${p(sectorOnly1)}   @3 ${p(sectorOnly3)}`);
  console.log(`  offer-class first, then sector      @1 ${p(hybrid1)}   @3 ${p(hybrid3)}`
    + `   <- upper bound on any hybrid`);

  // ── The regime-level view, to connect to workstream G's count ─────────────
  // G reported "38 of 53 multi-member regimes are heterogeneous". That counts
  // REGIMES; the line above counts CASES, weighted by how often each regime is
  // actually won, which is the decision-relevant weighting. Both are printed so
  // the two numbers are never mistaken for each other.
  const byRegime = new Map<string, DbInstrument[]>();
  for (const c of cases) if (c.want.parentId) byRegime.set(c.want.parentId, c.group);
  let het = 0;
  for (const g of byRegime.values()) {
    if (FACETS.some(([, , f]) => new Set(g.map(f).filter((v) => v !== undefined)).size > 1)) het++;
  }
  console.log(`\n  regimes appearing in the graded set: ${byRegime.size}`
    + `, heterogeneous on at least one facet: ${het} (${(100 * het / byRegime.size).toFixed(0)}%)`);
}
main();
