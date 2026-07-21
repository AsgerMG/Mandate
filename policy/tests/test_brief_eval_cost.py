"""etl/brief_eval/cost.py's retry-on-transient-error behavior — a live 529
('Overloaded') crashed a whole multi-dollar run with nothing saved before
this existed; every other network client in this codebase already retries
transient 5xx/429s, this one didn't."""

from __future__ import annotations

import anthropic
import httpx
import pytest

from etl.brief_eval.cost import BudgetGuard, MeteredClient, _is_retryable_anthropic


def _status_error(status_code: int) -> anthropic.APIStatusError:
    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    response = httpx.Response(status_code, request=request)
    return anthropic.APIStatusError("error", response=response, body=None)


def test_is_retryable_anthropic_5xx_and_429():
    assert _is_retryable_anthropic(_status_error(529)) is True  # the live failure
    assert _is_retryable_anthropic(_status_error(500)) is True
    assert _is_retryable_anthropic(_status_error(429)) is True


def test_is_retryable_anthropic_4xx_is_not_retried():
    assert _is_retryable_anthropic(_status_error(400)) is False
    assert _is_retryable_anthropic(_status_error(401)) is False


def test_is_retryable_anthropic_connection_error():
    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    assert _is_retryable_anthropic(anthropic.APIConnectionError(request=request)) is True


def test_is_retryable_anthropic_unrelated_exception_is_not_retried():
    assert _is_retryable_anthropic(ValueError("x")) is False


class _FakeUsage:
    input_tokens = 10
    output_tokens = 5
    cache_read_input_tokens = 0
    cache_creation_input_tokens = 0


class _FakeResponse:
    usage = _FakeUsage()


class _FlakyMessages:
    def __init__(self, fail_times: int, exc_factory):
        self.calls = 0
        self.fail_times = fail_times
        self.exc_factory = exc_factory

    def create(self, **kwargs):
        self.calls += 1
        if self.calls <= self.fail_times:
            raise self.exc_factory()
        return _FakeResponse()


class _RealClientStub:
    def __init__(self, messages):
        self.messages = messages


def test_metered_client_retries_transient_529_then_succeeds():
    budget = BudgetGuard(max_usd=10.0)
    real = _FlakyMessages(fail_times=2, exc_factory=lambda: _status_error(529))
    client = MeteredClient(_RealClientStub(real), budget)
    response = client.messages.create()
    assert response is not None
    assert real.calls == 3  # failed twice, succeeded on the third
    assert budget.calls == 1  # only the successful call gets recorded/billed


def test_metered_client_does_not_retry_a_permanent_400():
    budget = BudgetGuard(max_usd=10.0)
    real = _FlakyMessages(fail_times=99, exc_factory=lambda: _status_error(400))
    client = MeteredClient(_RealClientStub(real), budget)
    with pytest.raises(anthropic.APIStatusError):
        client.messages.create()
    assert real.calls == 1  # no retry on a permanent error
    assert budget.calls == 0  # never recorded — the call never succeeded


def test_budget_guard_uncapped_never_exhausts():
    budget = BudgetGuard(max_usd=None)
    for _ in range(50):
        budget.record(_FakeUsage())
    assert budget.spent_usd > 0
    assert budget.exhausted() is False


def test_budget_guard_capped_still_exhausts():
    budget = BudgetGuard(max_usd=0.00001)  # one _FakeUsage call costs ~$0.000105
    budget.record(_FakeUsage())
    assert budget.exhausted() is True
