"""Controlled-vocabulary seed data: policy areas and sectors.

These power profile-based relevance filtering in the company-facing layer.
Kept deliberately small and tech-policy-focused for the EU MVP.
"""

from __future__ import annotations

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

SECTORS: list[tuple[str, str]] = [
    ("software-saas", "Software & SaaS"),
    ("fintech", "Financial Services & Fintech"),
    ("ecommerce", "E-commerce & Retail"),
    ("healthtech", "Health & Medtech"),
    ("adtech", "Advertising & Media"),
    ("manufacturing", "Manufacturing & IoT"),
    ("telecom", "Telecommunications"),
    ("public-sector", "Public Sector"),
    ("mobility", "Mobility & Automotive"),
    ("energy", "Energy & Utilities"),
]


def seed_vocabularies(session: Session) -> None:
    """Idempotently upsert the controlled vocabularies by slug."""
    _upsert(session, PolicyArea, POLICY_AREAS)
    _upsert(session, Sector, SECTORS)


def _upsert(session: Session, model, rows: list[tuple[str, str]]) -> None:
    existing = {s for (s,) in session.execute(select(model.slug)).all()}
    for slug, name in rows:
        if slug not in existing:
            session.add(model(slug=slug, name=name))
