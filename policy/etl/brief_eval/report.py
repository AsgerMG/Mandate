"""Renders run_search()'s report dict to markdown — the human-review
artifact. Nothing here writes anywhere; the CLI command decides whether to
print it or save it to a file, and the human decides what to do with it."""

from __future__ import annotations

import difflib
import re
from typing import Any

_SECTION_HEADER_RE = re.compile(r"^## (.+)$", re.MULTILINE)
# Caps one section's rendered diff so a single runaway change (e.g. the
# model rewriting a whole section rather than editing it) can't swamp the
# report — the full text is always still in the JSON sidecar.
_MAX_DIFF_LINES_PER_SECTION = 40


def _split_named_sections(text: str) -> dict[str, str]:
    """Split a generated brief into its named ``## `` sections (Bottom line,
    Compliance exposure, Political landscape & strategic play, Appendix:
    Out of Scope Register). Four of the seven judge dimensions map almost
    1:1 onto these headers, so a section-scoped diff is both shorter and
    more interpretable than diffing a whole 700-1000 word brief line by
    line. Whatever headers are actually present, not a hardcoded four —
    tolerates the model varying section text slightly."""
    if not text:
        return {}
    matches = list(_SECTION_HEADER_RE.finditer(text))
    sections: dict[str, str] = {}
    for i, m in enumerate(matches):
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        sections[m.group(1).strip()] = text[start:end].strip()
    return sections


def _winning_round(report: dict[str, Any]) -> dict[str, Any] | None:
    """The round dict backing report['winner'] — round 0 (baseline) if
    nothing was accepted, otherwise the latest accepted round. Round 0 is
    always marked accepted (see search.py), so this is never None once at
    least the baseline completed."""
    accepted = [r for r in report.get("rounds", []) if r.get("accepted")]
    return accepted[-1] if accepted else None


def _pick_diff_profile(baseline_round: dict[str, Any], winning_round: dict[str, Any]) -> str | None:
    """Which profile's output to show a before/after diff for. Prefers the
    profile the winning candidate's rationale was actually written against
    (``targeted_profile``, set by search.py's _propose_candidate) — that
    ties the diff directly to the stated reason for the change. Falls back
    to the largest absolute score delta only when the targeted profile
    isn't resolvable on both sides; returns None (never raises) if there's
    no profile in common to diff at all."""
    baseline_by_name = {p["profile"]: p for p in baseline_round.get("profiles", [])}
    winner_by_name = {p["profile"]: p for p in winning_round.get("profiles", [])}
    common = set(baseline_by_name) & set(winner_by_name)
    if not common:
        return None
    targeted = (winning_round.get("candidate") or {}).get("targeted_profile")
    if targeted in common:
        return targeted
    return max(
        common,
        key=lambda name: abs(
            winner_by_name[name]["judge"]["score"] - baseline_by_name[name]["judge"]["score"]
        ),
    )


def _render_section_diff(before_text: str, after_text: str) -> str:
    """Unified-diff each named section independently; skip sections with no
    change; cap each section's diff at _MAX_DIFF_LINES_PER_SECTION lines."""
    before_sections = _split_named_sections(before_text)
    after_sections = _split_named_sections(after_text)
    names = list(dict.fromkeys([*before_sections, *after_sections]))
    blocks: list[str] = []
    for name in names:
        before = before_sections.get(name, "")
        after = after_sections.get(name, "")
        if before == after:
            continue
        diff_lines = list(
            difflib.unified_diff(
                before.splitlines(keepends=True),
                after.splitlines(keepends=True),
                fromfile=f"{name} (baseline)",
                tofile=f"{name} (candidate)",
            )
        )
        if not diff_lines:
            continue
        if len(diff_lines) > _MAX_DIFF_LINES_PER_SECTION:
            omitted = len(diff_lines) - _MAX_DIFF_LINES_PER_SECTION
            diff_lines = diff_lines[:_MAX_DIFF_LINES_PER_SECTION]
            diff_lines.append(
                f"... {omitted} more lines omitted — see the JSON sidecar for the full diff ...\n"
            )
        blocks.append(f"#### {name}\n\n```diff\n" + "".join(diff_lines).rstrip() + "\n```")
    return "\n\n".join(blocks)


def _round_diffs(report: dict[str, Any]) -> list[dict[str, Any]]:
    """A before/after diff for EVERY round that actually generated a
    candidate's output — accepted or not, and independent of whether the
    sharpen=True confirmation step ever ran. The automated accept/reject
    gate (_MIN_IMPROVEMENT/_MAX_REGRESSION in search.py) is a heuristic, not
    a verdict — a human reviewing the actual text may reasonably disagree
    with it, and currently has no way to even see a rejected candidate's
    output to check. Each round is diffed against whatever was the current
    best going INTO that round (mirroring run_search()'s own comparison
    basis), not always against round 0 — round 2's diff (in a multi-round
    run) is against round 1's winner if round 1 was accepted, or still
    against baseline if it wasn't."""
    rounds = report.get("rounds", [])
    if not rounds:
        return []
    diffs: list[dict[str, Any]] = []
    current_best = rounds[0]
    for r in rounds[1:]:
        if r.get("candidate") is None:
            continue  # rejected-too-large / budget-exhausted before any output existed to diff
        entry: dict[str, Any] = {
            "round": r["round"],
            "accepted": r.get("accepted", False),
            "rationale": r["candidate"].get("rationale", ""),
        }
        profile = _pick_diff_profile(current_best, r)
        if profile is None:
            entry["diff"] = None
        else:
            best_profiles = current_best.get("profiles", [])
            round_profiles = r.get("profiles", [])
            before = next((p["briefing"] for p in best_profiles if p["profile"] == profile), "")
            after = next((p["briefing"] for p in round_profiles if p["profile"] == profile), "")
            entry["profile"] = profile
            entry["diff"] = _render_section_diff(before or "", after or "")
        diffs.append(entry)
        if r.get("accepted"):
            current_best = r
    return diffs


def render_report(report: dict[str, Any]) -> str:
    if "error" in report:
        return f"# Brief self-improvement run\n\n{report['error']}\n"

    if report.get("stop_reason") == "budget_exhausted_mid_baseline":
        b = report["budget"]
        return (
            "# Brief self-improvement run\n\n"
            f"Ran out of budget (${b['spent_usd']:.2f} of ${b['cap_usd']:.2f}) before the "
            "baseline panel finished — no round completed, so there's no score or candidate "
            "to report. Re-run with a higher --budget if you want to see the baseline.\n"
        )

    lines: list[str] = []
    lines.append("# Brief self-improvement run")
    lines.append("")
    cap_usd = report["budget"]["cap_usd"]
    cap_label = f"${cap_usd:.2f} cap" if cap_usd is not None else "no cap"
    lines.append(
        f"Spent **${report['budget']['spent_usd']:.2f}** of a "
        f"{cap_label} across {report['budget']['calls']} calls. "
        f"Stopped: `{report['stop_reason']}`."
    )
    lines.append("")
    breakdown = report["budget"].get("breakdown") or {}
    if breakdown:
        lines.append("| Phase | Calls | $ | Input tok | Output tok | Cache read | Cache write |")
        lines.append("|---|---|---|---|---|---|---|")
        for ctx, b in breakdown.items():
            lines.append(
                f"| {ctx} | {b['calls']} | {b['usd']:.2f} | {b['input_tokens']} | "
                f"{b['output_tokens']} | {b['cache_read_tokens']} | {b['cache_write_tokens']} |"
            )
        lines.append("")

    lines.append("## Round-by-round")
    lines.append("")
    lines.append("| Round | Aggregate | Δ vs. prior best | Accepted | Elapsed | Note |")
    lines.append("|---|---|---|---|---|---|")
    for r in report["rounds"]:
        elapsed = f"{r['elapsed_seconds']:.1f}s" if "elapsed_seconds" in r else "—"
        if r["round"] == 0:
            lines.append(f"| 0 (baseline) | {r['aggregate']} | — | yes | {elapsed} | — |")
            continue
        if r["candidate"] is None:
            lines.append(f"| {r['round']} | — | — | no | {elapsed} | {r.get('reason', '')} |")
            continue
        note = r["candidate"]["rationale"]
        lines.append(
            f"| {r['round']} | {r['aggregate']} | {r['delta']:+} | "
            f"{'yes' if r['accepted'] else 'no'} | {elapsed} | {note} |"
        )
    lines.append("")

    winner = report["winner"]
    lines.append("## Outcome")
    lines.append("")
    if not winner["changed"]:
        lines.append(
            f"No candidate beat the baseline (aggregate {winner['aggregate']}/5) by enough "
            "to accept. No change proposed."
        )
    else:
        lines.append(
            f"During exploration (sharpen=False, cheap), the best candidate improved the "
            f"aggregate score from {report['baseline']['aggregate']} to {winner['aggregate']} "
            f"(+{winner['improvement']}). **This has NOT been applied anywhere** — it exists "
            "only as the diff below. See the confirmation section for whether this holds up "
            "under production's real two-pass path before deciding whether to apply it."
        )
        lines.append("")
        lines.append("### Proposed diff")
        lines.append("")
        lines.append("```diff")
        diff = difflib.unified_diff(
            winner["original_prompt"].splitlines(keepends=True),
            winner["prompt"].splitlines(keepends=True),
            fromfile="SYSTEM_PROMPT (current)",
            tofile="SYSTEM_PROMPT (proposed)",
        )
        lines.append("".join(diff).rstrip())
        lines.append("```")
    lines.append("")

    baseline_round = report["rounds"][0] if report.get("rounds") else None
    winning_round = _winning_round(report)

    lines.append("## Dimension breakdown")
    lines.append("")
    baseline_means = (baseline_round or {}).get("dimension_means") or {}
    if not baseline_means:
        lines.append("No baseline data available.")
    elif winning_round is baseline_round:
        lines.append("| Dimension | Baseline |")
        lines.append("|---|---|")
        for dim, val in baseline_means.items():
            lines.append(f"| {dim} | {val} |")
        lines.append("")
        lines.append(
            "_No candidate was accepted this run — nothing to compare the baseline against._"
        )
    else:
        winner_means = winning_round.get("dimension_means") or {}
        lines.append("| Dimension | Baseline | Winning candidate | Δ |")
        lines.append("|---|---|---|---|")
        for dim, base_val in baseline_means.items():
            win_val = winner_means.get(dim, base_val)
            lines.append(f"| {dim} | {base_val} | {win_val} | {win_val - base_val:+.3f} |")
    lines.append("")

    lines.append("## Output diff")
    lines.append("")
    lines.append(
        "Every round that actually generated a candidate's output, accepted or not — the "
        "automated accept/reject bar below is a heuristic, not a verdict; read the actual "
        "text and judge for yourself."
    )
    lines.append("")
    round_diffs = _round_diffs(report)
    if not round_diffs:
        lines.append(
            "No candidate produced output this run (rejected before generating, or budget "
            "ran out before any round completed)."
        )
    else:
        for d in round_diffs:
            verdict = "ACCEPTED" if d["accepted"] else "rejected"
            lines.append(f"### Round {d['round']} — {verdict}")
            lines.append("")
            lines.append(f"_{d['rationale']}_")
            lines.append("")
            if d["diff"] is None:
                lines.append("No profile in common with the prior best to diff.")
            else:
                lines.append(f"Representative before/after for **{d['profile']}**:")
                lines.append("")
                lines.append(d["diff"] or "_No section-level text changes detected._")
            lines.append("")

    confirmation = report.get("confirmation")
    if confirmation:
        lines.append("## Confirmation (sharpen=True — the real production path)")
        lines.append("")
        if confirmation.get("skipped"):
            lines.append(
                f"Skipped: {confirmation.get('reason')}. The exploration result above is "
                "**unconfirmed** — treat it as directional, not a verified recommendation."
            )
            partial_baseline = confirmation.get("baseline")
            partial_candidate = confirmation.get("candidate")
            if partial_baseline and not partial_candidate:
                lines.append("")
                lines.append(
                    "The baseline side of confirmation did finish (fully paid for, not "
                    "wasted) before the candidate side failed — its real "
                    f"`sharpen=True` aggregate: **{partial_baseline['aggregate']}/5**. Only "
                    "the candidate side is missing; a follow-up only needs to confirm that "
                    "half, not redo this one."
                )
            elif partial_baseline and partial_candidate:
                lines.append("")
                lines.append(
                    "Both sides of confirmation actually finished generating "
                    f"(baseline **{partial_baseline['aggregate']}/5**, candidate "
                    f"**{partial_candidate['aggregate']}/5**) — the run was cut off before "
                    "computing the final verdict, not before the data existed."
                )
        else:
            verdict = "HOLDS UP" if confirmation["holds_up"] else "DOES NOT hold up"
            lines.append(
                f"Re-tested baseline vs. the winning candidate one more time each, both with "
                f"`sharpen=True` (the mandatory revise pass real `/api/brief` traffic always "
                f"runs). Confirmed delta: **{confirmation['improvement']:+}** — **{verdict}**."
            )
            confirm_profile = _pick_diff_profile(
                confirmation["baseline"], confirmation["candidate"]
            )
            if confirm_profile is not None:
                confirm_before = next(
                    (
                        p["briefing"]
                        for p in confirmation["baseline"].get("profiles", [])
                        if p["profile"] == confirm_profile
                    ),
                    "",
                )
                confirm_after = next(
                    (
                        p["briefing"]
                        for p in confirmation["candidate"].get("profiles", [])
                        if p["profile"] == confirm_profile
                    ),
                    "",
                )
                lines.append("")
                lines.append(f"Same comparison under `sharpen=True`, for **{confirm_profile}**:")
                lines.append("")
                confirm_diff = _render_section_diff(confirm_before or "", confirm_after or "")
                lines.append(confirm_diff or "_No section-level text changes detected._")
            if not confirmation["holds_up"]:
                lines.append("")
                lines.append(
                    "The cheap exploration result above did not survive contact with the real "
                    "two-pass pipeline — likely means the improvement was compensating for "
                    "something `sharpen=False` skips, not a genuine SYSTEM_PROMPT fix. Do not "
                    "apply this diff."
                )
        lines.append("")

    lines.append("## Recency coverage")
    lines.append("")
    lines.append(
        "Of documents ingested in the last 30 days, how many showed up in the panel's "
        "retrieved passages at any point:"
    )
    lines.append("")
    for r in report["rounds"]:
        rec = r.get("recency")
        if not rec:
            continue
        if rec["coverage_pct"] is None:
            lines.append(f"- Round {r['round']}: no documents ingested in the last 30 days")
        else:
            lines.append(
                f"- Round {r['round']}: {rec['recent_covered']}/{rec['recent_total']} "
                f"({rec['coverage_pct']}%)"
            )
    lines.append("")

    return "\n".join(lines)


def render_log_entry(report: dict[str, Any], title: str) -> str:
    """render_report() produces a standalone document — its own H1, `## `
    for every top-level section. As one entry in the accumulating
    brief-improve-log.md, that H1 would nest under (and visually clash
    with) the entry's own `## <timestamp> — <title>` header, and every run
    would add another identical H1 to the same file, breaking any outline
    view as entries pile up. This wraps render_report()'s markdown with the
    entry's own header, drops the redundant H1, and demotes every
    top-level `## ` section to `### ` so the heading hierarchy nests
    correctly under the entry header."""
    body = render_report(report)
    body_lines = body.splitlines()
    if body_lines and body_lines[0].startswith("# "):
        body_lines = body_lines[1:]
        while body_lines and not body_lines[0].strip():
            body_lines.pop(0)
    demoted = [f"#{line}" if line.startswith("## ") else line for line in body_lines]
    return f"## {title}\n\n" + "\n".join(demoted)
