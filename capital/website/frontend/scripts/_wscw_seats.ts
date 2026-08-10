// wsCW — the seat allocation, read off the tape rather than run once per idea.
//
// `applyPeerPrecedence` is a pure reorder of the array it is handed, and
// `_wscw_dump.ts` records that array plus everything the reorder reads. So
// every seat count, and every router over them, is arithmetic on the tape. This
// file is that arithmetic, and it decides nothing on its own: an arm that looks
// good here still has to be implemented behind a flag and measured by
// `measure_recall.ts` on the real path, because the tape cannot see MEMO@6 and
// cannot see what a row PUBLISHES.
//
// FIDELITY FIRST. Before any counterfactual is believed, the simulation is
// replayed at the SHIPPED seat count and checked against the `final` order the
// code actually produced. A counterfactual from a simulator that cannot
// reproduce the present is a guess with a table around it.
//
//   npx tsx scripts/_wscw_seats.ts /tmp/wscw_tape.tune.json
import { readFileSync } from "fs";

interface Tape {
  want: string; wantRegime: string; wantChannel: string;
  country: string; sector: string; mode: string;
  collapsed: string[]; rel: number[]; scheme: string[]; regime: string[]; channel: string[];
  peerRank: number[]; priorLen: number;
  branch: "specific" | "flat" | "none"; seatsHeld: number;
  finalTop5: string[]; spread: number | null; descLen: number; inPool: boolean;
}

/** One row of the table, as the reorder sees it. */
interface Row { id: string; rel: number; scheme: string; regime: string; channel: string; peer: number; }

const rowsOf = (t: Tape): Row[] => t.collapsed.map((id, i) => ({
  id, rel: t.rel[i], scheme: t.scheme[i], regime: t.regime[i],
  channel: t.channel[i], peer: t.peerRank[i],
}));

/** `applyPeerPrecedence`, re-expressed over the tape, with the seat count as a
 *  parameter instead of a constant. Every other line is the shipped one:
 *  the flat branch's known/unknown split and its notified-scheme demotion, the
 *  specific branch's early return past that demotion. */
function reorder(rows: Row[], branch: Tape["branch"], seats: number): Row[] {
  if (branch === "none" || rows.length < 3) return rows;
  const k = Math.max(0, Math.min(seats, rows.length));
  if (branch === "specific") {
    const head = rows.slice(0, k);
    const tail = [...rows.slice(k)].sort((a, b) =>
      (a.peer < 0 ? 1e9 : a.peer) - (b.peer < 0 ? 1e9 : b.peer));
    return [...head, ...tail];
  }
  const lead = rows.slice(0, k);
  const rest = rows.slice(k);
  const known = rest.filter((r) => r.peer >= 0).sort((a, b) => a.peer - b.peer);
  const unknown = rest.filter((r) => r.peer < 0);
  const fill = [...known, ...unknown];
  const seen = new Set<string>();
  const firsts: Row[] = [], repeats: Row[] = [];
  for (const r of [...lead, ...fill]) {
    const c = r.scheme.trim();
    if (c && seen.has(c)) { repeats.push(r); continue; }
    if (c) seen.add(c);
    firsts.push(r);
  }
  return [...firsts, ...repeats];
}

/** The interleave wsCM measured as `alternate`, kept so this file can say what
 *  it costs on the same tape as everything else. */
function alternate(rows: Row[], branch: Tape["branch"]): Row[] {
  if (branch === "none" || rows.length < 3) return rows;
  const rest = rows.slice(1);
  const byPeer = [...rest.filter((r) => r.peer >= 0).sort((a, b) => a.peer - b.peer),
    ...rest.filter((r) => r.peer < 0)];
  const taken = new Set<Row>();
  const fill: Row[] = [];
  let i = 0, j = 0;
  for (let turn = 0; fill.length < rest.length; turn++) {
    const src = turn % 2 === 0 ? rest : byPeer;
    let k = turn % 2 === 0 ? i : j;
    while (k < src.length && taken.has(src[k])) k++;
    if (turn % 2 === 0) i = k; else j = k;
    if (k >= src.length) {
      for (const r of turn % 2 === 0 ? byPeer : rest) if (!taken.has(r)) { taken.add(r); fill.push(r); }
      break;
    }
    taken.add(src[k]); fill.push(src[k]);
  }
  const seen = new Set<string>();
  const firsts: Row[] = [], repeats: Row[] = [];
  for (const r of [rows[0], ...fill]) {
    const c = r.scheme.trim();
    if (c && seen.has(c)) { repeats.push(r); continue; }
    if (c) seen.add(c);
    firsts.push(r);
  }
  return [...firsts, ...repeats];
}

/** The shipped fill with the prior's REACH capped.
 *
 *  Today every row the prior has heard of outranks every row it has not — a
 *  fund sitting fortieth in the cell is promoted over the score's best unknown
 *  row on the strength of being in the list at all. The cell is ranked, so
 *  depth is information the fill throws away: this keeps the promotion for the
 *  prior's first `depth` entries and leaves everything else in score order.
 *
 *  A per-ROW conditioning rather than a per-founder one, and the parameter is a
 *  position in a ranked list, not a fund, a country or a sector. */
function cappedFill(rows: Row[], branch: Tape["branch"], seats: number, depth: number): Row[] {
  if (branch === "none" || rows.length < 3) return rows;
  const k = Math.max(0, Math.min(seats, rows.length));
  const lead = rows.slice(0, k);
  const rest = rows.slice(k);
  const known = rest.filter((r) => r.peer >= 0 && r.peer < depth).sort((a, b) => a.peer - b.peer);
  const promoted = new Set(known);
  const unknown = rest.filter((r) => !promoted.has(r));
  const seen = new Set<string>();
  const firsts: Row[] = [], repeats: Row[] = [];
  for (const r of [...lead, ...known, ...unknown]) {
    const c = r.scheme.trim();
    if (c && seen.has(c)) { repeats.push(r); continue; }
    if (c) seen.add(c);
    firsts.push(r);
  }
  return [...firsts, ...repeats];
}

/** RECIPROCAL RANK FUSION of the two orderings.
 *
 *  The shipped fill is not a 1:4 seat split, it is a strict TIER: every row the
 *  prior has heard of goes above every row it has not, whatever either scored.
 *  That is an infinitely strong prior expressed as an ordering. RRF is the same
 *  two orderings combined with a FINITE one — a row needs a good rank in both
 *  lists, or an excellent rank in one, and a row the prior has never seen is
 *  merely unhelped rather than buried.
 *
 *  `k0` is the standard damping: it decides how much a first place is worth
 *  against a fifth. Nothing about a fund, a country or a sector enters, and the
 *  weight is on the SIGNAL, not on any population. */
function rrf(rows: Row[], branch: Tape["branch"], k0: number, wPeer: number): Row[] {
  if (branch === "none" || rows.length < 3) return rows;
  const scoreRank = new Map(rows.map((r, i) => [r.id, i]));
  const known = rows.filter((r) => r.peer >= 0).sort((a, b) => a.peer - b.peer);
  const peerRank = new Map(known.map((r, i) => [r.id, i]));
  const key = (r: Row) => 1 / (k0 + (scoreRank.get(r.id) ?? 1e9))
    + (peerRank.has(r.id) ? wPeer / (k0 + peerRank.get(r.id)!) : 0);
  const fused = [...rows].sort((a, b) => key(b) - key(a));
  const seen = new Set<string>();
  const firsts: Row[] = [], repeats: Row[] = [];
  for (const r of fused) {
    const c = r.scheme.trim();
    if (c && seen.has(c)) { repeats.push(r); continue; }
    if (c) seen.add(c);
    firsts.push(r);
  }
  return [...firsts, ...repeats];
}

interface Score { exact: boolean; regime: boolean; channel: boolean; }
const grade = (t: Tape, order: Row[]): Score => {
  const top5 = order.slice(0, 5);
  return {
    exact: top5.some((r) => r.id === t.want),
    regime: top5.some((r) => r.regime === t.wantRegime),
    channel: top5.some((r) => r.channel === t.wantChannel),
  };
};

const pct = (n: number, d: number) => `${(100 * n / Math.max(1, d)).toFixed(1)}%`;
/** Wald half-width, the same one `halfWidth` in recallSample.ts prints. */
const hw = (k: number, n: number) => {
  const p = k / Math.max(1, n);
  return 100 * 1.96 * Math.sqrt(Math.max(p * (1 - p), 1e-9) / Math.max(1, n));
};

function tally(tapes: Tape[], order: (t: Tape) => Row[]) {
  let e = 0, r = 0, c = 0;
  for (const t of tapes) { const s = grade(t, order(t)); if (s.exact) e++; if (s.regime) r++; if (s.channel) c++; }
  return { e, r, c, n: tapes.length };
}
const line = (name: string, s: { e: number; r: number; c: number; n: number }) =>
  `  ${name.padEnd(30)} EXACT ${String(s.e).padStart(3)}/${s.n} ${pct(s.e, s.n).padStart(6)}` +
  ` +/-${hw(s.e, s.n).toFixed(1).padStart(4)}   REGIME ${pct(s.r, s.n).padStart(6)}   CHANNEL ${pct(s.c, s.n).padStart(6)}`;

/** McNemar over a paired arm, which is the only honest test on one tape. */
function mcnemar(tapes: Tape[], a: (t: Tape) => Row[], b: (t: Tape) => Row[]) {
  let ab = 0, ba = 0;
  for (const t of tapes) {
    const x = grade(t, a(t)).exact, y = grade(t, b(t)).exact;
    if (x && !y) ab++; else if (!x && y) ba++;
  }
  const n = ab + ba;
  const z = n ? (Math.abs(ab - ba) - 1) / Math.sqrt(n) : 0;
  return { ab, ba, z };
}

function main() {
  const file = process.argv[2] ?? "/tmp/wscw_tape.json";
  const tapes: Tape[] = JSON.parse(readFileSync(file, "utf8"));
  console.log(`tape ${file}  ${tapes.length} replays`);

  // ── 1. FIDELITY ─────────────────────────────────────────────────────────
  // Replay the shipped seat count and compare with the order the code
  // produced. Anything below 100% invalidates every counterfactual here.
  let ok = 0, bad: string[] = [];
  for (const t of tapes) {
    const seats = t.branch === "specific" ? 3 : t.branch === "flat" ? 1 : 0;
    const sim = reorder(rowsOf(t), t.branch, seats).slice(0, 5).map((r) => r.id);
    const want = t.finalTop5;
    if (sim.length === want.length && sim.every((x, i) => x === want[i])) ok++;
    else if (bad.length < 3) bad.push(`${t.want}: sim=${sim.join(",")} real=${want.join(",")}`);
  }
  console.log(`\nFIDELITY  the simulator reproduces the PUBLISHED five: ${ok}/${tapes.length}`);
  for (const b of bad) console.log(`    MISMATCH ${b}`);
  if (ok !== tapes.length) {
    console.log("  ^^ the counterfactuals below are NOT evidence until this is 1.0");
  }

  // ── 2. THE SEAT SWEEP ───────────────────────────────────────────────────
  // Only the seat count moves. `999` is the score alone: peer precedence still
  // runs, keeps every row, and the notified-scheme demotion still applies, so
  // it is the shipped path with the prior's ORDERING removed and nothing else.
  console.log(`\nSEAT SWEEP — the seat count is the ONLY thing that differs`);
  console.log(`  (shipped = 1 seat on the flat branch, 3 on the specific one)`);
  const shipped = (t: Tape) => reorder(rowsOf(t), t.branch, t.branch === "specific" ? 3 : 1);
  console.log(line("SHIPPED", tally(tapes, shipped)));
  for (const k of [0, 1, 2, 3, 4, 5, 999]) {
    const f = (t: Tape) => reorder(rowsOf(t), t.branch, k);
    const s = tally(tapes, f);
    const m = mcnemar(tapes, f, shipped);
    console.log(line(k === 999 ? "score alone (no peer order)" : `${k} seat(s), both branches`, s) +
      `   vs shipped +${m.ab}/-${m.ba} z=${m.z.toFixed(2)}`);
  }
  {
    const f = (t: Tape) => alternate(rowsOf(t), t.branch);
    console.log(line("alternate (wsCM)", tally(tapes, f)) +
      `   vs shipped +${mcnemar(tapes, f, shipped).ab}/-${mcnemar(tapes, f, shipped).ba}`);
  }

  // ── 2b. FUSION instead of a split ───────────────────────────────────────
  // If no per-founder router exists, the other way out of a fixed split is to
  // stop making it a split at all: rank on both lists at once, with a finite
  // weight rather than the shipped strict tier.
  console.log(`\nRANK FUSION — both orderings at once, with a FINITE weight on the prior`);
  for (const k0 of [1, 5, 10, 60]) {
    for (const w of [0.5, 1, 2]) {
      const f = (t: Tape) => rrf(rowsOf(t), t.branch, k0, w);
      const m = mcnemar(tapes, f, shipped);
      console.log(line(`RRF k0=${k0} wPeer=${w}`, tally(tapes, f)) +
        `   vs shipped +${m.ab}/-${m.ba} z=${m.z.toFixed(2)}`);
    }
  }

  // ── 2c. THE PRIOR'S REACH, capped ───────────────────────────────────────
  console.log(`\nPRIOR DEPTH CAP — the prior promotes only its first N entries`);
  for (const d of [1, 2, 3, 5, 8, 13, 21, 1e9]) {
    const f = (t: Tape) => cappedFill(rowsOf(t), t.branch, t.branch === "specific" ? 3 : 1, d);
    const m = mcnemar(tapes, f, shipped);
    console.log(line(d === 1e9 ? "no cap (= shipped)" : `depth <= ${d}`, tally(tapes, f)) +
      `   vs shipped +${m.ab}/-${m.ba} z=${m.z.toFixed(2)}`);
  }

  // ── 3. WHAT EACH SIGNAL KNOWS, on its own ───────────────────────────────
  // The two extremes of the sweep, as a 2x2. This is the "near-orthogonal"
  // claim in the peer-prior comment, re-measured on the shipped path rather
  // than on the 150-company sample it was written from.
  const scoreOnly = (t: Tape) => reorder(rowsOf(t), t.branch, 999);
  const peerOnly = (t: Tape) => reorder(rowsOf(t), t.branch, 0);
  let bothR = 0, scoreR = 0, peerR = 0, neither = 0;
  for (const t of tapes) {
    const s = grade(t, scoreOnly(t)).exact, p = grade(t, peerOnly(t)).exact;
    if (s && p) bothR++; else if (s) scoreR++; else if (p) peerR++; else neither++;
  }
  console.log(`\nWHAT EACH SIGNAL KNOWS ALONE  (EXACT@5, same pool, same founder)`);
  console.log(`  both right          ${String(bothR).padStart(4)}`);
  console.log(`  ONLY the score      ${String(scoreR).padStart(4)}   <- the peer prior loses these`);
  console.log(`  ONLY the peer prior ${String(peerR).padStart(4)}   <- the score loses these`);
  console.log(`  neither             ${String(neither).padStart(4)}`);
  console.log(`  union (a perfect binary router) ${bothR + scoreR + peerR}/${tapes.length} ` +
    `${pct(bothR + scoreR + peerR, tapes.length)}`);

  // ── 4. THE ORACLE OVER SEAT COUNTS ──────────────────────────────────────
  // The most any per-founder seat rule could buy, if it chose perfectly. If
  // this is close to the shipped number the fixed split is already optimal and
  // no router exists to be found.
  const KS = [0, 1, 2, 3, 4, 5, 999];
  let oracle = 0;
  const bestK = new Map<number, number>();
  for (const t of tapes) {
    const hits = KS.filter((k) => grade(t, reorder(rowsOf(t), t.branch, k)).exact);
    if (hits.length) { oracle++; bestK.set(hits[0], (bestK.get(hits[0]) ?? 0) + 1); }
  }
  console.log(`\nORACLE over the seat count  ${oracle}/${tapes.length} ${pct(oracle, tapes.length)}` +
    `   (a per-founder rule that always picked the right k)`);
  console.log(`  cheapest k that works, where any does: ` +
    [...bestK].sort((a, b) => a[0] - b[0]).map(([k, n]) => `${k === 999 ? "score" : k}:${n}`).join(" "));

  // ── 5. IS THERE A ROUTER? ───────────────────────────────────────────────
  // Only the DISCORDANT founders matter: where both orderings agree, no rule
  // over them can gain or lose anything. For each candidate feature — every one
  // of which is available at request time and none of which names a fund, a
  // country or a sector — report the AUC for "the score is the one that is
  // right". 0.5 is a feature that knows nothing.
  const disc = tapes.filter((t) => {
    const s = grade(t, scoreOnly(t)).exact, p = grade(t, peerOnly(t)).exact;
    return s !== p;
  });
  const label = (t: Tape) => grade(t, scoreOnly(t)).exact ? 1 : 0;
  const feats: Record<string, (t: Tape) => number> = {
    "description skewness": (t) => t.spread ?? 0,
    "branch is specific": (t) => (t.branch === "specific" ? 1 : 0),
    "description length": (t) => t.descLen,
    "pool size": (t) => t.collapsed.length,
    "prior cell size": (t) => t.priorLen,
    "share of pool the prior knows": (t) => t.peerRank.filter((x) => x >= 0).length / Math.max(1, t.collapsed.length),
    "prior knows the score's top row": (t) => (t.peerRank[0] >= 0 ? 1 : 0),
    "peer rank of the score's top row": (t) => (t.peerRank[0] >= 0 ? -t.peerRank[0] : -1e4),
    "peer-known rows in the score's five": (t) => t.peerRank.slice(0, 5).filter((x) => x >= 0).length,
    "score-vs-peer top5 overlap": (t) => {
      const a = new Set(reorder(rowsOf(t), t.branch, 999).slice(0, 5).map((r) => r.id));
      return reorder(rowsOf(t), t.branch, 0).slice(0, 5).filter((r) => a.has(r.id)).length;
    },
    "score gap statistic (scoreSeats)": (t) => {
      const v = t.rel.map((x) => Math.round(x * 1e6));
      const n = v.length; if (n < 2) return n;
      const mean = (v[0] - v[n - 1]) / (n - 1);
      if (!(mean > 0)) return 0;
      let k = 0; while (k < n - 1 && v[k] - v[k + 1] > mean) k += 1;
      return k;
    },
    "top score value": (t) => t.rel[0] ?? 0,
    "top-to-fifth score drop": (t) => (t.rel[0] ?? 0) - (t.rel[4] ?? 0),
    "median peer rank of the pool": (t) => {
      const k = t.peerRank.filter((x) => x >= 0).sort((a, b) => a - b);
      return k.length ? -k[k.length >> 1] : -1e4;
    },
  };
  const auc = (rows: Tape[], f: (t: Tape) => number) => {
    const pos = rows.filter((t) => label(t) === 1).map(f);
    const neg = rows.filter((t) => label(t) === 0).map(f);
    if (!pos.length || !neg.length) return NaN;
    let w = 0;
    for (const a of pos) for (const b of neg) w += a > b ? 1 : a === b ? 0.5 : 0;
    return w / (pos.length * neg.length);
  };
  console.log(`\nIS THERE A ROUTER?  ${disc.length} DISCORDANT founders ` +
    `(${disc.filter((t) => label(t) === 1).length} score-right, ` +
    `${disc.filter((t) => label(t) === 0).length} peer-right).`);
  console.log(`  AUC for "the SCORE is the one that is right". 0.50 knows nothing.`);
  const scored = Object.entries(feats).map(([k, f]) => [k, auc(disc, f)] as [string, number])
    .sort((a, b) => Math.abs(b[1] - 0.5) - Math.abs(a[1] - 0.5));
  for (const [k, v] of scored) console.log(`    ${k.padEnd(34)} ${v.toFixed(3)}`);

  // ── 5b. WHAT THE PRIOR ACTUALLY KNOWS ───────────────────────────────────
  // Where the won leaf sits IN THE CELL, split by which signal was right. If
  // the prior is right because it holds the answer near the front, depth is
  // the thing it knows; if it is right at depth 30, the fill is winning by
  // sheer coverage and there is nothing to condition on.
  const wantPeer = (t: Tape) => {
    const i = t.collapsed.indexOf(t.want);
    return i < 0 ? null : t.peerRank[i];
  };
  const wantScoreRank = (t: Tape) => {
    const i = reorder(rowsOf(t), t.branch, 999).findIndex((r) => r.id === t.want);
    return i < 0 ? null : i + 1;
  };
  const q = (xs: number[], p: number) =>
    xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))] : NaN;
  console.log(`\nWHERE THE WON LEAF SITS IN EACH LIST, by which signal was right`);
  for (const [name, g] of [
    ["only the peer prior right", disc.filter((t) => label(t) === 0)],
    ["only the score right", disc.filter((t) => label(t) === 1)],
    ["both right", tapes.filter((t) => grade(t, scoreOnly(t)).exact && grade(t, peerOnly(t)).exact)],
    ["neither right", tapes.filter((t) => !grade(t, scoreOnly(t)).exact && !grade(t, peerOnly(t)).exact)],
  ] as [string, Tape[]][]) {
    const pr = g.map(wantPeer).filter((x): x is number => x !== null && x >= 0);
    const unseen = g.filter((t) => wantPeer(t) === -1).length;
    const sr = g.map(wantScoreRank).filter((x): x is number => x !== null);
    console.log(`  ${name.padEnd(28)} n=${String(g.length).padStart(3)}   ` +
      `peer rank of the won leaf: median ${q(pr, 0.5)} p90 ${q(pr, 0.9)}  ` +
      `never in the cell ${unseen}/${g.length}   |   score rank: median ${q(sr, 0.5)} p90 ${q(sr, 0.9)}`);
  }

  // ── 5c. A ROUTER, EVALUATED HONESTLY ────────────────────────────────────
  // An AUC on the whole tape is a fit. The only question that matters is
  // whether a threshold CHOSEN on founders it has not seen still beats the
  // fixed split, so every feature gets a two-fold: pick the threshold and the
  // direction on one half, score it on the other, and report the pooled result
  // against the shipped split on exactly the same rows.
  console.log(`\nA ROUTER, CROSS-VALIDATED. Threshold fitted on one half, scored on the other.`);
  console.log(`  Shipped scores ${tally(tapes, shipped).e}/${tapes.length} on the same rows.`);
  const hash = (s: string) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); };
  const foldOf = (t: Tape) => hash(t.want + t.country + t.sector) % 2;
  const routed = (t: Tape, f: (x: Tape) => number, thr: number, dir: 1 | -1) =>
    (dir * f(t) > dir * thr ? scoreOnly(t) : shipped(t));
  const results: [string, number, string][] = [];
  for (const [name, f] of Object.entries(feats)) {
    let hits = 0;
    const chosen: string[] = [];
    for (const fold of [0, 1]) {
      const fit = tapes.filter((t) => foldOf(t) === fold);
      const evalOn = tapes.filter((t) => foldOf(t) !== fold);
      let best = { e: -1, thr: 0, dir: 1 as 1 | -1 };
      const cand = [...new Set(fit.map(f))].sort((a, b) => a - b);
      for (const thr of cand) for (const dir of [1, -1] as const) {
        const e = fit.filter((t) => grade(t, routed(t, f, thr, dir)).exact).length;
        if (e > best.e) best = { e, thr, dir };
      }
      hits += evalOn.filter((t) => grade(t, routed(t, f, best.thr, best.dir)).exact).length;
      chosen.push(`${best.dir > 0 ? ">" : "<"}${best.thr.toFixed(3)}`);
    }
    results.push([name, hits, chosen.join(" / ")]);
  }
  for (const [name, hits, thr] of results.sort((a, b) => b[1] - a[1])) {
    console.log(`    ${name.padEnd(34)} EXACT ${String(hits).padStart(3)}/${tapes.length} ` +
      `${pct(hits, tapes.length).padStart(6)}   thresholds ${thr}`);
  }

  // ── 6. THE BRANCH SPLIT, both ways ──────────────────────────────────────
  console.log(`\nBY BRANCH — the 81% and the 19% separately, under each extreme`);
  for (const b of ["flat", "specific", "none"] as const) {
    const g = tapes.filter((t) => t.branch === b);
    if (!g.length) continue;
    console.log(`  ${b} (${g.length})`);
    console.log(line("    shipped", tally(g, shipped)));
    for (const k of [0, 1, 2, 3, 5, 999]) {
      console.log(line(`    ${k === 999 ? "score alone" : `${k} seat(s)`}`,
        tally(g, (t) => reorder(rowsOf(t), t.branch, k))));
    }
  }
}

main();
