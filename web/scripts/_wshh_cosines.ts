// wsHH — WHY DOES THE EMBEDDING NOT SEPARATE TWO DOORS OF ONE SCHEME?
//
// @ws-active until 2026-09-30
//
// `door_separation_wsHA` established that the separating fact EXISTS on 287 of
// 287 sibling-miss pairs, and that for the largest block the separator is
// TOPIC — the description and the eligibility text, both of which
// `ETL/terms/build_instrument_profiles.py` puts INSIDE the embedded profile.
// So the signal should already be in the index. This harness asks why the
// ordering does not see it.
//
// ── THE THREE QUANTITIES, on wsHA's own committed pairs ────────────────────
//
//   RAW      cosine(founder description, instrument profile) for the won door
//            and for the shown sibling. What the index actually holds.
//   PERCENTILE  what `semanticFundMatch` returns instead: (n-1-i)/(n-1) over
//            the WHOLE profile table. What the ordering sees.
//   FLOORED  what `selectLeafInstruments` uses: the percentile, zeroed below
//            `RELEVANCE_FLOOR`.
//
// The percentile map is a RANK transform of the raw cosines, so it is monotone
// and cannot reverse a pair. Everything it can do to a pair is (a) compress
// the gap to the number of instruments lying between them and (b) hand both
// doors to the floor. Both are measured here rather than argued.
//
// ── AND THE UPSTREAM CHECK, WHICH IS CHEAPER AND CHANGES WHO OWNS THE FIX ──
// If `profile_text` is near-identical for two siblings then no query can
// separate them and the defect is in `build_profiles`, not in the ranking. So
// the profile texts and the door-to-door cosine are pulled in the same run,
// before any founder is embedded.
//
// ── FREE ───────────────────────────────────────────────────────────────────
// One Voyage embedding per founder and Postgres reads. ANTHROPIC_API_KEY is
// deleted before anything that could reach it is imported. NO PAID MODEL CALL.
//
// ── THE ANSWER KEY MAY NOT REACH THE PRODUCT ───────────────────────────────
// The pairs are read from wsHA's committed evidence file, a harness artifact.
// Nothing under `lib/` is told anything. `check_answer_not_reachable.ts` stays
// green.
//
//   N=20 OUT=/tmp/wshh.json npx tsx scripts/_wshh_cosines.ts   # smoke
//   OUT=/tmp/wshh.json npx tsx scripts/_wshh_cosines.ts        # the 287 pairs
//
// @ws-active until 2026-09-30
import { readFileSync, writeFileSync } from "fs";
import path from "path";

import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
// Free by construction, not by intention. Verbatim from `_wsha_doors.ts`.
delete process.env.ANTHROPIC_API_KEY;
if (requireCredentials("wshh_cosines", ["DATABASE_URL", "VOYAGE_KEY"]) === "offline") {
  throw new Error(
    "_wshh_cosines: NO_PG is set. It deletes DATABASE_URL, which serves the "
    + "committed snapshot AND drops every `rankerUsed` call site to the lexical "
    + "index. The pairs this harness reads were produced by the EMBEDDING "
    + "ranker; measuring them against a lexical corpus would answer a question "
    + "about a product nobody is served by.");
}

import { corpusProvenance, hydrateDbInstruments, loadDbInstruments, requireLiveCorpus }
  from "../lib/intelligence/corpus";
import { separationOf } from "../lib/intelligence/semantic";
import { founderIntake, founderPolicyFromEnv, type FounderPolicy } from "./founderIntake";
import { isDescribed, loadRecallSet, reattributeMissingAnswers, type RecallRow }
  from "./recallSet";

/** wsHA's committed working set. Read, never re-derived: this workstream's
 *  claim is about the SAME 287 pairs that finding published, and re-deriving
 *  them would silently re-draw the population under a citation. */
const PAIRS = path.resolve(process.cwd(), "..", "..",
  "project-mgmt", "evidence", "wsha_door_pairs_2026-08-17.jsonl");

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const MODEL = "voyage-3.5";

interface WshaDoor { id: string; name: string }
interface WshaPair {
  founder: string; country: string; regime: string;
  rank_accessible: number | null; accessible_len: number; siblings_shown: number;
  won: WshaDoor; shown: WshaDoor; draw: string;
}

export interface PairMeasurement {
  founder: string;
  regime: string;
  rankAccessible: number | null;
  wonId: string;
  shownId: string;
  /** Instruments carrying a profile row, i.e. the percentile denominator. */
  profileN: number;
  /** Raw cosine against the founder's description; null = no profile row, and
   *  a fund with no profile row scores 0 in the ranker whatever it funds. */
  rawWon: number | null;
  rawShown: number | null;
  /** 0-based position in the distance-ordered scan; the percentile's input. */
  idxWon: number | null;
  idxShown: number | null;
  pctWon: number;
  pctShown: number;
  /** Dispersion of the founder's raw similarities over the whole table. */
  cosMean: number;
  cosSd: number;
  cosMax: number;
  skew: number | null;
  /** How many instruments in the WHOLE table lie between the two doors. */
  between: number | null;
  /** The regime's siblings that carry a profile, and where the two doors sit
   *  inside that group. This is the within-group question the ordering has to
   *  answer, isolated from the 1,000 funds that are not in the running. */
  siblingN: number;
  sibRankWon: number | null;
  sibRankShown: number | null;
  /** Door-to-door: how similar the two PROFILES are to each other, and how
   *  much text each carries. If these are near-identical the defect is
   *  upstream of every number above. */
  profileCos: number | null;
  profileCharsWon: number | null;
  profileCharsShown: number | null;
  profileIdentical: boolean;
  /** Jaccard over word types, the coarse "is this the same document" read. */
  profileJaccard: number | null;
}

const num = (v: string | undefined, d: number) =>
  (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : d);

async function embedQuery(text: string): Promise<number[]> {
  const key = process.env.VOYAGE_KEY;
  const res = await fetch(VOYAGE_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    // Verbatim from semantic.ts: Voyage embeds queries and documents into
    // deliberately different positions, and the profiles were written with
    // input_type "document". A run that got this wrong would measure a
    // different index from the one that ships.
    body: JSON.stringify({ input: [text], model: MODEL, input_type: "query" }),
  });
  if (!res.ok) throw new Error(`voyage ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { data?: { embedding: number[] }[] };
  const vec = json.data?.[0]?.embedding;
  if (!vec) throw new Error("voyage returned no embedding");
  return vec;
}

const words = (s: string) =>
  new Set(s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2));

function jaccard(a: string, b: string): number {
  const A = words(a), B = words(b);
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter += 1;
  return inter / (A.size + B.size - inter);
}

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("_wshh_cosines");
  const store = corpusProvenance().source;
  if (store !== "postgres") {
    throw new Error(
      `_wshh_cosines: the corpus came from ${store}, not Postgres. The whole `
      + "question is what the LIVE vector index holds, and the snapshot has no "
      + "embeddings at all.");
  }

  const raw = readFileSync(PAIRS, "utf8").trim().split("\n");
  const pairs = raw.map((l) => JSON.parse(l) as WshaPair);
  const DRAW = "13cb71cf3a1d1847";
  const draws = new Set(pairs.map((p) => p.draw));
  if (draws.size !== 1 || !draws.has(DRAW)) {
    throw new Error(
      `_wshh_cosines: the evidence file carries draw(s) ${[...draws].join(",")}, `
      + `not the funnel's ${DRAW}. Every figure wsHA and wsGY publish is on that `
      + "draw and this workstream's claim is about the same founders.");
  }

  // ── The founders, reconstructed the way every harness on this draw does ───
  const { rows: all } = loadRecallSet("wsHH sibling embedding");
  const corpus = loadDbInstruments();
  const inCorpus = new Set(corpus.map((i) => i.id));
  const byId = new Map(corpus.map((i) => [i.id, i]));
  const fixed = reattributeMissingAnswers(all, (id) => inCorpus.has(id), () => true);
  const described = fixed.rows.filter((r) => r.split === "holdout" && isDescribed(r));
  const byName = new Map<string, RecallRow>();
  for (const r of [...described].sort((a, b) => a.name.localeCompare(b.name))) {
    if (!byName.has(r.name)) byName.set(r.name, r);
  }
  const policy: FounderPolicy = founderPolicyFromEnv();

  const missing = pairs.filter((p) => !byName.has(p.founder));
  if (missing.length) {
    throw new Error(
      `_wshh_cosines: ${missing.length} of ${pairs.length} pair founders are not `
      + `in the reconstructed population (first: ${missing[0].founder}). The `
      + "recall set has moved under wsHA's evidence file and nothing here would "
      + "compose with it.");
  }

  const { Client } = await import("pg");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // ── Regime siblings, from the corpus's own `parentId ?? id` convention ────
  const regimeOf = (id: string) => String(byId.get(id)?.parentId ?? id);
  const siblingsOf = new Map<string, string[]>();
  for (const i of corpus) {
    const r = regimeOf(i.id);
    (siblingsOf.get(r) ?? siblingsOf.set(r, []).get(r)!).push(i.id);
  }

  // ── PHASE 1, upstream and free: the profiles themselves ──────────────────
  const doorIds = [...new Set(pairs.flatMap((p) => [p.won.id, p.shown.id]))];
  const profRes = await client.query(
    "SELECT instrument_id, profile_text FROM instrument_profiles WHERE instrument_id = ANY($1)",
    [doorIds]);
  const profileText = new Map<string, string>(
    (profRes.rows as { instrument_id: string; profile_text: string }[])
      .map((r) => [r.instrument_id, r.profile_text ?? ""]));
  const cosRes = await client.query(
    `SELECT a.instrument_id AS a, b.instrument_id AS b,
            1 - (a.embedding <=> b.embedding) AS cos
       FROM instrument_profiles a JOIN instrument_profiles b ON b.instrument_id = ANY($2)
      WHERE a.instrument_id = ANY($1)`,
    [pairs.map((p) => p.won.id), pairs.map((p) => p.shown.id)]);
  const doorCos = new Map<string, number>(
    (cosRes.rows as { a: string; b: string; cos: string | number }[])
      .map((r) => [`${r.a}||${r.b}`, Number(r.cos)]));

  const totalProfiles = Number(
    (await client.query("SELECT count(*)::int AS n FROM instrument_profiles")).rows[0].n);
  const corpusWithProfile = Number(
    (await client.query(
      "SELECT count(*)::int AS n FROM instrument_profiles WHERE instrument_id = ANY($1)",
      [corpus.map((i) => i.id)])).rows[0].n);
  console.log(
    `wshh · corpus ${corpus.length} instrument(s) · instrument_profiles ${totalProfiles} `
    + `row(s) · ${corpusWithProfile} of the corpus carry one `
    + `(${(100 * corpusWithProfile / corpus.length).toFixed(1)}%)`);
  console.log(`wshh · ${pairs.length} pair(s), draw ${DRAW}\n`);

  // ── PHASE 2: one founder embedding, one full scan of the table ───────────
  const n = num(process.env.N, 0);
  const work = n > 0 ? pairs.slice(0, n) : pairs;
  const out: PairMeasurement[] = [];
  const embedCache = new Map<string, number[]>();

  for (let k = 0; k < work.length; k += 1) {
    const p = work[k];
    const row = byName.get(p.founder)!;
    const f = founderIntake(row, policy);
    const desc = (f.opts.description ?? "").trim();
    if (!desc) throw new Error(`_wshh_cosines: ${p.founder} has no description.`);

    let vec = embedCache.get(desc);
    if (!vec) { vec = await embedQuery(desc); embedCache.set(desc, vec); }
    const literal = `[${vec.join(",")}]`;
    // Verbatim from `semanticFundMatch`: every profile, ordered by distance
    // then by id. The index IS the rank, and the tiebreak is what makes the
    // rank reproducible.
    const res = await client.query(
      `SELECT instrument_id, 1 - (embedding <=> $1::vector) AS similarity
         FROM instrument_profiles
        ORDER BY embedding <=> $1::vector, instrument_id`,
      [literal]);
    const scan = (res.rows as { instrument_id: string; similarity: string | number }[])
      .map((r) => ({ id: r.instrument_id, s: Number(r.similarity) }));
    const N = scan.length;
    const idxOf = new Map(scan.map((r, i) => [r.id, i]));
    const simOf = new Map(scan.map((r) => [r.id, r.s]));
    const pct = (id: string) => {
      const i = idxOf.get(id);
      if (i === undefined) return 0;   // absent from the map == 0 in the ranker
      return N === 1 ? 1 : (N - 1 - i) / (N - 1);
    };

    const vals = scan.map((r) => r.s);
    const mean = vals.reduce((a, b) => a + b, 0) / N;
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / N);

    const sibs = (siblingsOf.get(p.regime) ?? []).filter((id) => idxOf.has(id));
    const sibSorted = [...sibs].sort((a, b) => (idxOf.get(a)! - idxOf.get(b)!));
    const sibRank = (id: string) => {
      const i = sibSorted.indexOf(id);
      return i < 0 ? null : i + 1;
    };

    const iW = idxOf.get(p.won.id) ?? null, iS = idxOf.get(p.shown.id) ?? null;
    const tw = profileText.get(p.won.id) ?? null, ts = profileText.get(p.shown.id) ?? null;
    out.push({
      founder: p.founder,
      regime: p.regime,
      rankAccessible: p.rank_accessible,
      wonId: p.won.id,
      shownId: p.shown.id,
      profileN: N,
      rawWon: simOf.get(p.won.id) ?? null,
      rawShown: simOf.get(p.shown.id) ?? null,
      idxWon: iW,
      idxShown: iS,
      pctWon: pct(p.won.id),
      pctShown: pct(p.shown.id),
      cosMean: mean,
      cosSd: sd,
      cosMax: vals[0],
      skew: separationOf(vals) ?? null,
      between: iW !== null && iS !== null ? Math.abs(iW - iS) - 1 : null,
      siblingN: sibSorted.length,
      sibRankWon: sibRank(p.won.id),
      sibRankShown: sibRank(p.shown.id),
      profileCos: doorCos.get(`${p.won.id}||${p.shown.id}`) ?? null,
      profileCharsWon: tw === null ? null : tw.length,
      profileCharsShown: ts === null ? null : ts.length,
      profileIdentical: tw !== null && ts !== null && tw === ts,
      profileJaccard: tw !== null && ts !== null ? jaccard(tw, ts) : null,
    });
    if ((k + 1) % 25 === 0 || k === work.length - 1) {
      console.log(`  ${k + 1}/${work.length}`);
    }
  }

  await client.end();

  const dest = process.env.OUT ?? "/tmp/wshh_cosines.json";
  writeFileSync(dest, JSON.stringify({
    draw: DRAW,
    startedAt: new Date().toISOString(),
    corpusSize: corpus.length,
    totalProfiles,
    corpusWithProfile,
    pairs: out,
  }, null, 2));
  console.log(`\nwrote ${dest}  (${out.length} pair(s))`);
}

main().catch((e) => { console.error(e); process.exit(1); });
