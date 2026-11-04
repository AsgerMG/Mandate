"""Per-document enrichment: scoping, request shape, and write behaviour.

No API key, no network — a fake client stands in for Anthropic. The scoping
tests matter most: this is the only enrichment whose cost scales with corpus
size, so "which documents are candidates" is a cost decision as much as a
quality one.
"""

from __future__ import annotations

import datetime as dt

from sqlalchemy import select

from data.models import (
    Document,
    DocumentType,
    DocumentVersion,
    Enrichment,
    Jurisdiction,
    LifecycleStage,
    Passage,
    Source,
)
from etl.enrichment.summarize import (
    ENRICH_MODEL,
    MAX_CHARS,
    build_enrich_request,
    enrich_pending,
)


class _Block:
    def __init__(self, payload):
        self.type = "tool_use"
        self.input = payload


class _Resp:
    def __init__(self, payload):
        self.content = [_Block(payload)]


class FakeClient:
    """Records every request and returns a canned tool call."""

    def __init__(self, payload=None, fail=False):
        self.payload = payload or {
            "summary": "It binds providers of high-risk AI systems.",
            "plain_language": "Register the system before placing it on the market.",
            "what_changes": "New conformity assessment duty.",
        }
        self.fail = fail
        self.requests: list[dict] = []
        self.messages = self

    def create(self, **kwargs):
        self.requests.append(kwargs)
        if self.fail:
            raise RuntimeError("upstream exploded")
        return _Resp(self.payload)


def _doc(session, *, doc_type, external_id, passages=("operative text",), source_key=None):
    key = source_key or f"src-{external_id}"
    source = Source(key=key, name=key, jurisdiction=Jurisdiction.EU)
    session.add(source)
    session.flush()
    doc = Document(
        source_id=source.id,
        external_id=external_id,
        title=f"Act {external_id}",
        jurisdiction=Jurisdiction.EU,
        document_type=doc_type,
        lifecycle_stage=LifecycleStage.IN_FORCE,
        url=f"http://x/{external_id}",
    )
    session.add(doc)
    session.flush()
    ver = DocumentVersion(
        document_id=doc.id,
        content_hash=f"h-{external_id}",
        text="t",
        char_count=1,
        fetched_at=dt.datetime.now(dt.UTC),
    )
    session.add(ver)
    session.flush()
    for ordinal, text in enumerate(passages):
        session.add(
            Passage(
                version_id=ver.id,
                ordinal=ordinal,
                text=text,
                char_start=ordinal * 100,
                char_end=ordinal * 100 + len(text),
            )
        )
    session.commit()
    return doc


# --- scoping (i.e. cost control) ------------------------------------------


def test_press_and_newsletters_are_not_candidates(db_session):
    """The whole reason this is affordable: a newsletter already has a
    human-written headline, so paying to summarise 3,000 of them buys nothing a
    brief would cite."""
    _doc(db_session, doc_type=DocumentType.NEWSLETTER, external_id="N1")
    _doc(db_session, doc_type=DocumentType.PRESS, external_id="P1")
    _doc(db_session, doc_type=DocumentType.VERBATIM_DEBATE, external_id="V1")
    result = enrich_pending(db_session, None, dry_run=True)
    assert result["candidates"] == 0


def test_binding_law_and_case_law_are_candidates(db_session):
    _doc(db_session, doc_type=DocumentType.REGULATION, external_id="R1")
    _doc(db_session, doc_type=DocumentType.JUDGMENT, external_id="J1")
    _doc(db_session, doc_type=DocumentType.DIRECTIVE, external_id="D1")
    result = enrich_pending(db_session, None, dry_run=True)
    assert result["candidates"] == 3


def test_documents_without_passages_are_skipped(db_session):
    """Nothing to summarise from, so an API call would be paid for a prompt with
    no document in it."""
    _doc(db_session, doc_type=DocumentType.REGULATION, external_id="R1", passages=())
    assert enrich_pending(db_session, None, dry_run=True)["candidates"] == 0


def test_already_enriched_documents_are_not_re_paid_for(db_session):
    doc = _doc(db_session, doc_type=DocumentType.REGULATION, external_id="R1")
    db_session.add(Enrichment(document_id=doc.id, summary="done", model=ENRICH_MODEL))
    db_session.commit()
    assert enrich_pending(db_session, None, dry_run=True)["candidates"] == 0


def test_limit_bounds_a_run(db_session):
    for i in range(5):
        _doc(db_session, doc_type=DocumentType.REGULATION, external_id=f"R{i}")
    assert enrich_pending(db_session, None, limit=2, dry_run=True)["candidates"] == 2


def test_dry_run_makes_no_api_call(db_session):
    _doc(db_session, doc_type=DocumentType.REGULATION, external_id="R1")
    client = FakeClient()
    result = enrich_pending(db_session, client, dry_run=True)
    assert result["dry_run"] is True
    assert client.requests == []


# --- request shape --------------------------------------------------------


def test_request_forces_the_tool_call():
    req = build_enrich_request("AI Act", "regulation", "text")
    assert req["tool_choice"] == {"type": "tool", "name": "summarize_document"}
    assert req["model"] == ENRICH_MODEL


def test_request_truncates_very_long_documents():
    """One 500k-char consolidated regulation must not dominate a run's cost."""
    req = build_enrich_request("Long act", "regulation", "x" * (MAX_CHARS * 3))
    assert len(req["messages"][0]["content"]) < MAX_CHARS + 2000


def test_request_carries_the_document_type_so_a_judgment_is_not_read_as_an_act():
    req = build_enrich_request("Case C-1/24", "judgment", "The Court holds...")
    assert "judgment" in req["messages"][0]["content"]


# --- writes ---------------------------------------------------------------


def test_enrichment_row_is_written_with_the_model_and_passage_citations(db_session):
    doc = _doc(
        db_session,
        doc_type=DocumentType.REGULATION,
        external_id="R1",
        passages=("first passage", "second passage"),
    )
    result = enrich_pending(db_session, FakeClient())
    assert result["written"] == 1

    row = db_session.scalar(select(Enrichment).where(Enrichment.document_id == doc.id))
    assert row.summary == "It binds providers of high-risk AI systems."
    assert row.plain_language.startswith("Register the system")
    assert row.what_changes == "New conformity assessment duty."
    assert row.model == ENRICH_MODEL
    # Auditable back to specific stored text, like every other generated claim
    # in this project.
    assert len(row.citations["passage_ids"]) == 2


def test_a_failing_document_is_skipped_not_fatal(db_session):
    """A paid loop must not throw away completed work because document N was
    malformed."""
    _doc(db_session, doc_type=DocumentType.REGULATION, external_id="R1")
    result = enrich_pending(db_session, FakeClient(fail=True))
    assert result["errors"] == 1
    assert result["written"] == 0


def test_prose_response_without_a_tool_call_counts_as_an_error(db_session):
    _doc(db_session, doc_type=DocumentType.REGULATION, external_id="R1")

    class ProseClient:
        def __init__(self):
            self.messages = self

        def create(self, **kwargs):
            class R:
                content = [type("B", (), {"type": "text", "text": "Sure! Here is..."})()]

            return R()

    result = enrich_pending(db_session, ProseClient())
    assert result["errors"] == 1
    assert result["written"] == 0
