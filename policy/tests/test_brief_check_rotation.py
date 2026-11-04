"""Rotation + spend bookkeeping for `regina brief-check`.

No API key, no network: the point under test is that consecutive runs cover
different company types and that the cursor only advances for profiles that
actually ran.
"""

from __future__ import annotations

import json

from etl.brief_eval.panel import EVAL_PANEL
from etl.brief_eval.rotation import (
    cumulative_spend,
    record_run,
    select_profiles,
)


def test_first_run_starts_at_the_top_of_the_panel(tmp_path):
    state = tmp_path / "state.json"
    picked, cursor = select_profiles(count=1, state_path=state)
    assert [p.name for p in picked] == [EVAL_PANEL[0].name]
    assert cursor == 1


def test_consecutive_runs_cover_different_company_types(tmp_path):
    """The whole spend argument: one profile per run is only acceptable if
    successive runs aren't the same profile."""
    state = tmp_path / "state.json"
    seen = []
    for _ in range(len(EVAL_PANEL)):
        picked, cursor = select_profiles(count=1, state_path=state)
        seen.append(picked[0].name)
        record_run(cursor=cursor, profiles=[picked[0].name], spent_usd=0.1, state_path=state)
    assert len(set(seen)) == len(EVAL_PANEL)


def test_rotation_wraps_around_the_panel(tmp_path):
    state = tmp_path / "state.json"
    state.write_text(json.dumps({"cursor": len(EVAL_PANEL) - 1, "runs": []}))
    picked, cursor = select_profiles(count=2, state_path=state)
    assert [p.name for p in picked] == [EVAL_PANEL[-1].name, EVAL_PANEL[0].name]
    assert cursor == 1


def test_cursor_does_not_advance_until_the_run_is_recorded(tmp_path):
    """A crashed or budget-stopped run must not skip the profile it never
    checked — otherwise a failing profile silently rotates out of coverage."""
    state = tmp_path / "state.json"
    first, _ = select_profiles(count=1, state_path=state)
    second, _ = select_profiles(count=1, state_path=state)
    assert first[0].name == second[0].name


def test_all_profiles_ignores_the_cursor_and_leaves_it_alone(tmp_path):
    state = tmp_path / "state.json"
    state.write_text(json.dumps({"cursor": 3, "runs": []}))
    picked, cursor = select_profiles(all_profiles=True, state_path=state)
    assert len(picked) == len(EVAL_PANEL)
    # A --all run covers everything, so it should not shift whose turn it is
    # for the next routine single-profile check.
    assert cursor == 3


def test_count_larger_than_the_panel_never_repeats_a_profile(tmp_path):
    state = tmp_path / "state.json"
    picked, _ = select_profiles(count=99, state_path=state)
    assert len(picked) == len(EVAL_PANEL)
    assert len({p.name for p in picked}) == len(EVAL_PANEL)


def test_cumulative_spend_accumulates_across_runs(tmp_path):
    state = tmp_path / "state.json"
    record_run(cursor=1, profiles=["a"], spent_usd=0.25, state_path=state)
    record_run(cursor=2, profiles=["b"], spent_usd=0.5, state_path=state)
    assert cumulative_spend(state_path=state) == 0.75


def test_spend_history_is_capped_so_the_state_file_cannot_grow_forever(tmp_path):
    state = tmp_path / "state.json"
    for _ in range(60):
        record_run(cursor=0, profiles=["a"], spent_usd=0.01, state_path=state)
    assert len(json.loads(state.read_text())["runs"]) == 50


def test_corrupt_state_file_does_not_block_a_check(tmp_path):
    state = tmp_path / "state.json"
    state.write_text("{not json")
    picked, cursor = select_profiles(count=1, state_path=state)
    assert len(picked) == 1
    assert cursor == 1
