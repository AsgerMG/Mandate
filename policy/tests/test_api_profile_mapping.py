"""etl/api.py's BriefRequest -> CompanyProfile mapping.

No test previously imported etl/api.py at all (a gap the 2026-08-07 audit
flagged as the reason `/api/brief` broke silently for every real brief). This
does not fix that gap generally — it covers only the one field this session
added, so a future field addition here doesn't repeat the same silent drop.
"""

from __future__ import annotations

from etl.api import BriefRequest, _profile


def test_profile_mapping_carries_ai_use_cases_through():
    req = BriefRequest(
        name="Acme", uses_ai=True,
        ai_use_cases=["hiring, worker evaluation, or promotion"],
    )
    profile = _profile(req)
    assert profile.ai_use_cases == ["hiring, worker evaluation, or promotion"]


def test_profile_mapping_defaults_ai_use_cases_to_empty():
    req = BriefRequest(name="Acme")
    profile = _profile(req)
    assert profile.ai_use_cases == []
