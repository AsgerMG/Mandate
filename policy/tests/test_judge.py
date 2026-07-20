"""_score_from_llm — pure-function tests, no API key, no network.

Covers the canon-issue penalty scaling that a real brief-eval run showed was
saturating: single-pass (sharpen=False) generation ran 7-32 canon issues per
profile, and the old 0.5/issue constant hit its 2.0 cap for nearly every one
of them, making the deterministic canon signal flat regardless of which
candidate prompt was under test.
"""

from __future__ import annotations

from etl.brief_eval.judge import _score_from_llm


def _raw(relevance: int, citation_quality: int, scope_matching: int) -> dict:
    return {
        "profile": "X",
        "relevance": relevance,
        "citation_quality": citation_quality,
        "scope_matching": scope_matching,
        "critique": "n/a",
    }


def test_zero_canon_issues_means_zero_penalty():
    scores = _score_from_llm(_raw(4, 4, 4), canon_issue_count=0)
    assert scores["canon_issues"] == 0
    assert scores["score"] == 4.0  # (4+4+4)/3 - 0


def test_realistic_range_stays_differentiable():
    # The real observed range from a live run — must not saturate.
    low = _score_from_llm(_raw(4, 4, 4), canon_issue_count=7)
    high = _score_from_llm(_raw(4, 4, 4), canon_issue_count=32)
    assert low["score"] > high["score"]
    assert low["score"] == 4.0 - 0.35
    assert round(high["score"], 3) == round(4.0 - 1.6, 3)


def test_high_count_still_caps_at_two():
    scores = _score_from_llm(_raw(5, 5, 5), canon_issue_count=1000)
    assert scores["score"] == 5.0 - 2.0  # penalty capped, not 0.05*1000


def test_score_floor_engages_when_warranted():
    scores = _score_from_llm(_raw(1, 1, 1), canon_issue_count=1000)
    assert scores["score"] == 1.0  # max(1.0, 1.0 - 2.0)
