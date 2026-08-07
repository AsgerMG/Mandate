"""Recency coverage, and the wiring that makes it visible on the routine path.

`project-management/brief-eval-post-voyage.md` records Round 0 at **0/8 (0.0%)**
on 2026-07-21 — not one document published in the preceding 30 days reached any
panel brief's retrieved passages. It was measured once and never again, because
`recency.py` was wired only into `brief-improve` (on-demand, budget-guarded) and
not into `brief-check` (the routine evaluation path). The routine path could not
see this class of regression at all: a brief built entirely on last year's law
is well-written, well-cited, scores fine, and is wrong.

These pin the three things that failure needed and did not have — the metric is
computable from a stored report, "no data" is distinguishable from a real 0%,
and the ledger prints it.
"""

from __future__ import annotations

import datetime as dt
import json

from data.models import Document, DocumentType, Jurisdiction, LifecycleStage, Source
from etl.brief_eval.history import render, run_rows
from etl.brief_eval.recency import recency_coverage, recency_from_results, retrieved_celex


def _seed_acts(session, entries: list[tuple[str, int]]) -> None:
    """One document per (celex, days_ago) — `days_ago` is the act's real-world
    publication date, which is what recency_coverage measures on."""
    src = Source(key="eurlex", name="eurlex", jurisdiction=Jurisdiction.EU)
    session.add(src)
    session.flush()
    for celex, days_ago in entries:
        session.add(
            Document(
                source_id=src.id,
                external_id=celex,
                celex=celex,
                title=f"Act {celex}",
                jurisdiction=Jurisdiction.EU,
                document_type=DocumentType.REGULATION,
                lifecycle_stage=LifecycleStage.IN_FORCE,
                date_document=dt.date.today() - dt.timedelta(days=days_ago),
            )
        )
    session.commit()


def _result(celex: list[str] | None, **extra) -> dict:
    stats: dict = {"passages": 100}
    if celex is not None:
        stats["retrieved_celex"] = celex
    return {"profile": "Acme", "briefing": "text", "retrieval_stats": stats, **extra}


# --- the metric is computable from what a report actually stores ------------


def test_recency_is_computable_from_a_runs_stored_results(db_session):
    """Reports keep each brief's retrieval_stats and never its passages, so
    `retrieved_celex` is the only channel this can travel on. Without it the
    number is not recoverable from a stored run at all — which is why it was
    measured once and then never again."""
    _seed_acts(db_session, [("A", 3), ("B", 10), ("OLD", 400)])

    coverage = recency_from_results(db_session, [_result(["A", "OLD"])])

    assert coverage["recent_total"] == 2, "only A and B were published in the window"
    assert coverage["recent_covered"] == 1
    assert coverage["coverage_pct"] == 50.0
    assert coverage["measurable"] is True


def test_coverage_is_unioned_across_the_whole_run_not_per_brief(db_session):
    """One profile ignoring a new telecoms act is correct behaviour; the whole
    panel ignoring every act published this month is a retrieval failure. The
    question is only meaningful over the run."""
    _seed_acts(db_session, [("A", 1), ("B", 2)])

    coverage = recency_from_results(db_session, [_result(["A"]), _result(["B"])])

    assert coverage["recent_covered"] == 2
    assert coverage["coverage_pct"] == 100.0


def test_a_run_that_recorded_nothing_is_not_a_zero_percent_run(db_session):
    """The distinction the 0/8 figure needs. A metric that reads 0 both when it
    is broken and when the thing it measures is broken cannot raise an alarm —
    older reports predate `retrieved_celex` and must say so."""
    _seed_acts(db_session, [("A", 1)])

    unrecordable = recency_from_results(db_session, [_result(None)])
    assert unrecordable["measurable"] is False

    genuinely_zero = recency_from_results(db_session, [_result(["SOMETHING_ELSE"])])
    assert genuinely_zero["measurable"] is True
    assert genuinely_zero["coverage_pct"] == 0.0


def test_an_errored_profile_contributes_nothing_rather_than_raising(db_session):
    _seed_acts(db_session, [("A", 1)])
    coverage = recency_from_results(
        db_session, [{"profile": "B", "error": "budget exhausted"}, _result(["A"])]
    )
    assert coverage["recent_covered"] == 1


def test_retrieved_celex_tolerates_a_report_shape_it_has_never_seen():
    assert retrieved_celex([]) == set()
    assert retrieved_celex([{"profile": "A"}]) == set()
    assert retrieved_celex([{"retrieval_stats": {"retrieved_celex": None}}]) == set()


def test_an_empty_recent_window_reports_absent_not_zero(db_session):
    """No acts published in 30 days is not 0% coverage — there was nothing to
    cover. coverage_pct is None so the ledger prints "—"."""
    _seed_acts(db_session, [("OLD", 400)])
    assert recency_coverage(db_session, {"OLD"})["coverage_pct"] is None


# --- and the routine path prints it -----------------------------------------


def test_the_run_ledger_shows_recency_for_every_run(tmp_path):
    (tmp_path / "brief-check-2026-08-07T10-00-00Z.json").write_text(
        json.dumps(
            {
                "spent_usd": 2.0,
                "recency": {"recent_total": 8, "recent_covered": 3, "coverage_pct": 37.5},
                "results": [_result(["A"], seconds=70.0)],
            }
        )
    )
    rows = run_rows(tmp_path)
    assert rows[0]["recent_pct"] == 37.5
    assert "37.5" in render(rows)
    assert "recent%" in render(rows)


def test_a_run_with_no_recency_data_renders_as_absent_not_zero(tmp_path):
    """Same rule as latency and score: a field the run never recorded reads as
    absent. A 0.0 here would be indistinguishable from the real failure."""
    (tmp_path / "brief-check-2026-07-27T14-44-15Z.json").write_text(
        json.dumps({"spent_usd": 2.0, "results": [_result(None, seconds=70.0)]})
    )
    assert run_rows(tmp_path)[0]["recent_pct"] is None

    (tmp_path / "brief-check-2026-08-07T11-00-00Z.json").write_text(
        json.dumps(
            {
                "spent_usd": 2.0,
                "recency": {
                    "recent_total": 0,
                    "recent_covered": 0,
                    "coverage_pct": 0.0,
                    "measurable": False,
                },
                "results": [_result(None, seconds=70.0)],
            }
        )
    )
    rows = {r["when"]: r for r in run_rows(tmp_path)}
    assert rows["2026-08-07 11:00"]["recent_pct"] is None, (
        "a run that could not measure recency must not report it as 0%"
    )
