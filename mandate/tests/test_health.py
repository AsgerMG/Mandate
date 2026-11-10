"""The health check reads the run log and names what is out of target."""
from __future__ import annotations

import datetime as dt
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


def _age(mdb, run_id: int, days: int) -> None:
    with psycopg.connect(mdb.admin_url, autocommit=True) as c:
        c.execute("UPDATE mandate.runs SET started_at = started_at - make_interval(days => %s), "
                  "finished_at = finished_at - make_interval(days => %s) WHERE id = %s",
                  (days, days, run_id))
        c.execute("UPDATE mandate.run_steps SET started_at = started_at - make_interval(days => %s), "
                  "finished_at = finished_at - make_interval(days => %s) WHERE run_id = %s",
                  (days, days, run_id))


def _notes(mdb):
    with psycopg.connect(mdb.url("capital_ro")) as c:
        return H.budget_pause(c)


def test_paid_steps_paused_for_budget_are_reported_not_alarmed(mdb):
    """LLM_BUDGET=off (or the credit ran out): the paid steps are recorded
    `skipped` with the budget reason. That is EXPECTED: no finding, but a note
    saying since when, gone with the first run that pays again."""
    from mandate.llm import budget  # noqa: PLC0415
    url = mdb.url("capital_app")

    def capital_run(paused: bool, age_days: int):
        r = RunLog.start(url, brain="capital", kind="capital_etl", strict=True)
        sid = r.open_step("classify_taxonomy.py run")
        if paused:
            r.close_step(sid, "skipped", summary=budget.skip_reason("classify_taxonomy run"),
                         exit_code=budget.EXIT_SKIPPED)
        else:
            r.close_step(sid, "ok")
        r.finish("ok")
        _age(mdb, r.id, age_days)

    before = set(_ids(mdb))
    capital_run(False, 30)
    capital_run(True, 14)
    capital_run(True, 7)
    line = next((n for n in _notes(mdb) if n.startswith("capital:")), "")
    assert "paid steps paused: budget off since" in line
    assert H._iso(H.NOW - dt.timedelta(days=14))[:10] in line      # the streak's start
    assert set(_ids(mdb)) <= before, "a budget pause is never a breach"
    capital_run(False, 0)
    assert not any(n.startswith("capital:") for n in _notes(mdb))


def test_policy_budget_pause_comes_from_its_run_detail(mdb):
    url = mdb.url("policy_app")
    r = RunLog.start(url, brain="policy", kind="policy_refresh", strict=True)
    r.finish("ok", "ok; paid steps paused: tags", detail={"sources": {}, "llm_budget_paused": {
        "tags": "LLM budget exhausted (Anthropic credit balance too low): enrichment tags "
                "skipped, data unchanged"}})
    assert any(n.startswith("policy: paid steps paused: budget exhausted since") for n in _notes(mdb))
    r2 = RunLog.start(url, brain="policy", kind="policy_refresh", strict=True)
    r2.finish("ok", detail={"sources": {}})
    assert not any(n.startswith("policy:") for n in _notes(mdb))
