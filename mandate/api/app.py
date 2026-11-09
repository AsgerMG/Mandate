"""mandate-api: the cross-brain capabilities the advisor's agents call.

    uvicorn mandate.api.app:app --port 8090

Grounding (fetch a source and cite a span of it), company profiles (read,
append a version), the workspace record (missions, decisions, actions, flags,
plan steps), and the actors register. Python because the grounding store and
the profile store already are: nothing here is duplicated in TypeScript.

ENVIRONMENT
  DATABASE_URL            the brain role this service runs as (mandate_app). Read/write.
  GROUNDING_REFERENCE_URL optional, READ-ONLY: a second grounding store consulted
                          when a citation is not in the primary one (by sha256 or
                          URL, never by id). For a rehearsal: a throwaway primary,
                          production grounding as reference (capital_ro), and no
                          production write is possible. Never set in production.
  MANDATE_SERVICE_TOKEN   the shared secret the site sends as `Authorization:
                          Bearer <token>`. Unset, every route but /health refuses
                          (fail closed): there are no public writes.
  BUCKET_* / GROUNDING_BUCKET_DIR   where fetched bytes go (mandate/grounding/bucket.py)
"""
from __future__ import annotations

import datetime as dt
import hmac
import ipaddress
import os
import socket
from contextlib import contextmanager
from typing import Any, Literal
from urllib.parse import urlsplit

import httpx
import psycopg
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from pydantic import BaseModel, Field

from mandate.grounding import store as gstore
from mandate.profile import ProfileError
from mandate.profile import store as pstore

from . import actors as reg
from . import workspace as ws
from .citations import CitationError, Stores, resolve, verify
from .extract import extractor, html_text

Agent = Literal["mandate", "wincent", "regina"]
Writer = Literal["founder", "mandate", "wincent", "regina"]


class FetchIn(BaseModel):
    url: str
    title: str | None = None
    publisher: str | None = None
    kind: str | None = None
    # reuse the newest stored fetch when it is younger than this
    max_age_days: float = Field(7, ge=0, le=365)


class CiteIn(BaseModel):
    quote: str
    sha256: str | None = None
    url: str | None = None
    span: tuple[int, int] | None = None


class VerifyIn(BaseModel):
    citations: list[dict[str, Any]]


class BootstrapIn(BaseModel):
    email: str
    workspace_name: str
    profile: dict


class AppendIn(BaseModel):
    payload: dict
    source: Literal["founder", "mandate", "wincent", "regina"]
    expected: int = Field(ge=1)
    note: str = ""


class MissionIn(BaseModel):
    workspace_id: str
    objective: str
    created_by: Literal["founder", "mandate", "eval"] = "founder"
    profile_id: str | None = None
    profile_version: int | None = None
    job: str | None = None


class MessageIn(BaseModel):
    created_by: Literal["founder", "mandate", "wincent", "regina", "tool", "eval"]
    content: str = ""
    payload: dict = Field(default_factory=dict)


class Claim(BaseModel):
    text: str
    basis: Literal["cited", "judgement", "unverified"]
    citation_ids: list[str] = Field(default_factory=list)


class DecisionIn(BaseModel):
    title: str
    recommendation: str
    claims: list[dict]
    citations: dict[str, dict] = Field(default_factory=dict)
    confidence: Literal["low", "medium", "high"]
    created_by: Writer
    due_at: str | None = None
    supersedes: str | None = None


class FlagIn(BaseModel):
    title: str
    severity: Literal["blocker", "major", "minor"]
    claims: list[dict] = Field(default_factory=list)
    citations: dict[str, dict] = Field(default_factory=dict)
    fix: str = ""
    created_by: Writer
    status: Literal["open", "resolved", "dismissed"] = "open"
    supersedes: str | None = None


class ActionIn(BaseModel):
    title: str
    created_by: Writer
    detail: str = ""
    decision_id: str | None = None
    stakeholder: dict | None = None
    draft: str | None = None
    due_at: str | None = None


class ActionEventIn(BaseModel):
    status: Literal["open", "in_progress", "done", "dismissed"]
    created_by: Writer
    note: str = ""


class PlanStepIn(BaseModel):
    title: str
    created_by: Writer
    detail: str = ""
    ordinal: int | None = Field(default=None, ge=1)
    horizon: Literal["this_week", "this_month", "this_quarter", "later"] | None = None
    decision_id: str | None = None
    supersedes: str | None = None


class WatchIn(BaseModel):
    kind: Literal["route", "rule", "institution", "consultation", "case", "agenda"]
    subject: str
    created_by: Writer
    route_status: Literal["pursue", "probe", "parked", "closed"] | None = None
    trigger: str = ""
    jurisdiction: str | None = None
    citations: dict[str, dict] = Field(default_factory=dict)
    status: Literal["watching", "stopped"] = "watching"
    supersedes: str | None = None

class DeliverableIn(BaseModel):
    title: str
    summary: str = ""
    sections: list[dict]
    questions: list[dict] = Field(default_factory=list)
    citations: dict[str, dict] = Field(default_factory=dict)

class OrgIn(BaseModel):
    name: str
    kind: str
    citation: dict
    created_by: Literal["mandate", "wincent", "regina", "seed"]
    jurisdiction: str | None = None
    website: str | None = None
    description: str = ""
    topics: list[str] = Field(default_factory=list)
    parent_id: str | None = None


class MembershipIn(BaseModel):
    member_id: str
    coalition_id: str
    citation: dict
    created_by: Literal["mandate", "wincent", "regina", "seed"]


class RoleIn(BaseModel):
    person_name: str
    organisation_id: str
    title: str
    citation: dict
    created_by: Literal["mandate", "wincent", "regina", "seed"]
    beat: str = ""


class ContactIn(BaseModel):
    kind: str
    channel: Literal["email", "phone", "url", "postal"]
    value: str
    citation: dict
    created_by: Literal["mandate", "wincent", "regina", "seed"]
    organisation_id: str | None = None
    role_id: str | None = None


class FormatIn(BaseModel):
    organisation_id: str
    examples: list[dict]
    created_by: Literal["mandate", "wincent", "regina", "seed"]


class ApplyIn(BaseModel):
    first: str
    last: str


class VerificationIn(BaseModel):
    entity: Literal["organisation", "role", "contact_point", "email_format"]
    entity_id: str
    still_published: bool
    created_by: Literal["mandate", "wincent", "regina", "seed", "refresh"]
    citation: dict | None = None


class EraseIn(BaseModel):
    entity: Literal["person", "role", "contact_point"]
    entity_id: str
    reason: Literal["on_request", "no_longer_published"]


class Config:
    def __init__(self, database_url: str | None = None, reference_url: str | None = None,
                 token: str | None = None, http: httpx.Client | None = None,
                 allow_private_hosts: bool = False) -> None:
        self.database_url = database_url if database_url is not None else os.environ.get("DATABASE_URL", "")
        self.reference_url = (reference_url if reference_url is not None
                              else os.environ.get("GROUNDING_REFERENCE_URL", "")) or None
        self.token = token if token is not None else os.environ.get("MANDATE_SERVICE_TOKEN", "")
        self.http = http
        self.allow_private_hosts = allow_private_hosts


def create_app(config: Config | None = None) -> FastAPI:
    cfg = config or Config()
    app = FastAPI(title="mandate-api", version="0.1.0")

    def auth(authorization: str | None = Header(default=None)) -> None:
        if not cfg.token:
            raise HTTPException(503, "MANDATE_SERVICE_TOKEN is not set: refusing every request")
        given = (authorization or "").removeprefix("Bearer ").strip()
        if not hmac.compare_digest(given.encode(), cfg.token.encode()):
            raise HTTPException(401, "bad service token")

    @contextmanager
    def stores():
        if not cfg.database_url or cfg.database_url == "local":
            raise HTTPException(503, "DATABASE_URL is not set")
        primary = psycopg.connect(cfg.database_url)
        reference = None
        try:
            if cfg.reference_url:
                reference = psycopg.connect(cfg.reference_url)
                reference.read_only = True
            yield Stores(primary, reference)
            primary.commit()
        except Exception:
            primary.rollback()
            raise
        finally:
            primary.close()
            if reference is not None:
                reference.close()

    def guarded(fn, *a, **kw):
        try:
            return fn(*a, **kw)
        except (CitationError, ws.ClaimError, reg.RegisterError, ProfileError) as e:
            raise HTTPException(422, str(e)) from e
        except pstore.VersionConflict as e:
            raise HTTPException(409, str(e)) from e
        except psycopg.errors.CheckViolation as e:
            raise HTTPException(422, f"refused by the schema: {e.diag.constraint_name}") from e
        except psycopg.errors.ForeignKeyViolation as e:
            raise HTTPException(404, f"unknown reference: {e.diag.constraint_name}") from e
        except psycopg.errors.InvalidTextRepresentation as e:
            raise HTTPException(422, "malformed id") from e

    @app.get("/health")
    def health() -> dict:
        return {"ok": True, "auth": bool(cfg.token), "reference_store": bool(cfg.reference_url)}

    # ── grounding ────────────────────────────────────────────────────────

    def _public_host(url: str) -> None:
        p = urlsplit(url)
        if p.scheme not in ("http", "https") or not p.hostname:
            raise HTTPException(422, "only http(s) URLs are fetched")
        if cfg.allow_private_hosts:
            return
        try:
            infos = socket.getaddrinfo(p.hostname, None)
        except socket.gaierror as e:
            raise HTTPException(422, f"cannot resolve {p.hostname}") from e
        for info in infos:
            if not is_public_address(info[4][0]):
                raise HTTPException(422, "refusing to fetch a private or local address")

    def _version_out(v: gstore.Version, title: str | None, reused: bool, store: str = "primary") -> dict:
        return {"sha256": v.sha256, "version_id": v.id, "store": store, "canonical_url": v.canonical_url,
                "fetched_at": v.fetched_at.isoformat(), "mime": v.mime, "title": title,
                "chars": len(v.text) if v.text else 0, "citable": bool(v.text), "reused": reused}

    @app.post("/grounding/fetch", dependencies=[Depends(auth)])
    def grounding_fetch(body: FetchIn) -> dict:
        try:
            cu = gstore.canonical_url(body.url)
        except ValueError as e:
            raise HTTPException(422, str(e)) from e
        with stores() as s:
            now = dt.datetime.now(dt.timezone.utc)
            for name, con in (("primary", s.primary), ("reference", s.reference)):
                if con is None:
                    continue
                v = gstore.latest(con, cu)
                if v and v.text and now - _last_seen(con, v.id) <= dt.timedelta(days=body.max_age_days):
                    return _version_out(v, body.title, True, name)
            _public_host(cu)
            title = body.title
            try:
                v = gstore.fetch(s.primary, cu, client=cfg.http, extractor=extractor, title=title,
                                 publisher=body.publisher, kind=body.kind or "research")
            except httpx.HTTPError as e:
                raise HTTPException(502, f"fetch failed: {e}") from e
            if title is None and v.mime and "html" in v.mime and v.text:
                title = html_text(gstore.read_original(v))[1]
            return _version_out(v, title, False)


    @app.post("/grounding/cite", dependencies=[Depends(auth)])
    def grounding_cite(body: CiteIn) -> dict:
        with stores() as s:
            return guarded(resolve, s, quote=body.quote, sha256=body.sha256, url=body.url,
                           span=body.span)


    @app.post("/grounding/verify", dependencies=[Depends(auth)])
    def grounding_verify(body: VerifyIn) -> dict:
        with stores() as s:
            return {"results": [verify(s, c) for c in body.citations]}

    # ── profiles ─────────────────────────────────────────────────────────

    @app.post("/bootstrap", dependencies=[Depends(auth)])
    def bootstrap(body: BootstrapIn) -> dict:
        """An account, a workspace and its profile at version 1 (founder onboarding, the eval)."""
        with stores() as s:
            acct = guarded(pstore.create_account, s.primary, body.email)
            wid = pstore.create_workspace(s.primary, body.workspace_name, acct)
            pid, v = guarded(pstore.create_profile, s.primary, wid, body.profile, source="founder",
                             author=acct)
            return {"account_id": acct, "workspace_id": wid, "profile_id": pid, "profile_version": v}

    @app.get("/profiles/{profile_id}", dependencies=[Depends(auth)])
    def profile_get(profile_id: str) -> dict:
        with stores() as s:
            row = guarded(pstore.current, s.primary, profile_id)
            if row is None:
                raise HTTPException(404, "no such profile")
            return row


    @app.post("/profiles/{profile_id}/versions", dependencies=[Depends(auth)])
    def profile_append(profile_id: str, body: AppendIn) -> dict:
        with stores() as s:
            v = guarded(pstore.append_version, s.primary, profile_id, body.payload,
                        source=body.source, expected=body.expected, note=body.note)
            return {"profile_id": profile_id, "version": v}

    # ── workspace ────────────────────────────────────────────────────────

    @app.post("/missions", dependencies=[Depends(auth)])
    def mission_create(body: MissionIn) -> dict:
        with stores() as s:
            return guarded(ws.create_mission, s.primary, **body.model_dump())

    @app.get("/missions/{mission_id}", dependencies=[Depends(auth)])
    def mission_get(mission_id: str) -> dict:
        with stores() as s:
            m = guarded(ws.mission, s.primary, mission_id)
            if m is None:
                raise HTTPException(404, "no such mission")
            return m


    @app.post("/missions/{mission_id}/messages", dependencies=[Depends(auth)])
    def message_add(mission_id: str, body: MessageIn) -> dict:
        with stores() as s:
            return guarded(ws.add_message, s.primary, mission_id, **body.model_dump())



    @app.post("/missions/{mission_id}/decisions", dependencies=[Depends(auth)])
    def decision_add(mission_id: str, body: DecisionIn) -> dict:
        with stores() as s:
            return guarded(ws.add_decision, s.primary, s, mission_id, **body.model_dump())


    @app.post("/missions/{mission_id}/flags", dependencies=[Depends(auth)])
    def flag_add(mission_id: str, body: FlagIn) -> dict:
        with stores() as s:
            return guarded(ws.add_flag, s.primary, s, mission_id, **body.model_dump())


    @app.post("/missions/{mission_id}/actions", dependencies=[Depends(auth)])
    def action_add(mission_id: str, body: ActionIn) -> dict:
        with stores() as s:
            return guarded(ws.add_action, s.primary, mission_id, **body.model_dump())


    @app.post("/actions/{action_id}/events", dependencies=[Depends(auth)])
    def action_event(action_id: str, body: ActionEventIn) -> dict:
        with stores() as s:
            return guarded(ws.add_action_event, s.primary, action_id, **body.model_dump())


    @app.post("/missions/{mission_id}/plan_steps", dependencies=[Depends(auth)])
    def plan_step_add(mission_id: str, body: PlanStepIn) -> dict:
        with stores() as s:
            return guarded(ws.add_plan_step, s.primary, mission_id, **body.model_dump())

    @app.post("/missions/{mission_id}/watchlist", dependencies=[Depends(auth)])
    def watch_add(mission_id: str, body: WatchIn) -> dict:
        with stores() as s:
            return guarded(ws.add_watch, s.primary, s, mission_id, **body.model_dump())

    @app.post("/missions/{mission_id}/deliverable", dependencies=[Depends(auth)])
    def deliverable_add(mission_id: str, body: DeliverableIn) -> dict:
        with stores() as s:
            return guarded(ws.add_deliverable, s.primary, s, mission_id, **body.model_dump())

    @app.get("/workspaces/{workspace_id}/snapshot", dependencies=[Depends(auth)])
    def workspace_snapshot(workspace_id: str) -> dict:
        with stores() as s:
            return guarded(ws.snapshot, s.primary, workspace_id)

    # ── actors register ──────────────────────────────────────────────────
    @app.get("/actors", dependencies=[Depends(auth)])
    def actors_find(q: str | None = None, kind: str | None = None,
                    jurisdiction: str | None = None, limit: int = Query(20, le=100)) -> dict:
        with stores() as s:
            return {"actors": reg.find(s.primary, q=q, kind=kind, jurisdiction=jurisdiction, limit=limit)}


    @app.post("/actors/organisations", dependencies=[Depends(auth)])
    def actors_org(body: OrgIn) -> dict:
        with stores() as s:
            return guarded(reg.add_organisation, s.primary, s, **body.model_dump())


    @app.post("/actors/memberships", dependencies=[Depends(auth)])
    def actors_membership(body: MembershipIn) -> dict:
        with stores() as s:
            return guarded(reg.add_membership, s.primary, s, **body.model_dump())


    @app.post("/actors/roles", dependencies=[Depends(auth)])
    def actors_role(body: RoleIn) -> dict:
        with stores() as s:
            return guarded(reg.add_role, s.primary, s, **body.model_dump())


    @app.post("/actors/contact_points", dependencies=[Depends(auth)])
    def actors_contact(body: ContactIn) -> dict:
        with stores() as s:
            return guarded(reg.add_contact_point, s.primary, s, **body.model_dump())


    @app.post("/actors/email_formats", dependencies=[Depends(auth)])
    def actors_format(body: FormatIn) -> dict:
        with stores() as s:
            return guarded(reg.add_email_format, s.primary, s, **body.model_dump())


    @app.post("/actors/email_formats/{format_id}/apply", dependencies=[Depends(auth)])
    def actors_format_apply(format_id: str, body: ApplyIn) -> dict:
        with stores() as s:
            return guarded(reg.apply_format, s.primary, format_id, body.first, body.last)


    @app.post("/actors/verifications", dependencies=[Depends(auth)])
    def actors_verify(body: VerificationIn) -> dict:
        with stores() as s:
            return guarded(reg.verify_entry, s.primary, s, **body.model_dump())


    @app.post("/actors/erase", dependencies=[Depends(auth)])
    def actors_erase(body: EraseIn) -> dict:
        with stores() as s:
            return guarded(reg.erase, s.primary, **body.model_dump())

    return app


NAT64 = ipaddress.ip_network("64:ff9b::/96")


def is_public_address(addr: str) -> bool:
    """May mandate-api fetch from this address? Public unicast only.

    An IPv6 address that CARRIES an IPv4 one is judged by the IPv4 inside it:
    on a NAT64 network (DNS64) every IPv4-only site resolves to 64:ff9b::/96,
    which Python classes as reserved, and refusing it refused every such site
    (the smoke run of 9 Nov lost all its German and Italian sources to this).
    """
    ip = ipaddress.ip_address(addr.split("%")[0])
    if isinstance(ip, ipaddress.IPv6Address):
        if ip.ipv4_mapped:
            ip = ip.ipv4_mapped
        elif ip in NAT64:
            ip = ipaddress.IPv4Address(int(ip) & 0xFFFFFFFF)
    return not (ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved
                or ip.is_multicast or ip.is_unspecified)


def _last_seen(con, version_id: int) -> dt.datetime:
    row = con.execute("SELECT max(fetched_at) FROM grounding.fetches WHERE version_id = %s",
                      (version_id,)).fetchone()
    return row[0]


def __getattr__(name: str):
    # `uvicorn mandate.api.app:app` builds the app from the environment on first
    # access, so importing this module (tests) never reads it.
    if name == "app":
        globals()["app"] = create_app()
        return globals()["app"]
    raise AttributeError(name)
