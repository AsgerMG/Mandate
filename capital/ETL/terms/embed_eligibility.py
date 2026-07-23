"""Embed eligibility_gates/eligibility_clauses text into eligibility_embeddings
(Postgres/pgvector) for live RAG retrieval by the founder-facing product.

Architecture (see project-mgmt plan for the full rationale):
  * Chunk grain: one row per gate or clause -- NOT arbitrary character-window
    chunking like ETL/intelligence/transform/embed_articles.py's article
    embedder. Gates/clauses are already short, atomic, well-defined units
    (one requirement + one quote, or one obligation/cumulation/application
    text) -- that IS the chunk, no further splitting needed.
  * Only meaningfully-cited rows are embedded: verification_level IN
    ('llm_cited', 'llm_2pass', 'human_verified'). An llm_classified gate has
    no real quote (a bare model guess off metadata) -- embedding it would
    surface ungrounded guesses in retrieval results, which is exactly the
    failure mode this whole research push was about eliminating.
  * Model: Voyage voyage-3.5 (1024-dim, multilingual -- this corpus spans
    ~20 languages of source quotes). Requires VOYAGE_KEY in .env.local.
  * Storage: pgvector, same Railway Postgres as the rest of the eligibility
    subsystem (not a separate vector DB, not a local flat file) -- this
    corpus tops out around 5,000 chunks, well within a single Postgres
    table + HNSW index, and reuses the connection this migration already
    has rather than standing up a second piece of infrastructure.
  * Resumable: chunks lacking an embedding are found by anti-join
    (UNIQUE (source_type, source_id) + ON CONFLICT DO NOTHING), processed
    in batches, committed per batch -- kill it anytime, re-run picks up
    where it left off. Same discipline as embed_articles.py.

Usage:
  python3 ETL/terms/embed_eligibility.py status
  python3 ETL/terms/embed_eligibility.py run [--limit N]
  python3 ETL/terms/embed_eligibility.py query "text" [-k 5]
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import ROOT  # noqa: E402
# --- end ETL path bootstrap ---

import argparse
import os

import psycopg
import voyageai

MODEL = "voyage-3.5"
DIM = 1024
BATCH = 128
ASSERTABLE_OR_CITED = ("llm_cited", "llm_2pass", "human_verified")


def connect():
    url = os.environ.get("DATABASE_URL")
    if not url:
        _sys.exit("DATABASE_URL not set (add to .env.local)")
    return psycopg.connect(url)


def voyage_client() -> voyageai.Client:
    key = os.environ.get("VOYAGE_KEY")
    if not key:
        _sys.exit("VOYAGE_KEY not set (add to .env.local)")
    return voyageai.Client(api_key=key)


def gate_chunk_text(requirement: str, value: str | None) -> str:
    return f"{requirement}\nValue: {value}" if value else requirement


def cmd_status(_args) -> None:
    conn = connect()
    gates_total = conn.execute(
        "SELECT COUNT(*) FROM eligibility_gates WHERE verification_level = ANY(%s)",
        (list(ASSERTABLE_OR_CITED),),
    ).fetchone()[0]
    clauses_total = conn.execute(
        "SELECT COUNT(*) FROM eligibility_clauses WHERE verification_level = ANY(%s)",
        (list(ASSERTABLE_OR_CITED),),
    ).fetchone()[0]
    embedded = conn.execute("SELECT COUNT(*) FROM eligibility_embeddings").fetchone()[0]
    by_model = conn.execute(
        "SELECT model, COUNT(*) FROM eligibility_embeddings GROUP BY model"
    ).fetchall()
    print(f"eligible gates (cited+):    {gates_total:,}")
    print(f"eligible clauses (cited+):  {clauses_total:,}")
    print(f"total embeddable:           {gates_total + clauses_total:,}")
    print(f"embedded so far:            {embedded:,}")
    for model, n in by_model:
        print(f"  {model}: {n:,}")
    conn.close()


def cmd_run(args) -> None:
    conn = connect()
    client = voyage_client()

    # Gather everything embeddable, left-joined against what's already done
    # (anti-join via NOT EXISTS -- resumable).
    todo: list[tuple[str, int, str, str]] = []  # (source_type, source_id, instrument_id, chunk_text)

    gate_rows = conn.execute(
        """SELECT g.id, g.instrument_id, g.requirement, g.value
           FROM eligibility_gates g
           WHERE g.verification_level = ANY(%s)
             AND NOT EXISTS (
               SELECT 1 FROM eligibility_embeddings e
               WHERE e.source_type = 'gate' AND e.source_id = g.id)
           ORDER BY g.id""",
        (list(ASSERTABLE_OR_CITED),),
    ).fetchall()
    for gid, instrument_id, requirement, value in gate_rows:
        todo.append(("gate", gid, instrument_id, gate_chunk_text(requirement, value)))

    clause_rows = conn.execute(
        """SELECT c.id, c.instrument_id, c.text
           FROM eligibility_clauses c
           WHERE c.verification_level = ANY(%s)
             AND NOT EXISTS (
               SELECT 1 FROM eligibility_embeddings e
               WHERE e.source_type = 'clause' AND e.source_id = c.id)
           ORDER BY c.id""",
        (list(ASSERTABLE_OR_CITED),),
    ).fetchall()
    for cid, instrument_id, text in clause_rows:
        todo.append(("clause", cid, instrument_id, text))

    if args.limit:
        todo = todo[: args.limit]

    print(f"embedding {len(todo):,} chunks ({MODEL}, batches of {BATCH})")
    done = 0
    for i in range(0, len(todo), BATCH):
        batch = todo[i : i + BATCH]
        texts = [t[3] for t in batch]
        result = client.embed(texts, model=MODEL, input_type="document")
        rows = [
            (source_type, source_id, instrument_id, chunk_text, vec, MODEL)
            for (source_type, source_id, instrument_id, chunk_text), vec in zip(
                batch, result.embeddings
            )
        ]
        with conn.cursor() as cur:
            cur.executemany(
                """INSERT INTO eligibility_embeddings
                     (source_type, source_id, instrument_id, chunk_text, embedding, model)
                   VALUES (%s, %s, %s, %s, %s, %s)
                   ON CONFLICT (source_type, source_id) DO NOTHING""",
                rows,
            )
        conn.commit()  # per-batch commit -- kill-safe
        done += len(batch)
        print(f"  {done:,}/{len(todo):,}")
    conn.close()
    print(f"done: {done:,} embeddings written.")


def cmd_query(args) -> None:
    conn = connect()
    client = voyage_client()
    result = client.embed([args.text], model=MODEL, input_type="query")
    vec = result.embeddings[0]
    rows = conn.execute(
        """SELECT e.instrument_id, fi.name, e.source_type, e.chunk_text,
                  1 - (e.embedding <=> %s::vector) AS similarity
           FROM eligibility_embeddings e
           JOIN funding_instruments fi ON fi.id = e.instrument_id
           ORDER BY e.embedding <=> %s::vector
           LIMIT %s""",
        (vec, vec, args.k),
    ).fetchall()
    if not rows:
        print("no results — is the index populated? (run `status`)")
    for instrument_id, name, source_type, chunk_text, similarity in rows:
        head = " ".join(chunk_text.split())[:150]
        print(f"[{similarity:.3f}] {instrument_id} ({name}) · {source_type}\n        {head}")
    conn.close()


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
