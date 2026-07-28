"""Judged before/after comparison of two brief-check runs.

A measurement tool that is silently wrong is worse than no tool, so the tests
here concentrate on the two ways this one could mislead: comparing profiles that
aren't actually the same, and comparing corpora that aren't actually comparable.
"""

from __future__ import annotations

from etl.brief_eval.compare import compare_runs, render
from etl.brief_eval.rotation import compare_fingerprints


def _report(profiles, corpus=None, **stats):
    base = {"passages": 100, "documents": 60, "substantive_documents_per_passage": 0.5}
    base.update(stats)
    return {
        "corpus": corpus,
        "results": [
            {"profile": name, "briefing": f"brief for {name}", "retrieval_stats": dict(base)}
            for name in profiles
        ],
    }


class FakeJudge:
    """Returns a fixed score per side, so deltas are predictable."""

    def __init__(self, sides):
        self.sides = list(sides)
        self.calls = 0
        self.messages = self

    def create(self, **kwargs):
        raise AssertionError("compare_runs must go through judge_panel, not raw create")


def _fake_judge_panel(scores_per_call):
    calls = {"n": 0}

    def _panel(client, items):
        value = scores_per_call[calls["n"]]
        calls["n"] += 1
        return [
            {
                "relevance": value,
                "citation_quality": value,
                "scope_matching": value,
                "prioritization": value,
                "political_currency": value,
                "stakeholder_specificity": value,
                "tone_and_structure": value,
                "score": value,
            }
            for _ in items
        ]

    _panel.calls = calls
    return _panel


# --- corpus comparability -------------------------------------------------


def test_unembedded_passages_are_flagged_as_uncomparable():
    """The exact mistake this exists to prevent: an 'after' run generated while
    1,243 judgments were still unembedded measured a corpus state that will
    never exist again, and nothing in the report said so."""
    warnings = compare_fingerprints(
        {"documents": 100, "embedded_passages": 500, "unembedded_passages": 0, "enrichments": 10},
        {"documents": 100, "embedded_passages": 500, "unembedded_passages": 900, "enrichments": 10},
    )
    assert any("unembedded" in w for w in warnings)
    assert any("after" in w for w in warnings)


def test_corpus_growth_is_flagged_as_not_a_controlled_test():
    warnings = compare_fingerprints(
        {"documents": 4781, "embedded_passages": 1, "unembedded_passages": 0, "enrichments": 0},
        {"documents": 6366, "embedded_passages": 1, "unembedded_passages": 0, "enrichments": 874},
    )
    assert any("grew by 1585 documents" in w for w in warnings)
    assert any("enrichment" in w.lower() for w in warnings)


def test_identical_settled_corpora_produce_no_warnings():
    fp = {
        "documents": 100,
        "embedded_passages": 500,
        "unembedded_passages": 0,
        "enrichments": 10,
    }
    assert compare_fingerprints(fp, dict(fp)) == []


def test_missing_fingerprint_is_flagged_not_assumed_clean():
    """Reports written before fingerprinting existed must not read as verified."""
    warnings = compare_fingerprints(None, {"documents": 1, "unembedded_passages": 0})
    assert any("no corpus fingerprint" in w for w in warnings)


# --- matched pairs --------------------------------------------------------


def test_only_profiles_in_both_runs_are_compared(monkeypatch):
    """A comparison across different profile sets is not a comparison. The
    unmatched profile must be excluded AND reported, never quietly averaged in."""
    import etl.brief_eval.compare as mod

    monkeypatch.setattr(mod, "judge_panel", _fake_judge_panel([3.0, 4.0]))
    result = compare_runs(
        None,
        _report(["A", "B"]),
        _report(["B", "C"]),
    )
    assert result["matched"] == ["B"]
    assert set(result["dropped"]) == {"A", "C"}
    assert any("present in only one run" in w for w in result["warnings"])


def test_deltas_are_computed_per_dimension(monkeypatch):
    import etl.brief_eval.compare as mod

    monkeypatch.setattr(mod, "judge_panel", _fake_judge_panel([3.0, 4.5]))
    result = compare_runs(None, _report(["A"]), _report(["A"]))
    assert result["dimensions"]["score"]["delta"] == 1.5
    assert result["dimensions"]["political_currency"]["before"] == 3.0
    assert result["dimensions"]["political_currency"]["after"] == 4.5


def test_no_overlap_returns_early_without_judging(monkeypatch):
    """Judging is two paid calls; with nothing to compare it must not spend."""
    import etl.brief_eval.compare as mod

    panel = _fake_judge_panel([3.0, 4.0])
    monkeypatch.setattr(mod, "judge_panel", panel)
    result = compare_runs(None, _report(["A"]), _report(["B"]))
    assert result["matched"] == []
    assert panel.calls["n"] == 0
    assert "nothing to compare" in render(result).lower()


def test_briefs_without_text_are_not_treated_as_results(monkeypatch):
    """A dry run stores no briefing text; it must not count as a comparable side."""
    import etl.brief_eval.compare as mod

    monkeypatch.setattr(mod, "judge_panel", _fake_judge_panel([3.0, 4.0]))
    before = _report(["A"])
    before["results"][0]["briefing"] = None
    result = compare_runs(None, before, _report(["A"]))
    assert result["matched"] == []


# --- rendering ------------------------------------------------------------


def test_render_marks_small_deltas_as_noise(monkeypatch):
    """n=5 scored 1-5 cannot resolve small differences; the output has to say so
    rather than inviting a decision on a 0.1 move."""
    import etl.brief_eval.compare as mod

    monkeypatch.setattr(mod, "judge_panel", _fake_judge_panel([3.0, 3.1]))
    text = render(compare_runs(None, _report(["A"]), _report(["A"])))
    assert "(noise)" in text
    assert "treat |delta| < 0.3 as noise" in text


def test_render_puts_warnings_before_any_number(monkeypatch):
    import etl.brief_eval.compare as mod

    monkeypatch.setattr(mod, "judge_panel", _fake_judge_panel([3.0, 4.0]))
    text = render(
        compare_runs(
            None,
            _report(["A"], corpus={"documents": 1, "unembedded_passages": 5}),
            _report(["A"], corpus={"documents": 1, "unembedded_passages": 0}),
        )
    )
    assert text.index("warning") < text.index("dimension")


def test_render_includes_retrieval_shape_alongside_scores(monkeypatch):
    """A score change with no retrieval explanation is an unattributable number."""
    import etl.brief_eval.compare as mod

    monkeypatch.setattr(mod, "judge_panel", _fake_judge_panel([3.0, 4.0]))
    text = render(
        compare_runs(
            None,
            _report(["A"], substantive_documents_per_passage=0.9),
            _report(["A"], substantive_documents_per_passage=0.4),
        )
    )
    assert "substantive_documents_per_passage" in text
