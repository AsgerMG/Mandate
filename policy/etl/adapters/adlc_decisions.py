"""Autorité de la concurrence adapter — competition decisions since 1988.

The authority runs no RSS/feed of its own. Its open-data listing on
data.gouv.fr publishes two resources: a ~220MB JSON with full decision text,
and a ~2.4MB metadata CSV (id, subtitle, sectors, companies, date, public
URL, sanction amount). We use the CSV — full text would mean re-downloading
~220MB on every run for no incremental gain, whereas the metadata is already
enough to judge digital-market relevance (sector list + companies + title)
and the ``url_site`` field links to the full decision for anyone who needs it.
"""

from __future__ import annotations

import csv
import datetime as dt
import io
import json
from collections.abc import Iterable

import structlog

from data.models import DocumentType, Jurisdiction, LifecycleStage

from .base import DocRef, ParsedDocument, RawDocument, SourceAdapter
from .feeds import is_tech_relevant

log = structlog.get_logger(__name__)

# The underlying CSV file URL changes on every weekly refresh (it's
# timestamped), so the dataset API is queried on every run to resolve the
# current download link rather than hardcoding one that will go stale.
DATASET_API = (
    "https://www.data.gouv.fr/api/1/datasets/"
    "decisions-publiees-par-lautorite-de-la-concurrence-depuis-1988/"
)


class AutoriteConcurrenceAdapter(SourceAdapter):
    key = "adlc_decisions"
    name = "Autorité de la concurrence — décisions (open data)"
    jurisdiction = Jurisdiction.FR
    base_url = "https://www.autoritedelaconcurrence.fr/"

    def discover(self, since: dt.date | None, cursor: dict | None) -> Iterable[DocRef]:
        url = _resolve_csv_url(self)
        resp = self.http.get(url, accept="text/csv")
        text = resp.content.decode("utf-8", errors="replace")
        reader = csv.DictReader(io.StringIO(text))
        for row in reader:
            decision_id = (row.get("id_decision") or "").strip()
            title = (row.get("sous_titre") or "").strip()
            url_site = (row.get("url_site") or "").strip()
            if not decision_id or not title or not url_site:
                continue
            date = _parse_dt(row.get("date_decision_datetime"))
            if since and date and date < since:
                continue
            sectors = row.get("liste_secteurs") or ""
            companies = row.get("entreprises_concernees") or ""
            haystack = f"{title} {sectors} {companies}"
            if not is_tech_relevant(haystack):
                continue
            yield DocRef(
                external_id=decision_id,
                url=url_site,
                title=title,
                hint={"row": row, "date": date.isoformat() if date else None},
            )

    def fetch(self, ref: DocRef) -> RawDocument:
        return RawDocument(
            ref=ref,
            content=json.dumps(ref.hint).encode("utf-8"),
            content_type="application/json",
            fetched_at=dt.datetime.now(dt.UTC),
        )

    def parse(self, raw: RawDocument) -> ParsedDocument:
        hint = json.loads(raw.content)
        row = hint["row"]
        title = (row.get("sous_titre") or "").strip()
        sectors = (row.get("liste_secteurs") or "").strip("[]").replace("'", "")
        companies = (row.get("entreprises_concernees") or "").strip("[]").replace("'", "")
        sanction = (row.get("Montant sanction") or "").strip()

        parts = [f"Décision {raw.ref.external_id} : {title}"]
        if sectors:
            parts.append(f"Secteurs : {sectors}")
        if companies:
            parts.append(f"Entreprises concernées : {companies}")
        if sanction:
            parts.append(f"Sanction : {sanction}")
        text = "\n\n".join(parts)

        date = dt.date.fromisoformat(hint["date"]) if hint.get("date") else None
        return ParsedDocument(
            external_id=raw.ref.external_id,
            title=f"{raw.ref.external_id} — {title}"[:500],
            jurisdiction=Jurisdiction.FR,
            document_type=DocumentType.DECISION,
            lifecycle_stage=LifecycleStage.IN_FORCE,
            text=text,
            raw_format="text",
            language="fr",
            url=raw.ref.url,
            date_document=date,
            extra={"decision_id": raw.ref.external_id, "sanction": sanction or None},
        )


def _resolve_csv_url(adapter: AutoriteConcurrenceAdapter) -> str:
    """The CSV's download URL is timestamped and changes weekly; resolve the
    current one from the dataset API rather than hardcoding a URL that will
    go stale within days."""
    resp = adapter.http.get(DATASET_API, accept="application/json")
    for res in resp.json().get("resources", []):
        if res.get("format") == "csv" and "metadata" in (res.get("title") or ""):
            return res["url"]
    raise RuntimeError("Could not find the metadata CSV resource in the ADLC dataset API response")


def _parse_dt(value: str | None) -> dt.date | None:
    if not value:
        return None
    try:
        return dt.date.fromisoformat(value.strip()[:10])
    except ValueError:
        return None
