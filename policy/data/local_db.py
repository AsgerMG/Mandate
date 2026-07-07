"""Persistent, zero-infra local database.

When ``DATABASE_URL`` is ``local`` (the default), the app runs against an
embedded Postgres+pgvector stored under ``.localdb/`` in the project root — no
Docker, no managed service, no accounts. Unlike the throwaway server used in
tests, this data directory persists, so the corpus survives between runs.

Point ``DATABASE_URL`` at a managed Postgres (e.g. Neon) when you want a
durable, shared corpus instead.
"""

from __future__ import annotations

from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
LOCAL_DB_DIR = PROJECT_ROOT / ".localdb"

_server = None  # keep the handle alive for the process lifetime


def ensure_local_db() -> str:
    """Start (or reuse) the persistent embedded Postgres and return its URL."""
    global _server
    try:
        import pgserver
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError(
            "Local DB mode needs the 'pgserver' package. Install it (it ships "
            "with the project deps) or set DATABASE_URL to a real Postgres."
        ) from exc

    LOCAL_DB_DIR.mkdir(parents=True, exist_ok=True)
    _server = pgserver.get_server(str(LOCAL_DB_DIR))
    _server.psql("CREATE EXTENSION IF NOT EXISTS vector")
    # Adapt the libpq URI to SQLAlchemy's psycopg driver.
    return _server.get_uri().replace("postgresql://", "postgresql+psycopg://", 1)
