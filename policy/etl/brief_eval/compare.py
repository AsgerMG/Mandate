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

A small panel scored 1-5 across 7 dimensions is a small sample. Differences below
~0.3 on the average should be read as noise, which is why per-dimension deltas are
printed rather than a single headline number. That floor is not only judge
variance: retrieval itself returns a different passage set on every run (see
retrieval_spread), so the two sides were built from measurably different context.

Cost and latency are reported alongside the scores, because a model swap is judged
on three axes at once and a quality delta read without the other two is a
decision made on a third of the evidence.
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


#: Retrieval metrics whose run-to-run movement decides whether a judged delta is
#: readable at all. Retrieval is not deterministic — HNSW is approximate and the
#: reranker breaks ties — so two identical runs return slightly different
#: passages, and a quality difference smaller than that drift is unattributable.
#: `seconds` rides along because latency is the other thing a repeat measures for
#: free, and a latency delta needs a noise floor exactly as much as a score does.
_VARIANCE_KEYS = (
    "passages",
    "documents",
    "substantive_documents_per_passage",
    "context_chars",
    "score_median",
    "seconds",
)


def retrieval_spread(runs: list[dict]) -> dict[str, dict[str, float]]:
    """min/max/spread/mean per retrieval metric across repeated identical runs.

    Measured rather than assumed, because the alternative is what we were doing:
    treating |delta| < 0.3 as noise on a threshold nobody had ever checked. Cheap
    to run — retrieval needs no API call — so there is no reason to keep guessing.
    """
    out: dict[str, dict[str, float]] = {}
    for key in _VARIANCE_KEYS:
        values = [r[key] for r in runs if isinstance(r.get(key), (int, float))]
        if len(values) < 2:
            continue
        out[key] = {
            "min": round(min(values), 3),
            "max": round(max(values), 3),
            "spread": round(max(values) - min(values), 3),
            "mean": round(sum(values) / len(values), 3),
            "runs": len(values),
        }
    return out


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


def judge_report(client: Any, report: dict) -> dict[str, Any]:
    """Absolute 7-dimension scores for the briefs in ONE stored run.

    `brief-compare` judges two runs against each other, which answers "did that
    change help?" but leaves no score attached to a run — so there was no way to
    see quality over time, only pairwise. This scores a run on its own terms and
    is cheap enough to do on every billed check: `judge_panel` batches the whole
    panel into a single call, so it costs one call whether the panel is 5 or 10.

    Comparable across runs only because `eval_model` is pinned (see data/config.py)
    — the instrument has to be the same instrument. Two caveats that belong next to
    any trend read from these: an LLM judge is not perfectly repeatable, and that
    self-variance has not been measured here; and the deterministic `canon_issues`
    count is the one quality signal in the report that needs no model at all.
    """
    names = sorted(r["profile"] for r in report.get("results", []) if r.get("briefing"))
    if not names:
        return {}
    scores = judge_panel(client, _panel_items(report, names))
    dims = [*_SCORE_DIMENSIONS, "score", "canon_issues"]
    means = {
        dim: round(
            sum(s[dim] for s in scores if isinstance(s.get(dim), (int, float))) / len(scores), 3
        )
        for dim in dims
        if any(isinstance(s.get(dim), (int, float)) for s in scores)
    }
    return {
        "means": means,
        "per_profile": {name: scores[i] for i, name in enumerate(names)},
    }


def _per_brief(report: dict, matched: list[str], key: str) -> float | None:
    """Mean of ``breakdown[profile][key]`` over the matched profiles only.

    Matched-only so cost and latency are computed over exactly the briefs the
    scores are computed over — a run with three extra profiles must not look
    more expensive per brief than it was.
    """
    breakdown = report.get("breakdown") or {}
    values = [
        breakdown[name][key]
        for name in matched
        if isinstance(breakdown.get(name, {}).get(key), (int, float)) and breakdown[name][key]
    ]
    return round(sum(values) / len(values), 3) if values else None


def _run_comparison(before: dict, after: dict, matched: list[str]) -> dict[str, Any]:
    """Model, $ per brief and seconds per brief for each side.

    A model swap is judged on three axes at once — quality, cost, latency — and
    only the first was ever reported here. Reading a -0.1 quality delta is a very
    different decision if it came with a 3x cost cut and half the wall clock.
    Any of these is None on a report written before the field existed, which the
    renderer prints as "not recorded" rather than as a zero.
    """
    out: dict[str, Any] = {}
    for side, report in (("before", before), ("after", after)):
        out[side] = {
            "model": report.get("model"),
            "usd_per_brief": _per_brief(report, matched, "usd"),
            "seconds_per_brief": _per_brief(report, matched, "seconds"),
        }
    return out


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
        "run": _run_comparison(before, after, matched),
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


def _render_run(run: dict[str, Any]) -> list[str]:
    """Model / cost / latency block, or nothing if neither side recorded any."""
    before, after = run.get("before") or {}, run.get("after") or {}
    if not any(
        before.get(k) or after.get(k) for k in ("model", "usd_per_brief", "seconds_per_brief")
    ):
        return []

    def fmt(value: Any, unit: str = "") -> str:
        return "not recorded" if value is None else f"{value}{unit}"

    lines = ["Model, cost and latency (per brief, matched profiles):"]
    lines.append(f"  {'model':22} {fmt(before.get('model')):>16} → {fmt(after.get('model')):>16}")
    for label, key, unit in (
        ("$ per brief", "usd_per_brief", ""),
        ("seconds per brief", "seconds_per_brief", "s"),
    ):
        b, a = before.get(key), after.get(key)
        line = f"  {label:22} {fmt(b, unit):>16} → {fmt(a, unit):>16}"
        if isinstance(b, (int, float)) and isinstance(a, (int, float)) and b:
            line += f"   ({(a - b) / b:+.0%})"
        lines.append(line)
    lines.append("")
    return lines


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
        lines.append(f"{label:32} {v['before']:7.2f} {v['after']:7.2f} {v['delta']:+7.2f}{mark}")
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
    lines += _render_run(result.get("run") or {})
    lines.append("Per profile (overall 1-5):")
    for name, v in result["per_profile"].items():
        b, a = v["before"], v["after"]
        if isinstance(b, (int, float)) and isinstance(a, (int, float)):
            lines.append(f"  {name[:44]:44} {b:.2f} → {a:.2f}  ({a - b:+.2f})")
    lines.append("")
    lines.append(
        "A small panel scored 1-5 is a small sample: treat |delta| < 0.3 as noise, and "
        "read the per-dimension rows rather than the overall figure. Retrieval itself "
        "differs between identical runs (measured 2026-07-29: ±5 passages, ±5.5K context "
        "chars, though score_median only ±0.007), so a retrieval delta under ~0.03 on "
        "substantive_documents_per_passage or ~6K chars is noise too. `brief-check "
        "--dry-run --repeat N` re-measures this for free."
    )
    return "\n".join(lines)
