"""FastAPI app bridging the data + intelligence layers to the web front-end.

Read endpoints power the dashboard and document views; POST /api/brief runs the
profile → retrieval → grounded-citation briefing. The embedder is loaded once
and reused. The Next.js site (website/) talks to this over HTTP.
"""

from __future__ import annotations

import asyncio
import json
import queue
import threading
import time
from functools import lru_cache

import structlog
from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
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

log = structlog.get_logger(__name__)

app = FastAPI(title="Regina API", version="0.1.0")

_extra_origins = [o.strip() for o in get_settings().cors_allow_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", *_extra_origins],
    allow_methods=["*"],
    allow_headers=["*"],
)


@lru_cache
def _embedder():
    return get_embedder(get_settings())


# --- Abuse protection ---------------------------------------------------
# /api/brief and /api/questions each make real, billed Anthropic API calls
# (a brief is several calls with draft+revise+retries) — worth bounding
# before this is reachable from the public internet. A shared secret (as
# used for /api/refresh below) doesn't fit here: these are genuine
# end-user-facing features the website's own browser-side code calls, and
# any secret baked into client-side JS is visible and replayable, so it
# protects nothing. Per-IP rate limiting is the right shape instead.
#
# In-memory and per-process by design — correct for this project's actual
# single-instance Railway deployment; would need a shared store (Redis) to
# stay correct across multiple instances if this is ever scaled out.
_rate_limit_hits: dict[str, list[float]] = {}
_rate_limit_lock = threading.Lock()


def _check_rate_limit(request, *, max_per_hour: int) -> None:
    ip = request.client.host if request.client else "unknown"
    now = time.time()
    window_start = now - 3600
    with _rate_limit_lock:
        hits = [t for t in _rate_limit_hits.get(ip, []) if t > window_start]
        if len(hits) >= max_per_hour:
            raise HTTPException(
                status_code=429,
                detail="Too many requests — please try again later.",
            )
        hits.append(now)
        _rate_limit_hits[ip] = hits


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


@app.get("/api/sources")
def sources() -> dict:
    """Every registered ingestion adapter and its live document count — the
    ground truth for what the corpus actually covers. The website's About
    page groups these by content type instead of hardcoding a coverage
    description, so that page can't drift out of sync with what's actually
    running the way a hand-maintained list eventually would."""
    with session_scope() as s:
        counts = dict(
            s.execute(select(Document.source_id, func.count()).group_by(Document.source_id)).all()
        )
        rows = s.scalars(select(Source).order_by(Source.key)).all()
        return {
            "sources": [
                {
                    "key": r.key,
                    "name": r.name,
                    "jurisdiction": r.jurisdiction.value,
                    "enabled": r.enabled,
                    "documents": counts.get(r.id, 0),
                }
                for r in rows
            ]
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
def questions(req: BriefRequest, request: Request) -> dict:
    """The scoping step: which follow-up questions to ask before the report."""
    _check_rate_limit(request, max_per_hour=get_settings().questions_rate_limit_per_hour)
    dry = not has_api_key()
    with session_scope() as s:
        result = generate_questions(s, _embedder(), _profile(req), k=req.k, dry_run=dry)
    return result


@app.post("/api/brief")
def brief(req: BriefRequest, request: Request) -> StreamingResponse:
    """Streams newline-delimited JSON: one `{"type": "status", ...}` line per
    real stage generate_briefing's on_stage reports (retrieval, each LLM
    call), then a final `{"type": "result", ...}` line with the finished
    report — or `{"type": "error", ...}` if generation failed. The report
    takes 1-3 minutes; this is what lets the front-end show what the model is
    actually doing instead of a silent wait. generate_briefing itself is
    synchronous (sequential LLM calls), so it runs on a worker thread and
    reports progress through a queue the async generator below drains."""
    _check_rate_limit(request, max_per_hour=get_settings().brief_rate_limit_per_hour)
    dry = not has_api_key()
    events: queue.Queue = queue.Queue()

    def on_stage(stage: str, label: str) -> None:
        events.put({"type": "status", "stage": stage, "label": label})

    def run() -> None:
        started = time.monotonic()
        try:
            with session_scope() as s:
                result = generate_briefing(
                    s, _embedder(), _profile(req), k=req.k, dry_run=dry, on_stage=on_stage
                )
            elapsed = round(time.monotonic() - started, 1)
            # Real wall-clock, not a guess — the two-pass sharpen plus
            # canon-guaranteed retrieval means latency isn't obvious from
            # request volume alone; log it so a "this felt slow" report can
            # be checked against actual numbers.
            log.info(
                "brief_generated",
                company=req.name,
                elapsed_seconds=elapsed,
                passages=len(result["passages"]),
                dry_run=dry,
            )
            events.put(
                {
                    "type": "result",
                    "query": result["query"],
                    "passages": result["passages"],
                    "briefing": result.get("briefing"),
                    "citations": result.get("citations", []),
                    # Residual findings from the deterministic canon
                    # cross-check that the one correction pass couldn't
                    # resolve — the site can surface these so an unresolved
                    # identity/coverage problem is never invisible.
                    "canon_notes": result.get("canon_notes", []),
                    "dry_run": dry,
                    "elapsed_seconds": elapsed,
                }
            )
        except Exception as exc:
            log.error("brief_generation_failed", company=req.name, error=str(exc))
            events.put({"type": "error", "message": str(exc)})
        finally:
            events.put(None)  # sentinel: stream is done

    threading.Thread(target=run, daemon=True).start()

    async def event_stream():
        loop = asyncio.get_event_loop()
        while True:
            item = await loop.run_in_executor(None, events.get)
            if item is None:
                break
            yield json.dumps(item) + "\n"

    return StreamingResponse(event_stream(), media_type="application/x-ndjson")


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
def refresh(
    background: BackgroundTasks, x_refresh_secret: str | None = Header(default=None)
) -> dict:
    """THE TRIGGER, over HTTP: collect from every enabled source, then embed —
    the corpus augments itself with the newest developments. Non-blocking; poll
    GET /api/refresh for the outcome.

    Guarded once REFRESH_SECRET is configured (see data/config.py) — unset
    (the local-dev default) means no auth, matching prior behavior. Set it
    before deploying publicly: this endpoint is meant for a trusted caller
    (you, a cron job), not an anonymous visitor, and unlike /api/brief a
    shared secret is the right fit here since the caller isn't the browser."""
    secret = get_settings().refresh_secret
    if secret and x_refresh_secret != secret:
        raise HTTPException(status_code=403, detail="Invalid or missing refresh secret.")
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
    filename = f"regulatory-intelligence-report-{safe_name or 'company'}.pdf".replace(" ", "-")
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
