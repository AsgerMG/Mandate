"""Hard $ budget enforcement for the brief self-improvement loop.

MeteredClient wraps a real Anthropic client so every messages.create() call
made through it — including the ones generate_briefing() makes internally —
is metered against a BudgetGuard, with zero changes to briefing.py:
generate_briefing() only ever calls client.messages.create(**request), and
that's exactly the one method this proxy intercepts. Once the budget is
exhausted, the proxy raises before making another API call at all, rather
than recording spend after the fact — the ceiling is enforced, not just
reported.

MeteredClient also opportunistically adds cache_control to a plain-string
`system` field before the call goes out — generate_briefing's draft/revise/fix
requests all send the identical SYSTEM_PROMPT text as `system` (confirmed in
briefing.build_request / build_revise_request / build_fix_request), so this
lets repeated calls within one round (same candidate prompt, 6 panel
profiles) read that prefix from cache instead of paying full input price on
every call. judge/candidate calls don't set `system` at all, so they're
untouched by this.
"""

from __future__ import annotations

from typing import Any

# $ per million tokens. This project only ever runs generation/judge/
# candidate calls on claude-sonnet-5 (data/config.py's llm_model default) —
# a single price table is enough; revisit if that changes.
_INPUT_PER_M = 3.00
_OUTPUT_PER_M = 15.00
_CACHE_READ_PER_M = _INPUT_PER_M * 0.1
_CACHE_WRITE_PER_M = _INPUT_PER_M * 1.25  # 5-minute TTL — the only TTL used here

# Minimum system-prompt length worth wrapping in cache_control. Below this
# it's unlikely to hit the model's minimum cacheable-prefix floor, so wrapping
# it would only pay the 1.25x write premium for zero read benefit.
_MIN_CACHEABLE_CHARS = 2000


def call_cost_usd(usage: Any) -> float:
    input_tokens = getattr(usage, "input_tokens", 0) or 0
    output_tokens = getattr(usage, "output_tokens", 0) or 0
    cache_read = getattr(usage, "cache_read_input_tokens", 0) or 0
    cache_write = getattr(usage, "cache_creation_input_tokens", 0) or 0
    return (
        input_tokens * _INPUT_PER_M
        + output_tokens * _OUTPUT_PER_M
        + cache_read * _CACHE_READ_PER_M
        + cache_write * _CACHE_WRITE_PER_M
    ) / 1_000_000


class BudgetExceeded(Exception):
    """Raised by MeteredClient instead of making another API call once the
    weekly cap is spent — never mid-call, so no partial spend is ever lost
    to an error path."""


def _empty_bucket() -> dict[str, float]:
    return {
        "calls": 0,
        "usd": 0.0,
        "input_tokens": 0,
        "output_tokens": 0,
        "cache_read_tokens": 0,
        "cache_write_tokens": 0,
    }


class BudgetGuard:
    """set_context(...) labels every call made until the next set_context —
    the caller (search.py) sets it once before each phase (generation, judge,
    candidate-proposal) so the report can show where the money actually went,
    instead of only a single opaque total."""

    def __init__(self, max_usd: float) -> None:
        self.max_usd = max_usd
        self.spent_usd = 0.0
        self.calls = 0
        self.current_context = "unlabeled"
        self.breakdown: dict[str, dict[str, float]] = {}

    def set_context(self, context: str) -> None:
        self.current_context = context

    def record(self, usage: Any) -> None:
        cost = call_cost_usd(usage)
        self.spent_usd += cost
        self.calls += 1
        bucket = self.breakdown.setdefault(self.current_context, _empty_bucket())
        bucket["calls"] += 1
        bucket["usd"] += cost
        bucket["input_tokens"] += getattr(usage, "input_tokens", 0) or 0
        bucket["output_tokens"] += getattr(usage, "output_tokens", 0) or 0
        bucket["cache_read_tokens"] += getattr(usage, "cache_read_input_tokens", 0) or 0
        bucket["cache_write_tokens"] += getattr(usage, "cache_creation_input_tokens", 0) or 0

    def exhausted(self) -> bool:
        return self.spent_usd >= self.max_usd


class _MeteredMessages:
    def __init__(self, real_messages: Any, budget: BudgetGuard) -> None:
        self._real = real_messages
        self._budget = budget

    def create(self, **kwargs: Any) -> Any:
        if self._budget.exhausted():
            raise BudgetExceeded(
                f"weekly brief-eval budget (${self._budget.max_usd:.2f}) exhausted "
                f"after {self._budget.calls} calls (${self._budget.spent_usd:.2f} spent) "
                "— stopping before another API call."
            )
        system = kwargs.get("system")
        if isinstance(system, str) and len(system) >= _MIN_CACHEABLE_CHARS:
            kwargs = {
                **kwargs,
                "system": [
                    {"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}
                ],
            }
        # briefing.build_documents() puts its own cache_control on the last
        # retrieved passage, meant to be read back by the production
        # draft->revise pass. The eval loop always calls generate_briefing
        # with sharpen=False (one call per profile, no second call to ever
        # read that cache back), and every profile has different passages
        # anyway — so that breakpoint is a pure 1.25x write premium with zero
        # read benefit here. Strip it before sending; production's own calls
        # never go through this client, so this changes nothing for real
        # /api/brief traffic.
        messages = kwargs.get("messages")
        if isinstance(messages, list):
            kwargs = {**kwargs, "messages": _strip_message_cache_control(messages)}
        response = self._real.create(**kwargs)
        self._budget.record(response.usage)
        return response


def _strip_message_cache_control(messages: list[Any]) -> list[Any]:
    cleaned = []
    for message in messages:
        content = message.get("content") if isinstance(message, dict) else None
        if not isinstance(content, list):
            cleaned.append(message)
            continue
        new_content = [
            {k: v for k, v in block.items() if k != "cache_control"}
            if isinstance(block, dict)
            else block
            for block in content
        ]
        cleaned.append({**message, "content": new_content})
    return cleaned


class MeteredClient:
    """Drop-in replacement for an Anthropic client — only .messages.create()
    is used anywhere in this codebase's generation/judge/candidate paths, so
    only that surface needs wrapping."""

    def __init__(self, real_client: Any, budget: BudgetGuard) -> None:
        self.messages = _MeteredMessages(real_client.messages, budget)
