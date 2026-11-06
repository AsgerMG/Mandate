"""The health check reads the run log and names what is out of target."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from mandate.health import check as H  # noqa: E402
from mandate.runs import RunLog  # noqa: E402

T = json.loads(H.TARGETS.read_text())


def _ids(mdb):
    with psycopg.connect(mdb.url("capital_ro")) as c:
        return {f.id: f for f in H.check(c, T)}


def test_policy_freshness_and_its_sources_come_from_mandate_runs(mdb):
    url = mdb.url("policy_app")
    old = RunLog.start(url, brain="policy", kind="policy_refresh", strict=True)
    old.finish("ok", detail={"sources": {"eurlex": {"ok": True}}})
    with psycopg.connect(mdb.admin_url, autocommit=True) as c:
        c.execute("UPDATE mandate.runs SET finished_at = now() - interval '20 days' WHERE id = %s", (old.id,))
    f = _ids(mdb)
    assert "brain:policy" in f and "source:policy:eurlex" in f and f["brain:policy"].since
    new = RunLog.start(url, brain="policy", kind="policy_refresh", strict=True)
    new.finish("partial", detail={"sources": {"eurlex": {"ok": True}, "consultations": {"ok": False}}})
    f = _ids(mdb)
    assert "brain:policy" not in f and "source:policy:eurlex" not in f
    assert "source:policy:consultations" in f


def test_a_run_that_died_is_reported_as_stuck(mdb):
    log = RunLog.start(mdb.url("capital_app"), brain="capital", kind="capital_etl", strict=True)
    with psycopg.connect(mdb.admin_url, autocommit=True) as c:
        c.execute("UPDATE mandate.runs SET heartbeat_at = now() - interval '13 hours' WHERE id = %s", (log.id,))
    assert f"stuck:{log.id}" in _ids(mdb)


def test_what_cannot_be_checked_is_a_breach_not_a_pass(mdb):
    f = _ids(mdb)          # this database has no capital corpus tables
    assert "could not be checked" in f["embedded"].what
