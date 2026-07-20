"""Briefing assembly + citation resolution — no API key, no network.

Pure-function tests for query building, Citations-document assembly, and
citation→source mapping; plus a full generate_briefing run against real
pgvector with a fake embedder and a fake Anthropic client.
"""

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
from etl.intelligence import CompanyProfile, build_documents, build_request, generate_briefing
from etl.intelligence.briefing import (
    SYSTEM_PROMPT,
    _canon_issues,
    _cap_per_document,
    _competitive_query,
    _merge_passages,
    _sort_compliance_table,
    parse_response,
)

DIM = get_settings().embedding_dim


class FakeEmbedder:
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


# --- pure tests -------------------------------------------------------------

def test_profile_to_query_includes_signals():
    p = CompanyProfile(name="Acme", description="credit scoring", sectors=["fintech"], uses_ai=True)
    q = p.to_query()
    assert "Acme" in q and "credit scoring" in q and "fintech" in q
    assert "artificial intelligence" in q.lower()


def test_system_prompt_has_competitive_guardrail():
    # Locks in the guardrails so a future prompt edit can't silently drop
    # them and turn this into a forced, ungrounded section.
    assert "leave this angle out entirely" in SYSTEM_PROMPT
    assert "never infer a competitor's identity from context alone" in SYSTEM_PROMPT
    guardrail = "without upgrading a pending investigation or draft text into a certainty"
    assert guardrail in SYSTEM_PROMPT


def test_system_prompt_competitive_angle_is_not_dma_only():
    # The angle must span the major dossiers, not just competition/DMA cases —
    # a narrow reading would miss DSA/AI Act/Digital-Omnibus-driven dynamics.
    lowered = SYSTEM_PROMPT.lower()
    for term in ("dsa", "ai act", "digital omnibus"):
        assert term in lowered


def test_system_prompt_word_budget_present():
    assert "700-1000 words" in SYSTEM_PROMPT


def test_system_prompt_has_citation_hygiene_and_escalation_realism():
    # Found via critical testing against a real profile (a CRA-facing hardware
    # maker): the model was blending its own sentence directly into unquoted
    # verbatim legal-recital text with no punctuation boundary, and separately
    # phrasing a 90-day action as a mid-size company unilaterally "taking on"
    # a dominant rival. Both are locked in so a future prompt edit can't
    # silently drop the fix.
    assert "CITATION HYGIENE" in SYSTEM_PROMPT
    assert "no punctuation boundary" in SYSTEM_PROMPT
    assert "coalition-building" in SYSTEM_PROMPT and "'take on X'" in SYSTEM_PROMPT
    from etl.intelligence.briefing import REVISE_INSTRUCTION

    assert "CITATION HYGIENE" in REVISE_INSTRUCTION


def test_citation_hygiene_covers_table_cells_not_just_prose():
    # Found via critical testing on a real GetYourGuide brief (twice, across
    # two report-format iterations): CITATION HYGIENE read clean in prose
    # paragraphs but several Compliance-table Why/Trigger cells still strung
    # together unquoted verbatim source clauses back to back — a quote wall
    # dressed as a terse table cell. Locks in that the rule explicitly
    # extends to table cells, in both the draft prompt and the revise pass.
    assert "applies inside table cells exactly as it does in prose" in SYSTEM_PROMPT
    from etl.intelligence.briefing import REVISE_INSTRUCTION

    assert "Check every Why/Trigger table cell for this too" in REVISE_INSTRUCTION


def test_citation_hygiene_bans_whole_sentence_unmarked_verbatim():
    # Found via critical testing after the table-cell fix landed: table cells
    # cleaned up, but the *same* defect persisted one level up — a full
    # sentence copied closely from a source (the DMA Art. 6(5) recital) and
    # stated as flat analyst narration, with no mid-sentence blend to point
    # at since the whole sentence WAS the source. Locks in the concrete
    # word-count trigger so this doesn't regress to "no blending = compliant".
    assert "eight or more consecutive words match the source's wording" in SYSTEM_PROMPT
    assert "there is no third option of just stating it as" in SYSTEM_PROMPT


def test_system_prompt_bans_unretrieved_instrument_names():
    # Found via a real GetYourGuide brief: canon_passages() had the real,
    # retrieved ECGT text in context, but the model named a different, real
    # EU proposal it knew from training ("Green Claims Directive" — per the
    # user's own tracker, a *stalled, never-enacted* proposal, not the same
    # thing as the in-force ECGT) instead of using the retrieved act's own
    # name, and dropped the real ECGT row entirely. Citation hygiene alone
    # didn't catch this because the sentence carried no citation marker at
    # all — this guards instrument IDENTITY specifically.
    assert "never name a law, directive, regulation or proposal that is not among" in (
        SYSTEM_PROMPT
    )
    from etl.intelligence.briefing import REVISE_INSTRUCTION

    assert "INSTRUMENT IDENTITY CHECK" in REVISE_INSTRUCTION
    assert "remove any row naming an unretrieved instrument" in REVISE_INSTRUCTION


def test_system_prompt_demands_full_circle_compliance_coverage():
    # Found via critical testing against GetYourGuide: the table only showed
    # instruments that won open semantic retrieval (DMA/DSA/AI Act) and
    # silently dropped CRA, NIS2, and sector-specific law like the Package
    # Travel Directive rather than stating them Out of Scope. Fixed with
    # canon_passages() guaranteeing retrieval; once that made the main table
    # balloon to 16 rows for a real GetYourGuide brief, the Out of Scope
    # verdicts moved to a dedicated one-line-per-row Appendix so the main
    # table stays a short action list and the brief stays ~2-2.5 pages.
    assert "Package Travel Directive" in SYSTEM_PROMPT
    assert "Appendix: Out of Scope Register" in SYSTEM_PROMPT
    assert "excludes nothing" in SYSTEM_PROMPT
    assert "Do NOT put an Out of Scope row in this table" in SYSTEM_PROMPT


def test_system_prompt_keeps_appendix_rows_to_one_line():
    # The whole point of the split is brevity: the appendix must stay a
    # register, not a second copy of the paragraph-style main table.
    assert "Every row is exactly one line" in SYSTEM_PROMPT
    assert "2-2.5 printed pages" in SYSTEM_PROMPT


def test_system_prompt_hinge_rule_makes_doubt_deterministic():
    # Found via two identical live runs flipping NIS2 between Monitor and Out
    # of Scope: when a verdict hinges on a threshold fact the profile doesn't
    # answer, the model must always land Monitor with the hinge named — never
    # coin-flip In/Out of Scope from an unanswered fact.
    assert "hinges on a quantitative threshold" in SYSTEM_PROMPT
    assert "Never resolve an unanswered threshold" in SYSTEM_PROMPT
    assert "the same company must get the same verdict on every run" in SYSTEM_PROMPT


def test_system_prompt_hinge_rule_covers_activity_hinges():
    # Found on a real idealo run: ECGT got a flat In Scope on the
    # comparison-tool provision even though it only applies if the platform
    # actually compares environmental characteristics — an activity fact the
    # profile never established. Activity hinges must bind like numeric ones,
    # and the mirror discipline (profile answers it → commit, don't hedge)
    # keeps the rule from turning every verdict into Monitor.
    assert "activity fact the profile does not answer" in SYSTEM_PROMPT
    assert "kind of business that COULD do X" in SYSTEM_PROMPT
    assert "Monitor is reserved for genuinely unanswered" in SYSTEM_PROMPT
    from etl.intelligence.briefing import REVISE_INSTRUCTION

    assert "VERDICT HINGE CHECK" in REVISE_INSTRUCTION
    assert "checks (7), (8), and (9)" in REVISE_INSTRUCTION


def test_system_prompt_forbids_verdict_contradicting_prose():
    # Found via an automated eval loop, 4 independent times across two runs:
    # a brief's Compliance table committed a flat In Scope verdict for a
    # classification-dependent instrument (AI Act high-risk status) while
    # other prose elsewhere in the same brief still called that same
    # classification question open/unresolved. Nothing previously checked
    # that a committed table verdict stays consistent with prose elsewhere
    # in the same document — item (8) only checks a verdict against the
    # profile's own facts, not against the rest of the draft.
    assert "that verdict is final everywhere else in the brief" in SYSTEM_PROMPT
    assert "cannot both stand" in SYSTEM_PROMPT
    from etl.intelligence.briefing import REVISE_INSTRUCTION

    assert "VERDICT CONSISTENCY CHECK" in REVISE_INSTRUCTION


def test_revise_instruction_verdict_consistency_defaults_to_fixing_prose():
    # Regression guard: item (9)'s remedy order matters. If a lazy model can
    # dodge a real inconsistency by downgrading to Monitor instead of fixing
    # the contradicting prose, this quietly erodes the "BE DECISIVE" /
    # anti-hedge discipline test_system_prompt_hinge_rule_covers_activity_hinges
    # already guards — Monitor must stay reserved for genuinely unanswered
    # hinges, not become an escape valve for inconsistency the model doesn't
    # want to reconcile.
    from etl.intelligence.briefing import REVISE_INSTRUCTION

    default_fix_pos = REVISE_INSTRUCTION.index("The default fix")
    monitor_fallback_pos = REVISE_INSTRUCTION.index(
        "Only fall back to downgrading the table verdict to Monitor"
    )
    assert default_fix_pos < monitor_fallback_pos
    assert "do not use a Monitor downgrade as a shortcut" in REVISE_INSTRUCTION


# --- deterministic canon consistency check -----------------------------------

_ECGT_PASSAGE = {
    "celex": "32024L0825",
    "title": "Empowering Consumers for the Green Transition Directive (ECGT)",
    "text": "x",
}
_TTPA_PASSAGE = {
    "celex": "32024R0900",
    "title": "Political Advertising Regulation (TTPA)",
    "text": "x",
}

_TABLE = (
    "# Brief\n"
    "## Compliance exposure\n"
    "| Instrument | Prio | Verdict | Why / Trigger |\n"
    "|---|---|---|---|\n"
    "| {row1} | 2 | In Scope | stuff |\n"
    "## Appendix: Out of Scope Register\n"
    "| Instrument | Why Out of Scope | What Would Change It |\n"
    "|---|---|---|\n"
    "| {row2} | reason | change |\n"
)


def test_canon_issues_clean_report_passes():
    briefing = _TABLE.format(
        row1="Empowering Consumers Directive (2024/825)",  # abbreviated but right act
        row2="Political Advertising Regulation (TTPA) (2024/900)",
    )
    assert _canon_issues(briefing, [_ECGT_PASSAGE, _TTPA_PASSAGE]) == []


def test_canon_issues_flags_mislabeled_instrument():
    # The exact real-world failure: 2024/825 is the ECGT, but the row calls
    # it by the name of a different (stalled) proposal.
    briefing = _TABLE.format(
        row1="Green Claims Directive (Dir. 2024/825)",
        row2="Political Advertising Regulation (TTPA) (2024/900)",
    )
    issues = _canon_issues(briefing, [_ECGT_PASSAGE, _TTPA_PASSAGE])
    assert len(issues) == 1
    assert "Green Claims Directive" in issues[0]
    assert "Empowering Consumers for the Green Transition Directive" in issues[0]


def test_canon_issues_flags_missing_canon_act():
    briefing = _TABLE.format(
        row1="Empowering Consumers for the Green Transition Directive (ECGT)",
        row2="GDPR",
    )
    issues = _canon_issues(briefing, [_ECGT_PASSAGE, _TTPA_PASSAGE])
    assert len(issues) == 1
    assert "Political Advertising Regulation (TTPA)" in issues[0]
    assert "neither" in issues[0]


def test_canon_issues_skips_reports_without_tables():
    # Dry-run/degenerate outputs (and simple test fixtures) have no tables —
    # the completeness contract only applies to real table-bearing reports.
    assert _canon_issues("The AI Act applies to you.", [_ECGT_PASSAGE]) == []


def test_canon_issues_ignores_non_canon_passages():
    passages = [{"celex": "52026SC0123", "title": "Staff working doc", "text": "x"}]
    briefing = _TABLE.format(row1="Whatever Act (2019/999)", row2="Other")
    assert _canon_issues(briefing, passages) == []


def test_system_prompt_prio_ranking_with_boss_guardrails():
    # Format v3, from direct stakeholder feedback: the table carries a Prio
    # 1-3 attention ranking next to the legal verdict, assigned by exactly
    # three guardrails — live non-compliance exposure, commercial upside from
    # a competitor/gatekeeper being forced to comply, or looming material
    # financial damage. Locks in the column spec and all three criteria.
    assert "Instrument | Prio | Verdict | Why / Trigger" in SYSTEM_PROMPT
    assert "material non-compliance exposure under a live, actively enforced regime" in (
        SYSTEM_PROMPT
    )
    assert "creates direct commercial upside" in SYSTEM_PROMPT
    assert "threatens material financial damage" in SYSTEM_PROMPT
    assert "Order rows by Prio ascending" in SYSTEM_PROMPT


def test_system_prompt_merges_landscape_and_play_drops_next_actions():
    # Format v3: Political radar + Strategic play merged into one section the
    # PA team tailors by hand (biased toward verifiable facts over strategy
    # prose), Action column gone, and no 30/90-day Next actions section —
    # action sequencing is the team's manual value-add.
    assert "## Political landscape & strategic play" in SYSTEM_PROMPT
    assert "## Political radar" not in SYSTEM_PROMPT
    assert "## Strategic play" not in SYSTEM_PROMPT
    assert "VERIFIABLE LANDSCAPE FACTS" in SYSTEM_PROMPT
    assert "## Next actions" not in SYSTEM_PROMPT
    assert "Do NOT write a 'Next actions' or '30/90 days' section" in SYSTEM_PROMPT
    assert "| Action" not in SYSTEM_PROMPT


def test_system_prompt_demands_operational_detail():
    # The report spec the user actually asked for: out-of-scope rows with the
    # precise disqualifying threshold, working-level people (not
    # president-level name-dropping), named coalitions, dated watchlist.
    assert "Out of Scope" in SYSTEM_PROMPT and "Art. 3(2)" in SYSTEM_PROMPT
    assert "rapporteur" in SYSTEM_PROMPT.lower()
    assert "**Coalitions**" in SYSTEM_PROMPT
    assert "**Watchlist**" in SYSTEM_PROMPT


def test_competitive_query_built_for_real_answers_only():
    real = CompanyProfile(
        name="T", answers={"competitive_context": "Google Travel outranks our tour listings"}
    )
    q = _competitive_query(real)
    assert q and "Google Travel outranks our tour listings" in q
    assert "antitrust" in q  # steers retrieval toward enforcement content

    for no_answer in ("No", "not really", "none", "n/a", ""):
        p = CompanyProfile(name="T", answers={"competitive_context": no_answer})
        assert _competitive_query(p) is None
    assert _competitive_query(CompanyProfile(name="T")) is None


def test_merge_passages_dedupes_by_source_span():
    a = {"url": "http://x/1", "char_start": 0, "text": "a"}
    b = {"url": "http://x/2", "char_start": 0, "text": "b"}
    dup_a = {"url": "http://x/1", "char_start": 0, "text": "a-again"}
    merged = _merge_passages([a], [dup_a, b])
    assert merged == [a, b]


def test_competitive_context_answer_flows_into_query():
    p = CompanyProfile(
        name="Idealo-like Co",
        description="Price comparison",
        sectors=["ecommerce"],
        answers={"competitive_context": "Google Shopping self-preferencing"},
    )
    assert "Google Shopping self-preferencing" in p.to_query()
    assert "Google Shopping self-preferencing" in "\n".join(p.scoping_lines())


def test_build_documents_are_citation_enabled():
    passages = [{"text": "Article 5...", "celex": "32016R0679", "title": "GDPR"}]
    docs = build_documents(passages)
    assert docs[0]["type"] == "document"
    assert docs[0]["citations"] == {"enabled": True}
    assert docs[0]["source"]["data"] == "Article 5..."
    # no jurisdiction/document_type on this passage -> no prefix
    assert docs[0]["title"] == "32016R0679"


def test_build_documents_prefix_jurisdiction_and_type():
    passages = [
        {
            "text": "x",
            "celex": "32016R0679",
            "title": "GDPR",
            "jurisdiction": "EU",
            "document_type": "regulation",
        },
        {
            "text": "y",
            "title": "Bitkom press release",
            "jurisdiction": "DE",
            "document_type": "press",
        },
    ]
    docs = build_documents(passages)
    assert docs[0]["title"] == "[EU · Regulation] 32016R0679"
    assert docs[1]["title"] == "[DE · Press] Bitkom press release"


def test_build_documents_verbatim_debate_overrides_generic_other_label():
    # document_type is "other" for ep_verbatim/an_verbatim/de_verbatim (same
    # generic bucket as a press summary) — kind="verbatim_debate" is what
    # actually distinguishes a named speaker's real floor remarks.
    passages = [
        {
            "text": "Henna Virkkunen (Executive Vice-President) — ...",
            "title": "Presentation of the Cybersecurity Act (debate)",
            "jurisdiction": "EU",
            "document_type": "other",
            "kind": "verbatim_debate",
        }
    ]
    docs = build_documents(passages)
    assert docs[0]["title"] == (
        "[EU · Verbatim debate] Presentation of the Cybersecurity Act (debate)"
    )


def test_build_request_shape():
    p = CompanyProfile(name="Acme")
    req = build_request(p, [{"text": "x", "celex": "C1", "title": "T"}])
    assert req["model"] and req["max_tokens"] > 0
    content = req["messages"][0]["content"]
    assert content[0]["type"] == "document"  # documents first
    assert content[-1]["type"] == "text"  # instruction last


def test_build_revise_request_carries_draft_and_same_documents():
    from etl.intelligence.briefing import build_revise_request

    passages = [{"text": "x", "celex": "C1", "title": "T"}]
    req = build_revise_request(passages, "DRAFT TEXT HERE")
    content = req["messages"][0]["content"]
    assert content[0]["type"] == "document"  # same citation-indexed documents
    assert content[0]["title"] == build_documents(passages)[0]["title"]
    joined = " ".join(b["text"] for b in content if b["type"] == "text")
    assert "DRAFT TEXT HERE" in joined
    assert "sharpness" in joined.lower()


def test_parse_response_resolves_citations_to_sources():
    passages = [
        {
            "title": "GDPR",
            "celex": "32016R0679",
            "url": "http://x/gdpr",
            "char_start": 10,
            "char_end": 50,
        },
    ]
    blocks = [
        {"type": "text", "text": "You must do a DPIA.", "citations": [
            {"cited_text": "carry out a data protection impact assessment", "document_index": 0},
        ]},
    ]
    out = parse_response(blocks, passages)
    # cited spans get a footnote marker; each distinct source gets a stable number
    assert out["briefing"] == "You must do a DPIA.[1]"
    assert out["citations"][0]["n"] == 1
    assert out["citations"][0]["url"] == "http://x/gdpr"
    assert out["citations"][0]["celex"] == "32016R0679"
    assert out["citations"][0]["char_start"] == 10


def test_parse_response_carries_verbatim_debate_kind_to_citations():
    # Claude sees the "[Jurisdiction · Verbatim debate]" label via
    # build_documents(); the human-facing citation list (CLI/PDF/website)
    # needs the same signal so a reader can tell a floor speech apart from
    # any other source, not just the model.
    passages = [
        {
            "title": "Presentation of the Cybersecurity Act (debate)",
            "url": "http://x/cre",
            "char_start": 0,
            "char_end": 50,
            "kind": "verbatim_debate",
        },
    ]
    blocks = [
        {"type": "text", "text": "The Commission adopted a package.", "citations": [
            {"cited_text": "we adopted a new cybersecurity package", "document_index": 0},
        ]},
    ]
    out = parse_response(blocks, passages)
    assert out["citations"][0]["kind"] == "verbatim_debate"


def test_parse_response_numbers_sources_stably():
    passages = [
        {"title": "GDPR", "celex": "32016R0679", "url": "http://x/gdpr"},
        {"title": "AI Act", "celex": "32024R1689", "url": "http://x/ai"},
    ]
    blocks = [
        {"type": "text", "text": "A", "citations": [{"cited_text": "a", "document_index": 0}]},
        {"type": "text", "text": " B", "citations": [{"cited_text": "b", "document_index": 1}]},
        {"type": "text", "text": " C", "citations": [{"cited_text": "c", "document_index": 0}]},
    ]
    out = parse_response(blocks, passages)
    assert out["briefing"] == "A[1] B[2] C[1]"
    assert [c["n"] for c in out["citations"]] == [1, 2, 1]


def test_sort_compliance_table_enforces_prio_then_verdict_order():
    # Reproduces a real run (idealo, 2026-07-07): a Prio-2 In-Scope row
    # rendered after the Prio-3 AI Act row, violating the prompt's ordering
    # rule. The sort must fix order without touching content, and must leave
    # the Prio-less appendix table alone.
    briefing = (
        "# Brief\n## Compliance exposure\n"
        "| Instrument | Prio | Verdict | Why / Trigger |\n|---|---|---|---|\n"
        "| DMA | 1 | **Monitor** | live case [1] |\n"
        "| GDPR | 2 | **In Scope** | data [2] |\n"
        "| AI Act | 3 | **Monitor** | deployer |\n"
        "| ePrivacy | 2 | **In Scope** | pixels [3] |\n"
        "| P2B | 2 | **Monitor** | ranking |\n"
        "\nProse between tables.\n\n"
        "## Appendix: Out of Scope Register\n"
        "| Instrument | Why Out of Scope | What Would Change It |\n|---|---|---|\n"
        "| ZZZ Act | not applicable | nothing |\n"
        "| AAA Act | not applicable | nothing |\n"
    )
    sorted_briefing = _sort_compliance_table(briefing)
    rows = [
        line.strip().strip("|").split("|")[0].strip()
        for line in sorted_briefing.splitlines()
        if line.strip().startswith("|") and "Prio" not in line and "---" not in line
        and "Out of Scope Register" not in line and "Why Out of Scope" not in line
    ]
    compliance_rows = rows[: rows.index("ZZZ Act")] if "ZZZ Act" in rows else rows
    # Prio 1 first; within Prio 2, In Scope (GDPR, ePrivacy) before Monitor (P2B);
    # Prio 3 last. Stable: GDPR keeps its place ahead of ePrivacy.
    assert compliance_rows == ["DMA", "GDPR", "ePrivacy", "P2B", "AI Act"]
    # Appendix table (no Prio column) untouched — ZZZ still before AAA.
    assert sorted_briefing.index("ZZZ Act") < sorted_briefing.index("AAA Act")
    # Content preserved — citation markers travel with their rows.
    assert "| ePrivacy | 2 | **In Scope** | pixels [3] |" in sorted_briefing


def test_sort_compliance_table_no_table_is_noop():
    text = "# Brief\n\nJust prose, no tables at all.\n"
    assert _sort_compliance_table(text) == text


def test_cap_per_document_restores_breadth():
    # Found on a real idealo run: the freshly-ingested DMA review SWD won a
    # large share of the open top-k on raw similarity, crowding other
    # instruments out of context. Cap keeps the best N per document,
    # preserving best-first order within and across documents.
    swd = [{"celex": "52026SC0123", "url": "u1", "char_start": i, "text": "x"} for i in range(5)]
    gdpr = {"celex": "32016R0679", "url": "u2", "char_start": 0, "text": "y"}
    untitled = {"celex": None, "url": "u3", "char_start": 0, "text": "z"}
    capped = _cap_per_document([*swd[:2], gdpr, *swd[2:], untitled], max_per_doc=3)
    swd_kept = [p for p in capped if p.get("celex") == "52026SC0123"]
    assert len(swd_kept) == 3  # best three kept, order preserved
    assert [p["char_start"] for p in swd_kept] == [0, 1, 2]
    assert gdpr in capped and untitled in capped  # other docs untouched


# --- full orchestration with fakes ------------------------------------------

class _FakeMessages:
    def __init__(self, response):
        self._response = response
        self.kwargs = None
        self.call_count = 0

    def create(self, **kwargs):
        self.kwargs = kwargs
        self.call_count += 1
        return self._response


class _SequenceFakeMessages:
    """Returns a different response on each successive call — for testing
    the empty-citations retry, where the draft+revise pass must differ
    between the first attempt and the retry."""

    def __init__(self, responses):
        self._responses = list(responses)
        self.calls: list[dict] = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        idx = min(len(self.calls) - 1, len(self._responses) - 1)
        return self._responses[idx]


class _FakeClient:
    def __init__(self, response):
        self.messages = _FakeMessages(response)


class _ClientWithMessages:
    """Wraps a pre-built messages object (e.g. _SequenceFakeMessages) instead
    of constructing one from a single response."""

    def __init__(self, messages):
        self.messages = messages


class _Resp:
    def __init__(self, content):
        self.content = content


def _seed(session):
    src = Source(key="t", name="t", jurisdiction=Jurisdiction.EU)
    session.add(src)
    session.flush()
    doc = Document(
        source_id=src.id,
        external_id="D1",
        title="AI Act",
        jurisdiction=Jurisdiction.EU,
        document_type=DocumentType.REGULATION,
        lifecycle_stage=LifecycleStage.IN_FORCE,
        url="http://x/ai",
        celex="32024R1689",
    )
    session.add(doc)
    session.flush()
    ver = DocumentVersion(
        document_id=doc.id,
        content_hash="h",
        text="t",
        char_count=1,
        fetched_at=dt.datetime.now(dt.UTC),
    )
    session.add(ver)
    session.flush()
    session.add(
        Passage(
            version_id=ver.id,
            ordinal=0,
            text="ai obligations and intelligence",
            char_start=0,
            char_end=31,
        )
    )
    session.commit()


def test_generate_briefing_end_to_end_with_fake_client(db_session):
    _seed(db_session)
    embed_pending(db_session, FakeEmbedder())

    # Fake Claude response that cites the first source.
    block = {
        "type": "text",
        "text": "The AI Act applies to your systems.",
        "citations": [{"cited_text": "high-risk AI systems", "document_index": 0}],
    }
    client = _FakeClient(_Resp([block]))

    profile = CompanyProfile(name="Acme", uses_ai=True)
    result = generate_briefing(db_session, FakeEmbedder(), profile, k=5, client=client)

    assert result["briefing"] == "The AI Act applies to your systems.[1]"
    assert result["citations"][0]["url"] == "http://x/ai"
    # the request actually carried Citations-enabled documents
    sent = client.messages.kwargs["messages"][0]["content"]
    assert any(b.get("type") == "document" and b["citations"]["enabled"] for b in sent)


def _seed_second_canon_doc(session, celex: str, text: str) -> None:
    """A second canon-act document whose text is deliberately irrelevant to
    an AI-focused query, to prove canon_passages pulls it in regardless."""
    src = Source(key="t2", name="t2", jurisdiction=Jurisdiction.EU)
    session.add(src)
    session.flush()
    doc = Document(
        source_id=src.id,
        external_id="D2",
        title="NIS2",
        jurisdiction=Jurisdiction.EU,
        document_type=DocumentType.DIRECTIVE,
        lifecycle_stage=LifecycleStage.IN_FORCE,
        url="http://x/nis2",
        celex=celex,
    )
    session.add(doc)
    session.flush()
    ver = DocumentVersion(
        document_id=doc.id,
        content_hash="h2",
        text="t",
        char_count=1,
        fetched_at=dt.datetime.now(dt.UTC),
    )
    session.add(ver)
    session.flush()
    session.add(Passage(version_id=ver.id, ordinal=0, text=text, char_start=0, char_end=len(text)))
    session.commit()


def test_generate_briefing_guarantees_canon_coverage_beyond_top_k(db_session):
    # NIS2 (32022L2555) is in the foundational-act canon but shares no
    # vocabulary with an AI-focused query — plain top-k retrieval at k=1
    # would never surface it. canon_passages must pull it in anyway so the
    # Compliance table can render an explicit NIS2 row instead of silently
    # omitting it.
    _seed(db_session)
    _seed_second_canon_doc(db_session, "32022L2555", "fish quota reporting duties")
    embed_pending(db_session, FakeEmbedder())

    block = {"type": "text", "text": "Applies.", "citations": []}
    client = _FakeClient(_Resp([block]))
    profile = CompanyProfile(name="Acme", uses_ai=True)
    generate_briefing(db_session, FakeEmbedder(), profile, k=1, client=client)

    sent = client.messages.kwargs["messages"][0]["content"]
    titles = [b["title"] for b in sent if b.get("type") == "document"]
    assert any("32022L2555" in t for t in titles)


def test_generate_briefing_retries_once_on_zero_citations(db_session):
    # Found via real-API testing: native citations depend on the model's own
    # phrasing landing close enough to a retrieved span to match, and a
    # whole response can stochastically come back with zero matches despite
    # genuinely source-grounded content — silently defeating the tool's core
    # "every claim traces to a source" premise. One retry should recover it.
    _seed(db_session)
    embed_pending(db_session, FakeEmbedder())

    no_cite = _Resp([{"type": "text", "text": "Applies broadly.", "citations": []}])
    with_cite = _Resp(
        [
            {
                "type": "text",
                "text": "Applies.",
                "citations": [{"cited_text": "ai", "document_index": 0}],
            }
        ]
    )
    messages = _SequenceFakeMessages([no_cite, with_cite])
    client = _ClientWithMessages(messages)

    profile = CompanyProfile(name="Acme", uses_ai=True)
    result = generate_briefing(
        db_session, FakeEmbedder(), profile, k=5, client=client, sharpen=False
    )

    assert len(messages.calls) == 2  # exactly one retry, not a loop
    assert result["citations"]
    assert result["briefing"] == "Applies.[1]"


def test_generate_briefing_gives_up_gracefully_after_one_retry(db_session):
    _seed(db_session)
    embed_pending(db_session, FakeEmbedder())

    no_cite = _Resp([{"type": "text", "text": "Applies broadly.", "citations": []}])
    client = _FakeClient(no_cite)  # every call returns the same no-citation response

    profile = CompanyProfile(name="Acme", uses_ai=True)
    result = generate_briefing(
        db_session, FakeEmbedder(), profile, k=5, client=client, sharpen=False
    )

    assert client.messages.call_count == 2  # tried twice, then returned what it had
    assert result["citations"] == []
    assert result["briefing"] == "Applies broadly."


def test_generate_briefing_runs_canon_fix_pass_on_mislabeled_row(db_session):
    # The seeded doc is the AI Act (32024R1689, canon). A report whose table
    # row calls 2024/1689 something else must trigger exactly one correction
    # call; the corrected report is adopted and canon_notes comes back empty.
    _seed(db_session)
    embed_pending(db_session, FakeEmbedder())

    bad_table = (
        "# Brief\n## Compliance exposure\n"
        "| Instrument | Prio | Verdict | Why / Trigger |\n|---|---|---|---|\n"
        "| Machine Learning Act (2024/1689) | 2 | In Scope | applies |\n"
    )
    good_table = bad_table.replace("Machine Learning Act (2024/1689)", "AI Act (2024/1689)")
    cite = [{"cited_text": "ai", "document_index": 0}]
    bad = _Resp([{"type": "text", "text": bad_table, "citations": cite}])
    good = _Resp([{"type": "text", "text": good_table, "citations": cite}])
    messages = _SequenceFakeMessages([bad, good])
    client = _ClientWithMessages(messages)

    profile = CompanyProfile(name="Acme", uses_ai=True)
    result = generate_briefing(
        db_session, FakeEmbedder(), profile, k=5, client=client, sharpen=False
    )

    assert len(messages.calls) == 2  # draft + one fix call, no loop
    fix_text = " ".join(
        b["text"] for b in messages.calls[1]["messages"][0]["content"] if b["type"] == "text"
    )
    assert "Machine Learning Act" in fix_text  # the finding was handed to the model
    assert "AI Act" in result["briefing"]
    assert result["canon_notes"] == []


def test_generate_briefing_surfaces_unfixed_canon_notes(db_session):
    # If the correction pass doesn't resolve the finding, it must surface in
    # canon_notes rather than silently shipping — and there is no retry loop.
    _seed(db_session)
    embed_pending(db_session, FakeEmbedder())

    bad_table = (
        "# Brief\n## Compliance exposure\n"
        "| Instrument | Prio | Verdict | Why / Trigger |\n|---|---|---|---|\n"
        "| Machine Learning Act (2024/1689) | 2 | In Scope | applies |\n"
    )
    cite = [{"cited_text": "ai", "document_index": 0}]
    client = _FakeClient(_Resp([{"type": "text", "text": bad_table, "citations": cite}]))

    profile = CompanyProfile(name="Acme", uses_ai=True)
    result = generate_briefing(
        db_session, FakeEmbedder(), profile, k=5, client=client, sharpen=False
    )

    assert client.messages.call_count == 2  # draft + one fix attempt, then stop
    assert len(result["canon_notes"]) == 1
    assert "Machine Learning Act" in result["canon_notes"][0]


def _seed_press_doc(session) -> None:
    """A recent, allowlisted-source document — proves generate_briefing's
    press_passages() pass actually reaches the final merged passage set,
    not just that press_passages() itself works in isolation
    (tests/test_embeddings.py covers the filtering logic directly)."""
    src = Source(key="netzpolitik", name="netzpolitik", jurisdiction=Jurisdiction.EU)
    session.add(src)
    session.flush()
    doc = Document(
        source_id=src.id,
        external_id="PRESS-1",
        title="AI Act enforcement debate heats up",
        jurisdiction=Jurisdiction.EU,
        document_type=DocumentType.OTHER,
        lifecycle_stage=LifecycleStage.UNKNOWN,
        url="http://netzpolitik.example/ai-act-debate",
        date_document=dt.date.today() - dt.timedelta(days=10),
    )
    session.add(doc)
    session.flush()
    ver = DocumentVersion(
        document_id=doc.id,
        content_hash="press-h",
        text="t",
        char_count=1,
        fetched_at=dt.datetime.now(dt.UTC),
    )
    session.add(ver)
    session.flush()
    session.add(
        Passage(
            version_id=ver.id,
            ordinal=0,
            text="ai policy stakeholders debate enforcement",
            char_start=0,
            char_end=42,
        )
    )
    session.commit()


def test_generate_briefing_includes_recent_press_passages(db_session):
    _seed(db_session)
    _seed_press_doc(db_session)
    embed_pending(db_session, FakeEmbedder())

    block = {
        "type": "text",
        "text": "The AI Act applies to your systems.",
        "citations": [{"cited_text": "high-risk AI systems", "document_index": 0}],
    }
    client = _FakeClient(_Resp([block]))

    profile = CompanyProfile(name="Acme", uses_ai=True)
    result = generate_briefing(db_session, FakeEmbedder(), profile, k=5, client=client)

    urls = {p.get("url") for p in result["passages"]}
    assert "http://netzpolitik.example/ai-act-debate" in urls
