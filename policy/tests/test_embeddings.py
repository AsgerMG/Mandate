"""Embedding + semantic-search logic against real pgvector.

Uses a deterministic FakeEmbedder (no model download) so the DB behaviour is
what's under test: NULL-passage backfill and cosine-ordered retrieval with
citation context.
"""

from __future__ import annotations

import datetime as dt

import httpx

from data.config import Settings, get_settings
from data.models import (
    Document,
    DocumentType,
    DocumentVersion,
    Jurisdiction,
    LifecycleStage,
    Passage,
)
from etl.enrichment.embeddings import (
    VoyageEmbedder,
    _cosine_sim,
    _mmr_select,
    canon_passages,
    embed_pending,
    get_embedder,
    press_passages,
    semantic_search,
)

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


# --- press_passages: recency + source-allowlist filtering --------------------


def _source_with_key(session, key: str) -> int:
    from data.models import Source

    s = Source(key=key, name=key, jurisdiction=Jurisdiction.EU)
    session.add(s)
    session.flush()
    return s.id


def _press_doc(session, *, external_id, source_id, date_document, text) -> None:
    doc = Document(
        source_id=source_id,
        external_id=external_id,
        title=external_id,
        jurisdiction=Jurisdiction.EU,
        document_type=DocumentType.OTHER,
        lifecycle_stage=LifecycleStage.UNKNOWN,
        date_document=date_document,
        url=f"http://example/{external_id}",
    )
    session.add(doc)
    session.flush()
    ver = DocumentVersion(
        document_id=doc.id,
        content_hash=external_id,
        text="x",
        char_count=1,
        fetched_at=dt.datetime.now(dt.UTC),
    )
    session.add(ver)
    session.flush()
    session.add(Passage(version_id=ver.id, ordinal=0, text=text, char_start=0, char_end=len(text)))
    session.commit()


def _seed_press_docs(session) -> None:
    today = dt.date.today()
    good_source_id = _source_with_key(session, "good_source")
    other_source_id = _source_with_key(session, "other_source")
    # In the recency window, in the source allowlist — the one that should
    # survive every filter below.
    _press_doc(
        session,
        external_id="GOOD",
        source_id=good_source_id,
        date_document=today - dt.timedelta(days=10),
        text="ai ai ai",
    )
    # Same allowlisted source, but stale — scores BETTER on raw similarity
    # (more "ai" occurrences) and must still be excluded on recency alone.
    _press_doc(
        session,
        external_id="STALE",
        source_id=good_source_id,
        date_document=today - dt.timedelta(days=200),
        text="ai ai ai ai",
    )
    # In the window, scores best of all, but from a source NOT in the
    # allowlist — must be excluded regardless of recency or score.
    _press_doc(
        session,
        external_id="WRONG_SOURCE",
        source_id=other_source_id,
        date_document=today - dt.timedelta(days=5),
        text="ai ai ai ai ai",
    )
    # Highest score of all, allowlisted source, but no date_document at
    # all — can't verify recency, so it must be excluded too.
    _press_doc(
        session,
        external_id="NO_DATE",
        source_id=good_source_id,
        date_document=None,
        text="ai ai ai ai ai ai",
    )


def test_press_passages_includes_recent_allowlisted_doc(db_session):
    _seed_press_docs(db_session)
    embed_pending(db_session, FakeEmbedder())
    hits = press_passages(db_session, FakeEmbedder(), "ai", {"good_source"}, days=90, k=5)
    titles = {h["title"] for h in hits}
    assert "GOOD" in titles


def test_press_passages_excludes_stale_doc_despite_higher_score(db_session):
    _seed_press_docs(db_session)
    embed_pending(db_session, FakeEmbedder())
    hits = press_passages(db_session, FakeEmbedder(), "ai", {"good_source"}, days=90, k=5)
    titles = {h["title"] for h in hits}
    assert "STALE" not in titles


def test_press_passages_excludes_source_not_in_allowlist(db_session):
    _seed_press_docs(db_session)
    embed_pending(db_session, FakeEmbedder())
    hits = press_passages(db_session, FakeEmbedder(), "ai", {"good_source"}, days=90, k=5)
    titles = {h["title"] for h in hits}
    assert "WRONG_SOURCE" not in titles


def test_press_passages_excludes_missing_date_document(db_session):
    _seed_press_docs(db_session)
    embed_pending(db_session, FakeEmbedder())
    hits = press_passages(db_session, FakeEmbedder(), "ai", {"good_source"}, days=90, k=5)
    titles = {h["title"] for h in hits}
    assert "NO_DATE" not in titles


def test_press_passages_only_the_good_doc_survives_all_filters(db_session):
    _seed_press_docs(db_session)
    embed_pending(db_session, FakeEmbedder())
    hits = press_passages(db_session, FakeEmbedder(), "ai", {"good_source"}, days=90, k=5)
    assert [h["title"] for h in hits] == ["GOOD"]


# --- min_score floor: semantic_search and press_passages ---------------------


def _seed_min_score_docs(session) -> None:
    """One clearly on-topic doc ('ai ai ai', cosine ~0.89 against query 'ai'
    under FakeEmbedder's scheme) and one clearly off-topic doc ('fish fish
    fish', cosine ~0.22) — far enough apart that a min_score of 0.5 cleanly
    separates them regardless of exact float precision."""
    source_id = _source_with_key(session, "min_score_source")
    _press_doc(
        session,
        external_id="ON_TOPIC",
        source_id=source_id,
        date_document=dt.date.today() - dt.timedelta(days=1),
        text="ai ai ai",
    )
    _press_doc(
        session,
        external_id="OFF_TOPIC",
        source_id=source_id,
        date_document=dt.date.today() - dt.timedelta(days=1),
        text="fish fish fish",
    )


def test_semantic_search_min_score_none_returns_everything(db_session):
    _seed_min_score_docs(db_session)
    embed_pending(db_session, FakeEmbedder())
    hits = semantic_search(db_session, FakeEmbedder(), "ai", k=5)
    assert {h["title"] for h in hits} == {"ON_TOPIC", "OFF_TOPIC"}


def test_semantic_search_min_score_drops_weak_matches(db_session):
    _seed_min_score_docs(db_session)
    embed_pending(db_session, FakeEmbedder())
    hits = semantic_search(db_session, FakeEmbedder(), "ai", k=5, min_score=0.5)
    titles = {h["title"] for h in hits}
    assert "ON_TOPIC" in titles
    assert "OFF_TOPIC" not in titles


def test_press_passages_min_score_drops_weak_matches(db_session):
    _seed_min_score_docs(db_session)
    embed_pending(db_session, FakeEmbedder())
    no_floor = press_passages(
        db_session, FakeEmbedder(), "ai", {"min_score_source"}, days=90, k=5
    )
    assert {h["title"] for h in no_floor} == {"ON_TOPIC", "OFF_TOPIC"}

    floored = press_passages(
        db_session, FakeEmbedder(), "ai", {"min_score_source"}, days=90, k=5, min_score=0.5
    )
    titles = {h["title"] for h in floored}
    assert "ON_TOPIC" in titles
    assert "OFF_TOPIC" not in titles


# --- VoyageEmbedder -----------------------------------------------------------

class _FakeVoyageResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            request = httpx.Request("POST", "http://x")
            response = httpx.Response(self.status_code, request=request)
            raise httpx.HTTPStatusError("error", request=request, response=response)

    def json(self):
        return self._payload


class _FakeVoyageClient:
    def __init__(self, responses):
        self._responses = list(responses)
        self.calls: list[dict] = []

    def post(self, url, *, headers, json):
        self.calls.append({"url": url, "headers": headers, "json": json})
        resp = self._responses[len(self.calls) - 1]
        if isinstance(resp, Exception):
            raise resp
        return resp


def test_voyage_embedder_sends_model_input_and_auth_header():
    client = _FakeVoyageClient([_FakeVoyageResponse({"data": [{"embedding": [1.0, 2.0]}]})])
    embedder = VoyageEmbedder("voyage-4-large", 2, "test-key", client=client)
    vectors = embedder.embed(["hello"])
    assert vectors == [[1.0, 2.0]]
    call = client.calls[0]
    assert call["headers"]["Authorization"] == "Bearer test-key"
    assert call["json"] == {"input": ["hello"], "model": "voyage-4-large", "output_dimension": 2}


def test_voyage_embedder_splits_oversized_batch_by_token_budget():
    # Regression: a batch of 128 row-count-sized passages blew past Voyage's
    # 120K-tokens-per-request cap in production because a handful of legacy
    # passages (chunked before chunking.py's MAX_CHARS ceiling existed) run
    # to hundreds of thousands of characters. Two ~350K-char texts (~87.5K
    # tokens each) plus a small one must split into two requests, not one —
    # together (175K+) they'd blow past the 100K-token budget in one request.
    big_a = "x" * 350_000
    big_b = "y" * 350_000
    small = "z" * 100
    client = _FakeVoyageClient(
        [
            _FakeVoyageResponse({"data": [{"embedding": [1.0]}]}),
            _FakeVoyageResponse({"data": [{"embedding": [2.0]}, {"embedding": [3.0]}]}),
        ]
    )
    embedder = VoyageEmbedder("voyage-4-large", 1, "test-key", client=client)
    vectors = embedder.embed([big_a, big_b, small])
    assert vectors == [[1.0], [2.0], [3.0]]  # order preserved across the split
    assert len(client.calls) == 2
    assert client.calls[0]["json"]["input"] == [big_a]
    assert client.calls[1]["json"]["input"] == [big_b, small]


def test_voyage_embedder_preserves_order_across_multiple_inputs():
    client = _FakeVoyageClient(
        [_FakeVoyageResponse({"data": [{"embedding": [1.0]}, {"embedding": [2.0]}]})]
    )
    embedder = VoyageEmbedder("voyage-4-large", 1, "test-key", client=client)
    assert embedder.embed(["a", "b"]) == [[1.0], [2.0]]


def test_voyage_embedder_empty_input_makes_no_request():
    client = _FakeVoyageClient([])
    embedder = VoyageEmbedder("voyage-4-large", 1, "test-key", client=client)
    assert embedder.embed([]) == []
    assert client.calls == []


def test_voyage_embedder_retries_on_429_then_succeeds():
    request = httpx.Request("POST", "http://x")
    rate_limited = httpx.HTTPStatusError(
        "rate limited", request=request, response=httpx.Response(429, request=request)
    )
    client = _FakeVoyageClient(
        [rate_limited, _FakeVoyageResponse({"data": [{"embedding": [1.0]}]})]
    )
    embedder = VoyageEmbedder("voyage-4-large", 1, "test-key", client=client)
    assert embedder.embed(["x"]) == [[1.0]]
    assert len(client.calls) == 2


def test_voyage_embedder_does_not_retry_on_400():
    request = httpx.Request("POST", "http://x")
    bad_request = httpx.HTTPStatusError(
        "bad request", request=request, response=httpx.Response(400, request=request)
    )
    client = _FakeVoyageClient([bad_request])
    embedder = VoyageEmbedder("voyage-4-large", 1, "test-key", client=client)
    try:
        embedder.embed(["x"])
        raise AssertionError("expected HTTPStatusError to propagate")
    except httpx.HTTPStatusError:
        pass
    assert len(client.calls) == 1


def test_get_embedder_picks_voyage_when_model_name_says_so(monkeypatch):
    monkeypatch.setenv("VOYAGE_API_KEY", "test-key")
    settings = Settings(embedding_model="voyage-4-large", embedding_dim=1024)
    embedder = get_embedder(settings)
    assert isinstance(embedder, VoyageEmbedder)
    assert embedder.dim == 1024


def test_get_embedder_requires_voyage_api_key(monkeypatch):
    monkeypatch.delenv("VOYAGE_API_KEY", raising=False)
    settings = Settings(embedding_model="voyage-4-large", embedding_dim=1024)
    try:
        get_embedder(settings)
        raise AssertionError("expected RuntimeError for missing VOYAGE_API_KEY")
    except RuntimeError:
        pass


def test_get_embedder_defaults_to_local():
    # Settings(), not get_settings(): the latter reflects this project's real
    # ambient .env, which now points at Voyage — the branch under test is
    # "a non-voyage model name picks LocalEmbedder", independent of whatever
    # the real environment happens to be configured for.
    from etl.enrichment.embeddings import LocalEmbedder

    settings = Settings(embedding_model="BAAI/bge-small-en-v1.5", embedding_dim=384)
    assert isinstance(get_embedder(settings), LocalEmbedder)


# --- _cosine_sim / _mmr_select -------------------------------------------


def test_cosine_sim_identical_vectors_is_one():
    v = [1.0, 2.0, 3.0]
    assert round(_cosine_sim(v, v), 6) == 1.0


def test_cosine_sim_orthogonal_vectors_is_zero():
    assert round(_cosine_sim([1.0, 0.0], [0.0, 1.0]), 6) == 0.0


def test_cosine_sim_zero_vector_does_not_crash():
    assert _cosine_sim([0.0, 0.0], [1.0, 1.0]) == 0.0


def test_mmr_select_passes_through_when_pool_not_larger_than_k():
    candidates = [{"score": 0.9, "_vec": [1.0, 0.0]}, {"score": 0.5, "_vec": [0.0, 1.0]}]
    assert _mmr_select(candidates, k=5) == candidates


def test_mmr_select_prefers_diversity_over_a_marginal_score_gain():
    # Three near-identical high-scoring candidates (same source, redundant
    # content) plus one slightly-lower-scoring but genuinely different one —
    # mirrors the real failure: a high-volume source's near-duplicates
    # outscoring a single genuinely distinct passage by a small margin. A
    # plain top-2-by-score would pick two of the redundant three and drop
    # the different one entirely.
    redundant = [{"score": 0.83, "_vec": [5.0, 0.0, 1.0]} for _ in range(3)]
    diverse = {"score": 0.81, "_vec": [1.0, 1.0, 1.0]}
    selected = _mmr_select([*redundant, diverse], k=2)
    assert diverse in selected
    assert len(selected) == 2


def test_mmr_select_still_picks_highest_score_first():
    candidates = [{"score": 0.9, "_vec": [1.0, 0.0]}, {"score": 0.1, "_vec": [0.0, 1.0]}]
    selected = _mmr_select(candidates, k=1)
    assert selected == [candidates[0]]


# --- press_passages: MMR diversification + source_key --------------------


def _seed_glut_docs(session) -> dict[str, int]:
    """Five near-duplicate high-scoring docs from one source ('glut_source')
    plus one genuinely different, slightly-lower-scoring doc from another
    ('diverse_source') — under FakeEmbedder's ai/fish counting scheme,
    'ai ai ai ai ai' always embeds identically regardless of which of the
    five documents it's in, so the five are perfectly redundant with each
    other, exactly like near-identical explainer articles in production."""
    glut_id = _source_with_key(session, "glut_source")
    diverse_id = _source_with_key(session, "diverse_source")
    today = dt.date.today()
    for i in range(5):
        _press_doc(
            session,
            external_id=f"GLUT_{i}",
            source_id=glut_id,
            date_document=today - dt.timedelta(days=1),
            text="ai ai ai ai ai",
        )
    _press_doc(
        session,
        external_id="DIVERSE",
        source_id=diverse_id,
        date_document=today - dt.timedelta(days=1),
        text="ai fish",
    )
    return {"glut_source": glut_id, "diverse_source": diverse_id}


def test_press_passages_surfaces_diverse_source_despite_lower_raw_score(db_session):
    _seed_glut_docs(db_session)
    embed_pending(db_session, FakeEmbedder())
    hits = press_passages(
        db_session,
        FakeEmbedder(),
        "ai",
        {"glut_source", "diverse_source"},
        days=90,
        k=3,
        min_score=0.5,
    )
    titles = {h["title"] for h in hits}
    # A plain top-3-by-similarity would be all five GLUT_* docs tied at the
    # same top score, with DIVERSE (scoring slightly lower) never making
    # the cut — MMR's redundancy penalty against the already-picked
    # near-duplicates is what gets it in.
    assert "DIVERSE" in titles
    assert len(hits) == 3


def test_press_passages_results_carry_source_key(db_session):
    _seed_press_docs(db_session)
    embed_pending(db_session, FakeEmbedder())
    hits = press_passages(db_session, FakeEmbedder(), "ai", {"good_source"}, days=90, k=5)
    assert all(h["source_key"] == "good_source" for h in hits)


def test_press_passages_results_never_leak_the_internal_vector(db_session):
    _seed_glut_docs(db_session)
    embed_pending(db_session, FakeEmbedder())
    hits = press_passages(
        db_session, FakeEmbedder(), "ai", {"glut_source", "diverse_source"}, days=90, k=3
    )
    assert all("_vec" not in h for h in hits)
