"""Shared test fixtures.

`db_session` stands up an ephemeral, real Postgres in the PRODUCTION layout:
pgvector in `public`, schema `grounding` built by mandate/db/grounding.sql with
its real grants and append-only triggers (mandate.grounding.testing.
EphemeralMandate), policy's tables created by its own models in `policy`, and
the grounded views over both. Tests connect as `policy_app`, so a write policy
may not make in production fails here too.

HALFVEC. The local pgserver bundles pgvector 0.6, which predates halfvec; there
(and only there) grounding's halfvec column is a vector. CI's policy job runs on
the same pgserver; mandate-ci's pgvector:pg18 container runs the real type. Set
MANDATE_TEST_DATABASE_URL to an admin URL of a pgvector>=0.7 server to run this
suite on halfvec too.
"""

from __future__ import annotations

import shutil
import tempfile
from collections.abc import Iterator

import psycopg
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from data import grounding_bridge
from data import models  # noqa: F401  (register tables on Base.metadata)
from data.base import Base
from data.session import ensure_schema, hnsw_connect_options
from mandate.grounding import FilesystemBucket, set_bucket
from mandate.grounding.testing import EphemeralMandate

GROUNDING_TABLES = "passage_embeddings, passages, fetches, document_versions, documents, sources"


@pytest.fixture(scope="session")
def mandate_db() -> Iterator[EphemeralMandate]:
    with EphemeralMandate() as db:
        yield db


@pytest.fixture(scope="session")
def pg_engine(mandate_db):
    url = mandate_db.url("policy_app")
    engine = create_engine(
        "postgresql+psycopg://",
        creator=lambda: psycopg.connect(url, options=hnsw_connect_options()),
        future=True,
    )
    with engine.begin() as conn:
        ensure_schema(conn)
    Base.metadata.create_all(engine)
    with engine.begin() as conn:
        grounding_bridge.install(conn)
    bucket_dir = tempfile.mkdtemp(prefix="policy_grounding_bucket_")
    set_bucket(FilesystemBucket(bucket_dir))
    try:
        yield engine
    finally:
        set_bucket(None)
        shutil.rmtree(bucket_dir, ignore_errors=True)
        engine.dispose()


def reset_database(pg_engine, mandate_db) -> None:
    """Empty every policy table and the grounding store (the latter only as the
    admin, with the reviewed-migration override: grounding refuses it otherwise)."""
    tables = ", ".join(t.name for t in reversed(Base.metadata.sorted_tables))
    with pg_engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    with psycopg.connect(mandate_db.admin_url) as c:
        c.execute("SET grounding.allow_rewrite = 'on'")
        c.execute(f"TRUNCATE {', '.join('grounding.' + t for t in GROUNDING_TABLES.split(', '))} "
                  "RESTART IDENTITY CASCADE")


@pytest.fixture
def db_session(pg_engine, mandate_db) -> Iterator[Session]:
    """A clean, isolated session per test (truncates all tables afterwards)."""
    factory = sessionmaker(bind=pg_engine, expire_on_commit=False, class_=Session)
    session = factory()
    try:
        yield session
    finally:
        session.rollback()
        session.close()
        reset_database(pg_engine, mandate_db)
