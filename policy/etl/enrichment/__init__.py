"""Enrichment: embeddings and classification layered onto passages/documents."""

from .classification import classify_pending
from .embeddings import (
    Embedder,
    canon_passages,
    embed_pending,
    get_embedder,
    press_passages,
    semantic_search,
)

__all__ = [
    "Embedder",
    "canon_passages",
    "classify_pending",
    "embed_pending",
    "get_embedder",
    "press_passages",
    "semantic_search",
]
