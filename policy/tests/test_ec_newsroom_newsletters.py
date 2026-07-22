"""EC Newsroom DG newsletter-archive adapter — listing parsing, pagination
cutoff, and item extraction from the old-style HTML-email issue markup."""

from __future__ import annotations

import datetime as dt

import httpx

from etl.adapters import ec_newsroom_newsletters as ecn

# Trimmed real markup (captured live 2026-07-22): the listing table has both
# a visible row (Date + Subject columns) and a hidden accordion detail row
# per issue — only the visible row carries the data-ecl-table-header cells
# this parser keys off of.
_ISSUE_URL = "https://ec.europa.eu/newsroom/dae/newsletter-archives/{id}"

LISTING_PAGE_1 = f"""
<html><body><table>
<tr class="ecl-table__row">
  <td data-ecl-table-header="Date" class="ecl-table__cell">
    <a href="{_ISSUE_URL.format(id="77821")}">20/07/2026</a>
  </td>
  <td data-ecl-table-header="Subject" class="ecl-table__cell">
    <a href="{_ISSUE_URL.format(id="77821")}">Shaping Europe's Digital Future</a>
  </td>
</tr>
<tr style="display:none;"><td colspan="4">hidden accordion row, no data cells</td></tr>
<tr class="ecl-table__row">
  <td data-ecl-table-header="Date" class="ecl-table__cell">
    <a href="{_ISSUE_URL.format(id="77078")}">30/06/2026</a>
  </td>
  <td data-ecl-table-header="Subject" class="ecl-table__cell">
    <a href="{_ISSUE_URL.format(id="77078")}">Shaping Europe's Digital Future</a>
  </td>
</tr>
</table></body></html>
"""

LISTING_PAGE_2_EMPTY = "<html><body><table></table></body></html>"

# Real per-item markup shape from a DG COMP weekly issue: section headers
# (h3.comet-main-title) followed by item title/text pairs, in document order.
ISSUE_HTML = """
<html><body>
<h1>Shaping Europe's Digital Future</h1>
<h3 class="comet-main-title">Antitrust</h3>
<h4 class="comet-item-title">Commission imposes interim measures on Meta</h4>
<span class="comet-item-text">
  The European Commission has ordered Meta to restore free access to WhatsApp.
</span>
<h3 class="comet-main-title">State aid</h3>
<h5 class="comet-item-title">Commission approves Italian State aid scheme</h5>
<span class="comet-item-text">The Commission approved a renewable-electricity aid scheme.</span>
</body></html>
"""


def test_parse_listing_extracts_only_visible_rows():
    issues = ecn._parse_listing(LISTING_PAGE_1)

    assert [i["id"] for i in issues] == ["77821", "77078"]
    assert issues[0]["date"] == dt.date(2026, 7, 20)
    assert issues[1]["date"] == dt.date(2026, 6, 30)


def test_extract_issue_text_preserves_section_order():
    text = ecn._extract_issue_text(ISSUE_HTML)

    assert text.index("Antitrust") < text.index("Commission imposes interim measures on Meta")
    assert text.index("Commission imposes interim measures on Meta") < text.index("State aid")
    assert "restore free access to WhatsApp" in text
    assert "renewable-electricity aid scheme" in text


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
        "EcNewsroomNewsletter_test",
        (ecn.EcNewsroomNewsletterAdapter,),
        {"spec": ecn.NEWSLETTER_SPECS[0], "key": "ec_newsroom_dae"},
    )
    return cls(http=http, settings=None)


def test_discover_stops_pagination_on_empty_page():
    pages = {
        ecn._listing_url("dae", 2029, 1): LISTING_PAGE_1,
        ecn._listing_url("dae", 2029, 2): LISTING_PAGE_2_EMPTY,
    }
    adapter = _adapter(FakeHttp(pages, ISSUE_HTML))

    refs = list(adapter.discover(None, None))

    assert [r.external_id for r in refs] == ["EC-NEWSROOM-dae-77821", "EC-NEWSROOM-dae-77078"]


class FakeHttp404(FakeHttp):
    """Not every DG confirmed the clean 200-with-zero-rows termination live —
    treat a real 404 past the last page the same way, defensively."""

    def get(self, url, **kw):
        if url == ecn._listing_url("dae", 2029, 2):
            raise httpx.HTTPStatusError(
                "404", request=httpx.Request("GET", url), response=httpx.Response(404)
            )
        return super().get(url, **kw)


def test_discover_treats_404_as_end_of_pagination():
    pages = {ecn._listing_url("dae", 2029, 1): LISTING_PAGE_1}
    adapter = _adapter(FakeHttp404(pages, ISSUE_HTML))

    refs = list(adapter.discover(None, None))

    assert [r.external_id for r in refs] == ["EC-NEWSROOM-dae-77821", "EC-NEWSROOM-dae-77078"]


def test_discover_respects_since_cutoff():
    pages = {
        ecn._listing_url("dae", 2029, 1): LISTING_PAGE_1,
        ecn._listing_url("dae", 2029, 2): LISTING_PAGE_2_EMPTY,
    }
    adapter = _adapter(FakeHttp(pages, ISSUE_HTML))

    refs = list(adapter.discover(dt.date(2026, 7, 1), None))

    assert [r.external_id for r in refs] == ["EC-NEWSROOM-dae-77821"]


def test_discover_skips_known_ids():
    pages = {
        ecn._listing_url("dae", 2029, 1): LISTING_PAGE_1,
        ecn._listing_url("dae", 2029, 2): LISTING_PAGE_2_EMPTY,
    }
    adapter = _adapter(FakeHttp(pages, ISSUE_HTML))
    cursor = {"known_ids": ["EC-NEWSROOM-dae-77821"]}

    refs = list(adapter.discover(None, cursor))

    assert [r.external_id for r in refs] == ["EC-NEWSROOM-dae-77078"]


def test_fetch_and_parse_round_trip():
    pages = {ecn._listing_url("dae", 2029, 1): LISTING_PAGE_1}
    adapter = _adapter(FakeHttp(pages, ISSUE_HTML))
    ref = next(iter(adapter.discover(None, None)))

    raw = adapter.fetch(ref)
    doc = adapter.parse(raw)

    assert doc is not None
    assert doc.title == "Shaping Europe's Digital Future"
    assert doc.date_document == dt.date(2026, 7, 20)
    assert doc.jurisdiction.value == "EU"
    assert "restore free access to WhatsApp" in doc.text


def test_next_cursor_accumulates_known_ids():
    adapter = _adapter(FakeHttp({}, ISSUE_HTML))
    from etl.adapters.base import DocRef

    seen = [DocRef(external_id="EC-NEWSROOM-dae-1", url="u")]
    cursor = adapter.next_cursor({"known_ids": ["EC-NEWSROOM-dae-2"]}, seen)

    assert cursor["known_ids"] == ["EC-NEWSROOM-dae-1", "EC-NEWSROOM-dae-2"]
