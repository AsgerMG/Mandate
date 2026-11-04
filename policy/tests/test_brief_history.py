"""The dated run ledger, and the per-run absolute score that makes it readable.

`brief-compare` could always answer "did that change help?" between two chosen
runs. Neither it nor anything else could answer "what has cost, latency and
quality actually done over ten runs", because quality was only ever pairwise and
nothing joined the reports together. These tests pin the two properties that make
a trend trustworthy: a field a run never recorded reads as absent rather than as
zero, and a dry run still contributes what it did measure.
"""

from __future__ import annotations

import json

from etl.brief_eval.history import render, run_rows


def _write(tmp_path, name, **report):
    path = tmp_path / name
    path.write_text(json.dumps(report))
    return path


def _billed(profile="Acme", **stats):
    base = {"passages": 100, "substantive_documents_per_passage": 0.5}
    base.update(stats)
    return {"profile": profile, "briefing": "text", "retrieval_stats": base, "seconds": 70.0}


# --- absent is not zero ---------------------------------------------------


def test_a_run_that_recorded_no_latency_renders_as_absent(tmp_path):
    """An older report has no `seconds`. Rendering 0.0 would read as "that run was
    instant" — the same confidently-wrong-number failure brief-compare had when it
    printed a missing metric as 0.00."""
    _write(
        tmp_path,
        "brief-check-2026-07-27T14-44-15Z.json",
        spent_usd=2.67,
        results=[{"profile": "Acme", "briefing": "t", "retrieval_stats": {"passages": 108}}],
    )
    rows = run_rows(tmp_path)
    assert rows[0]["seconds_per_brief"] is None
    assert rows[0]["score"] is None
    assert "—" in render(rows)


def test_scores_are_read_from_the_judged_block(tmp_path):
    _write(
        tmp_path,
        "brief-check-2026-07-29T13-00-00Z.json",
        spent_usd=6.0,
        model="claude-sonnet-5",
        judged={"means": {"score": 4.11, "canon_issues": 0.4}},
        results=[_billed()],
    )
    row = run_rows(tmp_path)[0]
    assert row["score"] == 4.11 and row["canon_unresolved"] == 0
    assert "4.11" in render([row])


# --- dry runs are part of the history -------------------------------------


def test_a_dry_run_still_contributes_its_retrieval_and_latency(tmp_path):
    """A dry run measures retrieval and nothing else — which is exactly what the
    variance runs are. A first version filtered on `briefing` and dropped them
    entirely, discarding the only rows carrying a noise-floor measurement."""
    _write(
        tmp_path,
        "brief-check-2026-07-29T08-52-04Z.json",
        dry_run=True,
        spent_usd=0.0,
        results=[
            {
                "profile": "Acme",
                "briefing": None,
                "seconds": 7.8,
                "retrieval_stats": {"passages": 112, "substantive_documents_per_passage": 0.52},
            }
        ],
    )
    row = run_rows(tmp_path)[0]
    assert row["briefs"] == 1
    assert row["passages"] == 112 and row["seconds_per_brief"] == 7.8
    assert row["usd_per_brief"] is None  # nothing was billed, so there is no rate


def test_cost_per_brief_divides_by_billed_briefs_not_all_profiles(tmp_path):
    """A run where one profile failed before generating must not report its cost
    spread across a brief that never existed."""
    _write(
        tmp_path,
        "brief-check-2026-07-29T13-00-00Z.json",
        spent_usd=1.0,
        results=[_billed("A"), {"profile": "B", "briefing": None}],
    )
    assert run_rows(tmp_path)[0]["usd_per_brief"] == 1.0


# --- shape ----------------------------------------------------------------


def test_rows_are_ordered_oldest_first_across_subdirectories(tmp_path):
    """Past sessions copied reports into labelled sibling folders to stop them being
    overwritten; those are history, not clutter."""
    (tmp_path / "baseline").mkdir()
    (tmp_path / "after").mkdir()
    _write(tmp_path / "after", "brief-check-2026-07-27T15-50-29Z.json", results=[_billed()])
    _write(tmp_path / "baseline", "brief-check-2026-07-27T14-44-15Z.json", results=[_billed()])
    rows = run_rows(tmp_path)
    assert [r["label"] for r in rows] == ["baseline", "after"]
    assert rows[0]["when"] == "2026-07-27 14:44"


def test_an_unreadable_report_is_skipped_not_fatal(tmp_path):
    """One truncated file must not make the whole history unreadable."""
    (tmp_path / "brief-check-2026-07-29T00-00-00Z.json").write_text("{not json")
    _write(tmp_path, "brief-check-2026-07-29T13-00-00Z.json", results=[_billed()])
    assert len(run_rows(tmp_path)) == 1


def test_no_reports_says_so(tmp_path):
    assert "No brief-check reports found" in render(run_rows(tmp_path))
