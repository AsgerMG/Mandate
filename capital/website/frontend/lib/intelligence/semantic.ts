// Semantic fund matching: which instruments actually fund what this company
// does, via pgvector over instrument_profiles.
//
// This is the primary matching signal. relevance.ts (lexical IDF over gate
// text) remains as the offline fallback for when VOYAGE_KEY or Postgres is
// unavailable — it is measurably worse but never wrong-by-construction, and
// the memo must never fail because a vector query timed out.
//
// Why profiles and not eligibility_embeddings: that index holds what a fund
// DEMANDS (legal requirements). Matching a company description against rule
// text compares two different semantic spaces and measurably fails — a rail
// company retrieved IPCEI's "only depreciation costs incurred during the
// construction period" above Europe's Rail. instrument_profiles holds what a
// fund FUNDS, including the real project titles it has awarded, and beats both
// lexical and rule-embedding retrieval on every domain tested.
// Built by ETL/terms/build_instrument_profiles.py.

import { MIN_MATCHABLE_DESCRIPTION_CHARS } from "./types";

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const MODEL = "voyage-3.5";
/** Keep the whole path bounded: this runs inside the memo pipeline, which is
 *  already slow, but must not hang it. */
const TIMEOUT_MS = 6000;

/** Per-invocation memo: the same description is matched once per warm lambda,
 *  not once per pipeline stage that asks. */
const cache = new Map<string, Map<string, number>>();

/** How sharply this description peaks on the corpus, on the RAW similarities.
 *
 *  Kept beside the scores rather than derived from them, because it CANNOT be
 *  derived from them: the returned map is percentile-normalised, and a
 *  percentile distribution is uniform on [0,1] by construction. Every
 *  dispersion statistic computed on it is the same number for every query --
 *  measured at 0.998 for a canned self-description and 0.998 for a real project
 *  title, which is why `themeInformative` in shortlist.ts was structurally
 *  always true and the entire "how much do we trust this founder's words"
 *  branch never ran.
 *
 *  Raw cosines do carry it. Measured over the 11 canned sector templates and 19
 *  real project descriptions in the recall set, against the live index:
 *
 *      statistic          canned    real    best single split
 *      max/mean - 1        0.281   0.454    87%
 *      (max-mean)/sd       3.35    4.07     77%
 *      max                 0.572   0.496    63%   (inverted, useless)
 *
 *  `max/mean - 1` is the statistic `THEME_SPREAD_FLOOR` was written against and
 *  it is the one that works; only the input was wrong. Note `max` alone runs
 *  BACKWARDS -- a generic sentence matches everything moderately well and scores
 *  a HIGHER top similarity than a specific one -- so any "is the best match good
 *  enough" test is worse than useless here. It has to be about the shape of the
 *  distribution, not its height. */
const separation = new Map<string, number>();

/** Dispersion of the raw similarities for `description`, or `undefined` when
 *  the index was never consulted for it (no key, no Postgres, no cache entry).
 *  Callers must treat `undefined` as "no opinion", never as zero. */
export function semanticSeparation(description: string | undefined): number | undefined {
  const desc = description?.trim();
  return desc ? separation.get(desc) : undefined;
}

/** SKEWNESS of the raw similarities. Exported for the cache emitter so the
 *  committed artifact and production can never compute it differently.
 *
 *  THE PROPERTY: a description that names something specific makes a FEW funds
 *  match much better than the bulk, which is a right tail. A canned sector
 *  sentence matches everything moderately, which is symmetric. So the question
 *  "does this text separate the funds" is a question about the SHAPE of the
 *  similarity distribution, and skewness is the statistic for a tail.
 *
 *  This replaced `max / mean - 1`, which was the right instinct read off the
 *  wrong input (percentile ranks, uniform by construction) and then, once fixed
 *  to read raw cosines, still barely discriminated. Measured over 296 holdout
 *  rows -- 61 with a real description, 235 on a canned sector template --
 *  against the live index:
 *
 *      statistic        AUC    real routed "specific"   canned routed "specific"
 *      max/mean - 1    0.610          43%                       28%
 *      SKEWNESS        0.773          52%                        4%
 *
 *  `max / mean - 1` is dominated by the corpus bulk that sets the mean, and the
 *  bulk is the same for every query. The remaining error under skewness is
 *  one-directional and it is the cheap one: half of real descriptions are
 *  treated as generic, which costs a project founder a few positions, while a
 *  canned template is almost never mistaken for a specific one, which is the
 *  error that damages the 84% of founders who have no project text.
 *
 *  Note that `max` alone runs BACKWARDS -- a generic sentence matches everything
 *  moderately well and scores a HIGHER top similarity than a specific one -- so
 *  no "is the best match good enough" test can work here. It has to be shape. */
export function separationOf(similarities: number[]): number | undefined {
  const vals = similarities.filter((v) => Number.isFinite(v) && v > 0);
  if (vals.length < 2) return undefined;
  const n = vals.length;
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  if (mean <= 0) return undefined;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  if (sd <= 0) return undefined;
  return vals.reduce((a, b) => a + ((b - mean) / sd) ** 3, 0) / n;
}

interface CachedMatch { scores: Record<string, number>; separation?: number }

/** Committed scores for the fixed descriptions our checks use. Read lazily so a
 *  production request never pays for a file that only tests need.
 *
 *  Carries `separation` alongside `scores` because the offline checks have to
 *  exercise the SAME branch production takes. The statistic is unrecoverable
 *  from the percentile scores, so a cache holding scores alone would send every
 *  archetype and every red-team case down whichever branch the fallback picked
 *  -- which is the award-median defect again: a check validating a path that
 *  does not ship. The older shape (description -> scores) is still read, and
 *  simply yields no separation. */
let scoreCache: Record<string, CachedMatch> | undefined;
function loadSemanticCache(): Record<string, CachedMatch> {
  if (scoreCache === undefined) {
    try {
      // Deliberate require(): this module is imported from a "use client"
      // boundary, and a top-level `import "fs"` would pull node built-ins into
      // the client bundle. Both lines need the exemption -- the disable comment
      // covered only the first, so the second has been failing CI's lint step.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { readFileSync } = require("fs") as typeof import("fs");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const path = require("path") as typeof import("path");
      const raw = JSON.parse(readFileSync(
        path.join(process.cwd(), "lib", "intelligence", "semanticCache.generated.json"),
        "utf8")) as Record<string, CachedMatch | Record<string, number>>;
      scoreCache = Object.fromEntries(Object.entries(raw).map(([d, v]) => [
        d,
        "scores" in v && typeof v.scores === "object"
          ? (v as CachedMatch)
          : { scores: v as Record<string, number> },
      ]));
    } catch {
      scoreCache = {};
    }
  }
  return scoreCache ?? {};
}

async function embedQuery(text: string): Promise<number[] | null> {
  const key = process.env.VOYAGE_KEY;
  if (!key) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(VOYAGE_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      // input_type "query" is not cosmetic: Voyage embeds queries and documents
      // into deliberately different positions, and the profiles were written
      // with input_type "document".
      body: JSON.stringify({ input: [text], model: MODEL, input_type: "query" }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.error("voyage embed failed:", res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const json = (await res.json()) as { data?: { embedding: number[] }[] };
    return json.data?.[0]?.embedding ?? null;
  } catch (err) {
    console.error("voyage embed error:", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Cosine similarity of the founder's description against every instrument
 * profile, as instrumentId -> 0-1 normalised against the best match in the set.
 *
 * Returns an empty map on ANY failure (no key, no DATABASE_URL, timeout, empty
 * index) so callers fall back to lexical matching rather than losing the memo.
 */
export async function semanticFundMatch(
  description: string | undefined,
): Promise<Map<string, number>> {
  const desc = description?.trim();
  if (!desc || desc.length < MIN_MATCHABLE_DESCRIPTION_CHARS) return new Map();
  const cached = cache.get(desc);
  if (cached) return cached;

  const url = process.env.DATABASE_URL;
  if (!url) {
    // No Postgres: fall back to the committed score cache before giving up.
    //
    // This exists so the OFFLINE CHECKS EXERCISE PRODUCTION'S RANKING. Semantic
    // matching needs pgvector, every check in this repo runs NO_PG, and without
    // this the 115 tests, 12 archetypes and red team would all validate the
    // lexical fallback while production ranked on embeddings -- the exact shape
    // of the award-median defect, where production ranked on a statistic no test
    // ever used.
    //
    // Keyed by the description itself, generated by scripts/emit_semantic_cache.ts
    // from the archetype and red-team profiles. A description not in the cache
    // still returns empty and falls through to the lexical index, which is the
    // honest degradation for a real founder on a cold fallback.
    const hit = loadSemanticCache()[desc];
    if (!hit) return new Map();
    if (hit.separation !== undefined) separation.set(desc, hit.separation);
    return new Map(Object.entries(hit.scores));
  }

  const out = new Map<string, number>();
  try {
    const vec = await embedQuery(desc);
    if (!vec) return out;
    const { Client } = await import("pg");
    const client = new Client({ connectionString: url, connectionTimeoutMillis: 3000 });
    await client.connect();
    try {
      await client.query("SET statement_timeout = 3000");
      // pgvector wants the literal '[a,b,c]' form, not a JS array.
      const literal = `[${vec.join(",")}]`;
      // Score EVERY profile, not a top-K slice. instrument_profiles holds one
      // row per instrument (322 of them), so a LIMIT here was truncating a
      // table small enough to rank whole — and an instrument left out scores
      // zero, which is indistinguishable from "thematically wrong". That is
      // how selectLeafInstruments ended up ordering the Horizon partnership
      // and IPCEI buckets by raw event count: no leaf in them made the global
      // top 40, so Clean Aviation went to an AI lab and a freight platform,
      // and the Innovative Health Initiative to a govtech company. Ranking all
      // 322 is a single scan of a tiny table and costs nothing measurable.
      const res = await client.query(
        `SELECT instrument_id, 1 - (embedding <=> $1::vector) AS similarity
           FROM instrument_profiles
          ORDER BY embedding <=> $1::vector`,
        [literal],
      );
      const rows = res.rows as { instrument_id: string; similarity: string | number }[];
      const scores = rows.map((r) => ({ id: r.instrument_id, s: Number(r.similarity) }));
      // ── Normalise by RANK, not by the best score ─────────────────────────
      // Cosine similarities here occupy a very narrow band: measured across
      // the whole corpus for one query, 0.275 to 0.466, mean 0.365, sd 0.034.
      // Dividing by the best match maps that band onto 0.59-1.00, so the
      // WORST-matching instrument in Europe still scored 0.59 and a fund
      // ranked 273rd of 327 scored 0.71 — nearly indistinguishable from the
      // 150th at 0.79. Against a 0.20 weight in the fit score, the difference
      // between the best thematic match and an irrelevant one came to about
      // 0.06 of the final number, which is why structural components decided
      // the ranking and thematically wrong funds kept reaching the table.
      //
      // Percentile rank uses the full 0-1 range by construction and does not
      // care how narrow the band is. It is also distribution-free, so it
      // cannot be broken by a query whose similarities happen to cluster
      // differently — which best-normalisation silently was.
      //
      // What it DOES destroy is how peaked this particular query was, and that
      // is a signal the ranker needs: it is the difference between a founder
      // who described a project and one we have only a sector template for.
      // Captured here, before the shape is thrown away. See `separation`.
      const sep = separationOf(scores.map((s) => s.s));
      if (sep !== undefined) separation.set(desc, sep);
      //
      // The rows arrive ordered by distance, so the index IS the rank.
      const n = scores.length;
      if (n === 1) {
        out.set(scores[0].id, 1);
      } else {
        for (let i = 0; i < n; i += 1) {
          out.set(scores[i].id, (n - 1 - i) / (n - 1));
        }
      }
    } finally {
      await client.end();
    }
  } catch (err) {
    console.error("semantic fund match failed, falling back to lexical:", err);
    return new Map();
  }
  cache.set(desc, out);
  return out;
}
