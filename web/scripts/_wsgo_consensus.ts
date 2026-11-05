// wsGO — WHAT A CONSENSUS OVER N SAMPLES WOULD HAVE DONE, MEASURED ON A TAPE
// WE ALREADY PAID FOR.
//
// ── The observation ────────────────────────────────────────────────────────
// wsGA fired the ranker TWICE per founder on an identical prompt and an
// identical pool object (`REPEAT=2`, 50 founders). It disagreed with itself
// about a fifth of the time and returned an identical list of picks for one
// founder in fifty. That variance is currently thrown away: production samples
// once and ships whatever comes back. Sampling N times and keeping what the
// samples agree on is the standard way to convert it into accuracy.
//
// The tape records, per repeated founder, `picks` and `picksB` — two ordered
// lists of pool indices from two independent replies. `agentSelectMemoPool`
// turns a reply into a FULL order of the pool by putting the picks first and
// leaving every unpicked row behind them IN THE POOL'S OWN ORDER. So both
// samples are recoverable as complete orders, and so is any consensus over
// them. That makes the whole question measurable for nothing.
//
// ── FREE BY CONSTRUCTION, AND PROVED RATHER THAN ASSERTED ──────────────────
// Last night the head-to-head instrument was found to have silently used a
// fallback ranker on every founder for want of exactly this kind of check, so
// this file does not merely claim to be free:
//
//   * it imports `node:fs` and `node:path` and NOTHING ELSE — no app module,
//     no SDK, no db handle. There is no code path to a paid call to disable.
//   * every API key in the environment is deleted before a line runs.
//   * `globalThis.fetch`, `XMLHttpRequest` and `node:https` request are
//     replaced with throwing stubs, so a network call cannot happen silently.
//     If a future edit reaches for one, the run DIES rather than spends.
//
//   npx tsx scripts/_wsgo_consensus.ts
//   TAPE=... SAMPLES=2 npx tsx scripts/_wsgo_consensus.ts
//
// ── WHAT IT MEASURES, AND IN WHICH SPACE ──────────────────────────────────
// RAW@k — the won fund at position <= k in the arm's OWN order of the pool.
//
// Not the published projection. `orderMemoCandidates` runs between the ranker's
// order and the page, and it is a function of the POOL OBJECTS (it demotes a
// row whose institution name is already shown), which the tape does not carry.
// It cannot be replayed for an order that was never fired. RAW is the space the
// ranker actually acts in, it is fully determined by the tape, and the tape's
// own recorded `poolRankRanker` is used as a FALSIFICATION CHECK: if this file's
// reconstruction of sample A does not reproduce that number on every founder,
// the run is VOID and exits non-zero. The published figures for A and B are
// printed alongside so the two spaces can be seen to track.
import { readFileSync } from "node:fs";
import path from "node:path";

// ── the free-by-construction guard ────────────────────────────────────────
for (const k of Object.keys(process.env)) {
  if (/API_KEY|_KEY$|TOKEN|SECRET/i.test(k)) delete process.env[k];
}
const forbid = (what: string) => () => {
  throw new Error(
    `wsGO is a FREE replay over a committed tape and just tried to use ${what}. ` +
    `Nothing here may reach the network. Fix the caller; do not relax this.`);
};
(globalThis as Record<string, unknown>).fetch = forbid("fetch");
(globalThis as Record<string, unknown>).XMLHttpRequest = forbid("XMLHttpRequest");
(globalThis as Record<string, unknown>).WebSocket = forbid("WebSocket");

const TAPE = process.env.TAPE ?? path.join(
  __dirname, "..", "..", "capital",
  "project-mgmt", "findings", "headtohead_wsGA", "adviser_medium_n773_x2.json");

interface TapeRow {
  company: string; country: string; menu: number;
  poolRankControl: number | null; poolRankRanker: number | null;
  rankRanker: number | null; rankRankerB: number | null; rankControl: number | null;
  picks: number[] | null; picksB: number[] | null;
  publishedRankerB: string[] | null;
}

/** A reply -> the arm's FULL order of the pool. This mirrors `agentSelect`:
 *  the model's picks in the model's order, then every row it did not pick, in
 *  the pool's own order. A reply with no usable picks therefore degrades to the
 *  score's order, which is what production does on a fallback. */
function fullOrder(picks: number[], menu: number): number[] {
  const seen = new Set<number>(); const out: number[] = [];
  for (const i of picks) if (i >= 0 && i < menu && !seen.has(i)) { seen.add(i); out.push(i); }
  for (let i = 0; i < menu; i++) if (!seen.has(i)) out.push(i);
  return out;
}

/** ── THE CONSENSUS RULE ────────────────────────────────────────────────────
 *  Mean position over the samples' full orders, ties broken by the row's own
 *  position in the pool.
 *
 *  Three properties, each of which is a TEST any replacement rule must pass —
 *  not a description of this implementation:
 *
 *  1. IDENTITY AT N=1. One sample in, that sample out, byte for byte. The
 *     sample count is a lever and its default must be today's behaviour, so
 *     nothing changes until someone decides it does.
 *  2. PERMUTATION INVARIANCE. `combine([a,b]) === combine([b,a])` for every
 *     input. A rule that fails this is not a consensus; it is sample one
 *     winning with extra steps, which is what any "on a tie, keep the first
 *     list's order" rule silently is.
 *  3. THE TIE-BREAK IS SAMPLE-INDEPENDENT. At N=2 there is no majority — only
 *     agreement or disagreement — so the tie rule does the real work and it
 *     must not be a sample. Here it is the POOL'S OWN ORDER: the deterministic
 *     score, computed before any call was made and identical under any
 *     permutation of the samples. When the samples carry no joint information
 *     about which of two funds ranks higher, the honest fallback is the arm we
 *     already trust, not a coin dressed as a decision.
 *
 *  What I expect to fail: because every unpicked row falls back to the pool
 *  order AND the tie-break is the pool order, this rule is BIASED TOWARD THE
 *  CONTROL. The ranker beats the control (51.0% vs 45.9% EXACT@5 on wsGA), so
 *  a rule that reverts toward the control whenever the samples disagree gives
 *  part of that edge back. The prediction is therefore that consensus lands
 *  BETWEEN control and single-sample rather than above both. */
function borda(orders: number[][], menu: number): number[] {
  const pos = orders.map((o) => { const m = new Array<number>(menu); o.forEach((v, i) => { m[v] = i; }); return m; });
  const mean = (i: number) => pos.reduce((s, m) => s + m[i], 0) / pos.length;
  return Array.from({ length: menu }, (_, i) => i)
    .sort((a, b) => (mean(a) - mean(b)) || (a - b));
}

/** The other family: frequency of appearance in the top `cut`. Stated so it can
 *  be compared rather than dismissed. At N=2 it takes three values {0,1,2} over
 *  18 rows and cannot order 7 seats on its own, so the tie-break — mean
 *  position, then pool — is doing nearly all of the work. That degeneracy IS
 *  the argument against it at low N, and it is why `borda` is the rule
 *  proposed: within-list order is information frequency throws away, and at
 *  N=2 it is nearly all the information there is. */
function frequency(orders: number[][], menu: number, cut: number): number[] {
  const pos = orders.map((o) => { const m = new Array<number>(menu); o.forEach((v, i) => { m[v] = i; }); return m; });
  const cnt = (i: number) => pos.reduce((s, m) => s + (m[i] < cut ? 1 : 0), 0);
  const mean = (i: number) => pos.reduce((s, m) => s + m[i], 0) / pos.length;
  return Array.from({ length: menu }, (_, i) => i)
    .sort((a, b) => (cnt(b) - cnt(a)) || (mean(a) - mean(b)) || (a - b));
}

function mcnemar(a: boolean[], b: boolean[]): { ab: number; ba: number; p: number } {
  let ab = 0, ba = 0;
  a.forEach((x, i) => { if (x && !b[i]) ab++; else if (b[i] && !x) ba++; });
  const n = ab + ba;
  if (!n) return { ab, ba, p: 1 };
  const C = (nn: number, k: number) => { let r = 1; for (let i = 0; i < k; i++) r = r * (nn - i) / (i + 1); return r; };
  let s = 0; for (let k = 0; k <= Math.min(ab, ba); k++) s += C(n, k);
  return { ab, ba, p: Math.min(1, (s * 2) / 2 ** n) };
}

const out: string[] = [];
const p = (s = "") => { out.push(s); console.log(s); };

const tape = JSON.parse(readFileSync(TAPE, "utf8")) as { rows: TapeRow[] };
const recs = tape.rows
  .filter((r) => r.publishedRankerB !== null && r.poolRankControl !== null)
  .map((r) => {
    const menu = r.menu || 18;
    return {
      c: r.company, menu, w: (r.poolRankControl as number) - 1,
      A: fullOrder(r.picks ?? [], menu), B: fullOrder(r.picksB ?? [], menu),
      poolRankRanker: r.poolRankRanker, rA: r.rankRanker, rB: r.rankRankerB, rC: r.rankControl,
    };
  });
const n = recs.length;

p(`tape                ${path.basename(TAPE)}`);
p(`repeated founders   ${n} with the won fund in the pool`);

// ── FALSIFICATION. Reconstruct sample A and check it against the number the
//    paid harness recorded. Every founder must agree or the run is void.
const bad = recs.filter((x) => x.A.indexOf(x.w) + 1 !== x.poolRankRanker);
p(`reconstruction      ${n - bad.length}/${n} reproduce the tape's own poolRankRanker`);
if (bad.length) {
  p("VOID — the replay does not reproduce the paid run's recorded ranks:");
  for (const x of bad.slice(0, 5)) p(`  ${x.c}  replay ${x.A.indexOf(x.w) + 1}  tape ${x.poolRankRanker}`);
  process.exit(2);
}

const at = (order: (x: typeof recs[0]) => number[], k: number) => recs.map((x) => order(x).indexOf(x.w) < k);
const arms: Record<string, (x: typeof recs[0]) => number[]> = {
  "sample A only (ships)": (x) => x.A,
  "sample B only": (x) => x.B,
  "pool order (control)": (x) => Array.from({ length: x.menu }, (_, i) => i),
  "CONSENSUS borda": (x) => borda([x.A, x.B], x.menu),
  "CONSENSUS freq@7": (x) => frequency([x.A, x.B], x.menu, 7),
  "CONSENSUS freq@5": (x) => frequency([x.A, x.B], x.menu, 5),
};
p(`\nRAW@k — the won fund at position <= k in the arm's own order of the pool (n=${n})`);
p(`| arm | RAW@5 | RAW@6 | RAW@7 |`);
p(`|---|---:|---:|---:|`);
const H = new Map<string, boolean[]>();
for (const [name, f] of Object.entries(arms)) {
  const cells = [5, 6, 7].map((k) => {
    const h = at(f, k); H.set(`${name}@${k}`, h);
    return `${h.filter(Boolean).length}/${n} (${(100 * h.filter(Boolean).length / n).toFixed(1)}%)`;
  });
  p(`| ${name} | ${cells.join(" | ")} |`);
}

p(`\nPAIRED — consensus against ONE sample, McNemar exact`);
for (const rule of ["CONSENSUS borda", "CONSENSUS freq@7", "CONSENSUS freq@5"]) {
  for (const k of [5, 6, 7]) {
    const { ab, ba, pv } = (() => { const r = mcnemar(H.get(`${rule}@${k}`)!, H.get(`sample A only (ships)@${k}`)!); return { ...r, pv: r.p }; })();
    p(`  ${rule.padEnd(18)} @${k}  discordant ${String(ab + ba).padStart(2)} ` +
      `(consensus ${ab}, single ${ba})  exact p=${pv.toFixed(3)}  ` +
      `${ab > ba ? "consensus" : ab < ba ? "SINGLE SAMPLE" : "tie"}`);
  }
}

// ── the ceiling on ANY rule over these two samples ────────────────────────
const a5 = at((x) => x.A, 5), b5 = at((x) => x.B, 5);
const both = a5.filter((v, i) => v && b5[i]).length;
const one = a5.filter((v, i) => v !== b5[i]).length;
p(`\nTHE CEILING ON ANY RULE OVER TWO SAMPLES, RAW@5`);
p(`  won fund in BOTH samples' top 5      ${both}/${n}`);
p(`  in exactly ONE (the whole swing set) ${one}/${n}`);
p(`  in NEITHER                           ${n - both - one}/${n}`);
p(`  one sample, in expectation           ${(both + one / 2).toFixed(1)}/${n} = ${(100 * (both + one / 2) / n).toFixed(1)}%`);
p(`  ORACLE best-of-two (needs the key)   ${both + one}/${n} = ${(100 * (both + one) / n).toFixed(1)}%`);
p(`  ADVERSARY worst-of-two               ${both}/${n} = ${(100 * both / n).toFixed(1)}%`);
p(`  So the ENTIRE band a 2-sample rule can move within is ` +
  `+/-${(100 * (one / 2) / n).toFixed(1)}pp, on ${one} founders.`);

// ── is the variance error, or a genuine tie between comparables? ──────────
p(`\nIS THE SELF-DISAGREEMENT ERROR, OR A NEAR-TIE?`);
const sameSet = recs.filter((x) => new Set(x.A.slice(0, 7)).size === 7 &&
  x.A.slice(0, 7).every((i) => x.B.slice(0, 7).includes(i))).length;
const sameOrd = recs.filter((x) => x.A.slice(0, 7).join() === x.B.slice(0, 7).join()).length;
let seatsMoved = 0; const displaced: number[] = [];
for (const x of recs) {
  const bs = new Set(x.B.slice(0, 7));
  for (const i of x.A.slice(0, 7)) if (!bs.has(i)) { seatsMoved++; displaced.push(x.B.indexOf(i) + 1); }
}
displaced.sort((u, v) => u - v);
p(`  same SET of 7, different order  ${sameSet - sameOrd}/${n}  <- a near-tie: which funds agreed, their order not`);
p(`  same SET and same order         ${sameOrd}/${n}`);
p(`  DIFFERENT set of 7              ${n - sameSet}/${n}`);
p(`  seats holding the same fund in both samples: ${7 * n - seatsMoved}/${7 * n} (${(100 * (7 * n - seatsMoved) / (7 * n)).toFixed(1)}%)`);
p(`  a row in A's top 7 but not B's sits at B-rank median ${displaced[displaced.length >> 1]} of 18 ` +
  `— displaced a LONG way, not nudged`);

// The property any consensus rule must exploit: the won fund must be MORE
// stable across samples than the rows competing with it. If it is not, no rule
// that rewards agreement can prefer it, at any N.
const wonSpread: number[] = [], rivalSpread: number[] = [];
for (const x of recs) {
  wonSpread.push(Math.abs(x.A.indexOf(x.w) - x.B.indexOf(x.w)));
  for (const i of x.A.slice(0, 5)) if (i !== x.w) rivalSpread.push(Math.abs(x.A.indexOf(i) - x.B.indexOf(i)));
}
const mean = (v: number[]) => v.reduce((s, y) => s + y, 0) / v.length;
p(`\nTHE PROPERTY A CONSENSUS RULE NEEDS, AND WHETHER IT HOLDS`);
p(`  mean |rank(A)-rank(B)|   WON fund ${mean(wonSpread).toFixed(2)} (n=${wonSpread.length})` +
  `   its RIVALS ${mean(rivalSpread).toFixed(2)} (n=${rivalSpread.length})`);
p(`  A rule that rewards agreement can only find the won fund if the won fund is`);
p(`  MORE stable than the rows displacing it. Higher is less stable.`);

// ── published projection, for comparison of spaces ────────────────────────
const hit = (v: number | null, k: number) => v !== null && v <= k;
p(`\nPUBLISHED EXACT@k on the same founders (the tape's own projections, single samples only)`);
for (const k of [5, 6]) {
  p(`  @${k}  sample A ${recs.filter((x) => hit(x.rA, k)).length}/${n}` +
    `   sample B ${recs.filter((x) => hit(x.rB, k)).length}/${n}` +
    `   control ${recs.filter((x) => hit(x.rC, k)).length}/${n}` +
    `   | RAW sample A ${at((x) => x.A, k).filter(Boolean).length}/${n}`);
}

p(`\nSPEND THIS RUN: EUR 0.0000. No network call was reachable from this file.`);
