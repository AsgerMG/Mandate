"""What the brief tells the outside world while it works.

A brief takes ~3 minutes (median 184s, measured 2026-07-29) and that is now a
fixed property of the product rather than something to optimise away. So the
progress surface — streamed text, what's being read, and the fact that someone
walked away — is product behaviour, not debug output, and is tested as such.

See project-management/brief-ux-plan.md.
"""

from __future__ import annotations

from etl.intelligence.briefing import source_display_name, sources_digest


class _Row(tuple):
    """Stand-in for a SQLAlchemy row: indexable, which is all the code uses."""


class _FakeSession:
    """Returns fixed Source.name rows for the outlet lookup."""

    def __init__(self, names):
        self._names = list(names)
        self.queries = 0

    def execute(self, _stmt):
        self.queries += 1
        return self

    def all(self):
        return [_Row((n,)) for n in self._names]


def _legal(celex, title, heading="", doc_id=1):
    return {
        "celex": celex,
        "title": title,
        "heading": heading,
        "document_id": doc_id,
        "document_type": "regulation",
    }


def _press(source_key, title="Some long headline about the thing", doc_id=99):
    return {
        "celex": None,
        "title": title,
        "url": f"https://x/{doc_id}",
        "document_id": doc_id,
        "document_type": "press",
        "source_key": source_key,
    }


# --- outlet naming: this is customer-facing copy --------------------------


def test_operator_source_names_become_short_outlet_names():
    """Source.name is written for operators and carries a gloss. On screen the
    customer should see the outlet, not our internal description."""
    assert source_display_name("ARCEP — communiqués de presse (telecoms regulator)") == "ARCEP"
    assert source_display_name("Bundesgerichtshof — Pressemitteilungen") == "Bundesgerichtshof"


def test_a_very_short_acronym_keeps_its_gloss():
    """ "AMF" alone is meaningless to a non-specialist, so the gloss is kept for
    names of 3 characters or fewer and dropped for longer ones like ARCEP, which
    read fine in a list already framed as regulatory coverage."""
    assert source_display_name("AMF — communiqués (financial markets authority)") == (
        "AMF (financial markets authority)"
    )


def test_a_plain_name_passes_through():
    assert source_display_name("Euractiv") == "Euractiv"


# --- the digest: instruments by name, news by outlet ----------------------


def test_instruments_are_named_by_act_not_by_document_title():
    """ "AI Act" is the useful unit for a reader; the official title is not."""
    digest = sources_digest(_FakeSession([]), [_legal("32024R1689", "Regulation (EU) 2024/1689…")])
    assert digest["instruments"][0]["label"] == "AI Act"


def test_press_is_summarised_by_outlet_not_by_headline():
    """Direct user instruction: for news, show a representative source name rather
    than the individual document. A press headline is long, often in another
    language, and says nothing about why it was retrieved."""
    session = _FakeSession(["ARCEP — communiqués de presse (telecoms regulator)", "Euractiv"])
    digest = sources_digest(session, [_press("arcep_presse"), _press("euractiv", doc_id=100)])
    assert digest["outlets"] == ["ARCEP", "Euractiv"]
    assert digest["outlet_items"] == 2
    # No press headline leaks into the named-instrument list.
    assert digest["instruments"] == []


def test_the_two_kinds_are_kept_separate():
    session = _FakeSession(["Euractiv"])
    digest = sources_digest(
        _FakeSession(["Euractiv"]) if session else session,
        [_legal("32016R0679", "GDPR"), _press("euractiv", doc_id=101)],
    )
    assert [i["label"] for i in digest["instruments"]] == ["GDPR"]
    assert digest["outlets"] == ["Euractiv"]


def test_one_row_per_instrument_not_per_passage():
    """The depth pass deliberately returns several passages from the same act — the
    reader should see the act once, not four times."""
    digest = sources_digest(
        _FakeSession([]),
        [_legal("32024R1689", "AI Act", "Art. 6", 1), _legal("32024R1689", "AI Act", "Art. 9", 1)],
    )
    assert digest["instruments_total"] == 1


def test_the_visible_list_is_capped_but_the_total_is_not():
    """A live list of 84 instruments is a firehose; the count is the useful part."""
    passages = [_legal(f"3202{i}R0001", f"Act {i}", doc_id=i) for i in range(9)]
    digest = sources_digest(_FakeSession([]), passages, instruments=5)
    assert len(digest["instruments"]) == 5
    assert digest["instruments_total"] == 9


def test_a_long_title_is_truncated_on_a_word_boundary():
    """A mid-word cut reads as a rendering bug rather than as a deliberate ellipsis."""
    long_title = "Directive on the interoperability of electronic road toll systems " * 2
    digest = sources_digest(_FakeSession([]), [_legal(None, long_title)])
    label = digest["instruments"][0]["label"]
    assert label.endswith("…") and len(label) <= 61
    assert not label[:-1].endswith(" ")


def test_no_outlet_query_when_there_is_no_press():
    """Don't pay for a lookup that can only return nothing."""
    session = _FakeSession([])
    sources_digest(session, [_legal("32016R0679", "GDPR")])
    assert session.queries == 0


# --- readable labels: this list is customer-facing ------------------------


def test_official_eu_titles_lose_their_institutional_preamble():
    """Observed live 2026-07-30: the reading list showed "Proposal for a REGULATION
    OF THE EUROPEAN PARLIAMENT AND…", which buries the subject behind boilerplate
    and reads as raw data leaking into the UI."""
    from etl.intelligence.briefing import readable_instrument_label

    assert (
        readable_instrument_label(
            "Proposal for a REGULATION OF THE EUROPEAN PARLIAMENT AND OF THE COUNCIL "
            "on artificial intelligence and amending certain Union legislative acts"
        )
        == "Regulation on artificial intelligence"
    )


def test_staff_documents_get_a_plain_english_name():
    """Nobody wants to read "COMMISSION STAFF WORKING DOCUMENT IMPACT ASSESSMENT
    Accompanying the document…" in a progress list."""
    from etl.intelligence.briefing import readable_instrument_label

    assert (
        readable_instrument_label(
            "COMMISSION STAFF WORKING DOCUMENT IMPACT ASSESSMENT Accompanying"
        )
        == "Commission impact assessment"
    )
    assert (
        readable_instrument_label("REPORT FROM THE COMMISSION TO THE EUROPEAN PARLIAMENT on X")
        == "Commission report"
    )


def test_a_canonical_short_name_always_wins():
    """KEY_ACTS is the best label there is; the cleaner is only a fallback."""
    digest = sources_digest(_FakeSession([]), [_legal("32024R1689", "REGULATION … on AI")])
    assert digest["instruments"][0]["label"] == "AI Act"


def test_a_title_that_is_already_readable_is_left_alone():
    from etl.intelligence.briefing import readable_instrument_label

    assert (
        readable_instrument_label("Impact of artificial intelligence on the labour market")
        == "Impact of artificial intelligence on the labour market"
    )


# --- a transient overload must not lose a paid brief ----------------------


def test_overload_is_retryable_but_a_bad_request_is_not():
    """A 529 "Overloaded" arrives as an event *inside* the stream, so the SDK's
    request-level retry never sees it — and one killed a real brief on 2026-07-30
    after ~40s of work. A 400 is permanent and must surface immediately rather than
    being retried three times at full cost."""
    from etl.intelligence.briefing import _is_transient

    assert _is_transient(Exception("{'type': 'overloaded_error', 'message': 'Overloaded'}"))
    assert _is_transient(Exception("rate_limit_error"))
    assert not _is_transient(Exception("invalid_request_error: max_tokens too large"))


def test_status_codes_are_classified_too():
    from etl.intelligence.briefing import _is_transient

    class _Exc(Exception):
        status_code = 529

    class _Bad(Exception):
        status_code = 400

    assert _is_transient(_Exc())
    assert not _is_transient(_Bad())
