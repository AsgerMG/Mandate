"""Migration (a): policy's documents, versions and passages into schema grounding.

    # what it would do, read from production, nothing written (default)
    python3 mandate/grounding/migrations/policy_to_grounding.py --source-url "$POLICY_URL" [--volume-mb 5000]

    # do it for real on a throwaway copy: a production SAMPLE loaded into an
    # ephemeral Postgres, migrated with two hard crashes (SIGKILL) mid-batch and a
    # resume, and every invariant checked
    python3 mandate/grounding/migrations/policy_to_grounding.py --source-url "$POLICY_URL" --rehearse

    # production: the admin, after review. Writes the bucket upload manifest.
    python3 mandate/grounding/migrations/policy_to_grounding.py --admin-url "$ADMIN_URL" --apply \
        --volume-mb 5000 --used-mb 4115 --drop-old-index --manifest grounding_manifest_policy.jsonl

BATCHED AND RESUMABLE, BECAUSE THE VOLUME IS 5 GB. The first version ran as ONE
transaction and died twice on Railway's 5 GB Hobby volume (2026-11-06: the
parallel HNSW build overflowed /dev/shm; then DiskFull inserting the vectors,
with ~1 GB of WAL held by the open transaction). Now every phase commits in
batches, a CHECKPOINT after each batch lets Postgres recycle the WAL, and the
HNSW index is built LAST, serially, in bounded memory. A crash (or a refusal
for space) loses at most the batch in flight: every insert is ON CONFLICT DO
NOTHING behind an anti-join, the batch plan is recomputed from policy on every
start, so re-running the same command resumes where it stopped. Nothing reads
grounding until policy_on_grounding.sh, and that refuses while any policy
version is unlinked, so a half-migrated store is never served.

SPACE IS CHECKED BEFORE A SINGLE ROW IS WRITTEN, AND BETWEEN BATCHES. `space()`
measures the database and the WAL directory, `project()` adds what grounding
will weigh and what the WAL may grow by, and --apply refuses unless the peak
leaves --margin-mb free. --drop-old-index drops policy.ix_passages_embedding_hnsw
first (967 MB on 2026-11-07): an INDEX, not data. Until the cutover moves Regina
onto grounding's halfvec index her semantic search runs as an exact scan: the
same results (an exact scan is what the index approximates), slower.

WHAT MOVES, AND WHAT DOES NOT. Grounding receives the SOURCE record: one
document per canonical URL, one version per distinct text (sha256), one fetch
row per policy version (so every fetch date survives the dedupe), the passages,
and their vectors as halfvec. Policy KEEPS everything brain-specific
(documents' type/lifecycle/dates, enrichments, actors, is_current) and gains
three link tables (Alembic revision e41c0a7b9d10). Nothing in schema policy is
updated or deleted: this migration only inserts (and, with --drop-old-index,
drops one index). Retiring policy.passages' text and vectors is a separate,
later, archived step (mandate/ops/drop_policy_duplicates.sh), taken only after
the cutover.

IDS ARE PRESERVED for every non-duplicate row, so enrichments.citations
({"passage_ids": [...]}) and document_actor.passage_id stay valid untouched.
A duplicate version (same sha256 as a lower-id version, 75 of them on
2026-11-07: the same act ingested by two adapters) maps onto the surviving
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
import os
import re
import subprocess
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
OLD_INDEX = "policy.ix_passages_embedding_hnsw"
GROUNDING_SQL = Path(__file__).resolve().parents[2] / "db" / "grounding.sql"
MIB = 1 << 20

#: Rows per committed batch. Each batch is a few MB of heap and WAL; the
#: CHECKPOINT after it is what keeps the WAL directory from growing.
BATCH = {"versions": 500, "passages": 500, "passage_links": 25_000, "embeddings": 10_000}

#: Measured, not modelled (mandate/grounding/migrations/hnsw_params.py, 2026-11-07,
#: 122,033 production vectors): 2,728 bytes of HNSW index per halfvec(1024) vector
#: at the parameters grounding.sql declares (three elements a page, at m=16 and
#: at m=12 alike). Rounded up.
HNSW_BYTES_PER_VECTOR = 2_750
#: halfvec(1024) is 2,056 bytes, over the 2 kB TOAST threshold and stored
#: uncompressed out of line: two toast chunks (~2,140 bytes with their headers)
#: plus a ~100-byte heap row (passage_id, model, toast pointer, created_at).
EMBEDDING_ROW_BYTES = 2_250
#: Everything on the volume that is neither a database nor WAL (server logs,
#: pg_xact, the cluster's other files): 4,115 MB used - 2,779 MB database -
#: 960 MB WAL, measured 2026-11-07. Used only when --used-mb is not given.
UNACCOUNTED_MB = 400
CONTINGENCY = 1.15      # on the estimate of what grounding will weigh


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
    p["upload_bytes"], p["version_text_stored_bytes"] = q("""
        SELECT sum(octet_length(convert_to(text, 'UTF8')))::bigint, sum(pg_column_size(text))::bigint FROM policy.document_versions
         WHERE id IN (SELECT min(id) FROM policy.document_versions GROUP BY content_hash)""")
    p["passage_text_stored_bytes"] = q("""
        SELECT coalesce(sum(pg_column_size(text)) + sum(coalesce(pg_column_size(heading), 0)), 0)::bigint
          FROM policy.passages
         WHERE version_id IN (SELECT min(id) FROM policy.document_versions GROUP BY content_hash)""")[0]
    p["max_version_id"], p["max_passage_id"] = q(
        "SELECT (SELECT max(id) FROM policy.document_versions), (SELECT max(id) FROM policy.passages)")
    # to_regclass: the old index may already have been dropped (--drop-old-index)
    p["policy_passages_bytes"], p["policy_hnsw_bytes"], p["policy_versions_bytes"] = q(f"""
        SELECT pg_total_relation_size('policy.passages'),
               coalesce(pg_relation_size(to_regclass('{OLD_INDEX}')), 0),
               pg_total_relation_size('policy.document_versions')""")
    return p


# ── space: measured, projected, enforced ─────────────────────────────────────
#: Tables the failed single-transaction attempts left empty but with bloated
#: btree pages (~90 MB on 2026-11-07). REINDEX of an EMPTY table only.
REINDEX_IF_EMPTY = ("grounding.sources", "grounding.documents", "grounding.document_versions",
                    "grounding.fetches", "grounding.passages", "grounding.passage_embeddings",
                    "policy.grounding_document_link", "policy.grounding_version_link",
                    "policy.grounding_passage_link")


def space(con) -> dict:
    """What the volume holds now, as far as Postgres can see it. WAL needs the
    admin (pg_ls_waldir), `df` a superuser; a lesser role gets None for both and
    the projection assumes the worst."""
    one = lambda sql, a=(): con.execute(sql, a).fetchone()[0]  # noqa: E731
    s = {"databases_bytes": one("SELECT sum(pg_database_size(oid))::bigint FROM pg_database"),
         "max_wal_size_bytes": one("SELECT setting::bigint * 1024 * 1024 FROM pg_settings WHERE name = 'max_wal_size'"),
         "grounding_rows_bytes": 0, "reclaimable_bytes": 0}
    for t in REINDEX_IF_EMPTY:
        size, idx, n_idx = con.execute(
            "SELECT pg_total_relation_size(%s::regclass), pg_indexes_size(%s::regclass), "
            "(SELECT count(*) FROM pg_index WHERE indrelid = %s::regclass)", (t, t, t)).fetchone()
        if one(f"SELECT EXISTS (SELECT 1 FROM {t})"):
            s["grounding_rows_bytes"] += size if t.startswith("grounding.") else 0
        else:
            s["reclaimable_bytes"] += max(0, idx - n_idx * 16384)
    try:
        with con.transaction():
            s["wal_bytes"] = one("SELECT coalesce(sum(size), 0)::bigint FROM pg_ls_waldir()")
    except psycopg.Error:
        s["wal_bytes"] = None
    s["df_free_bytes"] = _df_free(con)
    return s


def _df_free(con) -> int | None:
    """Free bytes on the data directory's filesystem, from `df` run by the server
    itself (COPY FROM PROGRAM: superuser only). The direct reading of what
    failed on 2026-11-06, and preferred over any figure derived from Railway's
    numbers. None where the role or the server does not allow it."""
    try:
        with con.transaction():
            con.execute("CREATE TEMP TABLE _df (line text) ON COMMIT DROP")
            # the server's working directory is its data directory
            con.execute("COPY _df FROM PROGRAM 'df -kP .'")
            rows = [r[0] for r in con.execute("SELECT line FROM _df")]
        cols = rows[-1].split()
        return int(cols[3]) * 1024
    except (psycopg.Error, IndexError, ValueError):
        return None


def hnsw_bytes(n: int) -> int:
    return n * HNSW_BYTES_PER_VECTOR


def free_bytes(s: dict, volume_mb: float | None, used: int) -> int | None:
    """`df` when the server lets us run it (a measurement); otherwise the volume
    size minus `used`, reading Railway's size as decimal MB (5000 MB = 4,768 MiB)
    and its used figure as binary MiB, so an ambiguous unit errs towards refusing."""
    if s.get("df_free_bytes") is not None:
        return s["df_free_bytes"]
    return None if volume_mb is None else int(volume_mb * 1_000_000) - used


def project(p: dict, s: dict, *, volume_mb: float | None, used_mb: float | None,
            drop_old_index: bool, margin_mb: float, index_built: bool = False) -> dict:
    """The peak the volume reaches, in bytes, and whether it fits."""
    n_emb = p["embeddings_to_halfvec"]
    est = {
        "versions": p["version_text_stored_bytes"] + p["grounding_versions"] * 600,
        "fetches": p["fetch_rows"] * 300,
        "documents": p["grounding_documents"] * 700,
        "passages": p["passage_text_stored_bytes"] + p["grounding_passages"] * 200,
        "link_tables": (p["policy_passages"] + p["policy_versions"] + p["policy_documents"]) * 110,
        "embeddings": n_emb * EMBEDDING_ROW_BYTES,
        "hnsw": 0 if index_built else hnsw_bytes(n_emb),
    }
    total = int(sum(est.values()) * CONTINGENCY)
    # On a resume part of it is already on disk (and already counted as used).
    remaining = max(0, total - s["grounding_rows_bytes"])
    # WAL. pg_wal holds the segments since the last checkpoint plus RECYCLED ones,
    # renamed for reuse; after the CHECKPOINT that follows every batch nearly all
    # of it is reusable. The one step that cannot be split, the index build,
    # needs that much WAL before the next checkpoint: the directory grows only
    # by what its recycled segments cannot absorb. Unknown WAL: assume none.
    wal_now = s["wal_bytes"]
    biggest_step = max(est["hnsw"], BATCH["embeddings"] * EMBEDDING_ROW_BYTES) + 64 * MIB
    wal_growth = max(0, biggest_step - (wal_now or 0))
    measured_used = s["databases_bytes"] + (wal_now or 0)
    if used_mb is not None:
        used = max(int(used_mb * MIB), measured_used)
    else:
        used = measured_used + UNACCOUNTED_MB * MIB + (0 if wal_now is not None else s["max_wal_size_bytes"])
    freed = p["policy_hnsw_bytes"] if drop_old_index else 0
    out = {"estimate_bytes": {k: int(v * CONTINGENCY) for k, v in est.items()},
           "grounding_total_bytes": total, "grounding_remaining_bytes": remaining,
           "wal_now_bytes": wal_now, "wal_growth_bytes": wal_growth,
           "used_bytes": used, "freed_by_dropping_old_index_bytes": freed,
           "old_index_bytes": p["policy_hnsw_bytes"], "reclaimed_bloat_bytes": s["reclaimable_bytes"],
           "df_free_bytes": s.get("df_free_bytes")}
    free = free_bytes(s, volume_mb, used)
    if free is None:
        out["fits"] = None
        return out
    need = remaining + wal_growth - freed - s["reclaimable_bytes"]
    out.update({"free_now_bytes": free, "peak_need_bytes": need,
                "free_at_peak_bytes": free - need, "margin_bytes": int(margin_mb * MIB),
                "fits": free - need >= margin_mb * MIB})
    if not out["fits"] and not drop_old_index and p["policy_hnsw_bytes"]:
        out["fits_with_drop_old_index"] = free - need + p["policy_hnsw_bytes"] >= margin_mb * MIB
    return out


def show_projection(pr: dict, log=print) -> None:
    mb = lambda b: "n/a" if b is None else f"{b / MIB:,.0f} MB"  # noqa: E731
    log("SPACE PROJECTION (MB = 2^20 bytes)")
    for k, v in pr["estimate_bytes"].items():
        log(f"  grounding.{k:28} {mb(v):>10}  (estimate)")
    log(f"  {'grounding, total (+15%)':38} {mb(pr['grounding_total_bytes']):>10}")
    log(f"  {'grounding, still to write':38} {mb(pr['grounding_remaining_bytes']):>10}")
    log(f"  {'WAL now / may grow by':38} {mb(pr['wal_now_bytes']):>10} / {mb(pr['wal_growth_bytes'])}")
    log(f"  {'volume used now':38} {mb(pr['used_bytes']):>10}")
    log(f"  {'freed: old policy HNSW index':38} {mb(pr['freed_by_dropping_old_index_bytes']):>10}"
        f"  (index is {mb(pr['old_index_bytes'])})")
    log(f"  {'freed: REINDEX of empty, bloated tables':38} {mb(pr['reclaimed_bloat_bytes']):>10}")
    if pr["fits"] is None:
        log("  free space unknown: give --volume-mb (and --used-mb from Railway) for a verdict")
        return
    log(f"  {'free now':38} {mb(pr['free_now_bytes']):>10}  "
        + ("(df on the server)" if pr["df_free_bytes"] is not None else "(volume size - used)"))
    log(f"  {'free at the peak':38} {mb(pr['free_at_peak_bytes']):>10}  (margin {mb(pr['margin_bytes'])})")
    log("  FITS" if pr["fits"] else "  DOES NOT FIT" + (
        " (it would with --drop-old-index)" if pr.get("fits_with_drop_old_index") else ""))


# ── the write: committed batches, inserts only, resumable ───────────────────
def hnsw_ddl(half: str = "halfvec") -> tuple[str, str]:
    """(index name, CREATE INDEX statement) of the passage-embedding HNSW index,
    read from mandate/db/grounding.sql: ONE definition, the schema's. `half` is
    the vector type on servers without halfvec (pgvector < 0.7, tests only)."""
    m = re.search(r"CREATE INDEX IF NOT EXISTS (ix_gpe_hnsw_\w+)\s+ON grounding\.passage_embeddings"
                  r"[^;]*?WHERE model = '([^']+)';", GROUNDING_SQL.read_text(), re.S)
    if not m or m.group(2) != MODEL:
        raise RuntimeError(f"grounding.sql declares no HNSW index for model {MODEL!r}")
    ddl = " ".join(m.group(0).rstrip(";").split()).replace("IF NOT EXISTS ", "")
    if half != "halfvec":
        ddl = ddl.replace("public.halfvec_cosine_ops", f"public.{half}_cosine_ops")
    return m.group(1), ddl


class Stop(RuntimeError):
    """Stopped between batches (space, or a rehearsal's injected crash). Everything
    committed is kept; the same command resumes."""


def _ranges(con, sql: str, size: int) -> list[tuple[int, int]]:
    ids = [r[0] for r in con.execute(sql)]
    return [(ids[i], ids[min(i + size, len(ids)) - 1]) for i in range(0, len(ids), size)]


def apply(admin, *, half: str = "halfvec", log=print, volume_mb: float | None = None,
          used_mb: float | None = None, margin_mb: float = 250, drop_old_index: bool = False,
          batch: dict | None = None) -> dict:
    """Migrate, in committed batches. `admin` must be able to read schema policy
    and insert into grounding (the database admin). Re-running resumes. Returns
    the post-checks; raises if the space projection refuses or an invariant fails.
    Without volume_mb the space check runs only where `df` is readable (tests)."""
    t0 = time.time()
    size = {**BATCH, **(batch or {})}
    x = admin.execute
    fail_at = os.environ.get("MANDATE_P2G_FAIL_AT", "")   # rehearsal only: "phase:batch"
    admin.commit()
    x("SET search_path = policy, public")

    # 0. refuse before writing anything
    p = plan(admin)
    bad = {k: p[k] for k in ("spans_not_found", "remapped_passages_text_differs") if p[k]}
    if p["hash_is_sha256_of_text"] != p["policy_versions"]:
        bad["hash_is_not_sha256_of_text"] = p["policy_versions"] - p["hash_is_sha256_of_text"]
    if bad:
        raise RuntimeError(f"refusing before writing anything: {bad}")
    idx, ddl = hnsw_ddl(half)
    index_built = admin.execute("SELECT to_regclass(%s)", (f"grounding.{idx}",)).fetchone()[0] is not None
    s0 = space(admin)
    admin.commit()
    pr = project(p, s0, volume_mb=volume_mb, used_mb=used_mb, drop_old_index=drop_old_index,
                 margin_mb=margin_mb, index_built=index_built and _embeddings_complete(admin))
    admin.commit()
    show_projection(pr, log)
    if pr["fits"] is False:
        raise Stop("refusing to start: the projected peak leaves less than the margin free. "
                   + ("Re-run with --drop-old-index." if pr.get("fits_with_drop_old_index") else
                      "Free space first (see the projection)."))
    # between batches: used now = used at the start + what Postgres has grown by
    base_used = pr["used_bytes"]
    base_seen = s0["databases_bytes"] + (s0["wal_bytes"] or 0)
    can_checkpoint = [True]

    def commit_batch(phase: str, i: int, n: int, rows: int) -> None:
        if fail_at == f"{phase}:{i}":
            raise Stop(f"injected crash in {phase} batch {i}, before its commit")
        admin.commit()
        if can_checkpoint[0]:
            try:
                x("CHECKPOINT")
            except psycopg.errors.InsufficientPrivilege:
                admin.rollback()
                can_checkpoint[0] = False
                log("  (no CHECKPOINT privilege: WAL recycles at max_wal_size instead)")
        admin.commit()
        msg = f"  {phase} batch {i}/{n}: +{rows:,} rows, {time.time() - t0:,.0f}s"
        quiet = rows == 0 and i not in (1, n)   # a resume skips done batches; say so once
        if volume_mb is not None:
            s = space(admin)
            admin.commit()
            used = base_used + (s["databases_bytes"] + (s["wal_bytes"] or 0) - base_seen)
            free = free_bytes(s, volume_mb, used)
            msg += f", volume free {free / MIB:,.0f} MB"
            if free < margin_mb * MIB:
                log(msg)
                raise Stop(f"stopped after {phase} batch {i}: free space {free / MIB:,.0f} MB is below the "
                           f"{margin_mb:,.0f} MB margin. Everything committed is kept; re-run resumes.")
        if not quiet:
            log(msg)

    def step(phase: str, sql: str, params=()) -> None:
        rows = x(sql, params).rowcount
        commit_batch(phase, 1, 1, rows)

    # 1. the old index (only when asked)
    if drop_old_index and p["policy_hnsw_bytes"]:
        log(f"  DROPPING {OLD_INDEX} ({p['policy_hnsw_bytes'] / MIB:,.0f} MB): an index, not data. "
            "Regina's search is an exact scan (same results, slower) until the cutover.")
        x(f"DROP INDEX IF EXISTS {OLD_INDEX}")
        commit_batch("drop old index", 1, 1, 0)

    # 2. a store still empty from the failed attempts: their rolled-back inserts
    #    left ~90 MB of btree pages behind. REINDEX of an EMPTY table only.
    for t in REINDEX_IF_EMPTY:
        if x(f"SELECT NOT EXISTS (SELECT 1 FROM {t})").fetchone()[0]:
            x(f"REINDEX TABLE {t}")
    admin.commit()

    # 3. ids: a grounding row created by anyone else must never take a policy id
    for t, pol in (("passages", "policy.passages"), ("document_versions", "policy.document_versions")):
        x(f"SELECT setval(pg_get_serial_sequence('grounding.{t}', 'id'), "
          f"GREATEST((SELECT max(id) FROM grounding.{t}), (SELECT max(id) FROM {pol}), 1))")
    admin.commit()

    # the mapping, recomputed from policy on every start (session temp tables)
    urls = doc_urls(admin)
    x("DROP TABLE IF EXISTS m_doc")
    x("DROP TABLE IF EXISTS m_ver")
    x("CREATE TEMP TABLE m_doc (pdoc_id int PRIMARY KEY, curl text NOT NULL, source_key text NOT NULL)")
    with admin.cursor().copy("COPY m_doc (pdoc_id, curl, source_key) FROM STDIN") as cp:
        for row in urls:
            cp.write_row(row)
    x("""CREATE TEMP TABLE m_ver AS
         SELECT v.id AS pv_id, v.document_id AS pdoc_id, v.content_hash,
                min(v.id) OVER (PARTITION BY v.content_hash) AS canon_id,
                min(v.fetched_at) OVER (PARTITION BY v.content_hash) AS first_seen
           FROM policy.document_versions v""")
    x("CREATE UNIQUE INDEX ON m_ver (pv_id)")
    x("ANALYZE m_doc")
    x("ANALYZE m_ver")
    admin.commit()

    log("  sources, documents")
    x("""INSERT INTO grounding.sources (key, name, base_url, created_by)
         SELECT 'policy.' || key, name, base_url, %s FROM policy.sources
         ON CONFLICT (key) DO NOTHING""", (WHO,))
    x("""INSERT INTO grounding.documents (canonical_url, source_id, title, publisher, kind, created_by)
         SELECT DISTINCT ON (m.curl) m.curl, gs.id, d.title, s.name, d.document_type::text, %s
           FROM m_doc m JOIN policy.documents d ON d.id = m.pdoc_id
           JOIN policy.sources s ON s.id = d.source_id
           JOIN grounding.sources gs ON gs.key = 'policy.' || s.key
          WHERE NOT EXISTS (SELECT 1 FROM grounding.documents g WHERE g.canonical_url = m.curl)
          ORDER BY m.curl, m.pdoc_id
         ON CONFLICT (canonical_url) DO NOTHING""", (WHO,))
    step("document links", """INSERT INTO policy.grounding_document_link (policy_document_id, grounding_document_id)
         SELECT m.pdoc_id, gd.id FROM m_doc m JOIN grounding.documents gd ON gd.canonical_url = m.curl
         ON CONFLICT DO NOTHING""")

    rs = _ranges(admin, "SELECT pv_id FROM m_ver WHERE pv_id = canon_id ORDER BY 1", size["versions"])
    log(f"  versions: {len(rs)} batches")
    for i, (lo, hi) in enumerate(rs, 1):
        r = x("""INSERT INTO grounding.document_versions
               (id, document_id, fetched_at, sha256, mime, byte_size, bucket_key, text, extractor, created_by)
             SELECT v.id, dl.grounding_document_id, m.first_seen, v.content_hash, 'text/plain; charset=utf-8',
                    octet_length(convert_to(v.text, 'UTF8')),
                    'sha256/' || substr(v.content_hash, 1, 2) || '/' || v.content_hash,
                    v.text, 'policy:' || v.raw_format || '->normalised text (original bytes not retained)', %s
               FROM m_ver m JOIN policy.document_versions v ON v.id = m.pv_id
               JOIN policy.grounding_document_link dl ON dl.policy_document_id = v.document_id
              WHERE m.pv_id = m.canon_id AND m.pv_id BETWEEN %s AND %s
                AND NOT EXISTS (SELECT 1 FROM grounding.document_versions g WHERE g.sha256 = m.content_hash)
             ON CONFLICT DO NOTHING""", (WHO, lo, hi)).rowcount
        commit_batch("versions", i, len(rs), r)
    step("version links", """INSERT INTO policy.grounding_version_link (policy_version_id, grounding_version_id)
         SELECT m.pv_id, gv.id FROM m_ver m JOIN grounding.document_versions gv ON gv.sha256 = m.content_hash
         ON CONFLICT DO NOTHING""")
    step("fetches", """INSERT INTO grounding.fetches (document_id, version_id, fetched_at, fetched_by)
         SELECT dl.grounding_document_id, vl.grounding_version_id, v.fetched_at, %s
           FROM policy.document_versions v
           JOIN policy.grounding_document_link dl ON dl.policy_document_id = v.document_id
           JOIN policy.grounding_version_link vl ON vl.policy_version_id = v.id
         ON CONFLICT DO NOTHING""", (WHO,))

    log(f"  passages (spans made exact): {len(rs)} batches")
    for i, (lo, hi) in enumerate(rs, 1):
        r = x("""INSERT INTO grounding.passages
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
              WHERE p.version_id BETWEEN %s AND %s
                AND NOT EXISTS (SELECT 1 FROM grounding.passages g WHERE g.id = p.id)
             ON CONFLICT DO NOTHING""", (CHUNKER, lo, hi)).rowcount
        commit_batch("passages", i, len(rs), r)

    rs = _ranges(admin, "SELECT id FROM policy.passages ORDER BY 1", size["passage_links"])
    log(f"  passage links: {len(rs)} batches")
    for i, (lo, hi) in enumerate(rs, 1):
        r = x("""INSERT INTO policy.grounding_passage_link (policy_passage_id, grounding_passage_id)
             SELECT p.id, gp.id FROM policy.passages p
               JOIN policy.grounding_version_link vl ON vl.policy_version_id = p.version_id
               JOIN grounding.passages gp ON gp.version_id = vl.grounding_version_id
                                         AND gp.chunker = %s AND gp.ordinal = p.ordinal
              WHERE p.id BETWEEN %s AND %s
             ON CONFLICT DO NOTHING""", (CHUNKER, lo, hi)).rowcount
        commit_batch("passage links", i, len(rs), r)

    # Embeddings: the HNSW index is dropped for the bulk load (inserting into it
    # row by row is slow and fragments it) and built once, last.
    if not _embeddings_complete(admin):
        x(f"DROP INDEX IF EXISTS grounding.{idx}")
        admin.commit()
        rs = _ranges(admin, "SELECT DISTINCT grounding_passage_id FROM policy.grounding_passage_link ORDER BY 1",
                     size["embeddings"])
        log(f"  embeddings -> {half}(1024): {len(rs)} batches")
        for i, (lo, hi) in enumerate(rs, 1):
            r = x(f"""INSERT INTO grounding.passage_embeddings (passage_id, model, embedding)
                  SELECT DISTINCT ON (pl.grounding_passage_id) pl.grounding_passage_id, %s,
                         p.embedding::public.{half}
                    FROM policy.passages p JOIN policy.grounding_passage_link pl ON pl.policy_passage_id = p.id
                   WHERE p.embedding IS NOT NULL AND pl.grounding_passage_id BETWEEN %s AND %s
                     AND NOT EXISTS (SELECT 1 FROM grounding.passage_embeddings e
                                     WHERE e.passage_id = pl.grounding_passage_id AND e.model = %s)
                   ORDER BY pl.grounding_passage_id, (p.id = pl.grounding_passage_id) DESC, p.id
                  ON CONFLICT DO NOTHING""", (MODEL, lo, hi, MODEL)).rowcount
            commit_batch("embeddings", i, len(rs), r)

    if admin.execute("SELECT to_regclass(%s)", (f"grounding.{idx}",)).fetchone()[0] is None:
        # Railway's Postgres container has a small /dev/shm. A PARALLEL HNSW build
        # asks for a ~1 GB dynamic shared memory segment and fails with DiskFull
        # ("could not resize shared memory segment"; 2026-11-06, three times).
        # Serial, with a bounded maintenance_work_mem, uses ordinary backend
        # memory; past it pgvector inserts the rest straight into the on-disk
        # graph (no temp files). Slower to build; the same index.
        log(f"  {idx}: building (serial, maintenance_work_mem 256MB): {ddl}")
        x("SET max_parallel_maintenance_workers = 0")
        x("SET maintenance_work_mem = '256MB'")
        x(ddl)
        commit_batch("hnsw index", 1, 1, 0)
    for t in ("sources", "documents", "document_versions", "fetches", "passages", "passage_embeddings"):
        x(f"ANALYZE grounding.{t}")
    admin.commit()
    for t, pol in (("passages", "policy.passages"), ("document_versions", "policy.document_versions")):
        x(f"SELECT setval(pg_get_serial_sequence('grounding.{t}', 'id'), "
          f"GREATEST((SELECT max(id) FROM grounding.{t}), (SELECT max(id) FROM {pol}), 1))")
    for t in ("sources", "documents", "fetches"):
        x(f"SELECT setval(pg_get_serial_sequence('grounding.{t}', 'id'), "
          f"GREATEST((SELECT max(id) FROM grounding.{t}), 1))")
    admin.commit()
    checks = verify(admin, p)
    checks["seconds"] = round(time.time() - t0, 1)
    checks["grounding_bytes_measured"] = space(admin)["grounding_rows_bytes"]
    checks["grounding_bytes_projected"] = pr["grounding_total_bytes"]
    checks["table_bytes_measured"] = dict(admin.execute(
        "SELECT c.oid::regclass::text, pg_total_relation_size(c.oid) FROM pg_class c "
        "JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind = 'r' AND (n.nspname = 'grounding' "
        "OR c.relname LIKE 'grounding\\_%%\\_link') ORDER BY 1").fetchall())
    checks["table_bytes_projected"] = pr["estimate_bytes"]
    admin.commit()
    bad = {k: v for k, v in checks.items() if k.startswith("violations_") and v}
    if bad:
        raise RuntimeError(f"invariants failed: {bad}. Nothing reads grounding before the cutover, and "
                           "policy_on_grounding.sh refuses while a version is unlinked; fix, then re-run.")
    return checks


def _embeddings_complete(con) -> bool:
    return not con.execute("""SELECT EXISTS (SELECT 1 FROM policy.passages p
        JOIN policy.grounding_passage_link l ON l.policy_passage_id = p.id
        WHERE p.embedding IS NOT NULL AND NOT EXISTS (SELECT 1 FROM grounding.passage_embeddings e
              WHERE e.passage_id = l.grounding_passage_id AND e.model = %s))""", (MODEL,)).fetchone()[0] \
        and con.execute("SELECT EXISTS (SELECT 1 FROM policy.grounding_passage_link)").fetchone()[0]


def verify(con, p: dict | None = None) -> dict:
    q = lambda s, a=(): con.execute(s, a).fetchone()[0]  # noqa: E731
    out = {
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
        "violations_index_missing": q("SELECT count(*) FROM (SELECT 1) one WHERE to_regclass(%s) IS NULL",
                                      (f"grounding.{hnsw_ddl()[0]}",)),
    }
    if p is not None:
        # the dry run's own figures: what the plan promised is what landed
        # (75 duplicate versions folded, not 75 versions lost)
        out["violations_count_versions"] = abs(p["grounding_versions"] - q(
            "SELECT count(*) FROM grounding.document_versions WHERE created_by = %s", (WHO,)))
        out["violations_count_passages"] = abs(p["grounding_passages"] - q(
            "SELECT count(*) FROM grounding.passages WHERE chunker = %s", (CHUNKER,)))
        out["violations_count_embeddings"] = abs(p["embeddings_to_halfvec"] - q(
            "SELECT count(*) FROM grounding.passage_embeddings e JOIN grounding.passages g ON g.id = e.passage_id "
            "WHERE g.chunker = %s AND e.model = %s", (CHUNKER, MODEL)))
        out["violations_count_fetches"] = abs(p["fetch_rows"] - q(
            "SELECT count(*) FROM grounding.fetches WHERE fetched_by = %s", (WHO,)))
    return out


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
REHEARSAL_BATCH = {"versions": 40, "passages": 40, "passage_links": 2_000, "embeddings": 1_000}


def _killed_run(admin_url: str, half: str, kill_in: str, log) -> str:
    """Run --apply in a child process and SIGKILL it the moment `kill_on` is
    printed (a batch's rows written, its commit not yet sent): a real crash,
    mid-transaction, the connection dropped without a rollback."""
    env = {**os.environ, "MANDATE_P2G_HALF": half, "MANDATE_P2G_BATCH": json.dumps(REHEARSAL_BATCH),
           "MANDATE_P2G_ANNOUNCE": kill_in}
    kill_on = "{} batch {} inserted".format(*kill_in.split(":"))
    child = subprocess.Popen([sys.executable, __file__, "--admin-url", admin_url, "--apply",
                              "--volume-mb", "1000000", "--manifest", os.devnull],
                             stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env)
    seen = ""
    for line in child.stdout:
        seen = line.strip()
        if seen.startswith(kill_on):
            child.kill()
            break
    child.wait()
    log(f"  SIGKILL at: {seen!r} (exit {child.returncode})")
    return seen


def rehearse(source_url: str, sample: int, log=print) -> dict:
    from mandate.grounding.testing import EphemeralMandate  # noqa: PLC0415
    policy_root = Path(__file__).resolve().parents[3] / "policy"
    sys.path.insert(0, str(policy_root))
    from sqlalchemy import create_engine  # noqa: PLC0415

    from data import models  # noqa: F401,PLC0415
    from data.base import Base  # noqa: PLC0415

    with EphemeralMandate() as db, _ro(source_url) as src:
        half = "halfvec" if db.halfvec else "vector"
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
        # two real crashes, each mid-batch, then the resume
        crashes = [_killed_run(db.admin_url, half, "passages:3", log),
                   _killed_run(db.admin_url, half, "embeddings:2", log)]
        with psycopg.connect(db.admin_url) as dst:
            partial = verify(dst)
            dst.commit()
            log(f"  after the crashes: {partial['grounding_passages']:,} passages, "
                f"{partial['grounding_embeddings']:,} embeddings")
            # an injected failure inside a batch, before its commit: the batch is lost, nothing else
            os.environ["MANDATE_P2G_FAIL_AT"] = "embeddings:3"
            try:
                apply(dst, half=half, log=lambda *_: None, batch=REHEARSAL_BATCH)
                raise AssertionError("the injected failure did not fire")
            except Stop:
                dst.rollback()
            finally:
                os.environ.pop("MANDATE_P2G_FAIL_AT", None)
            log("  resume:")
            checks = apply(dst, half=half, log=log, batch=REHEARSAL_BATCH)
            # idempotent: a second run inserts nothing
            before = verify(dst)
            apply(dst, half=half, log=lambda *_: None, batch=REHEARSAL_BATCH)
            after = verify(dst)
            checks["crashed_at"] = crashes
            checks["counts_after_crashes"] = {k: v for k, v in partial.items() if k.startswith("grounding_")}
            checks["second_run_inserted"] = {k: after[k] - before[k] for k in after
                                             if k.startswith("grounding_") and after[k] != before[k]}
            n, size = write_manifest(dst, Path(os.devnull))
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
    ap.add_argument("--volume-mb", type=float, help="the volume's size (Railway: sizeMB). Required with --apply")
    ap.add_argument("--used-mb", type=float, help="the volume's used space (Railway: currentSizeMB); "
                    "without it, databases + WAL + an allowance for the rest")
    ap.add_argument("--margin-mb", type=float, default=250, help="free space that must remain at the peak")
    ap.add_argument("--drop-old-index", action="store_true",
                    help=f"DROP INDEX {OLD_INDEX} first (an index, not data; ~1 GB)")
    a = ap.parse_args()
    if a.apply:
        if not a.admin_url:
            ap.error("--apply needs --admin-url")
        if a.volume_mb is None:
            ap.error("--apply needs --volume-mb: the space check is not optional on a 5 GB volume")
        def log(*m, **_):
            print(*m, flush=True)
        half = os.environ.get("MANDATE_P2G_HALF", "halfvec")
        batch = json.loads(os.environ.get("MANDATE_P2G_BATCH", "{}"))
        with psycopg.connect(a.admin_url) as admin:
            try:
                checks = apply(_announcing(admin) if os.environ.get("MANDATE_P2G_ANNOUNCE") else admin,
                               half=half, log=log, volume_mb=a.volume_mb, used_mb=a.used_mb,
                               margin_mb=a.margin_mb, drop_old_index=a.drop_old_index, batch=batch)
            except Stop as e:
                print(f"STOPPED: {e}")
                return 2
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
        print("REHEARSAL OK: every invariant holds after two crashes and a resume, second run inserted nothing"
              if not bad and not out["checks"]["second_run_inserted"] else f"REHEARSAL FAILED {bad}")
        return 0 if not bad and not out["checks"]["second_run_inserted"] else 1
    with _ro(a.source_url) as src:
        p = plan(src)
        s = space(src)
    print("DRY RUN: policy -> grounding. Read-only; nothing written, nothing uploaded.")
    for k, v in p.items():
        print(f"  {k:38} {v:,}" if isinstance(v, int) else f"  {k:38} {v}")
    for drop in (False, True):
        print(f"\n-- {'with' if drop else 'without'} --drop-old-index")
        show_projection(project(p, s, volume_mb=a.volume_mb, used_mb=a.used_mb, drop_old_index=drop,
                                margin_mb=a.margin_mb))
    refuse = p["spans_not_found"] or p["remapped_passages_text_differs"] or \
        p["hash_is_sha256_of_text"] != p["policy_versions"]
    print("WOULD REFUSE: see the counts above" if refuse else "would apply cleanly")
    return 1 if refuse else 0


class _announcing:
    """Rehearsal only (MANDATE_P2G_ANNOUNCE): a connection wrapper that, after each
    passages/embeddings batch INSERT and BEFORE its commit, says so and waits,
    so the parent can SIGKILL the child with the batch's rows written and
    uncommitted."""
    _MARK = re.compile(r"INSERT INTO (grounding\.passages|grounding\.passage_embeddings)\s")

    def __init__(self, con):
        self._con, self._n = con, {}

    def execute(self, sql, *a, **k):
        m = self._MARK.search(sql) if isinstance(sql, str) else None
        if m:
            phase = "passages" if m.group(1).endswith("passages") else "embeddings"
            self._n[phase] = self._n.get(phase, 0) + 1
            cur = self._con.execute(sql, *a, **k)
            if os.environ.get("MANDATE_P2G_ANNOUNCE") == f"{phase}:{self._n[phase]}":
                # rows written, transaction open: the parent kills us HERE
                print(f"  {phase} batch {self._n[phase]} inserted, not committed", flush=True)
                time.sleep(60)
            return cur
        return self._con.execute(sql, *a, **k)

    def __getattr__(self, name):
        return getattr(self._con, name)


if __name__ == "__main__":
    sys.exit(main())
