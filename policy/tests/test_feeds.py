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


# --- CELEX recovery from EUR-Lex feed titles -------------------------------
# All 23 documents in eurlex_oj_l and eurlex_ep_council_legislation — every new
# EU act published in ~6 weeks — were typed OTHER with celex IS NULL, despite
# the CELEX being printed in the title. Two-sided miss: the adapter never
# populated documents.celex, so reclassify_celex_documents (WHERE celex IS NOT
# NULL) skipped them; and neither source key reached _classify_by_source. No
# type meant no lifecycle dates, no summary, and competing against blog posts
# in _DEEPEN_QUOTAS' OTHER tier instead of the binding-law tier.

# The real live title format.
OJ_L_TITLE = (
    "CELEX:32026R1881: Regulation (EU) 2026/1881 of the European Parliament "
    "and of the Council of 8 July 2026 on data governance"
)


def _feed_raw(key: str, title: str, url: str = "https://eur-lex.europa.eu/x"):
    """A RawDocument shaped exactly as FeedAdapter.fetch() produces one."""
    import json as _json

    from etl.adapters.base import DocRef, RawDocument

    item = {"id": url, "url": url, "title": title, "summary": "Body text.", "date": ""}
    ref = DocRef(external_id=url, url=url, title=title, hint={"item": item})
    return RawDocument(
        ref=ref,
        content=_json.dumps(item).encode(),
        content_type="application/json",
        fetched_at=dt.datetime.now(dt.UTC),
    )


def test_feed_parse_extracts_celex_from_an_eurlex_title():
    adapter = ADAPTERS_BY_KEY["eurlex_oj_l"](None, None)
    parsed = adapter.parse(_feed_raw("eurlex_oj_l", OJ_L_TITLE))
    assert parsed.celex == "32026R1881"


def test_feed_parse_types_the_act_from_its_celex():
    from data.models import DocumentType

    adapter = ADAPTERS_BY_KEY["eurlex_oj_l"](None, None)
    parsed = adapter.parse(_feed_raw("eurlex_oj_l", OJ_L_TITLE))
    # Not OTHER — which is what put newly published EU law in the commentary
    # tier of _DEEPEN_QUOTAS alongside blog posts.
    assert parsed.document_type is DocumentType.REGULATION


def test_feed_parse_handles_the_other_live_celex_shapes():
    adapter = ADAPTERS_BY_KEY["eurlex_ep_council_legislation"](None, None)
    cases = {
        "CELEX:32026D1347: Council Decision (EU) 2026/1347 of 4 June 2026": "32026D1347",
        "CELEX:E2026C1693: EFTA Surveillance Authority Decision No 019/26/COL": "E2026C1693",
        "CELEX:32023H0120(01): Commission Recommendation": "32023H0120(01)",
    }
    for title, expected in cases.items():
        assert adapter.parse(_feed_raw("x", title)).celex == expected


def test_feed_parse_leaves_celex_unset_for_ordinary_press_titles():
    adapter = ADAPTERS_BY_KEY["ec_press"](None, None)
    parsed = adapter.parse(_feed_raw("ec_press", "Commission opens consultation on AI"))
    assert parsed.celex is None


def test_a_spec_declared_type_is_not_overridden_by_the_celex():
    """The COM proposals feed states PROPOSAL; the CELEX fill is gap-filling,
    not an override."""
    from data.models import DocumentType

    adapter = ADAPTERS_BY_KEY["eurlex_com_proposals"](None, None)
    parsed = adapter.parse(_feed_raw("x", "CELEX:52026PC0565: Proposal for a REGULATION"))
    assert parsed.celex == "52026PC0565"
    assert parsed.document_type is DocumentType.PROPOSAL
