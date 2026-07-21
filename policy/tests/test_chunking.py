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
