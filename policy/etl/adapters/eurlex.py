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
import re
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
    parse_iso_date,
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

# EUR-Lex's own RSS feeds prefix every item title with the act's CELEX id:
#   "CELEX:32026R1881: Regulation (EU) 2026/1881 of the European Parliament…"
# That title is the ONLY place those feeds expose it — their <link>/<guid> is an
# opaque CELLAR uuid URL — so parsing it here is what lets a feed-ingested act be
# typed, dated and lifecycle-enriched like any other EUR-Lex document. Without
# it all 23 documents in eurlex_oj_l / eurlex_ep_council_legislation sat at
# `celex IS NULL`, type OTHER: reclassify_celex_documents filters on
# `celex IS NOT NULL` and enrich_lifecycle on both celex and document_type, so
# every downstream step skipped them.
#
# A CELEX id is a sector digit, a 4-digit year, then a 1-2 letter descriptor and
# a number — plus, for some acts, a parenthetical suffix ("32023H0120(01)").
# Sector "E" (EFTA) also occurs live, hence the leading character class.
_CELEX_IN_TITLE = re.compile(r"^\s*CELEX\s*:\s*([0-9A-Z]{5,}[0-9A-Z()]*)", re.IGNORECASE)


def celex_from_title(title: str | None) -> str | None:
    """The CELEX id a EUR-Lex feed prefixed onto ``title``, or None."""
    match = _CELEX_IN_TITLE.match(title or "")
    return match.group(1).upper() if match else None


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


def _build_discovery_query(
    since: dt.date,
    limit: int,
    *,
    sectors: tuple[str, ...] = ("3", "5"),
    exclude_noise: bool = True,
) -> str:
    """SPARQL over Cellar for recent works whose title matches tech terms.

    Title filtering is a pragmatic first cut; a later iteration can switch to
    EuroVoc concept URIs for higher precision.

    ``sectors`` selects which CELEX sectors to admit — the only thing separating
    legislation (3/5) from case law (6), which is otherwise fetched, parsed and
    stored by exactly the same code path. ``exclude_noise`` is overridable
    because NOISE_EXCLUDE_TERMS was audited against legislative titles; some of
    those terms ("merger notice") would wrongly drop genuinely relevant
    judgments, so a case-law source may want the unfiltered set.
    """
    title_filter = " || ".join(
        f'CONTAINS(LCASE(STR(?title)), "{t}")' for t in TECH_SUBJECT_TERMS
    )
    exclude_filter = (
        " && ".join(f'!CONTAINS(LCASE(STR(?title)), "{t}")' for t in NOISE_EXCLUDE_TERMS)
        if exclude_noise
        else "true"
    )
    sector_filter = " || ".join(f'STRSTARTS(?celex, "{s}")' for s in sectors)
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
      # CELEX sector: 3 = legislation, 5 = preparatory acts/COM proposals,
      # 6 = case law. Treaties (1/2) and national transposition (7) are never
      # admitted — they match on title alone without being brief-relevant.
      FILTER ({sector_filter})
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

    # CELEX sectors this source admits — see _build_discovery_query. Overridden
    # by EurLexCaseLawAdapter; kept a class attribute so the two sources differ
    # by declaration rather than by a forked copy of discover().
    sectors: tuple[str, ...] = ("3", "5")
    exclude_noise = True

    def owned_elsewhere(self) -> frozenset[str]:
        """CELEXes another adapter is the designated owner of, and which this
        source must therefore not discover.

        ``eurlex_key_acts`` re-ingests its whole curated list on every single
        run (``for celex in KEY_ACTS``), and the ``uq_document_source_external``
        constraint is scoped to (source_id, external_id) — so any act this
        date-scoped discovery also surfaces becomes two Document rows holding
        byte-identical content, permanently. Verified live 2026-08-07: 16
        CELEXes duplicated exactly that way (AI Act, GDPR, DSA, DMA, NIS2, CRA,
        EECC…), 3,290 redundant passages, one distinct content_hash per pair.

        Cleaning the rows up in the database alone would not hold — the curated
        adapter deterministically regenerates its side on the next refresh — so
        the guard has to live in discovery, making ``eurlex_key_acts`` the
        single owner of the canon set. That direction (rather than the reverse)
        because the curated list is the one that must exist regardless of age;
        this adapter would only rediscover a canon act while it happens to fall
        inside the backfill window.

        Imported lazily: ``eurlex_key_acts`` subclasses this adapter, so a
        module-level import would be circular.
        """
        from .eurlex_key_acts import KEY_ACTS

        return frozenset(KEY_ACTS)

    def discover(self, since: dt.date | None, cursor: dict | None) -> Iterable[DocRef]:
        since = since or (dt.date.today() - dt.timedelta(days=self.settings.backfill_days))
        query = _build_discovery_query(
            since,
            self.discovery_limit,
            sectors=self.sectors,
            exclude_noise=self.exclude_noise,
        )
        resp = self.http.get(
            SPARQL_ENDPOINT,
            accept="application/sparql-results+json",
            params={"query": query, "format": "application/sparql-results+json"},
        )
        bindings = resp.json().get("results", {}).get("bindings", [])
        owned_elsewhere = self.owned_elsewhere()
        skipped = 0
        for row in bindings:
            celex = row["celex"]["value"]
            if celex in owned_elsewhere:
                skipped += 1
                continue
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
        if skipped:
            log.info("skipped_key_acts_owned_celexes", source=self.key, count=skipped)

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
        date = parse_iso_date(raw.ref.hint.get("date"))

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


# Two-character CELEX descriptors, checked before the single-letter table.
# Derived from what this corpus actually contains (counted 2026-07-27 over the
# 459 eurlex documents that were falling through to OTHER) rather than from the
# full CELEX specification — an unlisted descriptor still lands in OTHER, which
# is the honest answer for something we haven't looked at.
_TYPE_BY_DESCRIPTOR_2 = {
    # Sector 5 — preparatory acts
    "PC": DocumentType.PROPOSAL,  # COM proposal for an act
    "DC": DocumentType.COMMUNICATION,  # COM communication
    "JC": DocumentType.COMMUNICATION,  # joint communication (COM + High Rep)
    "SC": DocumentType.STAFF_WORKING_DOC,  # staff working doc / impact assessment
    "AP": DocumentType.OPINION,  # EP legislative position / amendments
    "IP": DocumentType.OPINION,  # EP non-legislative resolution
    "AE": DocumentType.OPINION,  # EESC opinion (on a proposal)
    "IE": DocumentType.OPINION,  # EESC own-initiative opinion
    "AR": DocumentType.OPINION,  # Committee of the Regions opinion
    "IR": DocumentType.OPINION,  # CoR own-initiative opinion
    "AB": DocumentType.OPINION,  # ECB opinion
    "AA": DocumentType.OPINION,  # Court of Auditors opinion
    "BP": DocumentType.BUDGET,  # budget guidelines / procedure
    "XC": DocumentType.GUIDELINE,  # Commission notice / interpretative guidance
    "XG": DocumentType.GUIDELINE,  # Council conclusions
    # Sector 6 — case law. Two-char because the third position carries the
    # document nature, and a judgment must never be mistaken for a proposal.
    # The full-text forms (CJ/TJ/...) and the OJ-notice forms (CA/TA/...) are
    # both present in Cellar and both matter: verified live 2026-07-27 over 400
    # sector-6 works, CA alone accounted for 83 of them, so mapping only the
    # full-text descriptors left a third of all case law typed OTHER — i.e. in
    # the commentary tier, which is the exact failure this whole pass exists to
    # fix.
    "CJ": DocumentType.JUDGMENT,  # Court of Justice judgment (full text)
    "CA": DocumentType.JUDGMENT,  # ...same judgment as an OJ notice/summary
    "CO": DocumentType.JUDGMENT,  # Court order
    "CB": DocumentType.JUDGMENT,  # ...order as an OJ notice
    "CC": DocumentType.OPINION,  # Advocate General opinion — persuasive, not binding
    "CN": DocumentType.OTHER,  # new case/appeal lodged — no ruling yet, nothing to cite
    "TJ": DocumentType.JUDGMENT,  # General Court judgment (full text)
    "TA": DocumentType.JUDGMENT,  # ...General Court judgment as an OJ notice
    "TO": DocumentType.JUDGMENT,  # General Court order
    "TB": DocumentType.JUDGMENT,  # ...General Court order as an OJ notice
    "TN": DocumentType.OTHER,  # action brought before the General Court — pending
    "FJ": DocumentType.JUDGMENT,  # Civil Service Tribunal judgment
}

# Single-letter descriptors (sector 3, legislation). R/L/D live in
# _TYPE_BY_DESCRIPTOR near the top of this file; these are the rest found live.
_TYPE_BY_DESCRIPTOR_1_EXTRA = {
    "H": DocumentType.GUIDELINE,  # recommendation — soft law
    "Q": DocumentType.GUIDELINE,  # institutional rules, EDPB decisions
    "B": DocumentType.BUDGET,  # budgetary instrument (see DocumentType.BUDGET)
    "A": DocumentType.OTHER,  # international agreement — rarely brief-relevant
    "X": DocumentType.OTHER,  # miscellaneous
    "E": DocumentType.OTHER,  # ECSC-era acts
}


def _classify_type(celex: str) -> DocumentType:
    """CELEX descriptor -> document type.

    CELEX layout: sector digit, 4-digit year, then a descriptor that is either
    one letter + a number (sector 3, e.g. "32016R0679" -> R) or two letters
    (sectors 5 and 6, e.g. "52022PC0209" -> PC, "62021CJ0184" -> CJ). The
    two-character table is consulted first because a one-character read of "CJ"
    would see "C" and a one-character read of "SC" would see "S" — both
    meaningless, and both previously landing in OTHER.
    """
    if len(celex) < 6:
        return DocumentType.OTHER
    two = celex[5:7]
    if two in _TYPE_BY_DESCRIPTOR_2:
        return _TYPE_BY_DESCRIPTOR_2[two]
    one = celex[5:6]
    if one in _TYPE_BY_DESCRIPTOR:
        return _TYPE_BY_DESCRIPTOR[one]
    return _TYPE_BY_DESCRIPTOR_1_EXTRA.get(one, DocumentType.OTHER)


def _classify_stage(celex: str) -> LifecycleStage:
    # Stage must be sector-aware. Sector 5 = preparatory acts (proposals,
    # communications) — never "in force"; sector 3 = legislation that, once
    # adopted, defaults to in_force; sector 6 = case law, which is decided
    # rather than in force.
    #
    # This is the CELEX-only fallback. It cannot distinguish "in force" from
    # "in force but not yet applicable" — that needs Cellar's own date
    # metadata, which enrich_lifecycle() supplies and which overrides whatever
    # this returns. Keep this coarse and correct rather than precise and wrong.
    sector = celex[0:1]
    if celex[5:7] == "PC":  # a tabled proposal, in procedure
        return LifecycleStage.PROPOSED
    if sector == "6":  # a judgment/order stands once handed down
        return LifecycleStage.ADOPTED
    if sector == "3" and _classify_type(celex) is not DocumentType.OTHER:
        return LifecycleStage.IN_FORCE
    return LifecycleStage.UNKNOWN


class EurLexCaseLawAdapter(EurLexAdapter):
    """EU case law (CELEX sector 6) — the enforcement layer the corpus lacked.

    Measured 2026-07-27: the corpus held **zero** judgments, because
    _build_discovery_query admitted only sectors 3 and 5. A live count over the
    same endpoint found 721 sector-6 works matching just three tech terms since
    2020, so this was never a data-availability problem — the filter simply
    excluded them.

    Why it matters for the brief specifically: a compliance verdict turns on what
    a provision *requires*, and for contested provisions that is settled by the
    Court, not by the text. Schrems II is what makes a transfer clause
    actionable; the AI Act's own wording does not tell you how "substantial
    modification" has been read. Without case law the brief can cite what the law
    says and nothing about how it has actually been applied — which is also the
    one thing an agentic browser finds easily, so its absence was a
    differentiation gap as well as a quality gap.

    Inherits fetch and parse wholesale: judgments live in the same Cellar,
    are served over the same content negotiation, and carry CELEX ids that
    _classify_type already maps (CJ/TJ/CO/TO -> JUDGMENT, CC -> OPINION for an
    Advocate General's non-binding opinion).
    """

    key = "eurlex_case_law"
    name = "EUR-Lex — EU case law (CJEU, General Court)"
    sectors = ("6",)

    # NOISE_EXCLUDE_TERMS was audited against legislative titles, where "merger
    # notice" and similar denote routine administrative filings worth dropping.
    # In case law the same words appear in genuinely relevant competition
    # judgments, so excluding them would silently discard the enforcement
    # precedent this source exists to add. Re-audit against real judgment titles
    # before turning it back on.
    exclude_noise = False

    # Judgments accumulate at a far lower rate than legislation plus preparatory
    # acts, and the live count above (721 for three terms) is the scale to expect
    # across the full term vocabulary rather than thousands.
    discovery_limit = 1500
