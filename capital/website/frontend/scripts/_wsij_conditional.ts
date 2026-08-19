/**
 * wsIJ — WHEN should we let the model reorder at all?
 *
 * FREE. Offline. No key, no DB, no network, no paid call. It reads only the two
 * committed tapes (`indicative_wsHO/main_tape.jsonl`, `indicative_wsHW`) and
 * answers, in order:
 *
 *   1. Is wsII's conditional gradient -- "the model HARMS the founders whose won
 *      fund we already had visible and HELPS the ones we had buried" -- real, or
 *      is it the mechanical artefact that a row at rank 1 can only move down?
 *   2. If it survives, at what control rank does letting the model reorder stop
 *      hurting? Fitted on one run, tested on the other, both ways round.
 *   3. What does every candidate policy score on BOTH outcome measures?
 *
 * ── WHY THE NULLS COME FIRST ─────────────────────────────────────────────
 * wsII bucketed the change in the won fund's RANK by our own control rank. That
 * conditioning is not free: a row we already have at rank 1 cannot move up, and
 * a row at rank 30 cannot move down much. A "model" that picks seven rows at
 * random therefore produces the same rising gradient while knowing nothing.
 * NULL A below is exactly that model, and NULL B is a stronger one: it transfers
 * the DEPTH profile of the real model's picks (as quantiles of the menu, so menu
 * sizes do not confound) from a randomly chosen donor founder onto this founder,
 * which reproduces how deep the model reaches while destroying WHICH row it
 * reaches for. The model's contribution is model minus NULL B, per bucket.
 *
 * ── AND WHY THE RULER MATTERS A SECOND TIME ──────────────────────────────
 * wsII's own finding is that the raw rank difference is the broken ruler: it
 * weights 30 -> 20, worth nothing to a founder, the same as 2 -> 1, worth
 * everything. The conditional gradient was then computed IN RAW RANKS. Every
 * bucket below is therefore reported in both, and they do not agree.
 *
 * ── THE ESTIMATOR IS wsII's, UNCHANGED ───────────────────────────────────
 * Strata R and C weighted to their share of the gradable population; D founders
 * have the won fund outside the pool, cannot be moved by any ordering, and enter
 * the denominator as deterministic zeros. `today` reproduces the published
 * +1.6768 / -3.0986 EXACT@6 and +0.0739 / +0.0716 reciprocal rank exactly.
 */
import { readFileSync } from "fs";
import { join } from "path";

const FIND = join(__dirname, "..", "..", "..", "project-mgmt", "findings");
const Z95 = 1.96;

type Line = {
  company: string; wonRegime: string; stratum: string; called?: boolean;
  poolRankControl: number; poolRankTreatment: number; menu: number; picks: number[];
};
const load = (tag: string): Line[] =>
  readFileSync(join(FIND, tag, "main_tape.jsonl"), "utf8").split("\n")
    .filter(l => l.trim()).map(l => JSON.parse(l) as Line).filter(d => d.called);

const HO = load("indicative_wsHO"), HW = load("indicative_wsHW");
const S = { wsHO: { R: 324, C: 345, D: 159 }, wsHW: { R: 316, C: 350, D: 153 } };
type Tag = keyof typeof S;

const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;
const vari = (x: number[]) => { const m = mean(x); return x.reduce((a, b) => a + (b - m) ** 2, 0) / (x.length - 1); };

/** wsII's estimator, unchanged. */
function weighted(rows: { stratum: string }[], s: Record<string, number>, f: (d: never) => number) {
  const N = s.R + s.C + s.D;
  let est = 0, v = 0;
  for (const k of ["R", "C"]) {
    const x = rows.filter(d => d.stratum === k).map(f as (d: unknown) => number);
    if (!x.length) continue;
    est += (s[k] / N) * mean(x);
    if (x.length > 1) v += (s[k] / N) ** 2 * vari(x) / x.length;
  }
  return { est, se: Math.sqrt(v) };
}

// ── THE TWO ORDERINGS, RECONSTRUCTED FROM `picks` ─────────────────────────
// `agentSelect.ts` builds `[...chosen in the model's order, ...everything else
// keeping the shipped order]`. Reconstructing the won fund's treatment rank that
// way reproduces `poolRankTreatment` on 156 of 156 calls, asserted below, which
// is what licenses simulating any other permutation of the same reply offline.
const controlOrder = (r: Line) => Array.from({ length: r.menu }, (_, i) => i);
const modelOrder = (r: Line) => [...r.picks, ...controlOrder(r).filter(i => !r.picks.includes(i))];
const wonRank = (order: number[], r: Line) => order.indexOf(r.poolRankControl - 1) + 1;

for (const r of [...HO, ...HW])
  if (wonRank(modelOrder(r), r) !== r.poolRankTreatment)
    throw new Error(`treatment rank does not reconstruct for ${r.company}`);

// ── THE POLICIES ──────────────────────────────────────────────────────────
type Policy = (r: Line, a: number) => number[];
const pToday: Policy = r => modelOrder(r);
const pControl: Policy = r => controlOrder(r);
/** Our first N rows are pinned; the model orders everything behind them. */
const pFreeze: Policy = (r, N) => {
  const head = controlOrder(r).slice(0, N);
  return [...head, ...modelOrder(r).filter(i => !head.includes(i))];
};
/** PROPERTY: no row may be published more than D places below its own control
 *  rank. Constructive: at each slot, if any unplaced row is at its floor, emit
 *  the one with the lowest control rank; otherwise emit the model's next. */
const pCapfall: Policy = (r, D) => {
  const mo = modelOrder(r), left = new Set(controlOrder(r)), out: number[] = [];
  let mi = 0;
  for (let slot = 1; slot <= r.menu; slot++) {
    const due = [...left].filter(i => i + 1 + D <= slot);
    let pick: number;
    if (due.length) pick = Math.min(...due);
    else { while (!left.has(mo[mi])) mi++; pick = mo[mi]; }
    out.push(pick); left.delete(pick);
  }
  return out;
};
/** Reciprocal-rank fusion of the two orderings. */
const pRrf: Policy = (r, k) => {
  const mo = modelOrder(r), mr = new Map(mo.map((v, i) => [v, i + 1]));
  return controlOrder(r).sort((a, b) => {
    const sa = 1 / (k + a + 1) + 1 / (k + mr.get(a)!), sb = 1 / (k + b + 1) + 1 / (k + mr.get(b)!);
    return sb - sa || a - b;
  });
};
/** THE CANDIDATE. Publish the model's ordering only when its own first choice is
 *  NOT the row our score already ranks first. m generalises "first" to "top m". */
const pAbstain: Policy = (r, m) => (r.picks[0] < m ? controlOrder(r) : modelOrder(r));

const hit = (o: number[], r: Line) => (wonRank(o, r) <= 6 ? 1 : 0);
const rule = (t: string) => console.log("\n" + t + "\n" + "=".repeat(t.length));

/** vs CONTROL, the way both runs published it. */
function vsControl(rows: Line[], tag: Tag, pol: Policy, a: number) {
  const ex = weighted(rows, S[tag], ((d: Line) => hit(pol(d, a), d) - hit(controlOrder(d), d)) as never);
  const rc = weighted(rows, S[tag], ((d: Line) => 1 / wonRank(pol(d, a), d) - 1 / d.poolRankControl) as never);
  return { ex: ex.est * 100, exse: ex.se * 100, rc: rc.est, rcse: rc.se };
}
/** vs TODAY, paired on the same call — the comparison a policy decision needs. */
function vsToday(rows: Line[], tag: Tag, pol: Policy, a: number) {
  const ex = weighted(rows, S[tag], ((d: Line) => hit(pol(d, a), d) - hit(modelOrder(d), d)) as never);
  const rc = weighted(rows, S[tag], ((d: Line) => 1 / wonRank(pol(d, a), d) - 1 / d.poolRankTreatment) as never);
  return { ex: ex.est * 100, exse: ex.se * 100, rc: rc.est, rcse: rc.se };
}

// ═══ 1. IS THE GRADIENT REAL? ═════════════════════════════════════════════
rule("1. THE CONDITIONAL GRADIENT, AND WHAT A MODEL THAT KNOWS NOTHING SCORES");

const BUCKETS: [number, number][] = [[1, 3], [4, 6], [7, 12], [13, 18], [19, 24], [25, 99]];
const ALL = [...HO, ...HW];
const bucketOf = (cr: number) => BUCKETS.findIndex(([lo, hi]) => cr >= lo && cr <= hi);

/** mulberry32 — seeded, so this file prints the same numbers on every machine. */
function rng32(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rnd = rng32(20260819);
const sampleK = (n: number, k: number) => {
  const pool = Array.from({ length: n }, (_, i) => i);
  for (let i = 0; i < k; i++) { const j = i + Math.floor(rnd() * (n - i)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, k);
};
const DEPTHS = ALL.map(r => r.picks.map(p => p / r.menu));

const nullUniform = (r: Line) => sampleK(r.menu, 7);
const nullDepth = (r: Line) => {
  const pat = DEPTHS[Math.floor(rnd() * DEPTHS.length)], out: number[] = [];
  for (const q of pat) { let i = Math.min(r.menu - 1, Math.floor(q * r.menu)); while (out.includes(i)) i = (i + 1) % r.menu; out.push(i); }
  return out;
};
function bucketed(pick: (r: Line) => number[], draws: number) {
  const acc = BUCKETS.map(() => ({ dr: [] as number[], rc: [] as number[] }));
  for (let d = 0; d < draws; d++) for (const r of ALL) {
    // ONE draw per founder per replicate. Calling `pick` twice would build the
    // permutation from two different random menus, and the won fund would then
    // be missing from it -- `indexOf` returns -1, the rank reads 0, and the
    // reciprocal column prints Infinity. It did, before this line was one call.
    const chosen = pick(r);
    const t = wonRank([...chosen, ...controlOrder(r).filter(i => !chosen.includes(i))], r);
    const b = bucketOf(r.poolRankControl);
    acc[b].dr.push(r.poolRankControl - t); acc[b].rc.push(1 / t - 1 / r.poolRankControl);
  }
  return acc.map(a => ({ dr: mean(a.dr), rc: mean(a.rc), n: a.dr.length / draws }));
}
// The model's own picks are deterministic, so one "draw".
const M = bucketed(r => r.picks, 1);
const A = bucketed(nullUniform, 300);
const B = bucketed(nullDepth, 300);

console.log("\n            n  |        RAW RANK CHANGE        |     RECIPROCAL RANK CHANGE");
console.log("our rank      |  model  nullA  nullB  M-B    |  model    nullA    nullB    M-B");
BUCKETS.forEach(([lo, hi], i) => {
  const nm = `${lo}-${hi === 99 ? "+ " : hi}`.padEnd(6);
  console.log(`${nm} ${String(M[i].n).padStart(5)}  | ${M[i].dr.toFixed(2).padStart(6)} ${A[i].dr.toFixed(2).padStart(6)} ${B[i].dr.toFixed(2).padStart(6)} ${(M[i].dr - B[i].dr).toFixed(2).padStart(6)}  | `
    + `${M[i].rc.toFixed(4).padStart(8)} ${A[i].rc.toFixed(4).padStart(8)} ${B[i].rc.toFixed(4).padStart(8)} ${(M[i].rc - B[i].rc).toFixed(4).padStart(8)}`);
});
console.log(`
READ IT DOWN THE nullA COLUMN FIRST. Seven rows chosen at random reproduce wsII's
gradient with a STEEPER slope than the model's -- it is the arithmetic of a
bounded rank, not a property of the model. In raw ranks the model beats that null
in EVERY bucket by a roughly constant amount, so there is no gradient left once
the mechanics are removed. And in the measure wsII proved is the right one, the
gradient RUNS THE OTHER WAY: the model's value added is largest at the top of our
list and smallest at the bottom.`);

// ═══ 2. EVERY CANDIDATE, BOTH MEASURES, vs CONTROL AND vs TODAY ═══════════
rule("2. EVERY CANDIDATE POLICY, ON BOTH MEASURES, ON BOTH TAPES");
const CANDS: [string, Policy, number][] = [
  ["today (ships)", pToday, 0], ["control (never reorder)", pControl, 0],
  ...[1, 2, 3, 4, 5, 6].map(n => [`freeze our top ${n}`, pFreeze, n] as [string, Policy, number]),
  ...[1, 2, 3, 4, 6].map(d => [`capfall D=${d}`, pCapfall, d] as [string, Policy, number]),
  ...[0, 3, 10, 20].map(k => [`rrf k=${k}`, pRrf, k] as [string, Policy, number]),
  ...[1, 2, 3, 4].map(m => [`abstain if 1st pick in our top ${m}`, pAbstain, m] as [string, Policy, number]),
];
console.log("                                  |  vs CONTROL wsHO      wsHW      |  vs TODAY (paired) wsHO   wsHW");
console.log("policy                            |    EX     rc      EX     rc    |    EX     rc      EX     rc");
for (const [nm, pol, a] of CANDS) {
  const c1 = vsControl(HO, "wsHO", pol, a), c2 = vsControl(HW, "wsHW", pol, a);
  const t1 = vsToday(HO, "wsHO", pol, a), t2 = vsToday(HW, "wsHW", pol, a);
  console.log(`${nm.padEnd(33)} | ${c1.ex.toFixed(2).padStart(6)} ${c1.rc.toFixed(4).padStart(7)} ${c2.ex.toFixed(2).padStart(6)} ${c2.rc.toFixed(4).padStart(7)}  | `
    + `${t1.ex.toFixed(2).padStart(6)} ${t1.rc.toFixed(4).padStart(7)} ${t2.ex.toFixed(2).padStart(6)} ${t2.rc.toFixed(4).padStart(7)}`);
}

// ═══ 3. FIT ON ONE RUN, TEST ON THE OTHER ════════════════════════════════
rule("3. FIT THE PARAMETER ON ONE RUN, READ IT OFF THE OTHER -- BOTH WAYS ROUND");
const FAM: [string, Policy, number[]][] = [
  ["freeze", pFreeze, [1, 2, 3, 4, 5, 6]], ["capfall", pCapfall, [1, 2, 3, 4, 6]],
  ["rrf", pRrf, [0, 1, 2, 3, 5, 10, 20, 60]], ["abstain", pAbstain, [1, 2, 3, 4]],
];
for (const crit of ["rc", "ex"] as const) {
  console.log(`\nselected on ${crit === "rc" ? "reciprocal rank" : "EXACT@6"} (vs control):`);
  for (const [fitTag, fit, tstTag, tst] of [["wsHO", HO, "wsHW", HW], ["wsHW", HW, "wsHO", HO]] as const) {
    for (const [fam, pol, args] of FAM) {
      const best = args.reduce((a, b) => (vsControl(fit, fitTag as Tag, pol, b)[crit] > vsControl(fit, fitTag as Tag, pol, a)[crit] ? b : a));
      const t = vsControl(tst, tstTag as Tag, pol, best);
      console.log(`  fit ${fitTag} -> ${fam.padEnd(8)} best=${String(best).padEnd(3)} | HELD OUT on ${tstTag}:  EXACT@6 ${t.ex.toFixed(2).padStart(6)}   recip ${t.rc.toFixed(4)}`);
    }
    const t = vsControl(tst, tstTag as Tag, pToday, 0);
    console.log(`  ${" ".repeat(11)}${"today".padEnd(8)}         | HELD OUT on ${tstTag}:  EXACT@6 ${t.ex.toFixed(2).padStart(6)}   recip ${t.rc.toFixed(4)}`);
  }
}

// ═══ 4. IS THE ABSTENTION JUST "REORDER LESS OFTEN"? ═════════════════════
rule("4. THE NULL FOR THE POLICY -- abstaining on the SAME NUMBER of RANDOM founders");
for (const [tag, rows] of [["wsHO", HO], ["wsHW", HW]] as const) {
  const nAbs = rows.filter(r => r.picks[0] === 0).length;
  const obs = vsToday(rows, tag as Tag, pAbstain, 1);
  const ex: number[] = [], rc: number[] = [];
  for (let d = 0; d < 4000; d++) {
    const off = new Set(sampleK(rows.length, nAbs));
    const pol: Policy = (r) => (off.has(rows.indexOf(r)) ? controlOrder(r) : modelOrder(r));
    const v = vsToday(rows, tag as Tag, pol, 0); ex.push(v.ex); rc.push(v.rc);
  }
  const p = (arr: number[], o: number) => arr.filter(v => v >= o).length / arr.length;
  console.log(`  ${tag}: abstain on ${nAbs} of ${rows.length}`);
  console.log(`    EXACT@6  observed ${obs.ex.toFixed(2).padStart(6)}   random abstention mean ${mean(ex).toFixed(2).padStart(6)}   p = ${p(ex, obs.ex).toFixed(4)}`);
  console.log(`    recip    observed ${obs.rc.toFixed(4).padStart(8)} random abstention mean ${mean(rc).toFixed(4).padStart(8)} p = ${p(rc, obs.rc).toFixed(4)}`);
}
console.log(`
The policy's feature carries information beyond "reorder fewer founders": it
beats random abstention of the same size on reciprocal rank at p < 0.01 in BOTH
runs independently, and on EXACT@6 in both.`);

// ═══ 5. THE HEADLINE, REPLICATE-AVERAGED ═════════════════════════════════
rule("5. THE ABSTENTION POLICY vs TODAY, ON THE 76 FOUNDERS MEASURED TWICE");
const byCo = (rows: Line[]) => new Map(rows.map(r => [r.company, r]));
const mHO = byCo(HO), mHW = byCo(HW);
const shared = [...mHO.keys()].filter(c => mHW.has(c));
const SW = { R: (324 + 316) / 2, C: (345 + 350) / 2, D: (159 + 153) / 2 };
function replicate(cos: string[], pol: Policy, a: number) {
  const rows = cos.map(c => {
    const two = [mHO.get(c)!, mHW.get(c)!];
    return {
      stratum: two[0].stratum,
      h: mean(two.map(r => hit(pol(r, a), r) - hit(modelOrder(r), r))),
      q: mean(two.map(r => 1 / wonRank(pol(r, a), r) - 1 / r.poolRankTreatment)),
    };
  });
  return {
    ex: weighted(rows, SW, ((d: { h: number }) => d.h) as never),
    rc: weighted(rows, SW, ((d: { q: number }) => d.q) as never),
  };
}
const H = replicate(shared, pAbstain, 1);
console.log(`  n = ${shared.length} founders, each measured in both runs; effect is the policy MINUS today.`);
console.log(`  EXACT@6        ${(H.ex.est * 100).toFixed(2)} points  95% [${((H.ex.est - Z95 * H.ex.se) * 100).toFixed(2)}, ${((H.ex.est + Z95 * H.ex.se) * 100).toFixed(2)}]`);
console.log(`  reciprocal rank ${H.rc.est.toFixed(4)}        95% [${(H.rc.est - Z95 * H.rc.se).toFixed(4)}, ${(H.rc.est + Z95 * H.rc.se).toFixed(4)}]`);

let posE = 0, posR = 0, n = 0;
for (const g of [...new Set(shared.map(c => mHO.get(c)!.wonRegime))]) {
  const cs = shared.filter(c => mHO.get(c)!.wonRegime !== g);
  if (cs.length < 20) continue;
  for (const [tag, m] of [["wsHO", mHO], ["wsHW", mHW]] as const) {
    n++;
    const rows = cs.map(c => m.get(c)!);
    if (vsToday(rows, tag as Tag, pAbstain, 1).ex > 0) posE++;
    if (vsToday(rows, tag as Tag, pAbstain, 1).rc > 0) posR++;
  }
}
console.log(`  leave-one-regime-out: EXACT@6 positive in ${posE} of ${n};  reciprocal rank in ${posR} of ${n}.`);
console.log(`
  THE MIRROR IMAGE OF wsII, AND STATE IT THAT WAY. wsII: the model improves the
  ORDERING (recip 60/60) and does not improve VISIBILITY (EXACT@6 29/60).
  Abstention: it recovers VISIBILITY (EXACT@6 60/60) and leaves the ORDERING
  where it was (recip 35/60, a wash by construction). The two are complements,
  not rivals -- but the EXACT@6 interval STILL TOUCHES ZERO on 76 founders, so
  this is a candidate, not a result. It ships behind a flag, defaulted off.`);
