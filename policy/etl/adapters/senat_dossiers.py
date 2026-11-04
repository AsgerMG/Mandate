"""Sénat open data adapter — legislative dossiers.

Richer than the already-integrated ``senat_textes`` RSS (which only carries
titles of newly tabled bills): this pulls the full dossier CSV, which adds
procedural stage, the Conseil constitutionnel decision, and the promulgated
law number — so a bill's full lifecycle shows up as one evolving document
rather than a single "tabled" headline.

Single flat CSV, no incremental API — re-fetched and diffed by dossier URL
(the stable key; the export has no numeric id column) each run.
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

CSV_URL = "https://data.senat.fr/data/dosleg/dossiers-legislatifs.csv"


class SenatDossiersAdapter(SourceAdapter):
    key = "senat_dossiers"
    name = "Sénat — dossiers législatifs (open data)"
    jurisdiction = Jurisdiction.FR
    base_url = "https://data.senat.fr/"

    def discover(self, since: dt.date | None, cursor: dict | None) -> Iterable[DocRef]:
        resp = self.http.get(CSV_URL, accept="text/csv")
        text = resp.content.decode("iso-8859-15", errors="replace")
        reader = csv.DictReader(io.StringIO(text), delimiter=";")
        for row in reader:
            url = (row.get("URL du dossier") or "").strip()
            title = (row.get("Titre") or "").strip()
            if not url or not title:
                continue
            date = _parse_fr_date(row.get("Date initiale"))
            if since and date and date < since:
                continue
            themes = row.get("Thèmes") or ""
            if not is_tech_relevant(f"{title} {themes}"):
                continue
            yield DocRef(
                external_id=url,
                url=url,
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
        title = (row.get("Titre") or "").strip()
        stage = (row.get("État du dossier") or "").strip()
        cc = (row.get("Décision du CC") or "").strip()
        promulgation = (row.get("Date de promulgation") or "").strip()
        loi_num = (row.get("Numéro de la loi") or "").strip()
        themes = (row.get("Thèmes") or "").strip()

        parts = [title, f"Type : {(row.get('Type de dossier') or '').strip()}", f"État : {stage}"]
        if loi_num:
            suffix = f" (promulguée le {promulgation})" if promulgation else ""
            parts.append(f"Loi n° {loi_num}{suffix}")
        if cc:
            parts.append(f"Décision du Conseil constitutionnel : {cc}")
        if themes:
            parts.append(f"Thèmes : {themes}")
        text = "\n\n".join(p for p in parts if p)

        date = dt.date.fromisoformat(hint["date"]) if hint.get("date") else None
        return ParsedDocument(
            external_id=raw.ref.external_id,
            title=title,
            jurisdiction=Jurisdiction.FR,
            document_type=DocumentType.PROPOSAL,
            lifecycle_stage=_classify_stage(stage),
            text=text,
            raw_format="text",
            language="fr",
            url=raw.ref.url,
            date_document=date,
            extra={"stage": stage, "loi_numero": loi_num or None},
        )


def _classify_stage(stage: str) -> LifecycleStage:
    s = stage.lower()
    if "promulgu" in s:
        return LifecycleStage.IN_FORCE
    if "caduc" in s or "rejet" in s or "retir" in s:
        return LifecycleStage.REPEALED
    if "lecture" in s or "commission" in s or "conseil constitutionnel" in s:
        return LifecycleStage.PROPOSED
    return LifecycleStage.UNKNOWN


def _parse_fr_date(value: str | None) -> dt.date | None:
    if not value:
        return None
    value = value.strip()
    for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
        try:
            return dt.datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None
