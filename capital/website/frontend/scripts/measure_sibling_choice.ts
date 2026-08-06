// Given the REGIME, which of its delivery bodies is this founder's?
//
// The pool-to-table diagnosis leaves exactly one question. Over the holdout
// cases where the won fund is in the pool and below the cut, 85% are siblings
// outranking the won leaf; the regime is already at median position 2 holding
// 3.07 of the five rows, and the right leaf is in none of them. Decomposed:
//
//   pool 97%  x  regime@5 89%  x  right-leaf-given-regime 40%  =  EXACT@5 36%
//
// So the leaf choice IS the remaining product, and it is worth measuring on its
// own rather than only through a global sort where a real within-group gain can
// be swamped by peer precedence across a 90-fund pool.
//
// This script isolates it: restrict to the won fund's own regime (`parent_id`),
// rank the siblings by one signal, and ask where the leaf that actually paid
// lands. Cheap, leak-free and independent of the display cap, so it can be run
// while the row assembly is being changed underneath it.
//
//   npx tsx scripts/measure_sibling_choice.ts
//   SPLIT=all npx tsx scripts/measure_sibling_choice.ts
//   COUNTRY=0 npx tsx scripts/measure_sibling_choice.ts   # do not narrow to the
//                                                           founder's country
//
// ── Read the two baselines, not the headline ───────────────────────────────
// UNIFORM is 1/|regime| — what guessing scores. POPULARITY is always taking the
// biggest sibling, and it is the honest baseline: a ranker that knows nothing
// still gets it by picking the largest. A signal that beats uniform but not
// popularity has learned that big funds are big.
//
// ── Why the regime and not the same-name group ─────────────────────────────
// `measure_region_routing.ts` asks the same question of the group that shares a
// display NAME (median 7.4 members). That is the group a founder cannot tell
// apart on the page. This one asks it of the whole regime, which is the group
// the table actually spends its rows on: median 76 members, won fund at median
// rank 16 inside it. The two are different questions and both are real.
// ── What this measured, so the next attempt starts after it ───────────────
//
// SECTOR is the strongest within-regime chooser the corpus supports, and it is
// NOT enough on its own. Holdout, n=2,786, median regime 60:
// `share x log1p(count)` puts the won leaf first 14.7% of the time against
// 10.6% for today's clipped `sectorFit`, 6.3% for popularity and 4.3% for
// guessing. It wins in every regime-size, mode and country stratum; none loses.
//
// SECTOR AND REGION ARE ALMOST EXACTLY INDEPENDENT, which is the property a
// second separator has to have. On the 991 holdout cases with a recoverable
// founder region, sector alone is right 20.2% of the time and region alone
// 11.0%; both are right on 2.2% — and 20.2% x 11.0% = 2.2%. The overlap equals
// the independence prediction to the decimal. 18.0% of cases are rescued by
// sector ONLY, 8.8% by region only, and an oracle over the two reaches 29.0%.
// So region cannot carry this alone and sector is a genuine second axis.
//
// THE ANSWER KEY IS INSIDE `sector_mix`. The column is built over every
// attributed award, including the awards of the companies this harness
// replays, so each test company has already voted once for its own answer.
// The LEAVE-ONE-OUT arm below removes that one vote and the signal drops by
// 1.7pp on the largest regimes and 2.8pp on the largest single country. This is
// the same defect `emit_peer_prior.py --exclude-recall-set` exists to prevent,
// and no equivalent flag exists on this column. Every sector number in this
// repo, including the ones in `corpus_signal_map.md`, is optimistic by roughly
// that much.
//
// SUBSECTOR IS WORTH THE ETL, AND ONLY THE ETL WILL SETTLE IT. Built from an
// identical attribution so the comparison isolates granularity and nothing
// else, 94-bucket subsector beats 10-bucket sector_top by +3.3pp @1, +4.2pp @3
// and +4.5pp @5 within the regime. It cannot be shipped from here: there is no
// `subsector_mix` column on `funding_instruments` and 19% of companies carry no
// subsector at all, so that fifth must be measured separately and shown not to
// be made worse. That is an ETL job, and half-doing it in the frontend would
// mean fitting a 94-bucket posterior on whatever attribution a script could
// reach rather than the one the corpus is actually built from.
//
// A POSTERIOR FITTED ON PAST AWARDS IS MUCH WEAKER ON THE NEXT COHORT. Fitting
// the mix on awards started up to a cut year and testing on awards after it,
// the same signal that scores 34.5% @1 in-sample scores 10.9% out-of-sample.
// Most of the apparent strength of any award-history posterior in this repo is
// the evaluation reading its own training data. Treat every in-sample
// within-group figure, here and elsewhere, as an upper bound.
//
// WHAT DOES NOT SEPARATE A REGIME, measured on the same rows and reported so it
// is not proposed again: every fit.ts component that never reaches the table.
// scale 4.3%, liveness 3.9%, eligibility 3.3%, structure 3.3%, capital and
// proximity 3.3% — against a 4.3% guessing baseline. Award SPREAD, the
// awardP25/awardP75 pair that is loaded and read by nothing, is likewise at the
// baseline. Seven of nine documented weights carry 0.72 of `FIT_WEIGHTS` and
// none of them tells two siblings apart. Whatever else those components are
// for, they are not for this.
import { readFileSync } from "fs";

try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* rely on the process environment */ }
if (process.env.NO_PG) delete process.env.DATABASE_URL;

import {
  hydrateDbInstruments, loadDbInstruments, publishableInstruments, type DbInstrument,
} from "../lib/intelligence/corpus";
import { sectorFit, scaleFit, livenessFit } from "../lib/intelligence/fit";
import { awardScorer, regionScorer } from "../lib/intelligence/shortlist";
import { sectorScorer, sectorWeight } from "../lib/intelligence/sectorPrior";
import { loadRecallSet } from "./recallSet";

interface Case {
  want: DbInstrument;
  group: DbInstrument[];
  sector: string;
  country: string;
  mode: string;
  region?: string;
  regionSource?: string;
}

/** Raw recipient count in the founder's sector: P(fund | sector) up to a
 *  constant, since the normaliser is the same for every member of the group. */
const count = (i: DbInstrument, s: string) => i.sectorMix?.[s] ?? 0;
/** P(sector | fund): how concentrated this fund is on the founder's sector. */
const share = (i: DbInstrument, s: string) => {
  const mix = i.sectorMix;
  if (!mix) return 0;
  const t = Object.values(mix).reduce((a, b) => a + b, 0);
  return t > 0 ? (mix[s] ?? 0) / t : 0;
};

// The harness answers one ticket band for every pair, so a ticket signal cannot
// be graded as a discriminator here — it is a constant across the sample. It is
// still worth reporting, because "constant question, does the leaf's own award
// distribution answer it differently" is exactly the claim awardP25/awardP75
// would have to support to be worth wiring in.
const BAND = "b500k_2m5";

async function main() {
  await hydrateDbInstruments();
  const byId = new Map(loadDbInstruments().map((i) => [i.id, i]));
  // Siblings are drawn from the PUBLISHABLE set, because that is the universe
  // the pool draws from: grading against leaves the product can never show
  // would measure a chooser nobody will run.
  const regimes = new Map<string, DbInstrument[]>();
  for (const i of publishableInstruments()) {
    if (!i.parentId) continue;
    (regimes.get(i.parentId) ?? regimes.set(i.parentId, []).get(i.parentId)!).push(i);
  }
  const regimeOf = new Map<string, DbInstrument[]>();
  for (const g of regimes.values()) if (g.length > 1) for (const i of g) regimeOf.set(i.id, g);

  const { file, rows } = loadRecallSet();
  const split = process.env.SPLIT ?? "holdout";
  const narrow = process.env.COUNTRY !== "0";
  const cases: Case[] = [];
  let alone = 0;
  for (const r of rows as unknown as Record<string, string>[]) {
    if (split !== "all" && r.split !== split) continue;
    const want = byId.get(r.instrument);
    let g = want ? regimeOf.get(want.id) : undefined;
    if (!want || !g || !r.sector) { alone++; continue; }
    // The pool only ever holds leaves that serve the founder's country, so a
    // chooser graded against foreign siblings is graded on a group it will
    // never see.
    if (narrow) g = g.filter((i) => !i.country || i.country === "EU" || i.country === r.country);
    if (g.length < 2 || !g.some((i) => i.id === want.id)) { alone++; continue; }
    cases.push({ want, group: g, sector: r.sector, country: r.country, mode: r.mode,
                 region: r.region, regionSource: r.regionSource });
  }
  const sizes = cases.map((c) => c.group.length).sort((a, b) => a - b);
  const q = (p: number) => sizes[Math.floor(p * (sizes.length - 1))];
  console.log(`\nset=${file} split=${split} country-narrowed=${narrow}`);
  console.log(`  cases ${cases.length}  (${alone} skipped: no sector, or won fund alone in its regime here)`);
  console.log(`  regime size  p10 ${q(0.1)}  median ${q(0.5)}  p90 ${q(0.9)}`);

  type Scorer = (i: DbInstrument, c: Case) => number;

  // Grouped by what the signal is ABOUT, because the answer is not one number:
  // it is which KINDS of fact separate a regime and which do not.
  const groups: [string, Record<string, Scorer>][] = [
    ["the founder's SECTOR against the fund's recipients", {
      "today: clipped sectorFit": (i, c) => sectorFit(i.sectorMix, c.sector),
      "P(fund|sector)  raw count": (i, c) => count(i, c.sector),
      "P(sector|fund)  unclipped share": (i, c) => share(i, c.sector),
      "share x log1p(count)": (i, c) => sectorWeight(i, c.sector) ?? -1,
      "shipped sectorScorer": (i, c) => sectorScorer(c.group, c.sector)(i),
    }],
    ["the founder's REGION against the fund's recipients", {
      "shipped regionScorer": (i, c) => (c.region ? regionScorer(c.group, c.region)(i) : 0),
    }],
    ["SIZE and POPULARITY (the honest baseline)", {
      "eventCount": (i) => i.eventCount,
      "companyCount": (i) => i.companyCount ?? 0,
      "totalEur": (i) => i.totalEur ?? 0,
    }],
    ["fit.ts components that never reach the table", {
      "scale  (scaleFit on awardP50)": (i) => scaleFit(i, BAND),
      "liveness (lastYear)": (i) => livenessFit(i, new Date().getFullYear()),
      "eligibility (encoded filter gates)": (i) =>
        i.gates.filter((g) => g.valueSpec && (!g.gateRole || g.gateRole === "filter")).length,
      "structure (own gate count)": (i) => i.gates.length,
      "capital / proximity": () => 0,
    }],
    ["award DISTRIBUTION, not just the median", {
      "shipped awardScorer": (i, c) => awardScorer(c.group, BAND)(i),
      "widest award range [p25,p75]": (i) =>
        i.awardP25 && i.awardP75 && i.awardP25 > 0 ? Math.log(i.awardP75 / i.awardP25) : -99,
      "narrowest spread p75/p25": (i) =>
        i.awardP25 && i.awardP75 && i.awardP25 > 0 ? -(i.awardP75 / i.awardP25) : -99,
    }],
  ];

  const at = (sc: Scorer, subset: Case[]) => {
    let a1 = 0, a3 = 0;
    for (const c of subset) {
      const ranked = [...c.group].sort((x, y) => (sc(y, c) - sc(x, c)) || x.id.localeCompare(y.id));
      const r = ranked.findIndex((i) => i.id === c.want.id) + 1;
      if (r === 1) a1++;
      if (r <= 3) a3++;
    }
    return [100 * a1 / subset.length, 100 * a3 / subset.length];
  };
  const uniform = (subset: Case[]) =>
    100 * subset.reduce((a, c) => a + 1 / c.group.length, 0) / subset.length;

  // ── The answer key is inside the signal, and nobody has taken it out ─────
  // `sector_mix` is built over every attributed award, INCLUDING the awards of
  // the companies this harness replays. So each test company has already voted
  // once for its own answer, in its own sector bucket. That is the same defect
  // `emit_peer_prior.py --exclude-recall-set` exists to prevent, and no
  // equivalent flag exists on this column.
  //
  // Corrected here rather than argued about: the LOO arm removes exactly one
  // recipient from the won leaf's own bucket before scoring, which is the vote
  // this company cast. It is a lower bound on the correction (a company with
  // several awards under the leaf voted more than once), and the gap between
  // the two arms is how much of the signal is the evaluation reading its own
  // answer key.
  const looMix = (i: DbInstrument, c: Case): Record<string, number> | null | undefined => {
    if (i.id !== c.want.id || !i.sectorMix) return i.sectorMix;
    const m = { ...i.sectorMix };
    if ((m[c.sector] ?? 0) > 0) m[c.sector] = m[c.sector] - 1;
    return m;
  };
  const looShare = (i: DbInstrument, c: Case) => {
    const mix = looMix(i, c);
    if (!mix) return 0;
    const t = Object.values(mix).reduce((a, b) => a + b, 0);
    return t > 0 ? (mix[c.sector] ?? 0) / t : 0;
  };
  const chosen: Record<string, Scorer> = {
    "today: clipped sectorFit": (i, c) => sectorFit(i.sectorMix, c.sector),
    "share x log1p(count)": (i, c) => sectorWeight(i, c.sector) ?? -1,
    "...LEAVE-ONE-OUT": (i, c) =>
      looShare(i, c) * Math.log1p(Math.max(0, count(i, c.sector) - (i.id === c.want.id ? 1 : 0))),
    "popularity (eventCount)": (i) => i.eventCount,
  };

  const table = (label: string, subset: Case[]) => {
    console.log(`\n── ${label}  n=${subset.length} ${"─".repeat(Math.max(0, 46 - label.length))}`);
    console.log(`  ${"signal".padEnd(38)}    @1     @3`);
    console.log(`  ${"uniform (guessing)".padEnd(38)} ${uniform(subset).toFixed(1).padStart(5)}%      -`);
    for (const [heading, sigs] of groups) {
      console.log(`  · ${heading}`);
      for (const [name, sc] of Object.entries(sigs)) {
        const [a1, a3] = at(sc, subset);
        console.log(`    ${name.padEnd(36)} ${a1.toFixed(1).padStart(5)}% ${a3.toFixed(1).padStart(5)}%`);
      }
    }
  };
  table("ALL cases", cases);

  // ── Per stratum, because the aggregate is dominated by one shape ─────────
  // A within-regime separator is exactly the kind of signal that scores well on
  // the corpus's median company and collapses on an unusual one, and the
  // aggregate above is dominated by median-60 regimes in a handful of large
  // countries. A signal that wins overall while losing on a stratum is a trade,
  // not an improvement, and it has to be visible to be called one.
  const strat = (label: string, subset: Case[]) => {
    if (subset.length < 5) { console.log(`  ${label.padEnd(30)} ${String(subset.length).padStart(5)}   (too few to read)`); return; }
    const u = uniform(subset);
    const cells = Object.entries(chosen).map(([, sc]) => at(sc, subset));
    console.log(`  ${label.padEnd(30)} ${String(subset.length).padStart(5)} ${u.toFixed(1).padStart(6)}%`
      + cells.map(([a1, a3]) => `${a1.toFixed(1).padStart(7)}%${a3.toFixed(1).padStart(6)}%`).join(""));
  };
  const header = (title: string) => {
    console.log(`\n══ ${title} ${"═".repeat(Math.max(0, 40 - title.length))}`);
    console.log(`  ${"stratum".padEnd(30)} ${"n".padStart(5)} ${"unif".padStart(6)}`
      + Object.keys(chosen).map((k) => `${k.slice(0, 12).padStart(14)}`).join(""));
    console.log(`  ${"".padEnd(30)} ${"".padStart(5)} ${"".padStart(6)}`
      + Object.keys(chosen).map(() => `${"@1".padStart(8)}${"@3".padStart(6)}`).join(""));
  };

  header("by REGIME SIZE — where an overfitted signal hides");
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

  // ── The outliers: does the signal DEGRADE to today, or to noise? ─────────
  // Three ways the input can be missing or unusual, each measured on its own.
  // The requirement is not that the signal wins here — it is that it does not
  // LOSE here, because a founder whose sector is unclassifiable must not be
  // served worse than they are today.
  header("OUTLIERS — the signal must not make these worse");
  const OTHER = "other";
  strat("founder sector is 'other'", cases.filter((c) => c.sector === OTHER));
  strat("founder sector is specific", cases.filter((c) => c.sector !== OTHER));
  strat("won leaf has NO sector mix", cases.filter((c) => !c.want.sectorMix));
  strat("no leaf here funds the sector", cases.filter((c) =>
    c.group.every((i) => (i.sectorMix?.[c.sector] ?? 0) === 0)));
  strat("won leaf has <5 awards", cases.filter((c) => (c.want.awardN ?? 0) < 5));
  strat("won leaf thin evidence (<20 ev)", cases.filter((c) => c.want.eventCount < 20));
  // The neutral path is the safety property, so state how often it is taken.
  const inert = cases.filter((c) => {
    const sc = sectorScorer(c.group, c.sector);
    return c.group.every((i) => sc(i) === sc(c.group[0]));
  });
  console.log(`\n  scorer returns NEUTRAL for the whole regime in `
    + `${inert.length}/${cases.length} (${(100 * inert.length / cases.length).toFixed(1)}%)`
    + ` — those regimes are left exactly as they are today.`);

  // ── Is the sector signal ORTHOGONAL to region, or the same fact twice? ────
  // Both are posteriors over the same recipient set, so they could easily be
  // one signal wearing two costumes: sectors cluster geographically. The test
  // that settles it is not correlation, it is whether they are right on
  // DIFFERENT cases — a second separator is only worth having if it rescues
  // rows the first one misses.
  const withRegion = cases.filter((c) => c.region);
  if (withRegion.length) {
    table("cases with a recoverable founder region", withRegion);
    const sec: Scorer = (i, c) => sectorScorer(c.group, c.sector)(i);
    const reg: Scorer = (i, c) => regionScorer(c.group, c.region!)(i);
    const first = (sc: Scorer, c: Case) =>
      [...c.group].sort((x, y) => (sc(y, c) - sc(x, c)) || x.id.localeCompare(y.id))[0].id === c.want.id;
    let both = 0, secOnly = 0, regOnly = 0, neither = 0;
    for (const c of withRegion) {
      const s = first(sec, c), r = first(reg, c);
      if (s && r) both++; else if (s) secOnly++; else if (r) regOnly++; else neither++;
    }
    const n = withRegion.length, pc = (x: number) => `${x} (${(100 * x / n).toFixed(1)}%)`;
    console.log(`\n── are sector and region the same fact twice? n=${n} ──`);
    console.log(`  both put the won leaf first     ${pc(both)}`);
    console.log(`  ONLY sector does               ${pc(secOnly)}   <- what a second separator buys`);
    console.log(`  ONLY region does               ${pc(regOnly)}`);
    console.log(`  neither                        ${pc(neither)}`);
    console.log(`  union (an oracle over the two) ${pc(both + secOnly + regOnly)}`);
    const [c1] = at((i, c) => sec(i, c) * reg(i, c), withRegion);
    console.log(`  sector x region, one ranking    ${c1.toFixed(1)}%`);
  }
}
main();
