"""The signals pipeline's writes, proven on an ephemeral Postgres.

Every write path under ETL/intelligence/ runs here against a throwaway database
built from ETL/schema/corpus_schema.sql (ETL/lib/ephemeral_pg.py), never the
shared store. What each part holds:

  ingest     store() is idempotent on url; sync_registry upserts and
             deactivates what left the registry.
  embed      chunk + embed writes vector(384) rows, a re-run is a no-op, and a
             model mismatch refuses instead of mixing vectors.
  retrieval  `<=>` ranks the nearest chunk first, ties break on chunk id, and
             topic_passages masks by source topic (None when a topic is empty).
  re-hydrate an article whose text changed loses its chunks AND their vectors;
             the FK that SQLite never enforced is enforced now.
  classify   signals and entities are replaced per article, not appended.
  links      link_programme_mentions --write rebuilds the table in one
             transaction.
  qa         load_signals' invariants run, and catch a signal on a rejected
             article.
  digest     the people and per-fund SQL run on Postgres.

    policy/.venv/bin/python ETL/intelligence/test_signals_store.py
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "lib"))
import ephemeral_pg  # noqa: E402

ephemeral_pg.start()

import etl_env  # noqa: E402,F401  (stage dirs onto sys.path)
from store import connect  # noqa: E402

sys.path.insert(0, str(HERE.parents[1] / "website" / "build"))
import classify_signals  # noqa: E402
import embed_articles  # noqa: E402
import entity_link_articles  # noqa: E402
import link_programme_mentions  # noqa: E402
import load_signals  # noqa: E402
import news_ingest  # noqa: E402
import signals_digest  # noqa: E402
from matching import CompanyMatcher  # noqa: E402
from signals_retrieval import SignalsRetriever  # noqa: E402

DIM = 384
FAILURES: list[str] = []


def check(cond: bool, what: str) -> None:
    print(f"  {'ok  ' if cond else 'FAIL'} {what}")
    if not cond:
        FAILURES.append(what)


class FakeEmbedder:
    """Deterministic: a text's vector is one-hot on a word's hash bucket, so
    'alpha' is nearest to the chunk that says 'alpha'."""
    model_name = "test/fake"
    dim = DIM

    def embed(self, texts):
        out = []
        for t in texts:
            v = [0.0] * DIM
            for w in t.lower().split():
                v[sum(map(ord, w)) % DIM] += 1.0
            out.append(v)
        return out


def one(sql: str, params=()):
    with connect(readonly=True) as con:
        return con.execute(sql, params).fetchone()[0]


def test_ingest() -> None:
    print("ingest")
    news_ingest.SOURCES = {
        "a": {"name": "A", "tier": "funder_press", "country": "EU", "language": "en",
              "kind": "rss", "url": "https://a.example/feed", "topics": ["startup_scaleup"]},
        "b": {"name": "B", "tier": "trade_press", "country": "DE", "language": "de",
              "kind": "rss", "url": "https://b.example/feed", "topics": ["ipcei", "chips"]},
    }
    with connect(dict_rows=True) as con:
        ids = news_ingest.sync_registry(con)
        items = [{"title": "alpha", "summary": "alpha news", "url": "https://a/1",
                  "published": "2026-07-01"},
                 {"title": "beta", "summary": "beta news", "url": "https://a/2",
                  "published": None}]
        first = news_ingest.store(con, ids["a"], "en", items)
        again = news_ingest.store(con, ids["a"], "en", items)
        news_ingest.store(con, ids["b"], "de", [
            {"title": "gamma", "summary": "gamma chips", "url": "https://b/1",
             "published": "2026-07-02"}])
    check(first == 2 and again == 0, f"store() idempotent on url (2 then 0; got {first}, {again})")
    del news_ingest.SOURCES["b"]
    with connect(dict_rows=True) as con:
        news_ingest.sync_registry(con)
    check(one("SELECT active FROM signals_sources WHERE key = 'b'") == 0,
          "a source that left the registry is deactivated, not deleted")
    check(one("SELECT count(*) FROM signals_articles") == 3, "its articles are kept")
    with connect() as con:
        con.execute("UPDATE signals_articles SET full_text_fetched = 1")


def test_embed_and_retrieve() -> None:
    print("embed + retrieval")
    emb = FakeEmbedder()
    with connect(dict_rows=True) as con:
        embed_articles.ensure_model(con, emb)
        embed_articles._run(con, emb, None)
    with connect(readonly=True) as con:
        texts = [r[0] for r in con.execute("SELECT raw_text FROM signals_articles")]
    want = sum(max(1, len(embed_articles.chunk_with_offsets(t))) for t in texts)
    n_chunks = one("SELECT count(*) FROM signals_article_chunks")
    n_vecs = one("SELECT count(*) FROM signals_chunk_embeddings")
    check(n_chunks == want and n_vecs == want,
          f"every chunk the chunker makes is stored and embedded ({want}; got {n_chunks}, {n_vecs})")
    check(one("SELECT vector_dims(embedding) FROM signals_chunk_embeddings LIMIT 1") == DIM,
          "stored as vector(384)")
    with connect(dict_rows=True) as con:
        embed_articles._run(con, emb, None)
    check(one("SELECT count(*) FROM signals_chunk_embeddings") == want, "re-run embeds nothing new")

    class Other(FakeEmbedder):
        model_name = "test/other"
    try:
        with connect(dict_rows=True) as con:
            embed_articles.ensure_model(con, Other())
        check(False, "a different model is refused")
    except SystemExit:
        check(True, "a different model is refused")

    r = SignalsRetriever(embedder=emb)
    hits = r.search("alpha", k=3)
    check(hits[0]["title"] == "alpha", f"nearest chunk first (got {hits[0]['title']!r})")
    # chunk 0 is "alpha\nalpha\nalpha news" (title prepended): 3*e_alpha + e_news,
    # so cosine with e_alpha is 3/sqrt(10).
    check(abs(hits[0]["similarity"] - 3 / 10 ** 0.5) < 1e-6,
          f"similarity is 1 - cosine distance (got {hits[0]['similarity']:.6f})")
    check(len(hits) == 3 and hits[0]["char_start"] is not None, "metadata and offsets joined")
    tp = r.topic_passages("gamma", topics=("chips", "startup_scaleup", "space"))
    check(tp["chips"] and tp["chips"]["title"] == "gamma", "topic passage comes from a tagged source")
    check(tp["startup_scaleup"] and tp["startup_scaleup"]["source_key"] == "a",
          "topic mask holds even when the query is nearer another topic")
    check(tp["space"] is None, "an empty topic is None, not omitted")

    # Exact ties: two identical texts -> identical vectors -> lower chunk id first.
    with connect() as con:
        sid = con.execute("SELECT id FROM signals_sources WHERE key='a'").fetchone()[0]
        for u in ("https://a/dup1", "https://a/dup2"):
            con.execute("INSERT INTO signals_articles (source_id, url, title, raw_text, "
                        "full_text_fetched) VALUES (%s, %s, 'delta', 'delta delta', 1)",
                        (sid, u))
    with connect(dict_rows=True) as con:
        embed_articles._run(con, emb, None)
    hits = [h for h in r.search("delta", k=5) if h["title"] == "delta"]
    check(len(hits) == 2 and hits[0]["chunk_id"] < hits[1]["chunk_id"],
          "exact ties break on chunk id")


def test_rehydrate_drops_vectors() -> None:
    print("re-hydrate")
    with connect(dict_rows=True) as con:
        aid = con.execute("SELECT id FROM signals_articles WHERE url='https://a/1'").fetchone()["id"]
        before = con.execute("SELECT count(*) AS n FROM signals_article_chunks "
                             "WHERE article_id=%s", (aid,)).fetchone()["n"]
        news_ingest._drop_chunks(con, aid)
    check(one("SELECT count(*) FROM signals_article_chunks WHERE article_id=%s", (aid,)) == 0,
          "chunks dropped")
    check(one("""SELECT count(*) FROM signals_chunk_embeddings e WHERE NOT EXISTS
                 (SELECT 1 FROM signals_article_chunks c WHERE c.id = e.chunk_id)""") == 0,
          "no orphaned vectors")
    with connect(dict_rows=True) as con:
        embed_articles._run(con, FakeEmbedder(), None)
    check(one("SELECT count(*) FROM signals_article_chunks WHERE article_id=%s", (aid,)) == before,
          "next embed run re-chunks it")


def test_classify_writes() -> None:
    print("classify / entity link")
    with connect() as con:
        con.execute("UPDATE signals_articles SET is_relevant = 1")
        con.execute("INSERT INTO companies (canonical_name, country) VALUES ('ACME ROBOTICS', 'DE')")
        aid = con.execute("SELECT id FROM signals_articles WHERE url='https://a/1'").fetchone()[0]
        n1 = classify_signals.write_signals(con, aid, [
            {"signal_type": "funding_award", "confidence": 1.4, "summary": "A got a grant."},
            {"signal_type": "not_a_type", "confidence": 0.9, "summary": "x"},
            {"signal_type": "programme_policy_change", "confidence": 0.7, "summary": " "}],
            "2026-11-05T00:00:00+00:00")
        n2 = classify_signals.write_signals(con, aid, [
            {"signal_type": "programme_policy_change", "confidence": 0.8,
             "summary": "EIC budget rose.", "anticipated_impact": "Look at EIC."}],
            "2026-11-05T00:00:00+00:00")
        matcher = CompanyMatcher(con, country=None)
        res = entity_link_articles.write_entities(con, matcher, aid, [
            {"type": "company", "mention": "Acme Robotics GmbH"},
            {"type": "program", "mention": "EIC Accelerator"},
            {"type": "person", "mention": "Jane Doe"},
            {"type": "bogus", "mention": "x"}], "2026-11-05T00:00:00+00:00")
    check(n1 == 1 and n2 == 1, "invalid signals are dropped")
    check(one("SELECT count(*) FROM signals_article_signals WHERE article_id=%s", (aid,)) == 1,
          "re-tagging replaces, not appends")
    check(one("SELECT confidence FROM signals_article_signals WHERE article_id=%s", (aid,)) == 0.8,
          "latest answer stored")
    check(res == 1 and one("SELECT count(*) FROM signals_article_entities WHERE company_id IS NOT NULL") == 1,
          "company mention resolved through CompanyMatcher on the Postgres connection")
    check(one("SELECT signals_extracted_at IS NOT NULL AND entities_extracted_at IS NOT NULL "
              "FROM signals_articles WHERE id=%s", (aid,)), "article stamped")


def test_links() -> None:
    print("programme links")
    with connect() as con:
        # A product table (postgres_schema.sql, which does not replay): only
        # the columns link_programme_mentions reads.
        con.execute("CREATE TABLE funding_instruments (id TEXT PRIMARY KEY, name TEXT, "
                    "source_family_bucket TEXT, administering_body TEXT, is_framework BOOLEAN)")
        con.execute("INSERT INTO funding_instruments (id, name, source_family_bucket, is_framework) "
                    "VALUES ('eic_acc', 'EIC Accelerator', 'eic', false), "
                    "('eic_pf', 'EIC Pathfinder', 'eic', false)")
    args = argparse.Namespace(write=True, sample=0)
    with connect(dict_rows=True) as con:
        link_programme_mentions._main(con, args)
    check(one("SELECT count(*) FROM signals_article_instrument_links") == 2,
          "a channel mention links every fund in the channel")
    with connect(dict_rows=True) as con:
        link_programme_mentions._main(con, args)
    check(one("SELECT count(*) FROM signals_article_instrument_links") == 2,
          "rebuild is idempotent")
    try:
        with connect(dict_rows=True) as con:
            con.execute("DELETE FROM signals_article_instrument_links")
            raise RuntimeError("simulated failure mid-rebuild")
    except RuntimeError:
        pass
    check(one("SELECT count(*) FROM signals_article_instrument_links") == 2,
          "a failed rebuild rolls back: readers never see an empty table")


def test_qa_and_digest() -> None:
    print("qa + digest SQL")
    check(load_signals.qa() == 0, "QA clean on a consistent store")
    with connect() as con:
        con.execute("UPDATE signals_articles SET is_relevant = 0 WHERE url='https://a/1'")
    check(load_signals.qa() == 2, "QA catches signals and entities on a rejected article")
    with connect() as con:
        con.execute("UPDATE signals_articles SET is_relevant = 1 WHERE url='https://a/1'")
        con.execute("UPDATE signals_articles SET published_at='2026-07-01' WHERE url='https://a/1'")
    with connect(readonly=True, dict_rows=True) as con:
        inst = signals_digest._instrument_signals(con)
        people = signals_digest._people(con)
    check(set(inst) == {"eic_acc", "eic_pf"} and inst["eic_acc"][0]["type"] == "programme_policy_change",
          "per-fund signals keyed by instrument id")
    check([p["person"] for p in people] == ["Jane Doe"],
          "people: a named person on a policy-change article")


def main() -> int:
    test_ingest()
    test_embed_and_retrieve()
    test_rehydrate_drops_vectors()
    test_classify_writes()
    test_links()
    test_qa_and_digest()
    if FAILURES:
        print(f"\nFAILED: {len(FAILURES)}")
        return 1
    print("\nok: every signals write path holds on Postgres")
    return 0


if __name__ == "__main__":
    sys.exit(main())
