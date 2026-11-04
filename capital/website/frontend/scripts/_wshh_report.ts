// wsHH — the report. OFFLINE, no credentials, no model, no database.
//
// @ws-active until 2026-09-30
//
// Reads the two committed evidence files and prints every figure in
// `project-mgmt/findings/sibling_embedding_wsHH/README.md`. Separated from the
// measurement for `_wsgy_report.ts`'s reason: a formatting change must never
// cost the run again.
//
//   npx tsx scripts/_wshh_report.ts
//
// @ws-active until 2026-09-30
import { readFileSync } from "fs";
import path from "path";

import type { PairMeasurement } from "./_wshh_cosines";

const EV = path.resolve(process.cwd(), "..", "..", "project-mgmt", "evidence");
const COS = path.join(EV, "wshh_door_cosines_2026-08-17.json");
const CMP = path.join(EV, "wshh_profile_components_2026-08-17.json");

/** `selectLeafInstruments` zeroes a thematic score below this. Imported rather
 *  than restated, so a change to the product cannot leave this report
 *  describing a floor that no longer ships. */
import { RELEVANCE_FLOOR } from "../lib/intelligence/relevance";

// Pinned OFFLINE, deliberately, because the header above says this run needs no
// credentials and nothing enforced it. Every module below reads DATABASE_URL and
// VOYAGE_KEY lazily, inside the functions that use them, so destroying them here
// is what makes the claim true rather than merely stated: with the keys present
// this would have ranked on pgvector against Postgres and printed a number
// indistinguishable from the offline one it advertises.
delete process.env.DATABASE_URL;
delete process.env.VOYAGE_KEY;


interface CosFile {
  draw: string; corpusSize: number; totalProfiles: number;
  corpusWithProfile: number; pairs: PairMeasurement[];
}
interface CmpFile {
  draw: string; variants: string[];
  pairs: { founder: string; regime: string;
    per: Record<string, { won: number | null; shown: number | null }> }[];
}

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const half = (h: number, n: number) =>
  1.96 * Math.sqrt((h / n) * (1 - h / n) / n);

function quantiles(xs: number[]): Record<string, number> {
  const s = [...xs].sort((a, b) => a - b);
  const at = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  return { min: s[0], p10: at(0.1), p25: at(0.25), med: at(0.5), p75: at(0.75), p90: at(0.9), max: s[s.length - 1] };
}
const row = (label: string, q: Record<string, number>, d = 3) =>
  `  ${label.padEnd(34)}` + ["min", "p10", "p25", "med", "p75", "p90", "max"]
    .map((k) => q[k].toFixed(d).padStart(9)).join("");

function main() {
  const cos = JSON.parse(readFileSync(COS, "utf8")) as CosFile;
  const cmp = JSON.parse(readFileSync(CMP, "utf8")) as CmpFile;
  const P = cos.pairs;
  const n = P.length;
  if (cmp.pairs.length !== n || cos.draw !== cmp.draw) {
    throw new Error("_wshh_report: the two evidence files are not the same study.");
  }

  console.log(`wsHH · draw ${cos.draw} · ${n} sibling-miss pair(s)`);
  console.log(`corpus ${cos.corpusSize} instrument(s); ${cos.corpusWithProfile} carry a profile `
    + `(${pct(cos.corpusWithProfile / cos.corpusSize)}); the percentile denominator is `
    + `${cos.totalProfiles}\n`);

  // ── 0. THE UPSTREAM CHECK ────────────────────────────────────────────────
  console.log("0. ARE THE TWO PROFILES THE SAME DOCUMENT?");
  console.log(`  identical profile_text                ${P.filter((p) => p.profileIdentical).length}/${n}`);
  console.log(row("door-to-door profile cosine", quantiles(P.map((p) => p.profileCos!))));
  console.log(row("word-type jaccard", quantiles(P.map((p) => p.profileJaccard!))));
  console.log(row("profile chars, won", quantiles(P.map((p) => p.profileCharsWon!)), 0));
  console.log(row("profile chars, shown", quantiles(P.map((p) => p.profileCharsShown!)), 0));

  // ── 1. RAW vs PERCENTILE ─────────────────────────────────────────────────
  const dRaw = P.map((p) => p.rawWon! - p.rawShown!);
  const dPct = P.map((p) => p.pctWon - p.pctShown);
  const disagree = P.filter((_, i) => (dRaw[i] > 0) !== (dPct[i] > 0)).length;
  const rawWins = dRaw.filter((x) => x > 0).length;
  console.log("\n1. DOES THE RAW COSINE SEPARATE THEM WHERE THE PERCENTILE DOES NOT?");
  console.log(`  won door absent from the index         ${P.filter((p) => p.rawWon === null).length}/${n}`);
  console.log(`  shown door absent from the index       ${P.filter((p) => p.rawShown === null).length}/${n}`);
  console.log(`  RAW cosine favours the won door        ${rawWins}/${n}  ${pct(rawWins / n)} +/-${(100 * half(rawWins, n)).toFixed(1)}`);
  console.log(`  PERCENTILE favours the won door        ${dPct.filter((x) => x > 0).length}/${n}`);
  console.log(`  pairs the two DISAGREE about           ${disagree}/${n}`);
  console.log(row("raw cosine gap, won - shown", quantiles(dRaw), 4));
  console.log(row("percentile gap, won - shown", quantiles(dPct)));
  console.log(row("|raw gap| in corpus sd", quantiles(P.map((p) => Math.abs(p.rawWon! - p.rawShown!) / p.cosSd)), 2));
  console.log(row("instruments lying between them", quantiles(P.map((p) => p.between!)), 0));

  // ── 2. THE FLOOR ─────────────────────────────────────────────────────────
  const F = RELEVANCE_FLOOR;
  const bw = P.filter((p) => p.pctWon < F).length;
  const bs = P.filter((p) => p.pctShown < F).length;
  const both = P.filter((p) => p.pctWon < F && p.pctShown < F).length;
  console.log(`\n2. DOES THE ${F} FLOOR ZERO THEM BOTH?`);
  console.log(`  won door below the floor               ${bw}/${n}`);
  console.log(`  shown door below the floor             ${bs}/${n}`);
  console.log(`  BOTH below it, i.e. tied at zero       ${both}/${n}`);

  // ── 3. THE SELECTION-FREE CONTROL ────────────────────────────────────────
  // P(the door beats a uniformly random OTHER sibling of its own regime), read
  // straight off its rank in the sibling group. The pair is conditioned on our
  // own ranker having shown one of the two; the sibling group is not.
  const beats = (r: number, N: number) => (N - r) / (N - 1);
  const bWon = P.map((p) => beats(p.sibRankWon!, p.siblingN));
  const bShown = P.map((p) => beats(p.sibRankShown!, p.siblingN));
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  console.log("\n3. IS THE SIGNAL REAL AT ALL? (the selection-free control)");
  console.log(row("sibling group size", quantiles(P.map((p) => p.siblingN)), 0));
  console.log(row("won door's rank among siblings", quantiles(P.map((p) => p.sibRankWon!)), 0));
  console.log(row("shown door's rank among siblings", quantiles(P.map((p) => p.sibRankShown!)), 0));
  console.log(`  won beats a RANDOM sibling             ${pct(mean(bWon))}   (chance 50.0%)`);
  console.log(`  shown beats a RANDOM sibling           ${pct(mean(bShown))}`);
  console.log(`  won beats the SHOWN sibling            ${pct(rawWins / n)}`);
  console.log(`  won is the top-scoring sibling         ${P.filter((p) => p.sibRankWon === 1).length}/${n}`
    + `   (chance ${mean(P.map((p) => 1 / p.siblingN)).toFixed(3)} -> `
    + `${P.reduce((a, p) => a + 1 / p.siblingN, 0).toFixed(1)} expected)`);
  console.log(`  shown is the top-scoring sibling       ${P.filter((p) => p.sibRankShown === 1).length}/${n}`);

  // ── 4. THE COMPONENTS ────────────────────────────────────────────────────
  console.log("\n4. WHICH SECTION OF THE PROFILE IS RIGHT ABOUT THE DOOR? (none)");
  console.log(`  ${"variant".padEnd(14)}${"won>shown".padStart(11)}${"rate".padStart(9)}${"95% half".padStart(10)}   no text on one side`);
  for (const v of cmp.variants) {
    const scored = cmp.pairs.filter((p) => p.per[v].won !== null && p.per[v].shown !== null);
    const w = scored.filter((p) => p.per[v].won! > p.per[v].shown!).length;
    console.log(`  ${v.padEnd(14)}${`${w}/${scored.length}`.padStart(11)}`
      + `${pct(w / scored.length).padStart(9)}${`+/-${(100 * half(w, scored.length)).toFixed(1)}`.padStart(10)}`
      + `   ${n - scored.length}`);
  }
  const ctrl = cmp.pairs.filter((p) => p.per.profile.won! > p.per.profile.shown!).length;
  console.log(`\n  CONTROL: re-embedding profile_text reproduces the live index at ${ctrl}/${n}`
    + ` against pgvector's ${rawWins}/${n}` + (ctrl === rawWins ? "  — identical." : "  — DIVERGENT."));

  // ── 5. SPREAD ────────────────────────────────────────────────────────────
  console.log("\n5. IS THE NULL SPREAD, OR IS IT ONE REGIME? (per regime, largest first)");
  const byRegime = new Map<string, PairMeasurement[]>();
  for (const p of P) byRegime.set(p.regime, [...(byRegime.get(p.regime) ?? []), p]);
  console.log(`  ${"regime".padEnd(24)}${"n".padStart(5)}${"share".padStart(8)}`
    + `${"raw won>shown".padStart(15)}${"won vs random".padStart(15)}${"door cosine".padStart(13)}`);
  for (const [r, g] of [...byRegime].sort((a, b) => b[1].length - a[1].length)) {
    const w = g.filter((p) => p.rawWon! > p.rawShown!).length;
    console.log(`  ${r.padEnd(24)}${String(g.length).padStart(5)}${pct(g.length / n).padStart(8)}`
      + `${`${w}/${g.length} ${pct(w / g.length)}`.padStart(15)}`
      + `${pct(mean(g.map((p) => beats(p.sibRankWon!, p.siblingN)))).padStart(15)}`
      + `${quantiles(g.map((p) => p.profileCos!)).med.toFixed(3).padStart(13)}`);
  }
}

main();
