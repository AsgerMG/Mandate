"""CompanyProfile: scoping-fact surfacing and the AI-use-case retrieval facet.

Annex III's high-risk trigger turns on WHAT an AI system decides about a
person, not who built it (ai_role covers that half only). Without this fact,
a real production brief hedged the AI Act row instead of committing to a
verdict. See tests/test_questions.py for the intake-question side of this.
"""

from __future__ import annotations

from etl.intelligence.profile import CompanyProfile


def test_scoping_lines_surfaces_ai_use_cases():
    p = CompanyProfile(
        name="Acme", uses_ai=True,
        ai_use_cases=["hiring, worker evaluation, or promotion"],
    )
    lines = "\n".join(p.scoping_lines())
    assert "hiring, worker evaluation, or promotion" in lines


def test_scoping_lines_omits_ai_use_cases_when_unanswered():
    p = CompanyProfile(name="Acme", uses_ai=True)
    lines = "\n".join(p.scoping_lines())
    assert "decides about a person" not in lines


def test_to_query_includes_ai_use_cases():
    p = CompanyProfile(
        name="Acme", uses_ai=True,
        ai_use_cases=["biometric identification or categorisation"],
    )
    assert "biometric identification or categorisation" in p.to_query()


def test_ai_facet_sharpens_to_the_concrete_annex_iii_category():
    p = CompanyProfile(
        name="Acme", uses_ai=True, ai_role="provider",
        ai_use_cases=["creditworthiness or lending decisions"],
    )
    facets = dict(p.retrieval_queries())
    assert (
        "Annex III high-risk classification for creditworthiness or lending decisions"
        in facets["ai"]
    )


def test_ai_facet_stays_generic_when_use_case_unanswered():
    p = CompanyProfile(name="Acme", uses_ai=True, ai_role="provider")
    facets = dict(p.retrieval_queries())
    assert "high-risk classification and Annex III use cases" in facets["ai"]
    assert "Annex III high-risk classification for" not in facets["ai"]


def test_ai_facet_stays_generic_when_answer_is_none_of_these():
    """A resolved 'no high-risk use case' answer must not fabricate an Annex III
    category that doesn't apply — it should read the same as unanswered, not
    invent 'Annex III high-risk classification for none of these use cases'."""
    p = CompanyProfile(
        name="Acme", uses_ai=True, ai_role="provider", ai_use_cases=["none of these"],
    )
    facets = dict(p.retrieval_queries())
    assert "none of these" not in facets["ai"]
    assert "high-risk classification and Annex III use cases" in facets["ai"]


def test_ai_facet_handles_multiple_concrete_use_cases():
    p = CompanyProfile(
        name="Acme", uses_ai=True, ai_role="provider",
        ai_use_cases=[
            "hiring, worker evaluation, or promotion",
            "biometric identification or categorisation",
        ],
    )
    facets = dict(p.retrieval_queries())
    assert (
        "hiring, worker evaluation, or promotion, biometric identification or categorisation"
        in facets["ai"]
    )
