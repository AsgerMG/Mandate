"""Anthropic client access and per-model request shaping.

The key is read from ANTHROPIC_API_KEY by the SDK.

``reasoning_params`` exists so that changing which model writes the brief is a
config change rather than a bug hunt. The two knobs the brief uses to trade
depth against latency — adaptive thinking and ``output_config.effort`` — are
4.6-generation features. Haiku 4.5 rejects both, so pointing ``llm_model`` at it
used to mean three separate 400s from three separate call sites. Call sites keep
speaking in effort levels; translating a level into whatever the configured model
actually accepts happens here, once.
"""

from __future__ import annotations

import os
from typing import Any

from data.config import get_settings


def has_api_key() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))


def get_client():
    """Return an Anthropic client, or raise a clear error if no key is set."""
    if not has_api_key():
        raise RuntimeError(
            "No ANTHROPIC_API_KEY set. Add it to your environment/.env to generate "
            "briefings. (Retrieval and `--dry-run` work without it.)"
        )
    import anthropic

    return anthropic.Anthropic()


# Model families that predate the 4.6 generation: `{"type": "adaptive"}` is not a
# valid thinking type for them and `output_config.effort` is rejected outright.
#
# Deliberately a list of the *old* models rather than the new ones, so a model
# released after this was written gets the modern shape by default. Guessing
# "modern" for a genuinely old model produces one clear 400 on the first call;
# guessing "legacy" for a new one silently sends it deprecated parameters.
_LEGACY_REASONING: tuple[str, ...] = (
    "claude-haiku-4-5",
    "claude-3-haiku",
    "claude-sonnet-4-5",
    "claude-3-5-sonnet",
    "claude-opus-4-5",
    # claude-opus-4-1 removed 2026-08-07: it retired on 2026-08-05, so an entry
    # for it can only ever shape a request that is going to 404 anyway. Listing
    # retired models here is not free — this tuple is prefix-matched, so it grows
    # into a list nobody can tell is still load-bearing.
)

# What an effort level means in explicit thinking tokens on a legacy model.
# Adaptive thinking exposes no budget to copy, so these are a deliberate
# stand-in: the ratio between levels is what carries the intent (a checklist
# self-edit needs less room than fresh synthesis), not the absolute numbers.
_LEGACY_BUDGET: dict[str, int] = {"low": 2_000, "medium": 4_000, "high": 8_000}

# The API's own floor for budget_tokens, and — since the budget is drawn from
# max_tokens — also the minimum room the answer itself needs left over.
_MIN_BUDGET = 1_024


def supports_adaptive_thinking(model: str) -> bool:
    """Whether ``model`` accepts adaptive thinking and output_config.effort."""
    return not any(model.startswith(tag) for tag in _LEGACY_REASONING)


def reasoning_params(
    effort: str,
    *,
    model: str | None = None,
    max_tokens: int | None = None,
    output_format: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """The model / max_tokens / thinking / output_config block for one call.

    ``effort`` is the vocabulary every call site uses: "medium" for fresh
    synthesis, "low" for a self-edit over text the model already wrote. On a
    4.6-generation model it passes straight through as ``output_config.effort``
    alongside adaptive thinking. On an older one it becomes an explicit thinking
    budget instead, and ``effort`` is dropped — which is the whole point, since
    sending it is a 400 there.

    ``output_format`` (a structured-outputs JSON schema) survives either way:
    unlike ``effort`` it is supported across both generations, so it is merged
    into ``output_config`` rather than being conditional on the model.

    ``model`` defaults to ``llm_model``. The eval harness passes ``eval_model``
    instead, so the judge stays a fixed instrument when the subject changes.
    """
    settings = get_settings()
    model = model or settings.llm_model
    max_tokens = max_tokens or settings.llm_max_tokens
    output_config: dict[str, Any] = {"format": output_format} if output_format else {}

    if supports_adaptive_thinking(model):
        return {
            "model": model,
            "max_tokens": max_tokens,
            # display="summarized" returns a readable summary of the model's own
            # reasoning instead of empty thinking blocks (the default is
            # "omitted"). Not a nicety: thinking runs BEFORE any answer text, and
            # on a real brief that measured ~90-100s of a ~180s wait with nothing
            # to show. Streaming the summary turns the longest, least legible
            # stretch of the wait into the model visibly working — with its actual
            # reasoning, not narration we invented. Thinking is billed the same
            # under every display setting, so this costs nothing.
            "thinking": {"type": "adaptive", "display": "summarized"},
            "output_config": {**output_config, "effort": effort},
        }

    params: dict[str, Any] = {"model": model, "max_tokens": max_tokens}
    if output_config:
        params["output_config"] = output_config
    budget = min(_LEGACY_BUDGET.get(effort, _LEGACY_BUDGET["medium"]), max_tokens - _MIN_BUDGET)
    if budget >= _MIN_BUDGET:
        params["thinking"] = {"type": "enabled", "budget_tokens": budget}
    # Below the floor there is no legal budget to send, so `thinking` is omitted
    # rather than set to {"type": "disabled"} — on these models omission *is*
    # how thinking is turned off, and "disabled" is itself a 4.6-generation value.
    return params
