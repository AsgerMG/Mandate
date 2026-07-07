"""Shared test fixtures.

`db_session` stands up an ephemeral, real Postgres (via pgserver) with pgvector
enabled and the full schema created — so the pipeline's persistence logic is
exercised against the same database engine production uses, not a SQLite stand-in.
"""

from __future__ import annotations

import tempfile
from collections.abc import Iterator

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from data import models  # noqa: F401  (register tables on Base.metadata)
from data.base import Base


@pytest.fixture(scope="session")
def pg_engine():
    import pgserver

    data_dir = tempfile.mkdtemp(prefix="ept_pgtest_")
    server = pgserver.get_server(data_dir)
    # pgserver hands back a libpq URI; adapt it to SQLAlchemy's psycopg driver.
    url = server.get_uri().replace("postgresql://", "postgresql+psycopg://", 1)
    engine = create_engine(url, future=True)
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    Base.metadata.create_all(engine)
    try:
        yield engine
    finally:
        engine.dispose()
        server.cleanup()


@pytest.fixture
def db_session(pg_engine) -> Iterator[Session]:
    """A clean, isolated session per test (truncates all tables afterwards)."""
    factory = sessionmaker(bind=pg_engine, expire_on_commit=False, class_=Session)
    session = factory()
    try:
        yield session
    finally:
        session.rollback()
        session.close()
        tables = ", ".join(t.name for t in reversed(Base.metadata.sorted_tables))
        with pg_engine.begin() as conn:
            conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
