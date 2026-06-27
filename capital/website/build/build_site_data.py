"""Single entry point that regenerates EVERY website/frontend/public/data/*.json
file from the current db.sqlite, in dependency order.

WHY THIS EXISTS: the site is fed by several JSON files written by separate
builders, and some of them read SQL views (v_events) that must be reinstalled
first. After any DB change — a new source load, a reclassify, a dedup pass —
forgetting one generator leaves the site silently stale (e.g. a new national
funder shows in the leaderboard but not the map). Run this one command instead
of remembering the list.

Order matters:
  1. data/views.sql        — reinstall (a new source_family CASE here is
                             invisible until the views are recreated)
  2. coverage_indicator    — coverage_ratings.json + country_coverage.json
                             + data/processed/coverage_indicator.json
  3. country_map           — country_map.json (per-country map bubbles)
  4. home_visuals          — instrument_leaderboard.json (reads v_events)
  5. synthesis             — synthesis.json (corpus KPIs; reads v_events)
  6. investor_insights     — investor_insights.json (the /for-companies charts)

Usage:
  python3 website/build/build_site_data.py          # regenerate everything
  python3 website/build/build_site_data.py --check   # verify freshness, exit 1 if stale

After this, rebuild the static site:  (cd website/frontend && npx next build)
"""

from __future__ import annotations

import argparse
import subprocess
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
from web_env import ROOT, BUILD, DB, SITE_DATA, VIEWS_SQL  # noqa: E402

# Every generated file (excludes the static world-110m.json geo asset) → the
# builder that writes it. Used by --check to flag any file older than the DB.
GENERATED = {
    "coverage_ratings.json":      "coverage_indicator.py",
    "country_coverage.json":      "coverage_indicator.py",
    "taxonomy.json":              "taxonomy.py",
    "country_map.json":           "country_map.py",
    "instrument_leaderboard.json": "home_visuals.py",
    "synthesis.json":             "synthesis.py",
    "investor_insights.json":     "investor_insights.py",
    "companies/manifest.json":    "company_search.py",
    "companies_index.json":       "companies_index.py",
}

# (label, builder filename) in dependency order. All live under website/build/.
STEPS = [
    ("reinstall SQL views", None),  # handled specially
    ("coverage indicator", "coverage_indicator.py"),
    ("sector taxonomy",    "taxonomy.py"),
    ("country map",        "country_map.py"),
    ("home visuals",       "home_visuals.py"),
    ("synthesis KPIs",     "synthesis.py"),
    ("investor insights",  "investor_insights.py"),
    ("company lookup",     "company_search.py"),
    ("agent index",        "companies_index.py"),
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
    """Exit 1 if any generated file is missing or older than the DB.

    The DB is a gitignored build artifact, so it is absent in CI / on Vercel,
    where the committed website/frontend/public/data/*.json is the source of
    truth and there is nothing to compare against. Skip the freshness check there
    rather than crashing the build with FileNotFoundError.
    """
    if not DB.exists():
        print("db.sqlite not present (CI/deploy) — skipping freshness check.")
        return 0
    db_mtime = DB.stat().st_mtime
    stale = []
    for fname in GENERATED:
        p = SITE_DATA / fname
        if not p.exists():
            stale.append((fname, "MISSING"))
        elif p.stat().st_mtime < db_mtime:
            stale.append((fname, "older than db.sqlite"))
    if stale:
        print("STALE site data — run `python3 website/build/build_site_data.py`:")
        for fname, why in stale:
            print(f"  {fname:<30} {why}  (writer: {GENERATED[fname]})")
        return 1
    print("All site data files are fresh.")
    return 0


def run() -> int:
    for label, script in STEPS:
        print(f"\n▶ {label}")
        if script is None:
            reinstall_views()
            print("  views reinstalled")
            continue
        result = subprocess.run([sys.executable, str(BUILD / script)], cwd=ROOT)
        if result.returncode != 0:
            print(f"\n✗ FAILED at: {label} (exit {result.returncode})")
            return result.returncode
    # Verify outputs are now fresh.
    print()
    rc = check_fresh()
    if rc == 0:
        print("\n✓ All site data regenerated. Now: (cd website/frontend && npx next build)")
    return rc


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true",
                        help="verify freshness only; exit 1 if any file is stale")
    args = parser.parse_args()
    sys.exit(check_fresh() if args.check else run())


if __name__ == "__main__":
    main()
