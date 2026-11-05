// wsCK part 4 — every candidate question bounded by a free oracle, in one table.
//
// The rule this project has paid for six times: bound a question with a perfect
// answer BEFORE building it, and if a perfect answer buys less than a point,
// kill it. This applies that rule to every fact `_wsck_residual.ts` found inside
// the residual classes, so no candidate is carried forward on an argument.
//
// ── What an oracle means here ──────────────────────────────────────────────
// A question Q partitions the corpus. A PERFECT answer is the value Q takes on
// the fund the founder actually won — the most generous a real answer can be.
// Two arms, because only one of them is shippable:
//
//   FILTER     keep only matching candidates. Removes rows, so a wrong answer
//              HIDES a fund from someone who qualifies. Reported for the bound.
//   PARTITION  matching candidates first, the rest after, order preserved.
//              Cannot remove anything, so it cannot hide anything.
//
// The published five are literally `pool[0..4]`, asserted below, so both arms
// are computed exactly from a dump with no replay.
//
// ── Why the ceiling column matters more than the delta ────────────────────
// A perfect answer to Q cannot beat "the won leaf is in the pool at all". That
// bar is printed with the table so a +36 is read against 91.6 and not against
// 100, and so the answer to "does any question set reach 95%" is arithmetic
// rather than opinion.
//
// FREE: one Postgres read plus the cached topic space. No model calls.
//
//   npx tsx scripts/_wsck_oracle.ts
import { existsSync, readFileSync } from "fs";

import { Client } from "pg";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("wsck_oracle", ["DATABASE_URL"]);

interface Pair {
  want: string; wantRegime: string; hit: boolean; classSize: number;
  pool?: [string, string, string][];
}
interface Row {
  id: string; name: string | null; capital_type: string | null; award_p50: number | null;
  award_n: number | null; parent_id: string | null;
  intensity_p50: number | null; scheme_end_date: string | null; source_window_policy: string | null;
  administering_body: string | null; first_year: number | null; last_year: number | null;
  sector_mix: string | null; is_framework: boolean | null;
}

const h = (s: unknown) => (s ? String(s).trim().toLowerCase().slice(0, 400) : "");
const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
function norm(v: number[]) {
  const n = Math.sqrt(v.reduce((a, b) => a + b * b, 0));
  return n > 0 ? v.map((x) => x / n) : v;
}
function kmeans(X: number[][], K: number, seed = 20260809): number[] {
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const n = X.length;
  if (K >= n) throw new Error(`kmeans: K=${K} >= n=${n}, which is not a vocabulary`);
  const cent: number[][] = [X[Math.floor(rnd() * n)]];
  while (cent.length < K) {
    const d2 = X.map((x) => Math.max(0, 1 - Math.max(...cent.map((c) => dot(x, c)))) ** 2);
    const tot = d2.reduce((a, b) => a + b, 0);
    let r = rnd() * tot, pick = n - 1;
    for (let i = 0; i < n; i++) { r -= d2[i]; if (r <= 0) { pick = i; break; } }
    cent.push(X[pick]);
  }
  const lab = new Array(n).fill(0);
  for (let it = 0; it < 40; it++) {
    let moved = 0;
    for (let i = 0; i < n; i++) {
      let b = 0, bs = -2;
      for (let k = 0; k < K; k++) { const v = dot(X[i], cent[k]); if (v > bs) { bs = v; b = k; } }
      if (lab[i] !== b) moved++;
      lab[i] = b;
    }
    const sum = Array.from({ length: K }, () => new Array(X[0].length).fill(0));
    const cnt = new Array(K).fill(0);
    for (let i = 0; i < n; i++) { cnt[lab[i]]++; for (let d = 0; d < X[i].length; d++) sum[lab[i]][d] += X[i][d]; }
    for (let k = 0; k < K; k++) if (cnt[k]) cent[k] = norm(sum[k]);
    if (!moved) break;
  }
  if (new Set(lab).size < Math.min(K, 2)) throw new Error(`kmeans collapsed at K=${K}`);
  return lab;
}

async function main() {
  const dumps = (process.env.DUMPS ?? "/tmp/wsck/tune.json:tune,/tmp/wsck/holdout.json:holdout")
    .split(",").map((s) => { const [f, n] = s.split(":"); return { file: f, name: n ?? f }; });

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const { rows } = await db.query<Row>(`
    SELECT id, name, capital_type, award_p50, award_n, parent_id, intensity_p50,
           scheme_end_date, source_window_policy, administering_body, first_year,
           last_year, sector_mix, is_framework
      FROM funding_instruments ORDER BY id`);
  await db.end();
  const byId = new Map(rows.map((r) => [r.id, r]));

  const cacheFile = process.env.EMB ?? "/tmp/wsck/emb.json";
  if (!existsSync(cacheFile)) throw new Error(`missing ${cacheFile} — run _wsck_topic.ts first`);
  const vecs = JSON.parse(readFileSync(cacheFile, "utf8")) as Record<string, number[]>;
  const ids = rows.map((r) => r.id);
  if (ids.some((i) => !vecs[i])) throw new Error("topic space does not cover the corpus");
  const X = ids.map((i) => vecs[i]);
  const topicAt = new Map<number, Map<string, number>>();
  for (const K of [8, 16, 24, 64]) {
    const lab = kmeans(X, K);
    topicAt.set(K, new Map(ids.map((id, j) => [id, lab[j]])));
  }

  /** Every candidate question, as the value the fund takes on it. `tier` is
   *  where it would have to be asked and `why` is the reason, both stated here
   *  so the design and its bound cannot drift apart. */
  const QUESTIONS: { q: string; tier: 1 | 2 | 0; of: (r: Row | undefined) => string }[] = [
    { q: "TOPIC 8 options", tier: 1, of: (r) => (r ? String(topicAt.get(8)!.get(r.id)) : "") },
    { q: "TOPIC 16 options", tier: 1, of: (r) => (r ? String(topicAt.get(16)!.get(r.id)) : "") },
    { q: "TOPIC 24 options", tier: 1, of: (r) => (r ? String(topicAt.get(24)!.get(r.id)) : "") },
    { q: "TOPIC 16x4 nested", tier: 1, of: (r) => (r ? `${topicAt.get(16)!.get(r.id)}/${topicAt.get(64)!.get(r.id)}` : "") },
    { q: "WINDOW closing date", tier: 2, of: (r) => h(r?.scheme_end_date).slice(0, 10) },
    { q: "WINDOW quarter needed", tier: 1, of: (r) => h(r?.scheme_end_date).slice(0, 7) },
    { q: "WINDOW source policy", tier: 2, of: (r) => h(r?.source_window_policy) },
    { q: "MONEY capital type", tier: 1, of: (r) => h(r?.capital_type) },
    { q: "MONEY award magnitude", tier: 1, of: (r) => (r?.award_p50 ? String(Math.round(Math.log10(Number(r.award_p50) || 1))) : "") },
    { q: "MONEY co-financing band", tier: 2, of: (r) => (r?.intensity_p50 == null ? "" : String(Math.round(Number(r.intensity_p50) * 10))) },
    { q: "SHAPE framework flag", tier: 0, of: (r) => String(r?.is_framework ?? "") },
    { q: "BODY administering body", tier: 0, of: (r) => h(r?.administering_body) },
    // ── CONTROLS. Not questions — nobody can answer either — but the two
    //    numbers that say whether the rows above mean what they appear to.
    //
    //    "perfect programme" is the control for TOPIC. If a derived topic
    //    cluster is really just the parent regime wearing a new name, then
    //    TOPIC is the un-askable question "which programme is yours" and its
    //    bound is not a design result. Topic must land WELL BELOW this line to
    //    be a distinct signal, and the gap between them is what a topic
    //    question can never reach.
    { q: "CONTROL perfect programme", tier: 0, of: (r) => String(r?.parent_id ?? r?.id ?? "") },
    //    "perfect leaf" is the arithmetic identity: it must equal the pool
    //    ceiling exactly. If it does not, the simulation is wrong and every
    //    other row on this table is wrong with it.
    { q: "CONTROL perfect leaf", tier: 0, of: (r) => String(r?.id ?? "") },
  ];

  for (const d of dumps) {
    if (!existsSync(d.file)) throw new Error(`missing dump ${d.file}`);
    const pairs = (JSON.parse(readFileSync(d.file, "utf8")) as Pair[]).filter((p) => p.pool);
    if (!pairs.length) throw new Error(`${d.file} holds no pool — re-run the autopsy with OUT=`);
    const bad = pairs.filter((p) => p.pool!.slice(0, 5).some(([id]) => id === p.want) !== p.hit);
    if (bad.length) throw new Error(`${d.name}: pool[0..4] is not the published five on ${bad.length} pairs`);
    const base = pairs.filter((p) => p.hit).length;
    const inPool = pairs.filter((p) => p.pool!.some(([id]) => id === p.want)).length;

    console.log(`\n${"=".repeat(96)}`);
    console.log(`${d.name}  N=${pairs.length}   base EXACT@5 ${(100 * base / pairs.length).toFixed(1)}%` +
      `   CEILING OF ANY QUESTION WHATEVER ${(100 * inPool / pairs.length).toFixed(1)}%` +
      `  <- the won leaf is not in the pool for the rest`);
    console.log("=".repeat(96));
    console.log(`  question                  tier   present   PARTITION (shippable)   FILTER (blocks)   gain concentration`);
    const scored = new Map<string, number>();
    for (const Q of QUESTIONS) {
      let par = 0, fil = 0, present = 0;
      const gained = new Map<string, number>();
      for (const p of pairs) {
        const mine = Q.of(byId.get(p.want));
        if (mine) present++;
        const pool = p.pool!;
        const same = pool.filter(([id]) => Q.of(byId.get(id)) === mine);
        const rest = pool.filter(([id]) => Q.of(byId.get(id)) !== mine);
        const ph = [...same, ...rest].slice(0, 5).some(([id]) => id === p.want);
        if (ph) par++;
        if (same.slice(0, 5).some(([id]) => id === p.want)) fil++;
        if (ph && !p.hit) gained.set(p.wantRegime, (gained.get(p.wantRegime) ?? 0) + 1);
      }
      scored.set(Q.q, par);
      const g = [...gained].sort((a, b) => b[1] - a[1]);
      const gt = g.reduce((a, [, n]) => a + n, 0);
      console.log(`  ${Q.q.padEnd(26)}${String(Q.tier || "-").padStart(3)}` +
        `${`${(100 * present / pairs.length).toFixed(0)}%`.padStart(10)}` +
        `${`${(100 * par / pairs.length).toFixed(1)}%`.padStart(16)} (${sgn(100 * (par - base) / pairs.length)})` +
        `${`${(100 * fil / pairs.length).toFixed(1)}%`.padStart(14)} (${sgn(100 * (fil - base) / pairs.length)})` +
        `   ${gt ? `${g.length} regime(s), max ${(100 * g[0][1] / gt).toFixed(0)}%` : "-"}`);
    }

    // ── The identity that proves the simulation, not the argument for it ─────
    // A perfect answer to "which leaf is yours" puts the won leaf first whenever
    // it is in the pool, so its PARTITION score must equal the pool ceiling to
    // the pair. Any drift means the partition, the ceiling or the dump is wrong.
    if (scored.get("CONTROL perfect leaf") !== inPool) {
      throw new Error(`identity violated on ${d.name}: perfect-leaf partition ` +
        `${scored.get("CONTROL perfect leaf")} != pool ceiling ${inPool} — the simulation is wrong`);
    }
    console.log(`\n  identity holds: a perfect leaf answer scores exactly the pool ceiling (${inPool}/${pairs.length})`);

    // ── CIRCULARITY, priced rather than argued ───────────────────────────────
    // `award_p50` is the median of the awards the instrument MADE, and the
    // answer key's own award is one of them. On a leaf with few awards the
    // median IS the founder's award, so "how much are you asking for" would be
    // scored against a number the answer supplied. wsBY's 85.5% died of exactly
    // this. The bound is therefore re-read on the leaves where one award cannot
    // move the median, and BOTH numbers are printed.
    const thin = pairs.filter((p) => (byId.get(p.want)?.award_n ?? 0) < 20);
    const thick = pairs.filter((p) => (byId.get(p.want)?.award_n ?? 0) >= 20);
    const magnitude = (id: string) => {
      const r = byId.get(id);
      return r?.award_p50 ? String(Math.round(Math.log10(Number(r.award_p50) || 1))) : "";
    };
    const scoreOn = (sub: Pair[], key: (id: string) => string) => {
      let n = 0;
      for (const p of sub) {
        const mine = key(p.want);
        const same = p.pool!.filter(([id]) => key(id) === mine);
        const rest = p.pool!.filter(([id]) => key(id) !== mine);
        if ([...same, ...rest].slice(0, 5).some(([id]) => id === p.want)) n++;
      }
      return n;
    };
    console.log(`  award magnitude, split by how many awards set the median ` +
      `(the answer key's award is one of them):`);
    for (const [lbl, sub] of [["award_n < 20  CIRCULAR", thin], ["award_n >= 20 clean", thick]] as const) {
      if (!sub.length) { console.log(`    ${lbl.padEnd(24)} (empty)`); continue; }
      const b = sub.filter((p) => p.hit).length;
      console.log(`    ${lbl.padEnd(24)} n=${String(sub.length).padStart(4)}  base ` +
        `${(100 * b / sub.length).toFixed(1)}%  ->  ${(100 * scoreOn(sub, magnitude) / sub.length).toFixed(1)}%` +
        `  (${sgn(100 * (scoreOn(sub, magnitude) - b) / sub.length)})`);
    }

    // ── The SET, not the questions one at a time ─────────────────────────────
    // A question set is not the sum of its questions: two questions that cut the
    // same way buy the second one nothing. So the designed set is scored as a
    // compound key, and the marginal of each addition is printed, which is the
    // only honest way to answer "what does the SET reach".
    console.log(`\n  THE DESIGNED SET, added one at a time (PARTITION, perfect answers throughout)`);
    const SET = ["TOPIC 16 options", "MONEY award magnitude", "WINDOW quarter needed", "MONEY capital type"];
    let prev = base;
    for (let n = 1; n <= SET.length; n++) {
      const use = QUESTIONS.filter((q) => SET.slice(0, n).includes(q.q));
      const key = (id: string) => use.map((q) => q.of(byId.get(id))).join("|");
      let par = 0;
      for (const p of pairs) {
        const mine = key(p.want);
        const pool = p.pool!;
        const same = pool.filter(([id]) => key(id) === mine);
        const rest = pool.filter(([id]) => key(id) !== mine);
        if ([...same, ...rest].slice(0, 5).some(([id]) => id === p.want)) par++;
      }
      console.log(`    +${SET[n - 1].padEnd(24)} ${`${(100 * par / pairs.length).toFixed(1)}%`.padStart(7)}` +
        `   marginal ${sgn(100 * (par - prev) / pairs.length)}   cumulative ${sgn(100 * (par - base) / pairs.length)}`);
      prev = par;
    }
  }
}

const sgn = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(1)}`;

main();
