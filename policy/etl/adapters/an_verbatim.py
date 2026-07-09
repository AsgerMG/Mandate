"""Assemblée Nationale plenary verbatim reports (compte rendu de séance) —
the actual floor-debate transcripts: named deputy, ministerial/rapporteur
role where stated, and full speech text.

Unlike the EP's equivalent (``ep_verbatim.py``), this source carries **no**
bot wall at all — ``www.assemblee-nationale.fr`` serves the full rendered
HTML to a plain request (verified live 2026-07-09), so this adapter is
ordinary ``httpx``, no headless browser needed.

Each sitting is one page (``.../comptes-rendus/seance/{session}/{slug}``),
structured as a flat sequence of ``<div class="crs-inter">`` blocks: either
an ``<h2 class="presidence">`` item header (a new numbered agenda item) or a
``<p class="orateur">`` speech block (one deputy's turn). One linear pass
tracks the current item and collects speeches under it, mirroring the
``ep_verbatim`` design.

Discovery reads the comptes-rendus listing page, which inlines every sitting
in the current session directly — no separate per-session-group crawl
needed for recency (mirrors ``ep_verbatim``'s "current window, not full
history" scope).
"""

from __future__ import annotations

import datetime as dt
import json
import re
from collections.abc import Iterable

import structlog
from bs4 import BeautifulSoup

from data.models import DocumentType, Jurisdiction, LifecycleStage

from .base import DocRef, ParsedDocument, RawDocument, SourceAdapter
from .feeds import is_tech_relevant

log = structlog.get_logger(__name__)

# Current legislature; bump after the next dissolution/election (see an_dossiers.py).
LEGISLATURE = "17"
LISTING_URL = f"https://www.assemblee-nationale.fr/dyn/{LEGISLATURE}/comptes-rendus/seance"
SITTING_URL = f"https://www.assemblee-nationale.fr/dyn/{LEGISLATURE}/comptes-rendus/seance/{{path}}"
_SITTING_HREF_RE = re.compile(
    rf'href="/dyn/{LEGISLATURE}/comptes-rendus/seance/([^"?#]+/[^"?#]+)"'
)

# The root listing page only *inlines* the current parliamentary year's
# session groups' individual sittings directly — confirmed live 2026-07-09
# (session-ordinaire/extraordinaire-de-2025-2026 have their leaf links on
# the root page; every other group has none). Mirrors oeil.py's "current +
# previous year" window: fetch last year's group index pages too, each of
# which inlines its own leaf links the same way the root page does for the
# current year. Irregular session-group names (not a clean year template)
# mean this is a small explicit list, not a formula — bump it forward each
# legislative year alongside LEGISLATURE.
PRIOR_YEAR_GROUPS = [
    "session-ordinaire-de-2024-2025",
    "session-extraordinaire-de-2024-2025",
    "2e-session-extraordinaire-de-2024-2025",
    "session-de-droit-de-2024",
]

_FR_MONTHS = {
    "janvier": 1, "février": 2, "mars": 3, "avril": 4, "mai": 5, "juin": 6,
    "juillet": 7, "août": 8, "septembre": 9, "octobre": 10, "novembre": 11,
    "décembre": 12,
}
_DATE_RE = re.compile(
    r"(\d{1,2})\s+(" + "|".join(_FR_MONTHS) + r")\s+(\d{4})", re.IGNORECASE
)


def _parse_fr_date(text: str) -> dt.date | None:
    m = _DATE_RE.search(text or "")
    if not m:
        return None
    day, month_name, year = m.groups()
    return dt.date(int(year), _FR_MONTHS[month_name.lower()], int(day))


def _split_an_items(html: str) -> dict[int, dict]:
    """One linear pass over ``crs-inter`` blocks in document order: an
    ``h2.presidence`` block starts a new numbered item; a ``p.orateur``
    block is one deputy's speech under the current item."""
    soup = BeautifulSoup(html, "lxml")
    items: dict[int, dict] = {}
    current: int | None = None
    for div in soup.find_all("div", class_=lambda c: c and "crs-inter" in c):
        header = div.find("h2", class_="presidence")
        if header is not None:
            spans = header.find_all("span")
            number_text = spans[0].get_text(strip=True) if spans else ""
            m = re.match(r"(\d+)", number_text)
            if not m:
                continue
            current = int(m.group(1))
            title = spans[1].get_text(" ", strip=True) if len(spans) > 1 else None
            items.setdefault(current, {"title": title, "speakers": []})
            continue
        orateur = div.find("p", class_="orateur")
        if orateur is None or current is None:
            continue
        speaker = orateur.get_text(" ", strip=True) or None
        speech_ps = [p for p in div.find_all("p") if p is not orateur]
        text = " ".join(p.get_text(" ", strip=True) for p in speech_ps).strip()
        if speaker and text:
            items[current]["speakers"].append({"name": speaker, "text": text})
    return items


class AnVerbatimAdapter(SourceAdapter):
    key = "an_verbatim"
    name = "Assemblée Nationale — comptes rendus des débats (séance publique)"
    jurisdiction = Jurisdiction.FR
    base_url = LISTING_URL

    def __init__(self, http, settings):
        super().__init__(http, settings)
        self._sitting_items: dict[str, dict[int, dict]] = {}
        self._sitting_dates: dict[str, dt.date | None] = {}
        self._skipped: set[str] = set()
        self._newly_processed_sittings: set[str] = set()

    def _items_for_sitting(self, path: str) -> dict[int, dict]:
        if path not in self._sitting_items:
            resp = self.http.get(SITTING_URL.format(path=path), accept="text/html")
            html = resp.text
            title = BeautifulSoup(html, "lxml").title
            self._sitting_dates[path] = _parse_fr_date(title.get_text() if title else "")
            self._sitting_items[path] = _split_an_items(html)
        return self._sitting_items[path]

    def discover(self, since: dt.date | None, cursor: dict | None) -> Iterable[DocRef]:
        # Mirrors ep_verbatim.py: `since` is not used to bound the window
        # (it collapses to "today" after the first run, which would stop
        # discovery of every past sitting forever). A `processed_sittings`
        # cursor entry, populated only once a sitting's items are fully
        # iterated, does the incremental work instead.
        known_offtopic = set((cursor or {}).get("offtopic", []))
        processed = set((cursor or {}).get("processed_sittings", []))
        all_paths: set[str] = set()
        for listing_url in [LISTING_URL] + [
            f"https://www.assemblee-nationale.fr/dyn/{LEGISLATURE}/comptes-rendus/seance/{g}"
            for g in PRIOR_YEAR_GROUPS
        ]:
            resp = self.http.get(listing_url, accept="text/html")
            all_paths |= set(_SITTING_HREF_RE.findall(resp.text))
        paths = sorted(p for p in all_paths if not p.endswith(".pdf"))
        for path in paths:
            if path in processed:
                continue
            try:
                items = self._items_for_sitting(path)
            except Exception:  # noqa: BLE001 - a transient fetch failure
                # (seen live: a 503 mid-crawl) must not abort the whole
                # source run the way an unhandled exception inside a
                # generator would. Not marking this path processed means
                # it's simply retried on the next run.
                log.warning("an_verbatim_sitting_fetch_failed", path=path, exc_info=True)
                continue
            for number, item in items.items():
                ext_id = f"AN-{LEGISLATURE}-{path}-ITM-{number:03d}"
                if ext_id in known_offtopic:
                    continue
                # Title only, deliberately — see ep_verbatim.py's discover()
                # for the full writeup. Checking the first few speakers' raw
                # text was tried and reverted: verified live, every genuine
                # AN match on a real batch already passed on title alone,
                # while every false positive (sports financing, government
                # question time, textile-industry environmental rules) came
                # only from an incidental keyword collision deep in a long,
                # unrelated speech.
                if not item["title"] or not is_tech_relevant(item["title"]):
                    self._skipped.add(ext_id)
                    continue
                yield DocRef(
                    external_id=ext_id,
                    url=f"{SITTING_URL.format(path=path)}#{number}",
                    title=item["title"],
                    hint={"path": path, "number": number},
                )
            self._newly_processed_sittings.add(path)

    def fetch(self, ref: DocRef) -> RawDocument:
        path, number = ref.hint["path"], ref.hint["number"]
        item = self._items_for_sitting(path).get(number) or {}
        payload = {
            "path": path,
            "number": number,
            "date": (self._sitting_dates.get(path) or dt.date.today()).isoformat(),
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
            lines.append(f"{sp['name']} — {sp['text']}")
            lines.append("")
        return ParsedDocument(
            external_id=raw.ref.external_id,
            title=title,
            jurisdiction=Jurisdiction.FR,
            document_type=DocumentType.OTHER,
            lifecycle_stage=LifecycleStage.UNKNOWN,
            text="\n".join(lines).strip(),
            raw_format="text",
            language="fr",
            url=raw.ref.url,
            date_document=dt.date.fromisoformat(payload["date"]),
            extra={
                "kind": "verbatim_debate",
                "sitting_path": payload["path"],
                "item_number": payload["number"],
                "speaker_count": len(item["speakers"]),
            },
        )

    def next_cursor(self, prev: dict | None, seen: list[DocRef]) -> dict | None:
        offtopic = set((prev or {}).get("offtopic", [])) | self._skipped
        processed = (
            set((prev or {}).get("processed_sittings", [])) | self._newly_processed_sittings
        )
        return {
            "offtopic": sorted(offtopic)[-8000:],
            "processed_sittings": sorted(processed)[-1500:],
        }
