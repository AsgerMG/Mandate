"""Chunk + embed hydrated articles for local vector retrieval (embed step).

Architecture (ported from a proven prior design):
  * Model: the space mandate/embedding/spaces.json records for
    capital.signals_chunk_embeddings -- today the LEGACY local space
    (multilingual MiniLM via fastembed, 384-dim, CPU, no key). It is not chosen
    here: a write must land in the table's space, and moving the table to the
    one Mandate model is a re-embed (mandate/grounding/migrations/reembed_plan.py),
    not a flag. SIGNALS_EMBED_MODEL, which used to override it, is gone: an env
    var that changes the space of new rows is how a table ends up holding two.
  * Storage: signals_chunk_embeddings.embedding, a pgvector vector(384) in
    schema `capital`. signals_embedding_meta records model + dim; changing
    models means a new column dimension and a full re-embed -- vectors from
    different models are not comparable, enforced at startup.
  * Chunking (before embedding): ~1,500-character passages with ~200-character
    overlap, paragraph-aware, each carrying exact char_start/char_end offsets
    back into articles.raw_text — that's what lets a generated claim later
    cite an exact span, not just "the article".
  * The embed step is explicit and RESUMABLE: chunks lacking an embedding row
    are found by anti-join, processed in batches of 128, committed per batch.
    Kill it anytime — the next run picks up where it left off. Monotonic
    progress, not a fragile all-or-nothing job.

Retrieval lives in ETL/lib/signals_retrieval.py (semantic_search +
topic_passages — the guaranteed-coverage path for must-cover topics).

Usage:
  python3 ETL/intelligence/transform/embed_articles.py status
  python3 ETL/intelligence/transform/embed_articles.py run [--limit N]
  python3 ETL/intelligence/transform/embed_articles.py query "text" [-k 5]
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
# --- end ETL path bootstrap ---

import argparse
import os

from store import connect  # noqa: E402
from signals_retrieval import vector_literal  # noqa: E402

from mandate.embedding import (Embedder, column_dim, for_table, space_for_table,  # noqa: E402
                               target_column, vector_column)

#: The registered name of this table in mandate/embedding/spaces.json.
TABLE = "capital.signals_chunk_embeddings"
EMBED_MODEL = space_for_table(TABLE).name
#: The stored space's column (what retrieval reads), and during the one-model
#: move MODEL's column beside it (mandate/ops/one_model.sh).
COL = vector_column(TABLE)
TARGET = target_column(TABLE)
#: signals_embedding_meta describes this column, the original vector(384) one,
#: and nothing else. A column added since is described by spaces.json.
META_COLUMN = "embedding"
CHUNK_CHARS = 1500
CHUNK_OVERLAP = 200
BATCH = 128


# ── Embedder ─────────────────────────────────────────────────────────────────
def get_embedder():
    """The table's embedder (mandate.embedding). Any object with
    .embed(texts) -> list[list[float]], .dim and .model also works (tests)."""
    return for_table(TABLE)


# ── Model guard ──────────────────────────────────────────────────────────────
def ensure_model(con, embedder) -> None:
    """The configured model must be the one the index was built with. Records
    it on first use. The table and its vector(384) column are DDL in
    ETL/schema/corpus_schema.sql, not created here.

    signals_embedding_meta speaks for the original `embedding` column only. Once
    spaces.json stores the table in another column (the one-model flip), the
    guard is that column's declared dimension and spaces.json's space for it."""
    if COL.column != META_COLUMN:
        dim = column_dim(con, COL)
        if dim != embedder.dim or embedder.model != COL.space:
            raise SystemExit(
                f"{TABLE}.{COL.column} is declared {dim}-d in space {COL.space}, but the "
                f"configured embedder is {embedder.model} ({embedder.dim}-d). Run "
                f"migration 036 / mandate/ops/one_model.sh first.")
        return
    meta = con.execute(
        "SELECT model, dim FROM signals_embedding_meta WHERE id = 1").fetchone()
    if meta is None:
        con.execute("INSERT INTO signals_embedding_meta (id, model, dim) VALUES (1, %s, %s)",
                    (embedder.model, embedder.dim))
        con.commit()
    elif meta["model"] != embedder.model or meta["dim"] != embedder.dim:
        raise SystemExit(
            f"signals_embedding_meta says the index was built with {meta['model']} "
            f"(dim {meta['dim']}) but the configured model is "
            f"{embedder.model} (dim {embedder.dim}).\n"
            "Vectors from different models are not comparable. Switching models is "
            "a migration (new vector dimension, full re-embed), not a flag: write "
            "it as one rather than emptying the table from here.")


# ── Chunking with exact source offsets ───────────────────────────────────────
def chunk_with_offsets(text: str) -> list[tuple[str, int, int]]:
    """Paragraph-aware ~CHUNK_CHARS windows with ~CHUNK_OVERLAP overlap.
    Returns (chunk_text, char_start, char_end); offsets index into `text`
    exactly, so downstream claims can cite precise spans."""
    spans: list[tuple[int, int]] = []
    pos = 0
    for para in text.split("\n"):
        if para.strip():
            start = text.index(para, pos)
            spans.append((start, start + len(para)))
            pos = start + len(para)
        else:
            pos += len(para) + 1
    if not spans:
        return []

    chunks: list[tuple[str, int, int]] = []
    i = 0
    while i < len(spans):
        start_i = i
        # A single paragraph longer than the cap: hard-split it with overlap.
        if spans[start_i][1] - spans[start_i][0] > CHUNK_CHARS:
            s, e = spans[start_i]
            while s < e:
                piece_end = min(s + CHUNK_CHARS, e)
                chunks.append((text[s:piece_end], s, piece_end))
                if piece_end >= e:
                    break
                s = piece_end - CHUNK_OVERLAP
            i = start_i + 1
            continue
        # Grow the window paragraph by paragraph.
        end = spans[i][1]
        while i + 1 < len(spans) and spans[i + 1][1] - spans[start_i][0] <= CHUNK_CHARS:
            i += 1
            end = spans[i][1]
        chunks.append((text[spans[start_i][0]:end], spans[start_i][0], end))
        # Overlap: next window re-includes the last paragraph that begins
        # within CHUNK_OVERLAP of this chunk's end, when there is one.
        nxt = i + 1
        for j in range(i, start_i, -1):
            if end - spans[j][0] <= CHUNK_OVERLAP:
                nxt = j
                break
        i = max(nxt, start_i + 1)
    return chunks


# ── Commands ─────────────────────────────────────────────────────────────────
def cmd_status(_args) -> None:
    with connect(readonly=True) as con:
        pending_chunk = con.execute(
            """SELECT COUNT(*) FROM signals_articles a WHERE a.full_text_fetched = 1
               AND NOT EXISTS (SELECT 1 FROM signals_article_chunks c
                               WHERE c.article_id = a.id)""").fetchone()[0]
        chunks = con.execute("SELECT COUNT(*) FROM signals_article_chunks").fetchone()[0]
        meta = con.execute(
            "SELECT model, dim FROM signals_embedding_meta WHERE id = 1").fetchone()
        embedded = con.execute(
            "SELECT COUNT(*) FROM signals_chunk_embeddings").fetchone()[0]
    print(f"hydrated articles awaiting chunking: {pending_chunk:,}")
    print(f"chunks stored: {chunks:,}")
    if meta:
        print(f"index: {meta[0]} (dim {meta[1]}) · embeddings: {embedded:,}")
    else:
        print("index: not yet created (first `run` creates it)")


def cmd_run(args) -> None:
    embedder = get_embedder()
    with connect(dict_rows=True) as con:
        ensure_model(con, embedder)
        # The one-model move: once migration 036 has added MODEL's column, new
        # chunks are embedded in both spaces, so the flip finds every row complete.
        target = Embedder(TARGET.space) if TARGET and column_dim(con, TARGET) else None
        _run(con, embedder, args.limit, target)


def _run(con, embedder, limit: int | None, target=None) -> None:
    """Chunk, then embed. Commits per article and per batch, so it is kill-safe.
    `target`, when given, also writes TARGET's column for each new chunk."""

    # Phase 1 — chunk hydrated articles that have no chunks yet.
    sql = """SELECT a.id, a.title, a.raw_text FROM signals_articles a
             WHERE a.full_text_fetched = 1
             AND NOT EXISTS (SELECT 1 FROM signals_article_chunks c WHERE c.article_id = a.id)
             ORDER BY a.id"""
    if limit:
        sql += f" LIMIT {int(limit)}"
    new_chunks = 0
    for r in con.execute(sql).fetchall():
        pieces = chunk_with_offsets(r["raw_text"])
        if pieces:
            # Title prepended to the first chunk anchors headline retrieval;
            # its offsets still cover the first body span.
            rows = [(r["id"], 0, f"{r['title']}\n{pieces[0][0]}",
                     pieces[0][1], pieces[0][2])]
            rows += [(r["id"], idx + 1, t, cs, ce)
                     for idx, (t, cs, ce) in enumerate(pieces[1:])]
        else:
            rows = [(r["id"], 0, r["title"], 0, 0)]
        con.cursor().executemany(
            "INSERT INTO signals_article_chunks "
            "(article_id, chunk_index, chunk_text, char_start, char_end) "
            "VALUES (%s,%s,%s,%s,%s) ON CONFLICT (article_id, chunk_index) DO NOTHING",
            rows)
        con.commit()
        new_chunks += len(rows)

    # Phase 2 — embed every chunk lacking a vector (anti-join = resumable).
    todo = con.execute("""
        SELECT c.id, c.chunk_text FROM signals_article_chunks c
        WHERE NOT EXISTS (SELECT 1 FROM signals_chunk_embeddings e WHERE e.chunk_id = c.id)
        ORDER BY c.id""").fetchall()
    # ...and every row with no vector in the STORED column (written by older
    # code after the one-model flip): healed in place.
    heal = con.execute(f"""
        SELECT c.id, c.chunk_text FROM signals_chunk_embeddings e
        JOIN signals_article_chunks c ON c.id = e.chunk_id
        WHERE e.{COL.column} IS NULL ORDER BY c.id""").fetchall()
    print(f"chunked {new_chunks:,} new; embedding {len(todo):,} chunks "
          f"({embedder.model}, batches of {BATCH})")
    done = 0
    for i in range(0, len(todo), BATCH):
        batch = todo[i:i + BATCH]
        texts = [b["chunk_text"] for b in batch]
        vecs = embedder.embed(texts)
        if target is not None:
            extra = target.embed(texts)
            con.cursor().executemany(
                f"INSERT INTO signals_chunk_embeddings (chunk_id, {COL.column}, {TARGET.column}) "
                f"VALUES (%s, %s{COL.cast}, %s{TARGET.cast})",
                [(b["id"], vector_literal(v), vector_literal(x))
                 for b, v, x in zip(batch, vecs, extra, strict=True)])
        else:
            con.cursor().executemany(
                f"INSERT INTO signals_chunk_embeddings (chunk_id, {COL.column}) "
                f"VALUES (%s, %s{COL.cast})",
                [(b["id"], vector_literal(v)) for b, v in zip(batch, vecs)])
        con.commit()                      # per-batch commit — kill-safe
        done += len(batch)
        if done % (BATCH * 8) == 0:
            print(f"  {done:,}/{len(todo):,}")
    for i in range(0, len(heal), BATCH):
        batch = heal[i:i + BATCH]
        vecs = embedder.embed([b["chunk_text"] for b in batch])
        con.cursor().executemany(
            f"UPDATE signals_chunk_embeddings SET {COL.column} = %s{COL.cast} "
            f"WHERE chunk_id = %s AND {COL.column} IS NULL",
            [(vector_literal(v), b["id"]) for b, v in zip(batch, vecs, strict=True)])
        con.commit()
    if heal:
        print(f"healed {len(heal):,} rows that had no {COL.column}")
    print(f"done: {done:,} embeddings written.")


def cmd_query(args) -> None:
    from signals_retrieval import semantic_search
    hits = semantic_search(args.text, k=args.k)
    if not hits:
        print("no results — is the index populated? (run `status`)")
    for h in hits:
        head = " ".join(h["chunk_text"].split())[:150]
        print(f"[{h['similarity']:.3f}] {h['source_key']} · {h['published_at']} · "
              f"{h['title'][:70]}\n        {head}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status").set_defaults(fn=cmd_status)
    p = sub.add_parser("run")
    p.add_argument("--limit", type=int)
    p.set_defaults(fn=cmd_run)
    q = sub.add_parser("query")
    q.add_argument("text")
    q.add_argument("-k", type=int, default=5)
    q.set_defaults(fn=cmd_query)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
