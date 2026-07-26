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

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const MODEL = "voyage-3.5";
/** Keep the whole path bounded: this runs inside the memo pipeline, which is
 *  already slow, but must not hang it. */
const TIMEOUT_MS = 6000;

/** Per-invocation memo: the same description is matched once per warm lambda,
 *  not once per pipeline stage that asks. */
const cache = new Map<string, Map<string, number>>();

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
  if (!desc || desc.length < 12) return new Map();
  const cached = cache.get(desc);
  if (cached) return cached;

  const url = process.env.DATABASE_URL;
  if (!url) return new Map();

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
      const res = await client.query(
        `SELECT instrument_id, 1 - (embedding <=> $1::vector) AS similarity
           FROM instrument_profiles
          ORDER BY embedding <=> $1::vector
          LIMIT 40`,
        [literal],
      );
      const rows = res.rows as { instrument_id: string; similarity: string | number }[];
      const scores = rows.map((r) => ({ id: r.instrument_id, s: Number(r.similarity) }));
      const best = Math.max(...scores.map((r) => r.s), 0);
      // Normalise to the best match, like relevance.ts, so the two signals are
      // interchangeable to callers. Absolute cosine values sit in a narrow band
      // (~0.39-0.62 across tested domains) and are not meaningful on their own.
      for (const { id, s } of scores) out.set(id, best > 0 ? s / best : 0);
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
