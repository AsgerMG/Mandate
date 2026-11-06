"""Single entry point that regenerates EVERY generated web/public/data
file from the corpus (schema `capital` of the Mandate Postgres), in order.

WHY THIS EXISTS: the site is fed by several JSON files written by separate
builders. After any corpus change -- a new source load, a reclassify, a dedup
pass -- forgetting one generator leaves the site silently stale (a new national
funder shows in the leaderboard but not the map). Run this one command instead
of remembering the list.

WHERE THE DATA COMES FROM. Postgres, read as capital_ro through
`store.connect(readonly=True)` (ETL/lib/store.py), which uses
CAPITAL_RO_DATABASE_URL. Nothing here can write the corpus: the role refuses,
and the session is read-only besides.

Order:
  0. the views            -- ETL/schema/install_views.py --check. A build cannot
                             reinstall them (capital_ro creates nothing), so it
                             refuses views that are not the committed file
  1. coverage_indicator   -- coverage_ratings.json + country_coverage.json
                             + data/processed/coverage_indicator.json
  2. taxonomy             -- taxonomy.json
  3. country_map          -- country_map.json
  4. home_visuals         -- instrument_leaderboard.json
  5. synthesis            -- synthesis.json (corpus KPIs)
  6. investor_insights    -- investor_insights.json
  7. companies_index      -- companies_index.json
  8. eligibility_export   -- instrument_terms.json
(every output is generated, never committed)
then the cross-file consistency guard.

Usage:
  python3 website/build/build_site_data.py             regenerate everything
  python3 website/build/build_site_data.py --check     views current + figures
                                                       consistent; exit 1 if not
  python3 website/build/build_site_data.py --prebuild  what `npm run build` runs:
        regenerate when CAPITAL_RO_DATABASE_URL is set, otherwise use what is
        on disk and say what is missing

After this, rebuild the site:  (cd ../web && npx next build)
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
from web_env import ROOT, BUILD, SITE_DATA  # noqa: E402

READONLY_ENV = "CAPITAL_RO_DATABASE_URL"   # the same name store.py reads

# Every generated file -> the builder that writes it. NONE is committed (owner's
# rule, 2026-11-05: data lives in Railway, artefacts are built from it). A build
# with CAPITAL_RO_DATABASE_URL regenerates all of them; one without it uses
# whatever is on disk and says what is missing.
GENERATED = {
    "coverage_ratings.json":       ("coverage_indicator.py", "generated"),
    "country_coverage.json":       ("coverage_indicator.py", "generated"),
    "taxonomy.json":               ("taxonomy.py", "generated"),
    "country_map.json":            ("country_map.py", "generated"),
    "instrument_leaderboard.json": ("home_visuals.py", "generated"),
    "synthesis.json":              ("synthesis.py", "generated"),
    "investor_insights.json":      ("investor_insights.py", "generated"),
    "companies_index.json":        ("companies_index.py", "generated"),
    "instrument_terms.json":       ("eligibility_export.py", "generated"),
}

STEPS = [
    ("coverage indicator", "coverage_indicator.py"),
    ("sector taxonomy",    "taxonomy.py"),
    ("country map",        "country_map.py"),
    ("home visuals",       "home_visuals.py"),
    ("synthesis KPIs",     "synthesis.py"),
    ("investor insights",  "investor_insights.py"),
    ("agent index",        "companies_index.py"),
    ("instrument terms",   "eligibility_export.py"),
]

INSTALL_VIEWS = ROOT / "ETL" / "schema" / "install_views.py"


def check_views() -> int:
    return subprocess.run([sys.executable, str(INSTALL_VIEWS), "--check"], cwd=ROOT).returncode


def check_present() -> int:
    """Exit 1 if an artefact the build reads is missing."""
    missing = [f for f in GENERATED if not (SITE_DATA / f).exists()]
    if missing:
        print("MISSING site data (generated from Postgres, never committed):")
        for f in missing:
            writer, _ = GENERATED[f]
            print(f"  {f:<30} writer: {writer}")
        print(f"Set {READONLY_ENV} (the capital_ro URL) and run "
              f"`python3 website/build/build_site_data.py`.")
        return 1
    print("All site data files are present.")
    return 0


# Generated files that publish a corpus-wide companies/events figure, and the
# JSON path to it. The guardrail asserts each equals the canonical synthesis
# number. Add any new file that surfaces a headline count here -- that is the
# whole point: one source of truth, enforced.
CORPUS_COUNT_CLAIMS = {
    "synthesis.json":         {"companies": ("companies",), "events": ("events",)},
    "investor_insights.json": {"companies": ("kpis", "companies"), "events": ("kpis", "events")},
}


def _dig(obj, path):
    for key in path:
        obj = obj[key]
    return obj


def check_consistency() -> int:
    """Fail (exit 1) if any generated file disagrees with the canonical KPIs.

    The single source of truth is corpus_kpis.compute_kpis on the corpus. This
    re-derives it and asserts that every file publishing a corpus-wide count
    matches it. A drift that used to ship silently (148k vs 152k vs 155k across
    pages) blocks the build.
    """
    from corpus_kpis import compute_kpis  # noqa: PLC0415
    from store import connect  # noqa: PLC0415
    with connect(readonly=True) as con:
        canon = compute_kpis(con)
    canonical = {"companies": canon["companies"], "events": canon["events"]}

    problems: list[str] = []
    for fname, claims in CORPUS_COUNT_CLAIMS.items():
        p = SITE_DATA / fname
        if not p.exists():
            problems.append(f"{fname}: MISSING")
            continue
        data = json.loads(p.read_text())
        for metric, path in claims.items():
            try:
                got = int(_dig(data, path))
            except (KeyError, TypeError):
                problems.append(f"{fname}: no {'.'.join(path)}")
                continue
            if got != canonical[metric]:
                problems.append(
                    f"{fname}: {metric}={got:,} but canonical={canonical[metric]:,} "
                    f"(rebuild: python3 website/build/build_site_data.py)")

    if problems:
        print("✗ STATS CONSISTENCY FAILED — corpus figures disagree with the "
              "single source of truth (corpus_kpis.compute_kpis):")
        for x in problems:
            print(f"    {x}")
        return 1
    print(f"✓ Corpus figures consistent everywhere: "
          f"{canonical['companies']:,} companies · {canonical['events']:,} events.")
    return 0


def run() -> int:
    print("\n▶ views")
    rc = check_views()
    if rc:
        return rc
    for label, script in STEPS:
        print(f"\n▶ {label}")
        result = subprocess.run([sys.executable, str(BUILD / script)], cwd=ROOT)
        if result.returncode != 0:
            print(f"\n✗ FAILED at: {label} (exit {result.returncode})")
            return result.returncode
    print()
    rc = check_present() or check_consistency()
    if rc == 0:
        print("\n✓ All site data regenerated. Now: (cd ../web && npx next build)")
    return rc


def prebuild() -> int:
    """`npm run build`'s first step. With the read-only credential, the data is
    regenerated from the corpus, so a build can never ship artefacts older than
    the store. Without it (a build that was given no credential), nothing can be
    regenerated and the files already on disk are used -- the behaviour before
    the corpus moved, kept until each deploy target is given the credential.
    What is missing is SAID, but does not fail here: whether a build without
    the generated-only artefacts may ship is the deploy's decision, not this
    script's."""
    import etl_env  # noqa: F401,PLC0415  (loads capital/.env.local, never overriding the shell)
    # FIRST: the release the weekly run published (mandate/artefacts.py) --
    # seconds, no corpus queries, and built after every brain refreshed. Only
    # when there is none, or the bucket is not configured or unreadable, does a
    # deploy fall back to building from the database as before.
    if os.environ.get(READONLY_ENV, "").strip() and os.environ.get("BUCKET_NAME", "").strip():
        try:
            sys.path.insert(0, str(ROOT.parent))
            from mandate.artefacts import fetch  # noqa: PLC0415
            fetch(SITE_DATA.parents[1], os.environ[READONLY_ENV].strip())
            if check_present() == 0:
                return 0
            print("the release lacks a file this build reads; building from the database")
        except Exception as exc:  # noqa: BLE001 -- any failure means: build it here
            print(f"artefact release unavailable ({type(exc).__name__}: {exc}); "
                  f"building site data from the database instead")
    if os.environ.get(READONLY_ENV, "").strip():
        return run()
    print(f"{READONLY_ENV} is not set: using the site data already on disk.")
    check_present()
    return 0


def main() -> None:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true",
                      help="views current + cross-file consistency; exit 1 if not")
    mode.add_argument("--prebuild", action="store_true",
                      help="regenerate if the read-only credential is set, else verify presence")
    args = parser.parse_args()
    if args.check:
        sys.exit(check_views() or check_present() or check_consistency())
    if args.prebuild:
        sys.exit(prebuild())
    sys.exit(run())


if __name__ == "__main__":
    main()
