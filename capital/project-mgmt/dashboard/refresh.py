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

The prose in `precision.html` is written by hand and is NOT touched here.
Only the embedded `const D = [...]` array is replaced. If a headline number
in the prose disagrees with the series, that is a real finding about the
prose, and `check_published_figures.ts` exists to catch the same class of
error in `RESUME_HERE.md`.
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


def main() -> None:
    data = series()
    if not data:
        sys.exit("no recall_floor verdicts carry metrics -- refusing to blank the page")

    page = PAGE.read_text()
    if "const D = " not in page:
        sys.exit(f"{PAGE} has no `const D = ` array to replace")

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
    print("\nprose is NOT regenerated. Republish the page to update the artifact.")


if __name__ == "__main__":
    main()
