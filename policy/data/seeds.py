"""Controlled-vocabulary seed data: policy areas and sectors.

These power profile-based relevance filtering in the company-facing layer.
Kept deliberately small and tech-policy-focused for the EU MVP.
"""

from __future__ import annotations

from mandate.vocabulary import POLICY_SECTORS
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import PolicyArea, Sector

POLICY_AREAS: list[tuple[str, str]] = [
    ("ai", "Artificial Intelligence"),
    ("data-protection", "Data Protection & Privacy"),
    ("data-governance", "Data Governance & Sharing"),
    ("platforms", "Online Platforms & Content"),
    ("competition", "Digital Markets & Competition"),
    ("cybersecurity", "Cybersecurity"),
    ("consumer", "Consumer Protection"),
    ("ip", "Intellectual Property"),
    ("telecoms", "Telecoms & Connectivity"),
    ("sustainability", "Digital Sustainability"),
]

# Policy's sector slugs are a PROJECTION of the one Mandate vocabulary
# (mandate/vocabulary/vocabulary.json `policySectors`, decisions D2-D11): each
# slug lifts to a shared sector family/subsector and is derived back from it.
# Same ten (slug, name) pairs, same order, as stood here.
SECTORS: list[tuple[str, str]] = list(POLICY_SECTORS)


def seed_vocabularies(session: Session) -> None:
    """Idempotently upsert the controlled vocabularies by slug."""
    _upsert(session, PolicyArea, POLICY_AREAS)
    _upsert(session, Sector, SECTORS)


def _upsert(session: Session, model, rows: list[tuple[str, str]]) -> None:
    existing = {s for (s,) in session.execute(select(model.slug)).all()}
    for slug, name in rows:
        if slug not in existing:
            session.add(model(slug=slug, name=name))
