"""Sector/policy-area classification — request building, response parsing,
and the classify_pending() bulk pass against real Postgres."""

from __future__ import annotations

import datetime as dt

from data.models import (
    Document,
    DocumentType,
    DocumentVersion,
    Jurisdiction,
    LifecycleStage,
    Source,
)
from data.seeds import seed_vocabularies
from etl.enrichment.classification import (
    CLASSIFY_MODEL,
    build_classify_request,
    classify_pending,
    parse_classify_response,
)


def test_build_classify_request_forces_the_classify_tool():
    request = build_classify_request("GDPR", "General Data Protection Regulation text...")
    assert request["model"] == CLASSIFY_MODEL
    assert request["tool_choice"] == {"type": "tool", "name": "classify_document"}
    assert request["tools"][0]["name"] == "classify_document"
    assert "GDPR" in request["messages"][0]["content"]


def test_build_classify_request_truncates_long_text():
    request = build_classify_request("Title", "x" * 5000)
    assert len(request["messages"][0]["content"]) < 2100


def _tool_use_block(policy_areas, sectors):
    return {
        "type": "tool_use",
        "name": "classify_document",
        "input": {"policy_areas": policy_areas, "sectors": sectors},
    }


def test_parse_classify_response_extracts_tags():
    blocks = [_tool_use_block(["ai", "data-protection"], ["healthtech"])]
    tags = parse_classify_response(blocks)
    assert tags == {"policy_areas": ["ai", "data-protection"], "sectors": ["healthtech"]}


def test_parse_classify_response_drops_unknown_slugs():
    # Defensive: the tool schema's enum should already prevent this, but a
    # bad slug must never make it into an FK-resolving assignment downstream.
    blocks = [_tool_use_block(["ai", "not-a-real-slug"], ["also-fake"])]
    tags = parse_classify_response(blocks)
    assert tags == {"policy_areas": ["ai"], "sectors": []}


def test_parse_classify_response_no_tool_call_returns_empty():
    assert parse_classify_response([{"type": "text", "text": "no tool call here"}]) == {
        "policy_areas": [],
        "sectors": [],
    }


class _FakeMessages:
    """Returns each queued response in order, one per create() call — mirrors
    _SequenceFakeMessages in test_briefing.py."""

    def __init__(self, responses):
        self._responses = list(responses)
        self.calls: list[dict] = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return self._responses[len(self.calls) - 1]


class _FakeClient:
    def __init__(self, responses):
        self.messages = _FakeMessages(responses)


class _Resp:
    def __init__(self, content):
        self.content = content


def _seed_doc(session, source_id, external_id, title, text) -> Document:
    doc = Document(
        source_id=source_id,
        external_id=external_id,
        title=title,
        jurisdiction=Jurisdiction.EU,
        document_type=DocumentType.REGULATION,
        lifecycle_stage=LifecycleStage.IN_FORCE,
        url=f"http://example/{external_id}",
    )
    session.add(doc)
    session.flush()
    session.add(
        DocumentVersion(
            document_id=doc.id,
            content_hash=f"h-{external_id}",
            text=text,
            char_count=len(text),
            fetched_at=dt.datetime.now(dt.UTC),
            is_current=True,
        )
    )
    session.commit()
    return doc


def test_classify_pending_tags_documents_and_is_idempotent(db_session):
    seed_vocabularies(db_session)
    source = Source(key="t", name="t", jurisdiction=Jurisdiction.EU)
    db_session.add(source)
    db_session.flush()

    gdpr = _seed_doc(db_session, source.id, "GDPR", "GDPR", "General Data Protection Regulation.")
    machinery = _seed_doc(
        db_session, source.id, "MACHINERY", "Machinery Regulation", "Machinery safety requirements."
    )

    client = _FakeClient(
        [
            _Resp([_tool_use_block(["data-protection"], [])]),
            _Resp([_tool_use_block(["ai"], ["manufacturing"])]),
        ]
    )
    n = classify_pending(db_session, client, batch_size=10)
    assert n == 2
    assert client.messages.calls[0]["model"] == CLASSIFY_MODEL

    db_session.refresh(gdpr)
    db_session.refresh(machinery)
    assert [pa.slug for pa in gdpr.policy_areas] == ["data-protection"]
    assert gdpr.sectors == []  # zero sectors is a legitimate, stable outcome
    assert [pa.slug for pa in machinery.policy_areas] == ["ai"]
    assert [s.slug for s in machinery.sectors] == ["manufacturing"]

    # Idempotent: both documents now have a non-empty policy_areas, so the
    # ~Document.policy_areas.any() filter must exclude them on a second pass
    # — including GDPR, whose sectors is empty but whose policy_areas isn't.
    assert classify_pending(db_session, client, batch_size=10) == 0
    assert len(client.messages.calls) == 2  # no new API calls made


def test_classify_pending_only_reads_current_version_text(db_session):
    # A superseded version's stale text must never reach the classifier —
    # mirrors embed_pending's equivalent guarantee for passages.
    seed_vocabularies(db_session)
    source = Source(key="t2", name="t2", jurisdiction=Jurisdiction.EU)
    db_session.add(source)
    db_session.flush()

    doc = Document(
        source_id=source.id,
        external_id="DOC-1",
        title="Doc",
        jurisdiction=Jurisdiction.EU,
        document_type=DocumentType.REGULATION,
        lifecycle_stage=LifecycleStage.IN_FORCE,
        url="http://example/doc1",
    )
    db_session.add(doc)
    db_session.flush()
    db_session.add_all(
        [
            DocumentVersion(
                document_id=doc.id,
                content_hash="old",
                text="STALE TEXT",
                char_count=10,
                fetched_at=dt.datetime.now(dt.UTC),
                is_current=False,
            ),
            DocumentVersion(
                document_id=doc.id,
                content_hash="new",
                text="CURRENT TEXT",
                char_count=12,
                fetched_at=dt.datetime.now(dt.UTC),
                is_current=True,
            ),
        ]
    )
    db_session.commit()

    client = _FakeClient([_Resp([_tool_use_block(["ai"], [])])])
    classify_pending(db_session, client, batch_size=10)
    assert "CURRENT TEXT" in client.messages.calls[0]["messages"][0]["content"]
    assert "STALE TEXT" not in client.messages.calls[0]["messages"][0]["content"]


# --- the infinite loop ----------------------------------------------------
# On 2026-08-02 this pass made ~3,197 API calls against ONE document (id=4437)
# over 45 minutes, until Anthropic returned 403 — killing the weekly refresh.
# The model returned 'energy', an out-of-vocabulary slug;
# parse_classify_response dropped it; the document ended with [] policy_areas
# and re-matched `~Document.policy_areas.any()` on the very next iteration,
# forever. Two independent guards now exist, and both are asserted here.


def test_classify_tool_is_strict_so_the_enum_is_actually_enforced():
    """Without `strict`, the input_schema's enum and minItems are advisory —
    the model may return any string and the whole loop above becomes
    reachable. `strict` additionally requires additionalProperties: false."""
    from etl.enrichment.classification import CLASSIFY_TOOL

    assert CLASSIFY_TOOL["strict"] is True
    assert CLASSIFY_TOOL["input_schema"]["additionalProperties"] is False


# --- the maxItems regression -----------------------------------------------
# Shipped `strict: True` alongside `maxItems: 3` on both arrays on 2026-08-07.
# That combination 400s on every real call ("tools.0.custom: For 'array' type,
# property 'maxItems' is not supported") — invisible to every test above
# because none of them make a real API call. Confirmed live against
# production's classify model 2026-08-10: `strict` + `minItems` alone is
# accepted; `maxItems` under `strict` is not. The three-day gap this caused
# (every classify_pending call failing, zero documents tagged) is why this
# gets its own tests rather than trusting the fix by inspection.


def test_classify_tool_schema_has_no_maxitems_because_strict_rejects_it():
    """The one keyword that must NOT be in this schema. Regression test for
    the exact production incident above — this assertion is the guard against
    someone re-adding `maxItems` for symmetry with `minItems` and 400ing the
    whole pass again."""
    from etl.enrichment.classification import CLASSIFY_TOOL

    for field in ("policy_areas", "sectors"):
        assert "maxItems" not in CLASSIFY_TOOL["input_schema"]["properties"][field]


def test_parse_classify_response_caps_at_three_since_the_schema_no_longer_can():
    """With `maxItems` gone, cardinality is prompt guidance only — the model
    is free to return more than 3 valid, in-enum slugs. The parser must cap
    it, or an over-generous model response flows straight into the DB."""
    too_many_policy = ["ai", "data-protection", "platforms", "competition", "consumer"]
    too_many_sectors = ["fintech", "healthtech", "adtech", "manufacturing"]
    block = _tool_use_block(too_many_policy, too_many_sectors)

    parsed = parse_classify_response([block])

    assert len(parsed["policy_areas"]) == 3
    assert len(parsed["sectors"]) == 3
    assert parsed["policy_areas"] == too_many_policy[:3]
    assert parsed["sectors"] == too_many_sectors[:3]


def test_classify_pending_terminates_when_the_model_returns_a_bad_slug(db_session):
    """The reproduction, as a test: a document the model cannot classify is
    attempted ONCE and then left alone — not retried until the API cuts us
    off. Without the made-progress guard this call never returns."""
    seed_vocabularies(db_session)
    source = Source(key="loop", name="loop", jurisdiction=Jurisdiction.EU)
    db_session.add(source)
    db_session.flush()
    doc = _seed_doc(db_session, source.id, "DOC-4437", "Energy grid act", "Grid text.")

    # 'energy' is not in POLICY_AREAS — exactly what production returned.
    client = _FakeClient([_Resp([_tool_use_block(["energy"], [])])] * 50)
    n = classify_pending(db_session, client, batch_size=10)

    assert len(client.messages.calls) == 1, "the document was retried"
    assert n == 1
    db_session.refresh(doc)
    assert doc.policy_areas == []  # still untagged, honestly so


def test_classify_pending_makes_progress_past_an_unclassifiable_document(db_session):
    """One bad document must not stop the others being classified, and must
    not be re-selected once skipped."""
    seed_vocabularies(db_session)
    source = Source(key="loop2", name="loop2", jurisdiction=Jurisdiction.EU)
    db_session.add(source)
    db_session.flush()
    bad = _seed_doc(db_session, source.id, "BAD", "Bad", "text")
    good = _seed_doc(db_session, source.id, "GOOD", "Good", "text")

    client = _FakeClient(
        [
            _Resp([_tool_use_block(["energy"], [])]),  # dropped -> untagged
            _Resp([_tool_use_block(["ai"], [])]),
        ]
        + [_Resp([_tool_use_block(["ai"], [])])] * 20
    )
    # batch_size=1 forces re-selection between every document, which is where
    # the old loop span forever.
    classify_pending(db_session, client, batch_size=1)

    assert len(client.messages.calls) == 2
    db_session.refresh(bad)
    db_session.refresh(good)
    assert bad.policy_areas == []
    assert [pa.slug for pa in good.policy_areas] == ["ai"]


def test_classify_pending_degrades_on_an_unseeded_vocabulary(db_session):
    """`policy_area_by_slug[s]` raised KeyError mid-loop against an unseeded
    vocabulary table, discarding the whole batch's work. It must degrade
    instead."""
    # Deliberately NOT calling seed_vocabularies.
    source = Source(key="unseeded", name="unseeded", jurisdiction=Jurisdiction.EU)
    db_session.add(source)
    db_session.flush()
    _seed_doc(db_session, source.id, "DOC-1", "Doc", "text")

    client = _FakeClient([_Resp([_tool_use_block(["ai"], ["manufacturing"])])] * 10)
    classify_pending(db_session, client, batch_size=10)  # must not raise
    assert len(client.messages.calls) == 1
