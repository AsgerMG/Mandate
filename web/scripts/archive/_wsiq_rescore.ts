/**
 * wsIQ — re-scoring the CLOSED ordering routes on reciprocal rank, free.
 *
 * wsII established that EXACT@6's half-width floors near 4.1 points at any
 * affordable price, and that it called a real, consistent effect a null twice.
 * Almost every ranking route this project closed was closed on EXACT@5 or
 * EXACT@6. This script asks, of the routes whose per-founder ranks are
 * COMMITTED, whether the arm actually moved the order and what a rank-sensitive
 * measure says about it.
 *
 * FREE. Offline. No key, no DB, no network, no model call. It reads only
 * committed artefacts:
 *
 *   project-mgmt/findings/headtohead_wsGA/{off,reverse,adviser}*.json
 *   project-mgmt/findings/seam_wsDR/recall.json
 *
 * ── WHY THESE AND NOT THE OTHERS ─────────────────────────────────────────
 * Every deterministic-ranker route (single signals, the blend, proximity, the
 * seat arms) wrote its per-pair feature dump to /tmp and committed only the
 * terminal summary. Those cannot be re-scored without re-running them, which
 * needs Postgres. They are triaged in the report, not re-scored here.
 *
 * ── THE MEASURE ──────────────────────────────────────────────────────────
 * Identical to wsII: mean(1/rankTreatment − 1/rankControl) over the founders
 * an ordering can move. EXACT@k is reported beside it EVERY TIME. A route that
 * moves recip and not EXACT@6 has not yet helped anybody.
 *
 * ── THE TRAP ─────────────────────────────────────────────────────────────
 * wsIJ found that a rank-conditioned gradient is reproduced by a RANDOM
 * reordering with a steeper slope. So every arm below is scored against two
 * nulls on its own menus: uniform picks, and picks whose DEPTH profile is
 * transferred from another founder.
 */
import { readFileSync } from "fs";
import { join } from "path";

const FIND = join(__dirname, "..", "..", "capital", "project-mgmt", "findings");
const rule = (t: string) => console.log("\n" + t + "\n" + "=".repeat(t.length));
const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;
const f4 = (x: number) => (x >= 0 ? "+" : "") + x.toFixed(4);
const f2 = (x: number) => (x >= 0 ? "+" : "") + x.toFixed(2);

/** seeded PRNG so every figure here is reproducible */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** paired bootstrap over founders — the unit of independence */
function boot(x: number[], draws = 6000, seed = 20260819) {
  const rnd = mulberry32(seed);
  const m: number[] = [];
  for (let d = 0; d < draws; d++) {
    let s = 0;
    for (let i = 0; i < x.length; i++) s += x[(rnd() * x.length) | 0];
    m.push(s / x.length);
  }
  m.sort((a, b) => a - b);
  return {
    est: mean(x),
    lo: m[Math.floor(0.025 * draws)],
    hi: m[Math.floor(0.975 * draws)],
    pPos: m.filter(v => v > 0).length / draws,
  };
}
const show = (label: string, x: number[], fmt: (n: number) => string) => {
  const b = boot(x);
  console.log(
    `  ${label.padEnd(34)} ${fmt(b.est).padStart(9)}  [${fmt(b.lo)}, ${fmt(b.hi)}]  P(>0)=${b.pPos.toFixed(3)}`
  );
  return b;
};

// ───────────────────────────────────────────────────────────────────────────
// wsGA — the three head-to-head arms, 2026-08-12
// ───────────────────────────────────────────────────────────────────────────
type GARow = {
  company: string; country: string; won: string; called?: boolean;
  menu: number; picks: number[];
  rankAccessible: number | null;
  rankControl: number | null; rankRanker: number | null;
  poolRankControl?: number | null; poolRankRanker?: number | null;
};
const ga = (f: string) => JSON.parse(readFileSync(join(FIND, "headtohead_wsGA", f), "utf8"));

const ADV = ga("adviser_medium_n773_x2.json");
const OFF = ga("off_low_n324.json");
const REV = ga("reverse_low_n324_x2.json");

rule("0. THE HARNESS ANCHORS — the two arms whose answer is known");
{
  const off: GARow[] = OFF.rows;
  const disc = off.filter(r => (r.rankControl ?? 99) !== (r.rankRanker ?? 99)).length;
  console.log(`  arm=off      ${off.length} founders, discordant on rankControl/rankRanker: ${disc}`);
  console.log(`               A GENUINE NULL BY CONSTRUCTION: the flag is off, the order is not touched.`);
  const rev: GARow[] = REV.rows.filter((r: GARow) => r.rankAccessible !== null && r.rankAccessible <= 18);
  console.log(`  arm=reverse  ${rev.length} in-pool founders, the pool order deliberately inverted.`);
}

rule("1. wsGA arm=adviser — DID IT MOVE THE ORDER?");
const adv: GARow[] = ADV.rows.filter((r: GARow) => r.called && r.poolRankControl && r.poolRankRanker);
{
  const moved = adv.filter(r => r.poolRankControl !== r.poolRankRanker).length;
  const shift = adv.map(r => r.poolRankRanker! - r.poolRankControl!);
  console.log(`  ${adv.length} founders called with the won fund in the 18-row menu.`);
  console.log(`  the won fund's POOL RANK changes on ${moved}/${adv.length} = ${(100 * moved / adv.length).toFixed(1)}%`);
  console.log(`  mean raw rank shift ${f2(mean(shift))} (negative favours the ranker) — wsGA published -0.76, Wilcoxon p=0.414`);
  console.log(`  THIS IS NOT A GENUINE NULL. The arm reordered nearly every menu.`);
}

// reconstruct the treatment order from `picks`, exactly as wsIJ did, and prove it
rule("2. THE RECONSTRUCTION, PROVEN BEFORE IT IS USED");
const controlOrder = (r: GARow) => Array.from({ length: r.menu }, (_, i) => i);
const modelOrder = (r: GARow) => [...r.picks, ...controlOrder(r).filter(i => !r.picks.includes(i))];
const wonIdx = (r: GARow) => r.poolRankControl! - 1;
const rankIn = (order: number[], r: GARow) => order.indexOf(wonIdx(r)) + 1;
{
  let ok = 0, bad: string[] = [];
  for (const r of adv) (rankIn(modelOrder(r), r) === r.poolRankRanker ? ok++ : bad.push(r.company));
  console.log(`  treatment pool rank reconstructs from picks on ${ok}/${adv.length} calls`);
  if (bad.length) console.log(`  MISMATCH on: ${bad.slice(0, 5).join(", ")}`);
  if (ok !== adv.length) throw new Error("reconstruction does not hold — do not read anything below");
}

rule("3. wsGA arm=adviser — BOTH MEASURES, PAIRED, vs our own order");
const exactAt = (k: number) => (r: GARow) => (r.poolRankRanker! <= k ? 1 : 0) - (r.poolRankControl! <= k ? 1 : 0);
const recip = (r: GARow) => 1 / r.poolRankRanker! - 1 / r.poolRankControl!;
{
  console.log(`  n=${adv.length}. Published by wsGA: EXACT@5 McNemar z=+0.80 p=0.522, EXACT@6 z=+0.95 p=0.430.`);
  show("EXACT@5, points", adv.map(r => 100 * exactAt(5)(r)), f2);
  show("EXACT@6, points", adv.map(r => 100 * exactAt(6)(r)), f2);
  show("reciprocal rank", adv.map(recip), f4);
}

rule("3b. THE SAME ARM ON THE PUBLISHED PROJECTION — reproducing wsGA's own table");
{
  const pub = ADV.rows.filter((r: GARow) => r.called);
  const at = (k: number, f: "rankControl" | "rankRanker") => pub.filter((r: GARow) => (r[f] ?? 99) <= k).length;
  console.log(`  control EXACT@5 ${at(5, "rankControl")}/${pub.length}   ranker ${at(5, "rankRanker")}/${pub.length}   (wsGA published 45/98 and 50/98)`);
  console.log(`  control EXACT@6 ${at(6, "rankControl")}/${pub.length}   ranker ${at(6, "rankRanker")}/${pub.length}   (wsGA published 51/98 and 57/98)`);
  const d5 = pub.filter((r: GARow) => ((r.rankControl ?? 99) <= 5) !== ((r.rankRanker ?? 99) <= 5)).length;
  console.log(`  discordant at 5: ${d5} (wsGA published 39). The extraction is the same rows wsGA scored.`);
}

rule("4. THE NULLS — wsIJ's trap, run on wsGA's own menus");
{
  const DRAWS = 4000;
  const rnd = mulberry32(7);
  const pickUniform = (r: GARow, n: number) => {
    const idx = controlOrder(r);
    for (let i = idx.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [idx[i], idx[j]] = [idx[j], idx[i]]; }
    return idx.slice(0, n);
  };
  const DEPTH = adv.map(r => r.picks.map(p => p / r.menu));
  const pickDepthMatched = (r: GARow) => {
    const donor = DEPTH[(rnd() * DEPTH.length) | 0];
    const out: number[] = [];
    for (const q of donor) {
      let i = Math.min(r.menu - 1, Math.max(0, Math.round(q * r.menu)));
      while (out.includes(i)) i = (i + 1) % r.menu;
      out.push(i);
    }
    return out;
  };
  const runNull = (label: string, gen: (r: GARow) => number[]) => {
    const ex5: number[] = [], ex6: number[] = [], rc: number[] = [];
    for (let d = 0; d < DRAWS; d++) {
      const e5: number[] = [], e6: number[] = [], rr: number[] = [];
      for (const r of adv) {
        const p = gen(r);
        const order = [...p, ...controlOrder(r).filter(i => !p.includes(i))];
        const t = rankIn(order, r);
        e5.push(100 * ((t <= 5 ? 1 : 0) - (r.poolRankControl! <= 5 ? 1 : 0)));
        e6.push(100 * ((t <= 6 ? 1 : 0) - (r.poolRankControl! <= 6 ? 1 : 0)));
        rr.push(1 / t - 1 / r.poolRankControl!);
      }
      ex5.push(mean(e5)); ex6.push(mean(e6)); rc.push(mean(rr));
    }
    const pct = (a: number[], obs: number) => a.filter(v => v >= obs).length / a.length;
    console.log(`  ${label}`);
    console.log(`     EXACT@5 ${f2(mean(ex5)).padStart(8)}   model ${f2(100 * mean(adv.map(exactAt(5))))}   p(null >= model) = ${pct(ex5, mean(adv.map(r => 100 * exactAt(5)(r)))).toFixed(4)}`);
    console.log(`     EXACT@6 ${f2(mean(ex6)).padStart(8)}   model ${f2(100 * mean(adv.map(exactAt(6))))}   p(null >= model) = ${pct(ex6, mean(adv.map(r => 100 * exactAt(6)(r)))).toFixed(4)}`);
    console.log(`     recip   ${f4(mean(rc)).padStart(8)}   model ${f4(mean(adv.map(recip)))}   p(null >= model) = ${pct(rc, mean(adv.map(recip))).toFixed(4)}`);
  };
  runNull("null A — seven rows drawn uniformly from the same menu", r => pickUniform(r, r.picks.length));
  runNull("null B — depth profile transferred from a random donor founder", pickDepthMatched);

  // the deterministic anti-ordering: a measure that cannot sign THIS is useless
  const rev: GARow[] = REV.rows.filter((r: GARow) => r.rankAccessible !== null && r.rankAccessible! <= 18);
  const rvRecip = rev.map(r => 1 / (19 - r.rankAccessible!) - 1 / r.rankAccessible!);
  const rvE6 = rev.map(r => 100 * (((19 - r.rankAccessible!) <= 6 ? 1 : 0) - (r.rankAccessible! <= 6 ? 1 : 0)));
  console.log(`  arm=reverse (the pool order inverted, n=${rev.length}) — the sign check`);
  console.log(`     EXACT@6 ${f2(mean(rvE6)).padStart(8)}   recip ${f4(mean(rvRecip))}`);
}

rule("5. wsGA arm=adviser — LEAVE ONE COUNTRY OUT");
{
  const countries = [...new Set(adv.map(r => r.country))];
  let posR = 0, posE = 0;
  for (const c of countries) {
    const sub = adv.filter(r => r.country !== c);
    if (mean(sub.map(recip)) > 0) posR++;
    if (mean(sub.map(exactAt(6))) > 0) posE++;
  }
  console.log(`  recip positive in ${posR}/${countries.length} folds; EXACT@6 positive in ${posE}/${countries.length}`);
}

// ───────────────────────────────────────────────────────────────────────────
// wsDR — the depth / seam route, closed on EXACT@5 22.2 -> 17.8
// ───────────────────────────────────────────────────────────────────────────
rule("6. wsDR — the DEPTH route, re-scored as far as the artefact allows");
type Arm = { menu: number; picks: number[]; poolIds: string[]; publishedIds: string[]; wonRank: number | null; wonInPool: boolean };
type DRRow = { company: string; accessible: number; late: Arm; early: Arm; offPublishedIds: string[]; offWonRank: number | null; offWonInPool: boolean };
{
  const rows: DRRow[] = JSON.parse(readFileSync(join(FIND, "seam_wsDR", "recall.json"), "utf8"));
  const inPool = rows.filter(r => r.offWonInPool);
  // the artefact never records the won fund's id. It is recoverable ONLY from a
  // published list the fund actually reached, in ANY of the three arms.
  const wonId = (r: DRRow): string | null =>
    (r.offWonRank && r.offPublishedIds[r.offWonRank - 1]) ||
    (r.late.wonRank && r.late.publishedIds[r.late.wonRank - 1]) ||
    (r.early.wonRank && r.early.publishedIds[r.early.wonRank - 1]) || null;
  const named = inPool.filter(r => wonId(r));
  console.log(`  ${rows.length} founders. The won fund is in the pool on ${inPool.length} — the only founders any ordering can move.`);
  console.log(`  wsDR published EXACT@5 off 9/45=20.0%, late 10/45=22.2%, early 8/45=17.8%. That whole ladder`);
  console.log(`  is ${inPool.length} movable founders and a two-founder difference, with no interval printed.`);
  console.log(`  The artefact never records the won fund's ID. It is recoverable on ${named.length}/${inPool.length},`);
  console.log(`  and ONLY where the fund reached some arm's published seven — so the recovered set is`);
  console.log(`  conditioned on success and biased toward the top. Read the numbers below with that.`);
  const arms: Array<["late" | "early", string]> = [["late", "seam=late (18 rows)"], ["early", "seam=early (40 rows)"]];
  for (const [key, label] of arms) {
    const s: { ctl: number; trt: number }[] = [];
    for (const r of named) {
      const a = r[key], id = wonId(r)!;
      const i = a.poolIds.indexOf(id);
      if (i < 0) continue;
      const order = [...a.picks, ...a.poolIds.map((_, k) => k).filter(k => !a.picks.includes(k))];
      s.push({ ctl: i + 1, trt: order.indexOf(i) + 1 });
    }
    console.log(`\n  ${label} — the model's order against our own inside that arm, n=${s.length}`);
    show("  EXACT@5, points", s.map(x => 100 * ((x.trt <= 5 ? 1 : 0) - (x.ctl <= 5 ? 1 : 0))), f2);
    show("  reciprocal rank", s.map(x => 1 / x.trt - 1 / x.ctl), f4);
  }
  console.log(`\n  VERDICT: unmeasurable, and only partly recoverable. Not a genuine null.`);
}

rule("7. ANCHOR — the estimator reproduces wsII's published figures");
type Line = { company: string; stratum: string; called?: boolean; hitControl: boolean; hitTreatment: boolean; poolRankControl: number; poolRankTreatment: number; menu: number };
{
  const load = (tag: string): Line[] =>
    readFileSync(join(FIND, tag, "main_tape.jsonl"), "utf8").split("\n").filter(l => l.trim()).map(l => JSON.parse(l) as Line).filter(d => d.called);
  const S: Record<string, Record<string, number>> = { indicative_wsHO: { R: 324, C: 345, D: 159 }, indicative_wsHW: { R: 316, C: 350, D: 153 } };
  const vari = (x: number[]) => { const m = mean(x); return x.reduce((a, b) => a + (b - m) ** 2, 0) / (x.length - 1); };
  const weighted = (rows: Line[], s: Record<string, number>, f: (d: Line) => number) => {
    const N = s.R + s.C + s.D; let est = 0, v = 0;
    for (const k of ["R", "C"]) {
      const x = rows.filter(d => d.stratum === k).map(f);
      if (!x.length) continue;
      est += (s[k] / N) * mean(x);
      if (x.length > 1) v += (s[k] / N) ** 2 * vari(x) / x.length;
    }
    return { est, se: Math.sqrt(v) };
  };
  for (const tag of ["indicative_wsHO", "indicative_wsHW"]) {
    const rows = load(tag);
    const b = weighted(rows, S[tag], d => 100 * ((d.hitTreatment ? 1 : 0) - (d.hitControl ? 1 : 0)));
    const r = weighted(rows, S[tag], d => 1 / d.poolRankTreatment - 1 / d.poolRankControl);
    console.log(`  ${tag}: EXACT@6 ${f4(b.est)} [${f2(b.est - 1.96 * b.se)}, ${f2(b.est + 1.96 * b.se)}]   recip ${f4(r.est)} [${f4(r.est - 1.96 * r.se)}, ${f4(r.est + 1.96 * r.se)}]   mean menu ${mean(rows.map(d => d.menu)).toFixed(1)}`);
  }
  console.log(`  wsII published: wsHO +1.6768 / +0.0739, wsHW -3.0986 / +0.0716.`);
}
