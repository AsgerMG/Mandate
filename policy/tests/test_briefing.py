"""Briefing assembly + citation resolution — no API key, no network.

Pure-function tests for query building, Citations-document assembly, and
citation→source mapping; plus a full generate_briefing run against real
pgvector with a fake embedder and a fake Anthropic client.
"""

from __future__ import annotations

import datetime as dt

from sqlalchemy import select

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
    _CANON_STUB_CHARS,
    _PRESS_EXCLUDED_SOURCES,
    SYSTEM_PROMPT,
    _attach_summaries,
    _canon_issues,
    _cap_per_document,
    _cap_per_source,
    _cap_precedent,
    _competitive_query,
    _excerpt,
    _merge_passages,
    _retrieval_stats,
    _select_breadth_first,
    _sort_compliance_table,
    _stub_canon_passages,
    _top_document_ids,
    build_stakeholder_block,
    extract_hinges,
    parse_response,
    prio_verdict_issues,
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
    # The point is that table rows are subject to the hinge check, not the exact
    # phrasing of the list — which grows every time a check is added (it broke on
    # the Prio/Verdict check becoming (10)). Assert membership, not the sentence.
    subject_clause = REVISE_INSTRUCTION.split("table rows ARE subject to")[1][:60]
    for check in ("(7)", "(8)", "(9)"):
        assert check in subject_clause, f"{check} dropped from the table-row checks"


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


def test_build_request_injects_todays_date():
    # Without this, TRANSITIONAL APPLICABILITY's "has the successor's
    # application date arrived yet" check has no anchor — the model's only
    # fallback is its training cutoff, always wrong (always too early) for
    # every brief run after that cutoff. Verified missing live 2026-07-21.
    p = CompanyProfile(name="Acme")
    req = build_request(p, [])
    instruction = req["messages"][0]["content"][-1]["text"]
    assert f"Today's date is {dt.date.today().isoformat()}" in instruction


def test_system_prompt_may_ban_exempts_statutory_discretion():
    # "The authority may impose a fine..." is a fact about the regime's own
    # discretionary structure, not an analyst hedge — the blanket 'may' ban
    # must not force the model to either break the rule or misreport
    # genuine legal discretion as automatic.
    assert "does not ban accurately reporting a source's own discretionary" in SYSTEM_PROMPT
    assert "the authority may impose a fine of up to 4%" in SYSTEM_PROMPT.lower() or (
        "may impose a fine" in SYSTEM_PROMPT
    )


def test_system_prompt_covers_directive_transposition():
    # Distinct from predecessor/successor timing: a Directive isn't
    # self-executing, and TRANSITIONAL APPLICABILITY previously said nothing
    # about verdicting against a Directive's own text vs. a national
    # transposition act (NIS2 is exactly this case, and is in canon).
    assert "DIRECTIVE TRANSPOSITION" in SYSTEM_PROMPT
    assert "not self-executing" in SYSTEM_PROMPT


def test_system_prompt_allows_third_party_dynamic_row_alongside_out_of_scope():
    # The Compliance table banned Out-of-Scope rows, but Prio 1(b)'s own
    # worked example (a competitor's DMA dynamic) needs a Monitor+Prio-1 row
    # for an instrument the company itself is genuinely out of scope for —
    # previously no rule reconciled these two, now both rows are explicit.
    assert "One exception, and only this one" in SYSTEM_PROMPT
    assert "tracks the third party's dynamic, not the company's own scope" in SYSTEM_PROMPT


def test_system_prompt_word_count_has_thin_footprint_exception():
    # The 700-1000 word range previously had no carve-out for a genuinely
    # thin-footprint company, in tension with SENTENCE-LEVEL SHARPNESS's own
    # "delete any sentence that doesn't add a fact" rule.
    assert "genuinely thin footprint" in SYSTEM_PROMPT
    assert "not a floor to pad toward" in SYSTEM_PROMPT


def test_system_prompt_action_bullets_name_a_concrete_action():
    # A verdict-and-reason bullet alone is a diagnosis with no next step —
    # this doesn't contradict the "no Next actions section" ban, which is
    # about sequencing a roadmap, not naming what one specific row requires.
    assert "the single concrete owned action it requires" in SYSTEM_PROMPT
    assert "not the 'Next actions' sequencing plan banned below" in SYSTEM_PROMPT


def test_system_prompt_bold_verdict_is_a_hard_rule():
    assert "Always bold the Verdict cell's value itself" in SYSTEM_PROMPT


def test_system_prompt_defines_all_out_of_scope_case():
    assert "No instrument reaches In Scope or Monitor at this company's current" in SYSTEM_PROMPT


def test_system_prompt_same_type_source_conflict_prefers_recency():
    assert "two sources of the SAME type conflict" in SYSTEM_PROMPT
    assert "prefer whichever source is more recent" in SYSTEM_PROMPT


def test_system_prompt_track_record_hedge_matches_officeholder_hedge():
    assert "track-record or enforcement-posture claim" in SYSTEM_PROMPT
    assert "goes stale the same way an officeholder's name does" in SYSTEM_PROMPT


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


def test_build_documents_labels_a_verbatim_debate_as_such():
    # These used to be document_type "other" — the same bucket as a press
    # summary — and were distinguished only by extra["kind"]. DocumentType
    # .VERBATIM_DEBATE now carries the fact, so the label comes from the type
    # like every other source and the redundant marker is gone.
    passages = [
        {
            "text": "Henna Virkkunen (Executive Vice-President) — ...",
            "title": "Presentation of the Cybersecurity Act (debate)",
            "jurisdiction": "EU",
            "document_type": "verbatim_debate",
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


def test_cap_per_source_restores_breadth():
    # Mirrors _cap_per_document's own test, one level up: a single
    # high-volume source (gnews_eu_tech's near-duplicate AI Act explainers,
    # found live 2026-07-23) can still sweep every slot even after MMR
    # reranking if a new glut-prone source appears later — this is the
    # backstop, not the primary fix.
    glut = [{"source_key": "glut", "url": f"u{i}", "text": "x"} for i in range(5)]
    diverse = {"source_key": "diverse", "url": "u-d", "text": "y"}
    capped = _cap_per_source([*glut[:2], diverse, *glut[2:]], max_per_source=2)
    glut_kept = [p for p in capped if p["source_key"] == "glut"]
    assert len(glut_kept) == 2
    assert diverse in capped


def test_cap_per_source_passes_through_passages_with_no_source_key():
    # semantic_search()/canon_passages() results never set source_key —
    # only press_passages() does. Those must never be capped away just for
    # lacking the field.
    passages = [{"url": f"u{i}", "text": "x"} for i in range(5)]
    assert _cap_per_source(passages, max_per_source=2) == passages


def test_select_breadth_first_survives_a_flat_slice_would_not():
    # The composition this actually guards: _cap_per_document restores
    # breadth in its OUTPUT, but generate_briefing used to slice that
    # output with a bare [:k] afterward — which re-sorts nothing and just
    # keeps the first k items in raw best-first order. Two dominant
    # documents (A, B) with 3 capped passages each already fill 6 of an
    # 8-slot budget before four other genuinely-relevant single-passage
    # documents (C, D, E, F) even get a turn — a flat [:8] slice keeps
    # only 2 of those 4 (whichever sort earliest), silently dropping the
    # rest. Round-robin selection must keep all of them.
    def doc(key: str, n: int, base_score: float) -> list[dict]:
        return [
            {"celex": key, "url": f"u-{key}", "char_start": i, "score": base_score - i * 0.01}
            for i in range(n)
        ]

    # Already best-first overall, exactly as semantic_search would return —
    # A's block first (highest scores), then B's, then the four singles.
    passages = doc("A", 5, 0.95) + doc("B", 5, 0.85) + [
        {"celex": "C", "url": "u-C", "char_start": 0, "score": 0.70},
        {"celex": "D", "url": "u-D", "char_start": 0, "score": 0.65},
        {"celex": "E", "url": "u-E", "char_start": 0, "score": 0.60},
        {"celex": "F", "url": "u-F", "char_start": 0, "score": 0.55},
    ]
    capped = _cap_per_document(passages, max_per_doc=3)

    # Prove the flat-slice failure mode this replaces actually would occur:
    flat_slice = capped[:8]
    flat_docs = {p["celex"] for p in flat_slice}
    assert flat_docs == {"A", "B", "C", "D"}  # E and F silently dropped

    selected = _select_breadth_first(capped, 8)
    assert len(selected) == 8
    assert {p["celex"] for p in selected} == {"A", "B", "C", "D", "E", "F"}


def test_press_source_keys_are_all_registered_adapters():
    # Catches typos and removed feeds immediately (does not catch a newly
    # added feed nobody remembered to add to this allowlist — that's a
    # process gap, not a testable one). Found and fixed one real case this
    # way already: techcrunch_eu's own feed went stale server-side and was
    # removed from this list — this test guards against silent drift going
    # forward, in either direction.
    from etl.adapters import ADAPTERS_BY_KEY
    from etl.enrichment.reclassify import _PRESS_SOURCE_KEYS as CLASSIFY_KEYS

    missing = CLASSIFY_KEYS - set(ADAPTERS_BY_KEY)
    assert not missing, f"_PRESS_SOURCE_KEYS references unregistered adapter keys: {missing}"
    # The editorial blocklist must also name real adapters, or an exclusion
    # silently stops excluding anything when a key is renamed.
    stale = _PRESS_EXCLUDED_SOURCES - set(ADAPTERS_BY_KEY)
    assert not stale, f"_PRESS_EXCLUDED_SOURCES references unregistered keys: {stale}"


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


# --- Retrieval shape: breadth vs depth ------------------------------------


def test_stub_canon_passages_trims_text_and_marks_the_stub():
    canon = [{"celex": "32024R1689", "text": "A" * 2000}]
    out = _stub_canon_passages(canon, substantive=[])
    assert len(out) == 1
    assert len(out[0]["text"]) <= _CANON_STUB_CHARS + 1  # +1 for the ellipsis
    assert out[0]["canon_stub"] is True


def test_stub_canon_passages_skips_acts_already_retrieved_on_merit():
    canon = [
        {"celex": "32024R1689", "text": "A" * 2000},
        {"celex": "32016R0679", "text": "B" * 2000},
    ]
    substantive = [{"celex": "32024R1689", "text": "full AI Act passage"}]
    out = _stub_canon_passages(canon, substantive)
    # The AI Act is already in context with full text; re-adding a stub of it
    # would spend budget duplicating an instrument instead of covering one.
    assert [p["celex"] for p in out] == ["32016R0679"]


def test_stub_canon_passages_leaves_short_text_alone():
    canon = [{"celex": "X", "text": "Short subject matter."}]
    assert _stub_canon_passages(canon, [])[0]["text"] == "Short subject matter."


def test_excerpt_ends_on_a_sentence_boundary():
    # The boundary has to land in the latter half of the budget to be worth
    # honoring — see the early-boundary test below for the other branch.
    first = "This Regulation lays down harmonised rules on artificial intelligence systems."
    text = first + " " + "B" * 400
    out = _excerpt(text, 100)
    assert out == first


def test_excerpt_falls_back_to_ellipsis_when_the_boundary_is_too_early():
    # "Article 5." at position 9 would throw away 90% of the excerpt, so the
    # hard cut with an ellipsis is preferred over an almost-empty stub.
    text = "Article 5. " + "B" * 400
    out = _excerpt(text, 100)
    assert out.endswith("…")
    assert len(out) > 50


def test_top_document_ids_reserves_most_slots_for_binding_law():
    # Commentary scores higher than every binding instrument here, which is
    # the real observed situation (impact assessments out-score the acts they
    # assess). A pure relevance ranking would fill all 5 slots with it.
    passages = [
        {"document_id": i, "document_type": "other", "score": 0.90 - i * 0.01} for i in range(10)
    ] + [
        {"document_id": 100 + i, "document_type": "regulation", "score": 0.50 - i * 0.01}
        for i in range(10)
    ]
    picked = _top_document_ids(passages, limit=5)
    binding = [d for d in picked if d >= 100]
    assert len(binding) >= 3  # 0.6 of 5, rounded
    assert len(picked) == 5


def test_top_document_ids_ranks_within_a_tier_by_best_passage():
    passages = [
        {"document_id": 1, "document_type": "regulation", "score": 0.4},
        {"document_id": 2, "document_type": "regulation", "score": 0.9},
        {"document_id": 2, "document_type": "regulation", "score": 0.1},
    ]
    assert _top_document_ids(passages, limit=1) == [2]


def test_top_document_ids_prefers_rerank_score_over_embedding_score():
    passages = [
        {"document_id": 1, "document_type": "regulation", "score": 0.9, "rerank_score": 0.1},
        {"document_id": 2, "document_type": "regulation", "score": 0.2, "rerank_score": 0.9},
    ]
    assert _top_document_ids(passages, limit=1) == [2]


def test_top_document_ids_spills_unused_quota_instead_of_shrinking():
    # Only commentary exists. The binding and pipeline quotas cannot be
    # filled, and those slots must go to the best remaining candidates rather
    # than silently shrinking the depth pass.
    passages = [
        {"document_id": i, "document_type": "other", "score": 0.9 - i * 0.01} for i in range(10)
    ]
    assert len(_top_document_ids(passages, limit=6)) == 6


def test_top_document_ids_ignores_passages_without_a_document_id():
    passages = [{"document_type": "regulation", "score": 0.9}]
    assert _top_document_ids(passages, limit=3) == []


def test_top_document_ids_treats_unknown_document_type_as_commentary():
    passages = [{"document_id": 1, "document_type": "brand-new-type", "score": 0.9}]
    assert _top_document_ids(passages, limit=3) == [1]


def test_retrieval_stats_flags_depth_collapse():
    """documents_per_passage == 1.0 is the shape that made briefs generic:
    every document contributing exactly one passage. This is the number the
    regression guard below watches."""
    one_each = [
        {"text": "x" * 100, "score": 0.5, "celex": f"C{i}", "document_id": i} for i in range(10)
    ]
    assert _retrieval_stats(one_each, ["profile"])["documents_per_passage"] == 1.0

    deep = [
        {"text": "x" * 100, "score": 0.5, "celex": f"C{i // 5}", "document_id": i // 5}
        for i in range(10)
    ]
    assert _retrieval_stats(deep, ["profile"])["documents_per_passage"] == 0.2


def test_retrieval_stats_separates_canon_stubs_from_substantive_passages():
    passages = [
        {"text": "x" * 100, "score": 0.5, "celex": "A", "document_id": 1},
        {"text": "y" * 50, "score": 0.4, "celex": "B", "document_id": 2, "canon_stub": True},
    ]
    stats = _retrieval_stats(passages, ["profile"])
    assert stats["canon_stubs"] == 1
    assert stats["substantive_passages"] == 1
    assert stats["context_chars"] == 150


def test_retrieval_stats_handles_an_empty_passage_set():
    assert _retrieval_stats([], ["profile"])["passages"] == 0


def _seed_deep_doc(session, *, celex: str, key: str, passages: list[str]) -> None:
    """One document with several passages, so a depth pass has something to
    retrieve more than one of."""
    src = Source(key=key, name=key, jurisdiction=Jurisdiction.EU)
    session.add(src)
    session.flush()
    doc = Document(
        source_id=src.id,
        external_id=celex,
        title=f"Act {celex}",
        jurisdiction=Jurisdiction.EU,
        document_type=DocumentType.REGULATION,
        lifecycle_stage=LifecycleStage.IN_FORCE,
        url=f"http://x/{celex}",
        celex=celex,
    )
    session.add(doc)
    session.flush()
    ver = DocumentVersion(
        document_id=doc.id,
        content_hash=f"h-{celex}",
        text="t",
        char_count=1,
        fetched_at=dt.datetime.now(dt.UTC),
    )
    session.add(ver)
    session.flush()
    for ordinal, text in enumerate(passages):
        session.add(
            Passage(
                version_id=ver.id,
                ordinal=ordinal,
                text=text,
                char_start=ordinal * 100,
                char_end=ordinal * 100 + len(text),
            )
        )
    session.commit()


def test_generate_briefing_retrieves_several_passages_per_instrument(db_session):
    """The regression guard for the failure this retrieval shape exists to fix.

    Before the breadth/depth split, every document in context contributed
    exactly one passage (measured live: 65 documents, 66 passages), so the
    brief could name instruments and explain none. A single passage per
    document must never again be the shape of a brief's context."""
    _seed_deep_doc(
        db_session,
        celex="32024R1689",
        key="deep1",
        passages=[
            "ai obligations and intelligence",
            "ai risk management system requirements",
            "ai conformity assessment duties",
            "ai transparency obligations for providers",
        ],
    )
    embed_pending(db_session, FakeEmbedder())

    profile = CompanyProfile(name="Acme", uses_ai=True)
    result = generate_briefing(db_session, FakeEmbedder(), profile, k=5, dry_run=True)

    stats = result["retrieval_stats"]
    counts: dict[int, int] = {}
    for p in result["passages"]:
        if not p.get("canon_stub") and p.get("document_id") is not None:
            counts[p["document_id"]] = counts.get(p["document_id"], 0) + 1
    assert max(counts.values()) > 1, "depth collapse: no instrument got more than one passage"
    # Asserted on the SUBSTANTIVE ratio, not the all-passage one. The
    # all-passage ratio includes ~50 single-passage canon stubs, so it sits near
    # 0.5 whatever retrieval does and would pass this guard even under a total
    # depth collapse — see _retrieval_stats.
    assert stats["substantive_documents_per_passage"] < 1.0
    assert stats["max_passages_per_document"] > 1


def test_generate_briefing_reports_retrieval_stats_on_dry_run(db_session):
    _seed(db_session)
    embed_pending(db_session, FakeEmbedder())
    profile = CompanyProfile(name="Acme", uses_ai=True)
    result = generate_briefing(db_session, FakeEmbedder(), profile, k=5, dry_run=True)
    stats = result["retrieval_stats"]
    assert stats["passages"] == len(result["passages"])
    # Facets are unioned, not blended: an AI-using company retrieves for its
    # profile AND its AI exposure separately.
    assert "profile" in stats["facets"]
    assert "ai" in stats["facets"]


def test_generate_briefing_uses_the_reranked_order(db_session):
    """A reranker that inverts the embedding order must actually change which
    passages reach the brief — otherwise reranking is wired up but inert."""
    _seed_deep_doc(
        db_session,
        celex="32024R1689",
        key="deep2",
        passages=["ai duties", "ai fish fish fish rules"],
    )
    embed_pending(db_session, FakeEmbedder())

    class FishFirst:
        def rerank(self, query: str, texts: list[str]) -> list[float]:
            return [float(t.lower().count("fish")) for t in texts]

    profile = CompanyProfile(name="Acme", uses_ai=True)
    result = generate_briefing(
        db_session, FakeEmbedder(), profile, k=5, dry_run=True, reranker=FishFirst()
    )
    breadth = [p for p in result["passages"] if p.get("facet")]
    assert breadth, "no passage carried a facet tag"
    assert "fish" in breadth[0]["text"]


# --- enrichment summaries in context --------------------------------------


def test_build_documents_prepends_the_instrument_summary_once_per_document():
    """The depth pass puts several passages of one act in context; repeating its
    summary on each would spend the context this is meant to use well."""
    passages = [
        {"text": "Article 6 text", "celex": "32024R1689", "summary": "Binds AI providers."},
        {"text": "Article 7 text", "celex": "32024R1689", "summary": "Binds AI providers."},
        {"text": "Article 1 text", "celex": "32016R0679", "summary": "Binds data controllers."},
    ]
    blocks = build_documents(passages)
    bodies = [b["source"]["data"] for b in blocks]
    assert bodies[0].startswith("[What this instrument does: Binds AI providers.]")
    assert bodies[1] == "Article 7 text"  # same act, no repeat
    assert bodies[2].startswith("[What this instrument does: Binds data controllers.]")


def test_build_documents_unchanged_for_passages_without_a_summary():
    """A corpus where the enrichment pass hasn't run must behave exactly as
    before, not produce empty headers."""
    blocks = build_documents([{"text": "raw text", "celex": "X"}])
    assert blocks[0]["source"]["data"] == "raw text"


def test_attach_summaries_is_a_noop_without_enrichments(db_session):
    passages = [{"text": "t", "document_id": 12345}]
    assert _attach_summaries(db_session, passages) == passages


def test_attach_summaries_ignores_passages_with_no_document_id(db_session):
    passages = [{"text": "t"}]
    assert _attach_summaries(db_session, passages) == passages


def test_attach_summaries_populates_from_the_enrichments_table(db_session):
    from data.models import Enrichment

    _seed(db_session)
    doc_id = db_session.scalars(select(Document.id)).first()
    db_session.add(
        Enrichment(document_id=doc_id, summary="What this act does.", model="test-model")
    )
    db_session.commit()
    out = _attach_summaries(db_session, [{"text": "t", "document_id": doc_id}])
    assert out[0]["summary"] == "What this act does."


def test_system_prompt_tells_the_brief_to_use_enforcement_precedent():
    """Measured 2026-07-27: after case law was ingested, embedded AND surfaced by
    the enforcement facet, only 2 of 5 panel briefs cited a judgment — and they
    did so incidentally. The prompt had no instruction about case law at all
    (grep for 'court of justice', 'judgment', 'ruling' all missed), so the model
    had no reason to prefer a ruling over the commentary discussing the same
    provision. Locks in the fix so a future prompt edit can't silently drop it
    and quietly strand the whole case-law layer again."""
    lowered = SYSTEM_PROMPT.lower()
    assert "enforcement precedent" in lowered
    assert "judgment" in lowered
    assert "court of justice" in lowered
    # The ordering rule is the operative part: a ruling governs over commentary
    # on the same provision.
    assert "the judgment governs" in lowered
    # ...and the fabrication guard, since inventing a holding is worse than none.
    assert "a misattributed holding is worse than no holding" in lowered


def test_system_prompt_sets_a_high_bar_for_citing_case_law():
    """A ruling is only worth a reader's attention if it changes what THIS
    company must do. With 1,440 judgments in the corpus, "cite case law" without
    a relevance bar would let a tangential ruling into every brief — which reads
    as rigour and is actually noise."""
    lowered = SYSTEM_PROMPT.lower()
    assert "the bar for using one is high" in lowered
    assert "most briefs should cite no case law at all" in lowered
    # Explicitly rules out the three near-miss cases that would otherwise pass.
    assert "merely on a related topic" in lowered
    assert "leave it out entirely" in lowered


def test_enforcement_facet_has_a_higher_relevance_floor_than_the_legal_path():
    """Retrieval has to enforce the same discipline as the prompt: an
    unconditional facet at the general floor would find *something* for every
    profile, which is precisely case law that is present but not pertinent."""
    from etl.intelligence.briefing import _FACET_OVERRIDES, _LEGAL_MIN_SCORE

    override = _FACET_OVERRIDES["enforcement"]
    assert override["min_score"] > _LEGAL_MIN_SCORE
    assert override["k"] < 5


def test_system_prompt_still_bans_naming_unretrieved_cases():
    """The instrument-identity rule has to extend to case law, or 'cite a
    judgment' becomes an invitation to recall one from training."""
    assert "applies to cases exactly as it does to legislation" in SYSTEM_PROMPT


def test_cap_precedent_keeps_only_the_strongest_rulings():
    """The hard ceiling. Neither the facet floor nor the depth quota can bound
    case law, because rulings arrive through every facet — "personal data
    processing obligations" matches a data-protection judgment well at any
    floor. Measured 2026-07-27: a fintech profile reached 21 judgment passages
    (32% of substantive context) with both of those in place."""
    passages = [
        {"text": "law", "document_type": "regulation", "score": 0.4},
        *[
            {"text": f"ruling {i}", "document_type": "judgment", "score": 0.9 - i * 0.05}
            for i in range(10)
        ],
    ]
    out = _cap_precedent(passages, limit=3)
    kept = [p for p in out if p["document_type"] == "judgment"]
    assert len(kept) == 3
    assert [p["text"] for p in kept] == ["ruling 0", "ruling 1", "ruling 2"]
    # Non-precedent passages must pass through untouched.
    assert any(p["document_type"] == "regulation" for p in out)


def test_cap_precedent_preserves_input_order():
    """Citation indices are built from this ordering, so the cap must filter,
    never reorder."""
    passages = [
        {"text": "a", "document_type": "judgment", "score": 0.1},
        {"text": "b", "document_type": "regulation", "score": 0.9},
        {"text": "c", "document_type": "judgment", "score": 0.9},
    ]
    out = _cap_precedent(passages, limit=1)
    assert [p["text"] for p in out] == ["b", "c"]


def test_cap_precedent_is_a_noop_without_case_law():
    passages = [{"text": "law", "document_type": "regulation", "score": 0.5}]
    assert _cap_precedent(passages) == passages


def test_cap_precedent_also_bounds_enforcement_decisions():
    passages = [
        {"text": f"fine {i}", "document_type": "enforcement_decision", "score": 0.9}
        for i in range(10)
    ]
    assert len(_cap_precedent(passages, limit=2)) == 2


def test_retrieval_stats_depth_signal_ignores_canon_stubs():
    """The all-passage ratio is floored near 0.5 by ~50 single-passage canon
    stubs, so it cannot detect a depth collapse it was introduced to detect.
    The substantive ratio can: here every real instrument contributes exactly
    one passage — total collapse — while the all-passage number looks fine."""
    collapsed = [
        {"text": "x" * 100, "score": 0.5, "celex": f"C{i}", "document_id": i} for i in range(10)
    ] + [
        {
            "text": "y" * 50,
            "score": 0.4,
            "celex": f"S{i}",
            "document_id": 100 + i,
            "canon_stub": True,
        }
        for i in range(50)
    ]
    stats = _retrieval_stats(collapsed, ["profile"])
    assert stats["substantive_documents_per_passage"] == 1.0  # collapse, correctly flagged
    assert stats["max_passages_per_document"] == 1


def test_retrieval_stats_reports_real_depth_when_it_exists():
    deep = [
        {"text": "x" * 100, "score": 0.5, "celex": f"C{i // 5}", "document_id": i // 5}
        for i in range(20)
    ]
    stats = _retrieval_stats(deep, ["profile"])
    assert stats["substantive_documents_per_passage"] == 0.2
    assert stats["max_passages_per_document"] == 5


def test_system_prompt_forbids_prio_1_on_an_unresolved_monitor():
    """Found by the judge on the first measured panel (2026-07-28): "Prio 1 given
    to a 'Monitor' verdict with no confirmed high-risk trigger". Prio and Verdict
    are deliberately independent — a Monitor row CAN be Prio 1 when a rival's
    enforcement dynamic is the opportunity — so the rule has to be narrow:
    Monitor + unresolved hinge + Prio 1 is the combination that cannot occur.
    Telling a reader to resource work whose applicability you just called unknown
    is telling them to spend money on a maybe."""
    lowered = SYSTEM_PROMPT.lower()
    assert "prio/verdict consistency" in lowered
    assert "must not be prio 1" in lowered
    # The independence must survive — this rule must not collapse Prio into Verdict.
    assert "deliberately independent" in lowered
    # And the escape hatch: a confirmed external trigger is still legitimately Prio 1.
    assert "only correct when the trigger is confirmed" in lowered


def test_revise_pass_rechecks_prio_against_verdict():
    """Every prompt rule earned from a real failure gets a revise-pass check too,
    so one generation slipping past the draft instruction still gets caught."""
    from etl.intelligence.briefing import REVISE_INSTRUCTION

    assert "PRIO/VERDICT CHECK" in REVISE_INSTRUCTION
    assert "demote it to Prio 2" in REVISE_INSTRUCTION
    # The action bullet has to change with the demotion, or the brief still tells
    # the reader to do the compliance work.
    assert "rewrite the bullet as" in REVISE_INSTRUCTION


def test_revise_pass_numbered_checks_stay_in_sync():
    """The revise instruction enumerates its checks; adding one without updating
    the 'table rows ARE subject to' list silently exempts table rows from it —
    which is where the Prio defect lives."""
    from etl.intelligence.briefing import REVISE_INSTRUCTION

    assert "(10) PRIO/VERDICT CHECK" in REVISE_INSTRUCTION
    assert "(7), (8), (9) and (10)" in REVISE_INSTRUCTION


# --- named stakeholders (Phase 5.1) ---------------------------------------


def test_stakeholder_block_is_none_without_actors():
    """A corpus with no actor data must produce a byte-identical request to
    before, not an empty 'Stakeholders:' heading that invites the model to fill
    it from memory."""
    assert build_stakeholder_block([]) is None


def test_stakeholder_block_names_people_with_institution_and_group():
    block = build_stakeholder_block(
        [
            {
                "name": "Brando Benifei",
                "institution": "European Parliament",
                "political_group": "S&D",
                "role": "rapporteur",
                "documents": 3,
            }
        ]
    )
    assert "Brando Benifei" in block
    assert "European Parliament" in block
    assert "S&D" in block
    assert "rapporteur" in block


def test_stakeholder_block_distinguishes_rapporteurs_from_mere_speakers():
    """Holding the file is a stronger claim than having spoken about it, and the
    brief has to be able to tell the reader which is which."""
    block = build_stakeholder_block(
        [
            {"name": "A", "institution": None, "political_group": None,
             "role": "rapporteur", "documents": 1},
            {"name": "B", "institution": None, "political_group": None,
             "role": "speaker", "documents": 1},
        ]
    )
    lines = [line for line in block.splitlines() if line.startswith("-")]
    assert "rapporteur" in lines[0]
    assert "spoke on the file" in lines[1]


def test_build_request_appends_the_stakeholder_block_as_text_not_a_document():
    """It is a roster assembled from the corpus, not a quotable source span —
    giving it a document block would invite citation markers pointing at
    something with no char offsets to cite."""
    profile = CompanyProfile(name="Acme", uses_ai=True)
    passages = [{"text": "law text", "celex": "X"}]
    req = build_request(profile, passages, "NAMED STAKEHOLDERS on the instruments...")
    blocks = req["messages"][0]["content"]
    doc_blocks = [b for b in blocks if b.get("type") == "document"]
    text_blocks = [b for b in blocks if b.get("type") == "text"]
    assert len(doc_blocks) == 1
    assert any("NAMED STAKEHOLDERS" in b["text"] for b in text_blocks)


def test_build_request_omits_the_block_entirely_when_there_is_none():
    profile = CompanyProfile(name="Acme", uses_ai=True)
    req_without = build_request(profile, [{"text": "t", "celex": "X"}], None)
    req_default = build_request(profile, [{"text": "t", "celex": "X"}])
    assert req_without == req_default


def test_stakeholders_resolve_from_documents_actually_in_context(db_session):
    """The lookup joins on the documents already retrieved, so a person attached
    to an unrelated instrument can never be named — which is what stops the
    stakeholder block becoming a fabrication surface."""
    from data.models import Actor, ActorRole, DocumentActor
    from etl.intelligence.briefing import _stakeholders

    _seed(db_session)
    doc_id = db_session.scalars(select(Document.id)).first()
    actor = Actor(name="Brando Benifei", institution="European Parliament")
    db_session.add(actor)
    db_session.flush()
    db_session.add(
        DocumentActor(document_id=doc_id, actor_id=actor.id, role=ActorRole.RAPPORTEUR)
    )
    db_session.commit()

    found = _stakeholders(db_session, [{"document_id": doc_id, "text": "t"}])
    assert [s["name"] for s in found] == ["Brando Benifei"]
    assert found[0]["role"] == "rapporteur"

    # A passage set that does not include that document yields nothing.
    assert _stakeholders(db_session, [{"document_id": doc_id + 9999, "text": "t"}]) == []


def test_system_prompt_tells_the_brief_to_use_named_stakeholders():
    """Measured 2026-07-28: stakeholder_specificity 2.80, four of five critiques
    saying stakeholders stay institutional. The prompt has to actually consume
    the block, and must forbid transplanting a name onto a file the person is not
    listed against."""
    assert "NAMED STAKEHOLDERS BLOCK" in SYSTEM_PROMPT
    lowered = SYSTEM_PROMPT.lower()
    assert "never name a person from that block on a file they are not listed against" in lowered
    # Guard against the opposite failure: a wall of names with no relevance.
    assert "three well-chosen named people beat eight listed ones" in lowered


# --- unresolved hinges + Prio/Verdict check (Phase 5.2/5.3) ---------------

_PRIO_TABLE = """
| Instrument | Prio | Verdict | Why / Trigger |
|---|---|---|---|
| AI Act | 1 | **In Scope** | Annex III high-risk credit scoring confirmed. |
| NIS2 Directive | 1 | **Monitor** | hinges on whether headcount exceeds 50 — confirm |
| CRA | 2 | **Monitor** | hinges on whether the product carries digital elements — confirm |
"""


def test_extract_hinges_reads_the_phrasing_the_prompt_mandates():
    """Hinges existed only in prose, so which ones RECUR was unknowable — and the
    recurrence is the whole input to the follow-up-question audit. Parses the
    phrasing the prompt already requires rather than paying for a second
    structured output."""
    hinges = extract_hinges(_PRIO_TABLE)
    assert [h["instrument"] for h in hinges] == ["NIS2 Directive", "CRA"]
    assert hinges[0]["hinge"] == "headcount exceeds 50"
    assert hinges[0]["verdict"] == "Monitor"


def test_extract_hinges_ignores_committed_verdicts():
    """An In Scope row with a confirmed fact is not an unresolved hinge."""
    assert all(h["instrument"] != "AI Act" for h in extract_hinges(_PRIO_TABLE))


def test_extract_hinges_degrades_to_empty_on_unfamiliar_phrasing():
    """A brief that phrases things differently must yield nothing rather than
    garbage — this is a convenience reader, not a contract."""
    assert extract_hinges("Some prose with no table at all.") == []
    assert extract_hinges("") == []


def test_prio_verdict_issues_fires_only_on_the_impossible_combination():
    """Prio and Verdict are deliberately independent — a Monitor row CAN be
    Prio 1 on a confirmed external trigger. Only Prio 1 + Monitor + an
    unresolved hinge is wrong."""
    issues = prio_verdict_issues(_PRIO_TABLE)
    assert len(issues) == 1
    assert "NIS2 Directive" in issues[0]


def test_prio_verdict_issues_allows_prio_1_monitor_with_a_confirmed_trigger():
    """The criterion-(b) case the prompt explicitly protects: a rival's
    enforcement dynamic is a confirmed external trigger, so Prio 1 is right."""
    table = (
        "| Instrument | Prio | Verdict | Why / Trigger |\n"
        "|---|---|---|---|\n"
        "| DMA | 1 | **Monitor** | Google is under a confirmed Art. 6(5) "
        "non-compliance decision, creating direct upside. |\n"
    )
    assert prio_verdict_issues(table) == []


def test_prio_verdict_issues_ignores_prio_2_monitors_with_hinges():
    """A hedged Monitor at Prio 2 is correct behaviour, not a defect."""
    table = (
        "| Instrument | Prio | Verdict | Why / Trigger |\n"
        "|---|---|---|---|\n"
        "| CRA | 2 | **Monitor** | hinges on whether the product carries digital "
        "elements — confirm |\n"
    )
    assert prio_verdict_issues(table) == []


def test_table_parsing_skips_headers_and_separators():
    from etl.intelligence.parsing import _table_rows

    rows = _table_rows(_PRIO_TABLE)
    assert len(rows) == 3
    assert rows[0][0] == "AI Act"


def test_every_document_type_has_a_source_label():
    """The '[EU · Regulation]' prefix is how the model weighs authority, so a
    type with no label degrades to a raw slug like 'staff_working_doc'. Adding a
    DocumentType without a label is easy to miss; this makes it impossible."""
    from data.models import DocumentType
    from etl.intelligence.briefing import _DOCTYPE_LABELS

    missing = [t.value for t in DocumentType if t.value not in _DOCTYPE_LABELS]
    assert not missing, f"DocumentType members with no display label: {missing}"


def test_verbatim_debates_are_labelled_from_their_type_not_from_extra():
    """A named politician's floor remarks must never read as a press summary.
    That used to need a special case keyed on extra["kind"]; the type now says
    it, and all 129 verbatim documents carried both facts redundantly."""
    from etl.intelligence.briefing import _source_label

    assert _source_label("EU", "verbatim_debate") == "[EU · Verbatim debate]"
    assert _source_label("EU", "press") == "[EU · Press]"
