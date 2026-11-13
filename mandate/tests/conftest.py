"""Shared fixtures: one ephemeral Postgres in the production layout per session.

Run:  PYTHONPATH=<repo root> policy/.venv/bin/python -m pytest mandate/tests
"""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

import psycopg
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

# The bench's store root: every test that writes a bench conversation or a
# feedback item writes HERE, never into the owner's ~/Mandate-backups/bench
# (the app shows that folder; test runs titled "t" once polluted it). Set at
# import, before any module reads it; run_conversation.write also refuses to
# write under pytest into the real folder.
os.environ["MANDATE_BENCH_DATA"] = tempfile.mkdtemp(prefix="mandate-bench-test-")

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
