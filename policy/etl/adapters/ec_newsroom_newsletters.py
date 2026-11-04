"""EU Commission DG newsletter archives — full-issue back-catalogue pages.

``ec.europa.eu/newsroom/<slug>/newsletter-archives/view/service/<id>`` is a
shared CMS feature across EU Commission services: a paginated listing of
dated issues (``?page=<n>``, confirmed live 2026-07-22 to terminate cleanly —
a page past the last real one returns HTTP 200 with zero issue rows, no 404
needed), each linking to an individual issue page
(``/newsroom/<slug>/newsletter-archives/<numeric-id>``). The listing page
also inlines a short summary of each issue's first item in a hidden
accordion row, but confirmed live that this can under-represent multi-item
issues (DG COMP's weekly digest has 6+ sections on its own page vs. 1 shown
in the listing accordion) — so this adapter always fetches the individual
issue page for full depth, using the listing only for discovery (id, url,
date, title).

Issue pages are old-style HTML-email markup (nested tables, no semantic
wrapper) but consistently use three classes across every DG checked
(CNECT/DAE, COMP, GROW, Trade, JUST): ``h3.comet-main-title`` (a newsletter
section header, e.g. "Antitrust"), ``h4``/``h5.comet-item-title`` (one item's
headline), ``span.comet-item-text`` (that item's summary) — walked in
document order to reconstruct the issue as section-grouped items.

Confirmed depth (live 2026-07-22): DAE back to Nov 2020, COMP/GROW/Trade
weekly-to-monthly through mid-2026, JUST to Dec 2025. EAC/MOVE/HOME/
Representations service IDs were found via search but not re-verified live —
deliberately left out until individually confirmed, same discipline as the
Politico newsletter slugs in ``politico_newsletters.py``.
"""

from __future__ import annotations

import datetime as dt
from collections.abc import Iterable
from dataclasses import dataclass

import httpx
import structlog
from bs4 import BeautifulSoup

from data.models import DocumentType, Jurisdiction, LifecycleStage

from .base import DocRef, ParsedDocument, RawDocument, SourceAdapter

log = structlog.get_logger(__name__)

MAX_PAGES = 60  # safety cap per run

_ITEM_SELECTOR = (
    "h3.comet-main-title, h4.comet-item-title, h5.comet-item-title, span.comet-item-text"
)


@dataclass(frozen=True, slots=True)
class EcNewsroomNewsletterSpec:
    dg_slug: str
    service_id: int
    name: str


NEWSLETTER_SPECS: list[EcNewsroomNewsletterSpec] = [
    EcNewsroomNewsletterSpec(
        dg_slug="dae",
        service_id=2029,
        name="EC Newsroom — DG CNECT (Shaping Europe's Digital Future)",
    ),
    EcNewsroomNewsletterSpec(
        dg_slug="comp", service_id=2012, name="EC Newsroom — DG COMP (Competition Weekly e-News)"
    ),
    EcNewsroomNewsletterSpec(
        dg_slug="growth",
        service_id=2840,
        name="EC Newsroom — DG GROW (Internal Market, Industry newsletter)",
    ),
    EcNewsroomNewsletterSpec(
        dg_slug="trade", service_id=230, name="EC Newsroom — DG Trade newsletter"
    ),
    EcNewsroomNewsletterSpec(
        dg_slug="just", service_id=1148, name="EC Newsroom — DG JUST newsletter"
    ),
]


def _listing_url(dg_slug: str, service_id: int, page: int) -> str:
    return f"https://ec.europa.eu/newsroom/{dg_slug}/newsletter-archives/view/service/{service_id}?page={page}"


def _parse_listing(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "lxml")
    issues = []
    for row in soup.select("tr.ecl-table__row"):
        date_link = row.select_one('td[data-ecl-table-header="Date"] a')
        subject_link = row.select_one('td[data-ecl-table-header="Subject"] a')
        if not date_link or not subject_link:
            continue
        href = date_link.get("href")
        if not href:
            continue
        date = None
        try:
            date = dt.datetime.strptime(date_link.get_text(strip=True), "%d/%m/%Y").date()
        except ValueError:
            date = None
        issues.append(
            {
                "id": href.rstrip("/").rsplit("/", 1)[-1],
                "url": href,
                "title": subject_link.get_text(strip=True),
                "date": date,
            }
        )
    return issues


def _extract_issue_text(html: str) -> str:
    soup = BeautifulSoup(html, "lxml")
    lines = []
    for el in soup.select(_ITEM_SELECTOR):
        text = el.get_text(" ", strip=True)
        if text:
            lines.append(text)
    return "\n\n".join(lines)


class EcNewsroomNewsletterAdapter(SourceAdapter):
    """Concrete per-DG classes are built from ``NEWSLETTER_SPECS`` by
    ``make_ec_newsroom_adapters`` below — same economics as feeds.py's
    ``make_feed_adapters``: one dataclass entry, no new class."""

    spec: EcNewsroomNewsletterSpec  # set on subclasses
    jurisdiction = Jurisdiction.EU

    def discover(self, since: dt.date | None, cursor: dict | None) -> Iterable[DocRef]:
        known_ids = set((cursor or {}).get("known_ids", []))
        for page in range(1, MAX_PAGES + 1):
            try:
                resp = self.http.get(
                    _listing_url(self.spec.dg_slug, self.spec.service_id, page),
                    accept="text/html",
                )
            except httpx.HTTPStatusError as exc:
                # DAE confirmed a clean HTTP 200 with zero rows past the last
                # page, but politico_newsletters.py's sibling adapter hit a
                # real 404 for one newsletter (Forecast) — treat either as
                # "no more pages" rather than trusting one DG's behavior for
                # all five.
                if exc.response.status_code == 404:
                    break
                raise
            issues = _parse_listing(resp.text)
            if not issues:
                break
            hit_cutoff = False
            for issue in issues:
                ext_id = f"EC-NEWSROOM-{self.spec.dg_slug}-{issue['id']}"
                if since and issue["date"] and issue["date"] < since:
                    hit_cutoff = True
                    continue
                if ext_id in known_ids:
                    continue
                yield DocRef(
                    external_id=ext_id,
                    url=issue["url"],
                    title=issue["title"],
                    hint={"date": issue["date"].isoformat() if issue["date"] else None},
                )
            if hit_cutoff:
                break

    def fetch(self, ref: DocRef) -> RawDocument:
        resp = self.http.get(ref.url, accept="text/html")
        return RawDocument(
            ref=ref,
            content=resp.content,
            content_type="text/html",
            fetched_at=dt.datetime.now(dt.UTC),
        )

    def parse(self, raw: RawDocument) -> ParsedDocument | None:
        html = raw.content.decode("utf-8", errors="replace")
        text = _extract_issue_text(html)
        title = raw.ref.title
        if not title or not text:
            return None
        date = dt.date.fromisoformat(raw.ref.hint["date"]) if raw.ref.hint.get("date") else None
        return ParsedDocument(
            external_id=raw.ref.external_id,
            title=title,
            jurisdiction=Jurisdiction.EU,
            document_type=DocumentType.OTHER,
            lifecycle_stage=LifecycleStage.UNKNOWN,
            text=f"{title}\n\n{text}".strip(),
            raw_format="text",
            language="en",
            url=raw.ref.url,
            date_document=date,
            extra={"channel": self.spec.dg_slug, "kind": "newsletter_issue"},
        )

    def next_cursor(self, prev: dict | None, seen: list[DocRef]) -> dict | None:
        known = set((prev or {}).get("known_ids", [])) | {r.external_id for r in seen}
        return {"known_ids": sorted(known)[-3000:]}


def make_ec_newsroom_adapters() -> list[type[EcNewsroomNewsletterAdapter]]:
    classes = []
    for spec in NEWSLETTER_SPECS:
        key = f"ec_newsroom_{spec.dg_slug}"
        cls = type(
            f"EcNewsroomNewsletter_{spec.dg_slug}",
            (EcNewsroomNewsletterAdapter,),
            {
                "spec": spec,
                "key": key,
                "name": spec.name,
                "base_url": _listing_url(spec.dg_slug, spec.service_id, 1),
            },
        )
        classes.append(cls)
    return classes


EC_NEWSROOM_NEWSLETTER_ADAPTERS: list[type[EcNewsroomNewsletterAdapter]] = (
    make_ec_newsroom_adapters()
)
