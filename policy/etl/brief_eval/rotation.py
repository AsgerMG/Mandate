"""Spend-bounded, rotating smoke check of the real brief pipeline.

The tension this exists to resolve: retrieval and prompt changes can only be
judged against real generated briefs, every real brief is a billed multi-call
Anthropic run, and the profiles worth checking differ from each other enough
that testing one repeatedly proves very little. Testing all of them every time
is the expensive way to get coverage; testing the same one every time is the
cheap way to get none.

Rotation resolves it over time instead of per run: each invocation exercises
the NEXT profile(s) in the panel and persists a cursor, so consecutive routine
checks cover the whole verdict space (platform, manufacturer, out-of-scope
traditional business, thin early-stage startup, health/AI) at the cost of one
profile per run. When a batch of changes is ready to be judged together,
``--all`` runs the full panel in one go so the whole batch is tested against
consistent coverage rather than a moving sample.

Reuses EVAL_PANEL rather than defining a second set of profiles: it is already
the hand-maintained spread across the compliance verdict space, and a second
list would drift from it silently. Spend is capped by the same BudgetGuard the
brief-improve loop uses.
"""

from __future__ import annotations

import datetime as dt
import json
import os
from pathlib import Path
from typing import Any

from etl.intelligence.profile import CompanyProfile

from .panel import EVAL_PANEL

# The cursor has to outlive the process for rotation to mean anything, and it
# is machine-local scratch state rather than something to share or commit —
# two people running this should not fight over whose turn it is.
STATE_PATH = Path(".brief-check-state.json")


def _load_state(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        # A missing or corrupt cursor must not block a check — losing rotation
        # position costs one repeated profile, and raising here would make a
        # scratch file a hard dependency of testing.
        return {"cursor": 0, "runs": []}


def _save_state(path: Path, state: dict[str, Any]) -> None:
    try:
        path.write_text(json.dumps(state, indent=2))
    except OSError:
        pass


def select_profiles(
    *, count: int = 1, all_profiles: bool = False, state_path: Path | None = None
) -> tuple[list[CompanyProfile], int]:
    """The next ``count`` panel profiles (or all of them), plus the cursor
    position to persist after they've actually run.

    The cursor is returned rather than written here so a failed or aborted run
    doesn't advance rotation past a profile that was never checked."""
    path = state_path or STATE_PATH
    if all_profiles:
        return list(EVAL_PANEL), _load_state(path).get("cursor", 0)
    state = _load_state(path)
    cursor = int(state.get("cursor", 0)) % len(EVAL_PANEL)
    picked: list[CompanyProfile] = []
    for offset in range(min(count, len(EVAL_PANEL))):
        picked.append(EVAL_PANEL[(cursor + offset) % len(EVAL_PANEL)])
    return picked, (cursor + len(picked)) % len(EVAL_PANEL)


def record_run(
    *, cursor: int, profiles: list[str], spent_usd: float, state_path: Path | None = None
) -> None:
    """Advance the rotation cursor and append a one-line spend history entry."""
    path = state_path or STATE_PATH
    state = _load_state(path)
    state["cursor"] = cursor
    runs = list(state.get("runs", []))
    runs.append(
        {
            "at": dt.datetime.now(dt.UTC).isoformat(timespec="seconds"),
            "profiles": profiles,
            "spent_usd": round(spent_usd, 4),
        }
    )
    # Keep the tail only: this is a spend sanity-check trail, not an archive —
    # the per-run JSON reports hold the full-fidelity record.
    state["runs"] = runs[-50:]
    _save_state(path, state)


def cumulative_spend(state_path: Path | None = None) -> float:
    """Total recorded across every brief-check run, so a routine check can say
    what this habit has cost so far rather than only what this run cost."""
    state = _load_state(state_path or STATE_PATH)
    return round(sum(float(r.get("spent_usd", 0.0)) for r in state.get("runs", [])), 4)


def report_path(stamp: str | None = None) -> Path:
    """Where a run's raw JSON goes. Always written, even on a failed run —
    an unpersisted paid API result is money spent for nothing."""
    stamp = stamp or dt.datetime.now(dt.UTC).strftime("%Y-%m-%dT%H-%M-%SZ")
    directory = Path(os.environ.get("REGINA_REPORT_DIR", "exports/brief-checks"))
    directory.mkdir(parents=True, exist_ok=True)
    return directory / f"brief-check-{stamp}.json"
