"""Have Your Say adapter — Commission "Better Regulation" portal.

Forward-looking signal: open consultations, calls for evidence, feedback periods
and roadmaps — where "what's coming" surfaces months before a proposal.

Discovery uses the portal's backing JSON service (`brpapi/searchInitiatives`),
verified against the live endpoint:
  * results are a Spring page under ``initiativeResultDtoPage.content``;
  * there is no single "digital" topic code, so we filter by keyword via the
    ``text`` parameter (same tech-term approach as the EUR-Lex adapter) and
    de-duplicate initiatives across terms;
  * ``initiativeTranslations`` turns out to carry ONLY ``SHORT_TITLE`` per
    language (verified 2026-07-03) — no body field, contrary to what this
    docstring used to claim. The real body-ish content is the top-level
    ``snippet`` field: an HTML-highlighted search excerpt, present because
    the query matched it. It's per-search-term (not the full description)
    and sometimes repeats an overlapping half after a "..." truncation, so
    ``_clean_snippet`` strips markup and drops exact-duplicate halves. The
    public initiative page (`have-your-say/initiatives/{id}`) was checked as
    an alternative and is a client-rendered Angular SPA with no content in
    the raw HTML — not fetchable without a JS-executing browser, so the
    snippet is the best available body without adding that dependency.

Lifecycle: an OPEN feedback window → CONSULTATION; an active initiative without
an open window → PLANNED; otherwise UNKNOWN.
"""

from __future__ import annotations

import datetime as dt
import json
import re
from collections.abc import Iterable

import structlog

from data.models import DocumentType, Jurisdiction, LifecycleStage

from .base import DIGITAL_ECONOMY_SUBJECT_TERMS, DocRef, ParsedDocument, RawDocument, SourceAdapter

log = structlog.get_logger(__name__)

SEARCH_URL = "https://ec.europa.eu/info/law/better-regulation/brpapi/searchInitiatives"
PUBLIC_URL = "https://ec.europa.eu/info/law/better-regulation/have-your-say/initiatives/{id}"

# Same shared digital-economy vocabulary used for EUR-Lex discovery (base.py)
# — kept as one list so both adapters stay in sync instead of drifting apart.
TECH_SUBJECT_TERMS = DIGITAL_ECONOMY_SUBJECT_TERMS

PAGE_SIZE = 50
MAX_PAGES = 10  # safety cap per term


class HaveYourSayAdapter(SourceAdapter):
    key = "have_your_say"
    name = "Have Your Say (consultations)"
    jurisdiction = Jurisdiction.EU
    base_url = "https://ec.europa.eu/info/law/better-regulation/have-your-say"

    def discover(self, since: dt.date | None, cursor: dict | None) -> Iterable[DocRef]:
        seen: set[str] = set()
        for term in TECH_SUBJECT_TERMS:
            for page in range(MAX_PAGES):
                params = {"text": term, "language": "EN", "size": PAGE_SIZE, "page": page}
                resp = self.http.get(SEARCH_URL, accept="application/json", params=params)
                payload = resp.json().get("initiativeResultDtoPage", {})
                items = payload.get("content", [])
                for item in items:
                    ext = _ext_id(item)
                    if ext in seen:
                        continue
                    seen.add(ext)
                    yield DocRef(
                        external_id=ext,
                        url=PUBLIC_URL.format(id=ext),
                        title=item.get("shortTitle"),
                        hint={"item": item},
                    )
                if payload.get("last", True) or not items:
                    break

    def fetch(self, ref: DocRef) -> RawDocument:
        # The initiative payload was captured during discovery; no second call.
        item = ref.hint["item"]
        return RawDocument(
            ref=ref,
            content=json.dumps(item).encode("utf-8"),
            content_type="application/json",
            fetched_at=dt.datetime.now(dt.UTC),
        )

    def parse(self, raw: RawDocument) -> ParsedDocument:
        item = json.loads(raw.content)
        ext = _ext_id(item)
        title, body = _extract_en_text(item)
        body = body or _clean_snippet(item.get("snippet"))
        stage, fb_start, fb_end = _classify_stage(item)

        return ParsedDocument(
            external_id=ext,
            title=title or item.get("shortTitle") or ext,
            jurisdiction=Jurisdiction.EU,
            document_type=DocumentType.CONSULTATION,
            lifecycle_stage=stage,
            text=f"{title or item.get('shortTitle') or ext}\n\n{body}".strip(),
            raw_format="text",
            language="en",
            url=PUBLIC_URL.format(id=ext),
            date_document=fb_start,
            date_end_validity=fb_end,
            policy_area_slugs=[],
            extra={
                "reference": item.get("reference"),
                "foreseen_act_type": item.get("foreseenActType"),
                "initiative_status": item.get("initiativeStatus"),
                "topics": [t.get("code") for t in item.get("topics") or []],
            },
        )


def _ext_id(item: dict) -> str:
    # ids arrive as floats (e.g. 14569.0); normalize to a stable integer string.
    raw = item.get("id")
    try:
        return str(int(float(raw)))
    except (TypeError, ValueError):
        return str(raw)


def _extract_en_text(item: dict) -> tuple[str | None, str]:
    """Return (english_short_title, assembled_english_body). The body is
    usually empty — see the module docstring — in which case callers should
    fall back to ``_clean_snippet(item.get("snippet"))``."""
    title: str | None = None
    parts: list[str] = []
    for tr in item.get("initiativeTranslations") or []:
        if tr.get("language") != "EN":
            continue
        field, value = tr.get("field"), (tr.get("value") or "").strip()
        if not value:
            continue
        if field == "SHORT_TITLE":
            title = value
        else:
            parts.append(value)
    return title, "\n\n".join(parts)


def _clean_snippet(raw: str | None) -> str:
    """The search snippet HTML-highlights matched terms and often repeats an
    overlapping excerpt once per matched term, joined by '...': strip tags,
    split on the truncation marker, and drop exact-duplicate halves while
    preserving order."""
    if not raw:
        return ""
    text = re.sub(r"<[^>]+>", "", raw)
    halves = [h.strip() for h in text.split("...") if h.strip()]
    deduped = list(dict.fromkeys(halves))
    return " … ".join(deduped)


def _classify_stage(item: dict) -> tuple[LifecycleStage, dt.date | None, dt.date | None]:
    fb_start = fb_end = None
    open_window = False
    for st in item.get("currentStatuses") or []:
        if st.get("receivingFeedbackStatus") == "OPEN":
            open_window = True
        fb_start = fb_start or _parse_dt(st.get("feedbackStartDate"))
        fb_end = fb_end or _parse_dt(st.get("feedbackEndDate"))
    if open_window:
        return LifecycleStage.CONSULTATION, fb_start, fb_end
    if item.get("initiativeStatus") == "ACTIVE":
        return LifecycleStage.PLANNED, fb_start, fb_end
    return LifecycleStage.UNKNOWN, fb_start, fb_end


def _parse_dt(value: str | None) -> dt.date | None:
    if not value:
        return None
    # Format observed: "2026/06/24 17:24:10".
    try:
        return dt.datetime.strptime(value[:10], "%Y/%m/%d").date()
    except ValueError:
        return None
