"""Policy gives IDENTICAL results from the shared Mandate profile as from its old input.

The property: for every brief request policy's own web intake can send, lifting
it into the shared profile and sending THAT instead produces a CompanyProfile
equal field for field, with the same retrieval query, the same retrieval facets
and the same scoping questions. Those are everything downstream of `_profile`
reads (briefing.py retrieves on retrieval_queries(), the report instruction uses
scoping_lines(), /api/questions uses core_questions()), so equal here means
the brief and the questions are computed from identical input.

The requests are mandate/profile/fixtures.py's policy_requests(): seeded sector
slugs, the jurisdiction chips, and every questions.py option label, as
web/app/regina/brief/page.tsx posts them. No model calls, no database.
"""

from __future__ import annotations

import pytest
from mandate.profile import ProfileError
from mandate.profile.adapters import from_policy_request
from mandate.profile.fixtures import policy_requests

from etl.api import BriefRequest, _profile
from etl.brief_eval.panel import EVAL_PANEL
from etl.intelligence.questions import core_questions
from etl.intelligence.shared_profile import from_shared_profile, to_shared_profile

REQUESTS = policy_requests()


def _observable(p) -> dict:
    return {
        "fields": p.model_dump(mode="json"),
        "query": p.to_query(),
        "facets": p.retrieval_queries(),
        "scoping": p.scoping_lines(),
        "questions": [q["id"] for q in core_questions(p)],
    }


@pytest.mark.parametrize("req", REQUESTS, ids=[r["name"] for r in REQUESTS])
def test_shared_profile_path_is_identical(req):
    old = _profile(BriefRequest(**req))
    new = _profile(BriefRequest(profile=from_policy_request(req)))
    assert _observable(new) == _observable(old)


def test_the_requests_exercise_every_facet_and_value():
    facets = {f for r in REQUESTS for f, _ in _profile(BriefRequest(**r)).retrieval_queries()}
    assert {"ai", "data-protection", "sensitive-data", "consumer", "platform",
            "national"} <= facets
    assert len({s for r in REQUESTS for s in r["sectors"]}) == 10
    assert len({r.get("company_size") for r in REQUESTS}) == 6  # 5 classes + unanswered


def test_old_flat_requests_are_untouched():
    """Without `profile`, the request validates and maps exactly as before."""
    assert _profile(BriefRequest(name="")).name == ""
    with pytest.raises(ValueError):
        BriefRequest()  # name was required before; it still is without a profile


def test_a_bad_shared_profile_is_a_422_not_a_crash():
    with pytest.raises(ValueError, match="not in the vocabulary"):
        BriefRequest(profile={"name": "Acme", "sector": "fintech"})  # a slug, not a family


def test_size_is_derived_from_bands_not_declared():
    p = from_shared_profile({"name": "Acme", "fteBand": "10-49", "balanceBand": "2-10M"})
    assert p.company_size == "small (<50 staff, <€10M)"
    # headcount alone cannot support an SME claim, so policy asks its question
    q = core_questions(from_shared_profile({"name": "Acme", "fteBand": "10-49"}))
    assert "company_size" in [x["id"] for x in q]


def test_a_capital_written_profile_reaches_policy():
    p = from_shared_profile({"name": "Acme", "sector": "software_data_ai",
                             "subsectors": ["fintech"], "incorporationCountry": "DE"})
    assert p.sectors == ["fintech"]
    assert [m.value for m in p.markets] == ["EU", "DE"]


def test_panel_fixtures_are_not_the_intake_path_and_say_so():
    """The eval panel predates the vocabulary and is written in free text
    ("software", "iot", "medium", "b2b", "behavioural"). It is not what the
    intake sends, so it is NOT held to byte identity. Recorded instead:
    6 of 10 name a value the vocabulary refuses (unseeded sector words, an
    unlisted data category), and the other 4 keep exactly the same retrieval
    facets; only the spelling of their values changes ("medium" becomes the
    question's option label). Either number moving is a signal to read."""
    refused, same_facets = 0, 0
    for prof in EVAL_PANEL:
        try:
            back = from_shared_profile(to_shared_profile(prof))
        except ProfileError:
            refused += 1
            continue
        keys = lambda p: [f for f, _ in p.retrieval_queries()]  # noqa: E731
        same_facets += keys(back) == keys(prof)
    assert (refused, same_facets) == (6, 4)
