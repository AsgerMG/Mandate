from etl.chunking import MAX_CHARS, chunk_text


def test_empty_text_yields_no_chunks():
    assert chunk_text("") == []
    assert chunk_text("   \n  ") == []


def test_offsets_map_back_to_source():
    text = "Article 1.\n\n" + ("Lorem ipsum dolor sit amet. " * 80) + "\n\nFinal clause."
    chunks = chunk_text(text)
    assert chunks
    for c in chunks:
        # The stored text must be exactly the source slice (modulo edge strip).
        assert text[c.char_start : c.char_end].strip() == c.text


def test_ordinals_are_contiguous():
    text = "\n\n".join(f"Paragraph number {i} with some filler text." * 10 for i in range(20))
    chunks = chunk_text(text)
    assert [c.ordinal for c in chunks] == list(range(len(chunks)))


def test_short_text_is_single_chunk():
    chunks = chunk_text("A single short paragraph.")
    assert len(chunks) == 1
    assert chunks[0].text == "A single short paragraph."


def test_oversized_single_paragraph_is_split_and_bounded():
    # No blank lines at all — the paragraph-atomic rule alone would keep
    # this as one arbitrarily large chunk, diluting its embedding across
    # multiple distinct legal points (a run-on recital, an annex without
    # blank-line breaks).
    sentence = "This sentence describes one obligation among several. "
    text = sentence * 60  # well past MAX_CHARS, plenty of sentence breaks
    chunks = chunk_text(text)
    assert len(chunks) > 1
    for c in chunks:
        assert c.char_end - c.char_start <= MAX_CHARS
        # offsets must still map back exactly to the source
        assert text[c.char_start : c.char_end].strip() == c.text


def test_oversized_paragraph_with_no_punctuation_falls_back_to_hard_split():
    # Pathological case: no blank lines AND no sentence-ending punctuation
    # at all — must still never produce an unbounded chunk.
    text = "x" * 5000
    chunks = chunk_text(text)
    assert len(chunks) > 1
    for c in chunks:
        assert c.char_end - c.char_start <= MAX_CHARS
        assert text[c.char_start : c.char_end] == c.text


# --- overlap --------------------------------------------------------------
# OVERLAP_CHARS was dead code: `cur_start = max(cur_end - overlap, start)` took
# `start` from the NEXT span, which is always >= cur_end, so max() always chose
# it. Verified empirically against production: boundaries had a 2-character GAP,
# never 200 characters of overlap — in a system whose whole premise is
# citation-grounded retrieval. These are the assertions the 6 existing tests
# never made.


def _multi_chunk_text() -> str:
    # Paragraphs small enough to accumulate, numerous enough to force several
    # chunk boundaries at the default 1500-char target.
    return "\n\n".join(f"Paragraph {i}. " + ("filler words here. " * 20) for i in range(20))


def test_consecutive_chunks_actually_overlap():
    text = _multi_chunk_text()
    chunks = chunk_text(text)
    assert len(chunks) > 2, "need several boundaries to test overlap at all"
    for prev, nxt in zip(chunks, chunks[1:], strict=False):
        assert nxt.char_start < prev.char_end, (
            f"chunk {nxt.ordinal} starts at {nxt.char_start}, at or after the end of "
            f"chunk {prev.ordinal} ({prev.char_end}) — that is a gap, not an overlap"
        )


def test_overlap_is_the_requested_number_of_characters():
    text = _multi_chunk_text()
    chunks = chunk_text(text, overlap=200)
    for prev, nxt in zip(chunks, chunks[1:], strict=False):
        overlap = prev.char_end - nxt.char_start
        # Exactly `overlap`, unless the previous chunk was itself shorter than
        # that — the rewind is clamped to the previous chunk's own start.
        assert overlap == min(200, prev.char_end - prev.char_start)


def test_overlapping_text_is_shared_between_neighbours():
    """The point of overlap: a span at a boundary must appear in BOTH chunks,
    so a sentence straddling it is still retrievable whole."""
    text = _multi_chunk_text()
    chunks = chunk_text(text, overlap=200)
    prev, nxt = chunks[0], chunks[1]
    shared = text[nxt.char_start : prev.char_end]
    assert shared.strip(), "boundary region is empty — nothing is actually shared"
    assert shared.strip() in prev.text
    assert shared.strip() in nxt.text


def test_zero_overlap_produces_no_overlap():
    chunks = chunk_text(_multi_chunk_text(), overlap=0)
    for prev, nxt in zip(chunks, chunks[1:], strict=False):
        assert nxt.char_start >= prev.char_end


def test_overlap_does_not_break_the_size_ceiling():
    # Rewinding the start of each chunk widens it; it must still stay bounded.
    text = _multi_chunk_text()
    for c in chunk_text(text, overlap=200):
        assert c.char_end - c.char_start <= MAX_CHARS


def test_overlap_preserves_offset_fidelity():
    text = _multi_chunk_text()
    for c in chunk_text(text, overlap=200):
        assert text[c.char_start : c.char_end].strip() == c.text
