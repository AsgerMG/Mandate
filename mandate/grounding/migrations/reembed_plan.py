"""Migration (c): the re-embedding plan. Every stored vector table onto MODEL, as halfvec.

    python3 mandate/grounding/migrations/reembed_plan.py \
        --capital-url "$CAPITAL_RO_DATABASE_URL" --policy-url "$POLICY_URL"

Read-only. Prints, per table in mandate/embedding/spaces.json `stored`: rows,
the model the rows say they are in, the text that would be embedded, the token
estimate (chars/4: Voyage bills what its tokenizer counts, which the run's
Usage reports exactly), the cost at MODEL's price, today's size and the size as
halfvec, and the exact steps. No vector is computed, nothing is called.

THE STEPS FOR A TABLE IN A LEGACY SPACE (capital's three), so nothing is lost
and no reader ever sees a half-built index:
  1. CREATE <table>_v4 beside it: same natural key, `embedding halfvec(1024)`,
     `model` NOT NULL, HNSW (halfvec_cosine_ops). The old table is not touched.
  2. Embed every row's text with mandate.embedding.Embedder(MODEL) into _v4
     (resumable by anti-join on the natural key, per-batch commit, Usage line).
  3. Check: _v4 row count == old row count, and a recall spot-check (the
     funnel instrument, `npm run stages`) on _v4 before any reader moves.
  4. Flip spaces.json `stored[<table>]` to MODEL and point the reader at _v4
     (one commit; check_boundary.py regenerates the TS mirror). Readers follow.
  5. Only after a release on _v4: the legacy space entry is deleted from
     spaces.json, and the old table is archived (pg_dump), not dropped unread.

POLICY needs no re-embed: its vectors are already voyage-4-large. Migration (a)
casts them into grounding.passage_embeddings as halfvec (vector::halfvec is a
pgvector cast, no API call), and the size saving below is that cast's.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from mandate.embedding import DIM, MODEL, SPACES, STORED, estimate_cost_usd  # noqa: E402

#: How to read each table: (schema, which URL, row SQL giving count + model, text-length SQL)
TABLES = {
    "capital.eligibility_embeddings": ("capital",
        "SELECT count(*), string_agg(DISTINCT model, ',') FROM eligibility_embeddings",
        "SELECT coalesce(sum(length(chunk_text)), 0) FROM eligibility_embeddings"),
    "capital.instrument_profiles": ("capital",
        "SELECT count(*), string_agg(DISTINCT model, ',') FROM instrument_profiles",
        "SELECT coalesce(sum(length(profile_text)), 0) FROM instrument_profiles"),
    "capital.signals_chunk_embeddings": ("capital",
        "SELECT count(*), (SELECT model FROM signals_embedding_meta WHERE id = 1) FROM signals_chunk_embeddings",
        "SELECT coalesce(sum(length(c.chunk_text)), 0) FROM signals_chunk_embeddings e "
        "JOIN signals_article_chunks c ON c.id = e.chunk_id"),
    "policy.passages": ("policy",
        "SELECT count(embedding), 'voyage-4-large (per spaces.json; no model column)' FROM policy.passages",
        "SELECT coalesce(sum(length(text)) FILTER (WHERE embedding IS NOT NULL), 0) FROM policy.passages"),
}


def _bytes_per_vec(dim: int, half: bool) -> int:
    return (2 if half else 4) * dim + 8


def plan(urls: dict[str, str]) -> list[dict]:
    out = []
    conns = {k: psycopg.connect(v, options="-c default_transaction_read_only=on") for k, v in urls.items() if v}
    try:
        for table, (schema, rows_sql, text_sql) in TABLES.items():
            if schema not in conns:
                out.append({"table": table, "skipped": f"no --{schema}-url"})
                continue
            c = conns[schema]
            n, models = c.execute(rows_sql).fetchone()
            chars = int(c.execute(text_sql).fetchone()[0])
            size = c.execute("SELECT pg_total_relation_size(%s)", (table,)).fetchone()[0]
            space = SPACES[STORED[table]]
            needs = space.name != MODEL
            tokens = chars // 4
            out.append({
                "table": table, "rows": n, "stored_space": space.name, "rows_say": models,
                "dim_now": space.dim, "reembed": needs,
                "chars": chars, "tokens_est": tokens if needs else 0,
                "cost_usd_est": round(estimate_cost_usd(tokens, MODEL), 4) if needs else 0.0,
                "size_now_bytes": size,
                "vector_bytes_now": n * _bytes_per_vec(space.dim, False),
                "vector_bytes_halfvec": n * _bytes_per_vec(DIM, True),
            })
    finally:
        for c in conns.values():
            c.close()
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--capital-url")
    ap.add_argument("--policy-url")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    rows = plan({"capital": a.capital_url, "policy": a.policy_url})
    if a.json:
        print(json.dumps(rows, indent=2))
        return 0
    print(f"DRY RUN: re-embedding plan onto {MODEL} ({DIM}-d halfvec). Read-only; no API call.\n")
    tot_tokens = tot_cost = 0
    for r in rows:
        if "skipped" in r:
            print(f"  {r['table']}: skipped ({r['skipped']})")
            continue
        tot_tokens += r["tokens_est"]
        tot_cost += r["cost_usd_est"]
        what = (f"RE-EMBED {r['stored_space']} -> {MODEL}" if r["reembed"]
                else "already MODEL: cast to halfvec only (migration a), no API call")
        print(f"  {r['table']}")
        print(f"     {r['rows']:>9,} vectors  stored in {r['stored_space']} (rows say: {r['rows_say']})  {r['dim_now']}-d")
        print(f"     {what}")
        if r["reembed"]:
            print(f"     text {r['chars']:,} chars ~ {r['tokens_est']:,} tokens ~ ${r['cost_usd_est']:.4f}")
        print(f"     table now {r['size_now_bytes'] / 1e6:,.1f} MB; raw vectors "
              f"{r['vector_bytes_now'] / 1e6:,.1f} MB -> {r['vector_bytes_halfvec'] / 1e6:,.1f} MB as halfvec(1024)")
    print(f"\n  TOTAL re-embed: ~{tot_tokens:,} tokens, ~${tot_cost:.2f} at ${SPACES[MODEL].price_per_mtok_usd}/M "
          f"(inside Voyage's 200M free tokens per account for the 4 series, if unspent)")
    print("  Order: (a) policy cast first (no cost, biggest saving); then capital tables one at a time per the"
          " five steps in this file's docstring; signals last (its space changes dim 384 -> 1024).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
