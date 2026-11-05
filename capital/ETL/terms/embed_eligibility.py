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
  * Model: whatever mandate/embedding/spaces.json says this table is stored in
    (`for_table(TABLE)`): new rows must share the space of the rows already
    there, so a write uses the table's space, never a model chosen here.
    Requires VOYAGE_KEY (or VOYAGE_API_KEY) in .env.local.
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
from store import connect  # noqa: E402
# --- end ETL path bootstrap ---

import argparse
import json
import os

from mandate.embedding import Embedder, EmbeddingError, for_table, space_for_table

#: The registered name of this table in mandate/embedding/spaces.json.
TABLE = "capital.eligibility_embeddings"
#: What the `model` column records: the table's space, by definition.
MODEL = space_for_table(TABLE).name
DIM = space_for_table(TABLE).dim
BATCH = 128
# Read, not restated. This used to be a hand-written tuple beside a TypeScript
# Set holding the same policy, and they diverged the day `register_derived` was
# added: the read path showed those gates on the row while this list silently
# refused to embed them, so the advisor could display a fact it could not
# retrieve. contracts/evidence_tiers.json is the one definition; verdict.ts
# imports the same file.
ASSERTABLE_OR_CITED = tuple(json.loads(
    (ROOT / "website" / "frontend" / "lib" / "intelligence" /
     "evidenceTiers.json").read_text())["attributable"]["tiers"])


def voyage_client() -> Embedder:
    try:
        return for_table(TABLE)
    except EmbeddingError as e:
        _sys.exit(f"{e} (add it to .env.local)")


def gate_chunk_text(requirement: str, value: str | None) -> str:
    return f"{requirement}\nValue: {value}" if value else requirement


def cmd_status(_args) -> None:
    with connect(readonly=True) as conn:
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
        # There is deliberately no FK from eligibility_embeddings (see
        # postgres_schema.sql), so drift is possible and must be reported rather
        # than enforced: orphaned rows point at an instrument that no longer
        # exists, stale rows at a gate/clause key that no longer exists. Both are
        # harmless for retrieval (never joined) but signal the corpus moved.
        orphaned = conn.execute(
            """SELECT COUNT(*) FROM eligibility_embeddings e
               WHERE NOT EXISTS (SELECT 1 FROM funding_instruments fi WHERE fi.id = e.instrument_id)"""
        ).fetchone()[0]
        stale = conn.execute(
            """SELECT COUNT(*) FROM eligibility_embeddings e
               WHERE e.source_type = 'gate' AND NOT EXISTS (
                       SELECT 1 FROM eligibility_gates g
                       WHERE g.instrument_id = e.instrument_id AND g.gate_key = e.source_key)
                  OR e.source_type = 'clause' AND NOT EXISTS (
                       SELECT 1 FROM eligibility_clauses c
                       WHERE c.instrument_id = e.instrument_id
                         AND c.clause_type || '::' || c.clause_key = e.source_key)"""
        ).fetchone()[0]
        print(f"eligible gates (cited+):    {gates_total:,}")
        print(f"eligible clauses (cited+):  {clauses_total:,}")
        print(f"total embeddable:           {gates_total + clauses_total:,}")
        print(f"embedded so far:            {embedded:,}")
        for model, n in by_model:
            print(f"  {model}: {n:,}")
        print(f"orphaned (no instrument):   {orphaned:,}")
        print(f"stale (key gone):           {stale:,}")


def prune_orphans(conn) -> int:
    """Drop embeddings whose gate or clause no longer exists.

    Re-running the pipeline must converge on the corpus as it is now. Without
    this, a gate that was retired, re-keyed or quarantined leaves its vector
    behind, and retrieval keeps surfacing a rule no fund has any more — the
    failure is invisible, because the answer still looks well-sourced.

    Part of the normal run rather than a command to remember: a reconcile step
    that has to be invoked by hand is one that stops being invoked.
    """
    with conn.cursor() as cur:
        cur.execute("""
            DELETE FROM eligibility_embeddings e
             WHERE (e.source_type = 'gate'
                    AND NOT EXISTS (SELECT 1 FROM eligibility_gates g
                                     WHERE g.instrument_id = e.instrument_id
                                       AND g.gate_key = e.source_key))
                OR NOT EXISTS (SELECT 1 FROM funding_instruments fi
                                WHERE fi.id = e.instrument_id)
        """)
        n = cur.rowcount or 0
    conn.commit()
    return n


def cmd_run(args) -> None:
    # --dry-run: what would be pruned and embedded, from the store as it is,
    # without calling Voyage and without writing. Read-only session.
    with connect(readonly=args.dry_run) as conn:
        if args.dry_run:
            dropped = conn.execute("""
                SELECT count(*) FROM eligibility_embeddings e
                 WHERE (e.source_type = 'gate'
                        AND NOT EXISTS (SELECT 1 FROM eligibility_gates g
                                         WHERE g.instrument_id = e.instrument_id
                                           AND g.gate_key = e.source_key))
                    OR NOT EXISTS (SELECT 1 FROM funding_instruments fi
                                    WHERE fi.id = e.instrument_id)""").fetchone()[0]
            print(f"dry run: would prune {dropped:,} embeddings whose gate or instrument is gone")
        else:
            client = voyage_client()
            dropped = prune_orphans(conn)
            if dropped:
                print(f"pruned {dropped:,} embeddings whose gate or instrument is gone")

        # Gather everything embeddable, anti-joined against what's already done
        # (resumable). Anti-join is on the NATURAL key, not the surrogate id: gate
        # ids were re-issued by every truncate-and-reload publish (retired
        # 2026-11-05), and a natural key is right regardless: an id-based anti-join
        # re-embedded the whole corpus after each reload.
        todo: list[tuple[str, str, str, str]] = []  # (source_type, source_key, instrument_id, chunk_text)

        gate_rows = conn.execute(
            """SELECT g.gate_key, g.instrument_id, g.requirement, g.value
               FROM eligibility_gates g
               WHERE g.verification_level = ANY(%s)
                 AND NOT EXISTS (
                   SELECT 1 FROM eligibility_embeddings e
                   WHERE e.source_type = 'gate'
                     AND e.instrument_id = g.instrument_id
                     AND e.source_key = g.gate_key)
               ORDER BY g.instrument_id, g.gate_key""",
            (list(ASSERTABLE_OR_CITED),),
        ).fetchall()
        for gate_key, instrument_id, requirement, value in gate_rows:
            todo.append(("gate", gate_key, instrument_id, gate_chunk_text(requirement, value)))

        clause_rows = conn.execute(
            """SELECT c.clause_type || '::' || c.clause_key AS source_key,
                      c.instrument_id, c.text
               FROM eligibility_clauses c
               WHERE c.verification_level = ANY(%s)
                 AND NOT EXISTS (
                   SELECT 1 FROM eligibility_embeddings e
                   WHERE e.source_type = 'clause'
                     AND e.instrument_id = c.instrument_id
                     AND e.source_key = c.clause_type || '::' || c.clause_key)
               ORDER BY c.instrument_id, source_key""",
            (list(ASSERTABLE_OR_CITED),),
        ).fetchall()
        for source_key, instrument_id, text in clause_rows:
            todo.append(("clause", source_key, instrument_id, text))

        if args.limit:
            todo = todo[: args.limit]

        if args.dry_run:
            print(f"dry run: would embed {len(todo):,} chunks ({MODEL}); nothing called, nothing written")
            return
        print(f"embedding {len(todo):,} chunks ({MODEL}, batches of {BATCH})")
        done = 0
        for i in range(0, len(todo), BATCH):
            batch = todo[i : i + BATCH]
            texts = [t[3] for t in batch]
            vectors = client.embed_documents(texts)
            rows = [
                (source_type, source_key, instrument_id, chunk_text, vec, MODEL)
                for (source_type, source_key, instrument_id, chunk_text), vec in zip(
                    batch, vectors, strict=True
                )
            ]
            with conn.cursor() as cur:
                cur.executemany(
                    """INSERT INTO eligibility_embeddings
                         (source_type, source_key, instrument_id, chunk_text, embedding, model)
                       VALUES (%s, %s, %s, %s, %s, %s)
                       ON CONFLICT (source_type, instrument_id, source_key) DO NOTHING""",
                    rows,
                )
            conn.commit()  # per-batch commit -- kill-safe
            done += len(batch)
            print(f"  {done:,}/{len(todo):,}")
        print(f"done: {done:,} embeddings written. {client.usage.line()}")


def cmd_query(args) -> None:
    with connect(readonly=True) as conn:
        client = voyage_client()
        vec = client.embed_query(args.text)
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


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status").set_defaults(fn=cmd_status)
    p = sub.add_parser("run")
    p.add_argument("--limit", type=int)
    p.add_argument("--dry-run", action="store_true",
                   help="count what would be pruned and embedded; no Voyage call, no write")
    p.set_defaults(fn=cmd_run)
    q = sub.add_parser("query")
    q.add_argument("text")
    q.add_argument("-k", type=int, default=5)
    q.set_defaults(fn=cmd_query)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
