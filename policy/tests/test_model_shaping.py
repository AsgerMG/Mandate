"""Per-model request shaping, and the cost table that follows it.

These two are one story: pointing `llm_model` at a cheaper model has to change
both what gets *sent* (Haiku 4.5 rejects the 4.6-generation reasoning knobs) and
what gets *counted* (a Haiku call billed at Sonnet's price makes the cost half of
a model A/B a fiction). Both were broken for a model swap before 2026-07-29 —
loudly in the first case, silently in the second.
"""

from __future__ import annotations

import pytest

from data.config import get_settings
from etl.brief_eval.cost import BudgetGuard, call_cost_usd
from etl.intelligence.llm import reasoning_params, supports_adaptive_thinking


@pytest.fixture
def as_model(monkeypatch):
    """Run the body as if `llm_model` were set to the given model."""

    def _set(model: str):
        monkeypatch.setenv("LLM_MODEL", model)
        get_settings.cache_clear()
        assert get_settings().llm_model == model
        return get_settings()

    yield _set
    get_settings.cache_clear()


class _Usage:
    input_tokens = 100_000
    output_tokens = 10_000
    cache_read_input_tokens = 0
    cache_creation_input_tokens = 0


# --- what gets sent -------------------------------------------------------


def test_modern_model_gets_adaptive_thinking_and_effort(as_model):
    as_model("claude-sonnet-5")
    req = reasoning_params("medium")
    assert req["thinking"] == {"type": "adaptive"}
    assert req["output_config"] == {"effort": "medium"}


def test_haiku_gets_neither_adaptive_thinking_nor_effort(as_model):
    """The whole reason this module exists: `{"type": "adaptive"}` is not a valid
    thinking type on Haiku 4.5 and `output_config.effort` is rejected outright, so
    sending the modern shape is an immediate 400 from all three brief call sites."""
    as_model("claude-haiku-4-5")
    req = reasoning_params("medium")
    assert "output_config" not in req
    assert req["thinking"]["type"] == "enabled"
    assert req["thinking"]["budget_tokens"] > 0


def test_effort_still_means_something_on_a_legacy_model(as_model):
    """A level has to survive the translation, or every call would think alike and
    the draft/self-edit distinction the call sites encode would be lost."""
    as_model("claude-haiku-4-5")
    low = reasoning_params("low")["thinking"]["budget_tokens"]
    medium = reasoning_params("medium")["thinking"]["budget_tokens"]
    assert low < medium


def test_legacy_thinking_budget_stays_under_max_tokens(as_model):
    """The API rejects budget_tokens >= max_tokens, and the answer still needs
    room after the thinking — so this is a hard bound, not a preference."""
    settings = as_model("claude-haiku-4-5")
    for effort in ("low", "medium", "high"):
        budget = reasoning_params(effort)["thinking"]["budget_tokens"]
        assert budget < settings.llm_max_tokens


def test_a_tiny_max_tokens_omits_thinking_rather_than_sending_an_illegal_budget(
    as_model, monkeypatch
):
    """Below the API's 1024 floor there is no legal budget to send. Omit the field
    — on these models omission *is* how thinking is off; `{"type": "disabled"}` is
    itself a 4.6-generation value and would 400."""
    monkeypatch.setenv("LLM_MAX_TOKENS", "1500")
    as_model("claude-haiku-4-5")
    req = reasoning_params("medium")
    assert "thinking" not in req
    assert "output_config" not in req


def test_an_unrecognised_model_is_treated_as_modern(as_model):
    """Defaulting the other way would silently send deprecated parameters to every
    model released after this was written. Guessing wrong in this direction
    produces one clear 400 on the first call instead."""
    assert supports_adaptive_thinking("claude-sonnet-6")
    as_model("claude-sonnet-6")
    assert reasoning_params("low")["thinking"] == {"type": "adaptive"}


def test_dated_model_ids_are_recognised():
    """`claude-haiku-4-5-20251001` is the ID the enrichment steps already use."""
    assert not supports_adaptive_thinking("claude-haiku-4-5-20251001")


# --- what gets counted ----------------------------------------------------


def test_haiku_is_billed_at_haiku_prices():
    """Was the actual bug: one hardcoded Sonnet price pair meant a Haiku run
    reported ~3x its real cost — corrupting exactly the comparison a model A/B is
    run to make."""
    sonnet = call_cost_usd(_Usage(), "claude-sonnet-5")
    haiku = call_cost_usd(_Usage(), "claude-haiku-4-5")
    assert haiku == pytest.approx(sonnet / 3, rel=0.01)


def test_dated_model_ids_price_correctly():
    assert call_cost_usd(_Usage(), "claude-haiku-4-5-20251001") == call_cost_usd(
        _Usage(), "claude-haiku-4-5"
    )


def test_an_unpriced_model_falls_back_rather_than_crashing():
    """A mispriced report is recoverable; a crash mid-way through a paid run
    throws away work already billed for."""
    assert call_cost_usd(_Usage(), "claude-unknown-9") == call_cost_usd(_Usage(), "claude-sonnet-5")


def test_guard_records_the_model_and_the_wall_clock():
    """Both are what a latency/cost A/B is read from; neither existed before."""
    guard = BudgetGuard(max_usd=None)
    guard.set_context("Acme")
    guard.record(_Usage(), model="claude-haiku-4-5", seconds=12.5)
    assert guard.models == {"claude-haiku-4-5"}
    assert guard.seconds == 12.5
    assert guard.breakdown["Acme"]["seconds"] == 12.5


def test_guard_still_accepts_a_bare_usage():
    """Callers that don't know the model (older paths, tests) must not break."""
    guard = BudgetGuard(max_usd=None)
    guard.record(_Usage())
    assert guard.spent_usd > 0
    assert guard.models == set()


# --- the judge is an instrument, not a subject -----------------------------


def test_structured_output_format_survives_on_a_legacy_model(as_model):
    """`effort` is 4.6-generation; structured outputs are not. The judge sends
    both, so dropping the whole output_config on a legacy model would silently
    turn a schema-validated judge call into free-text parsing."""
    as_model("claude-sonnet-5")
    schema = {"type": "json_schema", "schema": {"type": "object"}}
    modern = reasoning_params("low", output_format=schema)
    legacy = reasoning_params("low", model="claude-haiku-4-5", output_format=schema)
    assert modern["output_config"] == {"format": schema, "effort": "low"}
    assert legacy["output_config"] == {"format": schema}


def test_the_judge_does_not_follow_the_model_under_test(as_model):
    """Pointing llm_model at a challenger must not also swap the judge: two sides
    scored by two different judges is not a comparison, and every score recorded
    before would become incomparable."""
    as_model("claude-haiku-4-5")
    settings = get_settings()
    assert settings.eval_model != settings.llm_model
    assert reasoning_params("low", model=settings.eval_model)["model"] == "claude-sonnet-5"


def test_an_explicit_model_overrides_the_configured_one(as_model):
    as_model("claude-sonnet-5")
    assert reasoning_params("low", model="claude-haiku-4-5")["model"] == "claude-haiku-4-5"


def test_max_tokens_can_be_overridden_per_call_site(as_model):
    """The judge and the candidate proposer have their own budgets, unrelated to
    the brief's."""
    as_model("claude-sonnet-5")
    assert reasoning_params("low", max_tokens=4096)["max_tokens"] == 4096
