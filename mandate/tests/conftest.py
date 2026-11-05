"""Shared fixtures: one ephemeral Postgres in the production layout per session.

Run:  PYTHONPATH=<repo root> policy/.venv/bin/python -m pytest mandate/tests
"""
from __future__ import annotations

import sys
from pathlib import Path

import psycopg
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from mandate.grounding import FilesystemBucket, set_bucket  # noqa: E402
from mandate.grounding.testing import EphemeralMandate  # noqa: E402


@pytest.fixture(scope="session")
def mdb():
    with EphemeralMandate() as db:
        yield db


@pytest.fixture
def bucket(tmp_path):
    b = FilesystemBucket(tmp_path / "bucket")
    set_bucket(b)
    yield b
    set_bucket(None)


@pytest.fixture
def con(mdb, bucket):
    """A connection as capital_app, rolled back after the test."""
    c = psycopg.connect(mdb.url("capital_app"))
    try:
        yield c
    finally:
        c.rollback()
        c.close()
