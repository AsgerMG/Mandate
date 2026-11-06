"""mandate.runs: every brain writes its own rows, reads everyone's, deletes none."""
from __future__ import annotations

import psycopg
import pytest

from mandate.runs import RunLog


def test_a_run_and_its_steps_are_recorded_and_survive(mdb):
    url = mdb.url("capital_app")
    log = RunLog.start(url, brain="capital", kind="weekly_refresh", trigger="test", strict=True)
    with log.step("populate instruments") as s:
        s.detail["rows"] = 1092
    with pytest.raises(RuntimeError):
        with log.step("emit priors"):
            raise RuntimeError("boom")
    log.skip_step("artefacts", "capital failed")
    log.finish("failed", "emit priors failed")
    with psycopg.connect(mdb.url("capital_ro")) as c:
        run = c.execute("SELECT status, summary, finished_at IS NOT NULL FROM mandate.runs "
                        "WHERE id = %s", (log.id,)).fetchone()
        steps = c.execute("SELECT ord, name, status, detail FROM mandate.run_steps "
                          "WHERE run_id = %s ORDER BY ord", (log.id,)).fetchall()
    assert run == ("failed", "emit priors failed", True)
    assert [(o, n, st) for o, n, st, _ in steps] == [
        (1, "populate instruments", "ok"), (2, "emit priors", "failed"), (3, "artefacts", "skipped")]
    assert steps[0][3] == {"rows": 1092}


def test_a_brain_cannot_rewrite_another_brains_run_and_nobody_deletes(mdb):
    pol = RunLog.start(mdb.url("policy_app"), brain="policy", kind="policy_refresh", strict=True)
    with psycopg.connect(mdb.url("capital_app"), autocommit=True) as c:
        # readable ...
        assert c.execute("SELECT brain FROM mandate.runs WHERE id = %s", (pol.id,)).fetchone() == ("policy",)
        # ... but not writable: row-level security hides it from UPDATE
        n = c.execute("UPDATE mandate.runs SET status = 'ok' WHERE id = %s", (pol.id,)).rowcount
        assert n == 0
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            c.execute("DELETE FROM mandate.runs WHERE id = %s", (pol.id,))
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            c.execute("INSERT INTO mandate.runs (brain, kind, db_role) VALUES ('policy', 'x', 'policy_app')")
    with psycopg.connect(mdb.url("capital_ro"), autocommit=True) as c:
        c.execute("SET default_transaction_read_only = off")   # the GRANT must refuse too
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            c.execute("INSERT INTO mandate.runs (brain, kind) VALUES ('capital', 'x')")


def test_an_unreachable_log_never_fails_the_refresh(capsys):
    log = RunLog.start("postgresql://nobody@127.0.0.1:1/none", brain="capital", kind="x")
    with log.step("still runs") as s:
        s.summary = "fine"
    log.finish("ok")
    assert log.id is None
    assert "could not record" in capsys.readouterr().err
