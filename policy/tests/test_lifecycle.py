"""Date parsing and lifecycle derivation for legal acts.

Pure-function tests — no network. The Cellar shapes exercised here were all
observed live against real CELEX ids on 2026-07-27 (see
etl/enrichment/lifecycle.py's module docstring).
"""

from __future__ import annotations

import datetime as dt

from data.models import LifecycleStage
from etl.enrichment.lifecycle import (
    _dates_from_record,
    _fold_rows,
    derive_stage,
)

TODAY = dt.date(2026, 7, 27)


def _row(celex="32024R1689", **fields):
    """A SPARQL result row in the endpoint's own binding shape."""
    row = {"celex": {"value": celex}}
    for key, value in fields.items():
        if value is not None:
            row[key] = {"value": value}
    return row


# --- derive_stage ---------------------------------------------------------


def test_repeal_flag_beats_every_date():
    """An act Cellar reports as no longer in force is REPEALED whatever its
    dates say — the flag is the authoritative signal."""
    stage = derive_stage(
        in_force_flag=False,
        date_in_force=dt.date(2016, 5, 24),
        date_application=dt.date(2018, 5, 25),
        date_end_validity=None,
        today=TODAY,
    )
    assert stage is LifecycleStage.REPEALED


def test_past_end_of_validity_is_repealed():
    stage = derive_stage(
        in_force_flag=None,
        date_in_force=dt.date(2006, 3, 15),
        date_application=dt.date(2007, 3, 15),
        date_end_validity=dt.date(2018, 5, 25),
        today=TODAY,
    )
    assert stage is LifecycleStage.REPEALED


def test_future_application_is_adopted_not_in_force():
    """The distinction the whole date_application column exists for: an act can
    be legally in force with none of its obligations biting yet, and a brief
    must say "from <date>" rather than "applies"."""
    stage = derive_stage(
        in_force_flag=True,
        date_in_force=dt.date(2024, 8, 1),
        date_application=dt.date(2027, 8, 2),
        date_end_validity=None,
        today=TODAY,
    )
    assert stage is LifecycleStage.ADOPTED


def test_past_application_is_in_force():
    stage = derive_stage(
        in_force_flag=True,
        date_in_force=dt.date(2016, 5, 24),
        date_application=dt.date(2018, 5, 25),
        date_end_validity=None,
        today=TODAY,
    )
    assert stage is LifecycleStage.IN_FORCE


def test_application_date_beats_entry_into_force_for_the_verdict():
    """Entry into force is in the past but applicability is not: the act does
    not yet bind, so reading only date_in_force would give the wrong verdict."""
    stage = derive_stage(
        in_force_flag=True,
        date_in_force=dt.date(2024, 8, 1),
        date_application=dt.date(2030, 1, 1),
        date_end_validity=None,
        today=TODAY,
    )
    assert stage is LifecycleStage.ADOPTED


def test_falls_back_to_entry_into_force_when_no_application_date():
    stage = derive_stage(
        in_force_flag=True,
        date_in_force=dt.date(2020, 1, 1),
        date_application=None,
        date_end_validity=None,
        today=TODAY,
    )
    assert stage is LifecycleStage.IN_FORCE


def test_no_dates_stays_unknown_rather_than_guessing():
    """An honest UNKNOWN is filterable; a plausible-but-wrong IN_FORCE is what
    puts a repealed provision in a compliance table."""
    stage = derive_stage(
        in_force_flag=None,
        date_in_force=None,
        date_application=None,
        date_end_validity=None,
        today=TODAY,
    )
    assert stage is LifecycleStage.UNKNOWN


def test_end_validity_exactly_today_is_still_in_force():
    stage = derive_stage(
        in_force_flag=True,
        date_in_force=dt.date(2020, 1, 1),
        date_application=dt.date(2020, 1, 1),
        date_end_validity=TODAY,
        today=TODAY,
    )
    assert stage is LifecycleStage.IN_FORCE


# --- folding the multi-row SPARQL result ---------------------------------


def test_the_9999_sentinel_is_not_stored_as_an_end_date():
    """Cellar uses 9999-12-31 for "no end of validity". Stored naively, every
    act in force looks like it expires in the year 9999 — a real-looking date to
    both the model and any date filter."""
    folded = _fold_rows([_row(endvalidity="9999-12-31", eif="2024-08-01")])
    assert folded["32024R1689"]["end"] is None


def test_a_real_end_date_is_kept():
    folded = _fold_rows([_row(endvalidity="2018-05-25", eif="2006-03-15")])
    assert folded["32024R1689"]["end"] == dt.date(2018, 5, 25)


def test_earliest_real_end_date_wins():
    folded = _fold_rows(
        [
            _row(endvalidity="2020-01-01", eif="2006-03-15"),
            _row(endvalidity="2018-05-25", eif="2006-03-15"),
            _row(endvalidity="9999-12-31", eif="2006-03-15"),
        ]
    )
    assert folded["32024R1689"]["end"] == dt.date(2018, 5, 25)


def test_multiple_entry_into_force_values_are_all_collected():
    """One act yields a row per date combination, so the same values repeat —
    the fold has to deduplicate rather than accumulate."""
    folded = _fold_rows(
        [
            _row(eif="2024-08-01", deadline="2027-08-02"),
            _row(eif="2025-02-02", deadline="2027-08-02"),
            _row(eif="2024-08-01", deadline="2028-08-02"),
        ]
    )
    rec = folded["32024R1689"]
    assert rec["eif"] == {dt.date(2024, 8, 1), dt.date(2025, 2, 2)}
    assert rec["deadlines"] == {dt.date(2027, 8, 2), dt.date(2028, 8, 2)}


def test_in_force_flag_is_parsed_from_the_string_values():
    assert _fold_rows([_row(inforce="1")])["32024R1689"]["flag"] is True
    assert _fold_rows([_row(inforce="0")])["32024R1689"]["flag"] is False
    assert _fold_rows([_row(inforce="")])["32024R1689"]["flag"] is None


def test_rows_for_several_acts_do_not_bleed_into_each_other():
    folded = _fold_rows(
        [
            _row(celex="A", eif="2024-08-01"),
            _row(celex="B", eif="2016-05-24"),
        ]
    )
    assert folded["A"]["eif"] == {dt.date(2024, 8, 1)}
    assert folded["B"]["eif"] == {dt.date(2016, 5, 24)}


# --- deriving the two dates + the stage list ------------------------------


def test_staged_act_separates_in_force_from_application():
    """The real AI Act shape: in force 2024-08-01, first tranche of obligations
    2025-02-02."""
    rec = {
        "eif": {dt.date(2024, 8, 1), dt.date(2025, 2, 2), dt.date(2026, 8, 2)},
        "deadlines": {dt.date(2027, 8, 2)},
        "end": None,
        "flag": True,
    }
    in_force, application, stages = _dates_from_record(rec)
    assert in_force == dt.date(2024, 8, 1)
    assert application == dt.date(2025, 2, 2)
    assert stages == ["2024-08-01", "2025-02-02", "2026-08-02", "2027-08-02"]


def test_unstaged_act_has_the_same_date_for_both():
    rec = {"eif": {dt.date(2020, 1, 1)}, "deadlines": set(), "end": None, "flag": True}
    in_force, application, stages = _dates_from_record(rec)
    assert in_force == application == dt.date(2020, 1, 1)
    assert stages == ["2020-01-01"]


def test_act_with_no_entry_into_force_yields_no_dates():
    """Soft law (recommendations, notices) has no entry into force. Inventing one
    would be worse than leaving the act undated."""
    rec = {"eif": set(), "deadlines": {dt.date(2027, 1, 1)}, "end": None, "flag": None}
    assert _dates_from_record(rec) == (None, None, [])


def test_deadlines_appear_in_stages_even_when_not_entry_into_force_dates():
    rec = {
        "eif": {dt.date(2023, 1, 16)},
        "deadlines": {dt.date(2025, 1, 17), dt.date(2026, 1, 17)},
        "end": None,
        "flag": True,
    }
    _, _, stages = _dates_from_record(rec)
    assert stages == ["2023-01-16", "2025-01-17", "2026-01-17"]
