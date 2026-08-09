// Can a BLEND of the signals do what none of them does alone?
//
// The prior study fitted a logistic blend of eight signals and got 36% against
// a 6% baseline, then concluded that instrument metadata cannot pick 1 of 50.
// This refits the same idea on the key that ships, and it keeps the one
// discipline that makes the answer worth anything:
//
//   ██ THE BLEND IS FITTED ON `tune` AND SCORED ON `holdout`, ONCE. ██
//
// The split exists to stop weights being tuned against the number they are
// reported on. So this script REFUSES to fit and evaluate on the same split,
// rather than trusting whoever runs it to remember. Two feature dumps go in,
// from `measure_signal_power.ts FEATURES_OUT=`, and they must name different
// splits.
//
// ── The model ─────────────────────────────────────────────────────────────
// Conditional logit, which is the model this problem actually is: exactly one
// candidate in each pool is the answer, so the likelihood is softmax over the
// pool rather than an independent Bernoulli per candidate. A per-candidate
// logistic would spend its capacity learning the base rate 1/|pool|, which
// varies with pool size and carries no information about which fund is right.
//
// Features are converted to WITHIN-POOL PERCENTILE RANKS before fitting. Two
// reasons, both load-bearing: `total EUR` and `sector share` differ by nine
// orders of magnitude and a shared learning rate cannot serve both, and a rank
// is invariant to pool size, so a weight fitted on a pool of 40 still means the
// same thing on a pool of 120.
//
//   FEATURES_OUT=/tmp/tune.json    SPLIT=tune    npx tsx scripts/measure_signal_power.ts
//   FEATURES_OUT=/tmp/holdout.json SPLIT=holdout npx tsx scripts/measure_signal_power.ts
//   TUNE=/tmp/tune.json HOLDOUT=/tmp/holdout.json npx tsx scripts/fit_signal_blend.ts
import { readFileSync } from "fs";

type Dump = {
  set: string; split: string; seed: number; n: number;
  /** The `rankerTallyLine()` of the run that produced this dump. Optional in
   *  the type because dumps cut before 2026-08-09 do not carry one — and those
   *  are exactly the dumps this script now refuses. */
  ranker?: string;
  signals: string[];
  rows: { pop: string; pool: number; won: number; x: number[][];
          shipped?: 0 | 1; regime?: string }[];
};

const TOP = 5;

/** A dump whose `semantic` and `shipped pool score` columns came from the
 *  embedding index, whole.
 *
 *  Two of the fourteen features are the ranker's own output, so a dump filled
 *  while `semanticFundMatch` was timing out holds two columns that are part
 *  embedding and part zero — and a conditional logit fitted on that learns a
 *  weight for a signal that does not exist in production. The blend cannot
 *  detect this itself: it never sees a database, only a file. So it is checked
 *  where it is knowable, which is at the file.
 *
 *  This is why the check is here and not left to the reader. wsBU's published
 *  22.7% blend was fitted on two dumps produced before any attestation existed;
 *  nothing about the number said which ranker it described, and the same
 *  ambiguity had already moved `check_recall_floor` by nine points. */
const CLEAN_RANKER = /^ranker: all \d+ request\(s\) on EMBEDDING$/;

function requireAttestation(path: string, d: Dump): void {
  if (!d.ranker) {
    throw new Error(
      `${path} carries no ranker attestation. It was produced before ` +
      "measure_signal_power.ts recorded one, so nothing in it can say whether " +
      "the semantic columns came from the embedding index or from a timeout. " +
      "Re-cut it: FEATURES_OUT=... npx tsx scripts/measure_signal_power.ts");
  }
  if (!CLEAN_RANKER.test(d.ranker.trim())) {
    throw new Error(
      `${path} did not rank cleanly on embeddings: "${d.ranker.trim()}". ` +
      "A blend fitted on this averages two different ranking systems.");
  }
}

/** Within-pool percentile rank, ties at the mid-rank. Ties get the SAME value
 *  on purpose: a feature that cannot tell two candidates apart must not be
 *  allowed to order them through an artefact of the sort. */
function rankNormalise(col: number[]): number[] {
  const idx = col.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array(col.length).fill(0);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1].v === idx[i].v) j++;
    const mid = (i + j) / 2;
    const p = idx.length > 1 ? mid / (idx.length - 1) : 0.5;
    for (let k = i; k <= j; k++) out[idx[k].i] = p;
    i = j + 1;
  }
  return out;
}

type Pool = { x: number[][]; won: number; pop: string; shipped: number; regime: string };

/** A pair whose won fund never reached the pool. It is not droppable: no
 *  ordering of the pool can find a fund selection removed, so it is a MISS for
 *  every blend, and a run that quietly excluded it would report a number
 *  conditional on pool reach under the name EXACT@5. */
type Missed = { pop: string; shipped: number; regime: string };

function prepare(d: Dump): { pools: Pool[]; missed: Missed[] } {
  const f = d.signals.length;
  const missed = d.rows.filter((r) => r.won < 0 || r.x.length <= 1)
    .map((r) => ({ pop: r.pop, shipped: r.shipped ?? 0, regime: r.regime ?? "?" }));
  const pools = d.rows.filter((r) => r.won >= 0 && r.x.length > 1).map((r) => {
    const cols: number[][] = [];
    for (let j = 0; j < f; j++) cols.push(rankNormalise(r.x.map((c) => c[j])));
    return { x: r.x.map((_c, i) => cols.map((col) => col[i])), won: r.won, pop: r.pop,
      shipped: r.shipped ?? 0, regime: r.regime ?? "?" };
  });
  return { pools, missed };
}

/** Conditional-logit fit by full-batch gradient ascent with L2. Small, exact,
 *  and no dependency: the whole problem is a few hundred pools of a hundred
 *  candidates and a dozen features. */
function fit(pools: Pool[], f: number, l2 = 0.5, steps = 4000, lr = 0.5): number[] {
  const w = new Array(f).fill(0);
  for (let s = 0; s < steps; s++) {
    const g = new Array(f).fill(0);
    for (const p of pools) {
      const z = p.x.map((row) => row.reduce((a, v, j) => a + v * w[j], 0));
      const m = Math.max(...z);
      const e = z.map((v) => Math.exp(v - m));
      const sum = e.reduce((a, b) => a + b, 0);
      for (let j = 0; j < f; j++) {
        let exp = 0;
        for (let i = 0; i < p.x.length; i++) exp += (e[i] / sum) * p.x[i][j];
        g[j] += p.x[p.won][j] - exp;
      }
    }
    for (let j = 0; j < f; j++) w[j] += lr * (g[j] / pools.length - l2 * w[j] / pools.length);
  }
  return w;
}

/** Same expectation-under-random-ties rule the per-signal harness uses, so a
 *  blend and a signal are never graded by two different definitions of a tie. */
function expectedHitAt5(values: number[], won: number): number {
  let better = 0, tied = 0;
  const wv = values[won];
  for (const v of values) { if (v > wv) better++; else if (v === wv) tied++; }
  if (better >= TOP || tied === 0) return 0;
  return Math.min(1, (TOP - better) / tied);
}

function halfWidthOf(vals: number[]): number {
  const n = vals.length;
  if (n < 2) return 100;
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  const varr = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  return 100 * 1.96 * Math.sqrt(varr / n);
}

function main() {
  const tunePath = process.env.TUNE, holdPath = process.env.HOLDOUT;
  if (!tunePath || !holdPath) throw new Error("set TUNE= and HOLDOUT= to two feature dumps");
  const tune = JSON.parse(readFileSync(tunePath, "utf8")) as Dump;
  const hold = JSON.parse(readFileSync(holdPath, "utf8")) as Dump;
  // The guard the whole script exists for. Fitting and reporting on one split
  // is the failure the split was created to prevent, and a comment asking the
  // next person not to do it is not a guard.
  if (tune.split === hold.split) {
    throw new Error(
      `TUNE and HOLDOUT are both split=${tune.split}. The blend must be fitted on ` +
      "one split and reported on the other; that is what the split is for.");
  }
  requireAttestation(tunePath, tune);
  requireAttestation(holdPath, hold);
  if (tune.set !== hold.set) throw new Error(`different answer keys: ${tune.set} vs ${hold.set}`);
  if (tune.signals.join("|") !== hold.signals.join("|")) {
    throw new Error("the two dumps were produced by different signal sets");
  }

  const F = tune.signals;
  const train = prepare(tune), test = prepare(hold);
  const trainPools = train.pools, testPools = test.pools;
  const w = fit(trainPools, F.length);

  const score = (pools: Pool[], weights: number[], missed: Missed[]) => [
    ...pools.map((p) => expectedHitAt5(
      p.x.map((row) => row.reduce((a, v, j) => a + v * weights[j], 0)), p.won)),
    ...missed.map(() => 0),
  ];

  // Both attestations, not one line: the two dumps are separate runs on
  // separate machine load, and it is the pair that has to be clean.
  console.log(`tune dump   ${tune.ranker}`);
  console.log(`holdout dump ${hold.ranker}`);
  console.log(`blend: fitted on ${tune.split} (${trainPools.length} pools, ` +
              `${train.missed.length} unreachable), reported on ${hold.split} ` +
              `(${testPools.length} pools, ${test.missed.length} unreachable), set=${tune.set}`);
  console.log("  weights (within-pool percentile rank, conditional logit):");
  [...F.entries()].sort((a, b) => Math.abs(w[b[0]]) - Math.abs(w[a[0]]))
    .forEach(([j, name]) => console.log(`    ${name.padEnd(40)} ${w[j].toFixed(3)}`));

  const trainHits = score(trainPools, w, train.missed);
  const testHits = score(testPools, w, test.missed);
  const pc = (v: number[]) =>
    `${(100 * v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)}% +/-${halfWidthOf(v).toFixed(1)}`;
  // The fitted split is printed too, because the gap between the two IS the
  // overfitting and hiding it would leave the reader nothing to judge by.
  console.log(`\n  EXACT@5 blended, on ${tune.split} (FITTED HERE — not a result): ${pc(trainHits)}`);
  console.log(`  EXACT@5 blended, on ${hold.split} (the reported number):        ${pc(testHits)}`);
  const rnd = [...testPools.map((p) => Math.min(1, TOP / p.x.length)), ...test.missed.map(() => 0)];
  console.log(`  random baseline on the same pools:                             ${pc(rnd)}`);

  // ── Against the ranker that SHIPS, on the same founders ──────────────────
  //
  // Two marginal half-widths printed beside each other answer "could these two
  // populations differ". The question is whether the SAME founders do better,
  // and only a paired statistic answers that. Every arm here shares a draw and
  // a pool precisely so this comparison is available; wsBU's dump discarded the
  // one column it needed, so its "+1.5 against half-widths of ±3.4 and ±3.3"
  // was the conservative reading of an unpaired proxy for a paired question.
  //
  // The per-pair difference is `blend hit expectation - shipped hit`, in
  // [-1,1]; its mean is the delta and its own sd gives the interval. Where the
  // blend is 0/1 too this reduces to the McNemar count exactly.
  const shippedHits = [...testPools.map((p) => p.shipped), ...test.missed.map((m) => m.shipped)];
  const diffs = testHits.map((h, i) => h - shippedHits[i]);
  const dmean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  console.log(`\n  SHIPPED (the product's own five), same founders:               ${pc(shippedHits)}`);
  console.log(`  PAIRED delta blend - shipped:                                  ` +
    `${(100 * dmean).toFixed(1)} +/-${halfWidthOf(diffs).toFixed(1)} points`);
  // Concentration beside the gain, as the standing rule requires. A regime is
  // the answer's own parent, so "one regime" means the blend learned a family.
  const regimes = [...testPools.map((p) => p.regime), ...test.missed.map((m) => m.regime)];
  const gain = new Map<string, number>(), loss = new Map<string, number>();
  diffs.forEach((d, i) => {
    if (d > 0.001) gain.set(regimes[i], (gain.get(regimes[i]) ?? 0) + d);
    if (d < -0.001) loss.set(regimes[i], (loss.get(regimes[i]) ?? 0) - d);
  });
  const share = (m: Map<string, number>) => {
    const tot = [...m.values()].reduce((a, b) => a + b, 0);
    const top = [...m].sort((a, b) => b[1] - a[1]).slice(0, 3);
    return `${m.size} regime(s), largest ${top.map(([k, v]) =>
      `${k} ${(100 * v / (tot || 1)).toFixed(0)}%`).join(", ") || "none"}`;
  };
  console.log(`  gains  spread over ${share(gain)}`);
  console.log(`  losses spread over ${share(loss)}`);

  // ── Does it reach the MISSES, or does it just re-win what was already won ──
  //
  // A delta is a net. wsCM measured the misses as scattered — median rank 22,
  // only 3 of 73 at rank 6, and a median gap of 24.4% of the fifth row's score
  // — so the question a positive delta has to answer is whether it CROSSES a
  // gap that size or merely shuffles the pairs already inside the five. The
  // 2x2 and the rank of the won fund under the blend say which.
  const blendRank = (p: Pool, weights: number[]): number => {
    const z = p.x.map((row) => row.reduce((a, v, j) => a + v * weights[j], 0));
    return z.filter((v) => v > z[p.won]).length + 1;
  };
  let bothHit = 0, blendOnly = 0, shippedOnly = 0, neither = 0;
  const rescuedRanks: number[] = [];
  const stillMissedRanks: number[] = [];
  testPools.forEach((p, i) => {
    const b = testHits[i] > 0.5, s = p.shipped === 1;
    if (b && s) bothHit++; else if (b) blendOnly++; else if (s) shippedOnly++; else neither++;
    if (!s) (b ? rescuedRanks : stillMissedRanks).push(blendRank(p, w));
  });
  const med = (v: number[]) => (v.length
    ? [...v].sort((a, b) => a - b)[v.length >> 1] : NaN);
  console.log(`\n  ON THE SAME FOUNDERS, blend x shipped:` +
    `  both ${bothHit}   blend only ${blendOnly}   shipped only ${shippedOnly}` +
    `   neither ${neither}`);
  console.log(`  of the ${shippedOnly + neither} the product MISSED, the blend puts ` +
    `${blendOnly} in the five (${(100 * blendOnly / (shippedOnly + neither)).toFixed(0)}%)`);
  console.log(`  won fund's rank under the blend, on the pairs the product missed: ` +
    `median ${med([...rescuedRanks, ...stillMissedRanks])} ` +
    `(rescued ${rescuedRanks.length}, still missed median ${med(stillMissedRanks)})`);

  const allPops = [...testPools.map((p) => p.pop), ...test.missed.map((m) => m.pop)];
  const allBase = [...testPools.map((p) => Math.min(1, TOP / p.x.length)), ...test.missed.map(() => 0)];
  const byPop = new Map<string, number[]>();
  const basePop = new Map<string, number[]>();
  allPops.forEach((k, i) => {
    (byPop.get(k) ?? byPop.set(k, []).get(k)!).push(testHits[i]);
    (basePop.get(k) ?? basePop.set(k, []).get(k)!).push(allBase[i]);
  });
  console.log("\n  by population:");
  for (const [k, v] of [...byPop].sort()) {
    console.log(`    ${k.padEnd(28)} n=${String(v.length).padStart(4)}  blend ${pc(v)}` +
                `   baseline ${pc(basePop.get(k)!)}`);
  }
}

main();
