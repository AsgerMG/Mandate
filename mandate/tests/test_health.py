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


def test_a_source_failing_run_after_run_cannot_go_silent(mdb):
    """Run 115: ten policy sources crashed, invisibly, for weeks. A permanent
    error (403, 404) is flagged on its first run with the error named; a single
    transient one (503, 429, network) gets one more run to recover; a run of
    transient failures past twice the cadence is flagged too."""
    url = mdb.url("policy_app")

    def run(sources, age_days):
        r = RunLog.start(url, brain="policy", kind="policy_refresh", strict=True)
        r.finish("partial", detail={"sources": sources})
        with psycopg.connect(mdb.admin_url, autocommit=True) as c:
            c.execute("UPDATE mandate.runs SET finished_at = now() - make_interval(days => %s) "
                      "WHERE id = %s", (age_days, r.id))

    ok = {"ok": True}
    t503 = {"ok": False, "transient": True, "error": "503 Service Unavailable"}
    t403 = {"ok": False, "transient": False, "error": "403 Forbidden"}
    run({"hs_blip": ok, "hs_flaky": ok, "hs_blocked": ok}, 21)
    run({"hs_blip": ok, "hs_flaky": t503, "hs_blocked": ok}, 14)
    run({"hs_blip": t503, "hs_flaky": t503, "hs_blocked": t403, "hs_new": t503}, 0)
    f = _ids(mdb)
    assert "source:policy:hs_blocked" in f and "403" in f["source:policy:hs_blocked"].what
    assert "source:policy:hs_blip" not in f          # one transient miss, last ok 14 days ago
    assert "source:policy:hs_new" not in f           # first sighting, one transient miss
    assert "source:policy:hs_flaky" in f             # transient, but no success for 21 days
    assert "2 run(s) in a row" in f["source:policy:hs_flaky"].what


def test_a_run_that_died_is_reported_as_stuck(mdb):
    log = RunLog.start(mdb.url("capital_app"), brain="capital", kind="capital_etl", strict=True)
    with psycopg.connect(mdb.admin_url, autocommit=True) as c:
        c.execute("UPDATE mandate.runs SET heartbeat_at = now() - interval '13 hours' WHERE id = %s", (log.id,))
    assert f"stuck:{log.id}" in _ids(mdb)


def test_what_cannot_be_checked_is_a_breach_not_a_pass(mdb):
    f = _ids(mdb)          # this database has no capital corpus tables
    assert "could not be checked" in f["embedded"].what


def test_the_corpus_guards_are_read_from_their_verdicts(mdb):
    """One health path (2026-11-10): every guard in capital/data/guard_registry.json
    is read from capital.guard_verdicts. Red, never published, or a weekly guard
    gone quiet is a breach; an on_change guard has no clock."""
    assert "could not be checked" in _ids(mdb)["guards"].what   # no table yet: a breach
    ddl = (H.ROOT / "capital/ETL/schema/guard_verdicts.sql").read_text()
    with psycopg.connect(mdb.admin_url, autocommit=True) as c:
        c.execute("CREATE SCHEMA IF NOT EXISTS capital")
        c.execute("SET search_path = capital")
        c.execute(ddl)
        c.execute("GRANT USAGE ON SCHEMA capital TO capital_ro")
        c.execute("GRANT SELECT ON capital.guard_verdicts TO capital_ro")
        for guard, status, age in [("census", "ok", 1), ("store_schema", "failed", 1),
                                   ("corpus_marks", "ok", 10), ("applicant_identity", "ok", 40)]:
            c.execute("INSERT INTO capital.guard_verdicts (guard, status, taken_at, produced_by, "
                      "code_fingerprint, summary) VALUES (%s, %s, now() - make_interval(days => %s), "
                      "'test', 'x', %s)", (guard, status, age, f"{guard} said so"))
    f = _ids(mdb)
    assert "guards" not in f
    assert "guard:census" not in f and "guard:applicant_identity" not in f
    assert "failed" in f["guard:store_schema"].what
    assert "within 8 days" in f["guard:corpus_marks"].what
    assert "never published" in f["guard:offerable_decay"].what
