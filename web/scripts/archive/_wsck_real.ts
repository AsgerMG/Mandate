// wsCK part 3 — the same topic question answered by the FOUNDER instead of by
// the answer key, which is the only arm that says whether the bound is real.
//
// `_wsck_topic.ts` bounds a K-option topic question at +14 to +24 points on both
// splits. That bound takes the founder's answer to be the topic of the fund they
// went on to win, and no founder knows that. This file replaces the oracle with
// the founder's own leak-free project text, assigns it to a topic by the same
// distance rule the corpus was labelled with, and measures the three things that
// decide whether the question is worth asking:
//
//   1  AGREEMENT   how often the founder's own words land on the same topic as
//                  the fund they won. This is the whole realism discount.
//   2  PARTITION   EXACT@5 with same-topic candidates first. Cannot block.
//   3  BLOCKED     EXACT@5 with a FILTER, and the winners it removes. A filter
//                  on a wrong answer hides a fund from someone who qualifies —
//                  Innovate UK, org type, the address guard. Named, not rated.
//
// ── The population, and why it is not the headline population ─────────────
// Only rows with a description that `isDescribed` admits — a description
// recovered from a DIFFERENT regime, never the won award's own project title.
// The headline replay runs 84% of founders on a canned sector sentence, and a
// canned sentence is not an answer to a topic question; measuring on it would
// grade the template, not the question. So this arm reports on the described
// subpopulation and states its size, and the two are never mixed.
//
// ── FREE ───────────────────────────────────────────────────────────────────
// One Postgres read, the cached instrument embeddings from `_wsck_topic.ts`,
// and one short Voyage embed per described founder. No model calls, nothing
// written to the database.
//
//   SPLIT=tune DUMP=/tmp/wsck/tune.json npx tsx scripts/_wsck_real.ts
import { existsSync, readFileSync, writeFileSync } from "fs";

import { loadEnvLocal, requireCredentials } from "../loadEnv";

loadEnvLocal();
requireCredentials("wsck_real", ["DATABASE_URL", "VOYAGE_KEY"]);

import { Client } from "pg";

import {
  hydrateDbInstruments, loadDbInstruments, publishableInstruments, requireLiveCorpus,
} from "../../lib/intelligence/corpus";
import { DEFAULT_SEED, sampleRecall } from "../recallSample";
import {
  assertAncestorConvention, assertGradablePopulation, isDescribed, loadRecallSet,
  partitionByOfferable, reattributeMissingAnswers, type RecallRow,
} from "../recallSet";

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const MODEL = "voyage-3.5";

interface Pair { want: string; wantRegime: string; hit: boolean; pool?: [string, string, string][] }

async function embed(texts: string[], inputType: "document" | "query"): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 96) {
    const batch = texts.slice(i, i + 96);
    const res = await fetch(VOYAGE_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.VOYAGE_KEY}` },
      body: JSON.stringify({ input: batch, model: MODEL, input_type: inputType }),
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

function kmeans(X: number[][], K: number, seed = 20260809): { lab: number[]; cent: number[][] } {
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
  if (new Set(lab).size < Math.min(K, 2)) throw new Error(`kmeans: collapsed at K=${K}`);
  return { lab, cent };
}

async function main() {
  const split = process.env.SPLIT ?? "tune";
  const dumpFile = process.env.DUMP ?? `/tmp/wsck/${split}.json`;
  if (!existsSync(dumpFile)) throw new Error(`missing dump ${dumpFile}`);
  const dump = JSON.parse(readFileSync(dumpFile, "utf8")) as Pair[];

  await hydrateDbInstruments();
  requireLiveCorpus("wsck_real");
  const corpus = loadDbInstruments();
  const offerable = new Set(publishableInstruments().map((i) => i.id));

  // ── Rebuild the SAME draw the dump was produced from, and prove it is the
  //    same row for row. Two code paths that agree "by construction" is how a
  //    change of sample once got reported as an effect.
  const { file: setFile, rows: all } = loadRecallSet();
  assertAncestorConvention(corpus);
  const inCorpus = new Set(corpus.map((i) => i.id));
  const fixed = reattributeMissingAnswers(all, (id) => inCorpus.has(id), (id) => offerable.has(id));
  const pop = partitionByOfferable(fixed.rows, (id) => offerable.has(id));
  assertGradablePopulation(pop, (id) => inCorpus.has(id), fixed.reattributed.length, setFile);
  const set = pop.graded.filter((r) => split === "all" || r.split === split);
  const N = Math.min(Number(process.env.N ?? 250), set.length);
  const sample = sampleRecall(set, N, Number(process.env.SEED ?? DEFAULT_SEED));
  if (sample.length !== dump.length) {
    throw new Error(`draw mismatch: rebuilt ${sample.length} rows, dump holds ${dump.length}`);
  }
  sample.forEach((t: RecallRow, i: number) => {
    if (t.instrument !== dump[i].want) {
      throw new Error(`draw mismatch at row ${i}: rebuilt ${t.instrument}, dump ${dump[i].want}`);
    }
  });
  console.log(`draw verified row-for-row against ${dumpFile} (${sample.length} pairs)`);

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const { rows } = await db.query<{ id: string; name: string | null; description: string | null }>(
    `SELECT id, name, description FROM funding_instruments ORDER BY id`);
  await db.end();

  // ── which side of the bridge the FUND stands on ──────────────────────────
  // SPACE=source  the call's own name and description, from the source page.
  // SPACE=profile the production index: what the fund FUNDS, built from the
  //               project titles it awarded. semantic.ts documents why this is
  //               the space a company description can be matched in at all, so
  //               a topic question that fails in `source` and works in `profile`
  //               is a fact about the bridge and not about the question.
  const space = process.env.SPACE ?? "source";
  if (!["source", "profile"].includes(space)) throw new Error(`unknown SPACE=${space}`);
  let vecs: Record<string, number[]>;
  if (space === "profile") {
    const db2 = new Client({ connectionString: process.env.DATABASE_URL });
    await db2.connect();
    const p = await db2.query<{ instrument_id: string; embedding: string }>(
      `SELECT instrument_id, embedding::text AS embedding FROM instrument_profiles`);
    await db2.end();
    vecs = {};
    for (const r of p.rows) vecs[r.instrument_id] = norm(JSON.parse(r.embedding) as number[]);
    if (!p.rows.length) throw new Error("instrument_profiles is empty — the profile space does not exist");
  } else {
    const cacheFile = process.env.EMB ?? "/tmp/wsck/emb.json";
    if (!existsSync(cacheFile)) throw new Error(`missing ${cacheFile} — run _wsck_topic.ts first`);
    vecs = JSON.parse(readFileSync(cacheFile, "utf8")) as Record<string, number[]>;
  }
  // A fund with no vector cannot be topic-labelled at all. Reported, never
  // silently dropped: an unlabelled fund in the pool is one a topic partition
  // pushes to the back for every founder, which is the shape of a hidden fund.
  const covered = rows.filter((r) => vecs[r.id]);
  console.log(`SPACE=${space}: ${covered.length}/${rows.length} instruments carry a topic vector` +
    ` (${rows.length - covered.length} would be un-labellable)`);
  if (covered.length < rows.length * 0.5) throw new Error(`SPACE=${space} covers under half the corpus`);
  const ids = covered.map((r) => r.id);
  const X = ids.map((i) => vecs[i]);

  // ── the founder side: their own leak-free words, embedded as a QUERY ──────
  const described = sample.map((t: RecallRow, i: number) => ({ t, i }))
    .filter(({ t }) => isDescribed(t));
  if (!described.length) throw new Error("no described founder in this draw — the arm would measure nothing");
  const qCacheFile = process.env.QEMB ?? "/tmp/wsck/qemb.json";
  const qcache: Record<string, number[]> = existsSync(qCacheFile)
    ? JSON.parse(readFileSync(qCacheFile, "utf8")) : {};
  const texts = described.map(({ t }) => (t.description ?? "").trim().slice(0, 1200));
  const need = [...new Set(texts)].filter((s) => !qcache[s]);
  if (need.length) {
    const e = await embed(need, "query");
    need.forEach((s, i) => { qcache[s] = norm(e[i]); });
    writeFileSync(qCacheFile, JSON.stringify(qcache));
  }
  console.log(`described founders in this draw: ${described.length}/${sample.length}` +
    ` (${(100 * described.length / sample.length).toFixed(0)}%)` +
    ` — the other ${sample.length - described.length} answer no topic question and are excluded\n`);

  const base = described.filter(({ i }) => dump[i].hit).length;
  console.log(`SPLIT=${split}  described N=${described.length}  base EXACT@5 ` +
    `${(100 * base / described.length).toFixed(1)}%   (the same pairs, shipped order)\n`);
  console.log(`   K   agreement   PARTITION EXACT@5      FILTER EXACT@5   winners the filter blocks`);

  const LADDER = (process.env.K ?? "4,8,16,24,32,48,64,96,128").split(",").map(Number);
  const blockedNames: string[] = [];
  for (const K of LADDER) {
    const { lab, cent } = kmeans(X, K);
    const topicOf = new Map(ids.map((id, j) => [id, lab[j]]));
    const nearest = (v: number[]) => {
      let b = 0, bs = -2;
      for (let k = 0; k < cent.length; k++) { const s = dot(v, cent[k]); if (s > bs) { bs = s; b = k; } }
      return b;
    };
    let agree = 0, par = 0, fil = 0, blocked = 0;
    for (const { t, i } of described) {
      const p = dump[i];
      const said = nearest(qcache[(t.description ?? "").trim().slice(0, 1200)]);
      const truth = topicOf.get(p.want);
      if (said === truth) agree++;
      const pool = p.pool ?? [];
      const same = pool.filter(([id]) => topicOf.get(id) === said);
      const rest = pool.filter(([id]) => topicOf.get(id) !== said);
      if ([...same, ...rest].slice(0, 5).some(([id]) => id === p.want)) par++;
      if (same.slice(0, 5).some(([id]) => id === p.want)) fil++;
      // A BLOCKED WINNER: the register says this company received this leaf, and
      // the filter removes it from their table outright.
      if (pool.some(([id]) => id === p.want) && !same.some(([id]) => id === p.want)) {
        blocked++;
        if (K === 16 && blockedNames.length < 20) blockedNames.push(`${t.name} (${t.country}) -> ${p.want}`);
      }
    }
    console.log(`${String(K).padStart(4)}${`${(100 * agree / described.length).toFixed(0)}%`.padStart(11)}` +
      `${`${(100 * par / described.length).toFixed(1)}%`.padStart(16)} (${sgn(100 * (par - base) / described.length)})` +
      `${`${(100 * fil / described.length).toFixed(1)}%`.padStart(16)} (${sgn(100 * (fil - base) / described.length)})` +
      `${String(blocked).padStart(10)}  ${(100 * blocked / described.length).toFixed(1)}% of the draw`);
  }

  console.log(`\nWINNERS A K=16 FILTER WOULD BLOCK (named, because a rate hides which ones)`);
  if (!blockedNames.length) {
    throw new Error("the blocked-winner guard found nothing — on this population that is a defect in " +
      "the guard, not a clean result; a topic filter that never disagrees with the answer key " +
      "would mean the founder's words already name the fund");
  }
  for (const n of blockedNames) console.log(`   ${n}`);
}

const sgn = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(1)}`;

main();
