"""The actors register (mandate/db/actors.sql): who a founder engages.

Read actors.sql's header first: the personal-data line is the design. In code:

  * every entry is written with a citation re-resolved from grounding here
    (citations.resolve), never the agent's own account of the source;
  * a contact point's value must be IN its citation's quote (also a DB CHECK);
  * an email format is derived from published examples, each of which must be
    in its own citation's quote, and its confidence is computed, never given;
  * `apply_format` turns a format into a guessed address for ONE conversation
    and labels it unverified advice. It writes nothing; there is no table for it.
"""
from __future__ import annotations

import json
import re
import unicodedata

from psycopg.rows import dict_row

from .citations import CitationError, Stores, resolve

AGENT_WRITERS = ("mandate", "wincent", "regina", "seed")
UNVERIFIED_LABEL = ("UNVERIFIED ADVICE: derived from the organisation's published address format, "
                    "not a published address for this person. Try it, or use the switchboard or "
                    "press office. Not stored and not a verified contact.")


class RegisterError(ValueError):
    pass


def _cite(stores: Stores, c: dict) -> dict:
    if not isinstance(c, dict):
        raise RegisterError("an entry needs a citation: where it was published")
    try:
        span = c.get("span")
        return resolve(stores, quote=c.get("quote") or "", sha256=c.get("sha256"),
                       url=None if c.get("sha256") else c.get("canonical_url"),
                       span=tuple(span) if span else None)
    except CitationError as e:
        raise RegisterError(f"citation does not resolve: {e}") from e


def _one(con, sql, params):
    with con.cursor(row_factory=dict_row) as cur:
        return cur.execute(sql, params).fetchone()


def _all(con, sql, params):
    with con.cursor(row_factory=dict_row) as cur:
        return cur.execute(sql, params).fetchall()


def add_organisation(con, stores: Stores, *, name: str, kind: str, citation: dict,
                     created_by: str, jurisdiction: str | None = None, website: str | None = None,
                     description: str = "", topics: list[str] | None = None,
                     parent_id: str | None = None) -> dict:
    c = _cite(stores, citation)
    row = _one(con,
        "INSERT INTO mandate.actor_organisations (name, kind, jurisdiction, parent_id, website, "
        "description, citation, created_by) VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, %s) "
        "ON CONFLICT (lower(name), coalesce(jurisdiction, '')) DO NOTHING RETURNING *",
        (name.strip(), kind, jurisdiction, parent_id, website, description, json.dumps(c), created_by))
    if row is None:  # already registered: insert-only, the first record stands
        row = _one(con, "SELECT * FROM mandate.actor_organisations WHERE lower(name) = lower(%s) "
                        "AND coalesce(jurisdiction, '') = coalesce(%s, '')", (name.strip(), jurisdiction))
        row["existing"] = True
    for t in topics or []:
        if t and t.strip():
            con.execute("INSERT INTO mandate.actor_topics (organisation_id, topic, citation, created_by) "
                        "VALUES (%s, %s, %s::jsonb, %s) ON CONFLICT DO NOTHING",
                        (row["id"], t.strip().lower(), json.dumps(c), created_by))
    return row


def add_membership(con, stores: Stores, *, member_id: str, coalition_id: str, citation: dict,
                   created_by: str) -> dict:
    c = _cite(stores, citation)
    row = _one(con,
        "INSERT INTO mandate.actor_memberships (member_id, coalition_id, citation, created_by) "
        "VALUES (%s, %s, %s::jsonb, %s) ON CONFLICT (member_id, coalition_id) DO NOTHING RETURNING *",
        (member_id, coalition_id, json.dumps(c), created_by))
    return row or _one(con, "SELECT * FROM mandate.actor_memberships WHERE member_id = %s AND "
                            "coalition_id = %s", (member_id, coalition_id))


def add_role(con, stores: Stores, *, person_name: str, organisation_id: str, title: str,
             citation: dict, created_by: str, beat: str = "") -> dict:
    """A person enters the register only through a public role, and the role's
    citation must name them: a role nobody published is not a public role."""
    c = _cite(stores, citation)
    if _fold(person_name) not in _fold(c["quote"]):
        raise RegisterError("the cited passage does not name this person: a public role must be "
                            "published, with the person's name, where it is cited")
    person = _one(con, "INSERT INTO mandate.actor_people (name, created_by) VALUES (%s, %s) RETURNING *",
                  (person_name.strip(), created_by))
    role = _one(con,
        "INSERT INTO mandate.actor_roles (person_id, organisation_id, title, beat, citation, created_by) "
        "VALUES (%s, %s, %s, %s, %s::jsonb, %s) RETURNING *",
        (person["id"], organisation_id, title.strip(), beat.strip(), json.dumps(c), created_by))
    return {**role, "person": person}


def add_contact_point(con, stores: Stores, *, kind: str, channel: str, value: str, citation: dict,
                      created_by: str, organisation_id: str | None = None,
                      role_id: str | None = None) -> dict:
    c = _cite(stores, citation)
    if _norm(value) not in _norm(c["quote"]):
        raise RegisterError("this value is not in the cited passage. Only a contact detail the "
                            "person or organisation publishes may be stored.")
    row = _one(con,
        "INSERT INTO mandate.actor_contact_points (organisation_id, role_id, kind, channel, value, "
        "citation, created_by) VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s) "
        "ON CONFLICT (coalesce(organisation_id, role_id), lower(value)) DO NOTHING RETURNING *",
        (organisation_id, role_id, kind, channel, value.strip(), json.dumps(c), created_by))
    return row or _one(con, "SELECT * FROM mandate.actor_contact_points WHERE "
                            "coalesce(organisation_id, role_id) = %s AND lower(value) = lower(%s)",
                       (organisation_id or role_id, value.strip()))


# ── email formats ─────────────────────────────────────────────────────────

def _fold(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "")
    return "".join(ch for ch in s if not unicodedata.combining(ch)).lower()


def _norm(s: str) -> str:
    return " ".join((s or "").lower().split())


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9-]", "", _fold(s).replace(" ", "-"))


def pattern_of(address: str, first: str, last: str) -> str | None:
    """'{first}.{last}@x.eu' from ('anna.schmidt@x.eu', 'Anna', 'Schmidt'), or
    None when the local part is not built from the name in a recognisable way."""
    local, _, domain = address.strip().lower().partition("@")
    f, l = _slug(first), _slug(last)
    if not domain or not f or not l:
        return None
    # whole names first, longest first, so 'anna' is not read as 'a' + 'nna'
    p = local
    for token, ph in sorted([(f, "{first}"), (l, "{last}")], key=lambda x: -len(x[0])):
        p = p.replace(token, ph, 1)
    if "{first}" not in p and p.startswith(f[0]):
        p = "{f}" + p[1:]
    if "{last}" not in p and p.endswith(l[0]):
        p = p[:-1] + "{l}"
    if not re.fullmatch(r"(\{(first|last|f|l)\}|[._-])+", p):
        return None
    if "{last}" not in p and "{l}" not in p:
        return None
    return f"{p}@{domain}"


def confidence_for(agreeing: int, seen: int) -> str:
    """Three agreeing published examples and no disagreement is a format; one is
    a hint. Computed, never asserted by the writer."""
    if agreeing >= 3 and agreeing == seen:
        return "high"
    if agreeing >= 2 and agreeing / seen >= 0.66:
        return "medium"
    return "low"


def add_email_format(con, stores: Stores, *, organisation_id: str, examples: list[dict],
                     created_by: str) -> dict:
    """examples: [{"address", "first", "last", "citation"}] -- each a PUBLISHED
    address, found in its own citation's quote."""
    if not examples:
        raise RegisterError("a format is derived from published examples; none given")
    seen: list[tuple[str, dict, str]] = []
    for ex in examples:
        addr = str(ex.get("address", "")).strip().lower()
        c = _cite(stores, ex.get("citation"))
        if addr not in c["quote"].lower():
            raise RegisterError(f"{addr} is not in its cited passage; only published addresses count")
        p = pattern_of(addr, str(ex.get("first", "")), str(ex.get("last", "")))
        seen.append((addr, c, p or ""))
    counts: dict[str, int] = {}
    for _, _, p in seen:
        if p:
            counts[p] = counts.get(p, 0) + 1
    if not counts:
        raise RegisterError("no example is built from its holder's name; there is no format to state")
    pattern, agreeing = max(counts.items(), key=lambda kv: kv[1])
    domain = pattern.split("@", 1)[1]
    support = [(a, c) for a, c, p in seen if p == pattern]
    return _one(con,
        "INSERT INTO mandate.actor_email_formats (organisation_id, domain, pattern, examples, citations, "
        "examples_agreeing, examples_seen, confidence, created_by) "
        "VALUES (%s, %s, %s, %s::jsonb, %s::jsonb, %s, %s, %s, %s) RETURNING *",
        (organisation_id, domain, pattern, json.dumps([a for a, _ in support]),
         json.dumps([c for _, c in support]), agreeing, len(seen),
         confidence_for(agreeing, len(seen)), created_by))


def apply_format(con, format_id: str, first: str, last: str) -> dict:
    """A guessed address for ONE conversation. Writes nothing."""
    fmt = _one(con, "SELECT * FROM mandate.actor_email_formats WHERE id = %s", (format_id,))
    if fmt is None:
        raise RegisterError("no such format")
    f, l = _slug(first), _slug(last)
    addr = (fmt["pattern"].replace("{first}", f).replace("{last}", l)
            .replace("{f}", f[:1]).replace("{l}", l[:1]))
    return {"address": addr, "verified": False, "stored": False, "label": UNVERIFIED_LABEL,
            "format": {"pattern": fmt["pattern"], "confidence": fmt["confidence"],
                       "examples_agreeing": fmt["examples_agreeing"], "examples_seen": fmt["examples_seen"],
                       "citations": fmt["citations"]}}


# ── verification and erasure ─────────────────────────────────────────────

def verify_entry(con, stores: Stores, *, entity: str, entity_id: str, still_published: bool,
                 created_by: str, citation: dict | None = None) -> dict:
    c = _cite(stores, citation) if still_published else None
    return _one(con,
        "INSERT INTO mandate.actor_verifications (entity, entity_id, still_published, citation, created_by) "
        "VALUES (%s, %s, %s, %s::jsonb, %s) RETURNING *",
        (entity, entity_id, still_published, json.dumps(c) if c else None, created_by))


def erase(con, *, entity: str, entity_id: str, reason: str) -> dict:
    """The one deletion: personal data, on request or when no longer published.
    A person takes their roles and those roles' contact points with them."""
    if entity not in ("person", "role", "contact_point"):
        raise RegisterError("only personal data is erased")
    with con.transaction():
        con.execute("SET LOCAL mandate.erasure = 'on'")
        if entity == "person":
            roles = [r["id"] for r in _all(con, "SELECT id FROM mandate.actor_roles WHERE person_id = %s", (entity_id,))]
            for rid in roles:
                con.execute("DELETE FROM mandate.actor_contact_points WHERE role_id = %s", (rid,))
            con.execute("DELETE FROM mandate.actor_roles WHERE person_id = %s", (entity_id,))
            n = con.execute("DELETE FROM mandate.actor_people WHERE id = %s", (entity_id,)).rowcount
        elif entity == "role":
            con.execute("DELETE FROM mandate.actor_contact_points WHERE role_id = %s", (entity_id,))
            n = con.execute("DELETE FROM mandate.actor_roles WHERE id = %s", (entity_id,)).rowcount
        else:
            n = con.execute("DELETE FROM mandate.actor_contact_points WHERE id = %s", (entity_id,)).rowcount
        con.execute("INSERT INTO mandate.actor_erasures (entity, entity_id, reason) VALUES (%s, %s, %s)",
                    (entity, entity_id, reason))
    return {"erased": bool(n), "entity": entity, "entity_id": entity_id}


# ── reading ──────────────────────────────────────────────────────────────

def find(con, *, q: str | None = None, kind: str | None = None, jurisdiction: str | None = None,
         limit: int = 20) -> list[dict]:
    """Organisations matching a name or topic, each with its public roles,
    published contact points and email formats."""
    where, params = [], []
    if q:
        where.append("(o.name ILIKE %s OR o.description ILIKE %s OR EXISTS (SELECT 1 FROM "
                     "mandate.actor_topics t WHERE t.organisation_id = o.id AND t.topic ILIKE %s))")
        params += [f"%{q}%"] * 3
    if kind:
        where.append("o.kind = %s")
        params.append(kind)
    if jurisdiction:
        where.append("(o.jurisdiction = %s OR o.jurisdiction = 'EU')")
        params.append(jurisdiction)
    sql = ("SELECT o.* FROM mandate.actor_organisations_current o"
           + (" WHERE " + " AND ".join(where) if where else "") + " ORDER BY o.name LIMIT %s")
    orgs = _all(con, sql, (*params, limit))
    for o in orgs:
        o["roles"] = _all(con,
            "SELECT r.id, p.name AS person, r.title, r.beat, r.citation FROM mandate.actor_roles r "
            "JOIN mandate.actor_people p ON p.id = r.person_id WHERE r.organisation_id = %s "
            "ORDER BY r.created_at", (o["id"],))
        o["contact_points"] = _all(con,
            "SELECT id, kind, channel, value, citation FROM mandate.actor_contact_points "
            "WHERE organisation_id = %s OR role_id IN (SELECT id FROM mandate.actor_roles "
            "WHERE organisation_id = %s)", (o["id"], o["id"]))
        o["email_formats"] = _all(con,
            "SELECT id, domain, pattern, confidence, examples_agreeing, examples_seen "
            "FROM mandate.actor_email_formats WHERE organisation_id = %s ORDER BY created_at DESC",
            (o["id"],))
    return orgs
