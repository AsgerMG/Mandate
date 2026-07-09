"""European Parliament plenary verbatim reports (CRE) — the actual debate
transcripts: named speakers, their role/political-group cue, and inline
links to the procedure being debated.

The EP publishes these at ``doceo/document/CRE-*.html``, but every request
from a plain HTTP client is met with an AWS WAF JS challenge (HTTP 202,
``x-amzn-waf-action: challenge``) — confirmed live 2026-07-09 on every
content type tried (HTML, PDF, XML), with full browser headers, and with no
machine-readable fallback anywhere else (no Cellar-equivalent for EP
documents, no working captions API). This is the same class of block this
project already accepted elsewhere (Council press, CJEU, EDPS — see
source-map.md) — except here a real browser genuinely solves it: verified
live, headless Chromium via Playwright returns the full rendered page
(600KB+, correct title, real text) where `httpx`/`curl` gets nothing. This
adapter is therefore the one exception in the codebase to the "plain HTTP
client" pattern — see decision-log.md, 2026-07-09.

Discovery uses the EP Open Data API (data.europarl.europa.eu/api/v2, no
WAF, already used by ``oeil.py``) purely to list which days had a plenary
sitting. Relevance is judged per agenda item against the actual rendered
text (there is no cheap title-only endpoint that would let us filter before
rendering), so every sitting day in the window is rendered once — but only
once no matter how many of its items turn out to be relevant, and the
rendered text is cached in-process so ``fetch()`` never re-renders.

Mirrors ``oeil.py``'s hardcoded "current + previous year" window rather
than the generic ``backfill_days`` setting (7300 days / 20 years would mean
rendering a decade of plenary sittings on first run) — deliberately
recency-scoped; see backlog.md.
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

MEETINGS_API = "https://data.europarl.europa.eu/api/v2/meetings"
CRE_URL = "https://www.europarl.europa.eu/doceo/document/CRE-{term}-{date}_EN.html"
PAGE_SIZE = 100
MAX_PAGES = 10  # per year, safety cap — mirrors oeil.py
RENDER_TIMEOUT_MS = 45_000
RENDER_WAIT_MS = 4_000  # let the WAF's JS challenge resolve before reading the DOM
BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
)

_ITEM_ANCHOR_RE = re.compile(r"^creitem(\d+)$")
_PROCEDURE_REF_RE = re.compile(r"reference=([^&\"]+)")


def _term_for(date: dt.date) -> str:
    """EP legislative term for a sitting date. Term 10 runs 2024-07 onward;
    term 9 ran 2019-07–2024-07. Extend when term 11 begins (~2029)."""
    return "10" if date >= dt.date(2024, 7, 1) else "9"


def _render_day(url: str) -> str | None:
    """Render one CRE day page with a real browser. Returns None on any
    failure — a bad render must not crash the whole run (same contract as
    every other best-effort fetch in this codebase)."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        log.warning("ep_verbatim_playwright_missing")
        return None
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            try:
                page = browser.new_page(user_agent=BROWSER_UA)
                page.goto(url, wait_until="load", timeout=RENDER_TIMEOUT_MS)
                page.wait_for_timeout(RENDER_WAIT_MS)
                return page.content()
            finally:
                browser.close()
    except Exception:  # noqa: BLE001 - rendering is best-effort
        log.warning("ep_verbatim_render_failed", url=url, exc_info=True)
        return None


def _clean_title(raw_title: str) -> str:
    return re.sub(r"^\d+\.\s*", "", raw_title).strip()


def _split_speaker_paragraph(p) -> tuple[str | None, str | None, str]:
    """A CRE speech paragraph is ``<span class="doc_subtitle_level1[_bis]">
    <span class="bold">Name, </span></span> <span class="italic">Role</span>
    <span class="bold">.</span> – speech text``. Extract name/role from the
    markup (reliable); recover the speech text by cutting the flattened
    text at the first dash near the start (the attribution block always
    ends in ". – ")."""
    name_span = p.find("span", class_=re.compile(r"^doc_subtitle_level1"))
    speaker = None
    role = None
    if name_span is not None:
        bold = name_span.find("span", class_="bold")
        speaker = (bold.get_text(" ", strip=True) if bold else name_span.get_text(" ", strip=True))
        speaker = speaker.rstrip(",").strip() or None
        role_span = name_span.find_next_sibling("span", class_="italic")
        if role_span is not None:
            role = role_span.get_text(" ", strip=True) or None
    full_text = p.get_text(" ", strip=True)
    speech = full_text
    if speaker:
        # The attribution block always ends in an EN DASH ("–", U+2013,
        # rendered from &#8211;) — never a plain ASCII hyphen, which
        # legitimately appears inside role titles ("Vice-President",
        # "President-in-Office") and must not be mistaken for the separator.
        dash = re.search(r"–\s*", full_text[:200])
        if dash:
            speech = full_text[dash.end() :].strip()
    return speaker, role, speech


def _split_items(html: str) -> dict[int, dict]:
    """Split a rendered CRE day page into per-agenda-item sections. Each
    item's block is preceded by ``<a name="creitemN">``; everything between
    consecutive such anchors belongs to item N. One linear pass over the
    body avoids fragile subtree-boundary logic."""
    soup = BeautifulSoup(html, "lxml")
    body = soup.find("body")
    if body is None:
        return {}
    items: dict[int, dict] = {}
    current: int | None = None
    for el in body.descendants:
        if not hasattr(el, "attrs"):
            continue  # text node
        name = el.attrs.get("name")
        if name:
            m = _ITEM_ANCHOR_RE.match(name)
            if m:
                current = int(m.group(1))
                items.setdefault(
                    current, {"title": None, "speakers": [], "procedure_refs": set()}
                )
            continue
        if current is None:
            continue
        classes = el.get("class") or []
        if el.name == "td" and "doc_title" in classes and items[current]["title"] is None:
            items[current]["title"] = _clean_title(el.get_text(" ", strip=True))
        elif el.name == "p" and "contents" in classes:
            speaker, role, speech = _split_speaker_paragraph(el)
            if speech:
                items[current]["speakers"].append(
                    {"name": speaker, "role": role, "text": speech}
                )
            for a in el.find_all("a", href=True):
                m = _PROCEDURE_REF_RE.search(a["href"])
                if m and "ficheprocedure" in a["href"]:
                    items[current]["procedure_refs"].add(m.group(1))
    for item in items.values():
        item["procedure_refs"] = sorted(item["procedure_refs"])
    return items


class EpVerbatimAdapter(SourceAdapter):
    key = "ep_verbatim"
    name = "European Parliament — plenary verbatim reports (CRE)"
    jurisdiction = Jurisdiction.EU
    base_url = "https://www.europarl.europa.eu/doceo/"

    def __init__(self, http, settings):
        super().__init__(http, settings)
        self._day_items: dict[str, dict[int, dict]] = {}
        self._skipped: set[str] = set()
        self._newly_processed_days: set[str] = set()

    def _items_for_day(self, date_str: str) -> dict[int, dict]:
        if date_str not in self._day_items:
            term = _term_for(dt.date.fromisoformat(date_str))
            html = _render_day(CRE_URL.format(term=term, date=date_str))
            self._day_items[date_str] = _split_items(html) if html else {}
        return self._day_items[date_str]

    def discover(self, since: dt.date | None, cursor: dict | None) -> Iterable[DocRef]:
        # NB: `since` is deliberately NOT used to bound this loop. After the
        # first run it collapses to "today" (the pipeline's `_since()` uses
        # last_run_at), which would silently stop discovering every past
        # sitting day forever, not just skip re-rendering them — a real bug
        # caught live on the second run. Efficiency instead comes from
        # `processed_days`: a day already rendered once is never rendered
        # again (verbatim reports are not corrected after publication in
        # practice), while the whole current+previous-year window (mirrors
        # oeil.py) stays eligible for genuinely new days every run.
        known_offtopic = set((cursor or {}).get("offtopic", []))
        processed_days = set((cursor or {}).get("processed_days", []))
        year = dt.date.today().year
        for y in (year, year - 1):
            for page in range(MAX_PAGES):
                resp = self.http.get(
                    MEETINGS_API,
                    accept="application/ld+json",
                    params={"year": y, "limit": PAGE_SIZE, "offset": page * PAGE_SIZE},
                )
                rows = resp.json().get("data", [])
                for row in rows:
                    date_str = row.get("activity_date")
                    if not date_str or not any(
                        "PVCRE-ITM-" in c for c in row.get("consists_of", [])
                    ):
                        continue  # not a plenary sitting with a verbatim report
                    if date_str in processed_days:
                        continue
                    date = dt.date.fromisoformat(date_str)
                    term = _term_for(date)
                    for number, item in self._items_for_day(date_str).items():
                        ext_id = f"CRE-{term}-{date_str}-ITM-{number:03d}"
                        if ext_id in known_offtopic:
                            continue
                        # Title only, deliberately — mirrors oeil.py. An
                        # earlier version also scanned the first few
                        # speakers' text to catch generic-titled debates
                        # ("The 28th Regime: a new legal framework for
                        # innovative companies" has no literal tech keyword
                        # despite being a real digital-economy debate), but
                        # verified live on a 34-document batch: every single
                        # genuine match already passed on title alone (9/9),
                        # and every false positive — Uganda human rights,
                        # WTO ministerial, gender pension gap, wastewater
                        # treatment — came ONLY from the speaker-text
                        # fallback, via short/ambiguous substrings colliding
                        # in long multilingual transcripts (" ai " inside
                        # French "j'ai", "chip" inside "relationship",
                        # "daten" inside German "Mandaten", "internet" inside
                        # the boilerplate "available on Parliament's website"
                        # sign-off every item ends with). The fallback's
                        # false-positive rate made it a net loss; precision
                        # matters more than the rare generic-title miss.
                        if not item["title"] or not is_tech_relevant(item["title"]):
                            self._skipped.add(ext_id)
                            continue
                        yield DocRef(
                            external_id=ext_id,
                            url=f"{CRE_URL.format(term=term, date=date_str)}#creitem{number}",
                            title=item["title"],
                            hint={"date": date_str, "number": number},
                        )
                    # Only mark the day processed once every one of its items
                    # has actually been offered to the consumer above — if a
                    # `--limit`-bounded run abandons this generator mid-day,
                    # this line never runs, so the day stays eligible and its
                    # unseen items get a fair chance on the next run instead
                    # of being silently skipped forever.
                    self._newly_processed_days.add(date_str)
                if len(rows) < PAGE_SIZE:
                    break

    def fetch(self, ref: DocRef) -> RawDocument:
        date_str, number = ref.hint["date"], ref.hint["number"]
        item = self._items_for_day(date_str).get(number) or {}
        payload = {"date": date_str, "number": number, "item": item}
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
            return None  # render failed or nothing substantive was said
        title = item["title"]
        lines = [title, ""]
        for sp in item["speakers"]:
            attribution = sp["name"] or "Unknown speaker"
            if sp.get("role"):
                attribution += f" ({sp['role']})"
            lines.append(f"{attribution} — {sp['text']}")
            lines.append("")
        return ParsedDocument(
            external_id=raw.ref.external_id,
            title=title,
            jurisdiction=Jurisdiction.EU,
            document_type=DocumentType.OTHER,
            lifecycle_stage=LifecycleStage.UNKNOWN,
            text="\n".join(lines).strip(),
            raw_format="text",
            language="en",
            url=raw.ref.url,
            date_document=dt.date.fromisoformat(payload["date"]),
            extra={
                "kind": "verbatim_debate",
                "sitting_date": payload["date"],
                "item_number": payload["number"],
                "speaker_count": len(item["speakers"]),
                "procedure_references": item.get("procedure_refs") or [],
            },
        )

    def next_cursor(self, prev: dict | None, seen: list[DocRef]) -> dict | None:
        offtopic = set((prev or {}).get("offtopic", [])) | self._skipped
        processed_days = set((prev or {}).get("processed_days", [])) | self._newly_processed_days
        return {
            "offtopic": sorted(offtopic)[-8000:],
            "processed_days": sorted(processed_days)[-1500:],
        }
