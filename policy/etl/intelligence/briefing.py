"""Grounded, citation-backed company briefing.

Each retrieved passage is handed to Claude as a ``document`` block with the
native Citations feature enabled. Claude's answer comes back split into text
blocks where every cited span carries a ``citations`` array pointing at the
exact source document (by index) and the exact ``cited_text``. We map that
index back to the passage's real-world provenance (CELEX, URL, char offsets),
so every claim in the briefing traces to an official source — by construction,
not by asking the model nicely.

Everything here is pure except ``generate_briefing``'s optional API call, so
retrieval + request assembly + citation parsing are all testable without a key.
"""

from __future__ import annotations

import datetime as dt
import re
import time
from collections import Counter
from collections.abc import Callable
from typing import Any

import structlog
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from data.config import get_settings
from data.models import Actor, ActorRole, DocumentActor, Enrichment, Source
from etl.adapters.eurlex_key_acts import KEY_ACTS
from etl.enrichment import (
    Embedder,
    Reranker,
    canon_passages,
    document_passages,
    get_reranker,
    press_passages,
    rerank_passages,
    semantic_search,
)

from .llm import reasoning_params
from .parsing import (
    _MARKER_RE,
    _canon_issues,
    _raw_text,
    _sort_compliance_table,
    extract_hinges,
    parse_response,
    prio_verdict_issues,
)
from .profile import CompanyProfile
from .prompts import FIX_INSTRUCTION, REVISE_INSTRUCTION, SYSTEM_PROMPT

log = structlog.get_logger(__name__)

# The foundational-act canon (GDPR, DMA, DSA, AI Act, CRA, NIS2...) — every
# brief gets one guaranteed passage per act so the Compliance exposure table
# can render an explicit, grounded verdict for each, not just whichever acts
# happen to win open semantic search against the company's own language.
_CANON_CELEX = list(KEY_ACTS)

# --- Retrieval shape ------------------------------------------------------
# These four constants together decide whether a brief can be specific.
#
# The failure they exist to prevent, measured live 2026-07-27 on a fintech/AI
# profile: 66 passages retrieved across 65 distinct documents — one window of
# each of 65 laws, 82k chars of context, and no instrument represented deeply
# enough to say anything concrete about. 55 of those 66 were the canon sweep,
# i.e. 83% of context was spent on breadth nobody chose. A brief built on that
# can name instruments and little else, which is exactly the "surface level"
# complaint. The fix is a budget split explicitly between breadth and depth
# instead of one that only ever bought breadth.

# Per-facet breadth pass: how many passages each facet query contributes, and
# how many documents any one facet may speak through. Small on purpose —
# breadth's job here is only to nominate the instruments worth deepening.
_FACET_K = 5
_FACET_MAX_PER_DOC = 2

# Two guards were removed from this path on 2026-07-28 after measuring how many
# passages each one actually removed across the panel: a global per-document cap
# on the merged breadth set, and a per-document cap on the press results. Both
# removed **zero**. They were not wrong, just redundant — `_select_breadth_first`
# (79 passages removed) already spreads breadth across documents, and
# press_passages' own MMR reranking already makes near-duplicates unattractive
# before a cap over its 5 results could matter.
#
# The general lesson, since this path accumulated three overlapping guards for
# one concern: prefer measuring to guarding. `retrieval_stats` now reports
# `max_passages_per_document`, so if the structural case a speculative cap was
# insuring against ever materialises it shows up as a number rather than being
# silently prevented — and a guard that never fires is indistinguishable from one
# that is broken.

# Depth pass: the top instruments from breadth get re-retrieved within
# themselves (see document_passages). This is where the context budget freed
# by _CANON_STUB_CHARS goes.
_DEEPEN_DOCUMENTS = 10
_DEEPEN_PER_DOCUMENT = 4

# Cosine floor on the legal path. press_passages has had a floor since it was
# written; semantic_search's brief-path callers never passed one, so a brief
# always got k passages whether or not anything relevant existed. 0.40 sits
# below the observed live median (0.53) and just under the observed weakest
# match (0.345) — it removes clear noise without pretending to know where
# "relevant" starts. Tighten it against real output, not intuition.
_LEGAL_MIN_SCORE = 0.40

# Per-facet overrides of (min_score, k). A facet whose corpus is large and whose
# usefulness is conditional needs a higher bar than the general legal path.
#
# `enforcement` is exactly that. Case law went from 197 to 1,440 documents in one
# backfill, and unlike a regulation — which either applies to a company or does
# not — a ruling is only worth context if it bears on a provision the brief is
# actually giving a verdict on. A judgment about telecoms interconnection fees is
# a perfectly good semantic match for "Court of Justice ruling on obligations"
# and completely useless in a fintech brief. At the general 0.40 floor the facet
# would reliably find *something* for every profile, which is the failure mode:
# case law that is present but not pertinent, competing for the depth budget
# against binding text the company genuinely is subject to.
#
# 0.55 is deliberately above the observed corpus median (~0.53): the facet
# should return nothing at all for a profile with no relevant precedent rather
# than return its best weak match. k=3 caps the ceiling for the same reason.
# Controlling this at nomination also controls the depth pass, since only
# nominated documents get deepened.
_FACET_OVERRIDES: dict[str, dict[str, float | int]] = {
    "enforcement": {"min_score": 0.55, "k": 3},
}

# The over-fetch pool handed to the reranker per facet. A cross-encoder can
# only promote what the bi-encoder already retrieved, so the pool has to be
# wider than the facet's own k for reranking to change anything at all.
_RERANK_POOL = 40

# A canon passage's job is to let the Compliance table state a grounded
# verdict — including "Out of Scope" — for every foundational act. That needs
# the act identified and its subject matter visible; it does not need a full
# ~1,500-char window, which is what made the canon sweep consume most of the
# context budget. Trimming to a leading excerpt keeps the guarantee (the act
# is still in context, still citable, still seen by _canon_issues) at roughly
# a quarter of the cost. Acts that breadth or depth retrieved on their own
# merit are never stubbed — they keep their full passages.
_CANON_STUB_CHARS = 350

# Sources deliberately barred from the Political-landscape pass, with the reason.
#
# Inclusion is by document_type (PRESS / NEWSLETTER / VERBATIM_DEBATE), which the
# adapters set at ingestion and `reclassify` fills in for stragglers — so a new
# press source is picked up automatically and cannot drift out of a hand-kept
# list. What type CANNOT express is editorial admissibility, which is why this
# blocklist exists rather than the 64-key allowlist it replaces.
#
# That allowlist conflated two different questions — "is this press?" (now the
# type system's job) and "is this source good enough?" (a judgment with earned
# reasons). Conflating them made exclusion invisible: a source absent from an
# allowlist is indistinguishable from one nobody added yet. Here it is a positive
# statement with a cause.
_PRESS_EXCLUDED_SOURCES = frozenset(
    {
        # Removed 2026-07-23. These Google News keyword feeds were a workaround
        # for outlets that were bot-blocked/paywalled at the time (Euractiv,
        # Politico, MLex); curated Politico + EU DG newsletter access now covers
        # that ground with real institutional voice instead of SEO-explainer
        # framing. Found live: gnews_eu_tech's dozens of near-identical "what is
        # the AI Act" explainer articles swept every press slot for any
        # AI-flavored profile on raw similarity, crowding out genuinely current
        # newsletter content that ranked only slightly lower. press_passages()'s
        # MMR reranking is the general fix; this is the surgical one for the
        # known cause. Still ingested — just not fed into brief generation.
        "gnews_eu_tech",
        "gnews_de_tech",
        "gnews_fr_tech",
        # Excluded 2026-07-21 — verified live that the feed's own <lastBuildDate>
        # is frozen at 17 Feb 2026 (external, server-side staleness, not our
        # adapter). Registered in feeds.py but dormant; drop this entry if the
        # feed ever recovers, no other change needed.
        "techcrunch_eu",
    }
)
_PRESS_RECENCY_DAYS = 90
# A weak press match becomes weak, generic-sounding narrative color in the
# brief (not just a slightly-off citation, as a weak legal-text match would
# be) — worth a floor here even without the calibration data to justify one
# for the main legal-text retrieval. 0.3 is a starting point, not an
# empirically-derived cutoff — real press scores observed so far run
# ~0.7-0.76 for genuinely on-topic matches; revisit once more runs exist.
_PRESS_MIN_SCORE = 0.3


# Human-readable label per document_type, used in the '[EU · Regulation]' prefix
# on every source block. Must stay in step with data.models.DocumentType — an
# unmapped type falls back to its raw slug, which is honest but ugly.
_DOCTYPE_LABELS = {
    "regulation": "Regulation",
    "judgment": "Judgment",
    "enforcement_decision": "Enforcement decision",
    "standard": "Harmonised standard",
    "opinion": "Opinion",
    "staff_working_doc": "Staff working document",
    "newsletter": "Newsletter",
    "verbatim_debate": "Verbatim debate",
    "budget": "Budget",
    "directive": "Directive",
    "decision": "Decision",
    "proposal": "Proposal",
    "consultation": "Consultation",
    "communication": "Communication",
    "press": "Press",
    "guideline": "Guideline",
    "other": "Other",
}


def _source_label(jurisdiction: str | None, document_type: str | None) -> str:
    """'[EU · Regulation]'-style prefix, or '' if we don't know either field —
    lets Claude weigh binding law against press/commentary instead of having
    to infer source authority from text alone.

    Verbatim debates used to need a special case here, keyed on
    ``extra["kind"] == "verbatim_debate"``, because document_type could only say
    OTHER and a named politician's floor remarks must not read as a press
    summary. ``DocumentType.VERBATIM_DEBATE`` now says it directly, so the
    special case is gone and _DOCTYPE_LABELS carries the label like every other
    type — one fewer place where the same fact was encoded twice (all 129
    verbatim documents carried both, verified).
    """
    if not jurisdiction and not document_type:
        return ""
    juris = jurisdiction or "?"
    dtype = _DOCTYPE_LABELS.get(document_type or "", document_type or "?")
    return f"[{juris} · {dtype}]"


def build_documents(passages: list[dict]) -> list[dict]:
    """One Citations-enabled ``document`` block per retrieved passage. The block
    order defines the ``document_index`` Claude cites back.

    A passage carrying ``summary`` (from the ``enrichments`` table, attached by
    ``_attach_summaries``) gets a one-line whole-instrument header above its own
    text. Retrieval hands the model a ~1,500-char window of an act; that window
    is enough to quote a provision and not enough to know what the instrument
    *is*, which is how a brief ends up quoting Article 12 of something it can't
    characterise. The header closes that gap for a few hundred characters.

    Deliberately emitted only on a document's FIRST block: the depth pass puts
    4-6 passages of the same act in context, and repeating one summary five
    times would spend the context this is meant to use well.
    """
    docs = []
    summarised: set[str] = set()
    for p in passages:
        label = p.get("celex") or p.get("title") or "source"
        prefix = _source_label(p.get("jurisdiction"), p.get("document_type"))
        title = f"{prefix} {label}" if prefix else str(label)
        body = p["text"]
        summary = p.get("summary")
        doc_key = _doc_key(p)
        if summary and doc_key not in summarised:
            summarised.add(doc_key)
            body = f"[What this instrument does: {summary}]\n\n{body}"
        docs.append(
            {
                "type": "document",
                "title": title,
                "source": {"type": "text", "media_type": "text/plain", "data": body},
                "citations": {"enabled": True},
            }
        )
    # generate_briefing sends this same passage set in every one of its up to
    # 5 sequential calls (draft, revise, citation-retry, canon-fix) — a cache
    # breakpoint on the last document lets every call after the first reuse
    # the already-processed prefix instead of reprocessing it cold.
    if docs:
        docs[-1] = {**docs[-1], "cache_control": {"type": "ephemeral"}}
    return docs


def build_request(
    profile: CompanyProfile, passages: list[dict], stakeholder_block: str | None = None
) -> dict[str, Any]:
    """Assemble the full messages.create(**kwargs) payload (no API call).

    ``stakeholder_block`` (see build_stakeholder_block) is appended as plain text
    after the Citations documents, not as a document block: it is a roster
    assembled from the corpus, not a quotable source span, and giving it a
    document block would invite citation markers pointing at something that has
    no char offsets to cite.
    """
    scoping = "\n".join(f"- {line}" for line in profile.scoping_lines())
    instruction = (
        # Without this, TRANSITIONAL APPLICABILITY's whole "has the
        # successor's application date arrived yet" check has no anchor —
        # the model's only fallback would be its training cutoff, which is
        # always wrong (always too early) for every brief generated after
        # that cutoff. Found live 2026-07-21: never injected anywhere.
        f"Today's date is {dt.date.today().isoformat()}.\n"
        f"Company: {profile.name}\n"
        f"Profile: {profile.description or '(none provided)'}\n"
        f"Sectors: {', '.join(profile.sectors) or '(unspecified)'}\n"
        f"Markets: {', '.join(m.value for m in profile.markets)}\n"
        f"Uses AI: {profile.uses_ai} | Handles personal data: {profile.handles_personal_data}\n"
        + (f"Scoping facts:\n{scoping}\n" if scoping else "")
        + "\nWrite the regulatory intelligence brief per your instructions: a decisive "
        "verdict on every instrument judged against these scoping facts, expert "
        "political context, and concrete owned actions. Cite sources throughout."
    )
    content = build_documents(passages)
    if stakeholder_block:
        content = content + [{"type": "text", "text": stakeholder_block}]
    content = content + [{"type": "text", "text": instruction}]
    return {
        # "medium", not the effort default: Sonnet 5 defaults to "high" when
        # unset — the same latency trap as the Sonnet 4.5->4.6 migration. This
        # is content generation against retrieved sources, not open-ended
        # agentic reasoning; "medium" cuts wall-clock sharply with no observed
        # quality loss on this task. See reasoning_params for what the level
        # translates into on a model that has no effort parameter.
        **reasoning_params("medium"),
        "system": SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": content}],
    }


def build_revise_request(
    passages: list[dict], draft: str, canon_issues: list[str] | None = None
) -> dict[str, Any]:
    """Second-pass request: same documents (so citation indices stay valid),
    the model's own first draft, and an instruction to self-critique against
    the sharpness checklist before returning a final version. No profile
    needed — the draft already opens with the company name and every fact
    it needs to check itself against is in the documents + draft.

    ``canon_issues``, when the deterministic canon check already found
    problems on the draft (see _canon_issues), folds their correction into
    this same mandatory revise call instead of paying for a dedicated fix
    call afterward — generate_briefing still re-checks and falls back to a
    dedicated call if problems remain, but that becomes the rare case."""
    content = build_documents(passages) + [
        {"type": "text", "text": f"YOUR DRAFT:\n\n{draft}"},
        {"type": "text", "text": REVISE_INSTRUCTION},
    ]
    if canon_issues:
        numbered = "\n".join(f"{i + 1}. {issue}" for i, issue in enumerate(canon_issues))
        content.append(
            {
                "type": "text",
                "text": (
                    "A mechanical cross-check of your draft's tables against the retrieved "
                    "documents also found the specific problems listed below — fix these as "
                    "part of this same revision, in addition to the sharpness checklist "
                    "above. Fix ONLY these listed problems, applying your own judgment for "
                    "any verdict or substance a fix requires; do not change any other row, "
                    "verdict, fact or wording beyond what the checklist above and these "
                    f"fixes require.\n\nProblems found:\n{numbered}"
                ),
            }
        )
    return {
        # Lower than the draft pass: this is a checklist self-edit over text
        # the model already wrote, not fresh synthesis — "low" is enough
        # thinking depth to catch the sharpness/citation-hygiene violations
        # and meaningfully cuts the second call's latency.
        **reasoning_params("low"),
        "system": SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": content}],
    }


# --- Deterministic canon consistency check -----------------------------------
#
# Live testing showed the model occasionally freelancing on instrument
# identity: a table row naming a real-but-different act than the one its
# CELEX number denotes ("Green Claims Directive (2024/825)" where 2024/825 is
# the ECGT), or silently dropping a canon act from both tables. Prompt rules
# reduced but did not eliminate this. The check below is deliberately
# judgment-free: it verifies SPELLING (does the row's name match the retrieved
# document's own canonical name for that number?) and COMPLETENESS (does every
# canon act in context appear in one of the two tables?), and hands any
# violations back to the MODEL to correct — verdicts, priorities and substance
# are never touched by code.


# Answers the competitive-context question invites when there is nothing to
# report — no second retrieval pass for these.
_NO_COMPETITOR = re.compile(r"^(no|none|nope|n/?a|nothing|not really)\b", re.IGNORECASE)


def _competitive_query(profile: CompanyProfile) -> str | None:
    """A dedicated retrieval query for the profile's competitive context, or
    None when the answer is absent or a plain 'no'."""
    answer = (profile.answers.get("competitive_context") or "").strip()
    if len(answer) < 15 or _NO_COMPETITOR.match(answer):
        return None
    return (
        f"{answer} — regulatory or antitrust enforcement, investigations, "
        "platform obligations, or rule changes affecting this competitor or "
        "market dynamic"
    )


def _merge_passages(primary: list[dict], extra: list[dict]) -> list[dict]:
    """Append extra passages, dropping any already present (same source span)."""
    seen = {(p.get("url"), p.get("char_start")) for p in primary}
    merged = list(primary)
    for p in extra:
        key = (p.get("url"), p.get("char_start"))
        if key not in seen:
            seen.add(key)
            merged.append(p)
    return merged


def _cap_per_document(passages: list[dict], *, max_per_doc: int = 3) -> list[dict]:
    """Keep at most ``max_per_doc`` passages per source document, preserving
    order (semantic_search returns best-first, so the kept ones are the best).

    Observed live (idealo, 2026-07-07): one large, freshly-ingested document
    — the DMA review Staff Working Document — won a big share of the open
    top-k on raw similarity, crowding the company's own compliance files out
    of context and tilting the whole report toward that one dossier.
    Retrieval volume reflects what the corpus happens to hold, not relevance
    breadth; capping per document restores breadth without touching how any
    passage is used downstream."""
    counts: dict[str, int] = {}
    kept = []
    for p in passages:
        key = str(p.get("celex") or p.get("url") or p.get("title"))
        counts[key] = counts.get(key, 0) + 1
        if counts[key] <= max_per_doc:
            kept.append(p)
    return kept


def _cap_per_source(passages: list[dict], *, max_per_source: int = 2) -> list[dict]:
    """Keep at most ``max_per_source`` passages per Source.key, preserving
    order — a backstop alongside press_passages()'s own MMR reranking, not
    a replacement for it: MMR already discourages near-duplicate content
    from monopolizing the result, but nothing guarantees it in the way a
    hard cap does, and this is cheap insurance against whatever source
    someday accumulates the same kind of volume glut gnews_eu_tech did
    (removed 2026-07-23, see _PRESS_EXCLUDED_SOURCES) — a new Google News query
    feed, an unusually productive RSS source, anything. Passages with no
    ``source_key`` (semantic_search/canon_passages results, which don't set
    it) pass through uncapped."""
    counts: dict[str, int] = {}
    kept = []
    for p in passages:
        key = p.get("source_key")
        if key is None:
            kept.append(p)
            continue
        counts[key] = counts.get(key, 0) + 1
        if counts[key] <= max_per_source:
            kept.append(p)
    return kept


def _select_breadth_first(passages: list[dict], k: int) -> list[dict]:
    """Select up to k passages, round-robin across documents rather than a
    flat best-score truncation.

    _cap_per_document already bounds how many passages any one document can
    contribute — but a plain ``[:k]`` slice applied afterward can still
    re-concentrate on whichever 2-3 documents happen to rank highest on raw
    similarity: capping controls crowding within the pre-slice set, but
    doesn't survive a subsequent truncation by score alone. This restores
    what _cap_per_document's own docstring already claims — breadth up to
    k distinct documents, not just up to the cap."""
    groups: dict[str, list[dict]] = {}
    order: list[str] = []
    for p in passages:
        key = str(p.get("celex") or p.get("url") or p.get("title"))
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append(p)
    # Groups are already internally best-first (input is best-first); order
    # the groups themselves by their own best passage's score, descending.
    order.sort(key=lambda key: groups[key][0].get("score", 0.0), reverse=True)
    selected: list[dict] = []
    round_idx = 0
    while len(selected) < k:
        added_this_round = False
        for key in order:
            if round_idx < len(groups[key]):
                selected.append(groups[key][round_idx])
                added_this_round = True
                if len(selected) >= k:
                    break
        if not added_this_round:
            break
        round_idx += 1
    return selected


# Precedent document types, and the hardest ceiling on how much of a brief's
# context they may occupy.
#
# Neither the facet floor nor the depth quota can guarantee this, which is why it
# exists. Raising the `enforcement` facet's floor to 0.55 and giving precedent its
# own small depth share both helped and neither bound: measured 2026-07-27, a
# fintech profile still reached 21 judgment passages (32% of substantive context)
# because the *other* facets surface rulings too — "personal data processing
# obligations" is a genuinely good match for a data-protection judgment, at any
# floor. Case law arriving through five different doors cannot be limited at any
# one of them, so the cap is applied once, globally, to the assembled set.
_PRECEDENT_TYPES = frozenset({"judgment", "enforcement_decision"})
_MAX_PRECEDENT_PASSAGES = 6


def _cap_precedent(passages: list[dict], *, limit: int = _MAX_PRECEDENT_PASSAGES) -> list[dict]:
    """Keep at most ``limit`` precedent passages, the best-scoring ones, and all
    non-precedent passages untouched.

    A ruling earns context by construing a provision the brief is already ruling
    on — so a handful of strong ones is the whole value, and the eleventh adds
    reading cost rather than insight. Preserves input order so the caller's own
    ordering (and the citation indices built from it) is unaffected.
    """
    ranked = sorted(
        (p for p in passages if p.get("document_type") in _PRECEDENT_TYPES),
        key=lambda p: p.get("rerank_score", p.get("score", 0.0)) or 0.0,
        reverse=True,
    )
    keep = {id(p) for p in ranked[:limit]}
    return [p for p in passages if p.get("document_type") not in _PRECEDENT_TYPES or id(p) in keep]


def _doc_key(passage: dict) -> str:
    """The grouping key every per-document cap here already used, extracted so
    the depth pass groups passages exactly the way the caps do."""
    return str(passage.get("celex") or passage.get("url") or passage.get("title"))


# How the depth budget is split across kinds of document, as fractions of
# _DEEPEN_DOCUMENTS. Relevance alone picks the wrong documents to go deep on,
# and the measurement is unambiguous — first run of the depth pass
# (2026-07-27, fintech/AI profile) spent 37 of 64 substantive passages on
# Commission staff working documents, impact assessments and communications,
# and gave the AI Act and the GDPR exactly one passage each.
#
# That is not a ranking bug: an impact assessment about AI in consumer credit
# genuinely is topically closer to a company profile than the AI Act's own
# terse operative articles are, and both the embedder and the cross-encoder
# are right to say so. It is a mismatch between what "relevant" means to a
# retriever and what a compliance brief needs, and no amount of reranking
# fixes it, because the commentary really is more query-similar prose. The
# instrument that binds the company has to be prioritized over documents
# discussing it, so the split is stated explicitly instead of being an
# accident of what the corpus happens to contain.
#
# Commentary keeps a share rather than being excluded: impact assessments are
# where the Commission's own reasoning and quantified thresholds live, which
# is real brief material — it just cannot be most of the budget. Proposals
# get their own share because "what's changing" is half the product promise.
# Tiers use data/models.py's DocumentType values. Judgments sit in the binding
# tier: a ruling on what a provision requires is as decisive for a compliance
# verdict as the provision's own text, and often more so. Standards sit there
# too — they confer presumption of conformity, which is the practical test a
# manufacturer is actually measured against. Budget instruments are binding but
# deliberately excluded: discharge decisions would compete for depth slots
# against regulation the company is genuinely subject to.
_DEEPEN_QUOTAS: tuple[tuple[str, frozenset[str], float], ...] = (
    (
        "binding",
        frozenset({"regulation", "directive", "decision", "standard"}),
        0.55,
    ),
    # Case law gets its own small share rather than sitting in the binding tier.
    # Judgments were originally put in `binding` on the reasoning that a ruling
    # on what a provision requires is as decisive as the provision's text — true,
    # but it conflates authority with relevance. A regulation either applies to a
    # company or does not; a ruling only matters if it construes a provision the
    # brief is already giving a verdict on. Sharing the binding quota let the
    # depth pass amplify 5 nominated rulings into 20 passages — 31% of a
    # fintech profile's substantive context, measured 2026-07-27. A small
    # dedicated share keeps precedent available where it is genuinely on point
    # (a no-AI, no-personal-data logistics profile correctly retrieves none)
    # without letting it crowd out the binding text the company is subject to.
    ("precedent", frozenset({"judgment", "enforcement_decision"}), 0.1),
    ("pipeline", frozenset({"proposal", "consultation", "opinion"}), 0.2),
    (
        "commentary",
        frozenset(
            {
                "communication",
                "guideline",
                "staff_working_doc",
                "press",
                "newsletter",
                "verbatim_debate",
                "budget",
                "other",
            }
        ),
        0.2,
    ),
)


def _top_document_ids(passages: list[dict], *, limit: int) -> list[int]:
    """The ``limit`` documents worth deepening, quota-split by authority (see
    _DEEPEN_QUOTAS) and ranked within each tier by that document's own best
    passage.

    Ranks documents, not passages: a document represented by one strong
    passage should outrank one represented by three mediocre ones, since the
    question being answered is "which instruments matter to this company",
    not "where is the densest cluster of text". A tier that can't fill its
    quota spills its unused slots to the best remaining candidates of any
    tier, so a thin corpus for one tier costs nothing rather than shrinking
    the depth pass."""
    best: dict[int, tuple[float, str]] = {}
    for p in passages:
        doc_id = p.get("document_id")
        if doc_id is None:
            continue
        score = p.get("rerank_score", p.get("score", 0.0)) or 0.0
        dtype = (p.get("document_type") or "other").lower()
        if doc_id not in best or score > best[doc_id][0]:
            best[doc_id] = (score, dtype)

    tiers: dict[str, list[tuple[float, int]]] = {name: [] for name, _, _ in _DEEPEN_QUOTAS}
    for doc_id, (score, dtype) in best.items():
        tier = next((name for name, types, _ in _DEEPEN_QUOTAS if dtype in types), "commentary")
        tiers[tier].append((score, doc_id))
    for candidates in tiers.values():
        candidates.sort(reverse=True)

    selected: list[int] = []
    for name, _, share in _DEEPEN_QUOTAS:
        quota = max(1, round(limit * share))
        selected.extend(doc_id for _, doc_id in tiers[name][:quota])
    # Spill: fill any slots the quotas left unused with the best remaining
    # candidates regardless of tier, best-scoring first.
    if len(selected) < limit:
        taken = set(selected)
        spare = sorted(
            (entry for candidates in tiers.values() for entry in candidates), reverse=True
        )
        for _, doc_id in spare:
            if len(selected) >= limit:
                break
            if doc_id not in taken:
                selected.append(doc_id)
                taken.add(doc_id)
    return selected[:limit]


def _stub_canon_passages(canon: list[dict], substantive: list[dict]) -> list[dict]:
    """Trim canon passages to a short excerpt, dropping any whose instrument is
    already substantively in context.

    Two distinct jobs were being paid for with the same expensive unit. An act
    the company is genuinely exposed to needs its operative provisions quoted
    at length; an act it merely needs to be told it is OUT of scope of needs
    only to be identified and grounded. Charging both the same ~1,500 chars is
    what let 55 canon acts crowd out the depth the exposed ones needed.

    An act that breadth/depth retrieved on merit is skipped entirely here: it
    is already in context with full text, so re-adding a stub of it would
    duplicate the instrument without adding anything, while still counting
    against the budget. _canon_issues reads the CELEX off whichever passage
    carries it, so the table-completeness guarantee is unaffected either way.
    """
    present = {p.get("celex") for p in substantive if p.get("celex")}
    stubs: list[dict] = []
    for p in canon:
        if p.get("celex") in present:
            continue
        stubs.append({**p, "text": _excerpt(p["text"], _CANON_STUB_CHARS), "canon_stub": True})
    return stubs


def _excerpt(text: str, limit: int) -> str:
    """Leading ``limit`` chars, cut back to the last sentence boundary so the
    excerpt ends as a sentence rather than mid-clause. Citations quote spans of
    what we send, so a stub truncated mid-word invites a mangled quote."""
    if len(text) <= limit:
        return text
    head = text[:limit]
    cut = max(head.rfind(". "), head.rfind(".\n"), head.rfind("; "))
    # Only honor the boundary if it isn't so early that we'd throw away most
    # of the excerpt (common in legal text, where the first "." is an article
    # number like "Article 5." a handful of chars in).
    return head[: cut + 1] if cut >= limit // 2 else head.rstrip() + "…"


def _attach_summaries(session: Session, passages: list[dict]) -> list[dict]:
    """Attach each passage's document-level ``summary`` from the ``enrichments``
    table, where one exists.

    One query for the whole passage set, keyed on ``document_id``. Passages whose
    document has no enrichment are returned untouched, so this is a no-op on a
    corpus where the enrichment pass hasn't run — the brief degrades to exactly
    its previous behaviour rather than failing.
    """
    doc_ids = {p["document_id"] for p in passages if p.get("document_id") is not None}
    if not doc_ids:
        return passages
    rows = session.execute(
        select(Enrichment.document_id, Enrichment.summary).where(
            Enrichment.document_id.in_(doc_ids), Enrichment.summary.is_not(None)
        )
    ).all()
    by_doc = {doc_id: summary for doc_id, summary in rows}
    if not by_doc:
        return passages
    return [
        {**p, "summary": by_doc[p["document_id"]]} if p.get("document_id") in by_doc else p
        for p in passages
    ]


# How many named stakeholders reach the brief. Small on purpose: the failure this
# fixes is "no names at all", and the opposite failure — a wall of 40 MEPs who
# each spoke once — would be just as unusable and would spend context that binding
# text needs. Ranked by how much they engaged with the instruments already in
# scope, so the cut keeps the people most involved with this company's files.
_MAX_STAKEHOLDERS = 8


def _stakeholders(session: Session, passages: list[dict]) -> list[dict]:
    """Named actors linked to the documents already in context.

    Resolved from the passage set rather than retrieved independently: the
    question a brief needs answered is "who runs the files I am already
    discussing", and a separate retrieval pass would drag in people attached to
    instruments the company has nothing to do with.

    Actors are not passages and deliberately do not compete for passage slots —
    they are assembled into one short text block (see build_request), so adding
    them cannot displace binding law.
    """
    doc_ids = {p["document_id"] for p in passages if p.get("document_id") is not None}
    if not doc_ids:
        return []
    rows = session.execute(
        select(
            Actor.name,
            Actor.institution,
            Actor.political_group,
            DocumentActor.role,
            func.count(func.distinct(DocumentActor.document_id)).label("documents"),
        )
        .join(DocumentActor, DocumentActor.actor_id == Actor.id)
        .where(DocumentActor.document_id.in_(doc_ids))
        .group_by(Actor.name, Actor.institution, Actor.political_group, DocumentActor.role)
        # Rapporteurs first regardless of volume: holding the file is a stronger
        # claim to relevance than having spoken about it often.
        .order_by(
            case((DocumentActor.role == ActorRole.RAPPORTEUR, 0), else_=1),
            func.count(func.distinct(DocumentActor.document_id)).desc(),
        )
        .limit(_MAX_STAKEHOLDERS)
    ).all()
    return [
        {
            "name": name,
            "institution": institution,
            "political_group": group,
            "role": role.value if isinstance(role, ActorRole) else str(role),
            "documents": documents,
        }
        for name, institution, group, role, documents in rows
    ]


def build_stakeholder_block(stakeholders: list[dict]) -> str | None:
    """One compact text block naming the actors, or None when there are none.

    None matters: on a corpus with no actor data this returns nothing and the
    request is byte-identical to before, so the brief degrades to its previous
    behaviour rather than gaining an empty "Stakeholders:" heading that would
    invite the model to fill it from memory.
    """
    if not stakeholders:
        return None
    lines = [
        "NAMED STAKEHOLDERS on the instruments retrieved above, from this corpus's "
        "own record of who spoke on or holds these files:"
    ]
    for s in stakeholders:
        bits = [s["name"]]
        if s["institution"]:
            bits.append(s["institution"])
        if s["political_group"]:
            bits.append(s["political_group"])
        role = "rapporteur" if s["role"] == "rapporteur" else "spoke on the file"
        lines.append(f"- {' · '.join(bits)} — {role}, {s['documents']} document(s) in context")
    return "\n".join(lines)


def _retrieval_stats(passages: list[dict], facets: list[str]) -> dict[str, Any]:
    """Shape metrics for the passage set a brief was built on.

    This exists because the depth collapse above went unnoticed for as long as
    it did: nothing in the brief output or the logs said how many distinct
    documents context covered, or how much of it was canon filler versus
    passages something actually chose. ``documents_per_passage`` is the number
    to watch — as it approaches 1.0, every document is contributing exactly one
    passage and the brief cannot be anything but a list of names."""
    if not passages:
        return {"passages": 0, "documents": 0, "facets": facets}
    scores = [p["score"] for p in passages if p.get("score") is not None]
    reranked = [p["rerank_score"] for p in passages if p.get("rerank_score") is not None]
    stubs = sum(1 for p in passages if p.get("canon_stub"))
    docs = {_doc_key(p) for p in passages}
    ordered = sorted(scores)
    # Depth has to be measured over the substantive set only. Canon stubs are
    # ~50 single-passage documents included deliberately as a scope check, so
    # they drag the all-passage ratio toward 0.5 no matter how deep retrieval
    # actually is — which makes it useless as the collapse signal it was
    # introduced to be. Measured 2026-07-27: an all-passage ratio of 0.78 on a
    # profile whose substantive ratio was 0.54 with up to 5 passages per act.
    substantive = [p for p in passages if not p.get("canon_stub")]
    substantive_docs = {_doc_key(p) for p in substantive}
    return {
        "passages": len(passages),
        "documents": len(docs),
        # Kept for continuity, but read substantive_documents_per_passage.
        "documents_per_passage": round(len(docs) / len(passages), 3),
        # THE depth signal: 1.0 means every instrument the brief actually
        # reasons over contributed exactly one passage.
        "substantive_documents_per_passage": (
            round(len(substantive_docs) / len(substantive), 3) if substantive else None
        ),
        "max_passages_per_document": (
            max(Counter(_doc_key(p) for p in substantive).values()) if substantive else 0
        ),
        "canon_stubs": stubs,
        "substantive_passages": len(passages) - stubs,
        "context_chars": sum(len(p["text"]) for p in passages),
        "score_max": round(max(ordered), 3) if ordered else None,
        "score_median": round(ordered[len(ordered) // 2], 3) if ordered else None,
        "score_min": round(min(ordered), 3) if ordered else None,
        "reranked_passages": len(reranked),
        "facets": facets,
    }


#: Types whose individual titles are not what a reader wants to see. A press
#: headline is long, often in another language, and says nothing about *why* it
#: was retrieved; the outlet is the meaningful signal ("ARCEP", "Euractiv").
#: Instruments are the opposite — "AI Act · Art. 6" is exactly the useful unit.
_OUTLET_TYPES = frozenset({"press", "newsletter", "verbatim_debate"})


def _is_transient(exc: Exception) -> bool:
    """Whether a failed generation call is worth retrying.

    Overload (529) and rate-limit (429) are the ones that matter here: they arrive
    as an event inside the stream rather than as an HTTP error, so the SDK's own
    request-level retry never sees them. A 400 is permanent and must surface
    immediately rather than being retried three times at full cost.
    """
    text = str(exc).lower()
    if "overloaded" in text or "rate_limit" in text:
        return True
    status = getattr(getattr(exc, "response", None), "status_code", None) or getattr(
        exc, "status_code", None
    )
    return status in (429, 500, 502, 503, 504, 529)


def source_display_name(name: str) -> str:
    """A short, customer-facing outlet name from a Source.name.

    Source names are written for operators and carry a gloss: "ARCEP —
    communiqués de presse (telecoms/postal regulator)". On screen we want
    "ARCEP".

    The gloss is kept only for very short acronyms (≤3 characters), which are
    genuinely opaque — "AMF" tells a non-specialist nothing. Five-letter names
    like ARCEP or BEREC read fine inside a list already framed as regulatory
    coverage, and appending "(telecoms/postal regulator)" to every row would turn
    a glanceable list into prose.
    """
    base = re.sub(r"\s*\([^)]*\)\s*$", "", name).strip()
    gloss_match = re.search(r"\(([^)]*)\)\s*$", name)
    head = re.split(r"\s+[—–-]\s+", base)[0].strip() or base
    if len(head) <= 3 and gloss_match:
        return f"{head} ({gloss_match.group(1)})"
    return head


#: EU official titles are boilerplate-first: the instrument type and the issuing
#: institutions come before the subject, in caps, often 200+ characters. Shown raw
#: they read as noise ("COMMISSION STAFF WORKING DOCUMENT IMPACT ASSESSMENT
#: Accompanying the document…") and bury the one thing a reader wants. Observed
#: live 2026-07-30 in the customer-facing reading list.
_TITLE_BOILERPLATE = (
    (
        re.compile(r"^commission staff working document.*?impact assessment", re.I),
        "Commission impact assessment",
    ),
    (re.compile(r"^commission staff working document", re.I), "Commission staff analysis"),
    (re.compile(r"^report from the commission", re.I), "Commission report"),
    (re.compile(r"^communication from the commission", re.I), "Commission communication"),
    (
        re.compile(r"^opinion of the european (economic and social committee|committee)", re.I),
        "Committee opinion",
    ),
)

#: Strips the institutional preamble so "…OF THE EUROPEAN PARLIAMENT AND OF THE
#: COUNCIL on artificial intelligence" becomes "Regulation on artificial intelligence".
_PREAMBLE = re.compile(
    r"^(?:proposal for a\s+)?"
    r"(regulation|directive|decision|recommendation)\b"
    # The preamble parts appear in varying orders — "(EU) 2022/2555 of the European
    # Parliament and of the Council", "of the Council (EU) No 1234/2013" — so this
    # is a repeated alternation rather than a fixed sequence. A number left behind
    # ("Directive 2022/2555 of the European Parliament…") is what happens when one
    # of these is missing.
    r"(?:\s+of the european parliament(?:\s+and of the council)?"
    r"|\s+of the council"
    r"|\s+\(eu(?:ratom)?\)"
    r"|\s+no\.?"
    r"|\s+\d{4}/\d+"
    r"|\s+\d+/\d{4})*",
    re.I,
)


def readable_instrument_label(title: str, doc_type: str = "") -> str:
    """A short, human label for an instrument with no canonical short name.

    KEY_ACTS covers the famous ones ("AI Act"); everything else arrives with its
    full official title, which is written for a legal citation rather than for a
    person reading a progress list.
    """
    text = " ".join((title or "").split())
    if not text:
        return ""
    for pattern, replacement in _TITLE_BOILERPLATE:
        if pattern.search(text):
            return replacement
    # De-shout: official titles are frequently all-caps, which reads as an error.
    if sum(c.isupper() for c in text if c.isalpha()) > 0.7 * sum(c.isalpha() for c in text):
        text = text.capitalize()
    match = _PREAMBLE.match(text)
    if match:
        kind = match.group(1).capitalize()
        rest = text[match.end() :].lstrip(" ,–—-")
        # Keep only up to the first clause: EU titles chain "on X, amending Y,
        # repealing Z", and only the first names the subject.
        # ", amending X" and " and amending X" both occur. "establishing" is
        # deliberately absent: it usually introduces the subject itself
        # ("Regulation establishing a framework for…"), not a trailing clause.
        rest = re.split(r"(?:,\s*|\s+and\s+)(?:amending|repealing)\b", rest, maxsplit=1)[0]
        text = f"{kind} {rest}".strip() if rest else kind
    return text


def sources_digest(
    session: Session, passages: list[dict], *, instruments: int = 5, outlets: int = 3
) -> dict[str, Any]:
    """What this run is reading, shaped for display rather than for logs.

    Exists because retrieval already knows precisely which instruments came back
    and we throw that away at the UI layer, leaving the user to watch a named
    stage do nothing for 90 seconds. Naming real law is also the clearest possible
    signal that this isn't a chatbot guessing — see brief-ux-plan.md Phase B2.
    """
    named: list[dict[str, str]] = []
    outlet_names: list[str] = []
    outlet_items = 0
    seen_docs: set[str] = set()
    source_keys: set[str] = set()

    for p in passages:
        dtype = str(p.get("document_type") or "").lower()
        if dtype in _OUTLET_TYPES:
            outlet_items += 1
            if p.get("source_key"):
                source_keys.add(p["source_key"])
            continue
        key = _doc_key(p)
        if key in seen_docs:
            continue
        seen_docs.add(key)
        label = KEY_ACTS.get(p.get("celex") or "") or readable_instrument_label(
            p.get("title") or "", str(p.get("document_type") or "")
        )
        if not label:
            continue
        # Truncate on a word boundary: a mid-word cut reads as a rendering bug.
        if len(label) > 60:
            label = label[:57].rsplit(" ", 1)[0] + "…"
        named.append({"label": label, "detail": (p.get("heading") or "").strip()[:60]})

    if source_keys:
        rows = session.execute(
            select(Source.name).where(Source.key.in_(source_keys)).order_by(Source.name)
        ).all()
        outlet_names = sorted({source_display_name(r[0]) for r in rows})

    return {
        "instruments": named[:instruments],
        "instruments_total": len(seen_docs),
        "outlets": outlet_names[:outlets],
        "outlets_total": len(outlet_names),
        "outlet_items": outlet_items,
    }


def build_fix_request(passages: list[dict], draft: str, issues: list[str]) -> dict[str, Any]:
    """Targeted correction pass: same documents, the current report, and the
    deterministic check's findings. The check finds; the model fixes."""
    numbered = "\n".join(f"{i + 1}. {issue}" for i, issue in enumerate(issues))
    content = build_documents(passages) + [
        {"type": "text", "text": f"YOUR REPORT:\n\n{draft}"},
        {"type": "text", "text": FIX_INSTRUCTION.format(issues=numbered)},
    ]
    return {
        **reasoning_params("low"),
        "system": SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": content}],
    }


def generate_briefing(
    session: Session,
    embedder: Embedder,
    profile: CompanyProfile,
    *,
    k: int = 8,
    client: Any | None = None,
    dry_run: bool = False,
    sharpen: bool = True,
    on_stage: Callable[[str, str], None] | None = None,
    on_delta: Callable[[str], None] | None = None,
    on_sources: Callable[[dict], None] | None = None,
    reranker: Reranker | None = None,
) -> dict[str, Any]:
    """Retrieve relevant passages, then (unless dry_run) ask Claude for a grounded
    briefing. Returns the briefing, its citations, and the supporting passages.

    ``sharpen`` runs a second pass where the model critiques and rewrites its
    own first draft against the sentence-level sharpness checklist. One
    generation pass reliably leaves a few sentences that dodge a banned
    phrase's exact wording while keeping the same announcing structure (e.g.
    'the strategically decisive fact is' becomes 'the one instrument that
    matters is' — same template, different words); a model is much better at
    catching that pattern in a second look at its own text than in a single
    pass with instructions alone. Costs roughly 2x the tokens/latency of one
    pass — set False for draft/cheap runs.

    ``on_stage(stage_id, label)``, when given, is called synchronously right
    before each real unit of work the caller might want to surface as
    progress (retrieval, each LLM call). It fires only for work that actually
    happens — the citation-retry and canon-fix stages are conditional and are
    only announced when that call is genuinely about to be made, so a
    progress UI built on this never claims a step that didn't occur.

    ``on_delta(text)`` receives the report's text as the model writes it. The
    generation calls stream regardless of whether this is set — that is what makes
    output-token progress observable, and latency is ~entirely a function of output
    tokens (r=+1.00 at 93.6 tok/s, measured 2026-07-29), so it is also what makes an
    honest ETA possible. See project-management/brief-ux-plan.md.

    ``on_sources(digest)`` fires once, after retrieval, with what this run is about
    to reason over (see sources_digest) — named instruments and press outlets, for
    display rather than for logs.

    ``reranker`` defaults to the configured one (see get_reranker, which
    returns None when unavailable — reranking then degrades to embedding
    order). Pass one explicitly to pin behavior in tests.

    Retrieval shape metrics for the returned passage set are included as
    ``retrieval_stats`` — see _retrieval_stats for what to watch."""

    def _emit(stage: str, label: str) -> None:
        if on_stage is not None:
            on_stage(stage, label)

    def _generate(request: dict[str, Any], *, live: bool = False) -> Any:
        """One generation call, streamed, returning the final Message.

        Always streams, so there is one code path rather than a production path and
        an eval path that could drift — the eval harness has to exercise what
        production runs. ``live`` marks the calls whose text the user should watch
        appear (the draft and its revision); internal retries stream too but are not
        forwarded, because showing a discarded draft being rewritten would be
        confusing rather than transparent.
        """
        # Retried ONLY while nothing has been forwarded to the caller yet. A
        # transient 529 "Overloaded" arrives as an event inside the stream, which
        # the SDK's request-level retry does not cover — and it killed a real brief
        # on 2026-07-30 after ~40s. Once text has been shown, a retry would
        # duplicate or contradict what the user already read, so the error
        # surfaces instead. Same policy as etl/brief_eval/cost.py, which was
        # written for exactly this failure on the eval path.
        last_error: Exception | None = None
        for attempt in range(3):
            forwarded = False
            try:
                with client.messages.stream(**request) as stream:
                    if live and on_delta is not None:
                        for chunk in stream.text_stream:
                            forwarded = True
                            on_delta(chunk)
                    return stream.get_final_message()
            except Exception as exc:  # noqa: BLE001 - re-raised below when unsafe
                if forwarded or not _is_transient(exc) or attempt == 2:
                    raise
                last_error = exc
                log.warning("brief_stream_retry", attempt=attempt + 1, error=str(exc)[:200])
                time.sleep(2 * (attempt + 1))
        raise last_error  # unreachable; keeps the type checker honest

    _emit("retrieving", "Retrieving the sources that apply to your profile")
    query = profile.to_query()
    if reranker is None:
        reranker = get_reranker(get_settings())

    # --- Breadth: one small, sharply-queried pass per obligation facet ------
    # Each facet is retrieved separately and unioned rather than blended into
    # one query — see CompanyProfile.retrieval_queries() for why a single
    # concatenated profile string retrieves the centroid of a company instead
    # of any of its actual exposures. Per facet: over-fetch a rerank pool,
    # let the cross-encoder reorder it, then apply the existing per-document
    # cap and breadth-first selection to the reranked order.
    facets = profile.retrieval_queries()
    breadth: list[dict] = []
    for facet, facet_query in facets:
        override = _FACET_OVERRIDES.get(facet, {})
        min_score = float(override.get("min_score", _LEGAL_MIN_SCORE))
        facet_k = int(override.get("k", _FACET_K))
        pool = semantic_search(session, embedder, facet_query, k=_RERANK_POOL, min_score=min_score)
        # An overridden facet can legitimately return nothing — that is the
        # point of its higher floor, not a failure to route around.
        pool = rerank_passages(reranker, facet_query, pool, top_k=facet_k * 2)
        selected = _select_breadth_first(
            _cap_per_document(pool, max_per_doc=_FACET_MAX_PER_DOC), facet_k
        )
        breadth = _merge_passages(breadth, [{**p, "facet": facet} for p in selected])
    # The competitive angle gets its own retrieval pass: blended into the main
    # query it reliably loses to the profile's compliance signal (an AI-using
    # company's query retrieves AI Act content, and a named rival's antitrust
    # exposure never makes the top-k). A dedicated query guarantees the
    # dynamic a seat in the passage set; the prompt guardrails still decide
    # whether it's worth writing about.
    competitive_query = _competitive_query(profile)
    if competitive_query:
        extra = semantic_search(session, embedder, competitive_query, k=max(4, k // 3))
        breadth = _merge_passages(breadth, extra)

    # --- Depth: re-retrieve inside the instruments breadth nominated -------
    # The whole point of the split. Breadth deliberately flattens to ~1-2
    # passages per document so it can survey; that same flattening is what
    # makes a brief generic. Here the top instruments get several of their own
    # operative provisions into context instead of one arbitrary window.
    _emit("retrieving", "Reading the instruments that apply to you in depth")
    deepen_ids = _top_document_ids(breadth, limit=_DEEPEN_DOCUMENTS)
    deep = document_passages(session, embedder, query, deepen_ids, k_per_doc=_DEEPEN_PER_DOCUMENT)
    passages = _merge_passages(breadth, deep)

    # Guarantee every foundational act a seat in context (see canon_passages'
    # docstring) — this is what lets the Compliance table state "CRA — Out of
    # Scope" with a real citation instead of silently dropping the row. Acts
    # already retrieved on merit above keep their full text; the rest enter as
    # short scope-check stubs (see _stub_canon_passages) so the guarantee stops
    # consuming the budget depth needs.
    canon = canon_passages(session, embedder, query, _CANON_CELEX)
    passages = _merge_passages(passages, _stub_canon_passages(canon, passages))
    # Political landscape needs current context, which the retrieval above
    # can't supply — semantic_search/canon_passages are deliberately
    # recency-agnostic (legal text doesn't go stale) and never touch
    # press/political-narrative sources at all in practice: they don't rank
    # competitively against formal legal-text queries regardless of how
    # recent they are. This is a separate, capped pass so it can't crowd out
    # the legal grounding the rest of the brief depends on.
    press = _cap_per_source(
        press_passages(
            session,
            embedder,
            query,
            exclude_source_keys=_PRESS_EXCLUDED_SOURCES,
            days=_PRESS_RECENCY_DAYS,
            k=5,
            min_score=_PRESS_MIN_SCORE,
        ),
        max_per_source=2,
    )
    passages = _merge_passages(passages, press)
    # Hard ceiling on case law, applied once to the assembled set — see
    # _cap_precedent for why no per-facet or per-tier limit can guarantee it.
    passages = _cap_precedent(passages)
    # Whole-instrument context for each retrieved act (see _attach_summaries).
    # After all retrieval, so one query covers the final passage set.
    passages = _attach_summaries(session, passages)
    stakeholders = _stakeholders(session, passages)
    request = build_request(profile, passages, build_stakeholder_block(stakeholders))
    stats = _retrieval_stats(passages, [facet for facet, _ in facets])
    log.info("brief_retrieval", company=profile.name, **stats)
    if on_sources is not None and passages:
        on_sources(sources_digest(session, passages))

    if dry_run or not passages:
        return {
            "query": query,
            "passages": passages,
            "request": request,
            "briefing": None,
            "retrieval_stats": stats,
        }

    if client is None:
        from .llm import get_client

        client = get_client()

    def _one_pass() -> dict[str, Any]:
        _emit("drafting", "Drafting the report")
        draft_resp = _generate(request, live=True)
        if not sharpen:
            return parse_response(draft_resp.content, passages)

        draft_parsed = parse_response(draft_resp.content, passages)
        # Checking citations here, before the mandatory revise call, means a
        # citation-less draft gets retried on the draft alone (one call) —
        # not on the whole draft+revise pass, which used to be the only
        # retry point and doubled the cost of recovering from this. The
        # post-revise safety net below still runs as a second-chance
        # fallback for the rarer case where revise itself drops citations
        # that were present in the draft.
        if not draft_parsed["citations"] and passages:
            _emit("verifying", "First pass came back without traceable citations — retrying")
            retry_resp = _generate(request)
            retry_parsed = parse_response(retry_resp.content, passages)
            if retry_parsed["citations"]:
                draft_resp, draft_parsed = retry_resp, retry_parsed

        # Canon issues checked on the draft, before revise, so the fix rides
        # along in the same mandatory revise call instead of paying for a
        # dedicated correction call afterward (see build_revise_request).
        draft_text = _raw_text(draft_resp.content)
        pre_issues = _canon_issues(draft_parsed["briefing"], passages) + prio_verdict_issues(
            draft_parsed["briefing"]
        )
        _emit("sharpening", "Sharpening the analysis against our style and accuracy checklist")
        revise_request = build_revise_request(passages, draft_text, pre_issues or None)
        revise_resp = _generate(revise_request, live=True)
        revised = parse_response(revise_resp.content, passages)

        # Measured on real runs: the draft having citations is no guarantee
        # revise's own rewrite keeps them — rephrasing during the sharpness
        # pass is exactly what can shift wording away from a retrieved span's
        # exact text. When that happens, the draft already proved the content
        # is citable, so retrying revise alone (same draft, same instructions)
        # recovers it for one call — far cheaper than the outer safety net
        # below re-running the whole draft+revise pass from scratch, which is
        # the right escalation only when the draft itself lacked citations.
        if not revised["citations"] and draft_parsed["citations"]:
            _emit("verifying", "The revised draft lost its citation links — reattaching them")
            retry_revise_resp = _generate(revise_request)
            retry_revised = parse_response(retry_revise_resp.content, passages)
            if retry_revised["citations"]:
                revised = retry_revised

        return revised

    parsed = _one_pass()
    # Native citations depend on the model's own phrasing landing close
    # enough to a retrieved span for the API to match it — stochastic, and
    # rare but real: a whole response can come back with zero matched
    # citations despite genuinely source-grounded content, which silently
    # reads as a solid report unless you check. That defeats the tool's core
    # premise (every claim traces to a source), so one retry on an empty
    # citation list is worth the extra call; if it recurs, surface what we
    # have rather than loop indefinitely.
    if not parsed["citations"] and passages:
        retry = _one_pass()
        if retry["citations"]:
            parsed = retry
    # Deterministic canon check (see _canon_issues): mislabeled instrument
    # rows or missing canon acts get one targeted correction call — the check
    # finds, the model fixes. Anything still unresolved is surfaced as
    # canon_notes instead of silently shipped.
    issues = _canon_issues(parsed["briefing"], passages) + prio_verdict_issues(parsed["briefing"])
    if issues:
        _emit("cross-checking", "Cross-checking the regulatory register for consistency")
        draft = _MARKER_RE.sub("", parsed["briefing"])
        fixed_resp = _generate(build_fix_request(passages, draft, issues), live=True)
        fixed = parse_response(fixed_resp.content, passages)
        if fixed["citations"]:
            remaining = _canon_issues(fixed["briefing"], passages)
            if len(remaining) < len(issues):
                parsed, issues = fixed, remaining
    parsed["briefing"] = _sort_compliance_table(parsed["briefing"])
    return {
        "query": query,
        "passages": passages,
        "canon_notes": issues,
        "retrieval_stats": stats,
        # Structured record of the hinges this brief could not resolve — the
        # input to the follow-up-question audit (see extract_hinges).
        "unresolved_hinges": extract_hinges(parsed["briefing"]),
        **parsed,
    }
