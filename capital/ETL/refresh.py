"""One entry point for keeping the corpus current.

Runs the downstream chain only when a source actually changed, and refuses to
publish a corpus that got worse. Everything it calls is already idempotent and
incremental; what was missing was something to pull the lever and something to
stop it when the result is wrong.

  python3 ETL/refresh.py --check     what changed, and what would run
  python3 ETL/refresh.py             run it
  python3 ETL/refresh.py --force     run even with no source change

Design notes worth keeping:

* The gate runs BEFORE the publish, not after. A regression that reaches
  Railway has already reached founders.
* Steps are ordered so nothing expensive happens before the cheap checks. The
  rebuild and the coverage gate cost nothing; embedding and extraction cost
  money, so they sit behind both.
* A step that fails stops the chain. Half a refresh is worse than none,
  because the corpus is then internally inconsistent and nothing says so.
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path

_sys.path.insert(0, str(_Path(__file__).resolve().parent / "lib"))

import argparse  # noqa: E402
import subprocess  # noqa: E402

from etl_env import ROOT  # noqa: E402
import source_state  # noqa: E402

# (label, argv, costs_money)
STEPS: list[tuple[str, list[str], bool]] = [
    ("rebuild instruments", ["python3", "ETL/events/load/populate_funding_instruments.py"], False),
    ("restore sector labels", ["python3", "ETL/events/transform/classify_taxonomy.py", "restore"], False),
    ("coverage gate", ["python3", "ETL/terms/coverage_gate.py"], False),
    ("export snapshot", ["python3", "website/build/eligibility_export.py"], False),
    ("companies index", ["python3", "website/build/companies_index.py"], False),
    ("publish to Postgres", ["python3", "ETL/terms/migrate_to_postgres.py"], False),
    ("embed instrument profiles", ["python3", "ETL/terms/build_instrument_profiles.py", "run"], True),
    ("embed eligibility", ["python3", "ETL/terms/embed_eligibility.py", "run"], True),
    ("persist sector labels", ["python3", "ETL/events/transform/classify_taxonomy.py", "persist"], False),
    ("coverage report", ["python3", "ETL/terms/coverage_report.py", "--md", "project-mgmt/coverage.md"], False),
    ("coverage dashboard", ["python3", "ETL/terms/coverage_dashboard.py", "--out", "project-mgmt/coverage.html"], False),
]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report and exit")
    ap.add_argument("--force", action="store_true", help="run with no source change")
    ap.add_argument("--skip-paid", action="store_true",
                    help="skip the steps that spend API credits")
    args = ap.parse_args()

    moved, added, removed = source_state.changed()
    if moved or added or removed:
        for label, names in (("changed", moved), ("new", added), ("gone", removed)):
            if names:
                print(f"{label}: {', '.join(sorted(names)[:8])}"
                      f"{' ...' if len(names) > 8 else ''}")
    else:
        print("no source changed")

    if args.check:
        if not (moved or added or removed):
            print("nothing would run.")
            return
        for label, _, paid in STEPS:
            print(f"  would run: {label}{'  ($)' if paid else ''}")
        return

    if not (moved or added or removed or args.force):
        print("nothing to do. --force to run anyway.")
        return

    for label, argv, paid in STEPS:
        if paid and args.skip_paid:
            print(f"\n-- skipping {label} (--skip-paid)")
            continue
        print(f"\n-- {label}")
        r = subprocess.run(argv, cwd=ROOT)
        if r.returncode != 0:
            # The coverage gate failing is the designed stop, not a crash.
            print(f"\nSTOPPED at '{label}' (exit {r.returncode}). "
                  f"Nothing after this step ran.")
            raise SystemExit(r.returncode)

    source_state.record()
    print("\nrefresh complete; source hashes recorded.")


if __name__ == "__main__":
    main()
