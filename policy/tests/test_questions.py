"""Scoping questions — deterministic core set and LLM-extras parsing."""

from __future__ import annotations

import datetime as dt

from data.config import get_settings
from data.models import (
    Document,
    DocumentType,
    DocumentVersion,
    Jurisdiction,
    LifecycleStage,
    Passage,
    Source,
)
from etl.enrichment import embed_pending
from etl.intelligence import CompanyProfile, core_questions
from etl.intelligence.questions import (
    AI_ROLE_QUESTION,
    AI_USE_CASE_QUESTION,
    COMPETITIVE_CONTEXT_QUESTION,
    EXTRAS_SYSTEM,
    QUESTIONS_TOOL,
    SIZE_QUESTION,
    build_extras_request,
    generate_questions,
    parse_extras_response,
)

DIM = get_settings().embedding_dim


class _FakeEmbedder:
    dim = DIM

    def embed(self, texts: list[str]) -> list[list[float]]:
        out = []
        for t in texts:
            v = [0.0] * DIM
            tl = t.lower()
            v[0] = float(tl.count("ai")) + float("intelligence" in tl)
            v[1] = float(tl.count("fish"))
            v[2] = 1.0
            out.append(v)
        return out


class _Resp:
    def __init__(self, content):
        self.content = content


class _FakeMessages:
    def __init__(self, response):
        self._response = response
        self.kwargs = None

    def create(self, **kwargs):
        self.kwargs = kwargs
        return self._response


class _FakeClient:
    def __init__(self, response):
        self.messages = _FakeMessages(response)


def _ids(questions: list[dict]) -> set[str]:
    return {q["id"] for q in questions}


def test_core_questions_tailored_to_flags():
    p = CompanyProfile(name="Acme", uses_ai=True, handles_personal_data=True)
    ids = _ids(core_questions(p))
    expected = {
        "company_size",
        "ai_role",
        "ai_use_cases",
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
    assert "ai_use_cases" not in ids  # doesn't use AI
    assert "data_categories" not in ids  # no personal data
    assert "company_size" not in ids  # already answered
    assert "customer_type" in ids and "monthly_eu_users" in ids
    assert "competitive_context" in ids  # unconditional, not yet answered


# --- the AI-use-case gap ----------------------------------------------------
# Annex III's high-risk trigger turns on WHAT the AI system decides about a
# person, not who built it (that's ai_role's question). Without this fact, a
# real production brief hedged the AI Act row as "if document-analysis
# functionality serves [creditworthiness/hiring]..." instead of committing —
# and led its headline with an unrelated DMA story because it had nothing
# resolved to lead with instead. Screen 2 (the LLM extras) is explicitly told
# not to re-touch "AI role" territory once asked, so this can't be left to
# chance there — it needs to be in the deterministic set.


def test_ai_use_case_question_asked_when_ai_used_and_unanswered():
    p = CompanyProfile(name="Acme", uses_ai=True)
    assert "ai_use_cases" in _ids(core_questions(p))


def test_ai_use_case_question_skipped_once_answered():
    p = CompanyProfile(name="Acme", uses_ai=True, ai_use_cases=["none of these"])
    assert "ai_use_cases" not in _ids(core_questions(p))


def test_ai_use_case_question_has_annex_iii_options():
    options = set(AI_USE_CASE_QUESTION["options"])
    assert "creditworthiness or lending decisions" in options
    assert "hiring, worker evaluation, or promotion" in options
    assert "none of these" in options
    assert AI_USE_CASE_QUESTION["kind"] == "multi"


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
    content = req["messages"][0]["content"].lower()
    assert "being asked this round (do not duplicate): ai_role" in content


def test_build_extras_request_surfaces_already_known_scoping_facts():
    # Found via a real run: monthly_eu_users was already answered, but the
    # extras prompt never said so, so the model proposed a near-duplicate
    # question about the same threshold. scoping_lines() output must appear
    # so the model can see it's already settled.
    p = CompanyProfile(
        name="Acme",
        monthly_eu_users="1M–45M",
        answers={"competitive_context": "No dominant rival."},
    )
    req = build_extras_request(p, [{"text": "x", "celex": "C1", "title": "T"}], [])
    content = req["messages"][0]["content"]
    assert "Already-known scoping facts:" in content
    assert "Approx. monthly active EU users: 1M–45M." in content
    assert "Competitive context: No dominant rival." in content


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


def test_extras_prompt_forbids_fishing_from_canon_presence():
    # Found via live testing right after adding canon-guaranteed retrieval to
    # the extras step (2026-07-08): a pure invoicing SaaS company with no
    # hardware signal anywhere in its profile got asked about "IoT-enabled
    # products" and "connected accounting hardware" — the model treated a
    # CRA passage's mere presence (guaranteed for every company, so the
    # final report can say Out of Scope) as if it were evidence of doubt.
    # The prompt must explicitly kill that inference.
    assert "a passage being retrieved is NOT evidence of doubt" in EXTRAS_SYSTEM
    assert "gets ZERO product-safety or" in EXTRAS_SYSTEM
    assert "zero is a common, correct outcome" in EXTRAS_SYSTEM


def test_extras_prompt_requires_instrument_diversity():
    # Found on a real idealo run: a competitive-context answer naming Google
    # made retrieval DMA-heavy, and because extras questions are generated
    # FROM retrieved passages, the questions skewed DMA too — a feedback
    # loop. The extras prompt must demand spread across instruments and
    # refuse to let a named rival dominate the question set.
    assert "never propose two questions about the same instrument" in EXTRAS_SYSTEM
    assert "must not pull every question toward the competition file" in EXTRAS_SYSTEM


def test_ai_role_options_split_gpai_provider_from_system_provider():
    # The AI Act's heaviest tier (Chapter V, GPAI obligations) only binds
    # companies that train their own general-purpose model — not every
    # "provider" of an AI system. Same question, same single click, sharper
    # answer: no new friction for AI companies that already answer this.
    opts = " ".join(AI_ROLE_QUESTION["options"])
    assert "our own general-purpose AI model" in opts
    assert "on top of others' models" in opts
    assert "GPAI" in AI_ROLE_QUESTION["why_it_matters"]


def test_generate_questions_extras_get_canon_guaranteed_retrieval(db_session):
    # Mirrors generate_briefing's canon guarantee (see _cap_per_document /
    # canon_passages tests in test_briefing.py): without it, an
    # off-vocabulary instrument (here NIS2) never reaches the extras model
    # at k=1, so its activity question can never even be considered — not
    # because it's irrelevant, but because retrieval missed it.
    src = Source(key="tq", name="tq", jurisdiction=Jurisdiction.EU)
    db_session.add(src)
    db_session.flush()
    ai_doc = Document(
        source_id=src.id,
        external_id="Dq1",
        title="AI Act",
        jurisdiction=Jurisdiction.EU,
        document_type=DocumentType.REGULATION,
        lifecycle_stage=LifecycleStage.IN_FORCE,
        url="http://x/ai",
        celex="32024R1689",
    )
    nis2_doc = Document(
        source_id=src.id,
        external_id="Dq2",
        title="NIS2",
        jurisdiction=Jurisdiction.EU,
        document_type=DocumentType.DIRECTIVE,
        lifecycle_stage=LifecycleStage.IN_FORCE,
        url="http://x/nis2",
        celex="32022L2555",
    )
    db_session.add_all([ai_doc, nis2_doc])
    db_session.flush()
    for doc, text in [
        (ai_doc, "ai obligations and intelligence"),
        (nis2_doc, "fish quota reporting duties"),
    ]:
        ver = DocumentVersion(
            document_id=doc.id,
            content_hash=f"h{doc.id}",
            text="t",
            char_count=1,
            fetched_at=dt.datetime.now(dt.UTC),
        )
        db_session.add(ver)
        db_session.flush()
        db_session.add(
            Passage(version_id=ver.id, ordinal=0, text=text, char_start=0, char_end=len(text))
        )
    db_session.commit()
    embed_pending(db_session, _FakeEmbedder())

    client = _FakeClient(_Resp([{"type": "tool_use", "input": {"questions": []}}]))
    profile = CompanyProfile(name="Acme", uses_ai=True)
    generate_questions(db_session, _FakeEmbedder(), profile, k=1, client=client)

    sent = client.messages.kwargs["messages"][0]["content"]
    assert "32022L2555" in sent  # NIS2 present despite losing the open top-1


def test_extras_request_goes_through_the_shaping_layer(monkeypatch):
    """The scoping-questions call was the one brief-path call site that
    hand-assembled `model` and `max_tokens` instead of going through
    reasoning_params — so it was the one site that would not pick up whatever the
    shaping layer learns about a model generation. An exception is exactly what
    the layer exists to remove."""
    from data.config import get_settings

    monkeypatch.setenv("LLM_MODEL", "claude-sonnet-5")
    get_settings.cache_clear()
    try:
        req = build_extras_request(
            CompanyProfile(name="Acme", uses_ai=True),
            [{"text": "high-risk AI", "celex": "C1", "title": "T"}],
            [],
        )
        assert req["model"] == "claude-sonnet-5"
        assert req["thinking"] == {"type": "adaptive", "display": "summarized"}
        # "low": a scoping judgement over already-retrieved passages, not fresh
        # synthesis — the same level the revise self-edit uses.
        assert req["output_config"]["effort"] == "low"
        # Thinking is drawn from the same max_tokens the tool call has to fit in,
        # so the old 1500 was a truncation risk the moment the configured model
        # reached a generation that thinks by default.
        assert req["max_tokens"] >= 4000
        # ...and the tool contract is untouched by the shaping.
        assert req["tools"] == [QUESTIONS_TOOL]
        assert req["tool_choice"] == {"type": "tool", "name": "propose_scoping_questions"}
    finally:
        get_settings.cache_clear()


def test_extras_request_stays_legal_on_a_legacy_model(monkeypatch):
    """The 400 this routing prevents: a legacy model rejects `output_config.effort`
    and adaptive thinking outright."""
    from data.config import get_settings

    monkeypatch.setenv("LLM_MODEL", "claude-haiku-4-5")
    get_settings.cache_clear()
    try:
        req = build_extras_request(
            CompanyProfile(name="Acme", uses_ai=True),
            [{"text": "high-risk AI", "celex": "C1", "title": "T"}],
            [],
        )
        assert "output_config" not in req
        assert req.get("thinking", {}).get("type") != "adaptive"
        assert req["tool_choice"] == {"type": "tool", "name": "propose_scoping_questions"}
    finally:
        get_settings.cache_clear()
