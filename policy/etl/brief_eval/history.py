"""The run ledger: every brief-check ever written, dated and side by side.

`brief-compare` answers "did this one change help?" between two runs. This answers
the question that needs more than two: what has cost, latency, retrieval shape and
corpus size actually done over time. Both existed as facts on disk already — every
`brief-check` writes a timestamped report — but reading a trend meant opening ten
JSON files by hand, so nobody did, and the numbers that were quoted in planning
docs were whichever ones someone happened to remember.

Derived from the report files rather than from a separate ledger, deliberately:
the reports are already the complete record (corpus fingerprint, per-profile spend,
served model, wall clock), already dated by filename, and already written on every
run. A second store would be a second thing to keep in step, and the failure mode
of that — a ledger that disagrees with the reports — is worse than the failure mode
of this, which is that deleting a report removes a row and says so by absence.

Latency and served model only exist from 2026-07-29 onward; earlier runs render as
"—" rather than 0, for the same reason `brief-compare` prints "not recorded": a
zero here would read as "that run was instant".
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from etl.intelligence.briefing import DEPTH_RATIO_KEY

REPORT_GLOB = "brief-check-*.json"
DEFAULT_ROOT = Path("exports")

# brief-check-2026-07-29T13-03-56Z.json -> 2026-07-29 13:03
_STAMP = re.compile(r"brief-check-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z")


def _when(path: Path) -> str:
    m = _STAMP.search(path.name)
    return f"{m.group(1)} {m.group(2)}:{m.group(3)}" if m else path.stem[:16]


def _mean(values: list[Any]) -> float | None:
    nums = [v for v in values if isinstance(v, (int, float))]
    return round(sum(nums) / len(nums), 3) if nums else None


def run_rows(root: Path | str = DEFAULT_ROOT) -> list[dict[str, Any]]:
    """One row per report found under ``root``, oldest first.

    Recurses, because past sessions copied reports into labelled sibling
    directories (`baseline/`, `after/`, `final/`) to keep them from being
    overwritten — those are part of the history, not clutter to skip.
    """
    rows: list[dict[str, Any]] = []
    for path in sorted(Path(root).rglob(REPORT_GLOB), key=_when):
        try:
            report = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        # Retrieval shape and latency come from every result; cost per brief only
        # from the ones that actually generated text. A dry run measures retrieval
        # and nothing else — dropping it entirely (as a first version did) threw
        # away exactly the rows that carry the variance measurements.
        results = [r for r in report.get("results", []) if not r.get("error")]
        billed = [r for r in results if r.get("briefing")]
        breakdown = report.get("breakdown") or {}
        corpus = report.get("corpus") or {}
        spent = report.get("spent_usd")
        rows.append(
            {
                "when": _when(path),
                "label": path.parent.name,
                "model": report.get("model"),
                "briefs": len(results),
                "dry_run": bool(report.get("dry_run")),
                "usd": spent,
                "usd_per_brief": round(spent / len(billed), 4) if billed and spent else None,
                "seconds_per_brief": _mean([r.get("seconds") for r in results])
                or _mean([b.get("seconds") for b in breakdown.values()]),
                "passages": _mean([r.get("retrieval_stats", {}).get("passages") for r in results]),
                "depth": _mean(
                    [r.get("retrieval_stats", {}).get(DEPTH_RATIO_KEY) for r in results]
                ),
                # Of the acts published in the last 30 days, the share that
                # reached ANY brief in this run (see recency.py). Recorded from
                # 2026-08-07; earlier runs render "—", and so does a run whose
                # briefs predate `retrieval_stats["retrieved_celex"]` — which is
                # the point of `measurable`, since a real 0.0% and an
                # unrecordable one are the same number and opposite findings.
                "recent_pct": (
                    (report.get("recency") or {}).get("coverage_pct")
                    if (report.get("recency") or {}).get("measurable", True)
                    else None
                ),
                "documents": corpus.get("documents"),
                "unembedded": corpus.get("unembedded_passages"),
                # Absolute judged score, present from 2026-07-29 (see
                # compare.judge_report). Comparable across rows only because the
                # judge model is pinned separately from the model under test.
                "score": (report.get("judged") or {}).get("means", {}).get("score"),
                # Unresolved canon notes as recorded at generation time — NOT the
                # judge's `canon_issues`. The judge recomputes _canon_issues against
                # `result["passages"]`, which reports do not store, so judging a
                # stored report always yields 0 regardless of the briefs: a quality
                # signal that reads clean because the evidence is absent, not because
                # the work is. Found 2026-07-29 when this column showed 0.0 for a run
                # that had 30 unresolved notes recorded three fields away.
                "canon_unresolved": sum(len(r.get("canon_notes") or []) for r in results),
                "path": str(path),
            }
        )
    return rows


def render(rows: list[dict[str, Any]]) -> str:
    if not rows:
        return f"No brief-check reports found under {DEFAULT_ROOT}/."

    def cell(value: Any, spec: str = "") -> str:
        if value is None:
            return "—"
        return format(value, spec) if spec else str(value)

    head = (
        f"{'when':16} {'label':12} {'model':17} {'n':>2} {'score':>5} {'canon!':>6} "
        f"{'$/brief':>8} {'s/brief':>8} {'passages':>9} {'depth':>6} {'recent%':>7} "
        f"{'corpus':>7} {'unemb':>6}"
    )
    lines = ["Brief-check run history (oldest first)", "", head, "-" * len(head)]
    for r in rows:
        model = (r["model"] or ("dry run" if r["dry_run"] else "—"))[:17]
        lines.append(
            f"{r['when']:16} {r['label'][:12]:12} {model:17} {r['briefs']:>2} "
            f"{cell(r['score'], '5.2f'):>5} {cell(r['canon_unresolved'], '6d'):>6} "
            f"{cell(r['usd_per_brief'], '8.3f'):>8} "
            f"{cell(r['seconds_per_brief'], '8.1f'):>8} {cell(r['passages'], '9.1f'):>9} "
            f"{cell(r['depth'], '6.3f'):>6} {cell(r['recent_pct'], '7.1f'):>7} "
            f"{cell(r['documents'], '7d'):>7} {cell(r['unembedded'], '6d'):>6}"
        )
    lines += [
        "",
        "'—' means the run did not record that field, not zero: served model, latency and",
        "judged score exist only from 2026-07-29. `depth` is",
        "substantive_documents_per_passage (1.0 = every instrument the brief reasons over",
        "contributed one passage); `canon!` is the number of canon acts left in neither",
        "the compliance table nor the out-of-scope appendix after the correction loop —",
        "recorded during generation, deterministic, and the one quality signal here that",
        "needs no model at all.",
        "",
        "`recent%` is the share of acts published in the last 30 days that reached ANY",
        "brief in that run. It was measured once, at 0.0%, and then went unwatched for",
        "two weeks because it was wired into `brief-improve` and not into `brief-check`.",
        "A low number is a corpus/retrieval finding, not a prompt one: no wording change",
        "can cite a passage retrieval never returned.",
        "",
        "`score` is comparable across rows because the judge model is pinned separately",
        "from the model under test — but an LLM judge is not perfectly repeatable and its",
        "self-variance is unmeasured, so read a trend, not a 0.05 difference. For a",
        "controlled two-run answer use `brief-compare <before> <after>`, which judges both",
        "sides in one pass and reports per-dimension deltas.",
    ]
    return "\n".join(lines)
