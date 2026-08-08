"""Orchestrator for the news/signals layer (data/signals.sqlite).

The signals pipeline is the SECOND data pipeline next to the events ETL, with a
deliberately different purpose. The events DB (db.sqlite) answers "what have
comparable entities received from public institutions, through which vehicles";
this layer answers "what is happening now and what to anticipate — programme
changes, people to monitor, decisions coming up". Public-awards-intelligence
register throughout: informational and benchmarking, never competitive-urgency
framing (see memory: site-design-guidelines).

Flow (mirrors extract -> transform -> load, see ETL/README.md):

  ETL/extract/news_*.py           BLOCKED — awaiting the curated source registry.
                                  Nothing here scrapes; extractors will write
                                  sources + articles rows when they exist.
  ETL/intelligence/transform/classify_relevance.py   gate BEFORE anything else (Haiku batch)
  ETL/intelligence/transform/entity_link_articles.py NER + lib/matching against db.sqlite
  ETL/intelligence/transform/classify_signals.py     6-type signal taxonomy + impact text
  ETL/intelligence/transform/embed_articles.py       chunk + bge-m3 -> sqlite-vec

Usage:
  python3 ETL/intelligence/load/load_signals.py            # ensure schema + run QA (no-op on empty DB)
  python3 ETL/intelligence/load/load_signals.py --status   # pipeline stage counts
  python3 ETL/intelligence/load/load_signals.py --qa       # QA checks only

The transform stages are run individually (they submit/collect Anthropic
batches on their own cadence); this loader owns schema install + QA so `make
signals` always has a safe entry point.
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB, SIGNALS_DB  # noqa: E402
# --- end ETL path bootstrap ---

import argparse
import sqlite3

SCHEMA = _Path(__file__).resolve().parent / "signals_schema.sql"


def connect(readonly: bool = False) -> sqlite3.Connection:
    if readonly:
        return sqlite3.connect(f"file:{SIGNALS_DB}?mode=ro", uri=True)
    return sqlite3.connect(SIGNALS_DB)


def ensure_schema() -> None:
    con = connect()
    try:
        con.executescript(SCHEMA.read_text())
        con.commit()
    finally:
        con.close()
    print(f"schema ensured → {SIGNALS_DB}")


def status() -> None:
    con = connect(readonly=True)
    try:
        def one(sql: str) -> int:
            return con.execute(sql).fetchone()[0]
        n_sources = one("SELECT COUNT(*) FROM sources WHERE active = 1")
        n_articles = one("SELECT COUNT(*) FROM articles")
        pending = one("SELECT COUNT(*) FROM articles WHERE is_relevant IS NULL")
        relevant = one("SELECT COUNT(*) FROM articles WHERE is_relevant = 1")
        linked = one("SELECT COUNT(*) FROM articles "
                     "WHERE is_relevant = 1 AND entities_extracted_at IS NOT NULL")
        signalled = one("SELECT COUNT(*) FROM articles "
                        "WHERE is_relevant = 1 AND signals_extracted_at IS NOT NULL")
        hydrated = one("SELECT COUNT(*) FROM articles WHERE full_text_fetched = 1")
        chunked = one("SELECT COUNT(DISTINCT article_id) FROM article_chunks")
    finally:
        con.close()
    print(f"sources (active):        {n_sources:>7,}")
    print(f"articles ingested:       {n_articles:>7,}")
    print(f"  awaiting relevance:    {pending:>7,}   (classify_relevance.py)")
    print(f"  relevant:              {relevant:>7,}")
    print(f"  entity-linked:         {linked:>7,}   (entity_link_articles.py)")
    print(f"  signal-tagged:         {signalled:>7,}   (classify_signals.py)")
    print(f"  hydrated (full text):  {hydrated:>7,}   (news_ingest.py hydrate/harvest)")
    print(f"  chunked/embedded:      {chunked:>7,}   (embed_articles.py)")
    if n_sources == 0:
        print("\nNo sources registered yet — extractors are blocked on the "
              "curated source registry. Schema is ready; the transform stages "
              "no-op cleanly until articles arrive.")


def qa() -> int:
    """Integrity checks (invariants, not progress — pending work is shown by
    --status and is normal, not a failure). Returns count of problems."""
    con = connect()
    problems: list[str] = []
    try:
        def one(sql: str) -> int:
            return con.execute(sql).fetchone()[0]

        # The gate is a hard boundary: rejected articles must carry NO
        # downstream rows of any kind.
        # embed-all reorder (2026-07-09): chunks/embeddings exist for ANY
        # hydrated article; only the model-written stages stay gate-bound.
        for table, what in (("article_entities", "entity links"),
                            ("article_signals", "signals")):
            n = one(f"""SELECT COUNT(*) FROM {table} t
                        JOIN articles a ON a.id = t.article_id
                        WHERE a.is_relevant IS NOT 1""")
            if n:
                problems.append(
                    f"{n} {what} attached to articles the gate rejected or has not passed")

        # Cross-DB entity links must resolve to real companies in db.sqlite.
        if DB.exists():
            con.execute("ATTACH DATABASE ? AS events", (str(DB),))
            n = one("""SELECT COUNT(*) FROM article_entities ae
                       WHERE ae.company_id IS NOT NULL
                       AND NOT EXISTS (SELECT 1 FROM events.companies c WHERE c.id = ae.company_id)""")
            if n:
                problems.append(f"{n} entity links point at company ids missing from db.sqlite")
            con.execute("DETACH DATABASE events")
    finally:
        con.close()

    if problems:
        print("✗ signals QA problems:")
        for p in problems:
            print(f"    {p}")
    else:
        print("✓ signals QA clean")
    return len(problems)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--status", action="store_true", help="print pipeline stage counts")
    ap.add_argument("--qa", action="store_true", help="run QA checks only")
    args = ap.parse_args()

    if args.qa:
        _sys.exit(1 if qa() else 0)
    ensure_schema()
    status()
    _sys.exit(1 if qa() else 0)


if __name__ == "__main__":
    main()
