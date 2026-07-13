"""EUR-Lex adapter — the authoritative spine of the EU corpus.

Discovery uses the EU Publications Office SPARQL endpoint (Cellar), which
exposes structured metadata (CELEX, type, dates) so we get clean classification
and lifecycle signals instead of scraping search HTML. Content is then fetched
via EUR-Lex content negotiation.

This is the reference implementation other adapters are modelled on. It is
written against the live public endpoints; network access is required to run it.
"""

from __future__ import annotations

import datetime as dt
import warnings
from collections.abc import Iterable
from urllib.parse import quote

import structlog
from bs4 import BeautifulSoup, XMLParsedAsHTMLWarning

from data.models import DocumentType, Jurisdiction, LifecycleStage

from .base import (
    DIGITAL_ECONOMY_SUBJECT_TERMS,
    NOISE_EXCLUDE_TERMS,
    DocRef,
    ParsedDocument,
    RawDocument,
    SourceAdapter,
)

log = structlog.get_logger(__name__)

# Newer Official Journal documents are served as XHTML. We deliberately use the
# lenient HTML parser so one code path handles both HTML and XHTML content; the
# resulting "looks like XML" warning is therefore expected noise.
warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)

SPARQL_ENDPOINT = "https://publications.europa.eu/webapi/rdf/sparql"

# Content is fetched from the Publications Office Cellar (the machine-access
# endpoint). The human-facing eur-lex.europa.eu/legal-content host sits behind
# an AWS WAF that bot-challenges programmatic clients; Cellar does not.
CELLAR_CONTENT_URL = "http://publications.europa.eu/resource/celex/{celex}"
# Manifestation availability varies by document type (a proposal may offer
# text/html, a regulation application/xhtml+xml); take the first that exists.
# Both parse with the same lenient HTML parser. PDF-only acts are a TODO.
CONTENT_ACCEPTS = ["text/html", "application/xhtml+xml"]

# Human-facing URL stored on the Document for click-through.
PUBLIC_URL = "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:{celex}"


def cellar_content_url(celex: str) -> str:
    """CELLAR_CONTENT_URL with the CELEX percent-encoded. Most CELEX ids are
    URL-safe as-is, but ones with a parenthetical suffix (multiple documents
    published under one OJ number, e.g. corrigenda or same-issue recommend-
    ations — "32023H0120(01)") 404 unencoded: literal parentheses are valid
    URI sub-delims so httpx passes them through raw, but Cellar's own server
    requires them percent-encoded."""
    return CELLAR_CONTENT_URL.format(celex=quote(celex, safe=""))

# CELEX sector/descriptor heuristics → our document_type vocabulary.
# CELEX descriptor letter (position 5) encodes the document nature:
#   R=regulation, L=directive, D=decision, PC=proposal (COM), DC=communication
_TYPE_BY_DESCRIPTOR = {
    "R": DocumentType.REGULATION,
    "L": DocumentType.DIRECTIVE,
    "D": DocumentType.DECISION,
}

# Alias kept for readability at call sites in this file; the real list lives
# in base.py so every keyword-filtered adapter shares one vocabulary instead
# of maintaining separate copies that silently drift apart.
TECH_SUBJECT_TERMS = DIGITAL_ECONOMY_SUBJECT_TERMS


def _build_discovery_query(since: dt.date, limit: int) -> str:
    """SPARQL over Cellar for recent acts whose title matches tech terms.

    Title filtering is a pragmatic first cut; a later iteration can switch to
    EuroVoc concept URIs for higher precision.
    """
    title_filter = " || ".join(
        f'CONTAINS(LCASE(STR(?title)), "{t}")' for t in TECH_SUBJECT_TERMS
    )
    exclude_filter = " && ".join(
        f'!CONTAINS(LCASE(STR(?title)), "{t}")' for t in NOISE_EXCLUDE_TERMS
    )
    return f"""
    PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
    PREFIX lang: <http://publications.europa.eu/resource/authority/language/>
    SELECT DISTINCT ?celex ?title ?date ?type WHERE {{
      ?work cdm:resource_legal_id_celex ?celex .
      ?work cdm:work_date_document ?date .
      ?expr cdm:expression_belongs_to_work ?work ;
            cdm:expression_uses_language lang:ENG ;
            cdm:expression_title ?title .
      OPTIONAL {{ ?work cdm:work_has_resource-type ?type . }}
      FILTER (?date >= "{since.isoformat()}"^^<http://www.w3.org/2001/XMLSchema#date>)
      # CELEX sector 3 = legislation, 5 = preparatory acts/COM proposals. This
      # keeps the corpus to policy documents and drops case-law (6), treaties
      # (1/2) etc. that match on title alone.
      FILTER (STRSTARTS(?celex, "3") || STRSTARTS(?celex, "5"))
      FILTER ({title_filter})
      # Broad terms like "platform"/"cloud" also match false positives (CFSP
      # military decisions, merger notices, carbon-auction platforms...) —
      # see NOISE_EXCLUDE_TERMS in base.py for the live-audit writeup.
      FILTER ({exclude_filter})
    }}
    ORDER BY DESC(?date)
    LIMIT {limit}
    """


class EurLexAdapter(SourceAdapter):
    key = "eurlex"
    name = "EUR-Lex (EU legal acts)"
    jurisdiction = Jurisdiction.EU
    base_url = "https://eur-lex.europa.eu"

    # A live COUNT of every sector-3/5 work matching TECH_SUBJECT_TERMS across
    # ALL of Cellar's history (no date filter) came back at 1,814 (2026-07-13)
    # — comfortably under this cap, with headroom for growth. `discover()`
    # combines this with `ORDER BY DESC(?date)`, so as long as the true count
    # stays under the limit nothing is silently dropped regardless of how wide
    # `backfill_days` is; a limit near the true count (the old 200) would
    # silently truncate older matches within the window even without a
    # `since` bug, since SPARQL applies LIMIT after ORDER BY.
    discovery_limit = 3000

    def discover(self, since: dt.date | None, cursor: dict | None) -> Iterable[DocRef]:
        since = since or (dt.date.today() - dt.timedelta(days=self.settings.backfill_days))
        query = _build_discovery_query(since, self.discovery_limit)
        resp = self.http.get(
            SPARQL_ENDPOINT,
            accept="application/sparql-results+json",
            params={"query": query, "format": "application/sparql-results+json"},
        )
        bindings = resp.json().get("results", {}).get("bindings", [])
        for row in bindings:
            celex = row["celex"]["value"]
            yield DocRef(
                external_id=celex,
                url=cellar_content_url(celex),
                title=row.get("title", {}).get("value"),
                hint={
                    "celex": celex,
                    "date": row.get("date", {}).get("value"),
                    "type_uri": row.get("type", {}).get("value"),
                },
            )

    def fetch(self, ref: DocRef) -> RawDocument:
        resp = self.http.negotiate(ref.url, CONTENT_ACCEPTS, accept_language="eng")
        if resp is None:
            # No HTML/XHTML representation (e.g. PDF-only act). Skip for now; a
            # PDF-text fallback is on the backlog.
            raise ValueError(f"No HTML/XHTML manifestation for {ref.external_id}")
        return RawDocument(
            ref=ref,
            content=resp.content,
            content_type=resp.headers.get("content-type", "text/html"),
            fetched_at=dt.datetime.now(dt.UTC),
        )

    def parse(self, raw: RawDocument) -> ParsedDocument:
        celex = raw.ref.hint.get("celex", raw.ref.external_id)
        soup = BeautifulSoup(raw.content, "lxml")
        text = _extract_text(soup)
        title = (raw.ref.title or _extract_title(soup) or celex).strip()
        date = _parse_date(raw.ref.hint.get("date"))

        return ParsedDocument(
            external_id=celex,
            title=title,
            jurisdiction=Jurisdiction.EU,
            document_type=_classify_type(celex),
            lifecycle_stage=_classify_stage(celex),
            text=text,
            raw_format="html",
            language="en",
            url=PUBLIC_URL.format(celex=celex),
            celex=celex,
            date_document=date,
            extra={"celex": celex},
        )


def _extract_text(soup: BeautifulSoup) -> str:
    for tag in soup(["script", "style", "nav", "header", "footer"]):
        tag.decompose()
    body = soup.find("div", {"id": "text"}) or soup.body or soup
    # Walking both "p" and "div" double- (or many-times-) counts text: a <div>
    # wrapping several <p> children gets its own get_text() call AND each
    # child <p> gets one too, and the duplication compounds with nesting
    # depth — confirmed on real acts (MiCA came out at 3.6M chars / ~11k
    # repeats of "crypto-asset" before this fix, for what is a ~150-page
    # regulation). Only leaf-ish blocks are collected: elements with no
    # block-level element among their own descendants, so a paragraph's text
    # is captured exactly once regardless of how many divs wrap it.
    blocks = [el for el in body.find_all(["p", "div", "li"]) if not el.find(["p", "div", "li"])]
    text = "\n\n".join(b.get_text(" ", strip=True) for b in blocks if b.get_text(strip=True))
    return text or body.get_text("\n", strip=True)


def _extract_title(soup: BeautifulSoup) -> str | None:
    el = soup.find("p", {"id": "title"}) or soup.find("title")
    return el.get_text(" ", strip=True) if el else None


def _classify_type(celex: str) -> DocumentType:
    # CELEX e.g. "32016R0679" -> sector '3', year '2016', descriptor 'R'.
    descriptor = celex[5:6] if len(celex) > 5 else ""
    if celex[5:7] == "PC":  # proposal for an act (COM document)
        return DocumentType.PROPOSAL
    if celex[5:7] == "DC":  # communication
        return DocumentType.COMMUNICATION
    return _TYPE_BY_DESCRIPTOR.get(descriptor, DocumentType.OTHER)


def _classify_stage(celex: str) -> LifecycleStage:
    # Stage must be sector-aware. Sector 5 = preparatory acts (proposals,
    # communications) — never "in force"; sector 3 = legislation that, once
    # adopted, defaults to in_force. A later iteration refines this from
    # Cellar's in-force / repeal metadata.
    sector = celex[0:1]
    if celex[5:7] == "PC":  # a tabled proposal, in procedure
        return LifecycleStage.PROPOSED
    if sector == "3" and celex[5:6] in _TYPE_BY_DESCRIPTOR:
        return LifecycleStage.IN_FORCE
    return LifecycleStage.UNKNOWN


def _parse_date(value: str | None) -> dt.date | None:
    if not value:
        return None
    try:
        return dt.date.fromisoformat(value[:10])
    except ValueError:
        return None
