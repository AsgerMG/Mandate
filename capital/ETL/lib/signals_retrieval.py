"""Semantic retrieval over the public-capital-intelligence corpus.

The query-time half of the embed architecture (build-time half:
ETL/intelligence/transform/embed_articles.py). Vectors live in
`signals_chunk_embeddings.embedding`, a pgvector vector(384), next to the events
corpus in schema `capital`, and similarity is computed IN Postgres with the
cosine-distance operator `<=>`.

WHY AN EXACT SCAN AND NO HNSW INDEX. At this corpus scale (11,184 chunks x 384
dims, 18 MB) the sequential `ORDER BY embedding <=> q LIMIT k` measured 9.5 ms
server-side on 2026-11-05. An HNSW index would make the answer approximate for
no saving a person could notice, and it actively breaks `topic_passages`: a
filtered ANN query post-filters the index's candidate list, so a topic whose
chunks are not among the nearest ef_search neighbours would come back EMPTY --
and an empty topic is reported to the brief as "the corpus holds nothing here".
Revisit at ~10^6 chunks: `CREATE INDEX ... USING hnsw (embedding
vector_cosine_ops)` plus `SET hnsw.iterative_scan = relaxed_order` for the
filtered path.

Two entry points:

  semantic_search(query, k)   open top-k over every embedded chunk, joined to
                              article + source metadata and the chunk's exact
                              char offsets, so a generated claim can cite a
                              precise span. Cosine similarity, 1 - distance.

  topic_passages(query)       the guaranteed-coverage path: the single best
                              passage per MUST-COVER topic (competitiveness_fund,
                              startup_scaleup, ...) regardless of whether it
                              wins the open top-k -- otherwise a brief whose
                              query doesn't use a topic's own vocabulary would
                              silently never see it, and the report would omit
                              it instead of explicitly addressing it.

Relevance is a property of RETRIEVAL here -- there is deliberately no classifier
in front of the index. The Haiku relevance gate exists only as a cost filter
for the model-written stages (entity_link, classify_signals).

Reuse across calls: build once with `r = SignalsRetriever()` -- it holds the
embedding model, which is the expensive part; each `.search()` is one query.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from store import connect  # noqa: E402

# The topics every brief must engage with even when the open top-k misses them.
MUST_COVER_TOPICS = ("competitiveness_fund", "startup_scaleup")

# Ties on distance break on chunk id so the answer is a function of the data.
_HITS_SQL = """
    SELECT c.id AS chunk_id, a.id AS article_id, a.title, a.url, a.resolved_url,
           a.published_at, s.key AS source_key, s.tier, s.country, s.topics,
           c.chunk_text, c.char_start, c.char_end,
           1 - (e.embedding <=> %(q)s::vector) AS similarity
    FROM signals_chunk_embeddings e
    JOIN signals_article_chunks c ON c.id = e.chunk_id
    JOIN signals_articles a ON a.id = c.article_id
    JOIN signals_sources s ON s.id = a.source_id
    {where}
    ORDER BY e.embedding <=> %(q)s::vector, c.id
    LIMIT %(k)s
"""

_TOPIC_WHERE = "WHERE (',' || s.topics || ',') LIKE '%%,' || %(topic)s || ',%%'"


def vector_literal(v) -> str:
    """pgvector's text form. repr() of a float32 widened to a double is exact,
    and pgvector parses it back to the same float32."""
    return "[" + ",".join(repr(float(x)) for x in v) + "]"


class SignalsRetriever:
    def __init__(self, embedder=None):
        from embed_articles import get_embedder
        self.embedder = embedder or get_embedder()
        with connect(readonly=True) as con:
            meta = con.execute(
                "SELECT model, dim FROM signals_embedding_meta WHERE id = 1").fetchone()
        if meta is None:
            raise SystemExit("no embeddings yet -- run embed_articles.py first")
        if meta[0] != self.embedder.model_name:
            raise SystemExit(
                f"index built with {meta[0]}, configured model is "
                f"{self.embedder.model_name} -- re-embed or set SIGNALS_EMBED_MODEL")

    def _qvec(self, query: str) -> str:
        return vector_literal(self.embedder.embed([query])[0])

    def _hits(self, q: str, k: int, topic: str | None = None) -> list[dict]:
        sql = _HITS_SQL.format(where=_TOPIC_WHERE if topic else "")
        with connect(readonly=True, dict_rows=True) as con:
            rows = con.execute(sql, {"q": q, "k": k, "topic": topic}).fetchall()
        for r in rows:
            r["similarity"] = float(r["similarity"])
        return rows

    def search(self, query: str, k: int = 8) -> list[dict]:
        return self._hits(self._qvec(query), k)

    def topic_passages(self, query: str,
                       topics: tuple[str, ...] = MUST_COVER_TOPICS
                       ) -> dict[str, dict | None]:
        """One best passage per must-cover topic (None = the corpus holds
        nothing for it -- the brief should then SAY so, not silently omit it).
        Exact masking: topic membership comes from the source registry tags."""
        q = self._qvec(query)
        out: dict[str, dict | None] = {}
        for t in topics:
            hits = self._hits(q, 1, topic=t)
            out[t] = hits[0] if hits else None
        return out


def semantic_search(query: str, k: int = 8) -> list[dict]:
    return SignalsRetriever().search(query, k)


def topic_passages(query: str,
                   topics: tuple[str, ...] = MUST_COVER_TOPICS) -> dict[str, dict | None]:
    return SignalsRetriever().topic_passages(query, topics)
