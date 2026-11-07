"""Policy on grounding: what lands where, and that the cutover changes no answer.

  * a new fetch lands in grounding (version, fetch, passages, bucket object) and
    in policy only as a Document + VersionRef;
  * a duplicate fetch adds one grounding.fetches row and nothing else;
  * the legacy tables refuse writes, and no code path names them;
  * on a migrated corpus (policy_to_grounding.apply, then Alembic 5c2f9e1a7b30
    itself), retrieval returns the same top passages as the legacy tables did,
    ids are preserved, and stored citations still resolve.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import random
import re
import sys
from pathlib import Path

import psycopg
import pytest
from psycopg.conninfo import conninfo_to_dict
from sqlalchemy import URL, create_engine, func, select, text
from sqlalchemy.orm import Session

from data import grounding_bridge as gb
from data.base import Base
from data.config import EMBEDDING_DIM
from data.models import (
    Actor,
    ActorRole,
    Document,
    DocumentActor,
    DocumentType,
    DocumentVersion,
    Enrichment,
    Jurisdiction,
    LegacyDocumentVersion,
    LegacyPassage,
    LifecycleStage,
    Passage,
    Source,
    VersionRef,
)
from data.session import hnsw_connect_options
from etl.adapters.base import ParsedDocument
from etl.enrichment.embeddings import embed_pending, semantic_search
from etl.pipeline import _persist
from mandate.embedding import vector_literal
from mandate.grounding.store import default_bucket
from mandate.grounding.testing import EphemeralMandate

POLICY = Path(__file__).resolve().parents[1]
REPO = POLICY.parent


class HashEmbedder:
    """A deterministic pseudo-random unit vector per text: no ties, no network."""

    dim = EMBEDDING_DIM
    model = gb.MODEL

    def embed(self, texts):
        out = []
        for t in texts:
            rng = random.Random(hashlib.sha256(t.encode()).digest())
            v = [rng.gauss(0, 1) for _ in range(self.dim)]
            n = sum(x * x for x in v) ** 0.5
            out.append([x / n for x in v])
        return out


def _parsed(external_id: str, body: str, url: str = "https://example.eu/act") -> ParsedDocument:
    return ParsedDocument(
        external_id=external_id,
        title=f"Act {external_id}",
        jurisdiction=Jurisdiction.EU,
        document_type=DocumentType.REGULATION,
        lifecycle_stage=LifecycleStage.IN_FORCE,
        text=body,
        raw_format="html",
        url=url,
    )


def _source(session) -> Source:
    s = Source(key="fake", name="Fake source", jurisdiction=Jurisdiction.EU)
    session.add(s)
    session.flush()
    return s


def _count(session, table: str) -> int:
    return session.execute(text(f"SELECT count(*) FROM {table}")).scalar_one()


BODY = "Article 1\nProviders of AI systems shall register.\n\nArticle 2\nFish quotas apply."
T0 = dt.datetime(2026, 11, 1, 12, tzinfo=dt.UTC)


def test_a_new_fetch_lands_in_grounding(db_session):
    src = _source(db_session)
    created_doc, created_ver = _persist(db_session, src, _parsed("A-1", BODY), T0)
    db_session.commit()
    assert (created_doc, created_ver) == (True, True)

    gv = db_session.execute(text(
        "SELECT id, sha256, text, mime, bucket_key FROM grounding.document_versions")).one()
    assert gv.text == BODY and gv.sha256 == hashlib.sha256(BODY.encode()).hexdigest()
    assert default_bucket().get(gv.bucket_key) == BODY.encode()  # the bytes are stored
    assert _count(db_session, "grounding.fetches") == 1
    assert db_session.execute(text(
        "SELECT canonical_url FROM grounding.documents")).scalar_one() == "https://example.eu/act"
    # every passage is exactly its span of the version text
    bad = db_session.execute(text(
        "SELECT count(*) FROM grounding.passages p JOIN grounding.document_versions v ON v.id = p.version_id "
        "WHERE substr(v.text, p.char_start + 1, p.char_end - p.char_start) <> p.text")).scalar_one()
    assert _count(db_session, "grounding.passages") >= 1 and bad == 0
    # policy holds only its own state, and reads the text back through the view
    ref = db_session.scalars(select(VersionRef)).one()
    assert ref.grounding_version_id == gv.id and ref.is_current
    doc = db_session.scalars(select(Document)).one()
    assert doc.versions[0].text == BODY and doc.versions[0].content_hash == gv.sha256
    assert _count(db_session, "grounding_document_link") == 1
    assert _count(db_session, "document_versions") == 0 and _count(db_session, "passages") == 0


def test_a_duplicate_fetch_adds_only_a_fetch_row(db_session):
    src = _source(db_session)
    _persist(db_session, src, _parsed("A-1", BODY), T0)
    db_session.commit()
    tables = ["grounding.documents", "grounding.document_versions", "grounding.passages",
              "version_refs", "grounding_document_link"]
    before = {t: _count(db_session, t) for t in tables}

    created_doc, created_ver = _persist(db_session, src, _parsed("A-1", BODY), T0 + dt.timedelta(days=7))
    db_session.commit()
    assert (created_doc, created_ver) == (False, False)
    assert {t: _count(db_session, t) for t in tables} == before
    assert db_session.execute(text(
        "SELECT array_agg(fetched_at ORDER BY fetched_at) FROM grounding.fetches")).scalar_one() == [
        T0, T0 + dt.timedelta(days=7)]


def test_the_same_text_from_another_document_is_one_version(db_session):
    src = _source(db_session)
    _persist(db_session, src, _parsed("A-1", BODY), T0)
    _persist(db_session, src, _parsed("A-2", BODY, url="https://other.eu/copy"), T0)
    db_session.commit()
    assert _count(db_session, "grounding.document_versions") == 1
    assert _count(db_session, "version_refs") == 2  # each policy document has its version
    # both documents read the passages; the passage rows exist once
    n_g = _count(db_session, "grounding.passages")
    assert db_session.scalar(select(func.count()).select_from(Passage)) == 2 * n_g


def test_a_change_supersedes_and_a_revert_is_current_again(db_session):
    src = _source(db_session)
    _persist(db_session, src, _parsed("A-1", BODY), T0)
    _persist(db_session, src, _parsed("A-1", BODY + "\n\nArticle 3\nNew."), T0 + dt.timedelta(days=1))
    db_session.commit()
    cur = db_session.scalars(select(DocumentVersion).where(DocumentVersion.is_current)).all()
    assert len(cur) == 1 and "Article 3" in cur[0].text
    _persist(db_session, src, _parsed("A-1", BODY), T0 + dt.timedelta(days=2))
    db_session.commit()
    cur = db_session.scalars(select(DocumentVersion).where(DocumentVersion.is_current)).all()
    assert len(cur) == 1 and cur[0].text == BODY


def test_embed_pending_writes_grounding_in_the_views_model(db_session):
    src = _source(db_session)
    _persist(db_session, src, _parsed("A-1", BODY), T0)
    db_session.commit()
    n = embed_pending(db_session, HashEmbedder())
    assert n == _count(db_session, "grounding.passages") > 0
    assert db_session.execute(text(
        "SELECT array_agg(DISTINCT model) FROM grounding.passage_embeddings")).scalar_one() == [gb.MODEL]
    assert embed_pending(db_session, HashEmbedder()) == 0
    hits = semantic_search(db_session, HashEmbedder(), "AI systems", k=1)
    assert hits and hits[0]["url"] == "https://example.eu/act"


def test_the_legacy_tables_refuse_writes(db_session):
    src = _source(db_session)
    doc = Document(source_id=src.id, external_id="L", title="t", jurisdiction=Jurisdiction.EU)
    db_session.add(doc)
    db_session.flush()
    db_session.add(LegacyDocumentVersion(document_id=doc.id, content_hash="h", text="t",
                                         fetched_at=T0))
    with pytest.raises(Exception, match="deprecated and read-only"):
        db_session.flush()
    db_session.rollback()


def test_the_views_read_the_model_and_chunker_policy_writes(db_session):
    from mandate.embedding import STORED

    view = db_session.execute(text("SELECT pg_get_viewdef('grounded_passages'::regclass)")).scalar_one()
    assert gb.MODEL in view and gb.CHUNKER in view
    assert gb.MODEL == STORED["grounding.passage_embeddings"]
    sys.path.insert(0, str(REPO / "mandate" / "grounding" / "migrations"))
    import policy_to_grounding  # noqa: PLC0415

    assert policy_to_grounding.CHUNKER == gb.CHUNKER  # migrated and new passages are one set


def test_semantic_search_can_ride_the_grounding_hnsw_index(db_session):
    """The search goes through two views; the planner must still be able to use
    grounding's partial HNSW index (seqscan, bitmap scans and sorts disabled to ask
    'can it': a three-row table is never worth an index on cost)."""
    src = _source(db_session)
    _persist(db_session, src, _parsed("A-1", BODY), T0)
    db_session.commit()
    embed_pending(db_session, HashEmbedder())
    q = HashEmbedder().embed(["ai"])[0]
    stmt = (
        select(Passage.text)
        .join(DocumentVersion, Passage.version_id == DocumentVersion.id)
        .join(Document, DocumentVersion.document_id == Document.id)
        .where(Passage.embedding.is_not(None), DocumentVersion.is_current.is_(True))
        .order_by(Passage.embedding.cosine_distance(q))
        .limit(5)
    )
    sql = str(stmt.compile(db_session.get_bind(), compile_kwargs={"literal_binds": True}))
    for knob in ("enable_seqscan", "enable_bitmapscan", "enable_sort"):
        db_session.execute(text(f"SET LOCAL {knob} = off"))
    plan = "\n".join(r[0] for r in db_session.execute(text("EXPLAIN " + sql)))
    assert "ix_gpe_hnsw_" in plan, plan


_LEGACY_WRITE = re.compile(
    r"\b(LegacyDocumentVersion|LegacyPassage)\b"
    r"|(INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE)\s+(policy\.)?(document_versions|passages)\b",
    re.I)


def test_no_code_path_writes_the_legacy_tables():
    """Outside the model that declares them (and the tests that prove the guard),
    nothing may name the legacy classes or write the legacy tables."""
    allowed = {POLICY / "data" / "models.py", POLICY / "data" / "grounding_bridge.py"}
    offenders = []
    for root in ("etl", "data", "scripts"):
        for path in (POLICY / root).rglob("*.py"):
            if path in allowed or "migrations" in path.parts:
                continue
            for i, line in enumerate(path.read_text().splitlines(), 1):
                if _LEGACY_WRITE.search(line):
                    offenders.append(f"{path.relative_to(POLICY)}:{i}: {line.strip()}")
    assert not offenders, "\n".join(offenders)


# ── the cutover itself, on a migrated sample ───────────────────────────────


def _engine(db: EphemeralMandate):
    info = conninfo_to_dict(db.url("policy_app"))
    host = info.get("host") or "localhost"
    url = URL.create("postgresql+psycopg", username=info["user"], password=info.get("password"),
                     host=None if host.startswith("/") else host,
                     port=int(info["port"]) if info.get("port") else None, database=info["dbname"],
                     query={"host": host} if host.startswith("/") else {})
    return create_engine(url, connect_args={"options": hnsw_connect_options()})


LEGACY_SEARCH = """
SELECT p.id, p.text, v.document_id, 1 - (p.embedding <=> CAST(:q AS vector)) AS score
  FROM passages p JOIN document_versions v ON v.id = p.version_id
  JOIN documents d ON d.id = v.document_id
 WHERE p.embedding IS NOT NULL AND v.is_current
 ORDER BY p.embedding <=> CAST(:q AS vector) LIMIT :k
"""

CORPUS = {  # external id -> versions (oldest first); the last is current
    "AI-ACT": ["Article 6\nHigh-risk AI systems shall be registered.\n\nArticle 9\nRisk management.",
               "Article 6\nHigh-risk AI systems shall be registered.\n\nArticle 9\nRisk management "
               "systems shall be documented.\n\nArticle 10\nData governance."],
    "FISH": ["Article 1\nFishing quotas for the Baltic.\n\nArticle 2\nCatch reporting duties."],
    "NIS2": ["Article 21\nCybersecurity risk-management measures.\n\nArticle 23\nIncident reporting "
             "within 24 hours."],
    # the same act ingested by a second adapter, last: a duplicate version whose
    # passage ids are above every surviving id, as in production
    "AI-ACT-COPY": None,
}
QUERIES = ["high-risk AI registration", "fish quota", "incident reporting", "data governance"]


def _seed_legacy(s: Session) -> dict:
    """A pre-cutover corpus in the legacy tables, the way the old pipeline wrote it
    (including a span one past its text, which the migration made exact)."""
    from etl.chunking import chunk_text

    emb = HashEmbedder()
    src = Source(key="eurlex", name="EUR-Lex", jurisdiction=Jurisdiction.EU)
    s.add(src)
    s.flush()
    docs = {}
    for ext, versions in CORPUS.items():
        d = Document(source_id=src.id, external_id=ext, title=ext, jurisdiction=Jurisdiction.EU,
                     document_type=DocumentType.REGULATION, url=f"https://eur-lex.europa.eu/{ext}")
        s.add(d)
        s.flush()
        docs[ext] = d.id
        for i, body in enumerate(versions or [CORPUS["AI-ACT"][-1]]):
            v = LegacyDocumentVersion(document_id=d.id, content_hash=hashlib.sha256(body.encode()).hexdigest(),
                                      raw_format="html", text=body, char_count=len(body),
                                      fetched_at=T0 + dt.timedelta(days=i),
                                      is_current=i == len(versions or [0]) - 1)
            s.add(v)
            s.flush()
            for c in chunk_text(body):
                s.add(LegacyPassage(version_id=v.id, ordinal=c.ordinal, text=c.text,
                                    char_start=c.char_start, char_end=c.char_end + 1,
                                    embedding=emb.embed([c.text])[0]))
    s.flush()
    return docs


def test_the_cutover_keeps_ids_and_retrieval(tmp_path, monkeypatch):
    from alembic import command
    from alembic.config import Config

    sys.path.insert(0, str(REPO / "mandate" / "grounding" / "migrations"))
    import policy_to_grounding  # noqa: PLC0415

    with EphemeralMandate() as db:
        eng = _engine(db)
        Base.metadata.create_all(eng)
        with eng.begin() as c:  # the schema as it stood at e41c0a7b9d10
            c.execute(text("DROP TABLE version_refs"))
            c.execute(text("ALTER TABLE document_actor ADD CONSTRAINT fk_document_actor_passage_id_passages "
                           "FOREIGN KEY (passage_id) REFERENCES passages(id) ON DELETE SET NULL"))
        with Session(eng) as s:
            docs = _seed_legacy(s)
            dup_pid, dup_text = s.execute(text(
                "SELECT p.id, p.text FROM passages p JOIN document_versions v ON v.id = p.version_id "
                "WHERE v.document_id = :d ORDER BY p.ordinal LIMIT 1"), {"d": docs["AI-ACT-COPY"]}).one()
            actor = Actor(name="A. Rapporteur", institution="European Parliament")
            s.add(actor)
            s.flush()
            s.add(DocumentActor(document_id=docs["AI-ACT-COPY"], actor_id=actor.id,
                                role=ActorRole.RAPPORTEUR, passage_id=dup_pid))
            s.add(Enrichment(document_id=docs["AI-ACT-COPY"], summary="x",
                             citations={"passage_ids": [dup_pid]}))
            s.commit()
            emb = HashEmbedder()
            before = {q: s.execute(text(LEGACY_SEARCH), {"q": vector_literal(emb.embed([q])[0]), "k": 5}).all()
                      for q in QUERIES}
            legacy_versions = dict(s.execute(text("SELECT id, is_current FROM document_versions")).all())
            legacy_max_pid = s.execute(text("SELECT max(id) FROM passages")).scalar_one()

        # the migration, as the admin, exactly as production ran it
        with psycopg.connect(db.admin_url) as admin:
            checks = policy_to_grounding.apply(admin, half="halfvec" if db.halfvec else "vector",
                                               log=lambda *_: None)
            admin.commit()
        assert not {k: v for k, v in checks.items() if k.startswith("violations_") and v}

        # Alembic, the real revision, from e41c0a7b9d10 to head, as policy_app
        monkeypatch.chdir(POLICY)
        cfg = Config(str(POLICY / "alembic.ini"))
        cfg.set_main_option("sqlalchemy.url",
                            eng.url.render_as_string(hide_password=False).replace("%", "%%"))
        command.stamp(cfg, "e41c0a7b9d10")
        command.upgrade(cfg, "head")

        with Session(eng) as s:
            # version ids and currency preserved
            assert dict(s.execute(text("SELECT id, is_current FROM version_refs")).all()) == legacy_versions
            # the same top passages, same scores, same documents
            emb = HashEmbedder()
            for q in QUERIES:
                after = semantic_search(s, emb, q, k=5)
                key = lambda r: (-r[0], r[2], r[1])  # noqa: E731
                old = sorted(((round(b.score, 3), b.text, b.document_id) for b in before[q]), key=key)
                new = sorted(((h["score"], h["text"], h["document_id"]) for h in after), key=key)
                assert [(t, d) for _, t, d in new] == [(t, d) for _, t, d in old], q
                assert all(abs(a[0] - b[0]) < 2e-3 for a, b in zip(new, old, strict=True)), q
            # migrated (non-duplicate) passage ids are the legacy ids
            same = s.execute(text(
                "SELECT count(*) FROM passages p JOIN grounding.passages g ON g.id = p.id AND g.text = p.text"
            )).scalar_one()
            dup_rows = s.execute(text(
                "SELECT count(*) FROM grounding_passage_link WHERE policy_passage_id <> grounding_passage_id"
            )).scalar_one()
            assert same + dup_rows == s.execute(text("SELECT count(*) FROM passages")).scalar_one()
            assert dup_rows > 0
            # a stored citation of a folded duplicate resolves to the same text
            resolved = gb.resolve_passage_ids(s, [dup_pid])[dup_pid]
            assert s.execute(text("SELECT text FROM grounding.passages WHERE id = :i"),
                             {"i": resolved}).scalar_one() == dup_text
            # the legacy tables are now read-only, and the FK is gone
            with pytest.raises(Exception, match="deprecated and read-only"):
                s.execute(text("DELETE FROM passages"))
            s.rollback()

            # The migration raises grounding's id counters above every legacy
            # policy id itself (policy_to_grounding.py, 2026-11-07), so a new
            # fetch can never reuse an id a stored citation names, even before
            # policy_on_grounding.sh's own (now idempotent) setval step.
            assert legacy_max_pid > s.execute(text("SELECT max(id) FROM grounding.passages")).scalar_one()
            seq_next = s.execute(text(
                "SELECT last_value FROM pg_sequences WHERE schemaname || '.' || sequencename "
                "= pg_get_serial_sequence('grounding.passages', 'id')")).scalar_one()
            assert seq_next >= legacy_max_pid
        with psycopg.connect(db.admin_url) as admin:
            ops = (REPO / "mandate" / "ops" / "policy_on_grounding.sh").read_text()
            setval = ops[ops.index("SELECT setval"):ops.index('"', ops.index("SELECT setval"))]
            admin.execute(setval)
            admin.commit()
        with Session(eng) as s:
            src = s.scalars(select(Source)).one()
            assert _persist(s, src, _parsed("NEW", "Article 1\nBrand new act."), T0) == (True, True)
            s.commit()
            new_ids = [r[0] for r in s.execute(text(
                "SELECT id FROM grounding.passages WHERE text LIKE '%Brand new%'"))]
            assert new_ids and min(new_ids) > legacy_max_pid
        eng.dispose()
