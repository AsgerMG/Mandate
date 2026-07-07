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

from data.config import get_settings
from etl.enrichment import Embedder, semantic_search

from .profile import CompanyProfile

# The answer `id`s deliberately match CompanyProfile field names, so the
# front-end can post answers straight back into the profile.
SIZE_QUESTION = {
    "id": "company_size",
    "question": "How large is the company?",
    "why_it_matters": (
        "SME status gates many obligations — the AI Act, GDPR record-keeping and "
        "several reporting duties apply differently below the 250-employee / "
        "€50M-turnover thresholds."
    ),
    "kind": "choice",
    "options": [
        "micro (<10 staff, <€2M)",
        "small (<50 staff, <€10M)",
        "medium (<250 staff, <€50M)",
        "large (250+ staff or €50M+)",
    ],
}

AI_ROLE_QUESTION = {
    "id": "ai_role",
    "question": "What is your role in the AI value chain?",
    "why_it_matters": (
        "The AI Act assigns most duties to *providers* (who develop or place AI "
        "systems on the market) and a lighter set to *deployers* (who use them). "
        "Getting this wrong misstates your whole obligation set."
    ),
    "kind": "choice",
    "options": [
        "provider — we develop/sell AI systems",
        "deployer — we use third-party AI",
        "both",
        "none",
    ],
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
COMPETITIVE_CONTEXT_QUESTION = {
    "id": "competitive_context",
    "question": (
        "Is there a company, platform, or industry dynamic that puts you at a "
        "disadvantage, or that a rule might affect differently than it affects you? For "
        "example: a bigger rival with more compliance resources, a dominant platform "
        "that sets terms you depend on (ranks itself above you, controls a marketplace "
        "or app store), a competitor whose data/content practices you think should draw "
        "more scrutiny, or a looming rule change (including simplification/deregulation) "
        "that could help or hurt you more than your rivals. If so, name it and briefly "
        "describe the issue. If not, that's a complete answer too."
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
}


def core_questions(profile: CompanyProfile) -> list[dict]:
    """The deterministic scoping set, tailored to what the form already told us.
    Only asks what is still unknown and plausibly relevant."""
    questions: list[dict] = []
    if not profile.company_size:
        questions.append(SIZE_QUESTION)
    if profile.uses_ai and not profile.ai_role:
        questions.append(AI_ROLE_QUESTION)
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
    "thresholds, roles, or activities the profile leaves ambiguous. Never re-ask "
    "what the profile or the standard scoping set already covers (size, AI role, EU "
    "user count, data categories, customer type). If nothing more is needed, "
    "propose zero questions."
)


def build_extras_request(
    profile: CompanyProfile, passages: list[dict], already_asked: list[str]
) -> dict[str, Any]:
    """Assemble the messages.create(**kwargs) payload for LLM extras (no API call)."""
    settings = get_settings()
    corpus = "\n\n".join(
        f"[{p.get('celex') or p.get('title')}] {p['text'][:600]}" for p in passages
    )
    prompt = (
        f"Company: {profile.name}\n"
        f"Profile: {profile.description or '(none)'}\n"
        f"Sectors: {', '.join(profile.sectors) or '(unspecified)'}\n"
        f"Uses AI: {profile.uses_ai} | Personal data: {profile.handles_personal_data}\n"
        f"Already being asked: {', '.join(already_asked) or '(nothing)'}\n\n"
        f"Retrieved policy passages:\n{corpus}"
    )
    return {
        "model": settings.llm_model,
        "max_tokens": 1500,
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
            if q.get("id") and q.get("question") and q["id"] not in already_asked:
                q.setdefault("kind", "text")
                q.setdefault("options", [])
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
        passages = semantic_search(session, embedder, profile.to_query(), k=k)
        if passages:
            if client is None:
                from .llm import get_client

                client = get_client()
            request = build_extras_request(profile, passages, asked_ids)
            response = client.messages.create(**request)
            questions += parse_extras_response(response.content, set(asked_ids))

    return {"questions": questions}
