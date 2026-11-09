"""The workspace record (mandate/db/workspace.sql): missions and what the agents
decided, flagged, planned and asked the founder to do.

Every write is an INSERT. A claim list is validated here, against the citations
handed in WITH it, and those citations are re-resolved from grounding before
anything is stored (citations.check_citations): the table holds what grounding
says, never what an agent said grounding says.
"""
from __future__ import annotations

import json

from psycopg.rows import dict_row

from .citations import Stores, check_citations

AGENTS = ("mandate", "wincent", "regina")
WRITERS = ("founder",) + AGENTS
BASES = ("cited", "judgement", "unverified")


class ClaimError(ValueError):
    """A claim that is neither cited nor labelled as judgement or unverified."""


def validate_claims(claims: list, citations: dict) -> list[dict]:
    """THE claims rule, the one place it is written (the DB CHECK is its floor):
    every claim has text and a basis; a 'cited' claim names at least one
    citation id, and every id it names is among the citations handed in; a
    'judgement' or 'unverified' claim names none (a label is not a citation)."""
    if not isinstance(claims, list):
        raise ClaimError("claims must be a list")
    out = []
    for i, c in enumerate(claims):
        if not isinstance(c, dict) or not str(c.get("text", "")).strip():
            raise ClaimError(f"claim {i}: needs text")
        basis = c.get("basis")
        if basis not in BASES:
            raise ClaimError(f"claim {i}: basis must be one of {', '.join(BASES)}")
        ids = c.get("citation_ids") or []
        if not isinstance(ids, list) or not all(isinstance(x, str) for x in ids):
            raise ClaimError(f"claim {i}: citation_ids must be a list of ids")
        if basis == "cited":
            if not ids:
                raise ClaimError(f"claim {i} ({c['text'][:60]!r}) is marked cited but names no citation")
            missing = [x for x in ids if x not in citations]
            if missing:
                raise ClaimError(f"claim {i}: citation id(s) {missing} were not provided")
        elif ids:
            raise ClaimError(f"claim {i}: a {basis} claim names no citation; mark it cited or drop the ids")
        out.append({"text": str(c["text"]).strip(), "basis": basis, "citation_ids": ids})
    return out


def _used(claims: list[dict], citations: dict) -> dict:
    used = {x for c in claims for x in c["citation_ids"]}
    return {k: v for k, v in citations.items() if k in used}


def _one(con, sql: str, params: tuple) -> dict:
    with con.cursor(row_factory=dict_row) as cur:
        return cur.execute(sql, params).fetchone()


def _all(con, sql: str, params: tuple) -> list[dict]:
    with con.cursor(row_factory=dict_row) as cur:
        return cur.execute(sql, params).fetchall()


def create_mission(con, *, workspace_id: str, objective: str, created_by: str,
                   profile_id: str | None = None, profile_version: int | None = None,
                   job: str | None = None, author_account_id: str | None = None) -> dict:
    return _one(con,
        "INSERT INTO mandate.missions (workspace_id, profile_id, profile_version, objective, job, "
        "created_by, author_account_id) VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING *",
        (workspace_id, profile_id, profile_version, objective, job, created_by, author_account_id))


def add_message(con, mission_id: str, *, created_by: str, content: str = "",
                payload: dict | None = None) -> dict:
    return _one(con,
        "INSERT INTO mandate.messages (mission_id, created_by, content, payload) "
        "VALUES (%s, %s, %s, %s::jsonb) RETURNING id, mission_id, created_by, created_at",
        (mission_id, created_by, content, json.dumps(payload or {})))


def add_decision(con, stores: Stores, mission_id: str, *, title: str, recommendation: str,
                 claims: list, citations: dict, confidence: str, created_by: str,
                 due_at: str | None = None, supersedes: str | None = None) -> dict:
    claims = validate_claims(claims, citations or {})
    resolved = check_citations(stores, _used(claims, citations or {}))
    return _one(con,
        "INSERT INTO mandate.decisions (mission_id, title, recommendation, claims, citations, "
        "confidence, due_at, supersedes, created_by) "
        "VALUES (%s, %s, %s, %s::jsonb, %s::jsonb, %s, %s, %s, %s) RETURNING *",
        (mission_id, title, recommendation, json.dumps(claims), json.dumps(resolved),
         confidence, due_at, supersedes, created_by))


def add_flag(con, stores: Stores, mission_id: str, *, title: str, severity: str, claims: list,
             citations: dict, fix: str, created_by: str, status: str = "open",
             supersedes: str | None = None) -> dict:
    claims = validate_claims(claims, citations or {})
    resolved = check_citations(stores, _used(claims, citations or {}))
    return _one(con,
        "INSERT INTO mandate.flags (mission_id, title, severity, claims, citations, fix, status, "
        "supersedes, created_by) VALUES (%s, %s, %s, %s::jsonb, %s::jsonb, %s, %s, %s, %s) RETURNING *",
        (mission_id, title, severity, json.dumps(claims), json.dumps(resolved), fix, status,
         supersedes, created_by))


def add_action(con, mission_id: str, *, title: str, created_by: str, detail: str = "",
               decision_id: str | None = None, stakeholder: dict | None = None,
               draft: str | None = None, due_at: str | None = None) -> dict:
    return _one(con,
        "INSERT INTO mandate.actions (mission_id, decision_id, title, detail, stakeholder, draft, "
        "due_at, created_by) VALUES (%s, %s, %s, %s, %s::jsonb, %s, %s, %s) RETURNING *",
        (mission_id, decision_id, title, detail,
         json.dumps(stakeholder) if stakeholder is not None else None, draft, due_at, created_by))


def add_action_event(con, action_id: str, *, status: str, created_by: str, note: str = "") -> dict:
    return _one(con,
        "INSERT INTO mandate.action_events (action_id, status, note, created_by) "
        "VALUES (%s, %s, %s, %s) RETURNING *", (action_id, status, note, created_by))


def add_plan_step(con, mission_id: str, *, title: str, created_by: str, detail: str = "",
                  ordinal: int | None = None, horizon: str | None = None,
                  decision_id: str | None = None, supersedes: str | None = None) -> dict:
    if ordinal is None:
        ordinal = _one(con, "SELECT coalesce(max(ordinal), 0) + 1 AS n FROM mandate.plan_steps "
                            "WHERE mission_id = %s", (mission_id,))["n"]
    return _one(con,
        "INSERT INTO mandate.plan_steps (mission_id, decision_id, ordinal, title, detail, horizon, "
        "supersedes, created_by) VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING *",
        (mission_id, decision_id, ordinal, title, detail, horizon, supersedes, created_by))


def mission(con, mission_id: str) -> dict | None:
    m = _one(con, "SELECT * FROM mandate.missions WHERE id = %s", (mission_id,))
    if m is None:
        return None
    q = "SELECT * FROM mandate.{} WHERE mission_id = %s ORDER BY created_at, id"
    return {
        **m,
        "messages": _all(con, "SELECT * FROM mandate.messages WHERE mission_id = %s ORDER BY id", (mission_id,)),
        "decisions": _all(con, q.format("decisions_current"), (mission_id,)),
        "actions": _all(con, q.format("actions_current"), (mission_id,)),
        "flags": _all(con, q.format("flags_current"), (mission_id,)),
        "plan_steps": _all(con, "SELECT * FROM mandate.plan_steps_current WHERE mission_id = %s "
                                "ORDER BY ordinal, created_at", (mission_id,)),
    }


def snapshot(con, workspace_id: str) -> dict:
    """The workspace as it stands: every current decision, action, flag and step."""
    q = ("SELECT x.* FROM mandate.{} x JOIN mandate.missions m ON m.id = x.mission_id "
         "WHERE m.workspace_id = %s ORDER BY x.created_at DESC")
    return {
        "workspace_id": workspace_id,
        "missions": _all(con, "SELECT * FROM mandate.missions WHERE workspace_id = %s "
                              "ORDER BY created_at DESC", (workspace_id,)),
        "decisions": _all(con, q.format("decisions_current"), (workspace_id,)),
        "actions": _all(con, q.format("actions_current"), (workspace_id,)),
        "flags": _all(con, q.format("flags_current"), (workspace_id,)),
        "plan_steps": _all(con, q.format("plan_steps_current"), (workspace_id,)),
    }
