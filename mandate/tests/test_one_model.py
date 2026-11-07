"""mandate/ops/one_model.py on a real Postgres: migration 036, backfill, verify, flip.

The rehearsal of the re-embed, with a deterministic stand-in for Voyage. In CI
(pgvector 0.8, mandate-ci) the columns are real halfvec; on a local pgserver
(pgvector 0.6, no halfvec) the same SQL runs with halfvec read as vector, as
grounding.testing does for grounding.sql.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import math
from pathlib import Path

import psycopg
import pytest

from mandate import embedding as E
from mandate.grounding.testing import EphemeralMandate

REPO = Path(__file__).resolve().parents[2]
MIGRATION = REPO / "capital" / "ETL" / "schema" / "migrations" / "036_one_embedding_model.sql"
TABLES = ("capital.eligibility_embeddings", "capital.instrument_profiles",
          "capital.signals_chunk_embeddings")

spec = importlib.util.spec_from_file_location("one_model", REPO / "mandate" / "ops" / "one_model.py")
one_model = importlib.util.module_from_spec(spec)
spec.loader.exec_module(one_model)

# The legacy tables as they stand in production (the columns one_model reads).
LEGACY_DDL = """
CREATE TABLE funding_instruments (id text PRIMARY KEY);
CREATE TABLE eligibility_gates (instrument_id text, gate_key text, verification_level text);
CREATE TABLE eligibility_clauses (instrument_id text, clause_key text, verification_level text);
CREATE TABLE eligibility_embeddings (id bigint PRIMARY KEY, source_type text NOT NULL,
  instrument_id text NOT NULL, source_key text NOT NULL, chunk_text text NOT NULL,
  embedding vector(1024) NOT NULL, model text NOT NULL);
CREATE TABLE instrument_profiles (instrument_id text PRIMARY KEY, profile_text text NOT NULL,
  embedding vector(1024) NOT NULL, model text NOT NULL, n_titles int);
CREATE TABLE signals_article_chunks (id bigint PRIMARY KEY, chunk_text text NOT NULL);
CREATE TABLE signals_chunk_embeddings (chunk_id bigint PRIMARY KEY, embedding vector(384) NOT NULL);
"""


def vec(text: str, dim: int) -> list[float]:
    """Deterministic unit vector per text: identical texts, identical vectors."""
    h = hashlib.sha256(text.encode()).digest()
    v = [((h[i % 32] + i * 7) % 251) / 251.0 - 0.5 for i in range(dim)]
    n = math.sqrt(sum(x * x for x in v))
    return [x / n for x in v]


class FakeVoyage:
    def __init__(self):
        self.usage = E.Usage()
        self.calls = 0

    def embed_documents(self, texts):
        self.calls += 1
        self.usage.add(E.MODEL, len(texts), sum(len(t) // 4 for t in texts))
        return [vec(t, E.DIM) for t in texts]


@pytest.fixture()
def db(monkeypatch):
    with EphemeralMandate() as m:
        with psycopg.connect(m.admin_url, autocommit=True) as c:
            c.execute("SET search_path = capital, public")
            c.execute(LEGACY_DDL)
            mig = MIGRATION.read_text()
            if not m.halfvec:
                mig = mig.replace("halfvec(", "vector(")
                for t in TABLES:   # the stand-in: read halfvec as vector, as grounding.testing does
                    monkeypatch.setitem(E.VECTOR_COLUMNS[t][E.MODEL], "type", "vector")
            c.execute("INSERT INTO funding_instruments VALUES ('a'), ('b'), ('uncited')")
            c.execute("INSERT INTO eligibility_gates VALUES ('uncited', 'g', 'llm_classified')")
            for i, (inst, text) in enumerate([("a", "SMEs only"), ("a", "Located in Denmark"),
                                              ("b", "SMEs only"), ("b", "Hydrogen projects")]):
                c.execute("INSERT INTO eligibility_embeddings VALUES (%s,'gate',%s,%s,%s,%s::vector,'voyage-3.5')",
                          (i + 1, inst, f"g{i}", text, E.vector_literal(vec("old" + text, 1024))))
            for inst, text in [("a", "Fund a: rail"), ("b", "Fund b: hydrogen"), ("uncited", "Fund c")]:
                c.execute("INSERT INTO instrument_profiles VALUES (%s,%s,%s::vector,'voyage-3.5',1)",
                          (inst, text, E.vector_literal(vec("old" + text, 1024))))
            for i, text in enumerate(["news one", "news two", "news three"]):
                c.execute("INSERT INTO signals_article_chunks VALUES (%s,%s)", (i + 1, text))
                c.execute("INSERT INTO signals_chunk_embeddings VALUES (%s,%s::vector)",
                          (i + 1, E.vector_literal(vec(text, 384))))
            m.migration = mig
            yield m


def _con(m):
    return one_model._connect(m.admin_url, readonly=False)


def test_plan_before_the_migration_names_it_and_counts_everything(db):
    with _con(db) as con:
        p = one_model.plan(con, 4.5)
    by = {r["table"]: r for r in p["tables"]}
    assert all(not r["column_exists"] for r in p["tables"])
    assert by["capital.eligibility_embeddings"]["missing"] == 4
    assert by["capital.signals_chunk_embeddings"]["missing"] == 3
    assert p["no_eligibility_embedding"] == {"instruments": 1, "only_uncited_gates": 1,
                                             "also_no_profile": 0}


def test_backfill_verify_flip_and_rerun_is_free(db, tmp_path):
    with _con(db) as con:
        con.execute(db.migration)
        con.commit()
        assert not one_model.verify(con)               # 036 ran, nothing filled: not complete
        fake = FakeVoyage()
        assert one_model.backfill(con, max_usd=1.0, embedder=fake) == 4 + 3 + 3
        assert one_model.verify(con)
        # the legacy vectors are untouched, and the legacy column now accepts NULL
        assert con.execute("SELECT count(*) FROM eligibility_embeddings WHERE embedding IS NULL").fetchone()[0] == 0
        con.execute("INSERT INTO signals_article_chunks VALUES (9, 'post flip')")
        con.execute("INSERT INTO signals_chunk_embeddings (chunk_id, embedding_v4) VALUES "
                    f"(9, %s::{E.VECTOR_COLUMNS['capital.signals_chunk_embeddings'][E.MODEL]['type']})",
                    (E.vector_literal(vec("post flip", 1024)),))
        con.commit()
        # idempotent: a second run embeds nothing
        again = FakeVoyage()
        assert one_model.backfill(con, max_usd=1.0, embedder=again) == 0 and again.calls == 0
        # a row the writers missed makes verify fail, and the backfill heals it
        con.execute("UPDATE instrument_profiles SET embedding_v4 = NULL WHERE instrument_id = 'b'")
        con.commit()
        assert not one_model.verify(con)
        assert one_model.backfill(con, max_usd=1.0, embedder=FakeVoyage()) == 1
        assert one_model.verify(con)

    spec_copy = tmp_path / "spaces.json"
    # The PRE-flip spec, whatever the live file says: once the flip is merged the
    # live spaces.json already stores voyage-4-large, and copying it left this test
    # nothing to flip (2026-11-07). The legacy models are the ones 036 replaced.
    spec = json.loads((REPO / "mandate" / "embedding" / "spaces.json").read_text())
    spec["stored"].update({
        "capital.eligibility_embeddings": "voyage-3.5",
        "capital.instrument_profiles": "voyage-3.5",
        "capital.signals_chunk_embeddings": "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
    })
    spec_copy.write_text(json.dumps(spec, indent=2))
    assert set(one_model.flip(spec_copy)) == set(TABLES)
    flipped = json.loads(spec_copy.read_text())
    assert all(flipped["stored"][t] == E.MODEL for t in TABLES)
    # after the flip the column every reader reads is MODEL's, which the backfill filled
    for t in TABLES:
        assert flipped["vector_columns"][t][E.MODEL]["column"] == "embedding_v4"
    assert one_model.flip(spec_copy) == []             # flipping twice changes nothing


def test_the_spend_cap_stops_between_batches(db, monkeypatch):
    monkeypatch.setattr(one_model, "BATCH", 1)
    with _con(db) as con:
        con.execute(db.migration)
        con.commit()
        with pytest.raises(SystemExit, match="max-usd"):
            one_model.backfill(con, max_usd=0.0, embedder=FakeVoyage())
        # what was paid for before the stop is committed
        assert con.execute("SELECT count(*) FROM eligibility_embeddings "
                           "WHERE embedding_v4 IS NOT NULL").fetchone()[0] == 1
