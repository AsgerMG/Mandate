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
# No blank-line boundary exists inside a single oversized paragraph (a
# run-on recital, an annex without blank-line breaks) — without a hard
# ceiling the paragraph-atomic rule below produces one arbitrarily large
# chunk, diluting its embedding across multiple distinct legal points.
# Sentence-level sub-splitting kicks in only above this ceiling; a normal
# paragraph up to 2x target is still kept whole, exactly as before.
MAX_CHARS = TARGET_CHARS * 2

_PARAGRAPH = re.compile(r"\n\s*\n")
_SENTENCE_BOUNDARY = re.compile(r"(?<=[.?!])\s+")


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

    # A paragraph past the hard ceiling gets sub-split on sentence
    # boundaries before the normal greedy accumulation below ever sees it —
    # so no single chunk this function produces can exceed MAX_CHARS,
    # regardless of how the source document is formatted.
    spans = [
        sub_span
        for start, end in spans
        for sub_span in (
            _split_oversized_span(text, start, end, target)
            if end - start > MAX_CHARS
            else [(start, end)]
        )
    ]

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


def _split_oversized_span(text: str, start: int, end: int, target: int) -> list[tuple[int, int]]:
    """Sub-split one paragraph span that exceeds MAX_CHARS, on sentence
    boundaries, into pieces close to ``target`` size — the same greedy
    accumulation chunk_text's main loop uses, just applied to sentence
    starts instead of paragraph starts. Falls back to a raw character split
    if the span has no sentence-ending punctuation at all, so nothing is
    ever left unbounded regardless of content shape."""
    boundaries = sorted(
        {start, end} | {start + m.end() for m in _SENTENCE_BOUNDARY.finditer(text[start:end])}
    )
    if len(boundaries) <= 2:
        return [(s, min(s + target, end)) for s in range(start, end, target)]

    pieces: list[tuple[int, int]] = []
    cur_start = boundaries[0]
    cur_end = boundaries[0]
    for b in boundaries[1:]:
        if b - cur_start <= target:
            cur_end = b
        else:
            pieces.append((cur_start, cur_end))
            cur_start = cur_end
            cur_end = b
    if cur_end > cur_start:
        pieces.append((cur_start, cur_end))
    return pieces


def _make(ordinal: int, text: str, start: int, end: int) -> Chunk:
    return Chunk(ordinal=ordinal, text=text[start:end].strip(), char_start=start, char_end=end)
