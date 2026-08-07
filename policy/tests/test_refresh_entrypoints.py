"""The two refresh entrypoints must do the same thing.

`regina refresh` (manual) and `POST /api/refresh` (the Railway refresh-cron,
i.e. the ONLY automated path) each carried their own copy of the collection
loop — ~15 lines with near-identical comments — and the copies drifted. The
HTTP path called `embed_pending` and `classify_pending` directly instead of the
ordered `enrich_corpus` pass, so types (reclassify), actors, lifecycle and
summaries had **never once run** on the weekly cron. 60.6% of documents sitting
at `lifecycle_stage = UNKNOWN` is what that cost.

The absence of exactly the test below is why the divergence survived, so it is
written to fail if the two paths ever diverge again rather than to describe the
current implementation.

Also covers the refresh endpoint's own state machine: a failed run must be
visible as a failure (the weekly audit routine reads that endpoint to judge
refresh health), and a stale "running" flag must never be able to block the
pipeline forever.
"""

from __future__ import annotations

import datetime as dt
from contextlib import contextmanager

import pytest
from typer.testing import CliRunner

import etl.api as api_mod
import etl.cli as cli_mod
import etl.enrichment.corpus as corpus_mod
import etl.http as http_mod
import etl.intelligence.llm as llm_mod
import etl.pipeline as pipeline_mod


@contextmanager
def _fake_scope():
    yield object()


class _FakeHttpClient:
    def __init__(self, settings):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def _record_steps(monkeypatch, calls: list[str]) -> None:
    """Replace each enrichment step with a recorder, keeping its requirements
    so the skip logic still behaves — same shape as test_enrich_corpus."""
    patched = []
    for step in corpus_mod.STEPS:
        name = step.name

        def run(session, _name=name, **kwargs):
            calls.append(_name)
            return {"ok": True}

        patched.append(
            corpus_mod.Step(
                name,
                run,
                lambda r: "done",
                needs_http=step.needs_http,
                needs_llm=step.needs_llm,
                paid=step.paid,
            )
        )
    monkeypatch.setattr(corpus_mod, "STEPS", tuple(patched))


@pytest.fixture
def harness(monkeypatch):
    """Both entrypoints, stubbed down to nothing but their control flow."""
    calls: list[str] = []
    sources_run: list[str] = []
    _record_steps(monkeypatch, calls)

    def fake_run_all_sources(session, adapters, http, settings, **kwargs):
        sources_run.append("ran")
        return {"fake": {"discovered": 1}}

    monkeypatch.setattr(pipeline_mod, "run_all_sources", fake_run_all_sources)
    monkeypatch.setattr(cli_mod, "run_all_sources", fake_run_all_sources)
    monkeypatch.setattr(cli_mod, "session_scope", _fake_scope)
    monkeypatch.setattr(api_mod, "session_scope", _fake_scope)
    monkeypatch.setattr(cli_mod, "HttpClient", _FakeHttpClient)
    monkeypatch.setattr(http_mod, "HttpClient", _FakeHttpClient)
    monkeypatch.setattr(api_mod, "_embedder", lambda: object())
    monkeypatch.setattr(llm_mod, "get_client", lambda: object())
    monkeypatch.setattr(llm_mod, "has_api_key", lambda: True)
    monkeypatch.setattr(api_mod, "has_api_key", lambda: True)
    monkeypatch.setattr("etl.enrichment.get_embedder", lambda settings: object())

    api_mod._refresh_state.update(
        running=False,
        ok=None,
        error=None,
        last_result=None,
        last_started=None,
        last_finished=None,
        progress_at=None,
    )
    return {"calls": calls, "sources_run": sources_run}


def _cli_steps(harness) -> list[str]:
    harness["calls"].clear()
    result = CliRunner().invoke(cli_mod.app, ["refresh"])
    assert result.exit_code == 0, result.output
    return list(harness["calls"])


def _api_steps(harness) -> list[str]:
    harness["calls"].clear()
    api_mod._run_refresh()
    return list(harness["calls"])


# --- the divergence -------------------------------------------------------


def test_both_entrypoints_run_the_same_enrichment_steps_in_the_same_order(harness):
    cli_steps = _cli_steps(harness)
    api_steps = _api_steps(harness)
    assert cli_steps == api_steps, (
        "the manual and the automated refresh path have diverged again — "
        f"CLI ran {cli_steps}, HTTP ran {api_steps}"
    )
    assert cli_steps == list(corpus_mod.DEFAULT_STEPS)


def test_the_http_path_runs_the_metadata_steps_at_all(harness):
    """The specific regression: types, actors and lifecycle had never executed
    on the cron, because it called embed_pending/classify_pending directly."""
    api_steps = _api_steps(harness)
    for required in ("types", "actors", "lifecycle", "embeddings", "tags"):
        assert required in api_steps, f"the cron still never runs {required!r}"


def test_the_http_path_respects_the_documented_step_order(harness):
    """Dating and actor extraction filter on document_type, so both must run
    after reclassification — the order is a correctness constraint."""
    api_steps = _api_steps(harness)
    assert api_steps.index("types") < api_steps.index("actors")
    assert api_steps.index("types") < api_steps.index("lifecycle")


def test_neither_entrypoint_starts_paying_for_summaries(harness):
    """`summaries` is the paid, corpus-scaling step. The weekly cron must not
    silently start billing per document."""
    assert "summaries" not in _cli_steps(harness)
    assert "summaries" not in _api_steps(harness)


def test_both_entrypoints_collect_from_sources_before_enriching(harness):
    _cli_steps(harness)
    _api_steps(harness)
    assert harness["sources_run"] == ["ran", "ran"]


# --- failures must be visible --------------------------------------------


def test_a_failed_run_is_not_reported_as_a_stale_success(harness, monkeypatch):
    """`last_result = totals` was the final statement of the try block, so on
    failure it silently kept the PREVIOUS run's totals while `last_finished`
    advanced. The weekly audit routine reads this exact endpoint."""
    api_mod._run_refresh()
    good = api_mod.refresh_status()
    assert good["ok"] is True
    assert good["error"] is None

    def boom(*a, **kw):
        raise RuntimeError("cellar is down")

    monkeypatch.setattr(pipeline_mod, "run_all_sources", boom)
    api_mod._run_refresh()

    bad = api_mod.refresh_status()
    assert bad["ok"] is False
    assert "cellar is down" in bad["error"]
    assert bad["last_result"] != good["last_result"], "previous run's totals survived a failure"
    assert bad["last_finished"] is not None


def test_a_started_run_clears_the_previous_verdict(harness):
    api_mod._run_refresh()
    assert api_mod.refresh_status()["ok"] is True
    started, _ = api_mod._try_start_refresh()
    assert started
    # In flight: the last run's verdict must not read as this run's.
    assert api_mod.refresh_status()["ok"] is None
    assert api_mod.refresh_status()["last_result"] is None
    api_mod._finish_refresh(ok=True, result={}, error=None)


def test_enrichment_failure_is_reported(harness, monkeypatch):
    def boom(*a, **kw):
        raise RuntimeError("enrichment exploded")

    monkeypatch.setattr(corpus_mod, "enrich_corpus", boom)
    api_mod._run_refresh()
    state = api_mod.refresh_status()
    assert state["ok"] is False
    assert "enrichment exploded" in state["error"]


# --- the lock must not strand the pipeline -------------------------------


def test_a_second_refresh_is_refused_while_one_is_running(harness):
    assert api_mod._try_start_refresh() == (True, None)
    started, reason = api_mod._try_start_refresh()
    assert started is False
    assert reason == "refresh already running"


def test_a_stale_running_flag_does_not_block_the_pipeline_forever(harness):
    """The lock was acquired in refresh() and released in _run_refresh()'s
    finally — a different function on a different thread. If the background
    task never started, or the run hung (no timeout anywhere, multi-hour runs
    are normal), every subsequent weekly cron got "refresh already running"
    until someone restarted the process."""
    assert api_mod._try_start_refresh()[0] is True
    stale = dt.datetime.now(dt.UTC) - api_mod.REFRESH_STALE_AFTER - dt.timedelta(minutes=1)
    api_mod._refresh_state.update(last_started=stale, progress_at=stale)

    started, reason = api_mod._try_start_refresh()
    assert started is True, f"the pipeline is still wedged: {reason}"


def test_a_long_but_progressing_run_is_never_considered_stale(harness):
    """Multi-hour runs are normal. Only a run that has stopped making progress
    entirely may have its slot taken."""
    assert api_mod._try_start_refresh()[0] is True
    api_mod._refresh_state["last_started"] = (
        dt.datetime.now(dt.UTC) - api_mod.REFRESH_STALE_AFTER - dt.timedelta(hours=5)
    )
    api_mod._note_progress()  # a source just finished

    started, reason = api_mod._try_start_refresh()
    assert started is False
    assert reason == "refresh already running"


def test_a_run_that_completes_releases_the_slot(harness):
    api_mod._run_refresh()
    assert api_mod._refresh_state["running"] is False
    assert api_mod._try_start_refresh()[0] is True


def test_a_run_that_fails_releases_the_slot(harness, monkeypatch):
    monkeypatch.setattr(pipeline_mod, "run_all_sources", lambda *a, **kw: 1 / 0)
    api_mod._run_refresh()
    assert api_mod._refresh_state["running"] is False
    assert api_mod._try_start_refresh()[0] is True
