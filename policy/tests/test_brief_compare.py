"""Judged before/after comparison of two brief-check runs.

A measurement tool that is silently wrong is worse than no tool, so the tests
here concentrate on the two ways this one could mislead: comparing profiles that
aren't actually the same, and comparing corpora that aren't actually comparable.
"""

from __future__ import annotations

from etl.brief_eval.compare import compare_runs, judge_report, render
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


# --- model / cost / latency, the other two axes of a model A/B -------------


def _priced_report(profiles, model, usd, seconds, **stats):
    """A report as brief-check writes one: per-profile spend and wall clock."""
    report = _report(profiles, **stats)
    report["model"] = model
    report["breakdown"] = {name: {"usd": usd, "seconds": seconds} for name in profiles}
    return report


def test_render_reports_model_cost_and_latency_per_side(monkeypatch):
    """A model swap is a three-axis decision. Reading a small quality drop is a
    different call entirely if it came with a third of the cost and half the wall
    clock, and only the quality axis was ever shown."""
    monkeypatch.setattr("etl.brief_eval.compare.judge_panel", _fake_judge_panel([4.0, 3.9]))
    text = render(
        compare_runs(
            None,
            _priced_report(["A"], "claude-sonnet-5", 0.60, 70.0),
            _priced_report(["A"], "claude-haiku-4-5", 0.20, 30.0),
        )
    )
    assert "claude-sonnet-5" in text and "claude-haiku-4-5" in text
    assert "0.6" in text and "0.2" in text
    assert "-67%" in text  # the cost cut, stated as a change not two numbers
    assert "-57%" in text  # and the latency cut


def test_cost_per_brief_counts_only_matched_profiles(monkeypatch):
    """A run covering extra profiles must not look more expensive per brief than
    it was — cost has to be averaged over exactly the briefs that were scored."""
    monkeypatch.setattr("etl.brief_eval.compare.judge_panel", _fake_judge_panel([4.0, 4.0]))
    before = _priced_report(["A", "B"], "claude-sonnet-5", 0.50, 60.0)
    before["breakdown"]["B"] = {"usd": 99.0, "seconds": 999.0}  # not in the other run
    result = compare_runs(None, before, _priced_report(["A"], "claude-haiku-4-5", 0.20, 30.0))
    assert result["run"]["before"]["usd_per_brief"] == 0.50
    assert result["run"]["before"]["seconds_per_brief"] == 60.0


def test_an_older_report_without_the_fields_says_so(monkeypatch):
    """Same rule as the retrieval metrics: a field a run never recorded renders as
    "not recorded", never as a 0.00 that reads like a measurement."""
    monkeypatch.setattr("etl.brief_eval.compare.judge_panel", _fake_judge_panel([4.0, 4.0]))
    text = render(
        compare_runs(
            None,
            _report(["A"]),  # no model, no breakdown — a pre-2026-07-29 report
            _priced_report(["A"], "claude-haiku-4-5", 0.20, 30.0),
        )
    )
    assert "not recorded" in text
    assert "claude-haiku-4-5" in text


def test_the_block_is_omitted_entirely_when_neither_side_has_any(monkeypatch):
    """Two old reports should compare exactly as they did before, with no empty
    section implying a measurement was attempted."""
    monkeypatch.setattr("etl.brief_eval.compare.judge_panel", _fake_judge_panel([4.0, 4.0]))
    text = render(compare_runs(None, _report(["A"]), _report(["A"])))
    assert "cost and latency" not in text


# --- retrieval variance: the noise floor a delta has to clear --------------


def test_retrieval_spread_measures_the_gap_between_identical_runs():
    """`|delta| < 0.3 is noise` was a threshold nobody had ever checked. Retrieval
    needs no API call, so its run-to-run drift can simply be measured."""
    from etl.brief_eval.compare import retrieval_spread

    spread = retrieval_spread(
        [{"passages": 40, "documents": 20}, {"passages": 43, "documents": 20}]
    )
    assert spread["passages"]["spread"] == 3
    assert spread["passages"]["min"] == 40 and spread["passages"]["max"] == 43
    assert spread["documents"]["spread"] == 0  # a metric that didn't move says so


def test_retrieval_spread_needs_at_least_two_runs():
    """One run has no spread — reporting 0 would claim retrieval is deterministic."""
    from etl.brief_eval.compare import retrieval_spread

    assert retrieval_spread([{"passages": 40}]) == {}


# --- absolute per-run score, so quality can be a trend and not only a pair ---


def test_judge_report_scores_one_run_on_its_own_terms(monkeypatch):
    """Without this, quality existed only as a delta between two chosen runs — so
    "has quality improved over ten runs?" had no answer at all."""
    from etl.brief_eval.compare import judge_report

    monkeypatch.setattr("etl.brief_eval.compare.judge_panel", _fake_judge_panel([4.2]))
    result = judge_report(None, _report(["A", "B"]))
    assert result["means"]["score"] == 4.2
    assert set(result["per_profile"]) == {"A", "B"}


def test_judge_report_costs_one_call_regardless_of_panel_size(monkeypatch):
    """The reason it can run on every billed check: judge_panel batches the whole
    panel, so this is a rounding error against a 10-profile generation run."""
    panel = _fake_judge_panel([4.0])
    monkeypatch.setattr("etl.brief_eval.compare.judge_panel", panel)
    judge_report(None, _report(["A", "B", "C", "D", "E"]))
    assert panel.calls["n"] == 1


def test_judge_report_skips_a_run_with_no_briefs(monkeypatch):
    """A dry run has nothing to judge; calling the judge anyway would spend money
    to score empty strings."""
    from etl.brief_eval.compare import judge_report

    panel = _fake_judge_panel([4.0])
    monkeypatch.setattr("etl.brief_eval.compare.judge_panel", panel)
    dry = _report(["A"])
    for r in dry["results"]:
        r["briefing"] = None
    assert judge_report(None, dry) == {}
    assert panel.calls["n"] == 0


# --- the judge's own output budget ----------------------------------------


def test_judge_budget_scales_with_panel_size():
    """A fixed 4,096 was sized for 5 profiles and silently truncated the judge's
    JSON when the panel doubled — the run died with an "Unterminated string" decode
    error pointing nowhere near the cause. Scaling removes the class of bug."""
    from etl.brief_eval.judge import _judge_max_tokens

    assert _judge_max_tokens(10) > _judge_max_tokens(5)
    # Enough for ten profiles' worth of scores AND the thinking that shares the
    # budget — the 4,096 that failed must not be reachable at this panel size.
    assert _judge_max_tokens(10) >= 16_000


def test_judge_budget_has_a_floor_for_tiny_panels():
    from etl.brief_eval.judge import _judge_max_tokens

    assert _judge_max_tokens(1) >= 8_192
