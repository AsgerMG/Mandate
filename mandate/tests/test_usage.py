"""The usage log: mandate.tool_calls, its writers' grants, and the 30-day view."""
from __future__ import annotations

import psycopg
import pytest
from fastapi.testclient import TestClient

from mandate import usage
from mandate.api.app import Config, create_app
from mandate.grounding.testing import EphemeralMandate

TOKEN = "test-token"
H = {"Authorization": f"Bearer {TOKEN}"}


@pytest.fixture(scope="module")
def mdb():
    with EphemeralMandate() as db:
        yield db


def _call(**kw):
    return {"brain": "wincent", "tool": "find_precedents", "args": {"institution": "Bpifrance"},
            "args_summary": "institution=Bpifrance", "result_count": 5, "citations": 2,
            "tables": ["capital.public_funding_events", "capital.public_equity_stakes"],
            "sources": ["satr"], "ms": 120, **kw}


def test_the_args_hash_is_canonical_json():
    assert usage.args_hash({"b": 1, "a": "é"}) == usage.args_hash({"a": "é", "b": 1})
    # the same bytes the TypeScript side hashes: {"a":"é","b":1}
    import hashlib
    assert usage.args_hash({"b": 1, "a": "é"}) == hashlib.sha256('{"a":"é","b":1}'.encode()).hexdigest()


def test_normalise_refuses_an_unknown_brain_or_caller():
    with pytest.raises(usage.UsageError):
        usage.normalise({"brain": "nobody", "tool": "x"})
    with pytest.raises(usage.UsageError):
        usage.normalise({"brain": "regina", "tool": "x", "caller": "website"})
    with pytest.raises(usage.UsageError):
        usage.normalise({"brain": "regina", "tool": ""})


def test_the_api_records_calls_and_the_view_reports_them_per_table(mdb, bucket):
    c = TestClient(create_app(Config(database_url=mdb.url("mandate_app"), reference_url="", token=TOKEN)))
    r = c.post("/usage/tool_calls", headers=H, json={"calls": [
        _call(mission_id="m1"), _call(mission_id="m1", ok=False, error="timeout", result_count=0, citations=0)]})
    assert r.status_code == 200, r.text
    assert r.json() == {"recorded": 2}
    assert c.post("/usage/tool_calls", headers=H, json={"calls": [{"brain": "x", "tool": "y"}]}).status_code == 422
    with psycopg.connect(mdb.url("capital_ro")) as con:
        rows = con.execute(
            "SELECT table_name, calls, failed, missions, results, citations FROM mandate.brain_usage_30d"
            " WHERE brain = 'wincent' AND tool = 'find_precedents' ORDER BY table_name").fetchall()
    assert rows == [("capital.public_equity_stakes", 2, 1, 1, 5, 2), ("capital.public_funding_events", 2, 1, 1, 5, 2)]


def test_the_log_is_append_only_and_regina_may_write_it(mdb):
    with psycopg.connect(mdb.url("policy_app")) as con:
        assert usage.record(con, [{"brain": "regina", "tool": "search", "caller": "search",
                                   "args": {"q": "x"}, "result_count": 3}]) == 1
        con.commit()
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            con.execute("DELETE FROM mandate.tool_calls")
    with psycopg.connect(mdb.url("mandate_app")) as con, pytest.raises(psycopg.errors.RaiseException):
        con.execute("UPDATE mandate.tool_calls SET ok = false")
    with psycopg.connect(mdb.url("capital_ro")) as con, pytest.raises(
            (psycopg.errors.InsufficientPrivilege, psycopg.errors.ReadOnlySqlTransaction)):
        con.execute("INSERT INTO mandate.tool_calls (brain, tool) VALUES ('regina', 'x')")
