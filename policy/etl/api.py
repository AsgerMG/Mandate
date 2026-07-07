"""FastAPI app bridging the data + intelligence layers to the web front-end.

Read endpoints power the dashboard and document views; POST /api/brief runs the
profile → retrieval → grounded-citation briefing. The embedder is loaded once
and reused. The Next.js site (website/) talks to this over HTTP.
"""

from __future__ import annotations

import threading
from functools import lru_cache

from fastapi import BackgroundTasks, FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from data import get_settings, session_scope
from data.models import (
    Document,
    DocumentVersion,
    Jurisdiction,
    LifecycleStage,
    Passage,
    PolicyArea,
    Sector,
    Source,
)

from .enrichment import get_embedder, semantic_search
from .intelligence import CompanyProfile, generate_briefing, generate_questions
from .intelligence.llm import has_api_key
from .intelligence.pdf import render_report_pdf

app = FastAPI(title="EuroPolTracker API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@lru_cache
def _embedder():
    return get_embedder(get_settings())


class BriefRequest(BaseModel):
    name: str
    description: str = ""
    sectors: list[str] = Field(default_factory=list)
    markets: list[str] = Field(default_factory=lambda: ["EU"])
    uses_ai: bool = False
    handles_personal_data: bool = False
    # Scoping answers from the follow-up questions step (see /api/questions).
    company_size: str | None = None
    ai_role: str | None = None
    monthly_eu_users: str | None = None
    data_categories: list[str] = Field(default_factory=list)
    customer_type: str | None = None
    answers: dict[str, str] = Field(default_factory=dict)
    k: int = 12


def _profile(req: BriefRequest) -> CompanyProfile:
    markets = [Jurisdiction(m) for m in req.markets] or [Jurisdiction.EU]
    return CompanyProfile(
        name=req.name,
        description=req.description,
        sectors=req.sectors,
        markets=markets,
        uses_ai=req.uses_ai,
        handles_personal_data=req.handles_personal_data,
        company_size=req.company_size,
        ai_role=req.ai_role,
        monthly_eu_users=req.monthly_eu_users,
        data_categories=req.data_categories,
        customer_type=req.customer_type,
        answers=req.answers,
    )


class PdfRequest(BaseModel):
    name: str
    briefing: str
    citations: list[dict] = Field(default_factory=list)


def _doc_summary(d: Document) -> dict:
    return {
        "id": d.id,
        "external_id": d.external_id,
        "celex": d.celex,
        "title": d.title,
        "jurisdiction": d.jurisdiction.value,
        "type": d.document_type.value,
        "stage": d.lifecycle_stage.value,
        "date": d.date_document.isoformat() if d.date_document else None,
        "url": d.url,
        "source": d.source.key if d.source else None,
    }


@app.get("/health")
def health() -> dict:
    return {"ok": True, "llm_available": has_api_key()}


@app.get("/api/stats")
def stats() -> dict:
    with session_scope() as s:
        by_stage = s.execute(
            select(Document.lifecycle_stage, func.count()).group_by(Document.lifecycle_stage)
        ).all()
        return {
            "documents": s.scalar(select(func.count(Document.id))) or 0,
            "versions": s.scalar(select(func.count(DocumentVersion.id))) or 0,
            "passages": s.scalar(select(func.count(Passage.id))) or 0,
            "embedded": s.scalar(
                select(func.count(Passage.id)).where(Passage.embedding.is_not(None))
            )
            or 0,
            "sources": s.scalar(select(func.count(Source.id)).where(Source.enabled)) or 0,
            "by_stage": {stage.value: n for stage, n in by_stage},
            "llm_available": has_api_key(),
        }


@app.get("/api/meta")
def meta() -> dict:
    with session_scope() as s:
        sectors = s.scalars(select(Sector).order_by(Sector.name)).all()
        areas = s.scalars(select(PolicyArea).order_by(PolicyArea.name)).all()
        return {
            "sectors": [{"slug": x.slug, "name": x.name} for x in sectors],
            "policy_areas": [{"slug": x.slug, "name": x.name} for x in areas],
            "jurisdictions": [j.value for j in Jurisdiction],
            "stages": [st.value for st in LifecycleStage],
        }


@app.get("/api/documents")
def documents(
    stage: str | None = None,
    jurisdiction: str | None = None,
    type: str | None = None,  # noqa: A002 - external query name
    q: str | None = None,
    limit: int = Query(50, le=200),
) -> dict:
    with session_scope() as s:
        stmt = select(Document).join(Source, Document.source_id == Source.id)
        if stage:
            stmt = stmt.where(Document.lifecycle_stage == LifecycleStage(stage))
        if jurisdiction:
            stmt = stmt.where(Document.jurisdiction == Jurisdiction(jurisdiction))
        if type:
            stmt = stmt.where(Document.document_type == type)
        if q:
            stmt = stmt.where(Document.title.ilike(f"%{q}%"))
        stmt = stmt.order_by(Document.date_document.desc().nullslast()).limit(limit)
        return {"documents": [_doc_summary(d) for d in s.scalars(stmt)]}


@app.get("/api/documents/{doc_id}")
def document_detail(doc_id: int) -> dict:
    with session_scope() as s:
        doc = s.get(Document, doc_id)
        if doc is None:
            raise HTTPException(404, "Document not found")
        current = next((v for v in doc.versions if v.is_current), None)
        text = (current.text[:4000] if current else "") or ""
        return {
            **_doc_summary(doc),
            "eli": doc.eli,
            "date_in_force": doc.date_in_force.isoformat() if doc.date_in_force else None,
            "versions": len(doc.versions),
            "excerpt": text,
            "policy_areas": [p.slug for p in doc.policy_areas],
            "sectors": [sec.slug for sec in doc.sectors],
        }


@app.get("/api/search")
def search(q: str, k: int = Query(8, le=30)) -> dict:
    with session_scope() as s:
        hits = semantic_search(s, _embedder(), q, k=k)
    return {"results": hits}


@app.post("/api/questions")
def questions(req: BriefRequest) -> dict:
    """The scoping step: which follow-up questions to ask before the report."""
    dry = not has_api_key()
    with session_scope() as s:
        result = generate_questions(s, _embedder(), _profile(req), k=req.k, dry_run=dry)
    return result


@app.post("/api/brief")
def brief(req: BriefRequest) -> dict:
    dry = not has_api_key()
    with session_scope() as s:
        result = generate_briefing(s, _embedder(), _profile(req), k=req.k, dry_run=dry)
    return {
        "query": result["query"],
        "passages": result["passages"],
        "briefing": result.get("briefing"),
        "citations": result.get("citations", []),
        "dry_run": dry,
    }


_refresh_lock = threading.Lock()
_refresh_state: dict = {"running": False, "last_result": None, "last_finished": None}


def _run_refresh() -> None:
    import datetime as dt

    from etl.adapters import ADAPTERS
    from etl.enrichment import embed_pending
    from etl.http import HttpClient
    from etl.pipeline import ensure_source, run_adapter

    settings = get_settings()
    totals: dict[str, dict] = {}
    try:
        with HttpClient(settings) as http, session_scope() as s:
            for cls in ADAPTERS:
                adapter = cls(http, settings)
                source = ensure_source(s, adapter)
                if source.enabled:
                    totals[adapter.key] = run_adapter(s, adapter)
        with session_scope() as s:
            totals["_embedded"] = {"passages": embed_pending(s, _embedder())}
        _refresh_state["last_result"] = totals
    finally:
        _refresh_state["last_finished"] = dt.datetime.now(dt.UTC).isoformat()
        _refresh_state["running"] = False
        _refresh_lock.release()


@app.post("/api/refresh")
def refresh(background: BackgroundTasks) -> dict:
    """THE TRIGGER, over HTTP: collect from every enabled source, then embed —
    the corpus augments itself with the newest developments. Non-blocking; poll
    GET /api/refresh for the outcome."""
    if not _refresh_lock.acquire(blocking=False):
        return {"started": False, "reason": "refresh already running"}
    _refresh_state["running"] = True
    background.add_task(_run_refresh)
    return {"started": True}


@app.get("/api/refresh")
def refresh_status() -> dict:
    return _refresh_state


@app.post("/api/pdf")
def pdf(req: PdfRequest) -> Response:
    """Render a generated report as a downloadable PDF."""
    data = render_report_pdf(req.name, req.briefing, req.citations)
    safe_name = "".join(c if c.isalnum() or c in "-_ " else "" for c in req.name).strip()
    filename = f"regulatory-exposure-report-{safe_name or 'company'}.pdf".replace(" ", "-")
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
