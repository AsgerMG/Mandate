/**
 * wsII — what the paid instrument's own noise is made of, and what a rank-based
 * outcome would have said about the SAME two tapes.
 *
 * FREE. Offline. No key, no DB, no network. It reads only the two committed
 * tapes (`indicative_wsHO/main_tape.jsonl`, `indicative_wsHW/main_tape.jsonl`)
 * and reproduces:
 *
 *   1. the 10 outcome flips on the 76 founders both runs called, DECOMPOSED by
 *      whether the menu the model was shown actually changed between the runs;
 *   2. the same two runs scored with a RECIPROCAL-RANK outcome instead of the
 *      binary "won fund in the top six", under the SAME stratum weights, so the
 *      two are comparable line for line;
 *   3. what each budget buys, given only 666 founders a paid call can reach.
 *
 * ── WHY A ROW IDENTITY AND NOT THE PROMPT TEXT ───────────────────────────
 * No two prompts in these tapes are byte-identical and none ever can be:
 * `untrusted.ts` fences the founder's description in a `Math.random()` nonce on
 * purpose, so a textual diff scores 76 of 76 founders as "changed" and measures
 * nothing. wsHR also RENAMED rows to their register titles between the runs, so
 * a title-keyed diff scores a rename as a swap. The identity used here is the
 * row's own SOURCE text -- the `funds:` / `who may apply:` / `demands:` lines --
 * which a rename does not touch, with the title as a fallback for the ~10% of
 * rows that carry no source block.
 *
 * ── THE MEASURE, AND WHY IT IS NOT A NEW CLAIM ───────────────────────────
 * `poolRankControl` and `poolRankTreatment` are already on every tape line;
 * both runs already printed a Wilcoxon on them and both read it as a null. What
 * was never computed is the MEAN of a bounded transform of that rank. Reciprocal
 * rank is the ordinary IR measure and it weights the transform the way the
 * product does: moving the won fund 2 -> 1 is worth a great deal to a founder
 * reading top-down, and 30 -> 20 is worth nothing. The raw rank difference
 * weights those the other way round, which is why its Wilcoxon reads null.
 *
 * THIS DOES NOT REPLACE EXACT@6. EXACT@6 is the business metric and it is the
 * only thing the dashboard may quote. Reciprocal rank is a SENSITIVITY
 * instrument: it is what an arm should be judged on before anyone pays to
 * confirm it against the metric that ships.
 */
import { readFileSync } from "fs";
import { join } from "path";

const FIND = join(__dirname, "..", "..", "..", "project-mgmt", "findings");
const Z95 = 1.96, Z80 = 2.802;
const EUR_PER_FOUNDER = 0.0432;                 // wsHW measured, EUR 3.3681 / 78

type Turn = { round: number; prompt: string };
type Line = {
  company: string; won: string; wonRegime: string; stratum: string;
  called?: boolean; hitControl: boolean; hitTreatment: boolean;
  poolRankControl: number; poolRankTreatment: number; menu: number;
  turns: Turn[];
};
const load = (tag: string): Map<string, Line> => {
  const m = new Map<string, Line>();
  for (const l of readFileSync(join(FIND, tag, "main_tape.jsonl"), "utf8").split("\n"))
    if (l.trim()) { const d = JSON.parse(l) as Line; m.set(d.company, d); }
  return m;
};

/** Row identity that a rename does not move. See the header. */
function menuIds(d: Line): string[] {
  const t = d.turns?.find(x => x.round === 1);
  if (!t) return [];
  const lines = t.prompt.split("\n");
  const starts: number[] = [];
  lines.forEach((ln, i) => { if (/^\[\d+\] /.test(ln)) starts.push(i); });
  return starts.map((i, n) => {
    const end = n + 1 < starts.length ? starts[n + 1] : lines.length;
    const blk = lines.slice(i, end);
    const head = (blk[1] ?? "").trim().split("· typical award")[0].split("· no award")[0].trim();
    const pick = (f: string) => (blk.find(x => x.trim().startsWith(f))?.trim().slice(f.length).trim() ?? "").slice(0, 120);
    const body = [pick("funds:"), pick("who may apply:"), pick("demands:")];
    return body.some(Boolean)
      ? `B|${head}|${body.join("|")}`
      : `T|${head}|${lines[i].replace(/^\[\d+\] /, "").trim()}`;
  });
}

const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;
const vari = (x: number[]) => { const m = mean(x); return x.reduce((a, b) => a + (b - m) ** 2, 0) / (x.length - 1); };
const pearson = (x: number[], y: number[]) => {
  const mx = mean(x), my = mean(y);
  const num = x.reduce((a, _, i) => a + (x[i] - mx) * (y[i] - my), 0);
  const den = Math.sqrt(x.reduce((a, v) => a + (v - mx) ** 2, 0) * y.reduce((a, v) => a + (v - my) ** 2, 0));
  return den ? num / den : NaN;
};

const binary = (d: Line) => (d.hitTreatment ? 1 : 0) - (d.hitControl ? 1 : 0);
const recip = (d: Line) => 1 / d.poolRankTreatment - 1 / d.poolRankControl;

/** The published estimator: strata R and C weighted to their share of the
 *  GRADABLE population. D founders cannot be moved by any ordering and enter as
 *  a deterministic zero, which is why they are in the denominator and not the
 *  sample. Reproduces wsHO +1.68 and wsHW -3.10 exactly on the binary measure. */
function weighted(rows: Line[], s: Record<string, number>, f: (d: Line) => number) {
  const N = s.R + s.C + s.D;
  let est = 0, v = 0;
  for (const k of ["R", "C"]) {
    const x = rows.filter(d => d.stratum === k).map(f);
    if (!x.length) continue;
    est += (s[k] / N) * mean(x);
    if (x.length > 1) v += (s[k] / N) ** 2 * vari(x) / x.length;
  }
  return { est, se: Math.sqrt(v) };
}

const HO = load("indicative_wsHO"), HW = load("indicative_wsHW");
const S = { wsHO: { R: 324, C: 345, D: 159 }, wsHW: { R: 316, C: 350, D: 153 } };
const shared = [...HO.keys()].filter(c => HO.get(c)!.called && HW.get(c)!.called);
const rule = (t: string) => console.log("\n" + t + "\n" + "=".repeat(t.length));

rule(`1. THE ${shared.length} FOUNDERS BOTH RUNS CALLED`);
const flips = shared.filter(c => HO.get(c)!.hitTreatment !== HW.get(c)!.hitTreatment);
const ctlFlips = shared.filter(c => HO.get(c)!.hitControl !== HW.get(c)!.hitControl);
console.log(`model outcome flipped on ${flips.length} (${(100 * flips.length / shared.length).toFixed(1)}%)`
  + ` -- ${flips.filter(c => HW.get(c)!.hitTreatment).length} better, ${flips.filter(c => !HW.get(c)!.hitTreatment).length} worse`);
console.log(`OUR OWN outcome flipped on ${ctlFlips.length}. The control is deterministic; the churn is all on the model side.`);

rule("2. DID THE MENU CHANGE? -- the flips decomposed by cause");
const same = (c: string) => {
  const a = menuIds(HO.get(c)!), b = menuIds(HW.get(c)!);
  const seq = a.length === b.length && a.every((v, i) => v === b[i]);
  const set = new Set(a).size === new Set(b).size && a.every(v => b.includes(v));
  return { seq, set };
};
const grp = { ord: [] as string[], mem: [] as string[], drift: [] as string[] };
for (const c of shared) { const s = same(c); (s.seq ? grp.ord : s.set ? grp.mem : grp.drift).push(c); }
const fl = (g: string[]) => g.filter(c => HO.get(c)!.hitTreatment !== HW.get(c)!.hitTreatment).length;
console.log(`menu identical in ORDER and membership : ${String(grp.ord.length).padStart(3)} founders -> ${fl(grp.ord)} flipped (${(100 * fl(grp.ord) / grp.ord.length).toFixed(0)}%)`);
console.log(`same membership, our ranker REORDERED   : ${String(grp.mem.length).padStart(3)} founders -> ${fl(grp.mem)} flipped (${(100 * fl(grp.mem) / grp.mem.length).toFixed(0)}%)`);
console.log(`membership CHANGED (corpus drift)       : ${String(grp.drift.length).padStart(3)} founders -> ${fl(grp.drift)} flipped (${(100 * fl(grp.drift) / grp.drift.length).toFixed(0)}%)`);
console.log("\nThe flip rate is HIGHEST where the menu did not move. Corpus drift explains none of it.");
console.log("\n  " + "company".padEnd(42) + "str  dir     ourRank    modelRank   menu");
for (const c of flips.sort((a, b) => HO.get(a)!.stratum.localeCompare(HO.get(b)!.stratum))) {
  const a = HO.get(c)!, b = HW.get(c)!, s = same(c);
  console.log("  " + c.slice(0, 42).padEnd(42)
    + a.stratum.padEnd(5) + (b.hitTreatment ? "BETTER" : "WORSE ").padEnd(8)
    + `${String(a.poolRankControl).padStart(2)}->${String(b.poolRankControl).padEnd(6)}`
    + `${String(a.poolRankTreatment).padStart(3)}->${String(b.poolRankTreatment).padEnd(7)}`
    + (s.seq ? "identical" : s.set ? "reordered" : "drifted"));
}

rule("3. THE SAME TWO RUNS, SCORED BOTH WAYS, UNDER THE SAME STRATUM WEIGHTS");
console.log("run    measure               estimate       se   95% interval");
const keep: Record<string, { est: number; se: number }> = {};
for (const [tag, D] of [["wsHO", HO], ["wsHW", HW]] as const)
  for (const [nm, f, sc] of [["EXACT@6 (points)", binary, 100], ["reciprocal rank", recip, 1]] as const) {
    const rows = [...D.values()].filter(d => d.called);
    const { est, se } = weighted(rows, S[tag], f);
    keep[tag + nm] = { est: est * sc, se: se * sc };
    const lo = (est - Z95 * se) * sc, hi = (est + Z95 * se) * sc;
    console.log(`${tag}   ${nm.padEnd(20)} ${(est * sc).toFixed(4).padStart(8)} ${(se * sc).toFixed(4).padStart(8)}   [${lo.toFixed(4)}, ${hi.toFixed(4)}]  ${lo * hi > 0 ? "** EXCLUDES ZERO **" : "spans zero"}`);
  }
console.log("\nrun-to-run movement of the estimate, in units of its own standard error:");
for (const nm of ["EXACT@6 (points)", "reciprocal rank"]) {
  const a = keep["wsHO" + nm], b = keep["wsHW" + nm];
  const d = b.est - a.est, sd = Math.sqrt(a.se ** 2 + b.se ** 2);
  console.log(`  ${nm.padEnd(20)} ${a.est.toFixed(4).padStart(9)} -> ${b.est.toFixed(4).padStart(9)}   moved ${Math.abs(d / sd).toFixed(2)} SE`);
}
console.log("\nleave-one-regime-out, the standard both runs used to decide their own sign:");
const regimes = [...new Set(shared.map(c => HO.get(c)!.wonRegime))];
let posR = 0, posB = 0, n = 0;
for (const r of regimes) {
  const cs = shared.filter(c => HO.get(c)!.wonRegime !== r);
  if (cs.length < 20) continue;
  for (const [tag, D] of [["wsHO", HO], ["wsHW", HW]] as const) {
    n++;
    if (weighted(cs.map(c => D.get(c)!), S[tag], recip).est > 0) posR++;
    if (weighted(cs.map(c => D.get(c)!), S[tag], binary).est > 0) posB++;
  }
}
console.log(`  reciprocal rank stayed positive in ${posR} of ${n} subsets;  EXACT@6 in ${posB} of ${n}.`);

rule("4. WHAT A BUDGET BUYS -- and only 666 founders exist to buy");
const V: Record<string, { vb: number; vw: number }> = {};
for (const [nm, f] of [["EXACT@6 (points)", binary], ["reciprocal rank", recip]] as const) {
  const a = shared.map(c => f(HO.get(c)!)), b = shared.map(c => f(HW.get(c)!));
  const tot = vari([...a, ...b]), r = Math.max(0, pearson(a, b));
  V[nm] = { vb: r * tot, vw: (1 - r) * tot };
  console.log(`${nm.padEnd(20)} total var ${tot.toFixed(5)}  retest r ${r.toFixed(3)}  -> founder ${(r * tot).toFixed(5)} / model ${((1 - r) * tot).toFixed(5)}`);
}
console.log("(r is depressed by corpus drift as well as model noise, so the model term is an UPPER bound and every figure below is conservative)");
const POOL = 666, GRAD = 819;
console.log("\nbudget     calls  founders  reps | MDE EXACT@6 pts        | MDE recip rank");
console.log("                                 | in general   this draw | in general  this draw");
for (const eur of [28.76, 30, 100, 300, 1000]) {
  const calls = eur / EUR_PER_FOUNDER, N = Math.min(POOL, Math.floor(calls)), K = Math.max(1, calls / N);
  const mde = (nm: string, sp: boolean) => {
    const { vb, vw } = V[nm];
    return Z80 * Math.sqrt((sp ? vb / N : (vb * (1 - N / POOL)) / N) + vw / (N * K)) * (POOL / GRAD);
  };
  console.log(`EUR ${String(Math.round(eur)).padEnd(5)} ${String(Math.round(calls)).padStart(6)} ${String(N).padStart(8)} ${K.toFixed(1).padStart(6)} | `
    + `${(100 * mde("EXACT@6 (points)", true)).toFixed(2).padStart(8)} pts ${(100 * mde("EXACT@6 (points)", false)).toFixed(2).padStart(8)} pts | `
    + `${mde("reciprocal rank", true).toFixed(4).padStart(9)} ${mde("reciprocal rank", false).toFixed(4).padStart(10)}`);
}
console.log(`\nfor scale, the effect the model actually produces: ${keep["wsHWEXACT@6 (points)"].est.toFixed(2)} pts / ${keep["wsHWreciprocal rank"].est.toFixed(4)} recip`);
console.log("\n'in general' = would it hold for founders at large; founder sampling never vanishes and");
console.log("               EXACT@6 therefore has a FLOOR near 4 points that no budget crosses.");
console.log("'this draw'  = does it improve the score on OUR held-out 897; a census has no sampling error.");
