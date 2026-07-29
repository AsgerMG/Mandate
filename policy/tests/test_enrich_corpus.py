"""The single ordered enrichment pass.

The value here is the *order* and the *reporting*, not any individual step (each
has its own tests). Both properties were bought with real bugs: steps running
before the data they filter on existed, and steps silently not running at all.
"""

from __future__ import annotations

from contextlib import contextmanager

import pytest

from etl.enrichment.corpus import DEFAULT_STEPS, STEPS, enrich_corpus


@contextmanager
def _fake_scope():
    yield object()


def _patch_steps(monkeypatch, calls, *, failing=None):
    """Replace every step's implementation with a recorder."""
    import etl.enrichment.corpus as mod

    patched = []
    for step in mod.STEPS:
        name = step.name

        def run(session, _name=name, **kwargs):
            calls.append(_name)
            if failing and _name == failing:
                raise RuntimeError("boom")
            return {"ok": True}

        patched.append(
            mod.Step(
                name,
                run,
                lambda r: "done",
                needs_http=step.needs_http,
                needs_llm=step.needs_llm,
                paid=step.paid,
            )
        )
    monkeypatch.setattr(mod, "STEPS", tuple(patched))


# --- ordering (a correctness constraint, not a preference) ----------------


def test_types_run_before_the_steps_that_filter_on_type():
    """`enrich_lifecycle` only looks at legal document_types and `extract_actors`
    only at VERBATIM_DEBATE, so both skip documents whose type has not been
    derived yet. Running them first produces a silently incomplete corpus rather
    than an error — which is exactly how 1,585 backfilled documents ended up
    unclassified."""
    order = [s.name for s in STEPS]
    assert order.index("types") < order.index("actors")
    assert order.index("types") < order.index("lifecycle")


def test_embeddings_run_after_the_metadata_passes():
    """So passages newly typed or dated in this run are vectorised in the same
    pass, instead of waiting for the next one."""
    order = [s.name for s in STEPS]
    assert order.index("embeddings") > order.index("types")


def test_the_paid_step_is_last_and_excluded_by_default():
    """Cost that scales with corpus size must never be a side effect of a routine
    refresh."""
    assert STEPS[-1].name == "summaries"
    assert STEPS[-1].paid
    assert "summaries" not in DEFAULT_STEPS


def test_steps_run_in_declared_order(monkeypatch):
    calls: list[str] = []
    _patch_steps(monkeypatch, calls)
    enrich_corpus(_fake_scope, http=object(), embedder=object(), client=object())
    assert calls == list(DEFAULT_STEPS)


# --- missing inputs are reported, never silently skipped ------------------


def test_a_step_without_its_requirement_is_reported_as_skipped(monkeypatch):
    """"No API key so tagging didn't run" is information the caller needs. A
    quietly incomplete corpus is how the ordering bugs went unnoticed for a day."""
    calls: list[str] = []
    _patch_steps(monkeypatch, calls)
    results = enrich_corpus(_fake_scope, http=object(), embedder=object(), client=None)
    assert results["tags"]["skipped"] == "no ANTHROPIC_API_KEY"
    assert "tags" not in calls


def test_missing_http_client_skips_only_the_step_that_needs_it(monkeypatch):
    calls: list[str] = []
    _patch_steps(monkeypatch, calls)
    results = enrich_corpus(_fake_scope, http=None, embedder=object(), client=object())
    assert results["lifecycle"]["skipped"] == "no HTTP client provided"
    assert "types" in calls and "actors" in calls


def test_missing_embedder_skips_only_embeddings(monkeypatch):
    calls: list[str] = []
    _patch_steps(monkeypatch, calls)
    results = enrich_corpus(_fake_scope, http=object(), embedder=None, client=object())
    assert "skipped" in results["embeddings"]
    assert "embeddings" not in calls


# --- isolation ------------------------------------------------------------


def test_one_failing_step_does_not_abandon_the_rest(monkeypatch):
    """Each pass is independent and every one that completes leaves the corpus
    better than before — the same principle `refresh` applies per source."""
    calls: list[str] = []
    _patch_steps(monkeypatch, calls, failing="actors")
    results = enrich_corpus(_fake_scope, http=object(), embedder=object(), client=object())
    assert "error" in results["actors"]
    # Every later step is still attempted, and every other one still succeeded.
    assert calls == list(DEFAULT_STEPS)
    assert all("error" not in results[n] for n in DEFAULT_STEPS if n != "actors")


# --- selection ------------------------------------------------------------


def test_only_runs_the_named_steps(monkeypatch):
    calls: list[str] = []
    _patch_steps(monkeypatch, calls)
    enrich_corpus(
        _fake_scope, http=object(), embedder=object(), client=object(), only=("types", "actors")
    )
    assert calls == ["types", "actors"]


def test_only_can_opt_into_the_paid_step(monkeypatch):
    calls: list[str] = []
    _patch_steps(monkeypatch, calls)
    enrich_corpus(_fake_scope, client=object(), only=("summaries",))
    assert calls == ["summaries"]


def test_an_unknown_step_name_fails_loudly():
    """A typo in --only must not quietly run nothing."""
    with pytest.raises(ValueError, match="unknown enrichment step"):
        enrich_corpus(_fake_scope, only=("lifecyle",))  # deliberate typo
