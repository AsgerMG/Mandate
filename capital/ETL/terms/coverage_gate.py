"""Refuse to publish a corpus that got worse.

── Why this exists ────────────────────────────────────────────────────────
Every serious defect this week was silent. Seeding one framework rule took 453
instruments from a full regime rulebook down to a single rule each, and nothing
failed: no exception, no test, no check. It surfaced only because somebody
happened to measure gate counts for an unrelated reason.

That class of failure is the one this product is least able to detect in
itself, because a thinner corpus still produces a confident brief. Coverage is
already measured; this makes the measurement load-bearing.

── How it behaves ─────────────────────────────────────────────────────────
Compares the current six axes against the last accepted snapshot. A drop beyond
tolerance fails, and the failure names the axis and the size of the fall.

Growth is never blocked, and neither is a fall that comes with a bigger corpus:
splitting ADEME added 75 instruments and moved several axes by a point or two
purely because the denominator changed. So the gate compares SHARES, and
tolerates a small drift — it is here to catch a collapse, not to freeze the
numbers.

Accepting a new baseline is deliberate and separate (`--accept`), so a
regression cannot be waved through by the same command that detects it.

Usage:
  python3 ETL/terms/coverage_gate.py            # check against the baseline
  python3 ETL/terms/coverage_gate.py --accept   # record the current state
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path

_sys.path.insert(0, str(_Path(__file__).resolve().parents[1] / "lib"))

import argparse  # noqa: E402
import datetime as _dt  # noqa: E402
import json  # noqa: E402
import sqlite3  # noqa: E402

from etl_env import DB, ROOT  # noqa: E402
from coverage_report import AXES, build  # noqa: E402

BASELINE = ROOT / "project-mgmt" / "coverage_baseline.json"

# How far an axis may fall before this is a regression rather than noise.
# A split changes the denominator and can move a share by a point or so
# legitimately; losing five points of an axis is never routine.
TOLERANCE_PP = 3.0


def snapshot(conn: sqlite3.Connection) -> dict:
    s = build(conn)["summary"]
    n = s["instruments"]
    return {
        "takenAt": _dt.date.today().isoformat(),
        "instruments": n,
        "complete": s["complete"],
        "shares": {a: round(100 * s["axes"][a] / n, 2) for a in AXES},
        "counts": {a: s["axes"][a] for a in AXES},
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--accept", action="store_true",
                    help="record the current state as the accepted baseline")
    args = ap.parse_args()

    conn = sqlite3.connect(DB)
    cur = snapshot(conn)
    conn.close()

    if args.accept or not BASELINE.exists():
        BASELINE.write_text(json.dumps(cur, indent=1) + "\n")
        what = "recorded" if args.accept else "no baseline yet, recorded"
        print(f"coverage_gate: {what} — {cur['complete']}/{cur['instruments']} "
              f"complete on all six")
        return

    old = json.loads(BASELINE.read_text())
    regressions = []
    for a in AXES:
        before, now = old["shares"].get(a, 0.0), cur["shares"][a]
        if before - now > TOLERANCE_PP:
            regressions.append(
                f"{a}: {before:.1f}% -> {now:.1f}%  "
                f"({old['counts'].get(a, 0)} -> {cur['counts'][a]} instruments)")

    print(f"coverage_gate: {cur['instruments']} instruments "
          f"({old['instruments']} at baseline, {old['takenAt']}), "
          f"{cur['complete']} complete on all six")
    for a in AXES:
        d = cur["shares"][a] - old["shares"].get(a, 0.0)
        arrow = "+" if d >= 0 else ""
        print(f"   {a:14}{cur['shares'][a]:6.1f}%  ({arrow}{d:.1f})")

    if regressions:
        print(f"\nFAIL: {len(regressions)} axis/axes fell more than {TOLERANCE_PP} points.")
        for r in regressions:
            print(f"  {r}")
        print("\nIf this is intended, re-run with --accept. Do not do that "
              "without knowing which change caused it.")
        raise SystemExit(1)
    print("\nno regression")


if __name__ == "__main__":
    main()
