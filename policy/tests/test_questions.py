"""Scoping questions — deterministic core set and LLM-extras parsing."""

from __future__ import annotations

from etl.intelligence import CompanyProfile, core_questions
from etl.intelligence.questions import (
    COMPETITIVE_CONTEXT_QUESTION,
    EXTRAS_SYSTEM,
    SIZE_QUESTION,
    build_extras_request,
    generate_questions,
    parse_extras_response,
)


def _ids(questions: list[dict]) -> set[str]:
    return {q["id"] for q in questions}


def test_core_questions_tailored_to_flags():
    p = CompanyProfile(name="Acme", uses_ai=True, handles_personal_data=True)
    ids = _ids(core_questions(p))
    expected = {
        "company_size",
        "ai_role",
        "monthly_eu_users",
        "data_categories",
        "customer_type",
        "competitive_context",
    }
    assert ids == expected


def test_core_questions_skip_irrelevant_and_known():
    p = CompanyProfile(
        name="Acme",
        uses_ai=False,
        handles_personal_data=False,
        company_size="small (<50 staff, <€10M)",
    )
    ids = _ids(core_questions(p))
    assert "ai_role" not in ids  # doesn't use AI
    assert "data_categories" not in ids  # no personal data
    assert "company_size" not in ids  # already answered
    assert "customer_type" in ids and "monthly_eu_users" in ids
    assert "competitive_context" in ids  # unconditional, not yet answered


def test_core_questions_includes_competitive_context_by_default():
    p = CompanyProfile(name="Acme")
    assert "competitive_context" in _ids(core_questions(p))


def test_core_questions_skips_competitive_context_if_already_answered():
    p = CompanyProfile(name="Acme", answers={"competitive_context": "No dominant rival."})
    assert "competitive_context" not in _ids(core_questions(p))


def test_competitive_context_question_is_plain_language():
    text = COMPETITIVE_CONTEXT_QUESTION["question"].lower()
    for jargon in ("article 6", "dma", "gatekeeper", "self-preferencing", "regulation (eu)"):
        assert jargon not in text


def test_answers_flow_into_query():
    p = CompanyProfile(
        name="Acme",
        uses_ai=True,
        company_size="medium (<250 staff, <€50M)",
        ai_role="provider — we develop/sell AI systems",
        answers={"own_brand_products": "yes, hardware under our own brand"},
    )
    q = p.to_query()
    assert "medium" in q
    assert "provider" in q
    assert "own brand" in q


def test_build_extras_request_shape():
    p = CompanyProfile(name="Acme", uses_ai=True)
    passages = [{"text": "high-risk AI", "celex": "C1", "title": "T"}]
    req = build_extras_request(p, passages, ["ai_role"])
    assert req["tool_choice"] == {"type": "tool", "name": "propose_scoping_questions"}
    assert "already being asked: ai_role" in req["messages"][0]["content"].lower()


def test_parse_extras_drops_duplicates_and_fills_defaults():
    blocks = [
        {
            "type": "tool_use",
            "input": {
                "questions": [
                    {"id": "ai_role", "question": "dup?", "why_it_matters": "x", "kind": "choice"},
                    {"id": "own_brand", "question": "Own brand?", "why_it_matters": "CRA scope"},
                ]
            },
        }
    ]
    out = parse_extras_response(blocks, {"ai_role"})
    assert [q["id"] for q in out] == ["own_brand"]
    assert out[0]["kind"] == "text" and out[0]["options"] == []


def test_generate_questions_dry_run_is_core_only(db_session):
    p = CompanyProfile(name="Acme", uses_ai=True, handles_personal_data=True)
    out = generate_questions(db_session, None, p, dry_run=True)
    assert _ids(out["questions"]) == _ids(core_questions(p))


def test_size_bands_resolve_the_thresholds_that_gate_instruments():
    # Found via run-to-run verdict flips on a real brief: the old coarse
    # "large (250+)" bucket couldn't answer the CSRD 1,000-employee/€450M
    # test or the NIS2 size test, so the model guessed differently each run.
    # The bands must carry the numbers the instruments actually turn on.
    opts = " ".join(SIZE_QUESTION["options"])
    assert "1,000+" in opts and "€450M" in opts  # CSRD line
    assert "<50 staff" in opts  # NIS2 digital-provider line
    assert "CSRD" in SIZE_QUESTION["why_it_matters"]


def test_extras_ask_only_when_a_verdict_hinges_on_an_unanswered_fact():
    # Extra questions are the exception, not the default: the LLM-extras
    # prompt asks only when a major instrument's verdict hinges on a fact
    # the profile leaves open.
    assert "genuine doubt" in EXTRAS_SYSTEM
    assert "asking is the exception, not the default" in EXTRAS_SYSTEM
    assert "propose zero questions" in EXTRAS_SYSTEM
