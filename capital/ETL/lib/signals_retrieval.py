"""Semantic retrieval over the public-capital-intelligence corpus.

The query-time half of the embed architecture (build-time half:
ETL/intelligence/transform/embed_articles.py). Storage is a plain BLOB table;
similarity is numpy brute-force cosine over the full matrix — at this corpus
scale (tens of thousands of chunks × 384 dims) a full scan runs in single-digit
milliseconds, so there is no ANN index to operate or corrupt. pgvector/HNSW is
the documented upgrade path if the corpus ever reaches millions of chunks.

Two entry points:

  semantic_search(query, k)   open top-k over every embedded chunk, joined to
                              article + source metadata and the chunk's exact
                              char offsets, so a generated claim can cite a
                              precise span. Cosine similarity, normalized.

  topic_passages(query)       the guaranteed-coverage path: the single best
                              passage per MUST-COVER topic (competitiveness_fund,
                              startup_scaleup, ...) regardless of whether it
                              wins the open top-k — otherwise a brief whose
                              query doesn't use a topic's own vocabulary would
                              silently never see it, and the report would omit
                              it instead of explicitly addressing it.

Relevance is a property of RETRIEVAL here — there is deliberately no classifier
in front of the index. The Haiku relevance gate exists only as a cost filter
for the model-written stages (entity_link, classify_signals).

Reuse across calls: build once with `r = SignalsRetriever()` — it caches the
embedding matrix and the model; `.search()` / `.topic_passages()` are then
cheap. The module-level functions construct a fresh retriever per call
(convenient for CLI/smoke tests, wasteful in a loop).
"""
from __future__ import annotations

import sqlite3
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from etl_env import SIGNALS_DB  # noqa: E402

# The topics every brief must engage with even when the open top-k misses them.
MUST_COVER_TOPICS = ("competitiveness_fund", "startup_scaleup")

_META_SQL = """
    SELECT c.id AS chunk_id, a.id AS article_id, a.title, a.url, a.resolved_url,
           a.published_at, s.key AS source_key, s.tier, s.country, s.topics,
           c.chunk_text, c.char_start, c.char_end
    FROM article_chunks c
    JOIN articles a ON a.id = c.article_id
    JOIN sources s ON s.id = a.source_id
    WHERE c.id IN ({ids})
"""


class SignalsRetriever:
    def __init__(self, embedder=None):
        import numpy as np
        from embed_articles import get_embedder
        self._np = np
        self.embedder = embedder or get_embedder()
        con = sqlite3.connect(SIGNALS_DB, timeout=30)
        try:
            meta = con.execute(
                "SELECT model, dim FROM embedding_meta WHERE id = 1").fetchone()
            if meta is None:
                raise SystemExit("no embeddings yet — run embed_articles.py first")
            if meta[0] != self.embedder.model_name:
                raise SystemExit(
                    f"index built with {meta[0]}, configured model is "
                    f"{self.embedder.model_name} — re-embed or set SIGNALS_EMBED_MODEL")
            dim = meta[1]
            rows = con.execute(
                "SELECT chunk_id, embedding FROM chunk_embeddings ORDER BY chunk_id"
            ).fetchall()
        finally:
            con.close()
        self.chunk_ids = np.array([r[0] for r in rows], dtype=np.int64)
        mat = np.frombuffer(b"".join(r[1] for r in rows), dtype=np.float32)
        self.matrix = mat.reshape(len(rows), dim)
        # Normalize once so dot product = cosine similarity.
        norms = np.linalg.norm(self.matrix, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        self.matrix = self.matrix / norms

    def _qvec(self, query: str):
        np = self._np
        v = np.array(self.embedder.embed([query])[0], dtype=np.float32)
        n = np.linalg.norm(v)
        return v / (n or 1.0)

    def _hits(self, idxs, sims) -> list[dict]:
        if len(idxs) == 0:
            return []
        ids = [int(self.chunk_ids[i]) for i in idxs]
        con = sqlite3.connect(SIGNALS_DB, timeout=30)
        con.row_factory = sqlite3.Row
        try:
            rows = {r["chunk_id"]: dict(r) for r in con.execute(
                _META_SQL.format(ids=",".join(map(str, ids))))}
        finally:
            con.close()
        out = []
        for i, sim in zip(idxs, sims):
            d = rows.get(int(self.chunk_ids[i]))
            if d:
                d["similarity"] = float(sim)
                out.append(d)
        return out

    def search(self, query: str, k: int = 8) -> list[dict]:
        np = self._np
        sims = self.matrix @ self._qvec(query)
        top = np.argsort(-sims)[:k]
        return self._hits(top, sims[top])

    def topic_passages(self, query: str,
                       topics: tuple[str, ...] = MUST_COVER_TOPICS
                       ) -> dict[str, dict | None]:
        """One best passage per must-cover topic (None = the corpus holds
        nothing for it — the brief should then SAY so, not silently omit it).
        Exact masking: topic membership comes from the source registry tags."""
        np = self._np
        con = sqlite3.connect(SIGNALS_DB, timeout=30)
        try:
            topic_chunks: dict[str, set] = {}
            for t in topics:
                topic_chunks[t] = {r[0] for r in con.execute(
                    """SELECT c.id FROM article_chunks c
                       JOIN articles a ON a.id = c.article_id
                       JOIN sources s ON s.id = a.source_id
                       WHERE (',' || s.topics || ',') LIKE '%,' || ? || ',%'""", (t,))}
        finally:
            con.close()
        sims = self.matrix @ self._qvec(query)
        out: dict[str, dict | None] = {}
        for t in topics:
            mask = np.isin(self.chunk_ids, list(topic_chunks[t]))
            if not mask.any():
                out[t] = None
                continue
            masked = np.where(mask, sims, -np.inf)
            best = int(np.argmax(masked))
            out[t] = self._hits([best], [sims[best]])[0]
        return out


def semantic_search(query: str, k: int = 8) -> list[dict]:
    return SignalsRetriever().search(query, k)


def topic_passages(query: str,
                   topics: tuple[str, ...] = MUST_COVER_TOPICS) -> dict[str, dict | None]:
    return SignalsRetriever().topic_passages(query, topics)
