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
    policy_area_slugs: list[str] = field(default_factory=list)
    sector_slugs: list[str] = field(default_factory=list)
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
