"""The one answer this service gives that a company can act on.

Everything else here is a reading. A consultation with an open window is where a
startup with no lobbying budget gets to be heard — and it expires, which is why
the deadline and not the text is the payload.

These tests are about the PROPERTY, not a fixture I happened to pick: never
invent a deadline, never let a closed window read as open, and always say when we
last looked. Each of the three is a way the endpoint could be quietly wrong in a
direction that costs a founder a window.
"""

from __future__ import annotations

import datetime as dt

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from data.models import Document, DocumentType, Jurisdiction, LifecycleStage, Source


def _seed(session: Session, rows: list[tuple[str, int | None, LifecycleStage]]) -> None:
    """One document per (title, days_until_close, stage). `None` days = a
    consultation whose end date the portal never gave us, which is the case the
    endpoint must refuse to guess about."""
    src = Source(key="have_your_say", name="Have Your Say", jurisdiction=Jurisdiction.EU)
    session.add(src)
    session.flush()
    today = dt.date.today()
    for title, days, stage in rows:
        session.add(
            Document(
                source_id=src.id,
                external_id=title,
                title=title,
                jurisdiction=Jurisdiction.EU,
                document_type=DocumentType.CONSULTATION,
                lifecycle_stage=stage,
                date_end_validity=None if days is None else today + dt.timedelta(days=days),
            )
        )
    session.commit()


@pytest.fixture
def client(db_session, monkeypatch):
    """Point the API's session at the ephemeral test database."""
    from contextlib import contextmanager

    import etl.api as api

    @contextmanager
    def _scope():
        yield db_session

    monkeypatch.setattr(api, "session_scope", _scope)
    return TestClient(api.app)


def test_open_windows_come_back_soonest_first(client, db_session):
    _seed(db_session, [
        ("closes in 30", 30, LifecycleStage.CONSULTATION),
        ("closes in 3",   3, LifecycleStage.CONSULTATION),
        ("closes in 12", 12, LifecycleStage.CONSULTATION),
    ])
    body = client.get("/api/consultations").json()
    assert [c["title"] for c in body["consultations"]] == [
        "closes in 3", "closes in 12", "closes in 30",
    ]
    assert [c["closes_in_days"] for c in body["consultations"]] == [3, 12, 30]


def test_a_closed_window_is_not_offered(client, db_session):
    # The failure that costs a founder their time: being sent to something that
    # shut yesterday.
    _seed(db_session, [
        ("shut last week", -7, LifecycleStage.CONSULTATION),
        ("still open",      5, LifecycleStage.CONSULTATION),
    ])
    body = client.get("/api/consultations").json()
    assert [c["title"] for c in body["consultations"]] == ["still open"]


def test_a_missing_deadline_is_never_guessed(client, db_session):
    # The portal does not always publish a feedback end date. Treating "no date"
    # as "open" would manufacture a deadline, and a wrong deadline on something
    # a founder plans around is worse than omitting the row.
    _seed(db_session, [
        ("no end date recorded", None, LifecycleStage.CONSULTATION),
        ("open with a date",       9, LifecycleStage.CONSULTATION),
    ])
    body = client.get("/api/consultations").json()
    assert [c["title"] for c in body["consultations"]] == ["open with a date"]


def test_only_consultations_qualify(client, db_session):
    # An initiative that is merely PLANNED has no window to respond to yet.
    _seed(db_session, [
        ("planned, not open", 20, LifecycleStage.PLANNED),
        ("genuinely open",    20, LifecycleStage.CONSULTATION),
    ])
    body = client.get("/api/consultations").json()
    assert [c["title"] for c in body["consultations"]] == ["genuinely open"]


def test_closing_within_narrows_to_the_urgent(client, db_session):
    _seed(db_session, [
        ("next week", 6,  LifecycleStage.CONSULTATION),
        ("next month", 29, LifecycleStage.CONSULTATION),
    ])
    body = client.get("/api/consultations?closing_within_days=7").json()
    assert [c["title"] for c in body["consultations"]] == ["next week"]


def test_it_says_when_we_last_looked(client, db_session):
    # Windows are checked weekly. Without `as_of` a reader cannot judge how much
    # to trust an empty list, and an empty list is the dangerous answer.
    _seed(db_session, [("open", 10, LifecycleStage.CONSULTATION)])
    body = client.get("/api/consultations").json()
    assert body["as_of"], "the endpoint must say when the window state was last refreshed"
    assert "once a week" in body["caveat"]
