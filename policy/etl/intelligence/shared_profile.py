"""Policy's CompanyProfile, DERIVED from the one Mandate company profile.

The shared profile (mandate/profile, stored in mandate.company_profile_versions)
is what every brain reads a company from. This is policy's adapter: it turns
that profile into the CompanyProfile this brain's retrieval, scoping questions
and briefing were built and measured on, so nothing downstream changes.

    from etl.intelligence.shared_profile import from_shared_profile
    profile = from_shared_profile(payload)   # payload: the shared profile JSON

tests/test_shared_profile.py proves that a brief request lifted into the shared
profile and derived back gives a CompanyProfile identical in every field, query
and retrieval facet to the one the request built directly.

What the shared profile gives policy that its own form never asked:
  * company_size is DERIVED from headcount/turnover/balance bands (the EU SME
    test) instead of self-declared;
  * a profile written by capital's intake (sector, countries, bands) reaches
    policy too: its sector family derives policy's slug, its countries derive
    markets (mandate/vocabulary decisions D2, D17).
"""

from __future__ import annotations

from mandate.profile.adapters import from_policy_request, to_policy_profile

from data.models import Jurisdiction

from .profile import CompanyProfile


def from_shared_profile(payload: dict) -> CompanyProfile:
    """Raises mandate.profile.ProfileError on a value outside the vocabulary."""
    kw = to_policy_profile(payload)
    kw["markets"] = [Jurisdiction(m) for m in kw["markets"]]
    return CompanyProfile(**kw)


def to_shared_profile(profile: CompanyProfile) -> dict:
    """The reverse lift, for an existing CompanyProfile (a fixture, a stored
    session). Refuses what the vocabulary cannot represent."""
    return from_policy_request(profile.model_dump(mode="json"))


__all__ = ["from_shared_profile", "to_shared_profile"]
