"""Pipeline persistence against a real Postgres+pgvector (via pgserver).

A network-free FakeAdapter feeds deterministic documents so we can assert the
behaviour that only shows up once rows actually hit the database: content-hash
versioning, unchanged-skip, supersede-on-change, and passage creation.
"""

from __future__ import annotations

import datetime as dt

from sqlalchemy import func, select

from data.models import (
    Document,
    DocumentType,
    DocumentVersion,
    Jurisdiction,
    LifecycleStage,
    Passage,
)
from etl.adapters.base import DocRef, ParsedDocument, RawDocument, SourceAdapter
from etl.pipeline import run_adapter


class FakeAdapter(SourceAdapter):
    key = "fake"
    name = "Fake source"
    jurisdiction = Jurisdiction.EU

    def __init__(self, docs, settings):
        self._docs = docs
        self.settings = settings
        self.http = None

    def discover(self, since, cursor):
        for d in self._docs:
            yield DocRef(external_id=d["external_id"], url="http://x", title=d["title"], hint=d)

    def fetch(self, ref):
        return RawDocument(
            ref=ref,
            content=ref.hint["text"].encode(),
            content_type="text/plain",
            fetched_at=dt.datetime.now(dt.UTC),
        )

    def parse(self, raw):
        d = raw.ref.hint
        return ParsedDocument(
            external_id=d["external_id"],
            title=d["title"],
            jurisdiction=Jurisdiction.EU,
            document_type=DocumentType.REGULATION,
            lifecycle_stage=LifecycleStage.IN_FORCE,
            text=d["text"],
            raw_format="text",
        )


class _Settings:
    backfill_days = 730


BODY = "Article 1.\n\n" + ("Some normative text. " * 120) + "\n\nFinal clause."


def _run(session, docs):
    return run_adapter(session, FakeAdapter(docs, _Settings()), limit=None)


def test_first_run_creates_doc_version_passages(db_session):
    stats = _run(db_session, [{"external_id": "DOC-1", "title": "First", "text": BODY}])
    db_session.commit()

    assert stats["new_docs"] == 1
    assert stats["new_versions"] == 1
    assert db_session.scalar(select(func.count(Document.id))) == 1
    assert db_session.scalar(select(func.count(DocumentVersion.id))) == 1
    # passages were chunked and persisted
    assert db_session.scalar(select(func.count(Passage.id))) >= 1


def test_unchanged_content_skips_new_version(db_session):
    docs = [{"external_id": "DOC-1", "title": "First", "text": BODY}]
    _run(db_session, docs)
    db_session.commit()
    stats = _run(db_session, docs)  # identical content again
    db_session.commit()

    assert stats["new_versions"] == 0
    assert stats["unchanged"] == 1
    assert db_session.scalar(select(func.count(DocumentVersion.id))) == 1


def test_changed_content_supersedes_previous_version(db_session):
    _run(db_session, [{"external_id": "DOC-1", "title": "First", "text": BODY}])
    db_session.commit()
    _run(db_session, [{"external_id": "DOC-1", "title": "First (rev)", "text": BODY + "\n\nNew."}])
    db_session.commit()

    versions = db_session.scalars(
        select(DocumentVersion).order_by(DocumentVersion.id)
    ).all()
    assert len(versions) == 2
    # exactly one current version, and it's the newest
    current = [v for v in versions if v.is_current]
    assert len(current) == 1
    assert current[0].id == versions[-1].id
    # the single document was reused, not duplicated
    assert db_session.scalar(select(func.count(Document.id))) == 1
