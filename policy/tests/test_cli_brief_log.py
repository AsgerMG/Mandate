"""etl/cli.py's brief-improve log helpers — _brief_log_title and
_prepend_brief_log_entry. Pure file I/O against a tmp_path, never touches
the real project-management/brief-improve-log.md."""

from __future__ import annotations

from etl import cli


def test_brief_log_title_budget_exhausted():
    report = {"stop_reason": "budget_exhausted_mid_baseline"}
    assert cli._brief_log_title(report) == "(partial — budget exhausted)"


def test_brief_log_title_candidate_accepted():
    report = {
        "stop_reason": "completed_all_rounds",
        "winner": {"changed": True, "improvement": 0.5},
    }
    assert cli._brief_log_title(report) == "candidate accepted, aggregate +0.5"


def test_brief_log_title_no_candidate_accepted():
    report = {"stop_reason": "completed_all_rounds", "winner": {"changed": False}}
    assert cli._brief_log_title(report) == "no candidate accepted"


def test_prepend_creates_file_with_header_when_absent(tmp_path, monkeypatch):
    log_path = tmp_path / "brief-improve-log.md"
    monkeypatch.setattr(cli, "_BRIEF_LOG_PATH", str(log_path))
    cli._prepend_brief_log_entry("## 2026-01-01 — first run\n\nContent A.")
    text = log_path.read_text()
    assert text.startswith("# Brief-Improve Log")
    assert "first run" in text
    assert "Content A." in text


def test_prepend_puts_newest_entry_first(tmp_path, monkeypatch):
    log_path = tmp_path / "brief-improve-log.md"
    monkeypatch.setattr(cli, "_BRIEF_LOG_PATH", str(log_path))
    cli._prepend_brief_log_entry("## 2026-01-01 — first run\n\nContent A.")
    cli._prepend_brief_log_entry("## 2026-01-02 — second run\n\nContent B.")
    text = log_path.read_text()
    assert text.index("second run") < text.index("first run")
    # Both entries must survive — prepending must never clobber history.
    assert "Content A." in text
    assert "Content B." in text
