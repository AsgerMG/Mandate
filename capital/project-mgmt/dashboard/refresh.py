#!/usr/bin/env python3
"""Refresh the precision dashboard's series from `guard_verdicts`.

WHY THIS EXISTS AS A SCRIPT AND NOT A HABIT. The dashboard is the only
place the owner sees whether precision is moving, and it was built once by
hand from a database query. A figure that is refreshed by hand is refreshed
until someone forgets, and then it is a stale number on a page that looks
current -- which is exactly the defect this project spent 2026-08-09
finding fifteen times, including a live site claiming 146,911 companies
when the corpus held 151,426.

So the series is REGENERATED from the source of record, never edited:

    python3 project-mgmt/dashboard/refresh.py

`guard_verdicts` is that source. Every `check_recall_floor` run publishes a
row with its metrics, so the dashboard's history is a by-product of the
guard rather than a parallel record that can drift from it. There is
nothing to keep in sync, which is the point -- a "keep in sync" comment IS
the bug.

EVERY FIGURE THE PAGE STATES IS WRITTEN HERE. The owner's rule is that the
page reflects what is in production at all times, so nothing numeric is
typed into the prose: the headline, the funnel percentages, the cut depth
and the ceiling are all filled from `guard_verdicts`, the measured recall
curve and `VERDICT_POOL` itself. The page ships with empty placeholders
that render as em-dashes, so a page this script has never touched looks
obviously unfilled rather than confidently wrong.
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PAGE = Path(__file__).resolve().parent / "precision.html"


def load_database_url() -> str:
    """The repo-root `.env.local` is the one that carries credentials."""
    if os.environ.get("DATABASE_URL"):
        return os.environ["DATABASE_URL"]
    for candidate in (ROOT / ".env.local", ROOT / "website/frontend/.env.local"):
        if not candidate.exists():
            continue
        for line in candidate.read_text().splitlines():
            if line.startswith("DATABASE_URL="):
                return line.split("=", 1)[1].strip().strip('"')
    sys.exit("DATABASE_URL not found in the environment or either .env.local")


def series() -> list[list]:
    """Every recall_floor verdict that carries a headline figure.

    The answer-key column matters and is carried: `C` is the composed key,
    `D` is Doors. A run under one is NOT comparable with a run under the
    other -- a childless family is its own regime, so REGIME@5 stops paying
    sibling-group-size credit at the switch. The page plots the two eras
    separately and never joins them with a line, and that is why this
    column is not dropped for compactness.
    """
    import psycopg  # imported late so --help works without the driver

    with psycopg.connect(load_database_url()) as conn:
        rows = conn.execute(
            "select taken_at, status, metrics from guard_verdicts "
            "where guard = 'recall_floor' and metrics is not null "
            "order by taken_at"
        ).fetchall()

    out: list[list] = []
    for taken_at, status, metrics in rows:
        if isinstance(metrics, str):
            metrics = json.loads(metrics)
        if metrics.get("exact5") is None:
            continue
        out.append([
            taken_at.isoformat()[:16],
            "D" if "Doors" in (metrics.get("set") or "") else "C",
            metrics.get("exact5"),
            metrics.get("pool"),
            metrics.get("regime5"),
            metrics.get("floorExact5"),
            status,
        ])
    return out


CURVE = ROOT / "website/frontend/lib/intelligence/poolRecallCurve.generated.json"
CAPS = ROOT / "website/frontend/lib/intelligence/caps.ts"


def cut_depth() -> int:
    """How many rows the selector is actually handed, read from the constant itself.

    Not restated here. The page's claim is about what production does, so the
    figure has to come from the thing production reads -- a copy would be one
    edit away from lying, which is the whole defect this file exists to stop.
    """
    m = re.search(r"export const VERDICT_POOL\s*=\s*(\d+)", CAPS.read_text())
    if not m:
        sys.exit(f"VERDICT_POOL not found in {CAPS} -- has it been renamed?")
    return int(m.group(1))


def figures(data: list[list]) -> dict[str, object]:
    """Every number the prose states, derived -- never typed.

    The owner's rule: the page must reflect what is in production at all
    times. So the headline, the funnel and the ceiling are all computed here
    from the guard's own verdicts and the measured recall curve, and the page
    ships with empty placeholders that read as em-dashes if this never runs.
    A page that renders a stale number confidently is worse than one that
    renders nothing.
    """
    latest = data[-1]                      # [when, key, exact5, pool, regime5, floor, status]
    curve = json.loads(CURVE.read_text())
    at = {int(k): v for k, v in curve["recallAtK"]}
    depth = cut_depth()
    if depth not in at:
        sys.exit(
            f"the recall curve has no point at K={depth}, the depth production uses. "
            f"Re-run scripts/_wsdr_curve.ts so the page can state the real figure."
        )
    return {
        "stamp": latest[0][:10],
        "stamp2": latest[0][:10],
        "runs": len(data),
        "published": round(latest[2]),
        "published2": round(latest[2]),
        "pool": round(latest[3]),
        "depth": depth,
        "shown": round(at[depth] * 100, 1),
        "shown2": round(at[depth] * 100, 1),
        "shown3": round(at[depth] * 100, 1),
        "ceiling": round(curve["inPoolAtAll"] * 100, 1),
    }


def main() -> None:
    data = series()
    if not data:
        sys.exit("no recall_floor verdicts carry metrics -- refusing to blank the page")

    page = PAGE.read_text()
    if "const D = " not in page:
        sys.exit(f"{PAGE} has no `const D = ` array to replace")

    figs = figures(data)
    page, n = re.subn(
        r"const FIG = \{.*?\};",
        "const FIG = " + json.dumps(figs, separators=(",", ":")) + ";",
        page,
        count=1,
        flags=re.S,
    )
    if n != 1:
        sys.exit("the FIG object could not be replaced -- has the page been restructured?")
    PAGE.write_text(page)

    updated, count = re.subn(
        r"const D = \[.*?\];",
        "const D = " + json.dumps(data, separators=(",", ":")) + ";",
        page,
        count=1,
        flags=re.S,
    )
    if count != 1:
        sys.exit("the series array could not be replaced -- has the page been restructured?")

    PAGE.write_text(updated)

    by_day: dict[str, list[float]] = {}
    for row in data:
        by_day.setdefault(row[0][:10], []).append(row[2])
    print(f"{len(data)} runs written to {PAGE.relative_to(ROOT)}")
    for day in sorted(by_day):
        vals = by_day[day]
        print(f"  {day}  {len(vals):>3} runs   EXACT@5 {min(vals)} - {max(vals)}")
    print(f"\nfigures: published {figs['published']}%  pool {figs['pool']}%  "
          f"shown-to-model {figs['shown']}% at K={figs['depth']}  ceiling {figs['ceiling']}%")
    print("Republish the page to update the artifact.")


if __name__ == "__main__":
    main()
