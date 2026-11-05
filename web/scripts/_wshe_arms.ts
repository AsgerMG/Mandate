// wsHE — TWO ARMS OF `_wsha_doors.ts`, PAIRED, WITH THE TRADE BESIDE THE GAIN.
//
// `_wsha_doors.ts` writes one dump per run: for every founder in the funnel's
// own draw, the fund they won and the six rows they were shown, in order. Run it
// twice with different `AWARD_TERM` values and the two dumps differ ONLY in the
// arm — same draw, same seed, same corpus, same session.
//
// This reads the pair and reports the three depths that actually get quoted,
// each at 5 and 6 rows:
//
//   EXACT    the fund they won is on the page
//   REGIME   a door of the fund they won is on the page  (credits a SIBLING)
//   CHANNEL  the right funder is on the page
//
// ── WHY ALL THREE, ALWAYS ──────────────────────────────────────────────────
// wsBU's standing warning: an arm bought +0.7 EXACT@5 and cost -6 REGIME@5 and
// -6 CHANNEL@5. An EXACT figure quoted alone cannot distinguish "we found the
// right door" from "we stopped showing the right building". So a run of this
// script prints all three or it prints nothing.
//
// ── AND WHY CONCENTRATION ──────────────────────────────────────────────────
// The working set is 44% `vinnova_grant`. An arm that moves +2 points by
// re-sorting Swedish innovation programmes and nothing else is not an
// improvement to the product, it is an improvement to Sweden. So every gain is
// reported with the number of REGIMES it spreads over and the largest one's
// share of the gained mass.
//
// ── PAIRED, AND IT REFUSES NOT TO BE ───────────────────────────────────────
// Different draw fingerprints mean different founders; equal `AWARD_TERM` means
// one arm measured twice. Both are refused rather than reported, because the
// cross-run hazard here is real: the shipped ordering drifts as workstreams
// republish `instrument_profiles`, so a comparison against another hour's run
// is not evidence and must not be able to look like one.
//
// FREE. Reads two JSON dumps plus Postgres, for the regime of each shown row.
// ANTHROPIC_API_KEY is deleted before import. NO PAID MODEL CALL, no embedding.
//
//   A=/tmp/wshe_base.json B=/tmp/wshe_off.json npx tsx scripts/_wshe_arms.ts
//
// @ws-active until 2026-09-30
import { readFileSync } from "fs";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
delete process.env.ANTHROPIC_API_KEY;
if (requireCredentials("wshe_arms", ["DATABASE_URL"]) === "offline") {
  throw new Error(
    "_wshe_arms: NO_PG is set, which deletes DATABASE_URL and serves the "
    + "committed snapshot. The regimes below are read as `parentId ?? id` from "
    + "the corpus, and the snapshot's parentage is a different vintage from the "
    + "store the dumps were taken against.");
}

import {
  hydrateDbInstruments, loadDbInstruments, requireLiveCorpus,
} from "../lib/intelligence/corpus";
import type { DoorRow } from "./_wsha_doors";

interface Dump {
  meta: {
    fingerprint: string; n: number; ranker: string;
    levers: Record<string, unknown>;
  };
  rows: DoorRow[];
}

const pct = (a: number, b: number) => (b ? (100 * a) / b : NaN);
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : "—");

/** McNemar on the discordant pairs, normal approximation. The only test that
 *  belongs on a paired binary outcome: the concordant founders carry no
 *  information about a difference and including them shrinks every interval. */
function mcnemar(bOnly: number, aOnly: number) {
  const n = bOnly + aOnly;
  if (!n) return { n, z: 0, p: 1 };
  const z = (bOnly - aOnly) / Math.sqrt(n);
  // Two-sided normal tail, Abramowitz & Stegun 26.2.17.
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-z * z / 2);
  const p = 2 * d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937
    + t * (-1.821255978 + t * 1.330274429))));
  return { n, z, p };
}

function main() {
  const A = JSON.parse(readFileSync(process.env.A!, "utf8")) as Dump;
  const B = JSON.parse(readFileSync(process.env.B!, "utf8")) as Dump;

  if (A.meta.fingerprint !== B.meta.fingerprint) {
    throw new Error(
      `_wshe_arms: draw fingerprints differ (${A.meta.fingerprint} vs `
      + `${B.meta.fingerprint}). Two runs quoting different fingerprints measured `
      + "different founders, and no arithmetic pairs them.");
  }
  const armA = String(A.meta.levers.AWARD_TERM ?? "(not recorded)");
  const armB = String(B.meta.levers.AWARD_TERM ?? "(not recorded)");
  if (armA === armB) {
    throw new Error(
      `_wshe_arms: both dumps were taken under AWARD_TERM=${armA}. That is one `
      + "arm measured twice, which reports as 'no effect' whatever the arm does. "
      + "Check the variable reached the run — the dump records the SHIPPED "
      + "constant, so if this fires the flag never arrived.");
  }
  for (const m of [A.meta, B.meta]) {
    if (!/all \d+ request\(s\) on EMBEDDING/.test(m.ranker)) {
      throw new Error(
        `_wshe_arms: a dump was taken on a mixed or lexical ranker (${m.ranker}). `
        + "The lexical fallback is a different ranking system; a run that averaged "
        + "two of them is not a measurement of either.");
    }
  }

  // Regime = `parentId ?? id`, `measure_recall`'s own definition, so a REGIME
  // figure here is comparable with every one this repo has published.
  const inst = new Map(loadDbInstruments().map((i) => [i.id, i]));
  const regimeOf = (id: string) => inst.get(id)?.parentId ?? id;
  const bucketOf = (id: string) => inst.get(id)?.sourceFamilyBucket ?? regimeOf(id);

  const byCo = new Map<string, DoorRow>();
  for (const r of B.rows) byCo.set(`${r.company}::${r.won}`, r);

  /** Did this founder's page carry the fund / a door of it / its funder, in the
   *  first `k` rows. Recomputed from `shown` rather than read off `hit` and
   *  `siblingsShown`, which are fixed at six — the depth has to be a parameter
   *  or the 5-row figure is the 6-row figure with a different label. */
  const at = (r: DoorRow, k: number) => {
    const rows = r.shown.slice(0, k);
    const wr = regimeOf(r.won), wb = bucketOf(r.won);
    return {
      exact: rows.includes(r.won),
      regime: rows.some((id) => regimeOf(id) === wr),
      channel: rows.some((id) => bucketOf(id) === wb),
    };
  };

  // The GRADABLE population: the founders both arms carried to a page. A
  // founder missing from either dump is dropped from BOTH, so the denominator
  // is identical by construction rather than by inspection.
  const paired: { a: DoorRow; b: DoorRow }[] = [];
  for (const a of A.rows) {
    const b = byCo.get(`${a.company}::${a.won}`);
    if (b) paired.push({ a, b });
  }

  console.log("# wsHE — the award term, two arms, paired\n");
  console.log("```");
  console.log(`draw fingerprint    ${A.meta.fingerprint}   (identical in both dumps)`);
  console.log(`A = AWARD_TERM=${armA}    n=${A.rows.length}   ${A.meta.ranker}`);
  console.log(`B = AWARD_TERM=${armB}    n=${B.rows.length}   ${B.meta.ranker}`);
  console.log(`paired founders     ${paired.length}`);
  console.log("```\n");

  const measures = ["exact", "regime", "channel"] as const;
  console.log("| depth | measure | A `" + armA + "` | B `" + armB + "` | delta | B-only | A-only | McNemar z | p |");
  console.log("|---|---|--:|--:|--:|--:|--:|--:|--:|");
  const gains: Record<string, DoorRow[]> = {};
  for (const k of [5, 6]) {
    for (const m of measures) {
      let ca = 0, cb = 0, bOnly = 0, aOnly = 0;
      const won: DoorRow[] = [];
      for (const { a, b } of paired) {
        const va = at(a, k)[m], vb = at(b, k)[m];
        if (va) ca++;
        if (vb) cb++;
        if (vb && !va) { bOnly++; won.push(b); }
        if (va && !vb) aOnly++;
      }
      const st = mcnemar(bOnly, aOnly);
      const d = pct(cb, paired.length) - pct(ca, paired.length);
      console.log(
        `| @${k} | ${m.toUpperCase()} | ${f1(pct(ca, paired.length))}% | `
        + `${f1(pct(cb, paired.length))}% | ${d >= 0 ? "+" : ""}${f1(d)} | ${bOnly} | `
        + `${aOnly} | ${f1(st.z)} | ${st.p < 0.001 ? "<0.001" : st.p.toFixed(3)} |`);
      if (k === 5 || k === 6) gains[`${m}@${k}`] = won;
    }
  }
  console.log("");

  // ── CONCENTRATION ────────────────────────────────────────────────────────
  // A gain in one market is not a gain. Reported for every measure that gained
  // anything at all, at the depth the owner reads.
  console.log("## Concentration of what B gained\n");
  console.log("| measure | founders gained | regimes | largest regime | its share |");
  console.log("|---|--:|--:|---|--:|");
  for (const key of Object.keys(gains)) {
    const rows = gains[key];
    if (!rows.length) { console.log(`| ${key} | 0 | — | — | — |`); continue; }
    const byRegime = new Map<string, number>();
    for (const r of rows) {
      const g = regimeOf(r.won);
      byRegime.set(g, (byRegime.get(g) ?? 0) + 1);
    }
    const top = [...byRegime.entries()].sort((x, y) => y[1] - x[1])[0];
    console.log(
      `| ${key} | ${rows.length} | ${byRegime.size} | \`${top[0]}\` | `
      + `${f1(pct(top[1], rows.length))}% |`);
  }
  console.log("");

  // ── THE SIBLING CELL ITSELF ──────────────────────────────────────────────
  // wsHE's claim is about SIBLINGS, not about the pool. So the last table asks
  // the question at the depth it was diagnosed: of the founders who missed with
  // a sibling on the page under A, how many does B convert to an EXACT hit —
  // and how many does B push the other way, out of a hit into a sibling miss.
  let cellA = 0, converted = 0, lost = 0;
  for (const { a, b } of paired) {
    const sa = at(a, 6), sb = at(b, 6);
    if (!sa.exact && sa.regime) { cellA++; if (sb.exact) converted++; }
    if (sa.exact && !sb.exact && sb.regime) lost++;
  }
  console.log("## The sibling cell, the population the defect was diagnosed in\n");
  console.log("```");
  console.log(`under A: missed the fund but saw a SIBLING of it (@6)   ${cellA}`);
  console.log(`  ...B turns into an EXACT hit                         ${converted}  ${f1(pct(converted, cellA))}%`);
  console.log(`B pushes OUT of an exact hit into a sibling miss        ${lost}`);
  console.log(`net doors won inside the cell                          ${converted - lost >= 0 ? "+" : ""}${converted - lost}`);
  console.log("```");
}

async function boot() {
  if (!process.env.A || !process.env.B) {
    throw new Error("_wshe_arms: set A= and B= to two `_wsha_doors.ts` dumps.");
  }
  await hydrateDbInstruments();
  requireLiveCorpus("_wshe_arms");
  main();
}

boot().catch((e) => { console.error(e); process.exit(1); });
