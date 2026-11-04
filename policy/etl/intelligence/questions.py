"""Scoping questions — the follow-up step between "tell us about your company"
and the report.

EU instruments rarely apply to "tech companies" wholesale; they turn on
thresholds: SME status (AI Act simplified obligations, GDPR record-keeping),
role in the AI value chain (provider vs deployer duties), monthly EU users
(DSA tiers, gatekeeper designation), and sensitive-data categories (GDPR
Art. 9, AI Act prohibited practices). Asking these five things up front is the
difference between a hedged essay and a report that says "in scope" / "out of
scope" with a straight face.

A sixth question — competitive context — serves the mirror-image case: not
"what applies to me" but "does regulation constrain a dominant rival in a way
that's a commercial opening for me". It has no dedicated CompanyProfile field
by design; it lands in the generic `answers` bag and only surfaces in the
report when the profile names something concrete AND the corpus has real
evidence for it (see the Strategic play guardrails in briefing.py) — "no
dominant rival" is treated as a complete, good answer.

The core set is deterministic and testable. When an API key is available,
Claude reads the retrieved passages and may add up to three corpus-specific
questions (e.g. "do you place products on the market under your own brand?"
when the Cyber Resilience Act surfaces). Both paths return the same shape.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from etl.enrichment import Embedder, canon_passages, semantic_search

from .briefing import _CANON_CELEX, _merge_passages
from .llm import reasoning_params
from .profile import CompanyProfile

# The answer `id`s deliberately match CompanyProfile field names, so the
# front-end can post answers straight back into the profile. `group` has no
# effect on retrieval or scoping — it only drives how the front-end paginates
# the scoping step (see website/app/brief/page.tsx GROUP_META).
SIZE_QUESTION = {
    "id": "company_size",
    "question": "How large is the company?",
    "why_it_matters": (
        "Size thresholds decide whole instruments, not just nuances: SME status gates "
        "AI Act and GDPR duties (250 staff / €50M), sustainability reporting under the "
        "revised CSRD starts at 1,000 employees and €450M turnover, and NIS2 coverage "
        "for digital providers turns on the 50-staff/€10M line. A precise band lets the "
        "report say in or out of scope instead of guessing."
    ),
    "kind": "choice",
    # Bands align with the thresholds that actually gate instruments — the old
    # coarse "large (250+)" bucket forced the model to guess on CSRD (1,000 /
    # €450M) and produced run-to-run verdict flips on real briefs.
    "options": [
        "micro (<10 staff, <€2M)",
        "small (<50 staff, <€10M)",
        "medium (<250 staff, <€50M)",
        "large (250–999 staff, €50M–€450M)",
        "enterprise (1,000+ staff or €450M+ turnover)",
    ],
    "group": "business",
}

AI_ROLE_QUESTION = {
    "id": "ai_role",
    "question": "What is your role in the AI value chain?",
    "why_it_matters": (
        "The AI Act assigns most duties to *providers* (who develop or place AI "
        "systems on the market) and a lighter set to *deployers* (who use them). "
        "Getting this wrong misstates your whole obligation set. Providers split "
        "further: training your own general-purpose model carries the Act's "
        "heaviest tier (Chapter V, GPAI obligations) — building a product on top of "
        "someone else's model does not, even though both count as 'providing' AI."
    ),
    "kind": "choice",
    "options": [
        "provider — we develop/train our own general-purpose AI model",
        "provider — we build AI systems/products on top of others' models",
        "deployer — we use third-party AI tools",
        "both",
        "none",
    ],
    "group": "ai",
}

EU_USERS_QUESTION = {
    "id": "monthly_eu_users",
    "question": "Roughly how many monthly active users do you have in the EU?",
    "why_it_matters": (
        "The DSA's heaviest obligations (VLOP/VLOSE) start at 45M monthly EU users, "
        "and intermediary-service duties scale with reach; user counts also matter "
        "for DMA gatekeeper designation."
    ),
    "kind": "choice",
    "options": ["<100k", "100k–1M", "1M–45M", "45M+", "not a user-facing service"],
    "group": "users_data",
}

AI_USE_CASE_QUESTION = {
    "id": "ai_use_cases",
    "question": (
        "Does your AI system make or materially influence a decision about a specific person?"
    ),
    "why_it_matters": (
        "The AI Act's high-risk tier (Annex III) turns on WHAT the system decides, not "
        "who built it: creditworthiness/lending, hiring or worker evaluation, biometric "
        "identification, access to essential services, education/exam scoring, and "
        "law-enforcement or migration use are all high-risk regardless of company size or "
        "AI value-chain role. A system that only processes documents or data without "
        "deciding something about a person usually is not — leaving this unanswered is "
        "why an AI Act verdict often can't commit past 'it depends.'"
    ),
    "kind": "multi",
    "options": [
        "creditworthiness or lending decisions",
        "hiring, worker evaluation, or promotion",
        "biometric identification or categorisation",
        "access to essential services (insurance, utilities, benefits)",
        "education or exam scoring",
        "law enforcement, migration, or border control",
        "none of these",
    ],
    "group": "ai",
}

DATA_CATEGORIES_QUESTION = {
    "id": "data_categories",
    "question": "Do you process any of these categories of personal data?",
    "why_it_matters": (
        "Special-category data (GDPR Art. 9), biometrics and children's data carry "
        "stricter bases, DPIA duties, and intersect with AI Act prohibited practices."
    ),
    "kind": "multi",
    "options": [
        "health or special-category data",
        "biometric data",
        "children's data",
        "precise location",
        "financial/credit data",
        "none of these",
    ],
    "group": "users_data",
}

CUSTOMER_TYPE_QUESTION = {
    "id": "customer_type",
    "question": "Who are your customers?",
    "why_it_matters": (
        "Consumer-facing services pick up the DSA's consumer-protection layer, "
        "unfair-commercial-practice rules and different transparency duties than "
        "pure B2B offerings."
    ),
    "kind": "choice",
    "options": ["businesses (B2B)", "consumers (B2C)", "both"],
    "group": "business",
}

# Unlike the five questions above, this has no matching CompanyProfile field —
# it lands in the generic `answers` bag by design (see profile.py) and flows
# into retrieval/scoping automatically. Deliberately unconditional (no sector
# gate: uneven regulatory exposure shows up well beyond obvious "platform"
# sectors) and deliberately jargon-free, since the person answering won't
# know terms like "gatekeeper" or "self-preferencing". Deliberately broad
# across dossiers too — not just DMA/antitrust dynamics, but DSA duties, AI
# Act compliance costs, and Digital-Omnibus-style deregulation can all land
# unevenly across a market.
#
# The question text itself stays short — the examples that used to be packed
# into the question live in `placeholder` instead, so the ask reads as one
# sentence and the examples are optional supporting text.
COMPETITIVE_CONTEXT_QUESTION = {
    "id": "competitive_context",
    "question": (
        "Is there a competitor or industry dynamic that puts you at a disadvantage — "
        "or that a new rule might affect differently than it affects you?"
    ),
    "placeholder": (
        "e.g. a bigger rival with more compliance resources, a dominant platform whose "
        "terms you depend on, a competitor whose data practices deserve more scrutiny, "
        "a rule change that could help or hurt you more than rivals. Leave blank if "
        "nothing comes to mind."
    ),
    "why_it_matters": (
        "Regulation rarely lands evenly across a market — a dominant rival being "
        "constrained (DMA, antitrust), a competitor's compliance duty you don't share "
        "(DSA, AI Act), or a rule change that cuts costs unevenly (e.g. a Digital "
        "Omnibus-style simplification) can all be a genuine commercial opening, not just "
        "someone else's compliance problem. Only worth surfacing if it's real and "
        "evidenced, not assumed."
    ),
    "kind": "text",
    "options": [],
    # Covers the common cases so most people can answer by picking rather than
    # writing — the free-text box next to these stays for anything specific.
    "suggested_answers": [
        "No obvious competitor or dynamic",
        "A bigger rival with more compliance resources",
        "A dominant platform whose terms we depend on",
        "A rule change could hit us and rivals unevenly",
    ],
    "group": "context",
}


def core_questions(profile: CompanyProfile) -> list[dict]:
    """The deterministic scoping set, tailored to what the form already told us.
    Only asks what is still unknown and plausibly relevant."""
    questions: list[dict] = []
    if not profile.company_size:
        questions.append(SIZE_QUESTION)
    if profile.uses_ai and not profile.ai_role:
        questions.append(AI_ROLE_QUESTION)
    if profile.uses_ai and not profile.ai_use_cases:
        questions.append(AI_USE_CASE_QUESTION)
    if not profile.customer_type:
        questions.append(CUSTOMER_TYPE_QUESTION)
    if not profile.monthly_eu_users:
        questions.append(EU_USERS_QUESTION)
    if profile.handles_personal_data and not profile.data_categories:
        questions.append(DATA_CATEGORIES_QUESTION)
    if "competitive_context" not in profile.answers:
        questions.append(COMPETITIVE_CONTEXT_QUESTION)
    return questions


# --- Optional LLM extras -----------------------------------------------------

QUESTIONS_TOOL = {
    "name": "propose_scoping_questions",
    "description": (
        "Propose additional scoping questions whose answers would materially "
        "change which of the retrieved instruments apply to this company."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "questions": {
                "type": "array",
                "maxItems": 3,
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {
                            "type": "string",
                            "description": "snake_case identifier, e.g. own_brand_products",
                        },
                        "question": {"type": "string"},
                        "why_it_matters": {
                            "type": "string",
                            "description": "Which instrument/threshold this decides, one sentence.",
                        },
                        "kind": {"type": "string", "enum": ["choice", "multi", "text"]},
                        "options": {"type": "array", "items": {"type": "string"}},
                        "suggested_answers": {
                            "type": "array",
                            "maxItems": 4,
                            "items": {"type": "string"},
                            "description": (
                                "Only for kind=text: 2-4 short (<8 word) canned answers "
                                "covering the likely cases, so the person can pick instead "
                                "of writing. Always populate for kind=text questions."
                            ),
                        },
                    },
                    "required": ["id", "question", "why_it_matters", "kind"],
                },
            }
        },
        "required": ["questions"],
    },
}

EXTRAS_SYSTEM = (
    "You are a tech-policy analyst preparing to scope a regulatory report. Given a "
    "company profile and the policy passages retrieved for it, propose at most three "
    "scoping questions that would materially change which instruments apply — "
    "thresholds, roles, or activities the profile leaves ambiguous. The bar is "
    "genuine doubt: if the in/out-of-scope verdict for a major retrieved instrument "
    "hinges on a specific fact the profile does not answer (a quantitative threshold, "
    "a role in a value chain, an activity), that is exactly the question to ask — but "
    "asking is the exception, not the default. Spread the questions across DIFFERENT "
    "instruments: never propose two questions about the same instrument, and never "
    "let one theme dominate the set just because it dominates the retrieved passages "
    "— retrieval volume reflects what the corpus happens to hold (a fresh enforcement "
    "report, a named competitor), not which scoping facts are genuinely open. In "
    "particular, a competitive-context answer naming a rival must not pull every "
    "question toward the competition file; the company's own compliance hinges come "
    "first. CRITICAL — a passage being retrieved is NOT evidence of doubt: every "
    "foundational EU tech-policy act (GDPR, DMA, DSA, AI Act, CRA, NIS2, DORA, MiCA...) "
    "is guaranteed a passage in your context for EVERY company, specifically so the "
    "final report can state 'Out of Scope' with a citation instead of silently omitting "
    "the instrument — its presence tells you nothing about relevance to THIS company. "
    "Before proposing a question tied to an instrument, check that the company's own "
    "name, description, or sector already gives a plausible, specific reason it might "
    "apply — never invent a hypothetical ('might they also...', 'could they possibly...') "
    "for an activity nothing in the profile suggests. A cloud software company with no "
    "hardware/manufacturing signal anywhere in its profile gets ZERO product-safety or "
    "connected-device questions, no matter what passages are in context — asking 'just "
    "in case' is exactly the failure this rule exists to prevent. Never re-ask what the "
    "profile or the standard scoping set already covers (size, AI role, EU user count, "
    "data categories, customer type). If nothing more is needed, propose zero questions "
    "— zero is a common, correct outcome, not a fallback. For any question with "
    "kind=text, always include 2-4 short suggested_answers covering the likely cases "
    "(e.g. \"No\", \"Not currently\", \"Yes, under our own brand\") so the person can "
    "pick one instead of writing a paragraph — a text question with no suggestions is "
    "the failure mode this exists to prevent."
)


def build_extras_request(
    profile: CompanyProfile, passages: list[dict], already_asked: list[str]
) -> dict[str, Any]:
    """Assemble the messages.create(**kwargs) payload for LLM extras (no API call)."""
    corpus = "\n\n".join(
        f"[{p.get('celex') or p.get('title')}] {p['text'][:600]}" for p in passages
    )
    # Everything already known — not just the Step-1 booleans — so the model
    # can't propose a question that duplicates a fact already on the profile
    # (e.g. re-asking the EU-user-count band after it's been answered).
    scoping = "\n".join(f"- {line}" for line in profile.scoping_lines())
    prompt = (
        f"Company: {profile.name}\n"
        f"Profile: {profile.description or '(none)'}\n"
        f"Sectors: {', '.join(profile.sectors) or '(unspecified)'}\n"
        f"Uses AI: {profile.uses_ai} | Personal data: {profile.handles_personal_data}\n"
        + (f"Already-known scoping facts:\n{scoping}\n" if scoping else "")
        + "Being asked this round (do not duplicate): "
        + f"{', '.join(already_asked) or '(nothing)'}\n\n"
        f"Retrieved policy passages:\n{corpus}"
    )
    return {
        # Through reasoning_params like every other call site on the brief path,
        # rather than hand-assembling `model` + `max_tokens`. This was the one
        # exception, and an exception is exactly what the shaping layer exists to
        # prevent: it means one call site does not get whatever the layer learns
        # about a model generation, and the failure shows up as a 400 from the
        # one place nobody remembered to update.
        #
        # "low" because this is a scoping judgement over passages already
        # retrieved, not fresh synthesis — the same level build_revise_request
        # uses for its self-edit. On a legacy model that becomes a small explicit
        # thinking budget; on a 4.6-generation model, adaptive thinking with
        # effort=low.
        #
        # max_tokens raised from 1500. The old value was chosen when this call
        # sent no thinking configuration at all — but on a 4.6-generation model
        # omitting `thinking` does not mean "no thinking", and thinking is drawn
        # from the same max_tokens the tool call has to fit in. 1500 was a
        # truncation risk the moment the configured model moved to that
        # generation; 4000 leaves room for the reasoning and a three-question
        # tool call. It is a ceiling, not a spend: effort=low keeps the actual
        # usage well under it.
        **reasoning_params("low", max_tokens=4000),
        "system": EXTRAS_SYSTEM,
        "tools": [QUESTIONS_TOOL],
        "tool_choice": {"type": "tool", "name": "propose_scoping_questions"},
        "messages": [{"role": "user", "content": prompt}],
    }


def parse_extras_response(content_blocks: list[Any], already_asked: set[str]) -> list[dict]:
    """Pull the tool-call questions out of the response, dropping duplicates."""
    extras: list[dict] = []
    for block in content_blocks:
        btype = block.get("type") if isinstance(block, dict) else getattr(block, "type", None)
        if btype != "tool_use":
            continue
        payload = block.get("input") if isinstance(block, dict) else getattr(block, "input", {})
        for q in (payload or {}).get("questions", []):
            if not isinstance(q, dict) or not q.get("id") or not q.get("question"):
                continue
            if q["id"] not in already_asked:
                q.setdefault("kind", "text")
                q.setdefault("options", [])
                q.setdefault("suggested_answers", [])
                q.setdefault("group", "more")
                extras.append(q)
    return extras


def generate_questions(
    session: Session,
    embedder: Embedder,
    profile: CompanyProfile,
    *,
    k: int = 8,
    client: Any | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    """The scoping step: deterministic core questions, plus (with an API key)
    up to three corpus-specific extras."""
    questions = core_questions(profile)
    asked_ids = [q["id"] for q in questions]

    if not dry_run:
        query = profile.to_query()
        passages = semantic_search(session, embedder, query, k=k)
        # Same guarantee generate_briefing() gives the report itself: every
        # foundational act gets a seat in context regardless of whether it
        # wins open retrieval. Without this, an instrument whose activity
        # question would matter most (CRA, P2B, ECGT) can simply lose the
        # open top-k for a thin or off-vocabulary company description, and
        # its question never even gets considered.
        canon = canon_passages(session, embedder, query, _CANON_CELEX)
        passages = _merge_passages(passages, canon)
        if passages:
            if client is None:
                from .llm import get_client

                client = get_client()
            request = build_extras_request(profile, passages, asked_ids)
            response = client.messages.create(**request)
            questions += parse_extras_response(response.content, set(asked_ids))

    return {"questions": questions}
