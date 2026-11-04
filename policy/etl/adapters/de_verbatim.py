"""Bundestag plenary verbatim reports (Plenarprotokolle) — the actual debate
transcripts: named MP, party/group, and full speech text.

The DE sibling to ``ep_verbatim.py`` and ``an_verbatim.py``, and by far the
easiest of the three: no bot wall anywhere, and the source format is real
semantic XML rather than HTML div-soup. Discovery uses the Bundestag's own
DIP (Dokumentations- und Informationssystem für Parlamentsmaterialien) API,
which requires a key — but the Bundestag publishes an official, public demo
key directly on its own help page (dip.bundestag.de/über-dip/hilfe/api),
valid through 2027-05, no registration needed; verified live 2026-07-09.
(This is distinct from — and unlike — a since-revoked community-maintained
fallback key found during the same investigation; see decision-log.md.)

Each protocol's full text is a separate, no-auth XML document at
dserver.bundestag.de (also verified live), structured as:
``<tagesordnungspunkt top-id="...">`` (one per numbered agenda item) containing
``<rede>`` elements (one per speech), each with a ``<redner>`` tag carrying
structured ``<vorname>/<nachname>/<fraktion>`` fields — no name/party text
parsing needed, unlike the other two adapters. Agenda-item titles come from
the document's own table of contents (``<ivz-block>``), matched to the body
by the shared ``top-id`` / block-title string.
"""

from __future__ import annotations

import datetime as dt
import json
from collections.abc import Iterable

import structlog
from bs4 import BeautifulSoup

from data.models import DocumentType, Jurisdiction, LifecycleStage

from .base import DocRef, ParsedDocument, RawDocument, SourceAdapter
from .feeds import is_tech_relevant

log = structlog.get_logger(__name__)

DIP_API = "https://search.dip.bundestag.de/api/v1/plenarprotokoll"
# Official public demo key, published at dip.bundestag.de/über-dip/hilfe/api,
# valid through 2027-05 per that page. Read-only; the Bundestag also offers
# a personal 10-year key on request (parlamentsdokumentation@bundestag.de)
# with the same scope — not needed for this adapter.
DIP_API_KEY = "R2BZaee.DjdCyihKZMf8AOjtScubP2EVydegzjmBIQ"
XML_URL = "https://dserver.bundestag.de/btp/{wp}/{wp}{sitzung:03d}.xml"
WINDOW_DAYS = 730  # ~2 years — mirrors ep_verbatim.py / an_verbatim.py


def _xml_url(dokumentnummer: str) -> str | None:
    """'21/90' -> the protocol's dserver.bundestag.de XML URL."""
    wp, _, sitzung = dokumentnummer.partition("/")
    if not (wp.isdigit() and sitzung.isdigit()):
        return None
    return XML_URL.format(wp=int(wp), sitzung=int(sitzung))


def _split_de_items(xml: bytes) -> dict[str, dict]:
    """Parse one Plenarprotokoll's XML into per-agenda-item sections, keyed
    by the shared 'top-id' / table-of-contents block-title string."""
    soup = BeautifulSoup(xml, "lxml-xml")

    titles: dict[str, str] = {}
    for block in soup.find_all("ivz-block"):
        block_title = block.find("ivz-block-titel")
        first_entry = block.find("ivz-eintrag-inhalt")
        if block_title and first_entry:
            key = block_title.get_text(strip=True).rstrip(":")
            titles[key] = first_entry.get_text(" ", strip=True)

    items: dict[str, dict] = {}
    for top in soup.find_all("tagesordnungspunkt"):
        key = top.get("top-id")
        if not key:
            continue
        speakers = []
        for rede in top.find_all("rede"):
            redner = rede.find("redner")
            if redner is None:
                continue
            name_parts = [
                redner.find(tag).get_text(strip=True)
                for tag in ("vorname", "nachname")
                if redner.find(tag)
            ]
            fraktion = redner.find("fraktion")
            speech_ps = [
                p for p in rede.find_all("p", recursive=False) if p.get("klasse") != "redner"
            ]
            text = " ".join(p.get_text(" ", strip=True) for p in speech_ps).strip()
            if name_parts and text:
                speakers.append(
                    {
                        "name": " ".join(name_parts),
                        "role": fraktion.get_text(strip=True) if fraktion else None,
                        "text": text,
                    }
                )
        items[key] = {"title": titles.get(key, key), "speakers": speakers}
    return items


class DeVerbatimAdapter(SourceAdapter):
    key = "de_verbatim"
    name = "Bundestag — plenary verbatim reports (Plenarprotokolle)"
    jurisdiction = Jurisdiction.DE
    base_url = "https://dip.bundestag.de/"

    def __init__(self, http, settings):
        super().__init__(http, settings)
        self._protocol_items: dict[str, dict[str, dict]] = {}
        self._protocol_dates: dict[str, dt.date] = {}
        self._skipped: set[str] = set()
        self._newly_processed: set[str] = set()

    def _items_for_protocol(self, protocol_id: str, xml_url: str) -> dict[str, dict]:
        if protocol_id not in self._protocol_items:
            resp = self.http.get(xml_url, accept="application/xml")
            self._protocol_items[protocol_id] = _split_de_items(resp.content)
        return self._protocol_items[protocol_id]

    def discover(self, since: dt.date | None, cursor: dict | None) -> Iterable[DocRef]:
        # Mirrors ep_verbatim.py / an_verbatim.py: a dedicated
        # `processed_protocols` cursor entry, not the generic `since`
        # (which collapses to "today" after the first run).
        known_offtopic = set((cursor or {}).get("offtopic", []))
        processed = set((cursor or {}).get("processed_protocols", []))
        window_start = dt.date.today() - dt.timedelta(days=WINDOW_DAYS)

        api_cursor = None
        while True:
            params = {"apikey": DIP_API_KEY, "f.datum.start": window_start.isoformat()}
            if api_cursor:
                params["cursor"] = api_cursor
            resp = self.http.get(DIP_API, accept="application/json", params=params)
            payload = resp.json()
            docs = payload.get("documents", [])
            for doc in docs:
                protocol_id = str(doc.get("id"))
                if not protocol_id or protocol_id in processed:
                    continue
                xml_url = _xml_url(doc.get("dokumentnummer") or "")
                if not xml_url:
                    continue
                try:
                    items = self._items_for_protocol(protocol_id, xml_url)
                except Exception:  # noqa: BLE001 - a protocol not yet
                    # published (seen live: the newest 1-2 sittings 404 for
                    # a day or two) must not abort the run; not marking it
                    # processed means it's retried next time.
                    log.warning(
                        "de_verbatim_protocol_fetch_failed", protocol_id=protocol_id,
                        exc_info=True,
                    )
                    continue
                try:
                    date = dt.date.fromisoformat(doc.get("datum") or "")
                except ValueError:
                    date = None
                self._protocol_dates[protocol_id] = date
                for key, item in items.items():
                    ext_id = f"BTP-{protocol_id}-{key}"
                    if ext_id in known_offtopic:
                        continue
                    if not item["title"] or not is_tech_relevant(item["title"]):
                        self._skipped.add(ext_id)
                        continue
                    yield DocRef(
                        external_id=ext_id,
                        url=xml_url,
                        title=item["title"],
                        hint={"protocol_id": protocol_id, "key": key},
                    )
                self._newly_processed.add(protocol_id)
            next_cursor = payload.get("cursor")
            if not docs or not next_cursor or next_cursor == api_cursor:
                break
            api_cursor = next_cursor

    def fetch(self, ref: DocRef) -> RawDocument:
        protocol_id, key = ref.hint["protocol_id"], ref.hint["key"]
        item = self._protocol_items.get(protocol_id, {}).get(key) or {}
        payload = {
            "protocol_id": protocol_id,
            "key": key,
            "date": (self._protocol_dates.get(protocol_id) or dt.date.today()).isoformat(),
            "item": item,
        }
        return RawDocument(
            ref=ref,
            content=json.dumps(payload).encode("utf-8"),
            content_type="application/json",
            fetched_at=dt.datetime.now(dt.UTC),
        )

    def parse(self, raw: RawDocument) -> ParsedDocument | None:
        payload = json.loads(raw.content)
        item = payload["item"]
        if not item or not item.get("speakers"):
            return None
        title = item["title"]
        lines = [title, ""]
        for sp in item["speakers"]:
            attribution = sp["name"]
            if sp.get("role"):
                attribution += f" ({sp['role']})"
            lines.append(f"{attribution} — {sp['text']}")
            lines.append("")
        return ParsedDocument(
            external_id=raw.ref.external_id,
            title=title,
            jurisdiction=Jurisdiction.DE,
            document_type=DocumentType.OTHER,
            lifecycle_stage=LifecycleStage.UNKNOWN,
            text="\n".join(lines).strip(),
            raw_format="text",
            language="de",
            url=raw.ref.url,
            date_document=dt.date.fromisoformat(payload["date"]),
            extra={
                "kind": "verbatim_debate",
                "protocol_id": payload["protocol_id"],
                "item_key": payload["key"],
                "speaker_count": len(item["speakers"]),
            },
        )

    def next_cursor(self, prev: dict | None, seen: list[DocRef]) -> dict | None:
        offtopic = set((prev or {}).get("offtopic", [])) | self._skipped
        processed = set((prev or {}).get("processed_protocols", [])) | self._newly_processed
        return {
            "offtopic": sorted(offtopic)[-8000:],
            "processed_protocols": sorted(processed)[-1500:],
        }
