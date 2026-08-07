"""How long does the website stay behind the ETL, and how long would a guard let it?

── Why this is a script and not a paragraph ───────────────────────────────
The choice between "automate the publish" and "guard the drift and fix it by
hand" turns on one number: how long the site would serve a stale corpus before
anybody noticed. That number is not a matter of opinion, it is in the git log,
and it changes as working habits change — so it is measured, not asserted.

Two windows, and the gap between them is the whole argument:

  ANNOUNCED   cron fire -> next commit on main.
              A guard that runs in CI can only fire when somebody pushes, so
              this is the best a push-triggered guard can do.

  REALISED    cron fire -> next commit that actually regenerated the site data.
              This is what happened.

A third window is not measurable here and is the reason the guard needs a clock:
if nobody pushes at all, ANNOUNCED is unbounded, and the weeks when nobody
pushes are exactly the weeks when nobody is looking.

Usage:
  python3 ETL/lib/drift_window.py
  python3 ETL/lib/drift_window.py --since 2026-07-24   # since the cron went live
"""
from __future__ import annotations

import argparse
import datetime as dt
import statistics
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# The weekly Railway cron. Kept here rather than imported from railway_service
# so this script runs on a checkout with no Railway credentials.
CRON_WEEKDAY = 6  # Sunday
CRON_HOUR = 3     # 03:00 UTC — "0 3 * * 0"

# The committed build artifacts that carry the corpus to a founder. A commit
# that touches none of these did not close the drift, however many other files
# it changed.
PUBLISHED_ARTIFACTS = [
    "website/frontend/public/data/synthesis.json",
    "website/frontend/public/data/instrument_terms.json",
]


def _commits(*paths: str) -> list[dt.datetime]:
    argv = ["git", "-C", str(ROOT), "log", "--format=%aI", "main"]
    if paths:
        argv += ["--", *paths]
    out = subprocess.run(argv, capture_output=True, text=True, check=True).stdout
    return sorted(dt.datetime.fromisoformat(x).astimezone(dt.timezone.utc)
                  for x in out.split())


def _cron_fires(first: dt.datetime, last: dt.datetime) -> list[dt.datetime]:
    d = first.replace(hour=CRON_HOUR, minute=0, second=0, microsecond=0)
    while d.weekday() != CRON_WEEKDAY:
        d += dt.timedelta(days=1)
    fires = []
    while d < last:
        fires.append(d)
        d += dt.timedelta(days=7)
    return fires


def _window(fires: list[dt.datetime], closers: list[dt.datetime]) -> list[float]:
    """Days from each cron fire to the first commit after it. Open windows —
    a fire nothing has yet closed — are excluded from the summary rather than
    counted as zero, and reported separately by the caller."""
    out = []
    for f in fires:
        nxt = next((c for c in closers if c > f), None)
        if nxt is not None:
            out.append((nxt - f).total_seconds() / 86400)
    return out


def _summarise(label: str, vals: list[float]) -> None:
    if not vals:
        print(f"  {label:<12} no closed windows")
        return
    print(f"  {label:<12} n={len(vals):<3} median {statistics.median(vals):5.2f}d   "
          f"mean {statistics.fmean(vals):5.2f}d   max {max(vals):6.2f}d")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", help="ISO date; ignore cron fires before it "
                                    "(e.g. the date the cron went live)")
    ap.add_argument("--detail", action="store_true", help="print every window")
    args = ap.parse_args()

    all_commits = _commits()
    if not all_commits:
        raise SystemExit("no commits on main")
    fires = _cron_fires(all_commits[0], all_commits[-1])
    if args.since:
        cut = dt.datetime.fromisoformat(args.since).replace(tzinfo=dt.timezone.utc)
        fires = [f for f in fires if f >= cut]

    published = _commits(*PUBLISHED_ARTIFACTS)

    announced = _window(fires, all_commits)
    realised = _window(fires, published)
    open_windows = len(fires) - len(realised)

    print(f"weekly ETL cron: '0 {CRON_HOUR} * * {CRON_WEEKDAY - 6}' "
          f"(Sunday {CRON_HOUR:02d}:00 UTC), {len(fires)} fire(s) in range")
    if args.detail:
        print("\n  fire         -> any commit   -> site data regenerated")
        for f in fires:
            a = next((c for c in all_commits if c > f), None)
            r = next((c for c in published if c > f), None)
            fmt = lambda x: (f"{(x - f).total_seconds() / 86400:6.2f}d" if x else "  never")
            print(f"  {f:%Y-%m-%d}    {fmt(a)}        {fmt(r)}")

    print("\ndrift window, in days:")
    _summarise("ANNOUNCED", announced)
    _summarise("REALISED", realised)
    if open_windows:
        print(f"  {open_windows} cron fire(s) have STILL not been followed by a "
              f"regeneration of the site data.")

    if announced and realised:
        print(f"\n  A push-triggered guard would have cut the median drift from "
              f"{statistics.median(realised):.1f}d to {statistics.median(announced):.1f}d "
              f"— but only on the weeks somebody pushed.")


if __name__ == "__main__":
    main()
