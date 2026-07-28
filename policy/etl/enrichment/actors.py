"""Named actors, extracted from verbatim debate passages.

Phase 5.1. The gap was measured rather than assumed: the first judged panel put
``stakeholder_specificity`` at 2.80 — lowest of seven dimensions, and the only one
that *declined* — with four of five judge critiques saying the same thing, that
stakeholders "remain institutional (AI Office, committees) without named
individuals". The brief's prompt already demands a who-runs-what map and visibly
tries; it can only reach institutions because the corpus held no actors.

**This extracts from stored passages rather than changing the adapters**, which
is the deliberate choice. ``ep_verbatim`` already parses ``(speaker, role)`` per
turn at `ep_verbatim.py:98` and then flattens it into
``"{name} ({role}) — {speech}"`` text, discarding the structure. Re-deriving from
that text needs no re-ingestion of 6,367 documents, no network, and no adapter or
pipeline changes — and the format is fully determined by the adapter that wrote
it (see `_ATTRIBUTION`), not guessed at.

The trade-off, stated plainly: this is a parser reading a serialization of
something that *was* structured, which is a strictly worse design than the
adapters emitting actors directly. Doing it properly means threading an
``actors`` field through ``ParsedDocument`` and the pipeline. That is the right
follow-up; this establishes whether names actually lift the score before paying
for the invasive version.
"""

from __future__ import annotations

import re

import structlog
from sqlalchemy import select
from sqlalchemy.orm import Session

from data.models import (
    Actor,
    ActorRole,
    Document,
    DocumentActor,
    DocumentType,
    DocumentVersion,
    Passage,
    Source,
)

log = structlog.get_logger(__name__)

# The exact shape ep_verbatim/an_verbatim/de_verbatim write. The dash is an
# en-dash — the adapter's own comment notes the source renders &#8211; and never
# a plain ASCII hyphen, so anchoring on it is safe and keeps this from matching
# ordinary prose that happens to contain parentheses.
_ATTRIBUTION = re.compile(r"^(?P<name>[^\n(]{2,80}?)(?:\s*\((?P<role>[^)]{1,120})\))?\s+—\s")

# Which institution a source's speakers belong to. Actors are keyed on
# (name, institution), so this is what keeps a Bundestag speaker from merging
# with an identically-named MEP.
_INSTITUTION_BY_SOURCE = {
    "ep_verbatim": "European Parliament",
    "an_verbatim": "Assemblée Nationale",
    "de_verbatim": "Bundestag",
}

# The chair, in the languages the corpus carries. These are procedural — whoever
# is presiding says "the next vote is on…" — so they are not stakeholders, and
# without this filter the chair would be the most prolific "actor" in the corpus
# by an order of magnitude and would dominate every stakeholder block.
# Every optional feminine/plural suffix here is load-bearing: a trailing \b after
# "président" fails when the text reads "présidente", which is exactly how the
# French chair is written — so "Mme la présidente" sailed through as a stakeholder
# until a test caught it.
_PRESIDING = re.compile(
    # Optional articles/honorifics, repeatable so "Mme la présidente" works.
    r"^(?:(?:the|die|der|das|le|la|mme|mr|m)\.?\s+)*"
    # Optional vice- prefix, in all three spellings.
    r"(?:vice-?|vize-?)?"
    # Truncated roots on purpose: matching "presiden" rather than "president\b"
    # sidesteps the suffix problem entirely (président/présidente/Präsident/
    # Präsidentin/presidents all follow), which is what the earlier \b-anchored
    # version kept getting wrong — first on "présidente", then on the German
    # forms when that was patched.
    r"(?:presiden|présiden|präsiden|vorsitzende|speaker)",
    re.IGNORECASE,
)

# Role cues → ActorRole. Matched case-insensitively as substrings of the raw
# role text, in this order, because "shadow rapporteur" contains "rapporteur"
# and must win. Multilingual on purpose: the corpus is EN/FR/DE and the German
# reports say "Berichterstatter", which an English-only map would silently miss —
# and the first real sample encountered was exactly that.
_ROLE_CUES: tuple[tuple[str, ActorRole], ...] = (
    ("shadow rapporteur", ActorRole.SHADOW_RAPPORTEUR),
    ("schattenberichterstatter", ActorRole.SHADOW_RAPPORTEUR),
    ("rapporteur fictif", ActorRole.SHADOW_RAPPORTEUR),
    ("rapporteur", ActorRole.RAPPORTEUR),
    ("rapporteure", ActorRole.RAPPORTEUR),
    ("berichterstatter", ActorRole.RAPPORTEUR),
    ("relatore", ActorRole.RAPPORTEUR),
)

# Political-group cues inside the role text, e.g. "on behalf of the EPP Group",
# "im Namen der EVP-Fraktion". Captured because a stakeholder's group is often
# more informative than their name for a reader deciding whom to approach.
_GROUP = re.compile(
    r"(?:on behalf of the|im Namen der|au nom du groupe)\s+(?P<group>[^,;]{2,60})",
    re.IGNORECASE,
)


def parse_attribution(text: str) -> tuple[str, str | None] | None:
    """``(name, role_text)`` from the head of a verbatim passage, or None.

    None means "this passage does not open with an attribution" — a continuation
    turn, a vote record, or a title-only passage. Returning None rather than
    guessing is what keeps procedural text out of the actor table.
    """
    match = _ATTRIBUTION.match(text.lstrip())
    if not match:
        return None
    name = " ".join(match.group("name").split()).strip(" .,")
    if not name or name.lower() == "unknown speaker":
        return None
    if _PRESIDING.match(name):
        return None
    role = match.group("role")
    return name, (" ".join(role.split()) if role else None)


# Role cues that identify the speaker's OWN institution, overriding the venue.
# Necessary because institution is otherwise derived from the source, i.e. from
# where the person was speaking — which mislabels exactly the actors that matter
# most. Found immediately on the first real run: Henna Virkkunen, an Executive
# Vice-President of the Commission, was recorded under "European Parliament"
# because she was addressing it, and would have merged with any MEP of the same
# name under the (name, institution) key.
_OWN_INSTITUTION_CUES: tuple[tuple[str, str], ...] = (
    ("member of the commission", "European Commission"),
    ("commissioner", "European Commission"),
    ("vice-president of the commission", "European Commission"),
    ("kommissar", "European Commission"),
    ("kommissarin", "European Commission"),
    ("membre de la commission", "European Commission"),
    ("president of the council", "Council of the EU"),
    ("council", "Council of the EU"),
    ("bundesminister", "German federal government"),
    ("staatssekretär", "German federal government"),
    ("ministre", "French government"),
)


def own_institution(role_text: str | None, venue: str | None) -> str | None:
    """The speaker's own institution, preferring an explicit cue in their stated
    role over the venue they were speaking in."""
    if role_text:
        lowered = role_text.lower()
        for cue, institution in _OWN_INSTITUTION_CUES:
            if cue in lowered:
                return institution
    return venue


def classify_role(role_text: str | None) -> ActorRole:
    """Map raw role text to an ActorRole. SPEAKER is the honest default: the
    person demonstrably spoke, and claiming more than that from an absent cue
    would invent a relationship."""
    if not role_text:
        return ActorRole.SPEAKER
    lowered = role_text.lower()
    for cue, role in _ROLE_CUES:
        if cue in lowered:
            return role
    return ActorRole.SPEAKER


def political_group(role_text: str | None) -> str | None:
    if not role_text:
        return None
    match = _GROUP.search(role_text)
    return match.group("group").strip() if match else None


def extract_actors(session: Session, *, dry_run: bool = False, limit: int | None = None) -> dict:
    """Populate ``actors`` / ``document_actor`` from verbatim debate passages.

    Idempotent: actors are looked up by (name, institution) and links by
    (document, actor, role), so re-running after new debates are ingested adds
    only what is new. Safe to attach to ``refresh`` — it makes no API calls.
    """
    stmt = (
        select(Passage.id, Passage.text, Document.id, Source.key)
        .join(DocumentVersion, Passage.version_id == DocumentVersion.id)
        .join(Document, DocumentVersion.document_id == Document.id)
        .join(Source, Document.source_id == Source.id)
        .where(
            DocumentVersion.is_current.is_(True),
            Document.document_type == DocumentType.VERBATIM_DEBATE,
        )
        .order_by(Passage.id)
    )
    if limit is not None:
        stmt = stmt.limit(limit)

    # Cache actors by key so a debate with 40 turns doesn't issue 40 lookups.
    cache: dict[tuple[str, str | None], Actor] = {}
    seen_links: set[tuple[int, int, ActorRole]] = set()
    stats = {"passages": 0, "attributed": 0, "actors_created": 0, "links_created": 0}
    roles: dict[str, int] = {}

    for passage_id, text, document_id, source_key in session.execute(stmt).all():
        stats["passages"] += 1
        parsed = parse_attribution(text or "")
        if parsed is None:
            continue
        name, role_text = parsed
        stats["attributed"] += 1
        institution = own_institution(role_text, _INSTITUTION_BY_SOURCE.get(source_key))
        role = classify_role(role_text)
        roles[role.value] = roles.get(role.value, 0) + 1
        if dry_run:
            continue

        key = (name, institution)
        actor = cache.get(key)
        if actor is None:
            actor = session.scalar(
                select(Actor).where(Actor.name == name, Actor.institution == institution)
            )
            if actor is None:
                actor = Actor(
                    name=name,
                    institution=institution,
                    role_text=role_text,
                    political_group=political_group(role_text),
                )
                session.add(actor)
                session.flush()
                stats["actors_created"] += 1
            cache[key] = actor

        link_key = (document_id, actor.id, role)
        if link_key in seen_links:
            continue
        seen_links.add(link_key)
        existing = session.scalar(
            select(DocumentActor).where(
                DocumentActor.document_id == document_id,
                DocumentActor.actor_id == actor.id,
                DocumentActor.role == role,
            )
        )
        if existing is None:
            session.add(
                DocumentActor(
                    document_id=document_id,
                    actor_id=actor.id,
                    role=role,
                    passage_id=passage_id,
                )
            )
            stats["links_created"] += 1

    if not dry_run:
        session.commit()
        stats["procedure_links"] = link_actors_to_procedures(session)
    stats["roles"] = roles
    stats["dry_run"] = dry_run
    log.info("actors_extracted", **{k: v for k, v in stats.items() if not isinstance(v, dict)})
    return stats


def link_actors_to_procedures(session: Session) -> int:
    """Also link a debate's actors to the legislative procedure it discussed.

    Without this the actor layer is unreachable from a brief. Extracting speakers
    links them to the *transcript*, but a brief's context holds instruments — the
    AI Act, GDPR, DORA — not transcripts, so the stakeholder lookup joined on
    document ids that were never present and returned nothing. Verified: zero
    stakeholders resolved for a fintech profile on the first attempt.

    ``ep_verbatim`` records the OEIL procedure references a debate item covered
    (``extra["procedure_references"]``) and the ``oeil`` adapter records each
    procedure's label (``extra["procedure_label"]``), so those two fields are the
    bridge. Coverage is honestly partial — 33 of 129 debates carry references —
    which bounds how often the block can fire today.

    Still missing, and the reason this is a step rather than the answer: nothing
    maps a procedure to the CELEX act it becomes, so actors remain unreachable
    from *legislation* in context. Closing that needs OEIL's own rapporteur
    fields (whether the detail endpoint carries them is unverified) or a
    procedure→CELEX mapping.
    """
    procedures = {
        (doc.extra or {}).get("procedure_label"): doc.id
        for doc in session.scalars(
            select(Document).where(Document.extra.isnot(None))
        ).all()
        if (doc.extra or {}).get("procedure_label")
    }
    if not procedures:
        return 0

    created = 0
    debates = session.scalars(
        select(Document).where(Document.document_type == DocumentType.VERBATIM_DEBATE)
    ).all()
    for debate in debates:
        refs = (debate.extra or {}).get("procedure_references") or []
        targets = [procedures[ref] for ref in refs if ref in procedures]
        if not targets:
            continue
        links = session.scalars(
            select(DocumentActor).where(DocumentActor.document_id == debate.id)
        ).all()
        for target_id in targets:
            for link in links:
                exists = session.scalar(
                    select(DocumentActor).where(
                        DocumentActor.document_id == target_id,
                        DocumentActor.actor_id == link.actor_id,
                        DocumentActor.role == link.role,
                    )
                )
                if exists is None:
                    session.add(
                        DocumentActor(
                            document_id=target_id,
                            actor_id=link.actor_id,
                            role=link.role,
                            # Points at the passage where they actually spoke, in
                            # the debate — so the claim still traces to real text
                            # even though the link now hangs off the procedure.
                            passage_id=link.passage_id,
                        )
                    )
                    created += 1
    session.commit()
    log.info("actor_procedure_links", created=created)
    return created
