"""An ephemeral Postgres in the production layout, for a test that writes.

    import ephemeral_pg
    ephemeral_pg.start()          # BEFORE anything opens a connection
    from store import connect     # now reaches the ephemeral database only

What a test gets: a NEW database (never an existing one) with pgvector in
`public`, schema `capital` built from ETL/schema/corpus_schema.sql, and
`search_path = capital, public` as a database default -- the same resolution
the capital_app role gives production, so unqualified SQL means the same thing.

Where the server comes from:
  * CAPITAL_TEST_DATABASE_URL, if set: an admin URL to a throwaway server (a CI
    service container). A fresh database is created on it; nothing existing is
    touched.
  * otherwise pgserver, which starts a private Postgres in a temp directory
    (`pip install pgserver`; policy/.venv has it).

THE HAZARD THIS GUARDS. store.connect() reads DATABASE_URL, and a read-only
connection prefers CAPITAL_RO_DATABASE_URL; capital/.env.local sets both to the
REAL shared store. A test that set only DATABASE_URL would write here and read
production. start() sets both, and `assert_isolated()` refuses to continue
unless both resolve to the database it created.
"""
from __future__ import annotations

import atexit
import os
import shutil
import sys
import tempfile
import uuid
from pathlib import Path

import psycopg
from psycopg.conninfo import conninfo_to_dict, make_conninfo

sys.path.insert(0, str(Path(__file__).resolve().parent))
import etl_env  # noqa: E402  (loads .env.local FIRST, so we override it below, not it us)
from store import READONLY_ENV, _url  # noqa: E402

#: The corpus tables. NOT postgres_schema.sql, the product tables: that file is
#: dumped from information_schema and does not replay (a bare `ARRAY` column
#: type), so a test that needs one of those tables creates the columns it reads.
DDL = [Path(__file__).resolve().parents[1] / "schema" / "corpus_schema.sql"]

_started: str | None = None


def _server_url() -> str:
    url = os.environ.get("CAPITAL_TEST_DATABASE_URL")
    if url:
        return url
    try:
        import pgserver
    except ImportError:
        raise SystemExit(
            "no test Postgres: set CAPITAL_TEST_DATABASE_URL, or run with an "
            "interpreter that has pgserver (policy/.venv/bin/python).")
    data_dir = tempfile.mkdtemp(prefix="capital_pgtest_")
    server = pgserver.get_server(data_dir)

    def _stop() -> None:
        try:
            server.cleanup()
        finally:
            shutil.rmtree(data_dir, ignore_errors=True)
    atexit.register(_stop)
    return server.get_uri()


def start() -> str:
    """Create the database, build the schema, point store.py at it. Idempotent."""
    global _started
    if _started:
        return _started
    production = {(os.environ.get("DATABASE_URL") or "").strip(),
                  (os.environ.get(READONLY_ENV) or "").strip()} - {""}
    admin = _server_url()
    if admin.strip() in production:
        raise SystemExit("CAPITAL_TEST_DATABASE_URL is the production store. Refusing.")
    name = f"capital_test_{uuid.uuid4().hex[:10]}"
    with psycopg.connect(admin, autocommit=True) as c:
        c.execute(f'CREATE DATABASE "{name}"')
    url = make_conninfo(admin, dbname=name)
    with psycopg.connect(url, autocommit=True) as c:
        c.execute("CREATE EXTENSION IF NOT EXISTS vector SCHEMA public")
        c.execute("CREATE SCHEMA capital")
        c.execute(f'ALTER DATABASE "{name}" SET search_path = capital, public')
        c.execute("SET search_path = capital, public")
        for f in DDL:
            c.execute(f.read_text())
    os.environ["DATABASE_URL"] = url
    os.environ[READONLY_ENV] = url
    _started = url
    assert_isolated()
    return url


def assert_isolated() -> None:
    """Both store.py URLs must be the ephemeral database. Called by start(); a
    test may call it again before its first write."""
    if not _started:
        raise SystemExit("ephemeral_pg.start() has not run")
    want = conninfo_to_dict(_started).get("dbname")
    for readonly in (False, True):
        got = conninfo_to_dict(_url(readonly)).get("dbname")
        if got != want:
            raise SystemExit(f"store.py (readonly={readonly}) resolves to {got!r}, "
                             f"not the ephemeral {want!r}. Refusing to run.")
