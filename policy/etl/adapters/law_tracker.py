"""EU Law Tracker adapter — the interinstitutional legislative pipeline.

law-tracker.europa.eu (Publications Office, launched 2024) tracks ordinary
legislative procedures (COD) from proposal to adoption with a merged
Commission/EP/Council event timeline. It is a front-end over the same Cellar
data as EUR-Lex, but its undocumented JSON API is the cleanest per-procedure
timeline available (reverse-engineered 2026-07-06; no auth, no key):

  * ``POST /search`` — filter by EUR-Lex directory code; ``132060`` =
    "13.20.60 Information technology, telecommunications and data-processing",
    so results are tech-relevant by construction (no keyword filter needed).
    ``page`` is 0-indexed and ``countResults`` must be false to get items.
  * ``GET /notice/timeline?reference=YYYY_N`` — full event timeline; the
    reference is year_number with the number's leading zeros stripped.

Coverage is dense from 2021 onward only (e.g. the DMA's 2020 procedure is
absent) — the foundational acts themselves come from ``eurlex_key_acts``;
this source is for what's moving *now*. Complements OEIL (EP-centric, richer
for older files). The API is undocumented and may change without notice.
"""

from __future__ import annotations

import datetime as dt
import json
from collections.abc import Iterable

import structlog

from data.models import DocumentType, Jurisdiction, LifecycleStage

from .base import DocRef, ParsedDocument, RawDocument, SourceAdapter, parse_iso_date

log = structlog.get_logger(__name__)

SEARCH_URL = "https://law-tracker.europa.eu/search"
TIMELINE_URL = "https://law-tracker.europa.eu/notice/timeline"
PUBLIC_URL = "https://law-tracker.europa.eu/procedure/{ref_id}?lang=en"

# EUR-Lex directory code 13.20.60 — IT, telecommunications and data-processing.
POLICY_AREAS = ["132060"]
PAGE_SIZE = 50
MAX_PAGES = 10  # safety cap

_STAGE_BY_STATUS = {
    "ONG": LifecycleStage.PROPOSED,
    "ADO": LifecycleStage.ADOPTED,
    "REJ": LifecycleStage.REPEALED,
}


class LawTrackerAdapter(SourceAdapter):
    key = "law_tracker"
    name = "EU Law Tracker (legislative procedures, IT/telecoms/data)"
    jurisdiction = Jurisdiction.EU
    base_url = "https://law-tracker.europa.eu"

    def discover(self, since: dt.date | None, cursor: dict | None) -> Iterable[DocRef]:
        # No `since` filtering: an old procedure can gain new events any day;
        # the pipeline's content hashing makes unchanged re-fetches free.
        for page in range(MAX_PAGES):
            payload = {
                "quickSearch": "",
                "topics": {"eurovoc": [], "policyArea": POLICY_AREAS},
                "sort": {"order": "DOCD", "direction": "DESC"},
                "page": page,
                "size": PAGE_SIZE,
                "countResults": False,
                "facetSearch": False,
            }
            resp = self.http.post_json(SEARCH_URL, payload)
            items = resp.json().get("searchResults") or []
            for item in items:
                reference = item.get("reference")  # e.g. "2023/0376(COD)"
                ref_id = _ref_id(reference)
                if not ref_id:
                    continue
                yield DocRef(
                    external_id=reference,
                    url=PUBLIC_URL.format(ref_id=ref_id),
                    title=item.get("titleShort") or item.get("title"),
                    hint={"item": item, "ref_id": ref_id},
                )
            if len(items) < PAGE_SIZE:
                break

    def fetch(self, ref: DocRef) -> RawDocument:
        resp = self.http.get(
            TIMELINE_URL,
            accept="application/json",
            params={"reference": ref.hint["ref_id"], "lang": "en"},
        )
        payload = {"search_item": ref.hint["item"], "timeline": resp.json()}
        return RawDocument(
            ref=ref,
            content=json.dumps(payload).encode("utf-8"),
            content_type="application/json",
            fetched_at=dt.datetime.now(dt.UTC),
        )

    def parse(self, raw: RawDocument) -> ParsedDocument:
        payload = json.loads(raw.content)
        item = payload["search_item"]
        timeline = payload.get("timeline") or {}
        header = timeline.get("noticeHeader") or {}

        title_short = item.get("titleShort") or ""
        title_full = header.get("title") or item.get("title") or raw.ref.external_id
        status = item.get("status") or ""
        initiated = item.get("initiationDate") or ""

        lines = [title_short or title_full, "", title_full]
        meta = " | ".join(
            part
            for part in (
                f"Procedure: {raw.ref.external_id}",
                f"Status: {status}" if status else "",
                f"Initiated: {initiated}" if initiated else "",
            )
            if part
        )
        lines += ["", meta, "", "Timeline:"]
        for ev in timeline.get("events") or []:
            date = ev.get("date") or "?"
            stage = ev.get("stage") or ""
            ev_type = ev.get("type") or ev.get("label") or ""
            entry = f"- {date}: {f'[{stage}] ' if stage else ''}{ev_type}".rstrip()
            if entry == "-":
                continue
            # The working-level actors — rapporteurs, committee, lead DG,
            # responsible Commissioner, Council configuration — are the
            # highest-value content here: they are exactly who a public
            # affairs team needs to monitor and approach on a live file.
            actors = "; ".join(
                f"{label}: {value}"
                for label, value in (
                    ("Rapporteur", ev.get("rapporteur")),
                    ("Shadow rapporteurs", ev.get("shadowRapporteur")),
                    ("Committee", ev.get("committeeResponsible")),
                    ("Commissioner", ev.get("membersResponsible")),
                    ("Lead DG", ev.get("leadingServices")),
                    ("Council prep", ev.get("responsibleCoreper")),
                    ("Council configuration", ev.get("responsibleCouncilConf")),
                )
                if value
            )
            if actors:
                entry += f" ({actors})"
            lines.append(entry)

        return ParsedDocument(
            external_id=raw.ref.external_id,
            title=title_short or title_full,
            jurisdiction=Jurisdiction.EU,
            document_type=DocumentType.PROPOSAL,
            lifecycle_stage=_STAGE_BY_STATUS.get(status, LifecycleStage.UNKNOWN),
            text="\n".join(lines).strip(),
            raw_format="text",
            language="en",
            url=raw.ref.url,
            date_document=parse_iso_date(initiated),
            extra={"status": status, "cellar_id": item.get("cellarID")},
        )


def _ref_id(reference: str | None) -> str | None:
    """'2023/0376(COD)' -> '2023_376' (leading zeros stripped, per the API)."""
    if not reference or "/" not in reference:
        return None
    year, _, rest = reference.partition("/")
    number = rest.split("(")[0].lstrip("0")
    if not (year.isdigit() and number.isdigit()):
        return None
    return f"{year}_{number}"

