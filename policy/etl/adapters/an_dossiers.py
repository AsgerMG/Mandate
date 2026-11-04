"""Assemblée Nationale open data adapter — legislative dossiers.

The AN's native RSS carries at most one item and is effectively unusable
(see project-management/source-map.md). The real channel is the open-data
platform: a bulk JSON zip of every dossier in the current legislature, no
auth, no rate limit — but also no incremental delta, so each run re-fetches
the whole archive (~10MB) and relies on the pipeline's content-hash dedup to
skip unchanged dossiers.

``actesLegislatifs`` is a recursively nested ``{"acteLegislatif": {...}}``
tree (a step can itself contain child steps), so discovery flattens it to
find the latest step date and to build a short procedural timeline as the
document text.
"""

from __future__ import annotations

import datetime as dt
import io
import json
import zipfile
from collections.abc import Iterable

import structlog

from data.models import DocumentType, Jurisdiction, LifecycleStage

from .base import DocRef, ParsedDocument, RawDocument, SourceAdapter
from .feeds import is_tech_relevant

log = structlog.get_logger(__name__)

# Current legislature; bump after the next dissolution/election.
LEGISLATURE = "17"
ZIP_URL = (
    "https://data.assemblee-nationale.fr/static/openData/repository/"
    f"{LEGISLATURE}/loi/dossiers_legislatifs/Dossiers_Legislatifs.json.zip"
)
DOSSIER_PREFIX = "json/dossierParlementaire/"
PUBLIC_URL = f"https://www.assemblee-nationale.fr/dyn/{LEGISLATURE}/dossiers/{{slug}}"


class AssembleeNationaleAdapter(SourceAdapter):
    key = "an_dossiers"
    name = "Assemblée Nationale — dossiers législatifs (open data)"
    jurisdiction = Jurisdiction.FR
    base_url = "https://data.assemblee-nationale.fr/"

    def discover(self, since: dt.date | None, cursor: dict | None) -> Iterable[DocRef]:
        resp = self.http.get(ZIP_URL, accept="application/zip, application/octet-stream")
        zf = zipfile.ZipFile(io.BytesIO(resp.content))
        for name in zf.namelist():
            if not name.startswith(DOSSIER_PREFIX) or not name.endswith(".json"):
                continue
            try:
                data = json.loads(zf.read(name))
            except (json.JSONDecodeError, zipfile.BadZipFile):
                continue
            dossier = data.get("dossierParlementaire") or data
            if not isinstance(dossier, dict) or not dossier.get("uid"):
                continue
            title = (dossier.get("titreDossier") or {}).get("titre") or ""
            acts = list(_flatten_actes(dossier.get("actesLegislatifs")))
            latest = max((a["date"] for a in acts if a["date"]), default=None)
            if since and latest and latest < since:
                continue
            summary = " / ".join(a["libelle"] for a in acts if a["libelle"])
            if not is_tech_relevant(f"{title} {summary}"):
                continue
            slug = (dossier.get("titreDossier") or {}).get("titreChemin") or dossier["uid"]
            yield DocRef(
                external_id=dossier["uid"],
                url=PUBLIC_URL.format(slug=slug),
                title=title,
                hint={
                    "dossier": dossier,
                    "acts": [{**a, "date": str(a["date"]) if a["date"] else None} for a in acts],
                },
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
        dossier = hint["dossier"]
        acts = hint["acts"]
        fallback = raw.ref.title or raw.ref.external_id
        title = (dossier.get("titreDossier") or {}).get("titre") or fallback
        procedure = (dossier.get("procedureParlementaire") or {}).get("libelle") or ""
        timeline = "\n".join(f"- {a['date'] or '?'}: {a['libelle'] or a['code']}" for a in acts)
        text = f"{title}\n\nProcédure : {procedure}\n\n{timeline}".strip()
        dates = [dt.date.fromisoformat(a["date"]) for a in acts if a["date"]]
        latest_date = max(dates) if dates else None
        return ParsedDocument(
            external_id=dossier["uid"],
            title=title,
            jurisdiction=Jurisdiction.FR,
            document_type=DocumentType.PROPOSAL,
            lifecycle_stage=LifecycleStage.PROPOSED,
            text=text,
            raw_format="text",
            language="fr",
            url=raw.ref.url,
            date_document=latest_date,
            extra={"procedure": procedure, "legislature": LEGISLATURE},
        )


def _flatten_actes(node: dict | None) -> Iterable[dict]:
    """Walk the nested acteLegislatif tree, yielding {date, libelle, code}."""
    if not isinstance(node, dict):
        return
    acte = node.get("acteLegislatif")
    items = acte if isinstance(acte, list) else ([acte] if acte else [])
    for item in items:
        if not isinstance(item, dict):
            continue
        yield {
            "date": _parse_dt(item.get("dateActe")),
            "libelle": (item.get("libelleActe") or {}).get("nomCanonique"),
            "code": item.get("codeActe"),
        }
        yield from _flatten_actes(item.get("actesLegislatifs"))


def _parse_dt(value: str | None) -> dt.date | None:
    if not value:
        return None
    try:
        return dt.datetime.fromisoformat(value).date()
    except ValueError:
        return None
