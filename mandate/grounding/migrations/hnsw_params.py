"""Which HNSW build parameters grounding's halfvec index uses: measured, not assumed.

    python3 mandate/grounding/migrations/hnsw_params.py --source-url "$POLICY_URL"

Read-only against production (one COPY of policy's current vectors); every
index is built on an ephemeral local Postgres (mandate.grounding.testing),
which is dropped at the end. No paid call: the 20 queries are 20 real passage
vectors, chosen by a fixed hash and HELD OUT of the index, so each is a query
the index has never seen and its exact top 10 is computed by a full scan.

WHAT IS MEASURED, AND WHY IT TRANSFERS TO PRODUCTION
  recall@10   on the full-precision vector(1024)s. halfvec rounds each
              coordinate to fp16 (relative error ~5e-4 on a normalised
              1024-d vector), far below the distance gaps that decide a
              graph edge, so the m/ef_construction comparison carries over.
  index size  on vector(512)s cut from the same vectors. A vector(512) is
              4*512+8 = 2,056 bytes, byte for byte the size of a
              halfvec(1024) (2*1024+8), and pgvector's HNSW page layout
              depends only on that width and on m. pgvector 0.6 (the local
              server) has no halfvec; this is the exact stand-in for its size.
Pick: the smallest index whose recall@10 is within 1 point of m=16,
ef_construction=64 (pgvector's default, what production has today).
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

CONFIGS = [(16, 64), (16, 48), (12, 64), (12, 48)]
N_QUERIES, K = 20, 10
EF_SEARCH = (40, 200)   # pgvector's default, and what policy's connections set
CORPUS = """
  SELECT p.id, p.embedding FROM policy.passages p
   WHERE p.embedding IS NOT NULL
     AND p.version_id IN (SELECT min(id) FROM policy.document_versions GROUP BY content_hash)
     AND EXISTS (SELECT 1 FROM policy.document_versions v WHERE v.id = p.version_id AND v.is_current)
"""


def run(source_url: str, limit: int | None, log=print) -> dict:
    from mandate.grounding.testing import EphemeralMandate  # noqa: PLC0415
    out: dict = {"configs": []}
    with EphemeralMandate() as db, \
            psycopg.connect(source_url, options="-c default_transaction_read_only=on") as src, \
            psycopg.connect(db.admin_url, autocommit=True) as dst:
        dst.execute("CREATE TABLE b (id bigint PRIMARY KEY, e public.vector(1024) NOT NULL)")
        sql = CORPUS + (f" ORDER BY md5(p.id::text) LIMIT {int(limit)}" if limit else "")
        t = time.time()
        with src.cursor().copy(f"COPY ({sql}) TO STDOUT (FORMAT binary)") as cin, \
                dst.cursor().copy("COPY b (id, e) FROM STDIN (FORMAT binary)") as cout:
            for chunk in cin:
                cout.write(chunk)
        dst.execute(f"""CREATE TABLE q AS SELECT * FROM b ORDER BY md5('q' || id::text) LIMIT {N_QUERIES}""")
        dst.execute("DELETE FROM b WHERE id IN (SELECT id FROM q)")
        # the size stand-in: the same rows at 2,056 bytes each (see module doc)
        dst.execute("CREATE TABLE b512 AS SELECT id, ((e::real[])[1:512])::public.vector(512) AS e FROM b")
        dst.execute("VACUUM ANALYZE b")
        dst.execute("VACUUM ANALYZE b512")
        n = dst.execute("SELECT count(*) FROM b").fetchone()[0]
        out["indexed_vectors"], out["queries"] = n, N_QUERIES
        log(f"{n:,} vectors copied in {time.time() - t:.0f}s; {N_QUERIES} held-out queries")
        qs = dst.execute("SELECT id, e::text FROM q ORDER BY id").fetchall()
        dst.execute("SET enable_indexscan = off")
        truth = {qid: [r[0] for r in dst.execute(
            "SELECT id FROM b ORDER BY e <=> %s::public.vector LIMIT %s", (qe, K))] for qid, qe in qs}
        dst.execute("RESET enable_indexscan")
        dst.execute("SET max_parallel_maintenance_workers = 0")   # production builds serially
        dst.execute("SET maintenance_work_mem = '2GB'")
        for m, efc in CONFIGS:
            row: dict = {"m": m, "ef_construction": efc}
            with_ = f"WITH (m = {m}, ef_construction = {efc})"
            t = time.time()
            dst.execute(f"CREATE INDEX ix ON b USING hnsw (e public.vector_cosine_ops) {with_}")
            row["build_s_vector1024"] = round(time.time() - t, 1)
            for ef in EF_SEARCH:
                dst.execute(f"SET hnsw.ef_search = {ef}")
                hits = 0
                for qid, qe in qs:
                    got = [r[0] for r in dst.execute(
                        "SELECT id FROM b ORDER BY e <=> %s::public.vector LIMIT %s", (qe, K))]
                    hits += len(set(got) & set(truth[qid]))
                row[f"recall@10_ef{ef}"] = round(hits / (K * len(qs)), 4)
            plan = dst.execute("EXPLAIN SELECT id FROM b ORDER BY e <=> %s::public.vector LIMIT 10",
                               (qs[0][1],)).fetchall()
            row["uses_index"] = any("Index Scan using ix" in r[0] for r in plan)
            dst.execute("DROP INDEX ix")
            t = time.time()
            dst.execute(f"CREATE INDEX ix512 ON b512 USING hnsw (e public.vector_cosine_ops) {with_}")
            row["build_s_2056B"] = round(time.time() - t, 1)
            size = dst.execute("SELECT pg_relation_size('ix512')").fetchone()[0]
            row["halfvec_index_bytes"] = size
            row["halfvec_bytes_per_vector"] = round(size / n, 1)
            dst.execute("DROP INDEX ix512")
            log(json.dumps(row))
            out["configs"].append(row)
    base = out["configs"][0]
    ok = [c for c in out["configs"]
          if c["recall@10_ef40"] >= base["recall@10_ef40"] - 0.01
          and c["recall@10_ef200"] >= base["recall@10_ef200"] - 0.01]
    pick = min(ok, key=lambda c: (c["halfvec_index_bytes"], -c["m"], -c["ef_construction"]))
    out["pick"] = {"m": pick["m"], "ef_construction": pick["ef_construction"]}
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source-url", required=True, help="policy database URL (read-only use)")
    ap.add_argument("--limit", type=int, help="copy only this many vectors (a quick look; the "
                                              "recorded measurement uses all of them)")
    a = ap.parse_args()
    out = run(a.source_url, a.limit)
    print(json.dumps(out, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
