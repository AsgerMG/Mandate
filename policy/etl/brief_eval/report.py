"""Renders run_search()'s report dict to markdown — the human-review
artifact. Nothing here writes anywhere; the CLI command decides whether to
print it or save it to a file, and the human decides what to do with it."""

from __future__ import annotations

import difflib
from typing import Any


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
    lines.append(
        f"Spent **${report['budget']['spent_usd']:.2f}** of a "
        f"${report['budget']['cap_usd']:.2f} cap across {report['budget']['calls']} calls. "
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
    lines.append("| Round | Aggregate | Δ vs. prior best | Accepted | Note |")
    lines.append("|---|---|---|---|---|")
    for r in report["rounds"]:
        if r["round"] == 0:
            lines.append(f"| 0 (baseline) | {r['aggregate']} | — | yes | — |")
            continue
        if r["candidate"] is None:
            lines.append(f"| {r['round']} | — | — | no | {r.get('reason', '')} |")
            continue
        note = r["candidate"]["rationale"]
        lines.append(
            f"| {r['round']} | {r['aggregate']} | {r['delta']:+} | "
            f"{'yes' if r['accepted'] else 'no'} | {note} |"
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

    confirmation = report.get("confirmation")
    if confirmation:
        lines.append("## Confirmation (sharpen=True — the real production path)")
        lines.append("")
        if confirmation.get("skipped"):
            lines.append(
                f"Skipped: {confirmation.get('reason')}. The exploration result above is "
                "**unconfirmed** — treat it as directional, not a verified recommendation."
            )
        else:
            verdict = "HOLDS UP" if confirmation["holds_up"] else "DOES NOT hold up"
            lines.append(
                f"Re-tested baseline vs. the winning candidate one more time each, both with "
                f"`sharpen=True` (the mandatory revise pass real `/api/brief` traffic always "
                f"runs). Confirmed delta: **{confirmation['improvement']:+}** — **{verdict}**."
            )
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
