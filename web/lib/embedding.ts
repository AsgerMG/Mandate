// The TypeScript side of mandate/embedding: the ONLY place this app names an
// embedding model or calls an embeddings API.
//
// WHY. A query must be embedded by the model its table was embedded with, or it
// retrieves noise that looks like a result. semantic.ts and demandRetrieval.ts
// each hard-coded the model and the endpoint; the Python embedders hard-coded
// theirs; nothing tied the four together. Now `embedQuery(text, table)` looks the
// table up in SPEC.stored, which is GENERATED from mandate/embedding/spaces.json
// (the block below), and `python3 mandate/embedding/check_boundary.py` fails the
// build if this block drifts from that file or if any other file in the repo
// names a model or the endpoint.
//
// When a table is re-embedded (mandate/ops/one_model.sh),
// spaces.json's `stored` flips, --write regenerates this block, and every query
// here follows with no code change.
//
// KEY: VOYAGE_KEY only, deliberately not VOYAGE_API_KEY too. The spend
// interlock and the hermetic tests delete VOYAGE_KEY to guarantee a run cannot
// spend; a second accepted name would be a way round them.

// BEGIN GENERATED from mandate/embedding/spaces.json by check_boundary.py --write. Do not edit.
export const SPEC = {
  "model": "voyage-4-large",
  "dim": 1024,
  "queryModel": "voyage-4-large",
  "spaces": {
    "voyage-4-large": {
      "provider": "voyage",
      "dim": 1024,
      "input_type": false,
      "price_per_mtok_usd": 0.12,
      "max_request_tokens": 120000,
      "status": "target"
    },
    "voyage-3.5": {
      "provider": "voyage",
      "dim": 1024,
      "input_type": true,
      "price_per_mtok_usd": 0.06,
      "max_request_tokens": 320000,
      "status": "legacy"
    },
    "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2": {
      "provider": "local",
      "dim": 384,
      "input_type": false,
      "price_per_mtok_usd": 0.0,
      "max_request_tokens": 0,
      "status": "legacy"
    }
  },
  "stored": {
    "grounding.passage_embeddings": "voyage-4-large",
    "policy.passages": "voyage-4-large",
    "capital.eligibility_embeddings": "voyage-4-large",
    "capital.instrument_profiles": "voyage-4-large",
    "capital.signals_chunk_embeddings": "voyage-4-large"
  },
  "vectorColumns": {
    "grounding.passage_embeddings": {
      "voyage-4-large": {
        "column": "embedding",
        "type": "halfvec"
      }
    },
    "policy.passages": {
      "voyage-4-large": {
        "column": "embedding",
        "type": "vector"
      }
    },
    "capital.eligibility_embeddings": {
      "voyage-3.5": {
        "column": "embedding",
        "type": "vector"
      },
      "voyage-4-large": {
        "column": "embedding_v4",
        "type": "halfvec"
      }
    },
    "capital.instrument_profiles": {
      "voyage-3.5": {
        "column": "embedding",
        "type": "vector"
      },
      "voyage-4-large": {
        "column": "embedding_v4",
        "type": "halfvec"
      }
    },
    "capital.signals_chunk_embeddings": {
      "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2": {
        "column": "embedding",
        "type": "vector"
      },
      "voyage-4-large": {
        "column": "embedding_v4",
        "type": "halfvec"
      }
    }
  }
} as const;
// END GENERATED

export type StoredTable = keyof typeof SPEC.stored;
export type SpaceName = keyof typeof SPEC.spaces;

export const MODEL: SpaceName = SPEC.model;
export const DIM: number = SPEC.dim;
const ENDPOINT = "https://api.voyageai.com/v1/embeddings";

/** The space a stored table's vectors are in. */
export function spaceFor(table: StoredTable): SpaceName {
  return SPEC.stored[table] as SpaceName;
}

/**
 * Where `table` keeps its STORED space's vectors: the column a query must read
 * and the cast its literal must carry. During a re-embed a table holds two
 * spaces side by side (mandate/ops/one_model.sh); flipping spaces.json `stored`
 * moves the query model AND this column in the same generated block, so a
 * query can never be embedded in one space and compared against the other.
 */
export function vectorColumn(table: StoredTable): { column: string; cast: string } {
  const byspace = SPEC.vectorColumns[table] as Record<string, { column: string; type: string }>;
  const c = byspace[spaceFor(table)];
  if (!c) throw new Error(`embedding: ${table} has no column for ${spaceFor(table)} in spaces.json`);
  return { column: c.column, cast: `::${c.type}` };
}

/** '[a,b,c]': what `$1::vector` and `$1::halfvec` both parse. */
export function vectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

export interface EmbedQueryOptions {
  /** Abort after this long; the memo pipeline must not hang on a vector call. */
  timeoutMs?: number;
  /** Truncate the query text first (Voyage truncates too; this bounds the payload). */
  maxChars?: number;
  /** Log failures to stderr. Off where a failure is an expected, silent fallback. */
  log?: boolean;
}

/**
 * Embed a QUERY against `table`, in the space that table is stored in.
 * Returns null on any failure (no key, HTTP error, timeout, local-only space),
 * so every caller keeps its offline fallback; a failure is never thrown.
 */
export async function embedQuery(
  text: string, table: StoredTable, opts: EmbedQueryOptions = {},
): Promise<number[] | null> {
  const key = process.env.VOYAGE_KEY;
  if (!key) return null;
  const name = spaceFor(table);
  const space = SPEC.spaces[name];
  if (space.provider !== "voyage") return null;  // a local space has no HTTP query path here
  const input = opts.maxChars ? text.slice(0, opts.maxChars) : text;
  const body: Record<string, unknown> = { input: [input], model: name, output_dimension: space.dim };
  // input_type "query" is not cosmetic where the space uses it: Voyage places
  // queries and documents at deliberately different positions.
  if (space.input_type) body.input_type = "query";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 6000);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      if (opts.log) console.error("embedding: query failed:", res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const json = (await res.json()) as { data?: { embedding?: number[] }[] };
    const vec = json.data?.[0]?.embedding ?? null;
    if (vec && vec.length !== space.dim) {
      if (opts.log) console.error(`embedding: ${name} returned ${vec.length} dims, expected ${space.dim}`);
      return null;
    }
    return vec;
  } catch (err) {
    if (opts.log) console.error("embedding: query error:", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
