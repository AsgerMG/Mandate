"""Read and append company profiles in schema `mandate` (mandate/db/profiles.sql).

    with psycopg.connect(url) as conn:              # capital_app or policy_app
        acct = create_account(conn, "founder@example.eu")
        ws = create_workspace(conn, "Acme", acct)
        pid, v = create_profile(conn, ws, {"name": "Acme"}, source="founder", author=acct)
        v2 = append_version(conn, pid, {...}, source="regina", expected=v)
        current(conn, pid)   # {"version": 2, "payload": {...}, ...}

Every write is VALIDATED against the vocabulary first (mandate.profile.validate)
and stored in canonical form. append_version takes the version the writer read:
if another writer got there first it raises VersionConflict rather than
overwriting what they recorded. Tables are schema-qualified because `mandate` is
not on a brain role's search_path (as with grounding).
"""
from __future__ import annotations

import json

import psycopg
from psycopg.rows import dict_row

from . import VOCABULARY_VERSION, validate


class VersionConflict(RuntimeError):
    """Someone appended a version after the one this writer read."""


def create_account(conn: psycopg.Connection, email: str, display_name: str | None = None) -> str:
    row = conn.execute(
        "INSERT INTO mandate.accounts (email, display_name) VALUES (%s, %s) RETURNING id",
        (email, display_name)).fetchone()
    return str(row[0])


def create_workspace(conn: psycopg.Connection, name: str, owner: str) -> str:
    wid = conn.execute(
        "INSERT INTO mandate.workspaces (name, created_by) VALUES (%s, %s) RETURNING id",
        (name, owner)).fetchone()[0]
    conn.execute("INSERT INTO mandate.workspace_members (workspace_id, account_id, role) "
                 "VALUES (%s, %s, 'owner')", (wid, owner))
    return str(wid)


def _insert_version(conn, profile_id, version, payload, source, author, note) -> None:
    conn.execute(
        "INSERT INTO mandate.company_profile_versions "
        "(profile_id, version, payload, vocabulary_version, source, author_account_id, note) "
        "VALUES (%s, %s, %s::jsonb, %s, %s, %s, %s)",
        (profile_id, version, json.dumps(validate(payload)), VOCABULARY_VERSION,
         source, author, note))


def create_profile(conn: psycopg.Connection, workspace_id: str, payload: dict, *,
                   source: str, author: str | None = None, note: str = "") -> tuple[str, int]:
    validate(payload)  # refuse before creating the anchor
    with conn.transaction():
        pid = str(conn.execute(
            "INSERT INTO mandate.company_profiles (workspace_id, created_by) "
            "VALUES (%s, %s) RETURNING id", (workspace_id, author)).fetchone()[0])
        _insert_version(conn, pid, 1, payload, source, author, note)
    return pid, 1


def append_version(conn: psycopg.Connection, profile_id: str, payload: dict, *, source: str,
                   expected: int, author: str | None = None, note: str = "") -> int:
    """Append version expected+1. VersionConflict if expected is not the newest."""
    new = expected + 1
    try:
        with conn.transaction():
            _insert_version(conn, profile_id, new, payload, source, author, note)
    except (psycopg.errors.UniqueViolation, psycopg.errors.RaiseException) as e:
        raise VersionConflict(
            f"profile {profile_id}: version {expected} is not the newest") from e
    return new


def current(conn: psycopg.Connection, profile_id: str) -> dict | None:
    with conn.cursor(row_factory=dict_row) as cur:
        return cur.execute("SELECT * FROM mandate.company_profile_current WHERE profile_id = %s",
                           (profile_id,)).fetchone()


def history(conn: psycopg.Connection, profile_id: str) -> list[dict]:
    with conn.cursor(row_factory=dict_row) as cur:
        return cur.execute("SELECT * FROM mandate.company_profile_versions WHERE profile_id = %s "
                           "ORDER BY version", (profile_id,)).fetchall()


__all__ = ["VersionConflict", "create_account", "create_workspace", "create_profile",
           "append_version", "current", "history"]
