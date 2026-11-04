"""Zero-infra local refresh: spin up an ephemeral Postgres+pgvector (pgserver),
run the real pipeline against live EU sources, and print corpus stats.

No Docker, no managed DB, no config needed — useful for offline dev and as a
smoke test of the whole foundation:

    uv run python scripts/run_local_refresh.py --limit 5
"""

from __future__ import annotations

import argparse
import os
import tempfile

import pgserver


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=5, help="max documents per source")
    args = ap.parse_args()

    data_dir = tempfile.mkdtemp(prefix="ept_local_")
    server = pgserver.get_server(data_dir)
    # Point the app at the ephemeral server BEFORE importing app modules, since
    # the engine is built from settings at import time.
    os.environ["DATABASE_URL"] = server.get_uri().replace(
        "postgresql://", "postgresql+psycopg://", 1
    )

    try:
        from sqlalchemy import func, select

        from data import init_db, session_scope
        from data.config import get_settings
        from data.models import Document, DocumentVersion, Passage, Source
        from data.seeds import seed_vocabularies
        from etl.adapters import ADAPTERS
        from etl.http import HttpClient
        from etl.pipeline import run_adapter

        init_db()
        with session_scope() as s:
            seed_vocabularies(s)

        settings = get_settings()
        print(f"Running refresh (limit={args.limit}/source) …\n")
        with HttpClient(settings) as http, session_scope() as s:
            for cls in ADAPTERS:
                stats = run_adapter(s, cls(http, settings), limit=args.limit)
                print(f"  {cls.key:16} {stats}")

        with session_scope() as s:
            docs = s.scalar(select(func.count(Document.id)))
            vers = s.scalar(select(func.count(DocumentVersion.id)))
            passages = s.scalar(select(func.count(Passage.id)))
            print(f"\nCorpus: {docs} documents, {vers} versions, {passages} passages")

            print("\nBy source / type / stage:")
            rows = s.execute(
                select(Source.key, Document.document_type, Document.lifecycle_stage, func.count())
                .join(Document, Document.source_id == Source.id)
                .group_by(Source.key, Document.document_type, Document.lifecycle_stage)
                .order_by(Source.key)
            ).all()
            for key, dtype, stage, n in rows:
                print(f"  {key:14} {dtype.value:13} {stage.value:13} {n}")

            print("\nSample documents:")
            for d in s.scalars(select(Document).limit(6)):
                print(f"  [{d.lifecycle_stage.value:12}] {d.external_id:12} {d.title[:60]}")
    finally:
        server.cleanup()


if __name__ == "__main__":
    main()
