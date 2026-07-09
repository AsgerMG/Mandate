"""Adapter registry — the single source of truth for what `refresh` collects.

Adding a jurisdiction/source later means writing one SourceAdapter subclass (or
one FeedSpec in feeds.py for RSS/Atom channels) and appending it here; the
orchestrator and CLI pick it up automatically.
"""

from .adlc_decisions import AutoriteConcurrenceAdapter
from .an_dossiers import AssembleeNationaleAdapter
from .an_verbatim import AnVerbatimAdapter
from .base import DocRef, ParsedDocument, RawDocument, SourceAdapter
from .de_verbatim import DeVerbatimAdapter
from .ep_verbatim import EpVerbatimAdapter
from .eurlex import EurLexAdapter
from .eurlex_key_acts import EurLexKeyActsAdapter
from .feeds import FEED_ADAPTERS
from .have_your_say import HaveYourSayAdapter
from .law_tracker import LawTrackerAdapter
from .oeil import OeilAdapter
from .senat_dossiers import SenatDossiersAdapter

ADAPTERS: list[type[SourceAdapter]] = [
    EurLexAdapter,
    EurLexKeyActsAdapter,
    LawTrackerAdapter,
    OeilAdapter,
    EpVerbatimAdapter,
    HaveYourSayAdapter,
    AssembleeNationaleAdapter,
    AnVerbatimAdapter,
    SenatDossiersAdapter,
    AutoriteConcurrenceAdapter,
    DeVerbatimAdapter,
    *FEED_ADAPTERS,
]

ADAPTERS_BY_KEY: dict[str, type[SourceAdapter]] = {a.key: a for a in ADAPTERS}

__all__ = [
    "ADAPTERS",
    "ADAPTERS_BY_KEY",
    "SourceAdapter",
    "DocRef",
    "RawDocument",
    "ParsedDocument",
]
