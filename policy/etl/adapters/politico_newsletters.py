"""Politico Europe newsletter archives — full-issue back-catalogue pages.

politico.eu publishes each newsletter issue as an ordinary, unpaywalled web
page under ``/newsletter/<slug>/<article-slug>/``, with a paginated listing
at ``/newsletter/<slug>/page/<n>/`` (page 1 has no ``/page/1/`` variant — the
bare slug URL is page 1). Confirmed live 2026-07-22 via direct ``curl``
against the real production User-Agent: no bot wall, no login wall, every
URL tried returned HTTP 200 with the full article body — named diplomats and
live EU sanctions-negotiation detail on a real Brussels Playbook issue,
identical markup confirmed on Digital Bridge. Pagination terminates cleanly:
a page past the last real one returns HTTP 200 with zero ``article-card``
blocks (Brussels Playbook: page 150 has content, page 151 does not).

Independent of and complementary to the ``politico_eu`` RSS FeedSpec
(feeds.py): the RSS feed only carries forward-going content, this adapter
backfills the full historical archive.

Every EU-relevant newsletter in Politico's own "SUBSCRIBE to the POLITICO
newsletter family" footer list has been individually spot-checked live
(2026-07-22) at its real archive slug — several differ from the obvious
guess (EU Influence is ``politico-eu-influence``, not ``eu-influence``;
London Influence is ``politico-london-influence``; London Playbook PM
redirects into the plain ``london-playbook`` archive, so it is not a
separate entry) — each confirmed HTTP 200 with real ``article-card`` listing
content and genuine multi-page depth (Brussels Playbook: 150 pages: London
Playbook: 161; Playbook Paris: 67; Berlin Playbook: 35; EU Influence: 24;
Sunday Crunch: 21; London Influence: 15; Forecast: 7). D.C./Canada Playbook
and the paid Pro verticals are US-focused or paywalled — out of scope,
deliberately excluded.
"""

from __future__ import annotations

import datetime as dt
import re
from collections.abc import Iterable
from dataclasses import dataclass

import httpx
import structlog
from bs4 import BeautifulSoup

from data.models import DocumentType, Jurisdiction, LifecycleStage

from .base import DocRef, ParsedDocument, RawDocument, SourceAdapter

log = structlog.get_logger(__name__)

MAX_PAGES = 60  # safety cap per run; a weekly newsletter's whole archive is ~150 pages

_DATE_PUBLISHED_RE = re.compile(r'"datePublished"\s*:\s*"([^"]+)"')


@dataclass(frozen=True, slots=True)
class PoliticoNewsletterSpec:
    slug: str
    name: str


NEWSLETTER_SPECS: list[PoliticoNewsletterSpec] = [
    PoliticoNewsletterSpec(slug="brussels-playbook", name="Politico — Brussels Playbook"),
    PoliticoNewsletterSpec(slug="digital-bridge", name="Politico — Digital Bridge"),
    PoliticoNewsletterSpec(slug="berlin-playbook", name="Politico — Berlin Playbook"),
    PoliticoNewsletterSpec(slug="playbook-paris", name="Politico — Playbook Paris"),
    PoliticoNewsletterSpec(slug="london-playbook", name="Politico — London Playbook"),
    PoliticoNewsletterSpec(slug="sunday-crunch", name="Politico — Sunday Crunch"),
    PoliticoNewsletterSpec(slug="politico-eu-influence", name="Politico — EU Influence"),
    PoliticoNewsletterSpec(slug="politico-london-influence", name="Politico — London Influence"),
    PoliticoNewsletterSpec(slug="forecast", name="Politico — Forecast"),
]


def _listing_url(slug: str, page: int) -> str:
    base = f"https://www.politico.eu/newsletter/{slug}/"
    return base if page == 1 else f"{base}page/{page}/"


def _parse_listing(html: str, slug: str) -> list[dict]:
    """Each issue is an ``article-card`` block: title+href in
    ``h3.card__title a``, date in ``span.date-time__date`` (e.g.
    "July 20, 2026")."""
    soup = BeautifulSoup(html, "lxml")
    prefix = f"/newsletter/{slug}/"
    issues = []
    for card in soup.select("div.article-card"):
        link = card.select_one("h3.card__title a")
        href = link.get("href") if link else None
        if not link or not href:
            continue
        path = href.split("politico.eu", 1)[-1] if "politico.eu" in href else href
        article_slug = path[len(prefix) :].strip("/") if path.startswith(prefix) else ""
        if not article_slug or article_slug.startswith("page") or article_slug == "feed":
            continue
        date_span = card.select_one("span.date-time__date")
        date = None
        if date_span:
            try:
                date = dt.datetime.strptime(date_span.get_text(strip=True), "%B %d, %Y").date()
            except ValueError:
                date = None
        issues.append(
            {
                "slug": article_slug,
                "url": href if href.startswith("http") else f"https://www.politico.eu{href}",
                "title": link.get_text(strip=True),
                "date": date,
            }
        )
    return issues


class PoliticoNewsletterAdapter(SourceAdapter):
    """Concrete per-newsletter classes are built from ``NEWSLETTER_SPECS`` by
    ``make_politico_adapters`` below — same economics as feeds.py's
    ``make_feed_adapters``: one dataclass entry, no new class."""

    spec: PoliticoNewsletterSpec  # set on subclasses
    jurisdiction = Jurisdiction.EU

    def discover(self, since: dt.date | None, cursor: dict | None) -> Iterable[DocRef]:
        known_ids = set((cursor or {}).get("known_ids", []))
        for page in range(1, MAX_PAGES + 1):
            try:
                resp = self.http.get(_listing_url(self.spec.slug, page), accept="text/html")
            except httpx.HTTPStatusError as exc:
                # Termination is inconsistent across newsletters: some (e.g.
                # Brussels Playbook) return HTTP 200 with zero article-cards
                # past the last page; others (e.g. Forecast, confirmed live
                # 2026-07-22 — a real crash, not hypothetical) 404 instead.
                # Both mean the same thing: no more pages.
                if exc.response.status_code == 404:
                    break
                raise
            issues = _parse_listing(resp.text, self.spec.slug)
            if not issues:
                break
            # The listing is newest-first, so a page that reaches an issue the
            # cursor already holds has reached everything older too: stop
            # there. Without this every weekly run walked up to MAX_PAGES of
            # already-known listings per newsletter, nine newsletters back to
            # back on one host, and politico.eu answered 429 (run 115, five
            # newsletters crashed, one on /page/2/).
            hit_cutoff = False
            for issue in issues:
                ext_id = f"POLITICO-{self.spec.slug}-{issue['slug']}"
                if since and issue["date"] and issue["date"] < since:
                    hit_cutoff = True
                    continue
                if ext_id in known_ids:
                    hit_cutoff = True
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
        soup = BeautifulSoup(html, "lxml")
        title_el = soup.select_one("h1.hero__title")
        title = title_el.get_text(strip=True) if title_el else raw.ref.title
        content_el = soup.select_one("div.article__content")
        text = content_el.get_text("\n", strip=True) if content_el else ""
        if not title or not text:
            return None
        date = None
        m = _DATE_PUBLISHED_RE.search(html)
        if m:
            try:
                date = dt.datetime.fromisoformat(m.group(1).replace("Z", "+00:00")).date()
            except ValueError:
                date = None
        if date is None and raw.ref.hint.get("date"):
            date = dt.date.fromisoformat(raw.ref.hint["date"])
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
            extra={"channel": self.spec.slug, "kind": "newsletter_issue"},
        )

    def next_cursor(self, prev: dict | None, seen: list[DocRef]) -> dict | None:
        known = set((prev or {}).get("known_ids", [])) | {r.external_id for r in seen}
        return {"known_ids": sorted(known)[-3000:]}


def make_politico_adapters() -> list[type[PoliticoNewsletterAdapter]]:
    classes = []
    for spec in NEWSLETTER_SPECS:
        # slug is already "politico-eu-influence"-style for two entries —
        # strip the redundant prefix rather than doubling it in the key.
        bare_slug = spec.slug.removeprefix("politico-")
        key = f"politico_{bare_slug.replace('-', '_')}"
        cls = type(
            f"PoliticoNewsletter_{spec.slug}",
            (PoliticoNewsletterAdapter,),
            {
                "spec": spec,
                "key": key,
                "name": spec.name,
                "base_url": f"https://www.politico.eu/newsletter/{spec.slug}/",
            },
        )
        classes.append(cls)
    return classes


POLITICO_NEWSLETTER_ADAPTERS: list[type[PoliticoNewsletterAdapter]] = make_politico_adapters()
