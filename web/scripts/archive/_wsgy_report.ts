// wsGY — the report, rendered from `_wsgy_rankshape.ts`'s JSON.
//
// Split from the measurement on purpose: the run is one Voyage embedding and
// one gate hydration per founder over the whole 897-founder population, and a
// formatting change must never cost that again. Everything below is arithmetic
// on a committed file.
//
//   IN=/tmp/wsgy_full.json npx tsx scripts/_wsgy_report.ts
//
// FREE and OFFLINE. Reads one JSON file, no credentials, no network.
import { readFileSync } from "fs";

import { mcnemar, mcnemarLine } from "../mcnemar";
import { halfWidth } from "../recallSample";
// TYPE-ONLY, deliberately. A value import would execute `_wsgy_rankshape.ts`'s
// `main()` — credentials, Postgres, Voyage — to render a committed number.
import type { Arm, Row } from "./_wsgy_rankshape";

const SHOWN_ROWS = 6;
const TOP = 5;

interface Doc { meta: Record<string, unknown>; rows: Row[] }

const pct = (k: number, n: number) => (n ? (100 * k) / n : 0);
const f1 = (x: number) => x.toFixed(1);

/** The four cuts every arm is read at, defined ONCE so an arm cannot be scored
 *  under a subtly different definition of "in the first n rows". `pool_cut` is
 *  a rank in the accessible pool; the rest are ranks in `toWriter`, which is
 *  what production hands the writer. */
const CUTS: { id: string; of: (r: Row, a: Arm) => boolean }[] = [
  { id: "pool_cut", of: (r, a) => (r.poolRank[a] ?? Infinity) <= 40 },
  { id: "writer_cap", of: (r, a) => r.writerRank[a] != null },
  { id: "published_7", of: (r, a) => (r.writerRank[a] ?? Infinity) <= 7 },
  { id: `top_${SHOWN_ROWS}`, of: (r, a) => (r.writerRank[a] ?? Infinity) <= SHOWN_ROWS },
  { id: `top_${TOP}`, of: (r, a) => (r.writerRank[a] ?? Infinity) <= TOP },
];

/** Quantiles of a sorted integer sample, by the nearest-rank rule. Stated
 *  rather than interpolated: a rank is an integer position in a list and an
 *  interpolated 21.5th row is not a row anybody is shown. */
function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))];
}

/** Buckets chosen for what they mean to a WORKSTREAM, not for round numbers.
 *
 *   7-8      would be in the brief at a cap of 8 -- the cap wsFZ raised and
 *            measured at +0.12
 *   9-15     a small ordering gain reaches this. It is the near edge.
 *   16-40    inside the 40-row pool, so a MODEL can see it and re-rank it, but
 *            no small nudge of the deterministic score will
 *   41+      outside the pool entirely. No permutation of a 40-row list
 *            contains it, so it is unreachable by any reordering of the pool
 *            AS CUT -- it needs a wider cut or a different pool. */
const BUCKETS: { label: string; lo: number; hi: number }[] = [
  { label: "7-8", lo: 7, hi: 8 },
  { label: "9-15", lo: 9, hi: 15 },
  { label: "16-25", lo: 16, hi: 25 },
  { label: "26-40", lo: 26, hi: 40 },
  { label: "41-60", lo: 41, hi: 60 },
  { label: "61-100", lo: 61, hi: 100 },
  { label: "101+", lo: 101, hi: Infinity },
];

function histogram(ranks: number[]): string[] {
  const out: string[] = [];
  const n = ranks.length;
  for (const b of BUCKETS) {
    const k = ranks.filter((r) => r >= b.lo && r <= b.hi).length;
    const bar = "#".repeat(Math.round((40 * k) / Math.max(1, n)));
    out.push(`    ${b.label.padEnd(8)} ${String(k).padStart(4)}  ${f1(pct(k, n)).padStart(5)}%  ${bar}`);
  }
  return out;
}

function main() {
  const src = process.env.IN ?? "/tmp/wsgy_rankshape.json";
  const doc = JSON.parse(readFileSync(src, "utf8")) as Doc;
  const rows = doc.rows;
  const N = rows.length;
  const ARMS = (doc.meta.arms as Arm[]) ?? [];
  const p = (s = "") => console.log(s);

  p("# wsGY — how much of the 46 points is reachable by reordering, and where the answer sits when we lose it");
  p();
  p("```");
  for (const [k, v] of Object.entries(doc.meta)) {
    p(`${k.padEnd(18)} ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
  }
  p("```");
  p();
  p(`population    ${N} founder(s) — the SAME draw as \`one_funnel/latest.md\`, one per`);
  p("              company, held out, described, drawn BEFORE the offerability cut.");
  p("              Every share below is over this denominator unless it says otherwise.");
  p();

  // ── 1. THE LADDER UNDER EVERY ARM ────────────────────────────────────────
  const gatesPass = rows.filter((r) => r.rankAccessible != null);
  p("## 1. The ladder, under every arm, on one population");
  p();
  p("`gates_pass` is the same set for every arm — an arm is a PERMUTATION of the");
  p("accessible pool and cannot add or remove a founder from it. Everything below it");
  p("is the arm's own.");
  p();
  p("```");
  p(`  offerable + screened + gates_pass   ${gatesPass.length}/${N}  `
    + `${f1(pct(gatesPass.length, N))}% +/-${f1(halfWidth(gatesPass.length, N))}`);
  p("```");
  p();
  p(`| cut | ${ARMS.join(" | ")} |`);
  p(`|---|${ARMS.map(() => "---:").join("|")}|`);
  for (const c of CUTS) {
    const cells = ARMS.map((a) => {
      const k = rows.filter((r) => c.of(r, a)).length;
      return `${k} (${f1(pct(k, N))}%)`;
    });
    p(`| \`${c.id}\` | ${cells.join(" | ")} |`);
  }
  p();

  // ── 2. THE ORACLE CEILING ────────────────────────────────────────────────
  const oracleAt6 = rows.filter((r) => (r.writerRank.oracle ?? Infinity) <= SHOWN_ROWS);
  const shippedAt6 = rows.filter((r) => (r.writerRank.shipped ?? Infinity) <= SHOWN_ROWS);
  const oracleLost = gatesPass.filter((r) => (r.writerRank.oracle ?? Infinity) > SHOWN_ROWS);
  p("## 2. The oracle ceiling — the won fund placed FIRST in the accessible pool");
  p();
  p("```");
  p(`  oracle, six rows        ${oracleAt6.length}/${N}  ${f1(pct(oracleAt6.length, N))}% `
    + `+/-${f1(halfWidth(oracleAt6.length, N))}`);
  p(`  shipped, six rows       ${shippedAt6.length}/${N}  ${f1(pct(shippedAt6.length, N))}% `
    + `+/-${f1(halfWidth(shippedAt6.length, N))}`);
  p(`  the gap                 ${f1(pct(oracleAt6.length, N) - pct(shippedAt6.length, N))} points`
    + `  <- EVERYTHING any ordering work can ever take`);
  p(`  gates_pass              ${f1(pct(gatesPass.length, N))}%   the arm's own ceiling`);
  // ── TWO DIFFERENT CEILINGS, AND CONFLATING THEM IS THE EASY MISTAKE ──────
  // A MODEL re-orders the 40 rows it is shown; a SCORE re-orders the whole
  // accessible pool before the cut. They have different ceilings and a proposal
  // has to say which one it is.
  const inCut = rows.filter((r) => (r.poolRank.shipped ?? Infinity) <= 40).length;
  p(`  ceiling if only the 40-row CUT is reordered   ${inCut}/${N}  ${f1(pct(inCut, N))}%`);
  p("                          — what any re-ranking of the menu can reach, model included");
  p(`  ceiling if the whole POOL is reordered       ${gatesPass.length}/${N}  `
    + `${f1(pct(gatesPass.length, N))}%   — what a better SCORE can reach`);
  p(`  oracle shortfall        ${oracleLost.length} founder(s) whose won fund was FIRST in the`);
  p("                          accessible pool and STILL not in the six");
  p("```");
  p();
  if (oracleLost.length) {
    p("The shortfall is not the cut. A row placed first can only be lost below by the");
    p("display-name collision in `orderMemoCandidates`, which demotes on");
    p("`preferBetterEvidencedRow` — a total order INDEPENDENT OF POSITION.");
    p();
    for (const r of oracleLost.slice(0, 12)) {
      p(`    ${r.company.slice(0, 30).padEnd(32)} ${r.country}  pool rank 1, `
        + `writer ${r.writerRank.oracle ?? "absent"}`);
    }
    p();
  }

  // ── 3. THE RANK DISTRIBUTION OF THE ANSWER WHEN WE LOSE IT ───────────────
  const lostAtPoolCut = gatesPass.filter((r) => (r.rankAccessible ?? 0) > 40);
  const lostAtWriter = gatesPass.filter((r) =>
    (r.rankAccessible ?? 0) <= 40 && r.writerRank.shipped == null);
  const lostBelowSix = gatesPass.filter((r) =>
    (r.writerRank.shipped ?? Infinity) > SHOWN_ROWS);
  p("## 3. Where the won fund actually sits when we lose it");
  p();
  p("The rank is in the ACCESSIBLE POOL, shipped order — the quantity every cut below");
  p("`gates_pass` reads. **41+ is outside the 40-row pool: no permutation of a 40-row");
  p("list contains it**, so it is unreachable by reordering the cut, at any price.");
  p();
  for (const [label, set] of [
    [`lost at \`pool_cut\` (n=${lostAtPoolCut.length})`, lostAtPoolCut],
    [`lost at \`writer_cap\` (n=${lostAtWriter.length})`, lostAtWriter],
    [`ALL lost below six rows (n=${lostBelowSix.length})`, lostBelowSix],
  ] as [string, Row[]][]) {
    const ranks = set.map((r) => r.rankAccessible as number).sort((a, b) => a - b);
    p(`**${label}**`);
    p("```");
    if (ranks.length) {
      p(`    p25 ${quantile(ranks, 0.25)}   MEDIAN ${quantile(ranks, 0.5)}   `
        + `p75 ${quantile(ranks, 0.75)}   p90 ${quantile(ranks, 0.90)}   max ${ranks[ranks.length - 1]}`);
      p();
      for (const line of histogram(ranks)) p(line);
      const near = ranks.filter((r) => r >= 9 && r <= 15).length;
      const inPool = ranks.filter((r) => r <= 40).length;
      const out = ranks.filter((r) => r > 40).length;
      p();
      const climb = ranks.map((r) => r - SHOWN_ROWS).sort((a, b) => a - b);
      p(`    places the answer must CLIMB to reach the six:  `
        + `p25 ${quantile(climb, 0.25)}  MEDIAN ${quantile(climb, 0.5)}  p75 ${quantile(climb, 0.75)}`);
      p();
      p(`    ranks 9-15  ${near} (${f1(pct(near, ranks.length))}%)  <- what a small ordering gain reaches`);
      p(`    ranks <=40  ${inPool} (${f1(pct(inPool, ranks.length))}%)  <- a MODEL can see these`);
      p(`    ranks 41+   ${out} (${f1(pct(out, ranks.length))}%)  <- no reordering of the 40 reaches these`);
    } else {
      p("    (empty)");
    }
    p("```");
    p();
  }

  // ── 4. WHAT THE CONSTRAINT STACK COSTS AT THE CUT ────────────────────────
  p("## 4. What the constraint stack costs, at the cut, on the shipped score");
  p();
  p("Each arm is the one above it plus exactly one mechanism, so a delta is");
  p("attributable. Paired McNemar on the same founders, at six rows.");
  p();
  const steps: [Arm, Arm, string][] = [
    ["sorted", "score_only", "the two boolean tiers (usedInField, fitDemoted)"],
    ["collapsed", "sorted", "the display-name collision demotion"],
    ["shipped", "collapsed", "peer precedence + the notified-scheme dedupe"],
    ["shipped", "score_only", "**THE WHOLE STACK** — the discount on any pure-reordering upper bound"],
  ];
  p("```");
  for (const [t, c, what] of steps) {
    const at6 = (a: Arm) => (r: Row) => (r.writerRank[a] ?? Infinity) <= SHOWN_ROWS;
    const kT = rows.filter(at6(t)).length, kC = rows.filter(at6(c)).length;
    p(`  ${c} -> ${t}`);
    p(`    ${what}`);
    p(`    six rows  ${f1(pct(kC, N))}% -> ${f1(pct(kT, N))}%   `
      + `delta ${kT >= kC ? "+" : ""}${f1(pct(kT, N) - pct(kC, N))} points`);
    p(`    ${mcnemarLine("   ", mcnemar(rows, at6(t), at6(c)), t, c)}`);
    p();
  }
  p("```");
  p();
  p("### The same arms read a second way — the trade EXACT@6 cannot see");
  p();
  p("wsBU's unclipping arm bought +0.7 EXACT@5 for −6 REGIME@5 and −6 CHANNEL@5.");
  p("An arm judged on the exact fund alone cannot tell a gain from a trade, so the");
  p("same six rows are read again here. REGIME credits a SIBLING of the won fund and");
  p("is deliberately NOT a funnel row — it breaks nesting. It is a second question.");
  p();
  p(`| arm | EXACT@6 | REGIME@6 | CHANNEL@6 |`);
  p("|---|---:|---:|---:|");
  for (const a of ARMS) {
    const e = rows.filter((r) => (r.writerRank[a] ?? Infinity) <= SHOWN_ROWS).length;
    const g = rows.filter((r) => r.regimeAt6[a]).length;
    const c = rows.filter((r) => r.channelAt6[a]).length;
    p(`| \`${a}\` | ${f1(pct(e, N))}% | ${f1(pct(g, N))}% | ${f1(pct(c, N))}% |`);
  }
  p();

  // ── 5. WHAT DISTINGUISHES THE ROWS ABOVE THE ANSWER FROM THE ANSWER ──────
  const graded = gatesPass.filter((r) => Object.keys(r.featWon).length);
  const hits = graded.filter((r) => (r.writerRank.shipped ?? Infinity) <= SHOWN_ROWS);
  const misses = graded.filter((r) => (r.writerRank.shipped ?? Infinity) > SHOWN_ROWS);
  const feats = (doc.meta.features as string[]) ?? [];
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
  p("## 5. What the score puts above the answer");
  p();
  p("Every number is a PERCENTILE WITHIN THAT FOUNDER'S OWN ACCESSIBLE POOL, averaged");
  p("over founders. 0.50 = the middle of the pool, i.e. no preference. That is what");
  p("separates \"the score prefers big funds\" from \"big funds are what the pool is made");
  p("of\" — a raw mean cannot.");
  p();
  p("`shown` is the six rows the founder reads; `won` is the fund they actually took.");
  p("`relevance` is the shipped score itself and is the CONTROL: if the shown rows do");
  p("not sit above the won fund on it, the loss is not this score's ordering at all.");
  p();
  // ── HOW HIGH A ROW HAS TO SCORE TO BE ON THE PAGE ────────────────────────
  // The percentiles below are only readable against the percentile the six rows
  // actually occupy. A pool of 80 puts the sixth row at the 93rd percentile, so
  // a won fund at the 65th is not "slightly mis-ranked": it is twenty-eight
  // percentile points from the page, and that is the size of the improvement
  // any ordering proposal has to deliver.
  const meanPool = mean(gatesPass.map((r) => r.accessibleLen));
  p("```");
  p(`  mean accessible pool                     ${meanPool.toFixed(1)} rows`);
  p(`  percentile a row needs to be in the six  ${(1 - SHOWN_ROWS / meanPool).toFixed(3)}`);
  p("```");
  p();
  p(`| feature | MISS shown | MISS won | gap | HIT shown | HIT won | gap |`);
  p("|---|---:|---:|---:|---:|---:|---:|");
  for (const f of feats) {
    const ms = mean(misses.map((r) => r.featShown[f]).filter(Number.isFinite));
    const mw = mean(misses.map((r) => r.featWon[f]).filter(Number.isFinite));
    const hs = mean(hits.map((r) => r.featShown[f]).filter(Number.isFinite));
    const hw = mean(hits.map((r) => r.featWon[f]).filter(Number.isFinite));
    p(`| \`${f}\` | ${ms.toFixed(3)} | ${mw.toFixed(3)} | ${(ms - mw >= 0 ? "+" : "")}${(ms - mw).toFixed(3)} `
      + `| ${hs.toFixed(3)} | ${hw.toFixed(3)} | ${(hs - hw >= 0 ? "+" : "")}${(hs - hw).toFixed(3)} |`);
  }
  p();
  p(`MISS n=${misses.length}   HIT n=${hits.length}`);
  p();

  // ── 6. WHICH MECHANISM PUT A ROW ABOVE IT ────────────────────────────────
  p("## 6. Which mechanism put a row above the answer that the answer OUTSCORED");
  p();
  const tierOnly = gatesPass.map((r) => r.aboveOnTierOnly);
  const peerOnly = gatesPass.map((r) => r.aboveOnPeerOnly);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const anyTier = gatesPass.filter((r) => r.aboveOnTierOnly > 0).length;
  const anyPeer = gatesPass.filter((r) => r.aboveOnPeerOnly > 0).length;
  p("```");
  p(`  founders with >=1 row above them on a BOOLEAN TIER alone   ${anyTier}/${gatesPass.length} `
    + `(${f1(pct(anyTier, gatesPass.length))}%)   ${sum(tierOnly)} rows in total`);
  p(`  founders with >=1 row above them on PEER/DEDUPE alone      ${anyPeer}/${gatesPass.length} `
    + `(${f1(pct(anyPeer, gatesPass.length))}%)   ${sum(peerOnly)} rows in total`);
  p();
  const tied = gatesPass.filter((r) => r.tiedAtWon > 1).length;
  p(`  founders whose won fund is TIED on the score with >=1 other row  ${tied}/${gatesPass.length} `
    + `(${f1(pct(tied, gatesPass.length))}%)`);
  p();
  for (const b of ["specific", "flat", "none"] as const) {
    const k = gatesPass.filter((r) => r.peerBranch === b).length;
    const hit = gatesPass.filter((r) => r.peerBranch === b
      && (r.writerRank.shipped ?? Infinity) <= SHOWN_ROWS).length;
    p(`  peer branch ${b.padEnd(9)} ${String(k).padStart(4)} founders   six rows ${f1(pct(hit, k)).padStart(5)}%`);
  }
  p("```");
  p();
}

main();
