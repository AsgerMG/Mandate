from etl.chunking import chunk_text


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
