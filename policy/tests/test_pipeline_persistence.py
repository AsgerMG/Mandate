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
    Source,
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


# --- cursor bookkeeping ---------------------------------------------------
# Advancing the cursor is an irreversible claim that everything up to now has
# been ingested: every later run asks only for what is newer, so history a run
# never saw becomes permanently unreachable. See pipeline._since's docstring —
# these are the code-level guards it described but never implemented.


class _FailingAdapter(FakeAdapter):
    """Discovers documents, fails on every fetch."""

    def fetch(self, ref):
        raise RuntimeError("upstream is down")


def test_truncated_run_does_not_advance_the_cursor(db_session):
    """`regina refresh --limit N` is what README.md tells every new user to run
    first. It must not stamp the cursor, or the backfill_days window is
    stranded for good — confirmed live 2026-07-27 with `regina run
    eurlex_case_law --limit 200`, after which the next unlimited run
    discovered 0."""
    docs = [{"external_id": f"D{i}", "title": f"T{i}", "text": BODY} for i in range(5)]
    stats = run_adapter(db_session, FakeAdapter(docs, _Settings()), limit=2)
    db_session.commit()

    assert stats["discovered"] == 2
    assert stats["cursor_advanced"] is False
    source = db_session.scalars(select(Source).where(Source.key == "fake")).one()
    assert source.last_run_at is None
    assert source.cursor is None


def test_untruncated_run_advances_the_cursor(db_session):
    docs = [{"external_id": "D1", "title": "T1", "text": BODY}]
    stats = run_adapter(db_session, FakeAdapter(docs, _Settings()), limit=None)
    db_session.commit()

    assert stats["cursor_advanced"] is True
    source = db_session.scalars(select(Source).where(Source.key == "fake")).one()
    assert source.last_run_at is not None


def test_a_limit_the_run_never_reaches_still_advances_the_cursor(db_session):
    """`--limit 100` over a source with 3 documents saw everything there was —
    it is not truncated, so it may legitimately claim the window."""
    docs = [{"external_id": f"D{i}", "title": f"T{i}", "text": BODY} for i in range(3)]
    stats = run_adapter(db_session, FakeAdapter(docs, _Settings()), limit=100)
    db_session.commit()

    assert stats["cursor_advanced"] is True
    source = db_session.scalars(select(Source).where(Source.key == "fake")).one()
    assert source.last_run_at is not None


def test_wholesale_failure_does_not_advance_the_cursor(db_session):
    """A run where every document errored ingested nothing; the window it
    covered is still outstanding and must be re-discovered next time."""
    docs = [{"external_id": f"D{i}", "title": f"T{i}", "text": BODY} for i in range(3)]
    stats = run_adapter(db_session, _FailingAdapter(docs, _Settings()), limit=None)
    db_session.commit()

    assert stats["errors"] == 3
    assert stats["cursor_advanced"] is False
    source = db_session.scalars(select(Source).where(Source.key == "fake")).one()
    assert source.last_run_at is None


def test_partial_failure_still_advances_the_cursor(db_session):
    """One bad document must not strand the run — only a total wipeout does."""

    class _MostlyOk(FakeAdapter):
        def fetch(self, ref):
            if ref.external_id == "D0":
                raise RuntimeError("just this one")
            return super().fetch(ref)

    docs = [{"external_id": f"D{i}", "title": f"T{i}", "text": BODY} for i in range(3)]
    stats = run_adapter(db_session, _MostlyOk(docs, _Settings()), limit=None)
    db_session.commit()

    assert stats["errors"] == 1
    assert stats["cursor_advanced"] is True


# --- --full ---------------------------------------------------------------


class _CursorAdapter(FakeAdapter):
    """Mirrors oeil / *_verbatim / the newsletter families: incrementality
    lives in the CURSOR, not in `since`. For all of them `--full` was a silent
    no-op, because it only ever overrode `since`."""

    def __init__(self, docs, settings):
        super().__init__(docs, settings)
        self.seen_cursor = "unset"

    def discover(self, since, cursor):
        self.seen_cursor = cursor
        yield from super().discover(since, cursor)

    def next_cursor(self, prev, seen):
        return {"high_water": "2026-08-01"}


def test_full_resets_a_cursor_carried_incrementality(db_session):
    docs = [{"external_id": "D1", "title": "T1", "text": BODY}]
    adapter = _CursorAdapter(docs, _Settings())
    run_adapter(db_session, adapter, limit=None)
    db_session.commit()

    source = db_session.scalars(select(Source).where(Source.key == "fake")).one()
    assert source.cursor == {"high_water": "2026-08-01"}

    # A normal run still sees the stored cursor…
    adapter2 = _CursorAdapter(docs, _Settings())
    run_adapter(db_session, adapter2, limit=None, full=False)
    assert adapter2.seen_cursor == {"high_water": "2026-08-01"}

    # …and `--full` must hand discovery a cleared one, or the documented
    # recovery (`regina run <key> --full`) does nothing at all.
    adapter3 = _CursorAdapter(docs, _Settings())
    run_adapter(db_session, adapter3, limit=None, full=True)
    assert adapter3.seen_cursor is None


# --- ingestion vs enrichment ownership ------------------------------------
# Re-ingestion refreshed mutable metadata unconditionally and BEFORE the
# content-hash check, so it fired even for unchanged documents. No adapter ever
# sets date_in_force, so every re-sighting wrote NULL over what enrich_lifecycle
# had computed, reset lifecycle_stage to eurlex.py's own self-described
# "fallback… which enrich_lifecycle() overrides", and replaced `extra` wholesale
# — destroying extra["application_stages"], the AI Act's staged compliance
# dates. 38 production documents carry that exact signature.


def _enriched_doc(session):
    """A document as enrich_lifecycle leaves it."""
    docs = [{"external_id": "ACT-1", "title": "AI Act", "text": BODY}]
    run_adapter(session, FakeAdapter(docs, _Settings()), limit=None)
    session.commit()
    doc = session.scalars(select(Document)).one()
    doc.date_in_force = dt.date(2024, 8, 1)
    doc.date_application = dt.date(2025, 8, 2)
    doc.date_end_validity = dt.date(2030, 1, 1)
    doc.lifecycle_stage = LifecycleStage.ADOPTED
    doc.extra = {"application_stages": ["2024-08-01", "2025-02-02", "2025-08-02"]}
    session.commit()
    return doc


def test_reingestion_does_not_null_enrichment_dates(db_session):
    doc = _enriched_doc(db_session)
    # Same content, same adapter, second sighting — the AI Act's own dates must
    # survive an adapter that simply does not carry them.
    _run(db_session, [{"external_id": "ACT-1", "title": "AI Act", "text": BODY}])
    db_session.commit()
    db_session.refresh(doc)

    assert doc.date_in_force == dt.date(2024, 8, 1)
    assert doc.date_application == dt.date(2025, 8, 2)
    assert doc.date_end_validity == dt.date(2030, 1, 1)


def test_reingestion_does_not_reset_an_enriched_lifecycle_stage(db_session):
    doc = _enriched_doc(db_session)
    # FakeAdapter reports IN_FORCE — the coarse guess. enrich_lifecycle
    # decided ADOPTED from Cellar's own application dates and outranks it.
    _run(db_session, [{"external_id": "ACT-1", "title": "AI Act", "text": BODY}])
    db_session.commit()
    db_session.refresh(doc)

    assert doc.lifecycle_stage is LifecycleStage.ADOPTED


def test_reingestion_preserves_application_stages_in_extra(db_session):
    doc = _enriched_doc(db_session)
    _run(db_session, [{"external_id": "ACT-1", "title": "AI Act", "text": BODY}])
    db_session.commit()
    db_session.refresh(doc)

    assert doc.extra["application_stages"] == ["2024-08-01", "2025-02-02", "2025-08-02"]


def test_reingestion_merges_adapter_keys_into_extra(db_session):
    """Adapter-owned keys still refresh — the rule is 'absence never overwrites
    presence', not 'ingestion may never write'."""
    doc = _enriched_doc(db_session)

    class _ExtraAdapter(FakeAdapter):
        def parse(self, raw):
            parsed = super().parse(raw)
            parsed.extra = {"celex": "32024R1689"}
            return parsed

    run_adapter(
        db_session,
        _ExtraAdapter([{"external_id": "ACT-1", "title": "AI Act", "text": BODY}], _Settings()),
        limit=None,
    )
    db_session.commit()
    db_session.refresh(doc)

    assert doc.extra["celex"] == "32024R1689"
    assert doc.extra["application_stages"] == ["2024-08-01", "2025-02-02", "2025-08-02"]


def test_ingestion_still_sets_lifecycle_stage_before_enrichment_has_spoken(db_session):
    """An adapter that genuinely tracks procedure phase (oeil) must keep
    updating the stage — the rule protects derived values, it does not freeze
    the column."""
    _run(db_session, [{"external_id": "P-1", "title": "Procedure", "text": BODY}])
    db_session.commit()
    doc = db_session.scalars(select(Document)).one()
    assert doc.lifecycle_stage is LifecycleStage.IN_FORCE

    class _StageAdapter(FakeAdapter):
        def parse(self, raw):
            parsed = super().parse(raw)
            parsed.lifecycle_stage = LifecycleStage.REPEALED
            return parsed

    run_adapter(
        db_session,
        _StageAdapter([{"external_id": "P-1", "title": "Procedure", "text": BODY}], _Settings()),
        limit=None,
    )
    db_session.commit()
    db_session.refresh(doc)
    assert doc.lifecycle_stage is LifecycleStage.REPEALED


def test_ingestion_never_downgrades_a_stage_to_unknown(db_session):
    _run(db_session, [{"external_id": "P-2", "title": "Procedure", "text": BODY}])
    db_session.commit()
    doc = db_session.scalars(select(Document)).one()

    class _UnknownStageAdapter(FakeAdapter):
        def parse(self, raw):
            parsed = super().parse(raw)
            parsed.lifecycle_stage = LifecycleStage.UNKNOWN
            return parsed

    run_adapter(
        db_session,
        _UnknownStageAdapter(
            [{"external_id": "P-2", "title": "Procedure", "text": BODY}], _Settings()
        ),
        limit=None,
    )
    db_session.commit()
    db_session.refresh(doc)
    assert doc.lifecycle_stage is LifecycleStage.IN_FORCE
