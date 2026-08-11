// wsEC — the composition of the eighteen, and the counterfactual orders, as
// offline arithmetic over `_wsec_pool.ts`'s tape. No corpus, no embed, no model.
//
// `applyPeerPrecedence` is a PURE REORDER of the accessible pool: it adds
// nothing and removes nothing. So every candidate ordering of that pool is a
// function of one replay, and the whole space can be swept for free from the
// tape. That is the same argument `_wscw_dump.ts` makes for the seat count; the
// difference is the DEPTH the question is asked at. wsCW swept seats against
// the published five. Nobody has swept the ordering against the eighteen the
// selector is shown, which is where the 33-point gap lives.
//
//   npx tsx scripts/_wsec_compose.ts [tape.json]
import { readFileSync } from "fs";

import { SECTOR_WORD } from "../lib/intelligence/shortlist";
import { VERDICT_POOL } from "../lib/intelligence/caps";
import { BRIEF_LIMITS } from "../lib/intelligence/briefChecks";
import type { FounderTape, PoolRow } from "./_wsec_pool";

const FILE = process.argv[2] ?? "/tmp/wsec_pool.json";
const SHOWN = VERDICT_POOL;
const PUBLISHED = BRIEF_LIMITS.institutionsMax;

/** The bottom of what the founder said they need, in euro — wsDY's reading of
 *  the prompt's own money disqualifier, kept identical so the two counts are
 *  comparable. Generous: an order of magnitude below the FLOOR of the band. */
const BAND_FLOOR: Record<string, number> = {
  b100k_500k: 100_000, b500k_2m5: 500_000, b2m5_15m: 2_500_000,
  b15m_50m: 15_000_000, gt50m: 50_000_000,
};

const pct = (a: number, b: number) => `${((100 * a) / (b || 1)).toFixed(1)}%`;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

/** Rank of `want` in an ordering, 1-based; 0 when absent. */
const rankOf = (order: PoolRow[], want: string) =>
  order.findIndex((r) => r.id === want) + 1;

// ── The orderings, every one a permutation of the SAME accessible pool ─────
// Each takes the pool in shipped order and returns a permutation. None may
// add or drop a row: `assertPermutation` below fails the run if one does, so a
// counterfactual cannot buy recall by quietly widening the pool.

/** What ships: one (or three) score seats, then peer-known rows in peer order,
 *  then the rest. Already on the tape, so this is the identity. */
const shipped = (rows: PoolRow[]) => rows;

/** The pool before peer precedence touched it. */
const scoreOnly = (rows: PoolRow[]) =>
  [...rows].sort((a, b) => a.scoreRank - b.scoreRank);

/** Peer precedence with no score head at all. */
const peerOnly = (rows: PoolRow[]) => {
  const k = (r: PoolRow) => (r.peerRank < 0 ? 1e6 : r.peerRank);
  return [...rows].sort((a, b) => k(a) - k(b) || a.scoreRank - b.scoreRank);
};

/** Round-robin between the two orders, first occurrence wins.
 *
 *  This is the ordering the two measured facts point at. The score and the
 *  peer prior are near-orthogonal — 24% and 27% alone, 45% in union — and the
 *  shipped order spends the pool by putting one of them ENTIRELY in front of
 *  the other. At depth five that is a real trade with a swept answer. At depth
 *  eighteen it is not a trade at all: both lists fit, and the only question is
 *  whether the eighteen seats are spent on two predictors or one. */
const interleave = (rows: PoolRow[]) => {
  const a = scoreOnly(rows);
  const b = peerOnly(rows).filter((r) => r.peerRank >= 0);
  const out: PoolRow[] = [];
  const seen = new Set<string>();
  let i = 0, j = 0;
  const push = (r?: PoolRow) => {
    if (r && !seen.has(r.id)) { seen.add(r.id); out.push(r); }
  };
  while (i < a.length || j < b.length) {
    while (i < a.length && seen.has(a[i].id)) i++;
    if (i < a.length) push(a[i++]);
    while (j < b.length && seen.has(b[j].id)) j++;
    if (j < b.length) push(b[j++]);
  }
  return out;
};

/** One row per family, the rest pushed behind — a REORDER, never a filter, so
 *  the pool is the same set and nothing can be lost. The question it answers:
 *  are the seats the near-duplicates hold worth anything? */
const familyFirst = (rows: PoolRow[]) => {
  const key = (r: PoolRow) => r.family || r.scheme || r.id;
  const seenKey = new Set<string>();
  const head: PoolRow[] = [], tail: PoolRow[] = [];
  for (const r of rows) (seenKey.has(key(r)) ? tail : head).push(r), seenKey.add(key(r));
  return [...head, ...tail];
};

/** The SHIPPED rule, with its one constant made a parameter.
 *
 *  `applyPeerPrecedence` is exactly `split(1)` on the flat branch and
 *  `split(3)` on the specific one: s seats to the score, then EVERY row the
 *  peer prior has ever seen, then the remainder in score order. Sweeping s
 *  from 0 to the depth of the list therefore contains the shipped behaviour as
 *  two of its points and says what the constant is worth at each depth. */
const split = (s: number) => (rows: PoolRow[]) => {
  const byScore = scoreOnly(rows);
  const head = byScore.slice(0, s);
  const seen = new Set(head.map((r) => r.id));
  const rest = byScore.filter((r) => !seen.has(r.id));
  const known = rest.filter((r) => r.peerRank >= 0)
    .sort((a, b) => a.peerRank - b.peerRank);
  return [...head, ...known, ...rest.filter((r) => r.peerRank < 0)];
};

/** Does this row survive the two disqualifiers the SELECTOR PROMPT ITSELF
 *  states — an award median an order of magnitude off what the founder asked
 *  for, and a `mostly X` descriptor naming another sector? wsDY's reading,
 *  reused verbatim so the two counts are the same count. Generous in both
 *  directions: no descriptor is on-theme, no median is the right size. */
const survives = (t: FounderTape) => {
  const theme = SECTOR_WORD[t.sector] ?? "";
  const floor = (BAND_FLOOR[t.ticketBand] ?? 0) / 10;
  return (r: PoolRow) => (!r.mostly || (theme !== "" && r.mostly === theme))
    && (r.median == null || r.median >= floor);
};

/** The prompt's own disqualifiers, applied where they can still do something.
 *
 *  Today they are stated to the model AFTER the cut, so a row the brief itself
 *  rules out has already taken a seat from a row it does not — and the model
 *  is then asked to name six out of a list where a mean of 2.1 survive. This
 *  makes them an ORDER instead: a disqualified row goes behind every row that
 *  is not, and nothing is dropped, so the pool is the same set. */
const qualifiedFirst = (t: FounderTape) => (rows: PoolRow[]) => {
  const ok = survives(t);
  return [...rows.filter(ok), ...rows.filter((r) => !ok(r))];
};

const ORDERS: [string, (rows: PoolRow[], t: FounderTape) => PoolRow[]][] = [
  ["shipped", shipped],
  ["score only", scoreOnly],
  ["peer only", peerOnly],
  ["interleave", interleave],
  ["family-first", familyFirst],
  ["interleave + family-first", (rows) => familyFirst(interleave(rows))],
  ["qualified-first", (rows, t) => qualifiedFirst(t)(rows)],
  ["qualified-first on score", (rows, t) => qualifiedFirst(t)(scoreOnly(rows))],
  ["qualified + interleave", (rows, t) => qualifiedFirst(t)(interleave(rows))],
];

function assertPermutation(name: string, before: PoolRow[], after: PoolRow[]) {
  if (before.length !== after.length) {
    throw new Error(`${name} changed the pool size ${before.length} -> ${after.length}`);
  }
  const a = new Set(before.map((r) => r.id));
  for (const r of after) {
    if (!a.delete(r.id)) throw new Error(`${name} emitted ${r.id} twice or from nowhere`);
  }
  if (a.size) throw new Error(`${name} dropped ${a.size} row(s)`);
}

function main() {
  const doc = JSON.parse(readFileSync(FILE, "utf8")) as { corpus: string; tapes: FounderTape[] };
  const tapes = doc.tapes;
  console.log(`${tapes.length} held-out founders, corpus ${doc.corpus}`);
  console.log(`the list the selector is shown is ${SHOWN} rows; the table it publishes is ${PUBLISHED}\n`);

  // ── 1. WHAT IS IN THE EIGHTEEN ──────────────────────────────────────────
  const peerSeats: number[] = [], chans: number[] = [], fams: number[] = [];
  const biggestFam: number[] = [], survivors: number[] = [];
  const themes: number[] = [], biggestBody: number[] = [];
  const survHist = new Array(19).fill(0);
  const branch: Record<string, number> = {};
  let shortPools = 0;
  for (const t of tapes) {
    branch[t.branch] = (branch[t.branch] ?? 0) + 1;
    const top = t.rows.slice(0, SHOWN);
    if (t.rows.length < SHOWN) shortPools++;
    peerSeats.push(top.filter((r) => r.peerRank >= 0).length);
    chans.push(new Set(top.map((r) => r.channel)).size);
    const famKey = (r: PoolRow) => r.family || r.scheme || r.id;
    const groups = new Map<string, number>();
    for (const r of top) groups.set(famKey(r), (groups.get(famKey(r)) ?? 0) + 1);
    fams.push(groups.size);
    biggestFam.push(Math.max(0, ...groups.values()));
    // A block of siblings is not automatically a duplicate — the standing
    // finding is that one agency's fifty calls are fifty distinct doors. What
    // it IS is a bound on how much of the eighteen can be about different
    // things. Reported beside the block so the two are never confused.
    themes.push(new Set(top.map((r) => r.mostly).filter(Boolean)).size);
    const bodies = new Map<string, number>();
    for (const r of top) {
      if (!r.body) continue;
      bodies.set(r.body, (bodies.get(r.body) ?? 0) + 1);
    }
    biggestBody.push(Math.max(0, ...bodies.values()));
    // wsDY's two disqualifiers, applied to the same rows at scale. Generous in
    // both directions: no descriptor counts as on-theme, no median counts as
    // the right size, so every number here is an UPPER bound on what survives.
    const theme = SECTOR_WORD[t.sector] ?? "";
    const floor = (BAND_FLOOR[t.ticketBand] ?? 0) / 10;
    const alive = top.filter(survives(t)).length;
    survivors.push(alive);
    survHist[Math.min(18, alive)]++;
  }
  console.log("── the eighteen, per founder ──────────────────────────────────");
  console.log(`peer-prior seats of ${SHOWN}          mean ${mean(peerSeats).toFixed(1)}`);
  console.log(`distinct channels                 mean ${mean(chans).toFixed(1)}`);
  console.log(`distinct families/schemes         mean ${mean(fams).toFixed(1)}`);
  console.log(`largest single-family block       mean ${mean(biggestFam).toFixed(1)}`);
  console.log(`largest single-BODY block         mean ${mean(biggestBody).toFixed(1)}`);
  console.log(`distinct `+"`mostly X`"+` themes           mean ${mean(themes).toFixed(1)}`);
  console.log(`branch  ${Object.entries(branch).map(([k, v]) => `${k} ${v}`).join("   ")}`);
  console.log(`pools shorter than ${SHOWN} rows:      ${shortPools} (${pct(shortPools, tapes.length)})`);
  console.log(`\nrows of ${SHOWN} surviving the prompt's OWN two disqualifiers`
    + ` (mean ${mean(survivors).toFixed(1)}, upper bound)`);
  for (let k = 0; k <= 18; k++) {
    if (!survHist[k]) continue;
    const bar = "#".repeat(Math.round((60 * survHist[k]) / tapes.length));
    console.log(`  ${String(k).padStart(2)} survivors  ${String(survHist[k]).padStart(4)}`
      + `  ${pct(survHist[k], tapes.length).padStart(6)}  ${bar}`);
  }
  const under = survivors.filter((s) => s < PUBLISHED).length;
  console.log(`founders with FEWER survivors than the ${PUBLISHED} rows we publish:`
    + ` ${under}/${tapes.length} (${pct(under, tapes.length)})`);
  // The same count with the sector clause not rendered — i.e. only the money
  // disqualifier the prompt states verbatim survives. The gap between the two
  // is what the `mostly X` clause is worth in seats the model believes it must
  // fill with a row it has disqualified.
  const moneyOnly = tapes.map((t) => {
    const floor = (BAND_FLOOR[t.ticketBand] ?? 0) / 10;
    return t.rows.slice(0, SHOWN).filter((r) => r.median == null || r.median >= floor).length;
  });
  const underMoney = moneyOnly.filter((s) => s < PUBLISHED).length;
  console.log(`\nsame count with the `+"`mostly X`"+` clause NOT rendered — the money`);
  console.log(`disqualifier alone, which is the only one the prompt states verbatim:`);
  console.log(`  mean surviving ${mean(moneyOnly).toFixed(1)} of ${SHOWN}`
    + `   founders under ${PUBLISHED}: ${underMoney}/${tapes.length} (${pct(underMoney, tapes.length)})`);

  // Which channels hold the seats, against which channels the answers are in.
  // A channel over-represented in the eighteen relative to how often it is the
  // answer is spending seats it does not earn.
  const seatByChan = new Map<string, number>(), wantByChan = new Map<string, number>();
  let seatTotal = 0, wantTotal = 0;
  for (const t of tapes) {
    for (const r of t.rows.slice(0, SHOWN)) {
      seatByChan.set(r.channel, (seatByChan.get(r.channel) ?? 0) + 1); seatTotal++;
    }
    const w = t.rows.find((r) => r.id === t.want);
    if (w) { wantByChan.set(w.channel, (wantByChan.get(w.channel) ?? 0) + 1); wantTotal++; }
  }
  console.log(`\nseats of the ${SHOWN} by channel, against how often that channel IS the answer`);
  const chanRows = [...new Set([...seatByChan.keys(), ...wantByChan.keys()])]
    .sort((a, b) => (seatByChan.get(b) ?? 0) - (seatByChan.get(a) ?? 0));
  for (const c of chanRows.slice(0, 10)) {
    console.log(`  ${c.padEnd(26)} seats ${pct(seatByChan.get(c) ?? 0, seatTotal).padStart(6)}`
      + `   is the answer ${pct(wantByChan.get(c) ?? 0, wantTotal).padStart(6)}`);
  }

  // ── 1b. HOW MUCH OF THE EIGHTEEN IS ABOUT THIS FOUNDER AT ALL ───────────
  // The peer prior is keyed on (country, sector) and nothing else, so every
  // founder in one cell is offered the SAME peer list. Two founders in a cell
  // can therefore differ only in their score seats and in whatever the prior
  // did not reach. Measured as the mean pairwise Jaccard of the shown
  // eighteen, within cells that hold at least two founders — and against the
  // score order, which reads the founder's own description, as the control.
  const cells = new Map<string, FounderTape[]>();
  for (const t of tapes) {
    const k = `${t.country}|${t.sector}`;
    (cells.get(k) ?? cells.set(k, []).get(k)!).push(t);
  }
  const jac = (a: FounderTape[], pick: (t: FounderTape) => PoolRow[]) => {
    const out: number[] = [];
    for (let x = 0; x < a.length; x++) {
      for (let y = x + 1; y < a.length; y++) {
        const s1 = new Set(pick(a[x]).slice(0, SHOWN).map((r) => r.id));
        const s2 = new Set(pick(a[y]).slice(0, SHOWN).map((r) => r.id));
        let inter = 0;
        for (const id of s1) if (s2.has(id)) inter++;
        out.push(inter / (s1.size + s2.size - inter || 1));
      }
    }
    return out;
  };
  const multi = [...cells.values()].filter((v) => v.length > 1);
  const shipJ = multi.flatMap((v) => jac(v, (t) => t.rows));
  const scoreJ = multi.flatMap((v) => jac(v, (t) => scoreOnly(t.rows)));
  console.log(`\n── how much of the ${SHOWN} is about THIS founder ─────────────────`);
  console.log(`(country, sector) cells with 2+ founders: ${multi.length}`
    + `, ${shipJ.length} pairs`);
  console.log(`mean overlap of two founders' ${SHOWN}, shipped order:  `
    + `${(100 * mean(shipJ)).toFixed(1)}%`);
  console.log(`mean overlap of two founders' ${SHOWN}, score order:    `
    + `${(100 * mean(scoreJ)).toFixed(1)}%`);

  // ── 2. THE WON FUND'S RANK WHEN IT IS PRESENT BUT BELOW THE CUT ─────────
  const below = tapes
    .map((t) => rankOf(t.rows, t.want))
    .filter((r) => r > SHOWN);
  const inPool = tapes.filter((t) => rankOf(t.rows, t.want) > 0).length;
  console.log(`\n── the won fund, shipped order ────────────────────────────────`);
  console.log(`in the pool at all       ${inPool}/${tapes.length}  ${pct(inPool, tapes.length)}`);
  console.log(`in the shown ${SHOWN}          ${inPool - below.length}/${tapes.length}`
    + `  ${pct(inPool - below.length, tapes.length)}`);
  console.log(`present but below the cut ${below.length}, at ranks:`);
  for (const [lo, hi] of [[19, 25], [26, 40], [41, 60], [61, 100], [101, 1e6]] as [number, number][]) {
    const c = below.filter((r) => r >= lo && r <= hi).length;
    const bar = "#".repeat(Math.round((60 * c) / (below.length || 1)));
    console.log(`  ${String(lo).padStart(3)}-${hi > 1e5 ? "  +" : String(hi).padStart(3)}`
      + `  ${String(c).padStart(4)}  ${pct(c, below.length).padStart(6)}  ${bar}`);
  }

  // ── 2b. AND IS THE WON FUND ITSELF ONE OF THE DISQUALIFIED? ─────────────
  // The number that decides whether "2.1 rows survive" is a defect in the pool
  // or a defect in the disqualifiers. If the fund a company actually won is
  // routinely ruled out by our own two tests, then those tests are wrong and
  // no reordering built on them can help.
  // Founders whose own sector HAS a short form only, so a sector the
  // descriptor vocabulary cannot name ("other") is not counted as a mismatch.
  let wonAlive = 0, wonSeen = 0, wonOffTheme = 0, wonTooSmall = 0;
  let rowAlive = 0, rowSeen = 0, rowOffTheme = 0, rowTooSmall = 0;
  for (const t of tapes) {
    const theme = SECTOR_WORD[t.sector] ?? "";
    if (!theme) continue;
    const w = t.rows.find((r) => r.id === t.want);
    if (!w) continue;
    wonSeen++;
    const floor = (BAND_FLOOR[t.ticketBand] ?? 0) / 10;
    if (w.mostly && w.mostly !== theme) wonOffTheme++;
    if (w.median != null && w.median < floor) wonTooSmall++;
    if (survives(t)(w)) wonAlive++;
    // The same test over every OTHER row of the pool, so the won fund's
    // survival rate has a base rate to be read against. A disqualifier that
    // kills the right answer as readily as a wrong one carries no information.
    for (const r of t.rows) {
      if (r.id === t.want) continue;
      rowSeen++;
      if (survives(t)(r)) rowAlive++;
      if (r.mostly && r.mostly !== theme) rowOffTheme++;
      if (r.median != null && r.median < floor) rowTooSmall++;
    }
  }
  console.log(`\n── the won fund against the two disqualifiers ─────────────────`);
  console.log(`(founders whose sector the descriptor vocabulary can name: ${wonSeen} in-pool)`);
  console.log(`                                    the WON fund    every other row`);
  console.log(`survives both                          ${pct(wonAlive, wonSeen).padStart(6)}`
    + `           ${pct(rowAlive, rowSeen).padStart(6)}`);
  console.log(`descriptor names another sector        ${pct(wonOffTheme, wonSeen).padStart(6)}`
    + `           ${pct(rowOffTheme, rowSeen).padStart(6)}`);
  console.log(`median an order of magnitude low       ${pct(wonTooSmall, wonSeen).padStart(6)}`
    + `           ${pct(rowTooSmall, rowSeen).padStart(6)}`);
  console.log(`\nOnly the money test is stated in the prompt verbatim. The sector test is`);
  console.log(`wsDY's reading of "prefer the one whose title is specific to what this`);
  console.log(`company does", and it is what the model applied in its own words. A test`);
  console.log(`that removes the right answer at least as readily as a wrong one is not a`);
  console.log(`filter, and a pool measured by it is not being measured.`);

  // ── 3. THE ORDERINGS ────────────────────────────────────────────────────
  console.log(`\n── recall of the won fund, by ordering of the SAME pool ───────`);
  console.log(`order                       @${PUBLISHED}      @${SHOWN}     @40    whole pool`);
  for (const [name, fn] of ORDERS) {
    const ranks = tapes.map((t) => {
      const out = fn(t.rows, t);
      assertPermutation(name, t.rows, out);
      return rankOf(out, t.want);
    });
    const at = (k: number) => ranks.filter((r) => r > 0 && r <= k).length;
    console.log(`${name.padEnd(26)} ${pct(at(PUBLISHED), tapes.length).padStart(6)}`
      + ` ${pct(at(SHOWN), tapes.length).padStart(7)}`
      + ` ${pct(at(40), tapes.length).padStart(7)}`
      + ` ${pct(at(1e6), tapes.length).padStart(7)}`);
  }

  // ── 3b. THE ONE CONSTANT, SWEPT ─────────────────────────────────────────
  // How many leading seats the SCORE keeps before the peer prior fills. The
  // shipped code is s=1 (flat) and s=3 (specific), and wsCW swept exactly this
  // constant against the PUBLISHED five. This is the same sweep read at the
  // depth of the list the selector is shown, which is a different question
  // with a different answer.
  console.log(`\n── score seats before the peer prior fills, swept ─────────────`);
  console.log(`  s      @${PUBLISHED}      @${SHOWN}      @40`);
  for (const s of [0, 1, 2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 25, 40, 1e6]) {
    const fn = split(s);
    const ranks = tapes.map((t) => {
      const out = fn(t.rows);
      assertPermutation(`split(${s})`, t.rows, out);
      return rankOf(out, t.want);
    });
    const at = (k: number) => ranks.filter((r) => r > 0 && r <= k).length;
    const tag = s === 1 ? "  <- shipped, flat branch"
      : s === 3 ? "  <- shipped, specific branch"
      : s >= 1e6 ? "  <- the peer prior switched off" : "";
    console.log(`  ${String(s >= 1e6 ? "inf" : s).padStart(3)}  ${pct(at(PUBLISHED), tapes.length).padStart(6)}`
      + `  ${pct(at(SHOWN), tapes.length).padStart(6)}  ${pct(at(40), tapes.length).padStart(6)}${tag}`);
  }

  // ── 4. WHAT TOOK THE SEAT ───────────────────────────────────────────────
  // Only the founders where the two orderings DISAGREE about the won fund at
  // the cut. The displacers are the rows the shipped eighteen holds that the
  // score's eighteen does not.
  const took = new Map<string, { n: number; channel: string; peerHits: number }>();
  let displaced = 0, rescued = 0;
  const displacedFams: number[] = [];
  for (const t of tapes) {
    const s = scoreOnly(t.rows);
    const shipRank = rankOf(t.rows, t.want), scoreRank = rankOf(s, t.want);
    const inShip = shipRank > 0 && shipRank <= SHOWN;
    const inScore = scoreRank > 0 && scoreRank <= SHOWN;
    if (inScore && !inShip) {
      displaced++;
      const had = new Set(s.slice(0, SHOWN).map((r) => r.id));
      const gained = t.rows.slice(0, SHOWN).filter((r) => !had.has(r.id));
      displacedFams.push(new Set(gained.map((r) => r.family || r.scheme || r.id)).size);
      for (const r of gained) {
        const cur = took.get(r.name) ?? { n: 0, channel: r.channel, peerHits: 0 };
        cur.n++;
        if (r.peerRank >= 0) cur.peerHits++;
        took.set(r.name, cur);
      }
    }
    if (inShip && !inScore) rescued++;
  }
  console.log(`\n── the peer prior at the cut, ${tapes.length} founders ──────────────────`);
  console.log(`won fund in the score's ${SHOWN} and NOT in the shipped ${SHOWN}: ${displaced}`);
  console.log(`won fund in the shipped ${SHOWN} and NOT in the score's ${SHOWN}: ${rescued}`);
  console.log(`net ${rescued - displaced >= 0 ? "+" : ""}${rescued - displaced} founders`);
  if (displaced) {
    console.log(`\non the ${displaced} it displaced, the seats went to `
      + `${mean(displacedFams).toFixed(1)} distinct families on average. Top rows:`);
    const top = [...took.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 20);
    for (const [name, v] of top) {
      console.log(`  ${String(v.n).padStart(4)}x  ${name.slice(0, 44).padEnd(46)}`
        + `${v.channel.padEnd(24)}${v.peerHits === v.n ? "peer-placed" : `${v.peerHits}/${v.n} peer-placed`}`);
    }
  }
}

main();
