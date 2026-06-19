"""Single entry point that regenerates EVERY site/public/data/*.json file from
the current db.sqlite, in dependency order.

WHY THIS EXISTS: the site is fed by five JSON files written by four different
scripts, and two of them read SQL views (v_events) that must be reinstalled
first. After any DB change — a new source load, a reclassify, a dedup pass —
forgetting one generator leaves the site silently stale (e.g. a new national
funder shows in the leaderboard but not the map). Run this one command instead
of remembering the list.

Order matters:
  1. analysis/views.sql      — reinstall (a new source_family CASE here is
                               invisible until the views are recreated)
  2. gen_coverage_indicator  — coverage_ratings.json + country_coverage.json
                               + data/processed/coverage_indicator.json
  3. gen_country_map         — country_map.json (per-country map bubbles)
  4. build_home_visuals      — instrument_leaderboard.json (reads v_events)
  5. analysis/run            — synthesis.json (corpus KPIs; reads v_events)

Usage:
  python3 scripts/build_site_data.py            # regenerate everything
  python3 scripts/build_site_data.py --check     # verify files are fresh, exit 1 if stale

After this, rebuild the static site:  (cd site && npx next build)
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "db.sqlite"
VIEWS_SQL = ROOT / "analysis" / "views.sql"
SITE_DATA = ROOT / "site" / "public" / "data"

# Every generated file (excludes the static world-110m.json geo asset) → the
# command that writes it. Used by --check to flag any file older than the DB.
GENERATED = {
    "coverage_ratings.json":      "gen_coverage_indicator.py",
    "country_coverage.json":      "gen_coverage_indicator.py",
    "country_map.json":           "gen_country_map.py",
    "instrument_leaderboard.json": "build_home_visuals.py",
    "synthesis.json":             "analysis/run.py",
    "investor_insights.json":     "build_investor_insights.py",
    "recipient_explorer/manifest.json": "build_recipient_explorer.py",
    "companies/manifest.json":    "build_company_search.py",
}

# (label, command) in dependency order.
STEPS = [
    ("reinstall SQL views", None),  # handled specially
    ("coverage indicator", [sys.executable, "scripts/gen_coverage_indicator.py"]),
    ("country map",        [sys.executable, "scripts/gen_country_map.py"]),
    ("home visuals",       [sys.executable, "scripts/build_home_visuals.py"]),
    ("synthesis KPIs",     [sys.executable, "analysis/run.py"]),
    ("investor insights",  [sys.executable, "scripts/build_investor_insights.py"]),
    ("recipient explorer", [sys.executable, "scripts/build_recipient_explorer.py"]),
    ("company lookup",     [sys.executable, "scripts/build_company_search.py"]),
]


def reinstall_views() -> None:
    sql = VIEWS_SQL.read_text()
    con = sqlite3.connect(DB)
    try:
        con.executescript(sql)
        con.commit()
    finally:
        con.close()


def check_fresh() -> int:
    """Exit 1 if any generated file is missing or older than the DB."""
    db_mtime = DB.stat().st_mtime
    stale = []
    for fname in GENERATED:
        p = SITE_DATA / fname
        if not p.exists():
            stale.append((fname, "MISSING"))
        elif p.stat().st_mtime < db_mtime:
            stale.append((fname, "older than db.sqlite"))
    if stale:
        print("STALE site data — run `python3 scripts/build_site_data.py`:")
        for fname, why in stale:
            print(f"  {fname:<30} {why}  (writer: {GENERATED[fname]})")
        return 1
    print("All site data files are fresh.")
    return 0


def run() -> int:
    for label, cmd in STEPS:
        print(f"\n▶ {label}")
        if cmd is None:
            reinstall_views()
            print("  views reinstalled")
            continue
        result = subprocess.run(cmd, cwd=ROOT)
        if result.returncode != 0:
            print(f"\n✗ FAILED at: {label} (exit {result.returncode})")
            return result.returncode
    # Verify outputs are now fresh.
    print()
    rc = check_fresh()
    if rc == 0:
        print("\n✓ All site data regenerated. Now: (cd site && npx next build)")
    return rc


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true",
                        help="verify freshness only; exit 1 if any file is stale")
    args = parser.parse_args()
    sys.exit(check_fresh() if args.check else run())


if __name__ == "__main__":
    main()
