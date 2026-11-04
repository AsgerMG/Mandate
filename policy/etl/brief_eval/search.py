"""The candidate search loop.

Round 0 is a baseline: run the fixed panel under the current, real
SYSTEM_PROMPT. Each round after that: ask Sonnet for exactly one small,
targeted edit addressing the panel's single worst weakness, test it against
the same panel, and keep it only if the aggregate score improves without
regressing any individual profile beyond tolerance.

Runs entirely in-process and read-only against the corpus. A candidate is
tested by temporarily swapping etl.intelligence.briefing.SYSTEM_PROMPT for
the duration of one panel run and restoring it in a `finally` block —
briefing.py's own code is never modified, nothing here writes to the
database, and nothing is ever committed. The result is a report; applying a
winning candidate for real is a separate, human decision.
"""

from __future__ import annotations

import difflib
import time
from collections.abc import Callable
from typing import Any

import structlog

from data import get_settings, session_scope
from etl.enrichment import get_embedder
from etl.intelligence import briefing as briefing_module
from etl.intelligence.llm import get_client, has_api_key, reasoning_params

from .cost import BudgetExceeded, BudgetGuard, MeteredClient
from .judge import _SCORE_DIMENSIONS, judge_panel
from .panel import EVAL_PANEL
from .recency import recency_coverage

log = structlog.get_logger(__name__)

# Rough character-level similarity floor for a candidate prompt against the
# current best — exists only to catch "the model rewrote the whole prompt"
# rather than "the model made one targeted edit". Not a semantic judgment.
_MIN_SIMILARITY = 0.85
# A candidate must beat the current best by at least this much on the
# aggregate score, and not regress any single profile's score by more than
# this, to be accepted. Small margins are noise on a 3-profile panel scored
# by one batched LLM judge call — this isn't a statistically powered test.
_MIN_IMPROVEMENT = 0.1
_MAX_REGRESSION = 0.3

CANDIDATE_SCHEMA = {
    "type": "object",
    "properties": {
        "rationale": {
            "type": "string",
            "description": "One sentence: the specific weakness this edit targets.",
        },
        "new_system_prompt": {
            "type": "string",
            "description": (
                "The FULL replacement system prompt, with the smallest possible "
                "targeted edit applied. Copy every other sentence verbatim — do "
                "not rephrase, reorder, or otherwise 'clean up' anything you "
                "were not specifically asked to change."
            ),
        },
    },
    "required": ["rationale", "new_system_prompt"],
    "additionalProperties": False,
}


def _dimension_means(profile_results: list[dict]) -> dict[str, float]:
    """Mean of each judge dimension (plus canon_issues) across the panel —
    the aggregate `score` blends these into one number, but a candidate can
    trade one dimension for another (e.g. sharper tone, weaker citations)
    invisibly if only the blend is ever reported."""
    if not profile_results:
        return {}
    keys = [*_SCORE_DIMENSIONS, "canon_issues"]
    return {
        key: round(sum(r["judge"][key] for r in profile_results) / len(profile_results), 3)
        for key in keys
    }


def _run_panel(
    session,
    embedder,
    client,
    budget,
    on_progress: Callable[[str], None] | None = None,
    sharpen: bool = False,
) -> dict[str, Any]:
    start = time.perf_counter()
    generated: list[tuple[Any, dict]] = []
    all_retrieved_celex: set[str] = set()
    for i, profile in enumerate(EVAL_PANEL, start=1):
        budget.set_context("generation")
        # sharpen=False (the default) skips the self-critique revise call —
        # cheap comparative signal between candidates during exploration, at
        # the cost of not being a fair test of production's real two-pass
        # output. run_search() re-tests any accepted candidate with
        # sharpen=True before reporting it as a real recommendation — see
        # the confirmation step at the end of run_search().
        result = briefing_module.generate_briefing(
            session,
            embedder,
            profile,
            client=client,
            dry_run=not has_api_key(),
            sharpen=sharpen,
        )
        all_retrieved_celex |= {
            p.get("celex") for p in result.get("passages", []) if p.get("celex")
        }
        generated.append((profile, result))
        if on_progress:
            on_progress(
                f"  [{i}/{len(EVAL_PANEL)}] {profile.name}: generated "
                f"(spent so far: ${budget.spent_usd:.2f})"
            )

    budget.set_context("judge")
    # One call scores every profile in the panel — this is the main lever
    # that keeps the loop's total call count (and wall-clock time) down.
    scores = judge_panel(client, generated)
    # Keep the actual generated text and citations, not just the score — a
    # report with only numbers and a one-line critique isn't verifiable
    # against anything. This is what report.py's raw sidecar file dumps.
    profile_results = [
        {
            "profile": profile.name,
            "judge": score,
            "briefing": result.get("briefing"),
            "citations": result.get("citations", []),
        }
        for (profile, result), score in zip(generated, scores, strict=True)
    ]
    if on_progress:
        on_progress(
            f"  judged all {len(profile_results)} profiles in one call "
            f"(spent so far: ${budget.spent_usd:.2f})"
        )

    aggregate = (
        sum(r["judge"]["score"] for r in profile_results) / len(profile_results)
        if profile_results
        else 0.0
    )
    return {
        "profiles": profile_results,
        "aggregate": round(aggregate, 3),
        "dimension_means": _dimension_means(profile_results),
        "recency": recency_coverage(session, all_retrieved_celex),
        "elapsed_seconds": round(time.perf_counter() - start, 1),
    }


def _propose_candidate(client, current_prompt: str, worst_round: dict, budget) -> dict | None:
    budget.set_context("candidate")
    worst_profile = min(worst_round["profiles"], key=lambda r: r["judge"]["score"])
    total_canon_issues = sum(r["judge"]["canon_issues"] for r in worst_round["profiles"])
    context = (
        f"Aggregate panel score: {worst_round['aggregate']}/5. "
        f"Recency coverage (docs ingested in the last 30 days that showed up "
        f"in ANY panel profile's retrieved passages): {worst_round['recency']}. "
        f"Canon-consistency issues found across the panel this round: {total_canon_issues}. "
        f"Weakest profile ({worst_profile['profile']}) scored "
        f"{worst_profile['judge']['score']}/5 — critique: {worst_profile['judge']['critique']}"
    )
    prompt = (
        "You are tuning the system prompt for an automated regulatory-brief "
        "generator. Below is the current system prompt, followed by evaluation "
        "results from a fixed test panel of company profiles. Propose exactly "
        "ONE small, targeted edit that addresses the single most impactful "
        "weakness described in the evaluation — not a general rewrite.\n\n"
        f"=== CURRENT SYSTEM PROMPT ===\n{current_prompt}\n\n"
        f"=== EVALUATION RESULTS ===\n{context}"
    )
    response = client.messages.create(
        # Part of the harness, not the product — same reasoning as the judge.
        **reasoning_params(
            "medium",
            model=get_settings().eval_model,
            max_tokens=8000,
            output_format={"type": "json_schema", "schema": CANDIDATE_SCHEMA},
        ),
        messages=[{"role": "user", "content": prompt}],
    )
    import json

    text = next(b.text for b in response.content if b.type == "text")
    candidate = json.loads(text)
    similarity = difflib.SequenceMatcher(
        None, current_prompt, candidate["new_system_prompt"]
    ).ratio()
    if similarity < _MIN_SIMILARITY:
        log.warning("brief_eval_candidate_rejected_too_large", similarity=round(similarity, 3))
        return None
    # The profile the rationale was actually written against — report.py
    # anchors its before/after output diff on this profile by default,
    # rather than guessing from score deltas alone.
    candidate["targeted_profile"] = worst_profile["profile"]
    return candidate


def run_search(
    max_rounds: int = 3,
    budget_usd: float | None = None,
    on_progress: Callable[[str], None] | None = None,
) -> dict[str, Any]:
    """Entry point for `regina brief-improve`. Returns the full report as a
    dict — rendering to markdown is report.py's job. Never writes to the
    database, never modifies briefing.py, never commits anything.

    ``on_progress(line)``, when given, is called after each of the 6 panel
    profiles and after each round decision — this is a long-running,
    sequential-API-call process with no other way to observe it mid-run."""
    if not has_api_key():
        return {"error": "No ANTHROPIC_API_KEY set — nothing to test."}

    def _progress(line: str) -> None:
        if on_progress:
            on_progress(line)

    budget = BudgetGuard(max_usd=budget_usd)
    client = MeteredClient(get_client(), budget)
    embedder = get_embedder(get_settings())
    original_prompt = briefing_module.SYSTEM_PROMPT

    rounds: list[dict] = []
    stop_reason = "completed_all_rounds"
    with session_scope() as session:
        _progress("Round 0 (baseline):")
        try:
            baseline = _run_panel(session, embedder, client, budget, on_progress=_progress)
        except BudgetExceeded as exc:
            # The budget can run out mid-baseline too — this used to be
            # unguarded, so hitting it here crashed run_search() entirely
            # and threw away every dollar already spent with no report to
            # show for it. Return a minimal-but-real report instead: no
            # rounds ever ran, but the caller still gets the budget totals
            # and an honest reason why.
            _progress(f"  -> stopped mid-baseline: budget exhausted ({exc})\n")
            log.warning("brief_eval_stopped_on_budget", round=0, detail=str(exc))
            return {
                "baseline": None,
                "rounds": [],
                "winner": {
                    "changed": False,
                    "prompt": original_prompt,
                    "original_prompt": original_prompt,
                    "aggregate": None,
                    "improvement": None,
                },
                "budget": {
                    "spent_usd": round(budget.spent_usd, 4),
                    "cap_usd": budget.max_usd,
                    "calls": budget.calls,
                    "breakdown": {
                        ctx: {**b, "usd": round(b["usd"], 4)}
                        for ctx, b in budget.breakdown.items()
                    },
                },
                "stop_reason": "budget_exhausted_mid_baseline",
            }
        rounds.append({"round": 0, "candidate": None, "accepted": True, **baseline})
        _progress(f"  -> baseline aggregate: {baseline['aggregate']}/5\n")

        best_prompt = original_prompt
        best = baseline

        for round_num in range(1, max_rounds + 1):
            _progress(f"Round {round_num}:")
            try:
                candidate = _propose_candidate(client, best_prompt, best, budget)
                if candidate is None:
                    _progress("  -> candidate rejected (too large a change), skipping round\n")
                    rounds.append(
                        {
                            "round": round_num,
                            "candidate": None,
                            "accepted": False,
                            "reason": "rejected_too_large_a_change",
                        }
                    )
                    continue
                _progress(f"  proposed: {candidate['rationale']}")

                briefing_module.SYSTEM_PROMPT = candidate["new_system_prompt"]
                try:
                    trial = _run_panel(session, embedder, client, budget, on_progress=_progress)
                finally:
                    briefing_module.SYSTEM_PROMPT = best_prompt

            except BudgetExceeded as exc:
                _progress(f"  -> stopped: budget exhausted ({exc})\n")
                log.warning("brief_eval_stopped_on_budget", round=round_num, detail=str(exc))
                stop_reason = "budget_exhausted"
                rounds.append(
                    {
                        "round": round_num,
                        "candidate": None,
                        "accepted": False,
                        "reason": stop_reason,
                    }
                )
                break

            worst_delta = min(
                trial["profiles"][i]["judge"]["score"] - best["profiles"][i]["judge"]["score"]
                for i in range(min(len(trial["profiles"]), len(best["profiles"])))
            )
            improved = trial["aggregate"] - best["aggregate"] >= _MIN_IMPROVEMENT
            no_regression = worst_delta >= -_MAX_REGRESSION
            accepted = improved and no_regression

            rounds.append(
                {
                    "round": round_num,
                    "candidate": candidate,
                    "accepted": accepted,
                    "delta": round(trial["aggregate"] - best["aggregate"], 3),
                    "worst_profile_delta": round(worst_delta, 3),
                    **trial,
                }
            )
            delta_vs_best = trial["aggregate"] - best["aggregate"]
            _progress(
                f"  -> aggregate {trial['aggregate']}/5 ({delta_vs_best:+}), "
                f"{'ACCEPTED' if accepted else 'discarded'} "
                f"(spent so far: ${budget.spent_usd:.2f})\n"
            )
            if accepted:
                best_prompt = candidate["new_system_prompt"]
                best = trial

        confirmation = None
        if best_prompt != original_prompt:
            # Exploration runs sharpen=False throughout — cheap, but not a
            # fair test of what real /api/brief traffic actually produces
            # (which always runs the revise pass). Before reporting a
            # winner, re-test baseline vs. the winning candidate ONE more
            # time each, both with sharpen=True, so the reported
            # improvement is checked against the real production path —
            # this only fires when something was actually accepted, not on
            # every round.
            _progress("\nConfirming with sharpen=True (the real production path)...")
            # confirm_baseline/confirm_candidate are set as each side actually
            # completes — a failure on the candidate side (budget or a
            # transient error surviving retries) must not throw away the
            # baseline side's already-completed, already-paid-for result.
            # That happened live 2026-07-21: a $2.86 fully-finished
            # confirmation-baseline run was silently discarded because the
            # old code only ever saved confirmation as an all-or-nothing pair.
            confirm_baseline: dict[str, Any] | None = None
            confirm_candidate: dict[str, Any] | None = None
            try:
                _progress("  baseline:")
                confirm_baseline = _run_panel(
                    session, embedder, client, budget, on_progress=_progress, sharpen=True
                )
                briefing_module.SYSTEM_PROMPT = best_prompt
                try:
                    _progress("  winning candidate:")
                    confirm_candidate = _run_panel(
                        session, embedder, client, budget, on_progress=_progress, sharpen=True
                    )
                finally:
                    briefing_module.SYSTEM_PROMPT = original_prompt
                confirmed_delta = round(
                    confirm_candidate["aggregate"] - confirm_baseline["aggregate"], 3
                )
                confirmation = {
                    "baseline": confirm_baseline,
                    "candidate": confirm_candidate,
                    "improvement": confirmed_delta,
                    "holds_up": confirmed_delta >= _MIN_IMPROVEMENT,
                }
                _progress(
                    f"  -> confirmed delta {confirmed_delta:+} — "
                    f"{'HOLDS UP' if confirmation['holds_up'] else 'DOES NOT hold up'} "
                    f"under sharpen=True (spent so far: ${budget.spent_usd:.2f})\n"
                )
            except BudgetExceeded as exc:
                _progress(f"  -> confirmation skipped: budget exhausted ({exc})\n")
                confirmation = {
                    "skipped": True,
                    "reason": "budget_exhausted",
                    # Whichever side(s) actually finished before the failure —
                    # None if a side never started or never completed.
                    "baseline": confirm_baseline,
                    "candidate": confirm_candidate,
                }

    # Belt-and-suspenders: guarantee the module is never left mutated after
    # run_search() returns, regardless of which branch above ran last.
    briefing_module.SYSTEM_PROMPT = original_prompt

    return {
        "baseline": baseline,
        "rounds": rounds,
        "confirmation": confirmation,
        "winner": {
            "changed": best_prompt != original_prompt,
            "prompt": best_prompt,
            "original_prompt": original_prompt,
            "aggregate": best["aggregate"],
            "improvement": round(best["aggregate"] - baseline["aggregate"], 3),
        },
        "budget": {
            "spent_usd": round(budget.spent_usd, 4),
            "cap_usd": budget.max_usd,
            "calls": budget.calls,
            "breakdown": {
                ctx: {**b, "usd": round(b["usd"], 4)} for ctx, b in budget.breakdown.items()
            },
        },
        "stop_reason": stop_reason,
    }
