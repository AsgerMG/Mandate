"""THE switch for paid model calls: one env var, read here and nowhere else (Python).

    from mandate.llm import budget
    if not budget.llm_enabled():
        budget.exit_skipped(budget.skip_reason("classify_taxonomy run"))

    with budget.paid_step("classify_relevance submit"):   # a whole script's main
        main()

    LLM_BUDGET=on   (default; unset means on)  paid calls run as normal
    LLM_BUDGET=off                             every paid step skips, data unchanged

WHY ONE SWITCH. On 2026-11-10 the production Anthropic account ran out of
credit: every call returned 400 "Your credit balance is too low". The weekly run
then failed at the first paid step, and the free work behind it (fetching,
loading, embedding, the census) went down with it. The fix is not a cheaper
model but a run that knows it has no budget and says so.

TWO WAYS TO HAVE NO BUDGET, ONE OUTCOME. The switch being off, and a paid call
failing with the credit-exhausted error, are the same fact found at different
times, so they produce the same result: the step is SKIPPED with a recorded
reason, exits EXIT_SKIPPED, and its data is unchanged. `is_budget_exhausted`
is the one classifier of that error; mandate/llm/batch.py and every paid script
in the weekly run go through it.

THE RECORD. Every reason starts with SKIP_PREFIX ("LLM budget "), which is how
capital/ETL/events/extract/railway_cron.py records the step `skipped` in
mandate.run_steps and how mandate/health/check.py finds the pause and reports
it as expected ("paid steps paused") instead of alarming on it.

The TypeScript side (web/app/api/mandate/mission/route.ts) reads the same env
name with the same rule. Turn it on/off everywhere: mandate/ops/set_llm_budget.sh.
"""
from __future__ import annotations

import contextlib
import os
import sys
from typing import Iterator

ENV = "LLM_BUDGET"
ON, OFF, EXHAUSTED = "on", "off", "exhausted"
#: The values that turn paid calls off. Anything else, unset included, is on:
#: a typo must not silently stop the product's paid work for weeks.
_OFF_VALUES = {"off", "0", "false", "no", "paused"}
#: EX_TEMPFAIL (sysexits.h): "temporary failure, try again later". Exactly what
#: a budget pause is, and not a code any step here already uses (3 = partial).
EXIT_SKIPPED = 75
SKIP_PREFIX = "LLM budget "
#: The phrase Anthropic's 400 carries when the account has no credit.
CREDIT_PHRASE = "credit balance is too low"


def state() -> str:
    """'on' or 'off', from LLM_BUDGET."""
    return OFF if os.environ.get(ENV, "").strip().lower() in _OFF_VALUES else ON


def llm_enabled() -> bool:
    """May this process make a paid model call?"""
    return state() == ON


def skip_reason(step: str, why: str = OFF) -> str:
    """The one sentence a skipped paid step records. `why` is OFF or EXHAUSTED."""
    if why == EXHAUSTED:
        return (f"{SKIP_PREFIX}exhausted (Anthropic credit balance too low): "
                f"{step} skipped, data unchanged")
    return f"{SKIP_PREFIX}off: {step} skipped, data unchanged"


def is_skip_reason(text: str | None) -> bool:
    return bool(text) and text.lstrip().startswith(SKIP_PREFIX)


def is_budget_exhausted(exc: BaseException | None) -> bool:
    """Is this (or anything in its cause chain) Anthropic's credit-exhausted 400?

    Duck-typed so it needs no SDK import: anthropic.BadRequestError carries
    `status_code` 400 and the message in str(exc) and in `body`/`message`."""
    seen: set[int] = set()
    while exc is not None and id(exc) not in seen:
        seen.add(id(exc))
        status = getattr(exc, "status_code", None)
        if status is None:
            status = getattr(getattr(exc, "response", None), "status_code", None)
        text = " ".join(str(x) for x in (exc, getattr(exc, "message", ""),
                                         getattr(exc, "body", "")) if x)
        if CREDIT_PHRASE in text.lower() and status in (400, 402, None):
            return True
        exc = exc.__cause__ or exc.__context__
    return False


class BudgetUnavailable(RuntimeError):
    """No paid call may be made: the switch is off or the credit is exhausted.
    `why` is OFF or EXHAUSTED; str() is the skip reason."""

    def __init__(self, step: str, why: str = OFF):
        self.step, self.why = step, why
        super().__init__(skip_reason(step, why))


def require(step: str) -> None:
    """Raise BudgetUnavailable when the switch is off. For library code that
    must not decide how its caller exits."""
    if not llm_enabled():
        raise BudgetUnavailable(step, OFF)


def exit_skipped(reason: str) -> None:
    """Print the reason as the step's LAST line (railway_cron keeps it as the
    run_steps summary) and exit EXIT_SKIPPED."""
    print(reason, flush=True)
    print(reason, file=sys.stderr, flush=True)
    raise SystemExit(EXIT_SKIPPED)


def exit_if_off(step: str) -> None:
    if not llm_enabled():
        exit_skipped(skip_reason(step, OFF))


@contextlib.contextmanager
def paid_step(step: str) -> Iterator[None]:
    """Wrap a paid script's work: skip it when the switch is off, and turn the
    credit-exhausted error (or a BudgetUnavailable from library code) into the
    same clean skip. Anything else propagates unchanged."""
    exit_if_off(step)
    try:
        yield
    except BudgetUnavailable as exc:
        exit_skipped(skip_reason(step, exc.why))
    except Exception as exc:  # noqa: BLE001 -- re-raised unless it is the credit error
        if is_budget_exhausted(exc):
            exit_skipped(skip_reason(step, EXHAUSTED))
        raise
