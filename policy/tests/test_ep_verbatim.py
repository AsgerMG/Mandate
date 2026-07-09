"""EP verbatim (CRE) adapter — item splitting, relevance filtering, cursor."""

from __future__ import annotations

import json

from etl.adapters import ep_verbatim as ev

# A trimmed real fragment (captured live 2026-07-09 from a rendered CRE day
# page) covering three agenda items: a chair's procedural opening (item 12,
# off-topic), a tech-relevant debate (item 13) with a rapporteur speech that
# links to its OEIL procedure, and an unrelated debate (item 14) whose title
# contains a substring collision ("citizenship" contains "chip") to prove
# title-only matching doesn't get fooled by it.
OEIL_HREF = "https://oeil.secure.europarl.europa.eu/oeil/popups/ficheprocedure.do"
SAMPLE_HTML = f"""
<html><body>
<a name="title12"></a><a name="creitem12"></a>
<table><tr><td class="doc_title">12. Resumption of the sitting</td></tr></table>
<p class="contents"><span class="doc_subtitle_level1_bis">
<span class="bold">President. </span></span>
<span class="bold">.</span> &#8211; The sitting is resumed.</p>

<a name="title13"></a><a name="creitem13"></a>
<table><tr><td class="doc_title">13. Rules for innovative companies (debate)</td></tr></table>
<p class="contents"><span class="doc_subtitle_level1_bis">
<span class="bold">Przewodnicząca. </span></span>
<span class="bold">.</span> &#8211; Next item is the report by René Repasi (
<a href="{OEIL_HREF}?lang=en&amp;reference=2025/2079(INL)">2025/2079(INL)</a>).</p>
<p class="contents"><span class="doc_subtitle_level1_bis">
<span class="bold">René Repasi, </span></span>
<span class="italic">Rapporteur</span><span class="bold">.</span>
&#8211; This digital regime helps firms.</p>
<p class="contents">It also cuts red tape for scale-ups.</p>

<a name="title14"></a><a name="creitem14"></a>
<table><tr><td class="doc_title">14. Human rights and citizenship</td></tr></table>
<p class="contents"><span class="doc_subtitle_level1_bis">
<span class="bold">President. </span></span>
<span class="bold">.</span> &#8211; This item has no tech content at all.</p>
</body></html>
"""


def test_split_items_extracts_titles_speakers_and_procedure_refs():
    items = ev._split_items(SAMPLE_HTML)

    assert items[12]["title"] == "Resumption of the sitting"
    assert items[13]["title"] == "Rules for innovative companies (debate)"

    speakers = items[13]["speakers"]
    # Two names, not three — the unmarked continuation paragraph must merge
    # into René Repasi's turn, not mint an "Unknown speaker" entry (the bug
    # found live 2026-07-09: a speech split across several <p class=
    # "contents"> tags only carries the name span on the first one).
    assert [s["name"] for s in speakers] == ["Przewodnicząca.", "René Repasi"]
    rapporteur = speakers[1]
    assert rapporteur["role"] == "Rapporteur"
    assert "digital regime" in rapporteur["text"]
    assert "red tape for scale-ups" in rapporteur["text"]

    assert items[13]["procedure_refs"] == ["2025/2079(INL)"]
    assert items[12]["procedure_refs"] == []


def test_term_for_date():
    import datetime as dt

    assert ev._term_for(dt.date(2024, 6, 30)) == "9"
    assert ev._term_for(dt.date(2024, 7, 1)) == "10"
    assert ev._term_for(dt.date(2026, 1, 19)) == "10"


class FakeHttp:
    """Serves one page of /meetings, empty thereafter — mirrors FakeHttp in
    test_oeil.py."""

    def __init__(self, rows):
        self.rows = rows
        self.calls = 0

    def get(self, url, **kw):
        self.calls += 1
        payload = {"data": self.rows if self.calls == 1 else []}

        class R:
            def json(self_inner):
                return payload

        return R()


MEETING_ROW = {
    "activity_id": "MTG-PL-2026-01-19",
    "activity_date": "2026-01-19",
    "consists_of": [
        "eli/dl/event/MTG-PL-2026-01-19-PVCRE-ITM-12",
        "eli/dl/event/MTG-PL-2026-01-19-PVCRE-ITM-13",
    ],
}


def test_discover_filters_to_tech_relevant_items(monkeypatch):
    monkeypatch.setattr(ev, "_render_day", lambda url: SAMPLE_HTML)
    adapter = ev.EpVerbatimAdapter(http=FakeHttp([MEETING_ROW]), settings=None)

    refs = list(adapter.discover(None, None))

    assert [r.external_id for r in refs] == ["CRE-10-2026-01-19-ITM-013"]
    assert refs[0].hint == {"date": "2026-01-19", "number": 13}
    # Item 12 (no tech content) and item 14 (title contains "citizenship",
    # which contains "chip" as a bare substring — regression coverage for
    # the 2026-07-09 false-positive fix: title-only matching must not be
    # fooled by an unrelated word containing a keyword as a substring)
    # were both judged off-topic and cached, not yielded.
    cursor = adapter.next_cursor(None, [])
    assert "CRE-10-2026-01-19-ITM-012" in cursor["offtopic"]
    assert "CRE-10-2026-01-19-ITM-014" in cursor["offtopic"]


def test_fetch_and_parse_round_trip(monkeypatch):
    monkeypatch.setattr(ev, "_render_day", lambda url: SAMPLE_HTML)
    adapter = ev.EpVerbatimAdapter(http=FakeHttp([MEETING_ROW]), settings=None)
    ref = next(iter(adapter.discover(None, None)))

    raw = adapter.fetch(ref)
    payload = json.loads(raw.content)
    assert payload["number"] == 13

    doc = adapter.parse(raw)
    assert doc is not None
    assert doc.extra["procedure_references"] == ["2025/2079(INL)"]
    assert doc.extra["speaker_count"] == 2
    assert "René Repasi (Rapporteur) —" in doc.text


def test_parse_returns_none_when_render_failed():
    adapter = ev.EpVerbatimAdapter(http=FakeHttp([]), settings=None)
    import datetime as dt

    from etl.adapters.base import DocRef, RawDocument

    ref = DocRef(external_id="x", url="u", hint={"date": "2026-01-19", "number": 99})
    raw = RawDocument(
        ref=ref,
        content=json.dumps({"date": "2026-01-19", "number": 99, "item": {}}).encode(),
        content_type="application/json",
        fetched_at=dt.datetime.now(dt.UTC),
    )
    assert adapter.parse(raw) is None
