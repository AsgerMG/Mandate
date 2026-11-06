// wsCK — the topic question, bounded by a free oracle before anything is built.
//
// `_wsck_residual.ts` says the residual is a TOPIC residual: over the 598 leaves
// a founder cannot tell apart today, the call's own subject leaves a mean class
// of 1.4 and puts 98% inside five rows, while every other non-circular fact
// leaves 17 to 30. So the question to design is about WHAT THE PROJECT IS.
//
// ── Why a bounded vocabulary, and why the answer is a CURVE ────────────────
// "Ask the topic" is not one question, it is a family of them indexed by how
// many options the founder chooses between. At K = 1,088 the question is "which
// fund is yours", which is not a question, and any bound measured that way is
// the answer key reading itself. So the oracle is measured as EXACT@5 against
// K, and a K a founder cannot answer is reported as such rather than quoted.
//
// The vocabulary is DERIVED, never written: k-means over an embedding of each
// instrument's own source text. It therefore names no fund, no country and no
// sector, and an instrument loaded tomorrow is assigned a topic by the same
// distance rule with nothing edited.
//
// ── Why the source text and not instrument_profiles ───────────────────────
// The production index holds what a fund FUNDS, built from the project titles
// it awarded — and the answer key's own award is one of those titles. A
// vocabulary derived from it would be reading the answer. This embeds `name`
// plus `description`, which come from the source page, so the topic of a call
// is a fact about the call.
//
// ── The two arms, and only one of them is shippable ────────────────────────
//   FILTER     keep only same-topic candidates. Maximal, and it BLOCKS: a
//              founder whose stated topic misses loses the fund entirely.
//   PARTITION  same-topic candidates first, everything else after, order
//              preserved inside each part. Cannot block anything, ever.
// Both are reported. The bound that matters for a product is PARTITION.
//
// ── Cost ───────────────────────────────────────────────────────────────────
// ~1,100 short Voyage embeds plus one Postgres read, cached to EMB= across
// runs. Under a cent. No model calls. Nothing written to the database.
//
//   DUMP=/tmp/wsck/tune.json npx tsx scripts/_wsck_topic.ts
import { existsSync, readFileSync, writeFileSync } from "fs";

import { Client } from "pg";

import { loadEnvLocal, requireCredentials } from "../loadEnv";

loadEnvLocal();
requireCredentials("wsck_topic", ["DATABASE_URL", "VOYAGE_KEY"]);

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const MODEL = "voyage-3.5";

interface Pair {
  company: string; country: string; want: string; wantRegime: string;
  classSize: number; winnable: boolean; hit: boolean; rank: number | null;
  poolSize: number; pool?: [string, string, string][]; bucket: number;
}

async function embed(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 96) {
    const batch = texts.slice(i, i + 96);
    const res = await fetch(VOYAGE_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.VOYAGE_KEY}` },
      body: JSON.stringify({ input: batch, model: MODEL, input_type: "document" }),
    });
    if (!res.ok) throw new Error(`voyage ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = await res.json() as { data: { index: number; embedding: number[] }[] };
    const sorted = [...j.data].sort((a, b) => a.index - b.index);
    if (sorted.length !== batch.length) throw new Error(`voyage returned ${sorted.length} of ${batch.length}`);
    for (const d of sorted) out.push(d.embedding);
  }
  return out;
}

function norm(v: number[]) {
  const n = Math.sqrt(v.reduce((a, b) => a + b * b, 0));
  return n > 0 ? v.map((x) => x / n) : v;
}
const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

/** k-means on the unit sphere (cosine), k-means++ seeded from a fixed stream so
 *  two runs of this file agree. Throws rather than returning a degenerate
 *  labelling: a vocabulary with an empty option is not a vocabulary, and a
 *  silent one would make every arm below look like "no effect". */
function kmeans(X: number[][], K: number, seed = 20260809): number[] {
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const n = X.length;
  if (K >= n) throw new Error(`kmeans: K=${K} >= n=${n}, which is not a vocabulary`);
  const cent: number[][] = [X[Math.floor(rnd() * n)]];
  while (cent.length < K) {
    const d2 = X.map((x) => {
      const best = Math.max(...cent.map((c) => dot(x, c)));
      return Math.max(0, 1 - best) ** 2;
    });
    const tot = d2.reduce((a, b) => a + b, 0);
    let r = rnd() * tot, pick = n - 1;
    for (let i = 0; i < n; i++) { r -= d2[i]; if (r <= 0) { pick = i; break; } }
    cent.push(X[pick]);
  }
  let lab = new Array(n).fill(0);
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
  const used = new Set(lab).size;
  if (used < Math.min(K, 2)) throw new Error(`kmeans: collapsed to ${used} option(s) at K=${K}`);
  return lab;
}

async function main() {
  const dumps = (process.env.DUMPS ?? "/tmp/wsck/tune.json:tune,/tmp/wsck/holdout.json:holdout")
    .split(",").map((s) => { const [f, n] = s.split(":"); return { file: f, name: n ?? f }; });
  for (const d of dumps) if (!existsSync(d.file)) throw new Error(`missing dump ${d.file} — run _wsci_autopsy.ts with OUT=`);

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const { rows } = await db.query<{ id: string; name: string | null; description: string | null; parent_id: string | null }>(
    `SELECT id, name, description, parent_id FROM funding_instruments ORDER BY id`);
  await db.end();

  // ── the topic text: SOURCE ONLY. Never sample_project_titles, never
  //    sector_mix — those are the awards, and the answer key is one of them.
  const text = (r: { name: string | null; description: string | null }) =>
    `${r.name ?? ""}. ${(r.description ?? "").slice(0, 600)}`.trim();

  const cacheFile = process.env.EMB ?? "/tmp/wsck/emb.json";
  let vecs: Record<string, number[]>;
  if (existsSync(cacheFile)) {
    vecs = JSON.parse(readFileSync(cacheFile, "utf8"));
    const missing = rows.filter((r) => !vecs[r.id]);
    if (missing.length) {
      const e = await embed(missing.map(text));
      missing.forEach((r, i) => { vecs[r.id] = norm(e[i]); });
      writeFileSync(cacheFile, JSON.stringify(vecs));
    }
  } else {
    const e = await embed(rows.map(text));
    vecs = {};
    rows.forEach((r, i) => { vecs[r.id] = norm(e[i]); });
    writeFileSync(cacheFile, JSON.stringify(vecs));
  }
  const ids = rows.map((r) => r.id);
  const X = ids.map((i) => vecs[i]);
  console.log(`topic space: ${ids.length} instruments embedded on ${MODEL} from name+description (source text only)`);

  // ── the guard that makes every simulation below meaningful ────────────────
  // The autopsy claims the published five are literally pool[0..4]. If that is
  // false, every delta computed from a dump is fiction. Checked, not assumed.
  for (const d of dumps) {
    const pairs = JSON.parse(readFileSync(d.file, "utf8")) as Pair[];
    const withPool = pairs.filter((p) => p.pool);
    if (!withPool.length) throw new Error(`${d.file} has no pool — re-run with OUT=`);
    const bad = withPool.filter((p) => (p.pool!.slice(0, 5).some(([id]) => id === p.want)) !== p.hit);
    if (bad.length) {
      throw new Error(`${d.name}: pool[0..4] disagrees with the recorded hit on ${bad.length}/${withPool.length} pairs` +
        ` — a dump simulation would be fiction (first: ${bad[0].want})`);
    }
  }
  console.log(`pool[0..4] == published five: verified on every dumped pair\n`);

  const LADDER = (process.env.K ?? "4,8,16,24,32,48,64,96,128,192,256").split(",").map(Number);
  const labelsFor = new Map<number, Map<string, number>>();
  for (const K of LADDER) {
    const lab = kmeans(X, K);
    labelsFor.set(K, new Map(ids.map((id, i) => [id, lab[i]])));
  }

  console.log(`ORACLE BOUND — a PERFECT answer to one topic question with K options.`);
  console.log(`  The founder's answer is taken to be the topic of the fund they actually won,`);
  console.log(`  which is the most generous a real answer could ever be.\n`);
  for (const d of dumps) {
    const pairs = (JSON.parse(readFileSync(d.file, "utf8")) as Pair[]).filter((p) => p.pool);
    const base = pairs.filter((p) => p.hit).length;
    console.log(`${d.name}  N=${pairs.length}  base EXACT@5 ${(100 * base / pairs.length).toFixed(1)}%`);
    console.log(`    K   median option size    FILTER (blocks)   PARTITION (cannot block)   concentration of gain`);
    for (const K of LADDER) {
      const lab = labelsFor.get(K)!;
      const sizes = new Map<number, number>();
      for (const id of ids) sizes.set(lab.get(id)!, (sizes.get(lab.get(id)!) ?? 0) + 1);
      const med = [...sizes.values()].sort((a, b) => a - b)[Math.floor(sizes.size / 2)];
      let fil = 0, par = 0;
      const gained = new Map<string, number>();
      for (const p of pairs) {
        const mine = lab.get(p.want);
        const pool = p.pool!;
        const same = pool.filter(([id]) => lab.get(id) === mine);
        const rest = pool.filter(([id]) => lab.get(id) !== mine);
        if (same.slice(0, 5).some(([id]) => id === p.want)) fil++;
        const partitioned = [...same, ...rest];
        const ph = partitioned.slice(0, 5).some(([id]) => id === p.want);
        if (ph) par++;
        if (ph && !p.hit) gained.set(p.wantRegime, (gained.get(p.wantRegime) ?? 0) + 1);
      }
      const g = [...gained].sort((a, b) => b[1] - a[1]);
      const gtot = g.reduce((a, [, n]) => a + n, 0);
      console.log(`  ${String(K).padStart(4)}${String(med).padStart(18)}` +
        `${`${(100 * fil / pairs.length).toFixed(1)}%`.padStart(16)} (${sgn(100 * (fil - base) / pairs.length)})` +
        `${`${(100 * par / pairs.length).toFixed(1)}%`.padStart(16)} (${sgn(100 * (par - base) / pairs.length)})` +
        `   ${gtot ? `${g.length} regime(s), largest ${(100 * g[0][1] / gtot).toFixed(0)}%` : "-"}`);
    }
    console.log();
  }

  // ── The ceiling of ANY topic question, at any K ────────────────────────────
  // A partition can only help when the won leaf is in the pool at all and the
  // number of same-topic candidates ahead of it is under five. The limit as the
  // vocabulary becomes perfectly discriminating is "won leaf in the pool", which
  // is the ceiling of every permutation and is already known. Printed so the
  // curve above is read against the right bar.
  for (const d of dumps) {
    const pairs = (JSON.parse(readFileSync(d.file, "utf8")) as Pair[]).filter((p) => p.pool);
    const inPool = pairs.filter((p) => p.pool!.some(([id]) => id === p.want)).length;
    console.log(`${d.name}: won leaf is in the pool at all — ${(100 * inPool / pairs.length).toFixed(1)}%` +
      `  <- the ceiling of EVERY permutation rule, topic included`);
  }
}

const sgn = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(1)}`;

main();
