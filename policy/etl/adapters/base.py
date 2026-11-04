"""Common contract every source adapter implements.

The pipeline only ever talks to this interface, so adding France (Légifrance),
Germany (Bundesgesetzblatt/BMWK), or any new EU source is a matter of dropping
in a new ``SourceAdapter`` subclass — nothing downstream changes.

Lifecycle per adapter:

    discover(since) -> [DocRef]      cheap listing of what exists / changed
    fetch(ref)      -> RawDocument   pull the bytes for one document
    parse(raw)      -> ParsedDocument normalize to the canonical shape

The pipeline handles hashing, versioning, upserts and cursor persistence so
adapters stay thin and focused on the quirks of their source.
"""

from __future__ import annotations

import abc
import datetime as dt
from collections.abc import Iterable
from dataclasses import dataclass, field

from data.models import DocumentType, Jurisdiction, LifecycleStage

# Shared discovery vocabulary for every keyword-filtered source (EUR-Lex,
# Have Your Say...). Deliberately wider than pure AI/data/cyber "tech" terms:
# a company-agnostic tracker needs new EU digital-economy, consumer-protection
# and platform-economy law to enter the corpus on its own the moment it's
# published, not only after someone happens to hand-notice a gap for one
# company's sector (found via a real cross-check against a travel platform's
# own tracker, which named several in-force acts — the Package Travel
# Directive recast, the Platform Work Directive, the Empowering Consumers for
# the Green Transition Directive — that this narrower, AI/data-only list would
# never have caught for ANY sector, not just travel). Keep this list itself
# sector-agnostic: add terms that widen coverage of "law that touches
# digital/platform business models generally", not one company's vertical.
DIGITAL_ECONOMY_SUBJECT_TERMS = [
    "artificial intelligence",
    "data protection",
    "personal data",
    "digital service",
    "digital market",
    "cybersecurity",
    "electronic communication",
    "online platform",
    "platform",
    "cloud",
    "consumer protection",
    "distance contract",
    "unfair commercial practice",
    "package travel",
    "sustainability reporting",
    "platform work",
    "online marketplace",
    "payment service",
]

# Title substrings that prove a false-positive collision with a broad term
# above ("platform", "cloud") rather than genuine tech-policy content —
# found via a live audit of the 2026-07-13 historical backfill (37 of 926
# `eurlex` documents): CFSP military-assistance decisions matching "platform"
# via "weapons platform" jargon, generic merger-control notices mentioning a
# company literally named "...Cloud..."/"...Platform...", EU ETS carbon-
# allowance auction platforms, literal vehicle/tractor load platforms, and a
# handful of EU social-policy initiatives also branded "platform" (anti-
# poverty, gender equality, undeclared work). Specific phrases only, same
# collision-safety discipline as `feeds.py`'s `TECH_KEYWORDS` "netz"/"chip"
# fixes — a bare word would risk cutting genuine recall along with the noise.
NOISE_EXCLUDE_TERMS = [
    "concentration (case m.",
    "cfsp",
    "auctioning",
    "auction platform",
    "load platform",
    "platform against poverty",
    "platform for action for gender equality",
    "prevention and deterrence of undeclared work",
    "non-performing loans",
]


def parse_iso_date(value: str | None) -> dt.date | None:
    """Leading ISO-8601 date out of ``value``, or None if absent/unparseable.

    Shared because three byte-identical private copies had accumulated
    (etl/adapters/eurlex.py, etl/adapters/law_tracker.py,
    etl/enrichment/lifecycle.py) — every one of them slicing ``[:10]`` to
    tolerate a full timestamp, which is exactly the behaviour a caller needs to
    be able to rely on rather than re-derive.
    """
    if not value:
        return None
    try:
        return dt.date.fromisoformat(value[:10])
    except ValueError:
        return None


def is_noise_collision(text: str) -> bool:
    """True if ``text`` only looks tech-relevant because of one of the
    collision patterns above — callers should treat this as a hard
    exclusion even when a positive keyword also matches."""
    lowered = text.lower()
    return any(term in lowered for term in NOISE_EXCLUDE_TERMS)


@dataclass(slots=True)
class DocRef:
    """A pointer to one document discovered at a source, before fetching."""

    external_id: str  # stable id within the source (CELEX, procedure ref, URL...)
    url: str
    title: str | None = None
    hint: dict = field(default_factory=dict)  # carries metadata discover() already knows


@dataclass(slots=True)
class RawDocument:
    """Raw payload fetched for a single document."""

    ref: DocRef
    content: bytes
    content_type: str  # mime, used to pick a parser (html/xml/pdf)
    fetched_at: dt.datetime


@dataclass(slots=True)
class ParsedDocument:
    """Source-agnostic, normalized representation the pipeline persists."""

    external_id: str
    title: str
    jurisdiction: Jurisdiction
    document_type: DocumentType
    lifecycle_stage: LifecycleStage
    text: str
    raw_format: str = "html"
    language: str = "en"
    url: str | None = None
    celex: str | None = None
    eli: str | None = None
    date_document: dt.date | None = None
    date_in_force: dt.date | None = None
    date_end_validity: dt.date | None = None
    # NOTE: there are deliberately no ``policy_area_slugs`` / ``sector_slugs``
    # fields here. Policy-area and sector tagging is owned end-to-end by
    # etl/enrichment/classification.py's bulk pass. The pipeline used to have an
    # ``_attach_vocab()`` write-path fed from this dataclass; it never fired
    # (no adapter ever populated it) and was removed rather than left as a
    # loaded gun: an adapter that started supplying tags would have overwritten
    # the LLM classification on every re-sighting AND permanently suppressed
    # ``classify_pending``, whose filter is ``~Document.policy_areas.any()``.
    extra: dict = field(default_factory=dict)


class SourceAdapter(abc.ABC):
    """Base class for all ingestion adapters."""

    #: stable key, also used as the `sources.key` value
    key: str
    #: human-readable name persisted to `sources.name`
    name: str
    jurisdiction: Jurisdiction
    base_url: str | None = None

    def __init__(self, http, settings):
        self.http = http
        self.settings = settings

    @abc.abstractmethod
    def discover(self, since: dt.date | None, cursor: dict | None) -> Iterable[DocRef]:
        """Yield references to documents to (re)ingest, newest-relevant first."""

    @abc.abstractmethod
    def fetch(self, ref: DocRef) -> RawDocument:
        """Retrieve the raw content for one document."""

    @abc.abstractmethod
    def parse(self, raw: RawDocument) -> ParsedDocument | None:
        """Normalize raw content into the canonical shape. May return None to
        drop a document that turns out to be out of scope only after fetching
        (e.g. an off-topic legislative procedure)."""

    def next_cursor(self, prev: dict | None, seen: list[DocRef]) -> dict | None:
        """Return an updated cursor to persist after a successful run.

        Default is a no-op; sources with pagination/timestamps override this.
        """
        return prev
