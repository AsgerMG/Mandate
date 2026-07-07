"""Enrichment: embeddings (and, later, LLM summaries) layered onto passages."""

from .embeddings import Embedder, canon_passages, embed_pending, get_embedder, semantic_search

__all__ = ["Embedder", "canon_passages", "embed_pending", "get_embedder", "semantic_search"]
