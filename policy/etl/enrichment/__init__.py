"""Enrichment: embeddings and classification layered onto passages/documents."""

from .classification import classify_pending
from .embeddings import (
    Embedder,
    Reranker,
    canon_passages,
    document_passages,
    embed_pending,
    get_embedder,
    get_reranker,
    press_passages,
    rerank_passages,
    semantic_search,
)

__all__ = [
    "Embedder",
    "Reranker",
    "canon_passages",
    "classify_pending",
    "document_passages",
    "embed_pending",
    "get_embedder",
    "get_reranker",
    "press_passages",
    "rerank_passages",
    "semantic_search",
]
