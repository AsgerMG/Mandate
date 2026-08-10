// wsDA — is the discriminator a property of the CANDIDATE ROW?
//
// wsCW closed the founder-side router: fourteen request-time features, two-fold
// cross-validated, none beat the constant. Its own explanation was that the
// thing deciding which signal is right is a property of the ANSWER — whether
// the won fund lives in this founder's peer cell at all — and no feature of the
// founder reveals it.
//
// But that property is not only a property of the answer. It is a property of
// EVERY candidate row, and it is readable at request time for each of them:
// this row is in the cell at depth 2; that row is in no cell anywhere; this
// third one is absent from THIS cell but recurs across the country. wsCW never
// measured a single per-row feature. This file does, and it does the cheap
// thing first: it bounds what a per-row rule could possibly buy before anything
// is built.
//
// EVERYTHING HERE IS FREE. It reads the wsCW tape (`_wscw_dump.ts`) and
// `peerPrior.generated.json`. No model calls, no database, no embeddings.
//
// THE LEAK ARGUMENT, once, for every feature below. Each is a function of
// (fund id, founder country, founder sector) through `peerPrior.generated.json`
// alone. `ETL/terms/emit_peer_prior.py` drops EVERY company in EVERY graded
// recall set — by glob over `__recallSet*.json`, by default, not behind a
// flag — before it counts a single award pair. So the artifact has never seen
// the founder being graded, and no aggregate over it can see the answer. The
// harness's own withheld award history is a different object and is not read
// here.
//
//   npx tsx scripts/_wsda_rows.ts /tmp/wscw_tape.tune.json
import { readFileSync } from "fs";

interface Tape {
  want: string; wantRegime: string; wantChannel: string;
  country: string; sector: string; mode: string;
  collapsed: string[]; rel: number[]; scheme: string[]; regime: string[]; channel: string[];
  peerRank: number[]; priorLen: number;
  branch: "specific" | "flat" | "none"; seatsHeld: number;
  finalTop5: string[]; spread: number | null; descLen: number; inPool: boolean;
}

interface Row {
  id: string; rel: number; scheme: string; regime: string; channel: string;
  /** rank in the founder's own (country, sector) cell; -1 = absent */
  peer: number;
  /** position on the score, 0-based */
  srank: number;
  /** rank among the funds that recur in this COUNTRY across all sectors */
  crank: number;
  /** rank among the funds that recur in this SECTOR across all countries */
  krank: number;
  /** how many of the 260 cells hold this fund at all */
  cells: number;
  /** best rank this fund reaches in any cell */
  best: number;
}

// ── the prior, and the three back-offs read off it ────────────────────────
const PRIOR: Record<string, string[]> = JSON.parse(readFileSync(
  new URL("../lib/intelligence/peerPrior.generated.json", import.meta.url), "utf8"));

/** Borda over a group of cells: a fund's score is the sum of (cellLen - rank)
 *  over every cell in the group, so a fund near the front of many cells beats
 *  one buried in a few. Ties broken by id for determinism. */
function marginal(keys: string[]): Map<string, number> {
  const pts = new Map<string, number>();
  for (const k of keys) {
    const cell = PRIOR[k] ?? [];
    cell.forEach((id, i) => pts.set(id, (pts.get(id) ?? 0) + (cell.length - i)));
  }
  const order = [...pts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  return new Map(order.map(([id], i) => [id, i]));
}

const ALL_KEYS = Object.keys(PRIOR);
const countryMarginal = new Map<string, Map<string, number>>();
const sectorMarginal = new Map<string, Map<string, number>>();
for (const c of new Set(ALL_KEYS.map((k) => k.split("|")[0]))) {
  countryMarginal.set(c, marginal(ALL_KEYS.filter((k) => k.startsWith(`${c}|`))));
}
for (const s of new Set(ALL_KEYS.map((k) => k.split("|")[1]))) {
  sectorMarginal.set(s, marginal(ALL_KEYS.filter((k) => k.endsWith(`|${s}`))));
}
const cellCount = new Map<string, number>();
const bestAnywhere = new Map<string, number>();
for (const k of ALL_KEYS) {
  (PRIOR[k] ?? []).forEach((id, i) => {
    cellCount.set(id, (cellCount.get(id) ?? 0) + 1);
    bestAnywhere.set(id, Math.min(bestAnywhere.get(id) ?? 1e9, i));
  });
}

/** The tape stores the founder's country as it was asked, the prior is keyed on
 *  ISO2. Every tape country in the graded set is already ISO2 or resolves by
 *  a straight uppercase; anything that does not resolve is reported, not
 *  silently treated as an empty marginal. */
const iso = (c: string) => c.trim().toUpperCase().slice(0, 2);

function rowsOf(t: Tape): Row[] {
  const cm = countryMarginal.get(iso(t.country)) ?? new Map();
  const sm = sectorMarginal.get(t.sector) ?? new Map();
  return t.collapsed.map((id, i) => ({
    id, rel: t.rel[i], scheme: t.scheme[i], regime: t.regime[i], channel: t.channel[i],
    peer: t.peerRank[i], srank: i,
    crank: cm.get(id) ?? -1,
    krank: sm.get(id) ?? -1,
    cells: cellCount.get(id) ?? 0,
    best: bestAnywhere.get(id) ?? -1,
  }));
}

// ── the shipped reorder, verbatim from wsCW, as the baseline ──────────────
function dedupe(rows: Row[]): Row[] {
  const seen = new Set<string>();
  const firsts: Row[] = [], repeats: Row[] = [];
  for (const r of rows) {
    const c = r.scheme.trim();
    if (c && seen.has(c)) { repeats.push(r); continue; }
    if (c) seen.add(c);
    firsts.push(r);
  }
  return [...firsts, ...repeats];
}

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
  return dedupe([...lead, ...known, ...unknown]);
}

const shipped = (t: Tape) => reorder(rowsOf(t), t.branch, t.branch === "specific" ? 3 : 1);
const scoreOnly = (t: Tape) => reorder(rowsOf(t), t.branch, 999);
const peerOnly = (t: Tape) => reorder(rowsOf(t), t.branch, 0);

interface Score { exact: boolean; regime: boolean; channel: boolean }
const grade = (t: Tape, order: Row[]): Score => {
  const top5 = order.slice(0, 5);
  return {
    exact: top5.some((r) => r.id === t.want),
    regime: top5.some((r) => r.regime === t.wantRegime),
    channel: top5.some((r) => r.channel === t.wantChannel),
  };
};
const pct = (n: number, d: number) => `${(100 * n / Math.max(1, d)).toFixed(1)}%`;
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
  `  ${name.padEnd(34)} EXACT ${String(s.e).padStart(3)}/${s.n} ${pct(s.e, s.n).padStart(6)}` +
  ` +/-${hw(s.e, s.n).toFixed(1).padStart(4)}   REGIME ${pct(s.r, s.n).padStart(6)}   CHANNEL ${pct(s.c, s.n).padStart(6)}`;
function mcnemar(tapes: Tape[], a: (t: Tape) => Row[], b: (t: Tape) => Row[]) {
  let ab = 0, ba = 0;
  for (const t of tapes) {
    const x = grade(t, a(t)).exact, y = grade(t, b(t)).exact;
    if (x && !y) ab++; else if (!x && y) ba++;
  }
  const n = ab + ba;
  return { ab, ba, z: n ? (Math.abs(ab - ba) - 1) / Math.sqrt(n) : 0 };
}
const q = (xs: number[], p: number) =>
  xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))] : NaN;

function main() {
  const file = process.argv[2] ?? "/tmp/wscw_tape.tune.json";
  const tapes: Tape[] = JSON.parse(readFileSync(file, "utf8"));
  console.log(`tape ${file}  ${tapes.length} replays`);
  const unresolved = new Set(tapes.map((t) => t.country).filter((c) => !countryMarginal.has(iso(c))));
  console.log(`countries with no marginal (empty back-off, not an error): ` +
    `${unresolved.size ? [...unresolved].join(",") : "none"}`);

  // ── 0. FIDELITY ─────────────────────────────────────────────────────────
  let ok = 0;
  for (const t of tapes) {
    const sim = shipped(t).slice(0, 5).map((r) => r.id);
    if (sim.length === t.finalTop5.length && sim.every((x, i) => x === t.finalTop5[i])) ok++;
  }
  console.log(`FIDELITY  simulator reproduces the PUBLISHED five: ${ok}/${tapes.length}`);
  if (ok !== tapes.length) console.log("  ^^ nothing below is evidence until this is 1.0");
  console.log(line("SHIPPED", tally(tapes, shipped)));

  // ── 1. THE 2x2, and where the won leaf sits in each per-row list ────────
  const disc = tapes.filter((t) => grade(t, scoreOnly(t)).exact !== grade(t, peerOnly(t)).exact);
  const scoreWins = disc.filter((t) => grade(t, scoreOnly(t)).exact);
  const peerWins = disc.filter((t) => !grade(t, scoreOnly(t)).exact);
  const both = tapes.filter((t) => grade(t, scoreOnly(t)).exact && grade(t, peerOnly(t)).exact);
  const neither = tapes.filter((t) => !grade(t, scoreOnly(t)).exact && !grade(t, peerOnly(t)).exact);
  console.log(`\nTHE 2x2  both ${both.length}  only-score ${scoreWins.length}  ` +
    `only-peer ${peerWins.length}  neither ${neither.length}   union ` +
    `${both.length + scoreWins.length + peerWins.length} ` +
    `${pct(both.length + scoreWins.length + peerWins.length, tapes.length)}`);

  console.log(`\nWHERE THE WON LEAF SITS IN EACH PER-ROW LIST`);
  console.log(`  (cell = own peer cell; ctry = country marginal; sect = sector marginal;` +
    ` cells = how many of the 260 cells hold it)`);
  for (const [name, g] of [
    ["only the peer prior right", peerWins], ["only the score right", scoreWins],
    ["both right", both], ["neither right", neither],
  ] as [string, Tape[]][]) {
    const rw = g.map((t) => rowsOf(t).find((r) => r.id === t.want)).filter((r): r is Row => !!r);
    const inCell = rw.filter((r) => r.peer >= 0);
    const outCell = rw.filter((r) => r.peer < 0);
    const ct = outCell.map((r) => r.crank).filter((x) => x >= 0);
    const st = outCell.map((r) => r.krank).filter((x) => x >= 0);
    console.log(`  ${name.padEnd(26)} n=${String(g.length).padStart(3)}  ` +
      `in cell ${inCell.length} (median depth ${q(inCell.map((r) => r.peer), 0.5)})  ` +
      `OUT of cell ${outCell.length}` +
      `  | of those: in ctry marginal ${ct.length} (median ${q(ct, 0.5)}),` +
      ` in sect marginal ${st.length} (median ${q(st, 0.5)}),` +
      ` in NO cell anywhere ${outCell.filter((r) => r.cells === 0).length}`);
  }

  // ── 2. THE ORACLE BOUND ON PER-ROW ROUTING ──────────────────────────────
  //
  // The unrestricted per-row oracle is 100% and says nothing: "put the answer
  // first" is a per-row decision. A bound is only meaningful over a FAMILY of
  // rules whose decisions are functions of the row features. So the family is
  // fixed first, and the oracle is the best member of that family PER FOUNDER —
  // a ceiling no member, and no learned selector over members, can pass.
  //
  // The family: the shipped fill with the peer-unknown rows given a BACK-OFF
  // key instead of +infinity. `off` is the position at which the back-off list
  // starts relative to the cell; `cap` is how far down the back-off may reach.
  const backoffs: Record<string, (r: Row) => number> = {
    ctry: (r) => r.crank,
    sect: (r) => r.krank,
    best: (r) => r.best,
    cells: (r) => (r.cells > 0 ? 1000 - r.cells : -1),
  };
  const arm = (t: Tape, which: string, off: number, cap: number): Row[] => {
    const rows = rowsOf(t);
    if (t.branch === "none" || rows.length < 3) return rows;
    const f = backoffs[which];
    const key = (r: Row) => {
      if (r.peer >= 0) return r.peer;
      const b = f(r);
      return b >= 0 && b < cap ? off + b : 1e9;
    };
    const seats = t.branch === "specific" ? 3 : 1;
    const head = rows.slice(0, seats);
    const rest = [...rows.slice(seats)].sort((a, b) => key(a) - key(b) || a.srank - b.srank);
    if (t.branch === "specific") return [...head, ...rest];
    return dedupe([...head, ...rest]);
  };

  const OFFS = [0, 2, 4, 8, 16, 1e9];
  const CAPS = [1, 2, 3, 5, 8, 13, 21, 40, 1e9];
  const members: [string, (t: Tape) => Row[]][] = [];
  for (const w of Object.keys(backoffs)) {
    for (const o of OFFS) for (const c of CAPS) {
      if (o === 1e9 && c !== 1e9) continue; // off=inf is shipped whatever the cap
      members.push([`${w} off=${o === 1e9 ? "inf" : o} cap=${c === 1e9 ? "inf" : c}`,
        (t: Tape) => arm(t, w, o, c)]);
    }
  }
  let oracle = 0;
  for (const t of tapes) if (members.some(([, f]) => grade(t, f(t)).exact)) oracle++;
  console.log(`\nORACLE over the per-row back-off family (${members.length} members, ` +
    `best member chosen PER FOUNDER):`);
  console.log(`  ${oracle}/${tapes.length} ${pct(oracle, tapes.length)}   ` +
    `vs shipped ${tally(tapes, shipped).e} and vs the wsCW union ` +
    `${both.length + scoreWins.length + peerWins.length}`);

  // The oracle over the WHOLE space a per-row key can express, not just this
  // family: any ordering that is a function of (score rank, cell rank, ctry
  // rank, sect rank, cells) — bounded by asking whether the won row is
  // SEPARABLE from the rows that outrank it under ANY monotone combination.
  // The cheap version of that question: could the won row reach the five if
  // every peer-known row it does not outscore were ordered by score instead?
  console.log(`\nBEST SINGLE MEMBER on this tape (a fitted upper bound, not a result):`);
  const scored = members.map(([n, f]) => [n, tally(tapes, f)] as [string, ReturnType<typeof tally>])
    .sort((a, b) => b[1].e - a[1].e);
  for (const [n, s] of scored.slice(0, 12)) {
    const m = mcnemar(tapes, (t) => arm(t, n.split(" ")[0], Number(n.match(/off=(\S+)/)![1]),
      Number(n.match(/cap=(\S+)/)![1])), shipped);
    console.log(line(n, s) + `   vs shipped +${m.ab}/-${m.ba} z=${m.z.toFixed(2)}`);
  }

  // ── 3. WHAT BLOCKS THE SCORE'S EXCLUSIVE WINS ───────────────────────────
  // For each founder where only the score is right: what is standing between
  // the won row and the visible five under the shipped order?
  console.log(`\nWHAT BLOCKS THE SCORE'S ${scoreWins.length} EXCLUSIVE WINS`);
  {
    const blockers: Row[] = [];
    let wantOut = 0;
    for (const t of scoreWins) {
      const order = shipped(t);
      const i = order.findIndex((r) => r.id === t.want);
      const w = order[i];
      if (w && w.peer < 0) wantOut++;
      blockers.push(...order.slice(0, 5).filter((r) => r.id !== t.want));
    }
    const inCell = blockers.filter((r) => r.peer >= 0);
    console.log(`  won row is OUT of the cell in ${wantOut}/${scoreWins.length}`);
    console.log(`  the ${blockers.length} rows occupying the five: ${inCell.length} are in the cell ` +
      `(median depth ${q(inCell.map((r) => r.peer), 0.5)}, median score rank ${q(inCell.map((r) => r.srank), 0.5)})`);
    console.log(`  those blockers' breadth: median cells ${q(inCell.map((r) => r.cells), 0.5)}, ` +
      `median best-anywhere ${q(inCell.map((r) => r.best), 0.5)}`);
  }
  console.log(`\nAND WHAT CARRIES THE PEER'S ${peerWins.length} EXCLUSIVE WINS`);
  {
    const w = peerWins.map((t) => rowsOf(t).find((r) => r.id === t.want)).filter((r): r is Row => !!r);
    console.log(`  won row: median cell depth ${q(w.map((r) => r.peer), 0.5)}, ` +
      `median cells ${q(w.map((r) => r.cells), 0.5)}, median score rank ${q(w.map((r) => r.srank), 0.5)}`);
  }

  // ── 4. THE GENERAL PER-ROW BOUND ────────────────────────────────────────
  //
  // The back-off family is one shape. The bound that actually closes the
  // question has to cover EVERY rule whose per-row decision is a function of
  // the row's features, so the family is widened to exactly that.
  //
  // Rule shape, a strict generalisation of the shipped one: the score keeps its
  // head seat; every remaining row is assigned to one of two tiers by a
  // function `o` of its DISCRETISED feature vector — tier 1 ("trust the peer")
  // sorts by cell rank then back-off, tier 0 ("trust the score") sorts by score
  // rank — and tier 1 precedes tier 0. Shipped is the member with
  // o(v) = 1 iff the row is in the cell, so the family contains the baseline by
  // construction and cannot lose to it by accident.
  //
  // `o` is then FITTED on the tape itself by coordinate ascent — every vector
  // flipped in turn, keeping any flip that gains, to convergence. That is
  // deliberate overfitting: the result is an upper bound on what ANY per-row
  // rule over these features can score, learned or hand-written, because the
  // fit has already seen every answer. The honest estimate of the same rule is
  // the two-fold below it.
  const bucket = (r: Row): string => {
    const d = r.peer < 0 ? "x" : r.peer <= 1 ? "a" : r.peer <= 3 ? "b" : r.peer <= 7 ? "c"
      : r.peer <= 15 ? "d" : "e";
    const s = r.srank === 0 ? "0" : r.srank <= 2 ? "1" : r.srank <= 4 ? "2" : r.srank <= 9 ? "3"
      : r.srank <= 19 ? "4" : "5";
    const n = r.cells === 0 ? "0" : r.cells <= 2 ? "1" : r.cells <= 5 ? "2" : r.cells <= 10 ? "3" : "4";
    const c = r.crank < 0 ? "x" : r.crank <= 9 ? "a" : r.crank <= 29 ? "b" : r.crank <= 79 ? "c" : "d";
    return d + s + n + c;
  };
  const tiered = (t: Tape, o: Set<string>): Row[] => {
    const rows = rowsOf(t);
    if (t.branch === "none" || rows.length < 3) return rows;
    const seats = t.branch === "specific" ? 3 : 1;
    const head = rows.slice(0, seats);
    const rest = rows.slice(seats);
    const hi = rest.filter((r) => o.has(bucket(r)))
      .sort((a, b) => (a.peer < 0 ? 1e6 + (a.crank < 0 ? 1e5 : a.crank) : a.peer)
        - (b.peer < 0 ? 1e6 + (b.crank < 0 ? 1e5 : b.crank) : b.peer) || a.srank - b.srank);
    const lo = rest.filter((r) => !o.has(bucket(r))).sort((a, b) => a.srank - b.srank);
    if (t.branch === "specific") return [...head, ...hi, ...lo];
    return dedupe([...head, ...hi, ...lo]);
  };
  const vectors = [...new Set(tapes.flatMap((t) => rowsOf(t).map(bucket)))].sort();
  const seed = new Set(vectors.filter((v) => v[0] !== "x")); // = shipped
  const fit = (rows: Tape[]): Set<string> => {
    const o = new Set(seed);
    let cur = rows.filter((t) => grade(t, tiered(t, o)).exact).length;
    for (let pass = 0; pass < 6; pass++) {
      let moved = false;
      for (const v of vectors) {
        if (o.has(v)) o.delete(v); else o.add(v);
        const next = rows.filter((t) => grade(t, tiered(t, o)).exact).length;
        if (next > cur) { cur = next; moved = true; } else if (o.has(v)) o.delete(v); else o.add(v);
      }
      if (!moved) break;
    }
    return o;
  };
  console.log(`\nGENERAL PER-ROW BOUND — a two-tier rule over ${vectors.length} discretised ` +
    `row-feature vectors`);
  console.log(line("  seed (= shipped, by construction)", tally(tapes, (t) => tiered(t, seed))));
  const fitted = fit(tapes);
  console.log(line("  FITTED ON ITSELF (upper bound)", tally(tapes, (t) => tiered(t, fitted))));
  const hash = (s: string) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); };
  const foldOf = (t: Tape) => hash(t.want + t.country + t.sector) % 2;
  let cv = 0, cvR = 0, cvC = 0;
  for (const f of [0, 1]) {
    const o = fit(tapes.filter((t) => foldOf(t) === f));
    for (const t of tapes.filter((t) => foldOf(t) !== f)) {
      const s = grade(t, tiered(t, o)); if (s.exact) cv++; if (s.regime) cvR++; if (s.channel) cvC++;
    }
  }
  console.log(line("  TWO-FOLD (the honest estimate)", { e: cv, r: cvR, c: cvC, n: tapes.length }));

  // ── 5. WHY — the two row populations a per-row rule must separate ───────
  //
  // A per-row rule that recovers the score's exclusive wins has to push the
  // rows currently occupying those five DOWN. A rule that keeps the prior's
  // exclusive wins has to keep the rows carrying THOSE five UP. If those two
  // populations of rows look the same on the features, no function of the
  // features can do both, and the bound above is not a shortage of family
  // shapes — it is a shortage of information in the row.
  //
  // AUC for "this row is one to KEEP up". 0.50 is a feature that cannot tell
  // the two populations apart at all.
  const keepUp = peerWins.map((t) => rowsOf(t).find((r) => r.id === t.want))
    .filter((r): r is Row => !!r && r.peer >= 0);
  const pushDown = scoreWins.flatMap((t) => {
    const o = shipped(t);
    return o.slice(0, 5).filter((r) => r.id !== t.want && r.peer >= 0);
  });
  const rowFeats: Record<string, (r: Row) => number> = {
    "cell depth (lower = better)": (r) => -r.peer,
    "score rank (lower = better)": (r) => -r.srank,
    "cells it appears in": (r) => r.cells,
    "best rank anywhere": (r) => -r.best,
    "country-marginal rank": (r) => (r.crank < 0 ? -1e6 : -r.crank),
    "score/prior disagreement": (r) => -Math.abs(r.srank - r.peer),
    "raw relevance": (r) => r.rel,
  };
  const rauc = (f: (r: Row) => number) => {
    let w = 0;
    for (const a of keepUp) for (const b of pushDown) w += f(a) > f(b) ? 1 : f(a) === f(b) ? 0.5 : 0;
    return w / Math.max(1, keepUp.length * pushDown.length);
  };
  console.log(`\nWHY: the rows a per-row rule must KEEP UP (${keepUp.length}, the prior's ` +
    `exclusive winners) against the rows it must PUSH DOWN (${pushDown.length}, the blockers ` +
    `in the score's exclusive wins).`);
  console.log(`  AUC for "keep this row up". 0.50 = the feature cannot tell them apart.`);
  for (const [n, f] of Object.entries(rowFeats).sort((a, b) =>
    Math.abs(rauc(b[1]) - 0.5) - Math.abs(rauc(a[1]) - 0.5))) {
    console.log(`    ${n.padEnd(32)} ${rauc(f).toFixed(3)}`);
  }

  // ── 6. THE CONTRADICTION, stated as a count ─────────────────────────────
  //
  // An AUC near 0.5 says a feature is uninformative on average. The stronger
  // claim, and the one that closes the idea rather than merely failing to open
  // it, is that the required orderings COLLIDE: the same ordered pair of
  // feature vectors is demanded in one direction by a founder the score wins
  // and in the other direction by a founder the prior wins. A per-row rule is a
  // function of the vector, so it must answer both the same way, and every
  // collision is a founder it is guaranteed to lose.
  //
  // Counted over the pairs each discordant founder actually needs: the won row
  // against each row standing in the visible five ahead of it.
  const needs = (t: Tape): [string, string][] => {
    const o = shipped(t);
    const i = o.findIndex((r) => r.id === t.want);
    const win = o[i];
    if (!win) return [];
    const ahead = o.slice(0, 5).filter((r) => r.id !== t.want);
    return ahead.map((r) => [bucket(win), bucket(r)] as [string, string]);
  };
  const wantScore = new Map<string, number>();   // pairs the score's wins demand
  const wantPeer = new Map<string, number>();    // pairs the prior's wins demand
  for (const t of scoreWins) for (const [a, b] of needs(t)) {
    wantScore.set(`${a}>${b}`, (wantScore.get(`${a}>${b}`) ?? 0) + 1);
  }
  for (const t of peerWins) for (const [a, b] of needs(t)) {
    wantPeer.set(`${a}>${b}`, (wantPeer.get(`${a}>${b}`) ?? 0) + 1);
  }
  let collide = 0, total = 0;
  const collidingFounders = new Set<string>();
  for (const t of scoreWins) {
    for (const [a, b] of needs(t)) {
      total++;
      if (wantPeer.has(`${b}>${a}`)) { collide++; collidingFounders.add(t.want + t.country); }
    }
  }
  console.log(`\nTHE COLLISION  ${collide}/${total} of the ordered feature-vector pairs the ` +
    `score's exclusive wins demand are demanded in the OPPOSITE direction by one of the ` +
    `prior's. ${collidingFounders.size}/${scoreWins.length} of those founders are ` +
    `unwinnable by any function of these row features while the prior's wins are kept.`);
}

main();
