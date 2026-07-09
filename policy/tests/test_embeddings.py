"""Embedding + semantic-search logic against real pgvector.

Uses a deterministic FakeEmbedder (no model download) so the DB behaviour is
what's under test: NULL-passage backfill and cosine-ordered retrieval with
citation context.
"""

from __future__ import annotations

import datetime as dt

from data.config import get_settings
from data.models import (
    Document,
    DocumentType,
    DocumentVersion,
    Jurisdiction,
    LifecycleStage,
    Passage,
)
from etl.enrichment.embeddings import canon_passages, embed_pending, semantic_search

DIM = get_settings().embedding_dim


class FakeEmbedder:
    """Encodes 'ai'/'fish' keyword counts into the first dims; rest zero."""

    dim = DIM

    def embed(self, texts: list[str]) -> list[list[float]]:
        out = []
        for t in texts:
            v = [0.0] * DIM
            tl = t.lower()
            v[0] = float(tl.count("ai"))
            v[1] = float(tl.count("fish"))
            v[2] = 1.0
            out.append(v)
        return out


def _seed(session) -> None:
    doc = Document(
        source_id=_source(session),
        external_id="DOC-1",
        title="Test act",
        jurisdiction=Jurisdiction.EU,
        document_type=DocumentType.REGULATION,
        lifecycle_stage=LifecycleStage.IN_FORCE,
        url="http://example/doc1",
    )
    session.add(doc)
    session.flush()
    ver = DocumentVersion(
        document_id=doc.id,
        content_hash="h1",
        text="x",
        char_count=1,
        fetched_at=dt.datetime.now(dt.UTC),
    )
    session.add(ver)
    session.flush()
    session.add_all(
        [
            Passage(
                version_id=ver.id,
                ordinal=0,
                text="ai rules and ai duties",
                char_start=0,
                char_end=22,
            ),
            Passage(
                version_id=ver.id,
                ordinal=1,
                text="fish quota limits",
                char_start=23,
                char_end=40,
            ),
        ]
    )
    session.commit()


def _source(session) -> int:
    from data.models import Source

    s = Source(key="t", name="t", jurisdiction=Jurisdiction.EU)
    session.add(s)
    session.flush()
    return s.id


def test_embed_pending_fills_all_null_vectors(db_session):
    _seed(db_session)
    n = embed_pending(db_session, FakeEmbedder(), batch_size=10)
    assert n == 2
    # idempotent: nothing left to embed
    assert embed_pending(db_session, FakeEmbedder()) == 0


def test_semantic_search_orders_by_meaning_with_citations(db_session):
    _seed(db_session)
    embed_pending(db_session, FakeEmbedder())
    hits = semantic_search(db_session, FakeEmbedder(), "ai", k=2)
    assert len(hits) == 2
    # the 'ai' passage must rank first
    assert "ai" in hits[0]["text"]
    # citation context is present
    assert hits[0]["url"] == "http://example/doc1"
    assert hits[0]["char_start"] == 0 and hits[0]["char_end"] == 22


def _seed_canon_docs(session) -> None:
    """Two documents with distinct CELEX codes, each with an 'ai'-scoring and
    a 'fish'-scoring passage — enough to prove canon_passages picks the best
    passage per document rather than the single best passage overall."""
    source_id = _source(session)
    for celex, text_a, text_b in (
        ("CELEX-A", "ai obligations under act A", "fish quota under act A"),
        ("CELEX-B", "fish quota under act B", "ai obligations under act B"),
    ):
        doc = Document(
            source_id=source_id,
            external_id=celex,
            title=f"Act {celex}",
            jurisdiction=Jurisdiction.EU,
            document_type=DocumentType.REGULATION,
            lifecycle_stage=LifecycleStage.IN_FORCE,
            url=f"http://example/{celex}",
            celex=celex,
        )
        session.add(doc)
        session.flush()
        ver = DocumentVersion(
            document_id=doc.id,
            content_hash=celex,
            text="x",
            char_count=1,
            fetched_at=dt.datetime.now(dt.UTC),
        )
        session.add(ver)
        session.flush()
        session.add_all(
            [
                Passage(
                    version_id=ver.id, ordinal=0, text=text_a, char_start=0, char_end=len(text_a)
                ),
                Passage(
                    version_id=ver.id, ordinal=1, text=text_b, char_start=0, char_end=len(text_b)
                ),
            ]
        )
    session.commit()


def test_canon_passages_returns_best_match_per_instrument(db_session):
    _seed_canon_docs(db_session)
    embed_pending(db_session, FakeEmbedder())
    hits = canon_passages(db_session, FakeEmbedder(), "ai", ["CELEX-A", "CELEX-B"])
    assert {h["celex"] for h in hits} == {"CELEX-A", "CELEX-B"}
    # each returned passage is the 'ai'-scoring one for its own document, not
    # whichever single passage best matches 'ai' across the whole corpus
    for hit in hits:
        assert "ai" in hit["text"]


def test_canon_passages_silently_skips_uningested_instruments(db_session):
    _seed_canon_docs(db_session)
    embed_pending(db_session, FakeEmbedder())
    hits = canon_passages(db_session, FakeEmbedder(), "ai", ["CELEX-A", "CELEX-NOT-INGESTED"])
    assert {h["celex"] for h in hits} == {"CELEX-A"}


def test_canon_passages_empty_celex_list_returns_empty():
    assert canon_passages(None, FakeEmbedder(), "ai", []) == []


def _seed_superseded_version(session) -> None:
    """One document, two versions: an old one (is_current=False) whose
    passage still scores well on 'ai', and a current one whose passage
    does not. Reproduces a real bug found live 2026-07-09: re-ingesting a
    corrected EP verbatim transcript created a new DocumentVersion, but
    retrieval had no is_current filter at all, so the superseded version's
    stale text (with an "Unknown speaker" attribution bug already fixed in
    the current version) kept winning top-k forever."""
    doc = Document(
        source_id=_source(session),
        external_id="DOC-VERSIONED",
        title="Versioned doc",
        jurisdiction=Jurisdiction.EU,
        document_type=DocumentType.OTHER,
        lifecycle_stage=LifecycleStage.UNKNOWN,
        url="http://example/versioned",
    )
    session.add(doc)
    session.flush()
    old_ver = DocumentVersion(
        document_id=doc.id,
        content_hash="old",
        text="x",
        char_count=1,
        fetched_at=dt.datetime.now(dt.UTC),
        is_current=False,
    )
    new_ver = DocumentVersion(
        document_id=doc.id,
        content_hash="new",
        text="y",
        char_count=1,
        fetched_at=dt.datetime.now(dt.UTC),
        is_current=True,
    )
    session.add_all([old_ver, new_ver])
    session.flush()
    session.add_all(
        [
            Passage(
                version_id=old_ver.id, ordinal=0, text="ai ai ai stale", char_start=0, char_end=14
            ),
            Passage(
                version_id=new_ver.id,
                ordinal=0,
                text="fish quota fresh",
                char_start=0,
                char_end=16,
            ),
        ]
    )
    session.commit()


def test_embed_pending_skips_superseded_versions(db_session):
    _seed_superseded_version(db_session)
    n = embed_pending(db_session, FakeEmbedder())
    assert n == 1  # only the current version's passage


def test_semantic_search_never_returns_superseded_version_passages(db_session):
    _seed_superseded_version(db_session)
    embed_pending(db_session, FakeEmbedder())
    # Query for "ai" — the STALE passage is a near-perfect match and would
    # win easily if retrieval didn't filter by is_current; it must never
    # appear, and the only thing embedded/returned is the current passage.
    hits = semantic_search(db_session, FakeEmbedder(), "ai", k=5)
    assert len(hits) == 1
    assert hits[0]["text"] == "fish quota fresh"
