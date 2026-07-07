"""Legislative Observatory (OEIL) via the EP Open Data API.

The OEIL website is a JS app with no export endpoint, but the same procedure
data is served by the European Parliament's Open Data API (verified live):

    GET data.europarl.europa.eu/api/v2/procedures?year=YYYY   (list, paginated)
    GET data.europarl.europa.eu/api/v2/procedures/{id}        (detail)

This is the EU "pipeline" layer: which files are moving, and where they sit.
Strategy: list current + previous year, fetch detail per new procedure, keep
ordinary legislative procedures (COD/CNS) whose multilingual title matches the
tech vocabulary; everything else is dropped at parse (returns None) and its id
cached in the cursor so it is never re-fetched. Tech-relevant procedures are
re-fetched every run so stage changes keep the Document row current.
"""

from __future__ import annotations

import datetime as dt
import json
from collections.abc import Iterable

import structlog

from data.models import DocumentType, Jurisdiction, LifecycleStage

from .base import DocRef, ParsedDocument, RawDocument, SourceAdapter
from .feeds import is_tech_relevant

log = structlog.get_logger(__name__)

API = "https://data.europarl.europa.eu/api/v2/procedures"
PUBLIC_URL = "https://oeil.secure.europarl.europa.eu/oeil/en/procedure-file?reference={label}"
PAGE_SIZE = 100
MAX_PAGES = 20  # per year, safety cap
# Procedure types worth tracking: ordinary legislative procedure + consultation.
TRACKED_TYPES = ("COD", "CNS")

# Publications Office procedure-phase URIs → our lifecycle stages. Anything
# unmapped stays PROPOSED (it is in procedure, by definition).
PHASE_TO_STAGE = {
    "PREP": LifecycleStage.PLANNED,
    "RDG1": LifecycleStage.PROPOSED,
    "RDG2": LifecycleStage.PROPOSED,
    "RDG3": LifecycleStage.PROPOSED,
    "CONC": LifecycleStage.PROPOSED,
    "SIGN": LifecycleStage.ADOPTED,
    "PUBL": LifecycleStage.ADOPTED,
    "COMP": LifecycleStage.ADOPTED,
}


def _first(value) -> str:
    """API fields arrive as str or list-of-str; normalize to one string."""
    if isinstance(value, list):
        value = value[0] if value else ""
    return str(value or "")


def _suffix(value) -> str:
    """Trailing segment of a URI-ish field that may arrive as str or list."""
    return _first(value).rsplit("/", 1)[-1]


class OeilAdapter(SourceAdapter):
    key = "oeil"
    name = "Legislative Observatory (EP Open Data)"
    jurisdiction = Jurisdiction.EU
    base_url = "https://oeil.secure.europarl.europa.eu/oeil/"

    def __init__(self, http, settings):
        super().__init__(http, settings)
        self._skipped: set[str] = set()

    def discover(self, since: dt.date | None, cursor: dict | None) -> Iterable[DocRef]:
        known_offtopic = set((cursor or {}).get("offtopic", []))
        year = dt.date.today().year
        for y in (year, year - 1):
            for page in range(MAX_PAGES):
                resp = self.http.get(
                    API,
                    accept="application/ld+json",
                    params={"year": y, "limit": PAGE_SIZE, "offset": page * PAGE_SIZE},
                )
                rows = resp.json().get("data", [])
                for row in rows:
                    pid = row.get("process_id")
                    ptype = _suffix(row.get("process_type"))
                    if not pid or ptype not in TRACKED_TYPES or pid in known_offtopic:
                        continue
                    label = _first(row.get("label")) or pid
                    yield DocRef(
                        external_id=pid,
                        url=PUBLIC_URL.format(label=label),
                        title=label,
                        hint={"label": label, "process_type": ptype},
                    )
                if len(rows) < PAGE_SIZE:
                    break

    def fetch(self, ref: DocRef) -> RawDocument:
        resp = self.http.get(f"{API}/{ref.external_id}", accept="application/ld+json")
        return RawDocument(
            ref=ref,
            content=resp.content,
            content_type="application/json",
            fetched_at=dt.datetime.now(dt.UTC),
        )

    def parse(self, raw: RawDocument) -> ParsedDocument | None:
        data = (json.loads(raw.content).get("data") or [{}])[0]
        pid = data.get("process_id") or raw.ref.external_id
        titles = data.get("process_title") or {}
        title = titles.get("en") or next(iter(titles.values()), raw.ref.title or pid)

        # Judge relevance on every language we track — a French/German title can
        # match where a bureaucratic English one does not.
        judged = " ".join(v for k, v in titles.items() if k in ("en", "fr", "de")) or title
        if not is_tech_relevant(judged):
            self._skipped.add(pid)
            return None

        phase = _suffix(data.get("current_stage"))
        label = _first(data.get("label")) or raw.ref.hint.get("label") or pid
        return ParsedDocument(
            external_id=pid,
            title=title,
            jurisdiction=Jurisdiction.EU,
            document_type=DocumentType.PROPOSAL,
            lifecycle_stage=PHASE_TO_STAGE.get(phase, LifecycleStage.PROPOSED),
            text=f"{label} — {title}",
            raw_format="text",
            language="en",
            url=PUBLIC_URL.format(label=label),
            extra={
                "procedure_label": label,
                "process_type": raw.ref.hint.get("process_type"),
                "procedure_phase": phase or None,
            },
        )

    def next_cursor(self, prev: dict | None, seen: list[DocRef]) -> dict | None:
        """Remember permanently off-topic procedure ids so they are never
        detail-fetched again; relevant ones stay re-fetchable for stage updates."""
        offtopic = set((prev or {}).get("offtopic", [])) | self._skipped
        return {"offtopic": sorted(offtopic)[-8000:]}
