"""FastAPI app bridging the data + intelligence layers to the web front-end.

Read endpoints power the dashboard and document views; POST /api/brief runs the
profile → retrieval → grounded-citation briefing. The embedder is loaded once
and reused. The Next.js site (website/) talks to this over HTTP.
"""

from __future__ import annotations

import asyncio
import datetime as dt
import json
import queue
import threading
import time
from functools import lru_cache

import structlog
from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator, model_validator
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
from .intelligence.llm import llm_available
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
    # `name` is required unless `profile` is sent: the shared profile carries it.
    name: str = ""
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
    ai_use_cases: list[str] = Field(default_factory=list)
    customer_type: str | None = None
    answers: dict[str, str] = Field(default_factory=dict)
    # THE SHARED MANDATE PROFILE (mandate/profile). When present it is the whole
    # description of the company and the flat fields above are ignored: policy's
    # CompanyProfile is DERIVED from it (etl/intelligence/shared_profile.py).
    # Absent, the request behaves exactly as before.
    profile: dict | None = None
    k: int = 12

    @field_validator("profile")
    @classmethod
    def _valid_profile(cls, v: dict | None) -> dict | None:
        if v is None:
            return None
        from mandate.profile import ProfileError, validate  # noqa: PLC0415

        try:
            return validate(v)
        except ProfileError as e:
            raise ValueError(str(e)) from e

    @model_validator(mode="after")
    def _named(self) -> "BriefRequest":
        # "name" absent (not merely empty: "" was always accepted) and no profile
        if self.profile is None and "name" not in self.model_fields_set:
            raise ValueError("name is required (or send a shared `profile`)")
        return self


def _profile(req: BriefRequest) -> CompanyProfile:
    if req.profile is not None:
        from .intelligence.shared_profile import from_shared_profile  # noqa: PLC0415

        return from_shared_profile(req.profile)
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
        ai_use_cases=req.ai_use_cases,
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
        "ingested_at": d.created_at.isoformat() if d.created_at else None,
    }


@app.get("/health")
def health() -> dict:
    return {"ok": True, "llm_available": llm_available()}


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
            "llm_available": llm_available(),
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
    since: dt.datetime | None = None,
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
        if since:
            # `since` asks "what got ingested recently" (created_at), a
            # different axis from date_document (the act's own date) — so it
            # also switches the sort, newest-ingested first, to match intent.
            stmt = stmt.where(Document.created_at >= since)
            stmt = stmt.order_by(Document.created_at.desc())
        else:
            stmt = stmt.order_by(Document.date_document.desc().nullslast())
        stmt = stmt.limit(limit)
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


# ── THE ONE ANSWER THAT IS AN ACTION ────────────────────────────────────────
#
# Everything else this service returns is a reading: here is a rule, here is what
# it means for you. A consultation with an open window is the one thing a company
# can actually DO something about — it is where a startup with no lobbying budget
# gets to be heard, and it expires.
#
# Every field below was already being stored and none of it was reachable.
# `have_your_say` has written `date_end_validity` from the portal's own
# `feedbackEndDate` since the adapter was written; `_doc_summary` returns `date`
# and `date_in_force` and not that, so nothing in the system could sort
# consultations by "closes soonest". This endpoint is a few dozen lines over data
# that was already there.
#
# THREE HONEST LIMITS, returned in the payload rather than written in a docstring
# nobody reads:
#
#   1. `as_of` — window state is only as fresh as the last discovery sweep, and
#      that is a WEEKLY heartbeat. A short window can open and close between
#      crawls. The caller is told when we last looked so it can say so.
#   2. `closes_in_days` can be negative-adjacent: a window that closed since the
#      last sweep still reads open here. We filter on today, which is the best we
#      can do, and `as_of` is how a reader judges the risk.
#   3. The body is thin by the adapter's own admission — the portal serves only a
#      short title through its API, so `title` is reliable and excerpt is not.
#      That is why this returns a link and a deadline rather than a summary.


@app.get("/api/consultations")
def consultations(
    open_only: bool = Query(True, alias="open"),
    jurisdiction: str | None = None,
    closing_within_days: int | None = Query(None, ge=1, le=365),
    limit: int = Query(50, le=200),
) -> dict:
    """Consultations a company could still respond to, soonest deadline first."""
    today = dt.date.today()
    with session_scope() as s:
        stmt = (
            select(Document)
            .join(Source, Document.source_id == Source.id)
            .where(Document.lifecycle_stage == LifecycleStage.CONSULTATION)
        )
        if open_only:
            # A window with no recorded end date is NOT assumed open. Guessing
            # would manufacture a deadline, and a wrong deadline on something a
            # founder plans around is worse than omitting it.
            stmt = stmt.where(Document.date_end_validity.is_not(None))
            stmt = stmt.where(Document.date_end_validity >= today)
        if jurisdiction:
            stmt = stmt.where(Document.jurisdiction == Jurisdiction(jurisdiction))
        if closing_within_days is not None:
            stmt = stmt.where(
                Document.date_end_validity
                <= today + dt.timedelta(days=closing_within_days)
            )
        stmt = stmt.order_by(Document.date_end_validity.asc().nullslast()).limit(limit)
        rows = list(s.scalars(stmt))

        # When we last looked, which is what makes the list judgeable.
        last_seen = s.scalar(
            select(func.max(Document.updated_at)).where(
                Document.lifecycle_stage == LifecycleStage.CONSULTATION
            )
        )

        items = []
        for d in rows:
            end = d.date_end_validity
            items.append(
                {
                    **_doc_summary(d),
                    "closes_on": end.isoformat() if end else None,
                    "closes_in_days": (end - today).days if end else None,
                    "opened_on": d.date_in_force.isoformat() if d.date_in_force else None,
                }
            )

    return {
        "consultations": items,
        "count": len(items),
        "as_of": last_seen.isoformat() if last_seen else None,
        "caveat": (
            "Windows are checked once a week. A consultation that closed since "
            "the last check can still appear here, and one that opened since "
            "will not."
        ),
    }


@app.get("/api/search")
def search(q: str, k: int = Query(8, le=30), hot: bool = True, mission_id: str | None = None) -> dict:
    """The k passages closest to `q`. `hot` (default on) leaves news and press
    older than HOT_DAYS out (Regina's hot index; nothing is deleted). Every call
    is one row in the usage log (mandate.tool_calls)."""
    from .enrichment.embeddings import HOT_DAYS  # noqa: PLC0415

    t0 = time.monotonic()
    with session_scope() as s:
        hits = semantic_search(s, _embedder(), q, k=k, hot_days=HOT_DAYS if hot else None)
    _log_search(q, k, hot, hits, mission_id, int((time.monotonic() - t0) * 1000))
    return {"results": hits}


def _log_search(q: str, k: int, hot: bool, hits: list[dict], mission_id: str | None, ms: int) -> None:
    """One usage-log row for a search. Best-effort: a search never fails
    because it could not be logged. The query is stored hashed, and only its
    first words in the summary (a query can carry a company's own words)."""
    from data import grounding_bridge as gb  # noqa: PLC0415
    from mandate import usage  # noqa: PLC0415

    try:
        with session_scope() as s, s.begin_nested():
            usage.record(gb.driver(s), [{
                "brain": "regina", "tool": "search", "caller": "search", "mission_id": mission_id,
                "args": {"q": q, "k": k, "hot": hot}, "args_summary": f"k={k}; hot={hot}; q={q[:60]}",
                "result_count": len(hits),
                "tables": ["grounding.passage_embeddings", "grounding.passages", "policy.documents"],
                "sources": sorted({h.get("document_type") or "other" for h in hits}),
                "ms": ms,
            }])
    except Exception as e:  # noqa: BLE001
        log.warning("search_usage_not_logged", error=str(e)[:200])


# ── For the advisor's agents (web/lib/mandate/agent) ────────────────────────
#
# Two narrow reads the agents' tools need and nothing else exposed: the passages
# of ONE document closest to a question (document_passages, the "go deeper"
# half of retrieval), and the named actors on a file (briefing._stakeholders,
# the same block the brief uses). Each passage carries its grounding identity
# (grounding_sha256 + char span), so an agent cites it through mandate-api
# without a re-fetch.


@app.get("/api/documents/{doc_id}/passages")
def document_passages_endpoint(
    doc_id: int, q: str | None = None, k: int = Query(6, ge=1, le=20)
) -> dict:
    """The k passages of document `doc_id` closest in meaning to `q`, or, with no
    q, its first k passages in reading order."""
    from .enrichment.embeddings import document_passages  # noqa: PLC0415

    with session_scope() as s:
        doc = s.get(Document, doc_id)
        if doc is None:
            raise HTTPException(404, "Document not found")
        if q and q.strip():
            hits = document_passages(s, _embedder(), q, [doc_id], k_per_doc=k)
        else:
            rows = s.execute(
                select(Passage.id, Passage.text, Passage.char_start, Passage.char_end,
                       Passage.heading, DocumentVersion.content_hash)
                .join(DocumentVersion, Passage.version_id == DocumentVersion.id)
                .where(DocumentVersion.document_id == doc_id, DocumentVersion.is_current.is_(True))
                .order_by(Passage.ordinal)
                .limit(k)
            ).all()
            hits = [
                {"passage_id": r.id, "text": r.text, "char_start": r.char_start,
                 "char_end": r.char_end, "heading": r.heading, "grounding_sha256": r.content_hash,
                 "document_id": doc_id, "title": doc.title, "url": doc.url, "celex": doc.celex}
                for r in rows
            ]
        return {"document": _doc_summary(doc), "passages": hits}


@app.get("/api/actors")
def actors_endpoint(
    document_id: int | None = None, q: str | None = None, limit: int = Query(20, ge=1, le=50)
) -> dict:
    """Named actors on a file (`document_id`), or on the files whose title
    matches `q`, plus actors whose own name or institution matches `q`.
    Rapporteurs first (briefing._stakeholders' order)."""
    from data.models import Actor  # noqa: PLC0415

    from .intelligence.briefing import _stakeholders  # noqa: PLC0415

    if document_id is None and not (q and q.strip()):
        raise HTTPException(422, "give document_id or q")
    with session_scope() as s:
        doc_ids: list[int] = []
        if document_id is not None:
            doc_ids.append(document_id)
        if q and q.strip():
            doc_ids += list(s.scalars(
                select(Document.id).where(Document.title.ilike(f"%{q.strip()}%"))
                .order_by(Document.date_document.desc().nullslast()).limit(25)))
        on_files = _stakeholders(s, [{"document_id": d} for d in doc_ids])
        named = []
        if q and q.strip():
            pat = f"%{q.strip()}%"
            named = [
                {"name": a.name, "institution": a.institution, "political_group": a.political_group,
                 "role": a.role_text, "documents": None}
                for a in s.scalars(
                    select(Actor).where((Actor.name.ilike(pat)) | (Actor.institution.ilike(pat)))
                    .order_by(Actor.name).limit(limit))
            ]
        seen, out = set(), []
        for a in on_files + named:
            key = (a["name"], a["institution"])
            if key not in seen:
                seen.add(key)
                out.append(a)
        return {"actors": out[:limit], "document_ids": doc_ids,
                "source": "parliamentary debates and file records in Regina's corpus"}


@app.post("/api/questions")
def questions(req: BriefRequest, request: Request) -> dict:
    """The scoping step: which follow-up questions to ask before the report."""
    _check_rate_limit(request, max_per_hour=get_settings().questions_rate_limit_per_hour)
    dry = not llm_available()
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
    dry = not llm_available()
    events: queue.Queue = queue.Queue()

    # Progress the front-end turns into a rail, an ETA and a streaming draft.
    # See project-management/brief-ux-plan.md for what each is used for.
    last_stage = {"stage": "starting"}

    def on_stage(stage: str, label: str) -> None:
        last_stage["stage"] = stage
        events.put({"type": "status", "stage": stage, "label": label})

    def on_delta(text: str) -> None:
        # Text as the model writes it. Also the ETA's only real input: latency is
        # ~entirely a function of output tokens (r=+1.00, 93.6 tok/s measured
        # 2026-07-29), so counting characters client-side beats any guess we could
        # make from the profile or the corpus.
        events.put({"type": "delta", "text": text})

    def on_sources(digest: dict) -> None:
        events.put({"type": "sources", **digest})

    def on_thinking(text: str) -> None:
        # The model's own summarised reasoning, streamed while it thinks. This is
        # the first ~90-100s of a ~180s brief — previously a bar with nothing
        # behind it, which is precisely the stretch where a user decides whether
        # the thing is working.
        events.put({"type": "thinking", "text": text})

    def run() -> None:
        started = time.monotonic()
        try:
            with session_scope() as s:
                result = generate_briefing(
                    s,
                    _embedder(),
                    _profile(req),
                    k=req.k,
                    dry_run=dry,
                    on_stage=on_stage,
                    on_delta=on_delta,
                    on_sources=on_sources,
                    on_thinking=on_thinking,
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
                dry_run=dry,
                # NOT passages=len(...): retrieval_stats already carries a
                # "passages" key, and passing both raised "got multiple values for
                # keyword argument 'passages'" *after* the model work was paid for
                # — so every real brief through this endpoint failed at the finish
                # line while the CLI path (which doesn't go through here) looked
                # healthy. Found 2026-07-30 by running one real brief end to end.
                **result.get("retrieval_stats", {}),
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
                    # Retrieval shape (see briefing._retrieval_stats). Surfaced
                    # rather than only logged because the depth collapse it
                    # measures was invisible from the brief's own text — the
                    # report reads fine while every instrument in context
                    # contributes a single passage.
                    "retrieval_stats": result.get("retrieval_stats", {}),
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
        stream_started = time.monotonic()
        try:
            while True:
                item = await loop.run_in_executor(None, events.get)
                if item is None:
                    break
                yield json.dumps(item) + "\n"
        except asyncio.CancelledError:
            # The client closed the tab or dropped. The worker thread finishes and
            # its result is discarded, so this is the ONLY record that a paid brief
            # was abandoned — and the number that decides whether BriefJob
            # persistence is worth building (deferred 2026-07-30; see
            # brief-ux-plan.md Phase D). Without it, a completed brief nobody
            # fetched is indistinguishable from an abandoned one.
            log.warning(
                "brief_abandoned",
                company=req.name,
                stage=last_stage["stage"],
                elapsed_seconds=round(time.monotonic() - stream_started, 1),
                dry_run=dry,
            )
            raise

    return StreamingResponse(event_stream(), media_type="application/x-ndjson")


# How long a refresh may go without making any progress before its "running"
# flag is treated as stale and a new run is allowed to start.
#
# The old design acquired a threading.Lock in refresh() and released it in
# _run_refresh()'s finally — a different function on a different thread. If the
# background task never started, or the run hung (there is no timeout anywhere
# and multi-hour runs are normal), `running` stayed True forever and every
# subsequent weekly cron got {"started": false, "reason": "refresh already
# running"} until someone restarted the process. A lock whose release depends
# on code that may never run is not a lock, it's a deadlock waiting to happen.
#
# Now the mutex is acquired and released inside the same function and only
# guards the state dict; whether a run is in progress is answered by a
# *timestamped* flag that expires. `progress_at` is stamped as each source
# finishes, so a genuinely long but healthy run is never considered stale —
# only one that has stopped making progress entirely.
REFRESH_STALE_AFTER = dt.timedelta(hours=12)

# ── The DURABLE record: mandate.runs ────────────────────────────────────────
# Everything above is memory, and memory is what a redeploy erases: on
# 2026-11-06 policy's data was found 12 days stale with nothing anywhere saying
# a refresh had failed or never run. Each refresh is now also a row in
# mandate.runs (mandate/runs.py), written as policy_app: started, heartbeat per
# source, finished with a per-source outcome. The weekly orchestrator waits on
# that row and the daily health check reads it. Recording never fails a refresh.
def _durable_url() -> str | None:
    url = (get_settings().database_url or "").strip()
    if not url or url == "local":
        return None
    for alias in ("postgresql+psycopg://", "postgres+psycopg://"):
        if url.startswith(alias):
            return "postgresql://" + url[len(alias):]
    return url


def _run_log():
    from mandate.runs import RunLog  # noqa: PLC0415  (the platform package; in the image)
    return RunLog


_refresh_run = None   # the mandate.runs handle of the refresh in progress

_refresh_lock = threading.Lock()
_refresh_state: dict = {
    "running": False,
    # None = never run; True/False = how the LAST COMPLETED run ended. This
    # exists because `last_result` alone could not express failure: it was
    # assigned as the final statement of the try block, so on any exception it
    # silently kept the PREVIOUS run's totals while `last_finished` advanced —
    # a failed refresh was indistinguishable from a successful one to the
    # weekly audit routine, which reads exactly this endpoint.
    "ok": None,
    "error": None,
    "last_result": None,
    "last_started": None,
    "last_finished": None,
    "progress_at": None,
}


def _note_progress() -> None:
    with _refresh_lock:
        _refresh_state["progress_at"] = dt.datetime.now(dt.UTC)
    if _refresh_run is not None:
        _refresh_run.heartbeat()


def _try_start_refresh() -> tuple[bool, str | None]:
    """Claim the refresh slot. Returns (started, reason_if_not)."""
    now = dt.datetime.now(dt.UTC)
    with _refresh_lock:
        if _refresh_state["running"]:
            last_seen = _refresh_state["progress_at"] or _refresh_state["last_started"]
            if last_seen is not None and now - last_seen < REFRESH_STALE_AFTER:
                return False, "refresh already running"
            log.warning(
                "refresh_lock_expired",
                last_seen=last_seen.isoformat() if last_seen else None,
                stale_after_hours=REFRESH_STALE_AFTER.total_seconds() / 3600,
            )
        _refresh_state.update(
            running=True,
            last_started=now,
            progress_at=now,
            # A new run's outcome is not yet known — never leave the previous
            # run's verdict readable as if it described this one.
            ok=None,
            error=None,
            last_result=None,
        )
    global _refresh_run
    try:
        _refresh_run = _run_log().start(_durable_url(), brain="policy", kind="policy_refresh",
                                        trigger="api")
    except Exception:  # noqa: BLE001 -- never the reason a refresh does not start
        log.exception("refresh_record_start_failed")
        _refresh_run = None
    return True, None


def _source_outcomes(result: dict) -> dict:
    """Per source: ok or crashed, small enough for mandate.runs.detail. The
    health check holds every enabled source to its cadence from this."""
    out = {}
    for key, v in (result or {}).items():
        if key.startswith("_"):
            continue
        crashed = isinstance(v, dict) and bool(v.get("crashed"))
        out[key] = {"ok": not crashed,
                    **({"error": str(v.get("error"))[:200],
                        "transient": bool(v.get("transient"))} if crashed else {})}
    return out


def _finish_refresh(*, ok: bool, result: dict, error: str | None) -> None:
    global _refresh_run
    if _refresh_run is not None:
        try:
            sources = _source_outcomes(result)
            crashed = [k for k, v in sources.items() if not v["ok"]]
            status = "failed" if not ok else "partial" if crashed else "ok"
            from etl.enrichment.corpus import budget_paused  # noqa: PLC0415

            paused = budget_paused((result or {}).get("_enrichment") or {})
            summary = error or (f"{len(crashed)} source(s) crashed: "
                                f"{', '.join(crashed)}" if crashed else "ok")
            if paused:
                # Not a failure: the paid steps changed nothing. Said in the
                # run's record so mandate/health/check.py reports the pause.
                summary += f"; paid steps paused: {', '.join(paused)}"
            _refresh_run.finish(status, summary,
                                {"sources": sources,
                                 **({"llm_budget_paused": paused} if paused else {})})
        except Exception:  # noqa: BLE001
            log.exception("refresh_record_finish_failed")
        _refresh_run = None
    with _refresh_lock:
        _refresh_state.update(
            running=False,
            ok=ok,
            error=error,
            last_result=result,
            last_finished=dt.datetime.now(dt.UTC),
        )


def _run_refresh() -> None:
    from etl.adapters import ADAPTERS
    from etl.enrichment.corpus import enrich_corpus
    from etl.http import HttpClient
    from etl.pipeline import run_all_sources

    from .intelligence.llm import get_client

    settings = get_settings()
    totals: dict[str, dict] = {}
    error: str | None = None
    try:
        with HttpClient(settings) as http, session_scope() as s:
            totals.update(
                run_all_sources(
                    s, ADAPTERS, http, settings, on_source=lambda *_: _note_progress()
                )
            )
        # The SAME ordered enrichment pass the CLI runs — the whole point of
        # etl/enrichment/corpus.py. This path used to call embed_pending and
        # classify_pending directly, which meant types (reclassify), actors,
        # lifecycle and summaries had never once run on the Railway cron. The
        # paid `summaries` step stays opt-in via DEFAULT_STEPS, so the cron
        # does not silently start paying per document.
        with HttpClient(settings) as http:
            totals["_enrichment"] = enrich_corpus(
                session_scope,
                http=http,
                embedder=_embedder(),
                client=get_client() if llm_available() else None,
                on_progress=lambda _line: _note_progress(),
            )
    except Exception as exc:
        # Partial totals are still worth reporting — they say how far the run
        # got — but `ok` and `error` make it unambiguous that it did not
        # succeed.
        error = f"{type(exc).__name__}: {exc}"
        log.exception("refresh_failed")
    _finish_refresh(ok=error is None, result=totals, error=error)


@app.post("/api/refresh")
def refresh(
    background: BackgroundTasks, x_refresh_secret: str | None = Header(default=None)
) -> dict:
    """THE TRIGGER, over HTTP: collect from every enabled source, then run the
    full ordered enrichment pass — the corpus augments itself with the newest
    developments. Non-blocking; poll GET /api/refresh for the outcome.

    Guarded once REFRESH_SECRET is configured (see data/config.py) — unset
    (the local-dev default) means no auth, matching prior behavior. Set it
    before deploying publicly: this endpoint is meant for a trusted caller
    (you, a cron job), not an anonymous visitor, and unlike /api/brief a
    shared secret is the right fit here since the caller isn't the browser."""
    secret = get_settings().refresh_secret
    if secret and x_refresh_secret != secret:
        raise HTTPException(status_code=403, detail="Invalid or missing refresh secret.")
    started, reason = _try_start_refresh()
    if not started:
        return {"started": False, "reason": reason}
    try:
        background.add_task(_run_refresh)
    except Exception:
        # Never leave the slot claimed by a task that was never scheduled.
        _finish_refresh(ok=False, result={}, error="failed to schedule refresh task")
        raise
    return {"started": True}


@app.get("/api/refresh")
def refresh_status() -> dict:
    """Refresh health, as the weekly audit routine reads it.

    ``ok`` is the verdict on the last COMPLETED run: None = never completed,
    False = it failed and ``error`` says how. ``last_result`` is whatever the
    run managed to produce, success or not — never a previous run's totals.
    """
    with _refresh_lock:
        state = dict(_refresh_state)
    # After a restart memory says "never run". The durable record says what
    # actually happened last, so that is what is reported alongside.
    try:
        from mandate.runs import latest  # noqa: PLC0415
        url = _durable_url()
        last = latest(url, brain="policy", kind="policy_refresh") if url else None
        state["durable"] = ({k: (v.isoformat() if hasattr(v, "isoformat") else v)
                             for k, v in last.items() if k != "detail"} if last else None)
    except Exception:  # noqa: BLE001
        state["durable"] = None
    return {
        **state,
        "last_started": _iso(state["last_started"]),
        "last_finished": _iso(state["last_finished"]),
        "progress_at": _iso(state["progress_at"]),
    }


def _iso(value: dt.datetime | None) -> str | None:
    return value.isoformat() if value else None


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
