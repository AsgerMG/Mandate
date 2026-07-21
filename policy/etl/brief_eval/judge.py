"""Scores every panel profile's generate_briefing() result in ONE call.

Batching this (rather than one judge call per profile) is the main lever for
keeping the search loop's total call count — and therefore its wall-clock
time — down: with a small panel this turns N sequential round-trips into 1.
Combines briefing._canon_issues — the same judgment-free, deterministic
cross-check the production pipeline already runs before its own correction
pass — with the LLM judge call for the dimensions that genuinely need
judgment: profile relevance, citation quality, and scope-matching (added
after a real run surfaced obligations being applied without confirming the
company actually triggers them — e.g. GPAI-specific duties asserted without
checking GPAI-provider status).
"""

from __future__ import annotations

import json
from typing import Any

from data.config import get_settings
from etl.intelligence.briefing import _canon_issues
from etl.intelligence.profile import CompanyProfile

BATCH_JUDGE_SCHEMA = {
    "type": "object",
    "properties": {
        "scores": {
            "type": "array",
            "description": "One entry per brief below, in the same order they were given.",
            "items": {
                "type": "object",
                "properties": {
                    "profile": {
                        "type": "string",
                        "description": "The company name this score is for, copied exactly.",
                    },
                    "relevance": {
                        "type": "integer",
                        "description": (
                            "1 (generic boilerplate that could apply to any company) to "
                            "5 (clearly reasoned from this specific company's profile facts)."
                        ),
                    },
                    "citation_quality": {
                        "type": "integer",
                        "description": (
                            "1 (citations are vague, mismatched, or paraphrase the source "
                            "instead of quoting the operative fact) to 5 (each citation "
                            "plausibly and precisely supports the exact claim it's attached to)."
                        ),
                    },
                    "scope_matching": {
                        "type": "integer",
                        "description": (
                            "1 (an obligation gated on a specific status or threshold — e.g. "
                            "GPAI-provider duties, a user-count tier, an SME exemption — is "
                            "asserted without the brief confirming THIS company actually meets "
                            "that gate) to 5 (every scope-gated obligation is only applied "
                            "after the brief establishes eligibility, or explicitly flags it "
                            "as unconfirmed)."
                        ),
                    },
                    "prioritization": {
                        "type": "integer",
                        "description": (
                            "Does Prio 1 in the Compliance table actually earn its place per "
                            "the brief's own criteria (live enforcement exposure, a competitor "
                            "dynamic creating commercial upside, or a looming change "
                            "threatening material financial damage)? 1 (a Prio 1 row has none "
                            "of those stakes — or a row that clearly has one of them is "
                            "buried at Prio 2/3) to 5 (Prio 1 is reserved for instruments "
                            "meeting one of the three criteria, nothing high-stakes is "
                            "demoted, and nothing low-stakes is inflated to fill the top)."
                        ),
                    },
                    "political_currency": {
                        "type": "integer",
                        "description": (
                            "1 (Political landscape & strategic play reads as generic "
                            "'monitor the file' filler — no live proceeding, ruling, or named "
                            "dispute) to 5 (names a specific live tension or ongoing battle — "
                            "an actual ruling, investigation, or contested provision — and "
                            "gives a recommendation genuinely informed by THIS company's own "
                            "stake in it, not a neutral institutional summary)."
                        ),
                    },
                    "stakeholder_specificity": {
                        "type": "integer",
                        "description": (
                            "1 (stakeholders named only as generic institutions — 'the "
                            "European Commission', 'policymakers', 'regulators' — with "
                            "nothing specific enough to contact) to 5 (names the actual "
                            "working-level people or bodies — a rapporteur, a DG unit, a "
                            "national regulator, a specific NGO or trade association — "
                            "precisely enough that the reader could look them up in one "
                            "search)."
                        ),
                    },
                    "tone_and_structure": {
                        "type": "integer",
                        "description": (
                            "1 (buries the bottom line, reads as a hedged legal memo with "
                            "throat-clearing and analyst-jargon, or doesn't lead with an "
                            "urgent-priorities table before the political-landscape "
                            "narrative) to 5 (leads with a bottom-line verdict a founder/"
                            "investor can act on immediately, zero hedging, and follows the "
                            "priorities-table-then-political-landscape structure without "
                            "padding)."
                        ),
                    },
                    "critique": {
                        "type": "string",
                        "description": "One or two sentences: the single biggest weakness.",
                    },
                },
                "required": [
                    "profile",
                    "relevance",
                    "citation_quality",
                    "scope_matching",
                    "prioritization",
                    "political_currency",
                    "stakeholder_specificity",
                    "tone_and_structure",
                    "critique",
                ],
                "additionalProperties": False,
            },
        },
    },
    "required": ["scores"],
    "additionalProperties": False,
}


# The seven dimensions averaged into `score` — kept as one list so the
# average and every fallback dict below stay in lockstep with the schema
# above; add a dimension in both places or it silently drops out of the
# average while still being schema-required.
_SCORE_DIMENSIONS = [
    "relevance",
    "citation_quality",
    "scope_matching",
    "prioritization",
    "political_currency",
    "stakeholder_specificity",
    "tone_and_structure",
]


def _score_from_llm(raw: dict[str, Any], canon_issue_count: int) -> dict[str, Any]:
    scores = dict(raw)
    scores["canon_issues"] = canon_issue_count
    # 0.5/issue was calibrated assuming production-like counts (0-4ish, after
    # the real fix pass runs) — but the eval loop always calls
    # generate_briefing with sharpen=False, and real single-pass output ran
    # 7-32 canon issues per profile. At 0.5/issue the penalty hit its 2.0 cap
    # for nearly every profile, making the one deterministic signal in this
    # score completely flat regardless of which candidate was tested. At
    # 0.05/issue the realistic 7-32 range (0.35-1.6) stays inside the cap with
    # headroom — differentiable again — and only re-saturates at ~40 issues.
    penalty = min(2.0, 0.05 * canon_issue_count)
    average = sum(scores[dim] for dim in _SCORE_DIMENSIONS) / len(_SCORE_DIMENSIONS)
    scores["score"] = max(1.0, average - penalty)
    return scores


def judge_panel(
    client: Any, items: list[tuple[CompanyProfile, dict[str, Any]]]
) -> list[dict[str, Any]]:
    """items is [(profile, generate_briefing() result), ...]. Returns one
    score dict per item, same order — canon_issues, an LLM-judged critique,
    and a combined 1-5 `score` per profile."""
    canon_counts = []
    briefs_text = []
    for profile, result in items:
        briefing_text = result.get("briefing") or ""
        passages = result.get("passages") or []
        canon_issues = _canon_issues(briefing_text, passages) if briefing_text else []
        canon_counts.append(len(canon_issues))
        if briefing_text:
            briefs_text.append(f"### {profile.name}\n{profile.description}\n\n{briefing_text}")
        else:
            briefs_text.append(f"### {profile.name}\n(No briefing text produced.)")

    # Any profile that produced no text at all (dry run / generation failure)
    # doesn't need — and can't usefully get — an LLM judgment.
    if all(not (result.get("briefing") or "") for _, result in items):
        return [
            {
                **{dim: 1 for dim in _SCORE_DIMENSIONS},
                "critique": "No briefing text produced (dry run or generation failure).",
                "canon_issues": c,
                "score": 1.0,
            }
            for c in canon_counts
        ]

    prompt = (
        "Below are several generated regulatory briefs, one per company. Score EACH ONE "
        "independently on the dimensions in the schema — do not let one brief's quality "
        "anchor your score for another. Be critical: 3 is average, reserve 5 for genuinely "
        "excellent, specific work.\n\n" + "\n\n---\n\n".join(briefs_text)
    )
    settings = get_settings()
    response = client.messages.create(
        model=settings.llm_model,
        # Bumped from 2048: seven scored dimensions plus a critique per
        # profile, across a 5-profile panel, needs more room than the
        # original three-dimension schema did.
        max_tokens=4096,
        thinking={"type": "adaptive"},
        output_config={
            "effort": "low",
            "format": {"type": "json_schema", "schema": BATCH_JUDGE_SCHEMA},
        },
        messages=[{"role": "user", "content": prompt}],
    )
    text = next(b.text for b in response.content if b.type == "text")
    raw_scores = json.loads(text)["scores"]

    # Match by profile name (robust to the model reordering); fall back to
    # positional if a name doesn't match, rather than dropping a profile.
    by_name = {s["profile"]: s for s in raw_scores}
    results = []
    for i, (profile, _) in enumerate(items):
        raw = by_name.get(profile.name) or (raw_scores[i] if i < len(raw_scores) else None)
        if raw is None:
            results.append(
                {
                    **{dim: 1 for dim in _SCORE_DIMENSIONS},
                    "critique": "Judge response didn't include a score for this profile.",
                    "canon_issues": canon_counts[i],
                    "score": 1.0,
                }
            )
        else:
            results.append(_score_from_llm(raw, canon_counts[i]))
    return results
