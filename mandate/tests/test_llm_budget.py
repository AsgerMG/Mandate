"""mandate.llm.budget: the one switch for paid calls, and the credit-error classifier."""
from __future__ import annotations

import pytest

from mandate.llm import budget
from mandate.llm.batch import Batcher, Item, MemoryStore, cached_system
from mandate.llm.testing import FakeBatchClient


class CreditError(Exception):
    """The shape of anthropic.BadRequestError on an account with no credit."""
    status_code = 400

    def __init__(self):
        super().__init__("Error code: 400 - {'type': 'error', 'error': {'type': "
                         "'invalid_request_error', 'message': 'Your credit balance is too "
                         "low to access the Anthropic API. Please go to Plans & Billing to "
                         "upgrade or purchase credits.'}}")


@pytest.mark.parametrize("value,on", [(None, True), ("on", True), ("ON", True), ("typo", True),
                                      ("off", False), (" Off ", False), ("0", False)])
def test_the_switch_is_on_unless_set_off(monkeypatch, value, on):
    if value is None:
        monkeypatch.delenv(budget.ENV, raising=False)
    else:
        monkeypatch.setenv(budget.ENV, value)
    assert budget.llm_enabled() is on


def test_the_credit_error_is_classified_and_nothing_else():
    assert budget.is_budget_exhausted(CreditError())
    try:
        try:
            raise CreditError()
        except CreditError as e:
            raise RuntimeError("judge failed") from e
    except RuntimeError as wrapped:
        assert budget.is_budget_exhausted(wrapped)       # through the cause chain
    other = Exception("Error code: 400 - invalid_request_error: max_tokens too large")
    other.status_code = 400
    assert not budget.is_budget_exhausted(other)
    assert not budget.is_budget_exhausted(Exception("529 overloaded"))
    assert not budget.is_budget_exhausted(None)


def test_paid_step_skips_when_off_and_when_exhausted(monkeypatch, capsys):
    monkeypatch.setenv(budget.ENV, "off")
    ran = []
    with pytest.raises(SystemExit) as e:
        with budget.paid_step("x"):
            ran.append(1)
    assert e.value.code == budget.EXIT_SKIPPED and not ran
    assert capsys.readouterr().out.strip().splitlines()[-1] == budget.skip_reason("x")

    monkeypatch.setenv(budget.ENV, "on")
    with pytest.raises(SystemExit) as e:
        with budget.paid_step("x"):
            raise CreditError()
    assert e.value.code == budget.EXIT_SKIPPED
    out = capsys.readouterr().out
    assert budget.skip_reason("x", budget.EXHAUSTED) in out and budget.is_skip_reason(out)

    with pytest.raises(ValueError):                    # anything else propagates
        with budget.paid_step("x"):
            raise ValueError("a real bug")


def _items():
    p = {"model": "claude-haiku-4-5", "max_tokens": 10, "system": cached_system("S"),
         "messages": [{"role": "user", "content": "hi"}]}
    return [Item("c1", p)]


def test_batcher_off_and_exhausted_are_one_outcome(monkeypatch):
    fake = FakeBatchClient(lambda cid, params: ("ok", "x"))
    store = MemoryStore()
    monkeypatch.setenv(budget.ENV, "off")
    out = Batcher("k", store=store, client=fake, log=lambda s: None).run(
        _items(), lambda rs: None, max_usd=1)
    assert out.budget == budget.OFF and budget.is_skip_reason(out.skipped)
    assert not fake.created and not store.rows       # nothing called, nothing recorded

    monkeypatch.delenv(budget.ENV)

    class Broke(FakeBatchClient):
        pass
    broke = Broke(lambda cid, params: ("ok", "x"))

    def create(requests):
        raise CreditError()
    broke.messages.batches.create = create
    out = Batcher("k", store=store, client=broke, log=lambda s: None).run(
        _items(), lambda rs: None, max_usd=1)
    assert out.budget == budget.EXHAUSTED and "exhausted" in out.skipped
    assert out.submitted == 0 and not store.rows
