"""Passage chunking — the first enrichment step.

Splits a document version's normalized text into overlapping, citation-sized
passages with char offsets preserved. Offsets are what let the RAG layer link
a generated claim back to an exact span of the source text.

Embedding the passages is a separate step (needs the Voyage API key) and is
intentionally not done here so ingestion can run offline.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# Roughly ~1k tokens of context per passage with a small overlap so sentences
# spanning a boundary still retrieve. Measured in characters as a cheap proxy.
TARGET_CHARS = 1500
OVERLAP_CHARS = 200

_PARAGRAPH = re.compile(r"\n\s*\n")


@dataclass(slots=True)
class Chunk:
    ordinal: int
    text: str
    char_start: int
    char_end: int


def chunk_text(
    text: str, *, target: int = TARGET_CHARS, overlap: int = OVERLAP_CHARS
) -> list[Chunk]:
    """Greedy paragraph-aware chunker that preserves absolute char offsets."""
    text = text or ""
    if not text.strip():
        return []

    # Build (start, end) paragraph spans against the ORIGINAL string so offsets
    # remain valid for citation.
    spans: list[tuple[int, int]] = []
    pos = 0
    for part in _PARAGRAPH.split(text):
        start = text.find(part, pos)
        if start == -1:
            start = pos
        end = start + len(part)
        if part.strip():
            spans.append((start, end))
        pos = end

    chunks: list[Chunk] = []
    ordinal = 0
    cur_start: int | None = None
    cur_end: int | None = None

    for start, end in spans:
        if cur_start is None:
            cur_start, cur_end = start, end
            continue
        if end - cur_start <= target:
            cur_end = end
        else:
            chunks.append(_make(ordinal, text, cur_start, cur_end))
            ordinal += 1
            # start next chunk with overlap back into the previous one
            cur_start = max(cur_end - overlap, start) if cur_end else start
            cur_end = end

    if cur_start is not None and cur_end is not None:
        chunks.append(_make(ordinal, text, cur_start, cur_end))

    return chunks


def _make(ordinal: int, text: str, start: int, end: int) -> Chunk:
    return Chunk(ordinal=ordinal, text=text[start:end].strip(), char_start=start, char_end=end)
