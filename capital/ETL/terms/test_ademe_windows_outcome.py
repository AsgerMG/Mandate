"""A failed ADEME fetch is a partial only when it cost the corpus a window.

Run 114 (2026-11-09) recorded the whole week as partial because one archived
page refused a connection, while the row it speaks for still held the window an
earlier run read. Both directions are pinned here: a covered failure is not a
partial, an uncovered one is, and a catalogue that is DOWN is a partial however
well covered, so tolerance cannot hide an outage.

Run: python3 ETL/terms/test_ademe_windows_outcome.py   (also collected by pytest)
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_ademe_windows import CALL_DEADLINE, outcome  # noqa: E402


def row(i: int, end: str | None, basis: str | None = CALL_DEADLINE) -> dict:
    return {"id": f"ademe_aid__{i}", "scheme_end_date": end,
            "scheme_end_date_basis": basis if end else None}


def test_covered_failure_is_not_partial():
    assert outcome([row(1, "2026-12-01")], n_read=60) == 0


def test_uncovered_failure_is_partial():
    assert outcome([row(1, None)], n_read=60) == 3


def test_a_window_from_another_basis_does_not_cover():
    assert outcome([row(1, "2026-12-01", basis="notified_duration")], n_read=60) == 3


def test_an_outage_is_partial_even_when_covered():
    assert outcome([row(i, "2026-12-01") for i in range(40)], n_read=20) == 3


def test_clean_run():
    assert outcome([], n_read=60) == 0


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
    print("ok")
