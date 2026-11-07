"""A policy refresh leaves a row in mandate.runs that outlives the process."""
from __future__ import annotations

import psycopg
import pytest

# The repo's mandate/ is put first by tests/conftest.py, before collection.
from etl import api  # noqa: E402


@pytest.fixture(scope="module")
def mdb():
    from mandate.grounding.testing import EphemeralMandate
    with EphemeralMandate() as db:
        yield db


def test_refresh_is_recorded_with_per_source_outcomes(mdb, monkeypatch):
    monkeypatch.setattr(api, "_durable_url", lambda: mdb.url("policy_app"))
    started, _ = api._try_start_refresh()
    assert started
    api._note_progress()
    api._finish_refresh(ok=True, error=None,
                        result={"eurlex": {"new": 3}, "consultations": {"crashed": True, "error": "403"},
                                "_enrichment": {}})
    with psycopg.connect(mdb.url("capital_ro")) as c:
        status, summary, detail = c.execute(
            "SELECT status, summary, detail FROM mandate.runs WHERE brain = 'policy' "
            "ORDER BY id DESC LIMIT 1").fetchone()
    assert status == "partial" and "consultations" in summary
    assert detail["sources"]["eurlex"] == {"ok": True}
    assert detail["sources"]["consultations"]["ok"] is False


def test_an_unreachable_record_never_blocks_a_refresh(monkeypatch):
    monkeypatch.setattr(api, "_durable_url", lambda: "postgresql://x@127.0.0.1:1/none")
    started, _ = api._try_start_refresh()
    assert started
    api._finish_refresh(ok=False, result={}, error="boom")
    assert api.refresh_status()["ok"] is False
