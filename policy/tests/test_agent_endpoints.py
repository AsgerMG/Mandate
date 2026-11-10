"""The two reads the advisor's agents need: one document's passages, and the
named actors on a file.

The property that matters for the agents: a passage comes back with its
grounding identity (sha256 + span) and that identity really is the passage, so
an agent's citation of it resolves through mandate.grounding.cite.
"""

from __future__ import annotations

import pytest
from sqlalchemy import text
from fastapi.testclient import TestClient

from data import grounding_bridge as gb
from data.models import (
    Actor,
    ActorRole,
    Document,
    DocumentActor,
    DocumentType,
    Jurisdiction,
    LifecycleStage,
    Source,
)
from etl.enrichment.embeddings import embed_pending
from mandate import grounding
from tests.grounded import seed_version
from tests.test_embeddings import FakeEmbedder


@pytest.fixture
def client(db_session, monkeypatch):
    from contextlib import contextmanager

    import etl.api as api

    @contextmanager
    def _scope():
        yield db_session

    monkeypatch.setattr(api, "session_scope", _scope)
    monkeypatch.setattr(api, "_embedder", lambda: FakeEmbedder())
    return TestClient(api.app)


def _doc(session, title="AI Regulation", ext="DOC-1") -> Document:
    src = session.query(Source).filter_by(key="t").one_or_none()
    if src is None:
        src = Source(key="t", name="t", jurisdiction=Jurisdiction.EU)
        session.add(src)
        session.flush()
    doc = Document(source_id=src.id, external_id=ext, title=title, jurisdiction=Jurisdiction.EU,
                   document_type=DocumentType.REGULATION, lifecycle_stage=LifecycleStage.IN_FORCE,
                   url=f"http://example/{ext}")
    session.add(doc)
    session.flush()
    return doc


def test_passages_of_one_document_carry_a_citable_grounding_identity(client, db_session):
    doc = _doc(db_session)
    seed_version(db_session, doc.id, passages=["ai rules and ai duties", "fish quota limits",
                                               "ai sandboxes for startups"])
    other = _doc(db_session, "Fisheries", "DOC-2")
    seed_version(db_session, other.id, passages=["ai ai ai fish"])
    db_session.commit()
    embed_pending(db_session, FakeEmbedder())

    body = client.get(f"/api/documents/{doc.id}/passages", params={"q": "ai", "k": 2}).json()
    assert body["document"]["title"] == "AI Regulation"
    hits = body["passages"]
    assert len(hits) == 2 and all(h["document_id"] == doc.id for h in hits)
    assert all("ai" in h["text"] for h in hits)
    con = gb.driver(db_session)
    for h in hits:
        assert h["grounding_sha256"] and h["passage_id"]
        v = grounding.version_by_sha(con, h["grounding_sha256"])
        c = grounding.cite(con, v.id, (h["char_start"], h["char_end"]), quote=h["text"])
        assert c.quote == h["text"]


def test_passages_without_a_question_come_in_reading_order(client, db_session):
    doc = _doc(db_session)
    seed_version(db_session, doc.id, passages=["first", "second", "third"])
    db_session.commit()
    body = client.get(f"/api/documents/{doc.id}/passages", params={"k": 2}).json()
    assert [p["text"] for p in body["passages"]] == ["first", "second"]
    assert client.get("/api/documents/999999/passages").status_code == 404


def test_actors_on_a_file_rapporteur_first_and_by_name(client, db_session):
    doc = _doc(db_session, "Payment Services Regulation", "PSR")
    seed_version(db_session, doc.id, passages=["debate"])
    a = Actor(name="Marek Belka", institution="European Parliament", political_group="S&D")
    b = Actor(name="Speaker One", institution="European Parliament")
    db_session.add_all([a, b])
    db_session.flush()
    db_session.add_all([
        DocumentActor(document_id=doc.id, actor_id=b.id, role=ActorRole.SPEAKER),
        DocumentActor(document_id=doc.id, actor_id=a.id, role=ActorRole.RAPPORTEUR),
    ])
    db_session.commit()

    by_doc = client.get("/api/actors", params={"document_id": doc.id}).json()["actors"]
    assert [x["name"] for x in by_doc] == ["Marek Belka", "Speaker One"]
    assert by_doc[0]["role"] == "rapporteur"
    by_topic = client.get("/api/actors", params={"q": "Payment Services"}).json()
    assert {x["name"] for x in by_topic["actors"]} == {"Marek Belka", "Speaker One"}
    by_name = client.get("/api/actors", params={"q": "Belka"}).json()["actors"]
    assert by_name[0]["name"] == "Marek Belka"
    assert client.get("/api/actors").status_code == 422


# ── /api/search: Regina's hot index and the usage log ─────────────────────

def test_search_leaves_old_news_out_by_default_and_logs_every_call(client, db_session):
    import datetime as dt

    law = _doc(db_session, "AI Act", "HOT-LAW")
    law.date_document = dt.date(2019, 1, 1)  # old law stays: only news ages out
    old_news = _doc(db_session, "AI news from last year", "HOT-OLD")
    old_news.document_type, old_news.date_document = DocumentType.PRESS, dt.date.today() - dt.timedelta(days=200)
    fresh_news = _doc(db_session, "AI news this week", "HOT-NEW")
    fresh_news.document_type, fresh_news.date_document = DocumentType.NEWSLETTER, dt.date.today() - dt.timedelta(days=3)
    for d in (law, old_news, fresh_news):
        seed_version(db_session, d.id, passages=[f"zebra ai passage of {d.external_id}"])
    db_session.commit()
    embed_pending(db_session, FakeEmbedder())

    def ids(**params):
        hits = client.get("/api/search", params={"q": "zebra ai", "k": 30, **params}).json()["results"]
        return {h["document_id"] for h in hits}

    hot = ids()
    assert law.id in hot and fresh_news.id in hot and old_news.id not in hot
    assert old_news.id in ids(hot="false")  # still in the store: append-only

    rows = db_session.execute(text(
        "SELECT tool, caller, brain, result_count, args_summary FROM mandate.tool_calls"
        " WHERE tool = 'search' ORDER BY id DESC LIMIT 2")).all()
    assert [r.caller for r in rows] == ["search", "search"]
    assert rows[0].brain == "regina" and rows[0].result_count >= 3 and "hot=False" in rows[0].args_summary
