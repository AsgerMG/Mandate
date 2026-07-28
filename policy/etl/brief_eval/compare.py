"""Judged before/after comparison of two `brief-check` runs.

The gap this fills: `brief-check` produces briefs and stores them, and the
7-dimension judge already exists — but nothing joined the two, so answering "did
that change make briefs better?" meant reading ten briefs and forming an
impression. The first attempt at this on 2026-07-27 was counting citations and
regex-matching for court references, which is a proxy for quality rather than a
measure of it, and it missed judgments entirely because the reference sat in the
citation title rather than the prose.

Three deliberate properties:

*Matched pairs only.* Profiles present in one report but not the other are
dropped and reported, not silently averaged into a total. A comparison across
different profile sets is not a comparison.

*Same judge, one call per side.* `judge_panel` scores a whole panel in a single
call, so a side costs one call regardless of panel size and both sides are judged
by identically-prompted runs.

*Corpus fingerprints checked first.* See rotation.compare_fingerprints — a run
against a half-ingested corpus produces plausible, worthless numbers, and that
has already happened once.

A 5-profile panel scored 1-5 across 7 dimensions is a small sample. Differences
below ~0.3 on the average should be read as noise, which is why per-dimension
deltas are printed rather than a single headline number.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import structlog

from etl.intelligence.profile import CompanyProfile

from .judge import _SCORE_DIMENSIONS, judge_panel
from .rotation import compare_fingerprints

log = structlog.get_logger(__name__)


def load_report(path: str | Path) -> dict:
    return json.loads(Path(path).read_text())


def _panel_items(report: dict, names: list[str]) -> list[tuple[CompanyProfile, dict]]:
    """Rebuild ``judge_panel``'s (profile, result) input from a stored report.

    The report keeps the profile *name* rather than the whole profile, so the
    description is looked up from EVAL_PANEL. Falls back to a bare profile if a
    name isn't in the current panel — a panel edited since the run shouldn't make
    an old report unreadable.
    """
    from .panel import EVAL_PANEL

    by_name = {p.name: p for p in EVAL_PANEL}
    by_profile = {r["profile"]: r for r in report.get("results", [])}
    items: list[tuple[CompanyProfile, dict]] = []
    for name in names:
        profile = by_name.get(name) or CompanyProfile(name=name)
        items.append((profile, by_profile[name]))
    return items


def compare_runs(client: Any, before: dict, after: dict) -> dict[str, Any]:
    """Judge both runs and return per-dimension deltas over matched profiles."""
    before_names = {r["profile"] for r in before.get("results", []) if r.get("briefing")}
    after_names = {r["profile"] for r in after.get("results", []) if r.get("briefing")}
    matched = sorted(before_names & after_names)
    dropped = sorted((before_names | after_names) - set(matched))

    warnings = compare_fingerprints(before.get("corpus"), after.get("corpus"))
    if dropped:
        warnings.append(
            f"{len(dropped)} profile(s) present in only one run, excluded: {', '.join(dropped)}"
        )
    if not matched:
        return {"matched": [], "dropped": dropped, "warnings": warnings, "dimensions": {}}

    before_scores = judge_panel(client, _panel_items(before, matched))
    after_scores = judge_panel(client, _panel_items(after, matched))

    def mean(scores: list[dict], key: str) -> float:
        values = [s[key] for s in scores if isinstance(s.get(key), (int, float))]
        return round(sum(values) / len(values), 3) if values else 0.0

    dimensions: dict[str, dict[str, float]] = {}
    for dim in [*_SCORE_DIMENSIONS, "score"]:
        b, a = mean(before_scores, dim), mean(after_scores, dim)
        dimensions[dim] = {"before": b, "after": a, "delta": round(a - b, 3)}

    # Retrieval shape alongside the scores, so a quality change can be attributed
    # to something concrete rather than left as an unexplained number.
    def retrieval_mean(report: dict, key: str) -> float | None:
        """None, not 0.0, when a run simply didn't record this metric.

        `substantive_documents_per_passage` and `max_passages_per_document` were
        added mid-session, so an earlier report has no value for them. Returning
        0.0 rendered as "0.00 → 0.44", which reads as a measured improvement from
        zero rather than "not recorded" — precisely the kind of confidently wrong
        number this tool exists to prevent.
        """
        values = [
            r["retrieval_stats"][key]
            for r in report.get("results", [])
            if r["profile"] in matched
            and isinstance(r.get("retrieval_stats", {}).get(key), (int, float))
        ]
        return round(sum(values) / len(values), 3) if values else None

    retrieval: dict[str, dict[str, float | None]] = {}
    for key in (
        "passages",
        "documents",
        "substantive_documents_per_passage",
        "max_passages_per_document",
        "context_chars",
        "score_median",
    ):
        b, a = retrieval_mean(before, key), retrieval_mean(after, key)
        retrieval[key] = {
            "before": b,
            "after": a,
            "delta": round(a - b, 3) if b is not None and a is not None else None,
        }

    return {
        "matched": matched,
        "dropped": dropped,
        "warnings": warnings,
        "dimensions": dimensions,
        "retrieval": retrieval,
        "per_profile": {
            name: {
                "before": before_scores[i].get("score"),
                "after": after_scores[i].get("score"),
            }
            for i, name in enumerate(matched)
        },
        "before_scores": before_scores,
        "after_scores": after_scores,
    }


def render(result: dict[str, Any]) -> str:
    """Plain-text report. Warnings first — an uncomparable comparison should be
    read as such before any number is."""
    lines: list[str] = []
    if result["warnings"]:
        lines.append("⚠ Comparability warnings:")
        lines += [f"   - {w}" for w in result["warnings"]]
        lines.append("")
    if not result["matched"]:
        lines.append("No profiles appear in both runs — nothing to compare.")
        return "\n".join(lines)

    lines.append(f"Matched profiles: {len(result['matched'])}")
    lines.append("")
    lines.append(f"{'dimension':32} {'before':>7} {'after':>7} {'delta':>7}")
    for dim, v in result["dimensions"].items():
        mark = "" if abs(v["delta"]) >= 0.3 else "  (noise)"
        label = "OVERALL" if dim == "score" else dim
        lines.append(
            f"{label:32} {v['before']:7.2f} {v['after']:7.2f} {v['delta']:+7.2f}{mark}"
        )
    lines.append("")
    lines.append("Retrieval shape (means over matched profiles):")
    for key, v in result["retrieval"].items():
        if v["delta"] is None:
            # Not recorded on one side — say so rather than printing a 0.00 that
            # reads as a real measurement.
            b = "not recorded" if v["before"] is None else f"{v['before']:.2f}"
            a = "not recorded" if v["after"] is None else f"{v['after']:.2f}"
            lines.append(f"  {key:38} {b:>12} → {a:>12}   (not comparable)")
        else:
            lines.append(
                f"  {key:38} {v['before']:12.2f} → {v['after']:12.2f}  ({v['delta']:+.2f})"
            )
    lines.append("")
    lines.append("Per profile (overall 1-5):")
    for name, v in result["per_profile"].items():
        b, a = v["before"], v["after"]
        if isinstance(b, (int, float)) and isinstance(a, (int, float)):
            lines.append(f"  {name[:44]:44} {b:.2f} → {a:.2f}  ({a - b:+.2f})")
    lines.append("")
    lines.append(
        "A 5-profile panel scored 1-5 is a small sample: treat |delta| < 0.3 as noise, "
        "and read the per-dimension rows rather than the overall figure."
    )
    return "\n".join(lines)
