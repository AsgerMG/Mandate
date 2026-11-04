"""AN verbatim (compte rendu de séance) adapter — item splitting, filtering."""

from __future__ import annotations

import datetime as dt
import json

from etl.adapters import an_verbatim as av

# A trimmed real fragment (captured live 2026-07-09 from a real sitting
# page): a non-numbered "chair announcement" header (must NOT be mistaken
# for a numbered item), a numbered item on algorithmic surveillance, two
# speech turns, and an unrelated item (3) whose title carries no tech
# keyword even though a speaker happens to mention one — regression
# coverage for the 2026-07-09 false-positive fix (speaker text is no longer
# scanned for relevance at all, title only).
SAMPLE_HTML = """
<html><head><title>Compte rendu de la séance du mardi 07 juillet 2026</title></head>
<body>
<div class="crs-inter _mt-none" id="1">
<h2 class="presidence"><span>Présidence de Mme la présidente</span></h2>
</div>
<div class="crs-inter" id="2">
<h2 class="presidence"><span>1.</span>
<span>Encadrement de la surveillance algorithmique dans l'espace public</span></h2>
</div>
<div class="crs-inter" id="3">
<p class="orateur"><span>M. Laurent Nuñez, ministre de l'intérieur</span></p>
<p class="">Ce texte encadre l'usage de la surveillance algorithmique.</p>
</div>
<div class="crs-inter" id="4">
<p class="orateur"><span>M. Ugo Bernalicis</span></p>
<p class="">La tranquillité avec la présomption de légitime défense !</p>
</div>
<div class="crs-inter" id="5">
<h2 class="presidence"><span>2.</span>
<span>Questions au gouvernement</span></h2>
</div>
<div class="crs-inter" id="6">
<p class="orateur"><span>M. David Magnier</span></p>
<p class="">Ma question porte sur l'intelligence artificielle en agriculture.</p>
</div>
</body></html>
"""


def test_split_an_items_skips_chair_header_and_collects_speeches():
    items = av._split_an_items(SAMPLE_HTML)

    assert list(items.keys()) == [1, 2]
    assert items[1]["title"] == "Encadrement de la surveillance algorithmique dans l'espace public"
    names = [s["name"] for s in items[1]["speakers"]]
    assert names == ["M. Laurent Nuñez, ministre de l'intérieur", "M. Ugo Bernalicis"]
    assert "surveillance algorithmique" in items[1]["speakers"][0]["text"]
    assert items[2]["title"] == "Questions au gouvernement"


def test_parse_fr_date():
    assert av._parse_fr_date("Compte rendu du mardi 07 juillet 2026") == dt.date(2026, 7, 7)
    assert av._parse_fr_date("no date here") is None


class FakeHttp:
    def __init__(self, listing_html: str, sitting_html: str):
        self.listing_html = listing_html
        self.sitting_html = sitting_html

    def get(self, url, **kw):
        prior_year_urls = {
            f"https://www.assemblee-nationale.fr/dyn/{av.LEGISLATURE}/comptes-rendus/seance/{g}"
            for g in av.PRIOR_YEAR_GROUPS
        }
        if url == av.LISTING_URL:
            html = self.listing_html
        elif url in prior_year_urls:
            html = ""  # no additional sittings in these fixtures
        else:
            html = self.sitting_html

        class R:
            text = html

        return R()


LISTING_HTML = (
    '<a href="/dyn/17/comptes-rendus/seance/session-x/seance-du-mardi-07-juillet-2026">x</a>'
    '<a href="/dyn/17/comptes-rendus/seance/session-x/seance-du-mardi-07-juillet-2026.pdf">pdf</a>'
    '<a href="/dyn/17/comptes-rendus/seance/session-x">group index, no leaf</a>'
)


def test_discover_yields_relevant_items_and_skips_chair_header(monkeypatch):
    http = FakeHttp(LISTING_HTML, SAMPLE_HTML)
    adapter = av.AnVerbatimAdapter(http=http, settings=None)

    refs = list(adapter.discover(None, None))

    # Item 2 ("Questions au gouvernement") is excluded despite a speaker
    # mentioning "intelligence artificielle" — title alone decides now.
    assert len(refs) == 1
    assert refs[0].external_id == "AN-17-session-x/seance-du-mardi-07-juillet-2026-ITM-001"
    assert refs[0].hint == {"path": "session-x/seance-du-mardi-07-juillet-2026", "number": 1}
    cursor = adapter.next_cursor(None, [])
    assert "AN-17-session-x/seance-du-mardi-07-juillet-2026-ITM-002" in cursor["offtopic"]


def test_fetch_and_parse_round_trip():
    http = FakeHttp(LISTING_HTML, SAMPLE_HTML)
    adapter = av.AnVerbatimAdapter(http=http, settings=None)
    ref = next(iter(adapter.discover(None, None)))

    raw = adapter.fetch(ref)
    payload = json.loads(raw.content)
    assert payload["date"] == "2026-07-07"

    doc = adapter.parse(raw)
    assert doc is not None
    assert doc.jurisdiction.value == "FR"
    assert doc.extra["speaker_count"] == 2
    assert "M. Laurent Nuñez, ministre de l'intérieur —" in doc.text


def test_processed_sittings_cursor_prevents_reprocessing():
    http = FakeHttp(LISTING_HTML, SAMPLE_HTML)
    adapter = av.AnVerbatimAdapter(http=http, settings=None)
    list(adapter.discover(None, None))
    cursor = adapter.next_cursor(None, [])

    adapter2 = av.AnVerbatimAdapter(http=http, settings=None)
    refs = list(adapter2.discover(None, cursor))
    assert refs == []


class FlakyHttp(FakeHttp):
    """One sitting's fetch raises (a transient 503, seen live 2026-07-09);
    everything else behaves normally."""

    def get(self, url, **kw):
        if url == av.SITTING_URL.format(path="session-x/seance-du-mardi-07-juillet-2026"):
            raise RuntimeError("503 Backend fetch failed")
        return super().get(url, **kw)


def test_discover_survives_one_sitting_fetch_failure():
    http = FlakyHttp(LISTING_HTML, SAMPLE_HTML)
    adapter = av.AnVerbatimAdapter(http=http, settings=None)

    # Must not raise — a transient failure on one sitting is skipped, not
    # fatal to the whole run (previously, an unhandled exception inside the
    # discover() generator would abort every remaining sitting too).
    refs = list(adapter.discover(None, None))
    assert refs == []

    # Not marked processed, so it's retried on the next run rather than
    # silently skipped forever.
    cursor = adapter.next_cursor(None, [])
    assert "session-x/seance-du-mardi-07-juillet-2026" not in cursor["processed_sittings"]
