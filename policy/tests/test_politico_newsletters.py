"""Politico newsletter-archive adapter — listing parsing, pagination cutoff,
issue fetch/parse round trip."""

from __future__ import annotations

import datetime as dt

import httpx

from etl.adapters import politico_newsletters as pn

# Trimmed real markup (captured live 2026-07-22 from Brussels Playbook's
# listing page): two genuine issue cards plus the two link shapes that must
# NOT be mistaken for an issue (the paginated "page/2/" link, the "feed/" link).
_BASE = "https://www.politico.eu/newsletter/brussels-playbook"

LISTING_PAGE_1 = f"""
<html><body>
<div class="article-card card__layout--newsletter">
  <h3 class="card__title">
    <a href="{_BASE}/athens-holds-out-on-lng-sanctions/">Athens holds out on LNG sanctions</a>
  </h3>
  <div class="date-time after-title"><span class="date-time__date">July 20, 2026</span></div>
</div>
<div class="article-card card__layout--newsletter">
  <h3 class="card__title">
    <a href="{_BASE}/shadow-over-gdansk/">Shadow over Gdansk</a>
  </h3>
  <div class="date-time after-title"><span class="date-time__date">July 17, 2026</span></div>
</div>
<a href="{_BASE}/feed/">feed</a>
<a href="{_BASE}/page/2/">2</a>
</body></html>
"""

LISTING_PAGE_2_EMPTY = "<html><body>no more issues</body></html>"

ISSUE_HTML = """
<html><head>
<script>{"@type":"NewsArticle","dateCreated":"2026-07-20T04:42:26Z","datePublished":"2026-07-20T04:42:26Z","dateModified":"2026-07-20T04:42:32Z"}</script>
</head><body>
<h1 class="hero__title">Athens holds out on LNG sanctions</h1>
<div class="sidebar-grid__content article__content">
<p>
  GREETINGS. It's Nick Vinocur, reporting live from a Coreper meeting where
  named diplomats clashed over sanctions.
</p>
</div>
</body></html>
"""


def test_parse_listing_extracts_issues_and_skips_feed_and_page_links():
    issues = pn._parse_listing(LISTING_PAGE_1, "brussels-playbook")

    assert [i["slug"] for i in issues] == [
        "athens-holds-out-on-lng-sanctions",
        "shadow-over-gdansk",
    ]
    assert issues[0]["date"] == dt.date(2026, 7, 20)
    assert issues[0]["title"] == "Athens holds out on LNG sanctions"


class FakeHttp:
    def __init__(self, pages: dict[str, str], issue_html: str):
        self.pages = pages
        self.issue_html = issue_html

    def get(self, url, **kw):
        class R:
            pass

        r = R()
        if url in self.pages:
            r.text = self.pages[url]
        else:
            r.text = self.issue_html
            r.content = self.issue_html.encode("utf-8")
        return r


def _adapter(http):
    cls = type(
        "PoliticoNewsletter_test",
        (pn.PoliticoNewsletterAdapter,),
        {"spec": pn.NEWSLETTER_SPECS[0], "key": "politico_brussels_playbook"},
    )
    return cls(http=http, settings=None)


def test_discover_stops_pagination_on_empty_page():
    pages = {
        pn._listing_url("brussels-playbook", 1): LISTING_PAGE_1,
        pn._listing_url("brussels-playbook", 2): LISTING_PAGE_2_EMPTY,
    }
    adapter = _adapter(FakeHttp(pages, ISSUE_HTML))

    refs = list(adapter.discover(None, None))

    assert len(refs) == 2
    assert refs[0].external_id == "POLITICO-brussels-playbook-athens-holds-out-on-lng-sanctions"


class FakeHttp404(FakeHttp):
    """Some newsletters (confirmed live: Forecast) return a real 404 past
    the last page instead of HTTP 200 with zero article-cards."""

    def get(self, url, **kw):
        if url == pn._listing_url("brussels-playbook", 2):
            raise httpx.HTTPStatusError(
                "404", request=httpx.Request("GET", url), response=httpx.Response(404)
            )
        return super().get(url, **kw)


def test_discover_treats_404_as_end_of_pagination():
    pages = {pn._listing_url("brussels-playbook", 1): LISTING_PAGE_1}
    adapter = _adapter(FakeHttp404(pages, ISSUE_HTML))

    refs = list(adapter.discover(None, None))

    assert len(refs) == 2


def test_discover_respects_since_cutoff():
    pages = {
        pn._listing_url("brussels-playbook", 1): LISTING_PAGE_1,
        pn._listing_url("brussels-playbook", 2): LISTING_PAGE_2_EMPTY,
    }
    adapter = _adapter(FakeHttp(pages, ISSUE_HTML))

    refs = list(adapter.discover(dt.date(2026, 7, 19), None))

    # Only the newer issue clears the cutoff; pagination stops the moment an
    # older issue is seen (listings are newest-first).
    assert len(refs) == 1
    assert refs[0].external_id == "POLITICO-brussels-playbook-athens-holds-out-on-lng-sanctions"


def test_discover_skips_known_ids():
    pages = {
        pn._listing_url("brussels-playbook", 1): LISTING_PAGE_1,
        pn._listing_url("brussels-playbook", 2): LISTING_PAGE_2_EMPTY,
    }
    adapter = _adapter(FakeHttp(pages, ISSUE_HTML))
    cursor = {"known_ids": ["POLITICO-brussels-playbook-athens-holds-out-on-lng-sanctions"]}

    refs = list(adapter.discover(None, cursor))

    assert [r.external_id for r in refs] == ["POLITICO-brussels-playbook-shadow-over-gdansk"]


def test_fetch_and_parse_round_trip():
    pages = {pn._listing_url("brussels-playbook", 1): LISTING_PAGE_1}
    adapter = _adapter(FakeHttp(pages, ISSUE_HTML))
    ref = next(iter(adapter.discover(None, None)))

    raw = adapter.fetch(ref)
    doc = adapter.parse(raw)

    assert doc is not None
    assert doc.title == "Athens holds out on LNG sanctions"
    assert doc.date_document == dt.date(2026, 7, 20)
    assert doc.jurisdiction.value == "EU"
    assert "Coreper meeting" in doc.text


def test_parse_falls_back_to_listing_date_when_datepublished_missing():
    pages = {pn._listing_url("brussels-playbook", 1): LISTING_PAGE_1}
    adapter = _adapter(FakeHttp(pages, ISSUE_HTML))
    ref = next(iter(adapter.discover(None, None)))

    html_no_date = ISSUE_HTML.replace(
        '<script>{"@type":"NewsArticle","dateCreated":"2026-07-20T04:42:26Z",'
        '"datePublished":"2026-07-20T04:42:26Z","dateModified":"2026-07-20T04:42:32Z"}</script>',
        "",
    )
    raw = adapter.fetch(ref)
    raw.content = html_no_date.encode("utf-8")

    doc = adapter.parse(raw)
    assert doc.date_document == dt.date(2026, 7, 20)  # from ref.hint, not the page


def test_next_cursor_accumulates_known_ids():
    adapter = _adapter(FakeHttp({}, ISSUE_HTML))
    from etl.adapters.base import DocRef

    seen = [DocRef(external_id="POLITICO-brussels-playbook-a", url="u")]
    cursor = adapter.next_cursor({"known_ids": ["POLITICO-brussels-playbook-b"]}, seen)

    assert cursor["known_ids"] == [
        "POLITICO-brussels-playbook-a",
        "POLITICO-brussels-playbook-b",
    ]
