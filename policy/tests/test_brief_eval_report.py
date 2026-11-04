"""etl/brief_eval/report.py's new dimension-table and output-diff helpers —
pure-function tests, no API key, no network."""

from __future__ import annotations

from etl.brief_eval.report import (
    _pick_diff_profile,
    _render_section_diff,
    _round_diffs,
    _split_named_sections,
    _winning_round,
    render_log_entry,
    render_report,
)

_BRIEF = """# Regulatory Intelligence Brief: Acme

**Headline verdict.**

## Bottom line
- ACTION: do the thing.

## Compliance exposure

| Instrument | Prio | Verdict | Why / Trigger |
|---|---|---|---|
| GDPR | 1 | In Scope | Processes personal data. |

## Political landscape & strategic play

The rapporteur is on record.

## Appendix: Out of Scope Register

| Instrument | Why Out of Scope | What Would Change It |
|---|---|---|
| CRA | Not a manufacturer. | Starts selling hardware. |
"""


def test_split_named_sections_finds_all_four_headers():
    sections = _split_named_sections(_BRIEF)
    assert set(sections) == {
        "Bottom line",
        "Compliance exposure",
        "Political landscape & strategic play",
        "Appendix: Out of Scope Register",
    }
    assert "ACTION: do the thing." in sections["Bottom line"]


def test_split_named_sections_tolerates_a_missing_section():
    text_without_appendix = _BRIEF.split("## Appendix")[0]
    sections = _split_named_sections(text_without_appendix)
    assert "Appendix: Out of Scope Register" not in sections
    assert "Bottom line" in sections


def test_split_named_sections_empty_text_returns_empty_dict():
    assert _split_named_sections("") == {}
    assert _split_named_sections(None) == {}


def _profile(name, score, briefing="text"):
    return {"profile": name, "judge": {"score": score, "critique": "n/a"}, "briefing": briefing}


def test_pick_diff_profile_prefers_targeted_profile():
    baseline = {"profiles": [_profile("A", 3.0), _profile("B", 4.0)]}
    winner = {
        "profiles": [_profile("A", 3.1), _profile("B", 4.5)],
        "candidate": {"targeted_profile": "A"},
    }
    # B has the larger delta (0.5 vs 0.1), but A was the profile the
    # candidate's rationale actually targeted — that must win.
    assert _pick_diff_profile(baseline, winner) == "A"


def test_pick_diff_profile_falls_back_to_max_delta_when_target_missing():
    baseline = {"profiles": [_profile("A", 3.0), _profile("B", 4.0)]}
    winner = {
        "profiles": [_profile("A", 3.1), _profile("B", 4.5)],
        "candidate": {"targeted_profile": "Nonexistent"},
    }
    assert _pick_diff_profile(baseline, winner) == "B"


def test_pick_diff_profile_returns_none_when_no_profiles_in_common():
    baseline = {"profiles": [_profile("A", 3.0)]}
    winner = {"profiles": [_profile("B", 4.0)], "candidate": {}}
    assert _pick_diff_profile(baseline, winner) is None


def test_render_section_diff_identical_text_produces_nothing():
    assert _render_section_diff(_BRIEF, _BRIEF) == ""


def test_render_section_diff_shows_only_the_changed_section():
    changed = _BRIEF.replace("do the thing.", "do the OTHER thing.")
    diff = _render_section_diff(_BRIEF, changed)
    assert "#### Bottom line" in diff
    assert "OTHER thing" in diff
    # Unchanged sections must not appear in the diff at all.
    assert "#### Compliance exposure" not in diff


def test_render_section_diff_truncates_an_oversized_change():
    huge_before = "## Bottom line\n" + "\n".join(f"- line {i}" for i in range(200))
    huge_after = "## Bottom line\n" + "\n".join(f"- line {i} CHANGED" for i in range(200))
    diff = _render_section_diff(huge_before, huge_after)
    assert "lines omitted" in diff


def _round(
    round_num,
    accepted,
    aggregate=3.0,
    dimension_means=None,
    candidate=None,
    profiles=None,
    delta=0.0,
):
    return {
        "round": round_num,
        "accepted": accepted,
        "aggregate": aggregate,
        "dimension_means": dimension_means or {},
        "candidate": candidate,
        "profiles": profiles or [],
        "elapsed_seconds": 1.0,
        "delta": delta,
    }


def test_winning_round_is_baseline_when_nothing_accepted():
    report = {"rounds": [_round(0, True), _round(1, False)]}
    assert _winning_round(report)["round"] == 0


def test_winning_round_is_the_latest_accepted_round():
    report = {"rounds": [_round(0, True), _round(1, False), _round(2, True)]}
    assert _winning_round(report)["round"] == 2


def test_winning_round_none_when_no_rounds_at_all():
    assert _winning_round({"rounds": []}) is None


def test_render_report_no_candidate_accepted_shows_baseline_only_dimension_table():
    report = {
        "budget": {"spent_usd": 1.0, "cap_usd": 6.0, "calls": 5, "breakdown": {}},
        "stop_reason": "completed_all_rounds",
        "rounds": [
            _round(
                0,
                True,
                aggregate=3.5,
                dimension_means={"relevance": 4.0},
                profiles=[_profile("A", 3.5)],
            )
        ],
        "baseline": {"aggregate": 3.5},
        "winner": {"changed": False, "aggregate": 3.5},
        "confirmation": None,
    }
    md = render_report(report)
    assert "## Dimension breakdown" in md
    assert "No candidate was accepted this run" in md
    assert "## Output diff" in md
    assert "No candidate produced output this run" in md


def test_render_report_with_accepted_candidate_shows_delta_and_diff():
    baseline_profiles = [_profile("A", 3.0, briefing=_BRIEF)]
    changed_brief = _BRIEF.replace("do the thing.", "do the OTHER thing.")
    winner_profiles = [_profile("A", 4.0, briefing=changed_brief)]
    report = {
        "budget": {"spent_usd": 1.0, "cap_usd": 6.0, "calls": 5, "breakdown": {}},
        "stop_reason": "completed_all_rounds",
        "rounds": [
            _round(
                0,
                True,
                aggregate=3.0,
                dimension_means={"relevance": 3.0},
                profiles=baseline_profiles,
            ),
            _round(
                1,
                True,
                aggregate=4.0,
                dimension_means={"relevance": 4.0},
                candidate={
                    "rationale": "sharpen tone",
                    "targeted_profile": "A",
                    "new_system_prompt": "x",
                },
                profiles=winner_profiles,
            ),
        ],
        "baseline": {"aggregate": 3.0},
        "winner": {
            "changed": True,
            "aggregate": 4.0,
            "improvement": 1.0,
            "prompt": "y",
            "original_prompt": "x",
        },
        "confirmation": None,
    }
    md = render_report(report)
    assert "| relevance | 3.0 | 4.0 | +1.000 |" in md
    assert "Representative before/after for **A**" in md
    assert "OTHER thing" in md


def test_render_log_entry_drops_the_redundant_h1_and_demotes_sections():
    report = {
        "budget": {"spent_usd": 1.0, "cap_usd": 6.0, "calls": 5, "breakdown": {}},
        "stop_reason": "completed_all_rounds",
        "rounds": [_round(0, True, aggregate=3.5, dimension_means={"relevance": 4.0})],
        "baseline": {"aggregate": 3.5},
        "winner": {"changed": False, "aggregate": 3.5},
        "confirmation": None,
    }
    entry = render_log_entry(report, "2026-01-01 00:00 UTC — no candidate accepted")
    lines = entry.splitlines()
    # Exactly one heading in the whole entry may be an H1-free, single H2
    # opener — render_report()'s own "# Brief self-improvement run" must be
    # gone entirely, not just relocated.
    assert lines[0] == "## 2026-01-01 00:00 UTC — no candidate accepted"
    assert "# Brief self-improvement run" not in entry
    # Every one of render_report()'s top-level sections must be demoted one
    # level so they nest correctly under this entry's own H2. Checked as
    # exact lines, not substrings — "### Foo" trivially contains "## Foo".
    assert "### Dimension breakdown" in lines
    assert "### Output diff" in lines
    assert "## Dimension breakdown" not in lines


def _candidate(rationale="edit", targeted_profile="A"):
    return {"rationale": rationale, "new_system_prompt": "x", "targeted_profile": targeted_profile}


def test_round_diffs_empty_when_only_baseline_ran():
    report = {"rounds": [_round(0, True, profiles=[_profile("A", 3.0)])]}
    assert _round_diffs(report) == []


def test_round_diffs_skips_rounds_with_no_candidate():
    report = {
        "rounds": [
            _round(0, True, profiles=[_profile("A", 3.0)]),
            {"round": 1, "accepted": False, "candidate": None, "reason": "budget_exhausted"},
        ]
    }
    assert _round_diffs(report) == []


def test_round_diffs_includes_a_rejected_round_not_just_accepted_ones():
    baseline_brief = "## Bottom line\nold text"
    rejected_brief = "## Bottom line\nrejected candidate's text"
    report = {
        "rounds": [
            _round(0, True, profiles=[_profile("A", 3.0, briefing=baseline_brief)]),
            _round(
                1,
                False,  # rejected by the automated bar — must still be diffable
                candidate=_candidate(rationale="tried sharpening tone"),
                profiles=[_profile("A", 3.05, briefing=rejected_brief)],
            ),
        ]
    }
    diffs = _round_diffs(report)
    assert len(diffs) == 1
    assert diffs[0]["round"] == 1
    assert diffs[0]["accepted"] is False
    assert diffs[0]["rationale"] == "tried sharpening tone"
    assert "rejected candidate's text" in diffs[0]["diff"]


def test_round_diffs_diffs_against_the_running_best_not_always_baseline():
    baseline_brief = "## Bottom line\nv0"
    accepted_brief = "## Bottom line\nv1 accepted"
    round2_brief = "## Bottom line\nv2 rejected"
    report = {
        "rounds": [
            _round(0, True, profiles=[_profile("A", 3.0, briefing=baseline_brief)]),
            _round(
                1,
                True,
                candidate=_candidate(rationale="round 1 edit"),
                profiles=[_profile("A", 3.5, briefing=accepted_brief)],
            ),
            _round(
                2,
                False,
                candidate=_candidate(rationale="round 2 edit"),
                profiles=[_profile("A", 3.4, briefing=round2_brief)],
            ),
        ]
    }
    diffs = _round_diffs(report)
    assert len(diffs) == 2
    # Round 2 must be diffed against round 1's (accepted) output, not round 0's.
    assert "v1 accepted" in diffs[1]["diff"]
    assert "v0" not in diffs[1]["diff"]


def test_render_report_shows_a_rejected_rounds_diff_too():
    baseline_brief = "## Bottom line\nold text"
    rejected_brief = "## Bottom line\nrejected candidate's text"
    report = {
        "budget": {"spent_usd": 1.0, "cap_usd": 6.0, "calls": 5, "breakdown": {}},
        "stop_reason": "completed_all_rounds",
        "rounds": [
            _round(0, True, aggregate=3.0, profiles=[_profile("A", 3.0, briefing=baseline_brief)]),
            _round(
                1,
                False,
                aggregate=3.02,
                delta=0.02,
                candidate=_candidate(rationale="tried it, didn't clear the bar"),
                profiles=[_profile("A", 3.02, briefing=rejected_brief)],
            ),
        ],
        "baseline": {"aggregate": 3.0},
        "winner": {"changed": False, "aggregate": 3.0},
        "confirmation": None,
    }
    md = render_report(report)
    assert "### Round 1 — rejected" in md
    assert "tried it, didn't clear the bar" in md
    assert "rejected candidate's text" in md


def test_render_report_uncapped_budget_does_not_crash():
    report = {
        "budget": {"spent_usd": 4.5, "cap_usd": None, "calls": 10, "breakdown": {}},
        "stop_reason": "completed_all_rounds",
        "rounds": [_round(0, True, profiles=[_profile("A", 3.0)])],
        "baseline": {"aggregate": 3.0},
        "winner": {"changed": False, "aggregate": 3.0},
        "confirmation": None,
    }
    md = render_report(report)
    assert "no cap" in md
    assert "$4.50" in md


def test_render_report_shows_preserved_partial_confirmation_baseline():
    # Regression: a candidate-side failure used to discard the baseline
    # side too, even though it had already finished and was fully paid
    # for. search.py now preserves whichever side completed; report.py
    # must surface that instead of just saying "skipped".
    report = {
        "budget": {"spent_usd": 10.0, "cap_usd": 10.0, "calls": 51, "breakdown": {}},
        "stop_reason": "completed_all_rounds",
        "rounds": [
            _round(0, True, aggregate=2.3, profiles=[_profile("A", 2.3)]),
            _round(
                1,
                True,
                aggregate=2.9,
                candidate=_candidate(),
                profiles=[_profile("A", 2.9)],
            ),
        ],
        "baseline": {"aggregate": 2.3},
        "winner": {
            "changed": True,
            "aggregate": 2.9,
            "improvement": 0.6,
            "prompt": "y",
            "original_prompt": "x",
        },
        "confirmation": {
            "skipped": True,
            "reason": "budget_exhausted",
            "baseline": {"aggregate": 2.5, "profiles": [_profile("A", 2.5)]},
            "candidate": None,
        },
    }
    md = render_report(report)
    assert "fully paid for, not wasted" in md
    assert "2.5/5" in md
