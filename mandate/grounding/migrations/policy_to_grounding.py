"""Migration (a): policy's documents, versions and passages into schema grounding.

    # what it would do, read from production, nothing written (default)
    python3 mandate/grounding/migrations/policy_to_grounding.py --source-url "$POLICY_URL"

    # do it for real on a throwaway copy: a production SAMPLE loaded into an
    # ephemeral Postgres, migrated, and every invariant checked
    python3 mandate/grounding/migrations/policy_to_grounding.py --source-url "$POLICY_URL" --rehearse

    # production: the admin, after review. Writes the bucket upload manifest.
    python3 mandate/grounding/migrations/policy_to_grounding.py --admin-url "$ADMIN_URL" --apply \
        --manifest grounding_manifest_policy.jsonl

WHAT MOVES, AND WHAT DOES NOT. Grounding receives the SOURCE record: one
document per canonical URL, one version per distinct text (sha256), one fetch
row per policy version (so every fetch date survives the dedupe), the passages,
and their vectors as halfvec. Policy KEEPS everything brain-specific
(documents' type/lifecycle/dates, enrichments, actors, is_current) and gains
three link tables (Alembic revision e41c0a7b9d10). Nothing in schema policy is
updated or deleted: this migration only inserts. Retiring policy.passages'
vector column is a separate, later step (see the report), taken only once the
policy API reads grounding.

IDS ARE PRESERVED for every non-duplicate row, so enrichments.citations
({"passage_ids": [...]}) and document_actor.passage_id stay valid untouched.
A duplicate version (same sha256 as a lower-id version, 73 of them on
2026-11-06: the same act ingested by two adapters) maps onto the surviving
version, and its passages onto the survivor's passages ordinal for ordinal --
after checking their texts are identical, which they are (the dry run counts it).

SPANS ARE MADE EXACT. 28,816 policy passages carry a char_end one past their
text (the chunker stripped a trailing character after recording the span). In
grounding a passage's text IS version.text[char_start:char_end], so the span is
recomputed from where the passage text actually sits. The dry run reports how
many spans were exact, shifted at the end, or relocated, and refuses if any
passage text cannot be found in its version at all.

WHY THE ORIGINAL BYTES ARE TEXT. Policy never kept the HTML/XML it fetched,
only the normalised text, and its content_hash is sha256 of that text's UTF-8
(verified on all 11,544 versions). So the object uploaded for each version is
exactly those bytes, its sha256 is policy's content_hash, and `extractor` says
plainly that the original markup was not retained. From the cutover on, policy
stores the fetched bytes themselves through mandate.grounding.fetch().
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from mandate.embedding import STORED  # noqa: E402
from mandate.grounding.store import canonical_url  # noqa: E402

CHUNKER = "policy.chunking.v1"
MODEL = STORED["policy.passages"]
WHO = "migration:policy_to_grounding"


def _ro(url: str) -> psycopg.Connection:
    c = psycopg.connect(url, options="-c default_transaction_read_only=on -c search_path=policy,public")
    c.execute("SET TRANSACTION READ ONLY")
    return c


def doc_urls(src) -> list[tuple[int, str, str]]:
    """(policy document id, canonical url, source key). A document with no URL gets
    a stable urn from its adapter's external id (none on 2026-11-06)."""
    rows = src.execute("SELECT d.id, d.url, s.key, d.external_id FROM policy.documents d "
                       "JOIN policy.sources s ON s.id = d.source_id ORDER BY d.id").fetchall()
    out = []
    for did, url, key, ext in rows:
        try:
            cu = canonical_url(url) if url else None
        except ValueError:
            cu = None
        out.append((did, cu or f"urn:mandate:policy:{key}:{ext}", key))
    return out


# ── the plan: read-only SQL against the source ──────────────────────────────
SPAN_CASES = """
  SELECT
    count(*) FILTER (WHERE substr(v.text, p.char_start + 1, p.char_end - p.char_start) = p.text) AS exact,
    count(*) FILTER (WHERE substr(v.text, p.char_start + 1, p.char_end - p.char_start) <> p.text
                       AND substr(v.text, p.char_start + 1, length(p.text)) = p.text)        AS end_shifted,
    count(*) FILTER (WHERE substr(v.text, p.char_start + 1, length(p.text)) <> p.text
                       AND strpos(v.text, p.text) > 0)                                       AS relocated,
    count(*) FILTER (WHERE substr(v.text, p.char_start + 1, length(p.text)) <> p.text
                       AND strpos(substr(v.text, greatest(p.char_start - 256, 0) + 1), p.text) = 0
                       AND strpos(v.text, p.text) > 0)                                       AS relocated_far,
    count(*) FILTER (WHERE substr(v.text, p.char_start + 1, length(p.text)) <> p.text
                       AND strpos(v.text, p.text) = 0)                                       AS not_found
  FROM policy.passages p JOIN policy.document_versions v ON v.id = p.version_id
"""


def plan(src) -> dict:
    q = lambda s: src.execute(s).fetchone()  # noqa: E731
    urls = doc_urls(src)
    p: dict = {}
    p["sources"] = q("SELECT count(*) FROM policy.sources")[0]
    p["policy_documents"] = len(urls)
    p["grounding_documents"] = len({u for _, u, _ in urls})
    p["documents_sharing_a_url"] = p["policy_documents"] - p["grounding_documents"]
    p["documents_without_url_urn"] = sum(1 for _, u, _ in urls if u.startswith("urn:"))
    n, distinct, groups, surplus = q("""
        SELECT count(*), count(DISTINCT content_hash),
               (SELECT count(*) FROM (SELECT 1 FROM policy.document_versions GROUP BY content_hash HAVING count(*) > 1) g),
               count(*) - count(DISTINCT content_hash) FROM policy.document_versions""")
    p["policy_versions"] = n
    p["grounding_versions"] = distinct
    p["duplicate_groups"] = groups
    p["duplicate_versions_folded"] = surplus
    p["hash_is_sha256_of_text"] = q("""SELECT count(*) FILTER (WHERE content_hash =
        encode(sha256(convert_to(text, 'UTF8')), 'hex')) FROM policy.document_versions""")[0]
    p["fetch_rows"] = n
    tot, canon_p = q("""
        WITH c AS (SELECT min(id) AS id FROM policy.document_versions GROUP BY content_hash)
        SELECT count(*), count(*) FILTER (WHERE p.version_id IN (SELECT id FROM c)) FROM policy.passages p""")
    p["policy_passages"] = tot
    p["grounding_passages"] = canon_p
    p["passages_remapped_to_survivor"] = tot - canon_p
    p["remapped_passages_text_differs"] = q("""
        WITH v AS (SELECT id, content_hash, min(id) OVER (PARTITION BY content_hash) AS canon FROM policy.document_versions)
        SELECT count(*) FROM policy.passages p JOIN v ON v.id = p.version_id AND v.id <> v.canon
        LEFT JOIN policy.passages s ON s.version_id = v.canon AND s.ordinal = p.ordinal
        WHERE s.id IS NULL OR s.text <> p.text""")[0]
    ex, sh, rel, far, nf = q(SPAN_CASES)
    p["spans_exact"], p["spans_end_shifted"], p["spans_relocated"] = ex, sh, rel
    p["spans_relocated_beyond_window"], p["spans_not_found"] = far, nf
    emb, null = q("""
        WITH c AS (SELECT min(id) AS id FROM policy.document_versions GROUP BY content_hash)
        SELECT count(*) FILTER (WHERE embedding IS NOT NULL AND version_id IN (SELECT id FROM c)),
               count(*) FILTER (WHERE embedding IS NULL) FROM policy.passages""")
    p["embeddings_to_halfvec"] = emb
    p["passages_without_embedding"] = null
    p["embedding_model"] = MODEL
    p["upload_objects"] = distinct
    p["upload_bytes"] = q("""SELECT sum(octet_length(convert_to(text, 'UTF8'))) FROM policy.document_versions
                             WHERE id IN (SELECT min(id) FROM policy.document_versions GROUP BY content_hash)""")[0]
    p["max_version_id"], p["max_passage_id"] = q(
        "SELECT (SELECT max(id) FROM policy.document_versions), (SELECT max(id) FROM policy.passages)")
    sizes = src.execute("""
        SELECT pg_total_relation_size('policy.passages'),
               pg_relation_size('policy.ix_passages_embedding_hnsw'),
               pg_total_relation_size('policy.document_versions')""").fetchone()
    p["policy_passages_bytes"], p["policy_hnsw_bytes"], p["policy_versions_bytes"] = sizes
    return p


def estimate(p: dict) -> dict:
    """What grounding will weigh. ESTIMATES, labelled as such: pgvector stores a
    vector at 4 bytes/dim + 8 and a halfvec at 2 bytes/dim + 8; HNSW elements hold
    the vector plus a neighbour list (~m*2*6 bytes at layer 0 for m=16) and the
    index's page fill ratio is taken from the live index."""
    n = p["embeddings_to_halfvec"]
    vec, half = 4 * 1024 + 8, 2 * 1024 + 8
    neigh = 16 * 2 * 6 + 64
    live_per = p["policy_hnsw_bytes"] / max(1, n + p["passages_remapped_to_survivor"])
    fill = live_per / (vec + neigh)
    hnsw_half = int(n * (half + neigh) * fill)
    emb_heap = int(n * (half + 8 + 24 + 16 + 8))
    return {"hnsw_halfvec_bytes_est": hnsw_half,
            "hnsw_saving_bytes_est": p["policy_hnsw_bytes"] - hnsw_half,
            "passage_embeddings_heap_bytes_est": emb_heap,
            "vector_storage_saving_bytes_est": int(n * (vec - half)),
            "note": "estimates: measured sizes come from the rehearsal on a pgvector>=0.7 server and from production after --apply"}


# ── the write: one transaction, inserts only ────────────────────────────────
def apply(admin, *, half: str = "halfvec", log=print) -> dict:
    """Migrate. `admin` must be able to read schema policy and insert into
    grounding (the database admin). Returns the post-checks. Raises -- and the
    caller rolls back -- if any invariant fails."""
    t0 = time.time()
    x = admin.execute
    x("SET LOCAL search_path = policy, public")
    x("SET LOCAL maintenance_work_mem = '1GB'")
    urls = doc_urls(admin)
    x("CREATE TEMP TABLE m_doc (pdoc_id int PRIMARY KEY, curl text NOT NULL, source_key text NOT NULL) ON COMMIT DROP")
    with admin.cursor().copy("COPY m_doc (pdoc_id, curl, source_key) FROM STDIN") as cp:
        for row in urls:
            cp.write_row(row)
    x("""CREATE TEMP TABLE m_ver ON COMMIT DROP AS
         SELECT v.id AS pv_id, v.document_id AS pdoc_id, v.content_hash,
                min(v.id) OVER (PARTITION BY v.content_hash) AS canon_id,
                min(v.fetched_at) OVER (PARTITION BY v.content_hash) AS first_seen
           FROM policy.document_versions v""")
    log("  sources")
    x("""INSERT INTO grounding.sources (key, name, base_url, created_by)
         SELECT 'policy.' || key, name, base_url, %s FROM policy.sources
         ON CONFLICT (key) DO NOTHING""", (WHO,))
    log("  documents")
    x("""INSERT INTO grounding.documents (canonical_url, source_id, title, publisher, kind, created_by)
         SELECT DISTINCT ON (m.curl) m.curl, gs.id, d.title, s.name, d.document_type::text, %s
           FROM m_doc m JOIN policy.documents d ON d.id = m.pdoc_id
           JOIN policy.sources s ON s.id = d.source_id
           JOIN grounding.sources gs ON gs.key = 'policy.' || s.key
          ORDER BY m.curl, m.pdoc_id
         ON CONFLICT (canonical_url) DO NOTHING""", (WHO,))
    x("""INSERT INTO policy.grounding_document_link (policy_document_id, grounding_document_id)
         SELECT m.pdoc_id, gd.id FROM m_doc m JOIN grounding.documents gd ON gd.canonical_url = m.curl
         ON CONFLICT DO NOTHING""")
    log("  versions")
    x("""INSERT INTO grounding.document_versions
           (id, document_id, fetched_at, sha256, mime, byte_size, bucket_key, text, extractor, created_by)
         SELECT v.id, dl.grounding_document_id, m.first_seen, v.content_hash, 'text/plain; charset=utf-8',
                octet_length(convert_to(v.text, 'UTF8')),
                'sha256/' || substr(v.content_hash, 1, 2) || '/' || v.content_hash,
                v.text, 'policy:' || v.raw_format || '->normalised text (original bytes not retained)', %s
           FROM m_ver m JOIN policy.document_versions v ON v.id = m.pv_id AND m.pv_id = m.canon_id
           JOIN policy.grounding_document_link dl ON dl.policy_document_id = v.document_id
         ON CONFLICT DO NOTHING""", (WHO,))
    x("""INSERT INTO policy.grounding_version_link (policy_version_id, grounding_version_id)
         SELECT m.pv_id, gv.id FROM m_ver m JOIN grounding.document_versions gv ON gv.sha256 = m.content_hash
         ON CONFLICT DO NOTHING""")
    log("  fetches")
    x("""INSERT INTO grounding.fetches (document_id, version_id, fetched_at, fetched_by)
         SELECT dl.grounding_document_id, vl.grounding_version_id, v.fetched_at, %s
           FROM policy.document_versions v
           JOIN policy.grounding_document_link dl ON dl.policy_document_id = v.document_id
           JOIN policy.grounding_version_link vl ON vl.policy_version_id = v.id
         ON CONFLICT DO NOTHING""", (WHO,))
    log("  passages (spans made exact)")
    x("""INSERT INTO grounding.passages
           (id, version_id, chunker, ordinal, char_start, char_end, heading, text, token_count)
         SELECT p.id, vl.grounding_version_id, %s, p.ordinal, s.cs, s.cs + length(p.text),
                p.heading, p.text, p.token_count
           FROM policy.passages p
           JOIN m_ver m ON m.pv_id = p.version_id AND m.pv_id = m.canon_id
           JOIN policy.document_versions v ON v.id = p.version_id
           JOIN policy.grounding_version_link vl ON vl.policy_version_id = p.version_id
           CROSS JOIN LATERAL (SELECT greatest(p.char_start - 256, 0) AS w) win
           CROSS JOIN LATERAL (SELECT CASE
                WHEN substr(v.text, p.char_start + 1, length(p.text)) = p.text THEN p.char_start
                -- nearest occurrence at or after a window before the recorded start, so a
                -- boilerplate paragraph repeated earlier in the act is not chosen instead
                WHEN strpos(substr(v.text, win.w + 1), p.text) > 0
                     THEN win.w + strpos(substr(v.text, win.w + 1), p.text) - 1
                ELSE strpos(v.text, p.text) - 1 END AS cs) s
         ON CONFLICT DO NOTHING""", (CHUNKER,))
    x("""INSERT INTO policy.grounding_passage_link (policy_passage_id, grounding_passage_id)
         SELECT p.id, gp.id FROM policy.passages p
           JOIN policy.grounding_version_link vl ON vl.policy_version_id = p.version_id
           JOIN grounding.passages gp ON gp.version_id = vl.grounding_version_id
                                     AND gp.chunker = %s AND gp.ordinal = p.ordinal
         ON CONFLICT DO NOTHING""", (CHUNKER,))
    log(f"  embeddings -> {half}(1024), index dropped for the bulk load and rebuilt")
    idx = "ix_gpe_hnsw_" + MODEL.replace("-", "_").replace(".", "_")
    x(f"DROP INDEX IF EXISTS grounding.{idx}")
    x(f"""INSERT INTO grounding.passage_embeddings (passage_id, model, embedding)
          SELECT DISTINCT ON (pl.grounding_passage_id) pl.grounding_passage_id, %s, p.embedding::public.{half}
            FROM policy.passages p JOIN policy.grounding_passage_link pl ON pl.policy_passage_id = p.id
           WHERE p.embedding IS NOT NULL
           ORDER BY pl.grounding_passage_id, (p.id = pl.grounding_passage_id) DESC, p.id
          ON CONFLICT DO NOTHING""", (MODEL,))
    x(f"""CREATE INDEX {idx} ON grounding.passage_embeddings
          USING hnsw (embedding public.{half}_cosine_ops) WHERE model = '{MODEL}'""")
    for t in ("sources", "documents", "document_versions", "fetches", "passages"):
        x(f"SELECT setval(pg_get_serial_sequence('grounding.{t}', 'id'), "
          f"GREATEST((SELECT max(id) FROM grounding.{t}), 1))")
    checks = verify(admin)
    checks["seconds"] = round(time.time() - t0, 1)
    bad = {k: v for k, v in checks.items() if k.startswith("violations_") and v}
    if bad:
        raise RuntimeError(f"invariants failed, rolling back: {bad}")
    return checks


def verify(con) -> dict:
    q = lambda s: con.execute(s).fetchone()[0]  # noqa: E731
    return {
        "grounding_documents": q("SELECT count(*) FROM grounding.documents"),
        "grounding_versions": q("SELECT count(*) FROM grounding.document_versions"),
        "grounding_fetches": q("SELECT count(*) FROM grounding.fetches"),
        "grounding_passages": q("SELECT count(*) FROM grounding.passages"),
        "grounding_embeddings": q("SELECT count(*) FROM grounding.passage_embeddings"),
        "violations_version_unlinked": q("""SELECT count(*) FROM policy.document_versions v
            WHERE NOT EXISTS (SELECT 1 FROM policy.grounding_version_link l WHERE l.policy_version_id = v.id)"""),
        "violations_passage_unlinked": q("""SELECT count(*) FROM policy.passages p
            WHERE NOT EXISTS (SELECT 1 FROM policy.grounding_passage_link l WHERE l.policy_passage_id = p.id)"""),
        "violations_document_unlinked": q("""SELECT count(*) FROM policy.documents d
            WHERE NOT EXISTS (SELECT 1 FROM policy.grounding_document_link l WHERE l.policy_document_id = d.id)"""),
        "violations_link_dangling": q("""SELECT
            (SELECT count(*) FROM policy.grounding_version_link l LEFT JOIN grounding.document_versions g ON g.id = l.grounding_version_id WHERE g.id IS NULL)
          + (SELECT count(*) FROM policy.grounding_passage_link l LEFT JOIN grounding.passages g ON g.id = l.grounding_passage_id WHERE g.id IS NULL)
          + (SELECT count(*) FROM policy.grounding_document_link l LEFT JOIN grounding.documents g ON g.id = l.grounding_document_id WHERE g.id IS NULL)"""),
        "violations_passage_text_not_its_span": q("""SELECT count(*) FROM grounding.passages p
            JOIN grounding.document_versions v ON v.id = p.version_id
            WHERE substr(v.text, p.char_start + 1, p.char_end - p.char_start) <> p.text"""),
        "violations_remapped_text_differs": q("""SELECT count(*) FROM policy.passages p
            JOIN policy.grounding_passage_link l ON l.policy_passage_id = p.id
            JOIN grounding.passages g ON g.id = l.grounding_passage_id WHERE g.text <> p.text"""),
        "violations_id_not_preserved": q("""SELECT count(*) FROM policy.grounding_passage_link l
            JOIN policy.passages p ON p.id = l.policy_passage_id
            JOIN policy.grounding_version_link vl ON vl.policy_version_id = p.version_id
            WHERE vl.grounding_version_id = p.version_id AND l.grounding_passage_id <> l.policy_passage_id"""),
        "violations_sha_mismatch": q("""SELECT count(*) FROM grounding.document_versions
            WHERE sha256 <> encode(sha256(convert_to(text, 'UTF8')), 'hex') AND created_by = 'migration:policy_to_grounding'"""),
        "violations_embedding_lost": q("""SELECT count(DISTINCT l.grounding_passage_id) FROM policy.passages p
            JOIN policy.grounding_passage_link l ON l.policy_passage_id = p.id
            WHERE p.embedding IS NOT NULL AND NOT EXISTS (SELECT 1 FROM grounding.passage_embeddings e
                  WHERE e.passage_id = l.grounding_passage_id)"""),
        "violations_fetch_dates_lost": q("""SELECT count(*) FROM policy.document_versions v
            JOIN policy.grounding_version_link vl ON vl.policy_version_id = v.id
            JOIN policy.grounding_document_link dl ON dl.policy_document_id = v.document_id
            WHERE NOT EXISTS (SELECT 1 FROM grounding.fetches f WHERE f.version_id = vl.grounding_version_id
                              AND f.document_id = dl.grounding_document_id AND f.fetched_at = v.fetched_at)"""),
    }


def write_manifest(con, path: Path) -> tuple[int, int]:
    """One line per object to upload. The bytes are the version's text, UTF-8;
    upload_manifest.py reads them from the row and checks the sha256 before PUT."""
    n = size = 0
    with path.open("w") as f:
        for vid, sha, key, nbytes, mime in con.execute(
                "SELECT id, sha256, bucket_key, byte_size, mime FROM grounding.document_versions "
                "WHERE created_by = %s ORDER BY id", (WHO,)):
            f.write(json.dumps({"sha256": sha, "bucket_key": key, "byte_size": nbytes, "mime": mime,
                                "bytes_from": {"grounding_version_text": vid}}) + "\n")
            n += 1
            size += nbytes
    return n, size


# ── rehearsal: a production sample, migrated on an ephemeral database ───────
SAMPLE_DOCS = """
  SELECT id FROM policy.documents WHERE id IN (
      SELECT v.document_id FROM policy.document_versions v
       WHERE v.content_hash IN (SELECT content_hash FROM policy.document_versions GROUP BY 1 HAVING count(*) > 1))
  UNION SELECT id FROM policy.documents WHERE url IN (SELECT url FROM policy.documents GROUP BY 1 HAVING count(*) > 1)
  UNION SELECT document_id FROM policy.document_versions WHERE NOT is_current
  UNION (SELECT id FROM policy.documents ORDER BY md5(id::text) LIMIT %s)
"""
COPY_TABLES = [
    ("sources", "SELECT * FROM policy.sources"),
    ("documents", "SELECT * FROM policy.documents WHERE id = ANY(%s)"),
    ("document_versions", "SELECT * FROM policy.document_versions WHERE document_id = ANY(%s)"),
    ("passages", "SELECT p.* FROM policy.passages p JOIN policy.document_versions v ON v.id = p.version_id "
                 "WHERE v.document_id = ANY(%s)"),
]


def rehearse(source_url: str, sample: int, log=print) -> dict:
    from mandate.grounding.testing import EphemeralMandate  # noqa: PLC0415
    policy_root = Path(__file__).resolve().parents[3] / "policy"
    sys.path.insert(0, str(policy_root))
    from sqlalchemy import create_engine  # noqa: PLC0415

    from data import models  # noqa: F401,PLC0415
    from data.base import Base  # noqa: PLC0415

    with EphemeralMandate() as db, _ro(source_url) as src:
        log(f"ephemeral database {db.dbname}, pgvector {db.pgvector} "
            f"({'halfvec' if db.halfvec else 'NO halfvec: vector stands in, sizes not representative'})")
        # policy's own tables, built by policy's own models, as policy_app: the
        # production layout, not a hand-written imitation of it.
        role_url = db.url("policy_app")
        eng = create_engine("postgresql+psycopg://", creator=lambda: psycopg.connect(role_url))
        Base.metadata.create_all(eng)
        eng.dispose()
        doc_ids = [r[0] for r in src.execute(SAMPLE_DOCS, (sample,)).fetchall()]
        log(f"sample: {len(doc_ids):,} documents (every duplicate group, every shared URL, "
            f"every document with a superseded version, and {sample} by hash)")
        with psycopg.connect(db.admin_url) as dst:
            dst.execute("SET search_path = policy, public")
            for table, sql in COPY_TABLES:
                params = (doc_ids,) if "%s" in sql else None
                cols = [d.name for d in src.execute(f"{sql} LIMIT 0", params).description]
                with src.cursor().copy(f"COPY ({sql}) TO STDOUT", params) as out, \
                        dst.cursor().copy(f"COPY policy.{table} ({', '.join(cols)}) FROM STDIN") as inp:
                    for chunk in out:
                        inp.write(chunk)
            dst.commit()
            p = plan(dst)
            log("plan on the sample: " + json.dumps(p, default=str))
            checks = apply(dst, half="halfvec" if db.halfvec else "vector", log=log)
            dst.commit()
            # idempotent: a second run inserts nothing
            before = verify(dst)
            apply(dst, half="halfvec" if db.halfvec else "vector", log=lambda *_: None)
            after = verify(dst)
            checks["second_run_inserted"] = {k: after[k] - before[k] for k in after
                                             if k.startswith("grounding_") and after[k] != before[k]}
            n, size = write_manifest(dst, Path("/dev/null"))
            checks["manifest_objects"], checks["manifest_bytes"] = n, size
            dst.commit()
        return {"plan": p, "checks": checks}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source-url", help="policy database URL, read-only use (dry run, rehearsal)")
    ap.add_argument("--admin-url", help="database admin URL (--apply only)")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--rehearse", action="store_true")
    ap.add_argument("--sample", type=int, default=300)
    ap.add_argument("--manifest", type=Path, default=Path("grounding_manifest_policy.jsonl"))
    a = ap.parse_args()
    if a.apply:
        if not a.admin_url:
            ap.error("--apply needs --admin-url")
        with psycopg.connect(a.admin_url) as admin:
            checks = apply(admin)
            n, size = write_manifest(admin, a.manifest)
            admin.commit()
        print(json.dumps(checks, indent=2))
        print(f"manifest: {n:,} objects, {size:,} bytes -> {a.manifest}. Upload: "
              f"python3 mandate/grounding/migrations/upload_manifest.py {a.manifest} --apply")
        return 0
    if not a.source_url:
        ap.error("--source-url is required (dry run or --rehearse)")
    if a.rehearse:
        out = rehearse(a.source_url, a.sample)
        print(json.dumps(out["checks"], indent=2, default=str))
        bad = {k: v for k, v in out["checks"].items() if k.startswith("violations_") and v}
        print("REHEARSAL OK: every invariant holds, second run inserted nothing"
              if not bad and not out["checks"]["second_run_inserted"] else f"REHEARSAL FAILED {bad}")
        return 0 if not bad else 1
    with _ro(a.source_url) as src:
        p = plan(src)
    p.update(estimate(p))
    print("DRY RUN: policy -> grounding. Read-only; nothing written, nothing uploaded.")
    for k, v in p.items():
        print(f"  {k:38} {v:,}" if isinstance(v, int) else f"  {k:38} {v}")
    refuse = p["spans_not_found"] or p["remapped_passages_text_differs"] or \
        p["hash_is_sha256_of_text"] != p["policy_versions"]
    print("WOULD REFUSE: see the counts above" if refuse else "would apply cleanly")
    return 1 if refuse else 0


if __name__ == "__main__":
    sys.exit(main())
