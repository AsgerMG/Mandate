"""etl/brief_eval/search.py's dimension-mean helper — pure-function test,
no API key, no network."""

from __future__ import annotations

from etl.brief_eval.search import _dimension_means


def _judge(relevance, citation_quality, scope_matching, canon_issues):
    return {
        "relevance": relevance,
        "citation_quality": citation_quality,
        "scope_matching": scope_matching,
        "prioritization": relevance,
        "political_currency": relevance,
        "stakeholder_specificity": relevance,
        "tone_and_structure": relevance,
        "canon_issues": canon_issues,
    }


def test_dimension_means_averages_across_the_panel():
    profile_results = [
        {"profile": "A", "judge": _judge(4, 4, 4, canon_issues=10)},
        {"profile": "B", "judge": _judge(2, 2, 2, canon_issues=20)},
    ]
    means = _dimension_means(profile_results)
    assert means["relevance"] == 3.0
    assert means["citation_quality"] == 3.0
    assert means["scope_matching"] == 3.0
    assert means["canon_issues"] == 15.0


def test_dimension_means_empty_panel_returns_empty_dict():
    assert _dimension_means([]) == {}
