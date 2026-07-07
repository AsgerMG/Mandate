"""Feed adapter — parsing, filtering, and registry integrity. No network."""

from __future__ import annotations

import datetime as dt

from etl.adapters import ADAPTERS, ADAPTERS_BY_KEY
from etl.adapters.feeds import (
    FEED_ADAPTERS,
    FEED_SPECS,
    is_tech_relevant,
    parse_feed,
)

RSS = b"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Test</title>
<item>
  <title>New AI Act guidance published</title>
  <link>https://example.eu/ai-guidance</link>
  <guid>guid-1</guid>
  <description>&lt;p&gt;Guidance on &lt;b&gt;high-risk&lt;/b&gt; systems.&lt;/p&gt;</description>
  <pubDate>Thu, 02 Jul 2026 10:00:00 GMT</pubDate>
</item>
<item>
  <title>Fisheries quota agreed</title>
  <link>https://example.eu/fish</link>
  <guid>guid-2</guid>
  <description>Cod and haddock.</description>
  <pubDate>Wed, 01 Jul 2026 10:00:00 GMT</pubDate>
</item>
</channel></rss>"""

ATOM = b"""<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Test</title>
  <entry>
    <title>Datenschutz im Fokus</title>
    <id>tag:example.de,2026:1</id>
    <link href="https://example.de/datenschutz"/>
    <summary>DSGVO-Update.</summary>
    <updated>2026-07-01T09:30:00Z</updated>
  </entry>
</feed>"""

LATIN = """<?xml version='1.0' encoding='iso-8859-15'?>
<rss version='2.0'><channel><title>Sénat</title>
<item><title>Régulation numérique - texte N° 843</title>
<link>https://senat.fr/843</link>
<pubDate>Thu,02 Jul 2026 12:15:25 GMT</pubDate>
<description>Proposition de loi</description></item>
</channel></rss>""".encode("iso-8859-15")


def test_parse_rss_items():
    items = parse_feed(RSS)
    assert len(items) == 2
    assert items[0]["id"] == "guid-1"
    assert items[0]["url"] == "https://example.eu/ai-guidance"
    assert items[0]["date"] == dt.date(2026, 7, 2)


def test_parse_atom_entries():
    items = parse_feed(ATOM)
    assert len(items) == 1
    assert items[0]["title"] == "Datenschutz im Fokus"
    assert items[0]["url"] == "https://example.de/datenschutz"
    assert items[0]["date"] == dt.date(2026, 7, 1)


def test_parse_respects_declared_encoding():
    items = parse_feed(LATIN)
    assert items[0]["title"] == "Régulation numérique - texte N° 843"


def test_tech_filter_multilingual():
    assert is_tech_relevant("New AI Act guidance published")
    assert is_tech_relevant("Régulation du numérique en France")
    assert is_tech_relevant("Datenschutz: neue DSGVO-Leitlinien")
    assert not is_tech_relevant("Fisheries quota agreed for cod")


def test_feed_adapter_parse_produces_document():
    adapter_cls = ADAPTERS_BY_KEY["edpb_news"]
    adapter = adapter_cls(http=None, settings=None)
    refs = []

    class FakeResp:
        content = RSS
        headers = {}  # no content-type -> deep-fetch enrichment no-ops cleanly

    adapter.http = type("H", (), {"get": lambda self, url, **kw: FakeResp()})()
    refs = list(adapter.discover(None, None))
    assert len(refs) == 2  # edpb feed is unfiltered

    raw = adapter.fetch(refs[0])
    doc = adapter.parse(raw)
    assert doc.title == "New AI Act guidance published"
    assert "high-risk" in doc.text and "<b>" not in doc.text
    assert doc.jurisdiction.value == "EU"
    assert doc.date_document == dt.date(2026, 7, 2)


def test_filtered_adapter_drops_offtopic():
    adapter_cls = ADAPTERS_BY_KEY["ep_press"]  # filter_tech=True
    adapter = adapter_cls(http=None, settings=None)

    class FakeResp:
        content = RSS
        headers = {}  # no content-type -> deep-fetch enrichment no-ops cleanly

    adapter.http = type("H", (), {"get": lambda self, url, **kw: FakeResp()})()
    refs = list(adapter.discover(None, None))
    assert [r.title for r in refs] == ["New AI Act guidance published"]


def test_registry_covers_three_jurisdictions_with_unique_keys():
    keys = [a.key for a in ADAPTERS]
    assert len(keys) == len(set(keys))
    juris = {s.jurisdiction.value for s in FEED_SPECS}
    assert juris == {"EU", "FR", "DE"}
    assert len(FEED_ADAPTERS) == len(FEED_SPECS)
