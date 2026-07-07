"""OEIL over EP Open Data — discovery paging, relevance skip, stage mapping."""

from __future__ import annotations

import json

from etl.adapters.oeil import OeilAdapter

LIST_PAGE = {
    "data": [
        {
            "process_id": "2026-0042",
            "process_type": "def/ep-procedure-types/COD",
            "label": "2026/0042(COD)",
        },
        {
            "process_id": "2026-0043",
            "process_type": "def/ep-procedure-types/BUD",  # not tracked
            "label": "2026/0043(BUD)",
        },
    ]
}

DETAIL_TECH = {
    "data": [
        {
            "process_id": "2026-0042",
            "label": "2026/0042(COD)",
            "process_title": {
                "en": "Regulation on artificial intelligence liability",
                "fr": "Règlement sur la responsabilité de l'IA",
            },
            "current_stage": "http://publications.europa.eu/resource/authority/procedure-phase/RDG1",
            "process_type": "def/ep-procedure-types/COD",
        }
    ]
}

DETAIL_OFFTOPIC = {
    "data": [
        {
            "process_id": "2026-0050",
            "label": "2026/0050(COD)",
            "process_title": {"en": "Common agricultural policy amending regulation"},
            "current_stage": "",
        }
    ]
}


class FakeHttp:
    def __init__(self, payload):
        self.payload = payload

    def get(self, url, **kw):
        payload = self.payload

        class R:
            content = json.dumps(payload).encode()

            def json(self):
                return payload

        return R()


def _adapter(payload):
    return OeilAdapter(http=FakeHttp(payload), settings=None)


def test_discover_tracks_cod_and_skips_known_offtopic():
    a = _adapter(LIST_PAGE)
    refs = list(a.discover(None, None))
    assert [r.external_id for r in refs] == ["2026-0042", "2026-0042"]  # 2 years probed
    # cursor suppression
    refs = list(a.discover(None, {"offtopic": ["2026-0042"]}))
    assert refs == []


def test_parse_tech_procedure_maps_stage():
    a = _adapter(DETAIL_TECH)
    raw = a.fetch(next(iter(_adapter(LIST_PAGE).discover(None, None))))
    doc = a.parse(raw)
    assert doc is not None
    assert doc.title == "Regulation on artificial intelligence liability"
    assert doc.lifecycle_stage.value == "proposed"
    assert doc.extra["procedure_phase"] == "RDG1"
    assert "2026/0042(COD)" in doc.text


def test_parse_offtopic_returns_none_and_feeds_cursor():
    a = _adapter(DETAIL_OFFTOPIC)
    raw = a.fetch(next(iter(_adapter(LIST_PAGE).discover(None, None))))
    assert a.parse(raw) is None
    cursor = a.next_cursor({"offtopic": ["old-1"]}, [])
    assert set(cursor["offtopic"]) == {"old-1", "2026-0050"}
