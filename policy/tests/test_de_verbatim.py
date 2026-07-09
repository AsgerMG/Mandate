"""DE verbatim (Plenarprotokoll) adapter — item splitting, filtering, cursor."""

from __future__ import annotations

import json

from etl.adapters import de_verbatim as dv

# A trimmed real fragment (fetched live 2026-07-09 from
# dserver.bundestag.de/btp/21/21001.xml): a TOC block giving the real title
# for a numbered item, a ceremonial item with no <rede> at all (must be
# skipped, not crash), and a substantive item with one structured speech.
SAMPLE_XML = b"""<?xml version="1.0" encoding="UTF-8"?>
<dbtplenarprotokoll wahlperiode="21" sitzung-nr="1" sitzung-datum="25.03.2025">
  <vorspann>
    <inhaltsverzeichnis>
      <ivz-block>
        <ivz-block-titel>Tagesordnungspunkt 1:</ivz-block-titel>
        <ivz-eintrag>
          <ivz-eintrag-inhalt>Eroeffnung der Sitzung</ivz-eintrag-inhalt>
        </ivz-eintrag>
      </ivz-block>
      <ivz-block>
        <ivz-block-titel>Tagesordnungspunkt 2:</ivz-block-titel>
        <ivz-eintrag>
          <ivz-eintrag-inhalt>Staerkung digitaler Ermittlungsbefugnisse</ivz-eintrag-inhalt>
        </ivz-eintrag>
      </ivz-block>
    </inhaltsverzeichnis>
  </vorspann>
  <sitzungsverlauf>
    <tagesordnungspunkt top-id="Tagesordnungspunkt 1">
      <p klasse="J">Die Sitzung wird eroeffnet.</p>
    </tagesordnungspunkt>
    <tagesordnungspunkt top-id="Tagesordnungspunkt 2">
      <rede id="ID211000">
        <p klasse="redner">
          <redner id="1">
            <name><vorname>Alexander</vorname><nachname>Hoffmann</nachname><fraktion>CDU/CSU</fraktion></name>
          </redner>
          Alexander Hoffmann (CDU/CSU):
        </p>
        <p klasse="J_1">Wir staerken heute die digitalen Ermittlungsbefugnisse.</p>
        <kommentar>(Beifall bei der CDU/CSU)</kommentar>
      </rede>
    </tagesordnungspunkt>
  </sitzungsverlauf>
</dbtplenarprotokoll>
"""


def test_split_de_items_uses_toc_title_and_skips_speechless_item():
    items = dv._split_de_items(SAMPLE_XML)

    assert items["Tagesordnungspunkt 1"]["title"] == "Eroeffnung der Sitzung"
    assert items["Tagesordnungspunkt 1"]["speakers"] == []

    item2 = items["Tagesordnungspunkt 2"]
    assert item2["title"] == "Staerkung digitaler Ermittlungsbefugnisse"
    assert len(item2["speakers"]) == 1
    speaker = item2["speakers"][0]
    assert speaker["name"] == "Alexander Hoffmann"
    assert speaker["role"] == "CDU/CSU"
    assert "digitalen Ermittlungsbefugnisse" in speaker["text"]
    # The <kommentar> audience-reaction aside must not leak into speech text.
    assert "Beifall" not in speaker["text"]


def test_xml_url_from_dokumentnummer():
    assert dv._xml_url("21/90") == "https://dserver.bundestag.de/btp/21/21090.xml"
    assert dv._xml_url("21/1") == "https://dserver.bundestag.de/btp/21/21001.xml"
    assert dv._xml_url("not-a-number") is None


class FakeHttp:
    """One page of /plenarprotokoll, then the protocol's XML; mirrors
    FakeHttp in the other verbatim adapters' tests."""

    def __init__(self, listing_payload, xml_content):
        self.listing_payload = listing_payload
        self.xml_content = xml_content
        self.list_calls = 0

    def get(self, url, **kw):
        if url == dv.DIP_API:
            self.list_calls += 1
            payload = self.listing_payload if self.list_calls == 1 else {"documents": []}

            class R:
                def json(self_inner):
                    return payload

            return R()

        class R:
            content = self.xml_content

        return R()


LISTING_PAYLOAD = {
    "documents": [
        {"id": "5804", "datum": "2025-03-25", "dokumentnummer": "21/1"},
    ],
    "cursor": None,
}


def test_discover_filters_to_tech_relevant_items():
    adapter = dv.DeVerbatimAdapter(http=FakeHttp(LISTING_PAYLOAD, SAMPLE_XML), settings=None)

    refs = list(adapter.discover(None, None))

    assert [r.external_id for r in refs] == ["BTP-5804-Tagesordnungspunkt 2"]
    assert refs[0].hint == {"protocol_id": "5804", "key": "Tagesordnungspunkt 2"}
    cursor = adapter.next_cursor(None, [])
    assert "BTP-5804-Tagesordnungspunkt 1" in cursor["offtopic"]
    assert "5804" in cursor["processed_protocols"]


def test_fetch_and_parse_round_trip():
    adapter = dv.DeVerbatimAdapter(http=FakeHttp(LISTING_PAYLOAD, SAMPLE_XML), settings=None)
    ref = next(iter(adapter.discover(None, None)))

    raw = adapter.fetch(ref)
    payload = json.loads(raw.content)
    assert payload["date"] == "2025-03-25"

    doc = adapter.parse(raw)
    assert doc is not None
    assert doc.jurisdiction.value == "DE"
    assert doc.extra["speaker_count"] == 1
    assert "Alexander Hoffmann (CDU/CSU) —" in doc.text


def test_processed_protocols_cursor_prevents_reprocessing():
    http = FakeHttp(LISTING_PAYLOAD, SAMPLE_XML)
    adapter = dv.DeVerbatimAdapter(http=http, settings=None)
    list(adapter.discover(None, None))
    cursor = adapter.next_cursor(None, [])

    http2 = FakeHttp(LISTING_PAYLOAD, SAMPLE_XML)
    adapter2 = dv.DeVerbatimAdapter(http=http2, settings=None)
    refs = list(adapter2.discover(None, cursor))
    assert refs == []


class FlakyHttp(FakeHttp):
    """The XML fetch for one protocol raises (a not-yet-published sitting,
    seen live 2026-07-09 as a transient 404); the listing call still works."""

    def get(self, url, **kw):
        if url != dv.DIP_API:
            raise RuntimeError("404 not yet published")
        return super().get(url, **kw)


def test_discover_survives_one_protocol_fetch_failure():
    adapter = dv.DeVerbatimAdapter(http=FlakyHttp(LISTING_PAYLOAD, SAMPLE_XML), settings=None)

    refs = list(adapter.discover(None, None))
    assert refs == []

    cursor = adapter.next_cursor(None, [])
    assert "5804" not in cursor["processed_protocols"]
