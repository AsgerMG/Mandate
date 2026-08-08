"""Refuse to publish a corpus that got worse.

── Why this exists ────────────────────────────────────────────────────────
Every serious defect this week was silent. Seeding one framework rule took 453
instruments from a full regime rulebook down to a single rule each, and nothing
failed: no exception, no test, no check. It surfaced only because somebody
happened to measure gate counts for an unrelated reason.

That class of failure is the one this product is least able to detect in
itself, because a thinner corpus still produces a confident brief. Coverage is
already measured; this makes the measurement load-bearing.

── The question, and why percentages alone cannot answer it ───────────────
The question is "does the corpus know LESS than it did". The first version
answered it with percentages only, and percentages answer a different question:
"is the corpus, on average, better documented". Those come apart in both
directions, and both were observed:

  FALSE ALARM (2026-08-06).  150 instruments joined the corpus. Every single
    axis GAINED about seventy instruments -- eligibility 826->897, funds
    858->930, amount 779->851, route 838->908, live 841->913, complete 743->815
    -- and five of the six axes fell more than seven points as shares, because
    the arrivals were less documented than the incumbents. The gate failed a
    run in which nothing whatsoever was lost.

  BLIND SPOT (never caught, because nothing looked).  Delete 150 instruments of
    which 130 had a known application route: n 1011->861, route 908->778, share
    89.8% -> 90.4%. The share RISES. A percentage gate passes a run that threw
    away what 130 funds told us, because the denominator fell with it.

So the two failure modes are separate things and get separate tests:

  LOSS       an axis holds fewer instruments than it ever has. Absolute, so it
             is immune to the denominator. This is a regression whatever the
             corpus did in size, and it is the one that matters.

  DILUTION   an axis's share fell AND its count did not rise: rows were added
             that we know nothing about. Growth that dilutes is growth and is
             never blocked; growth that adds only empty rows is stopped.

── Why LOSS compares against a high-water mark ────────────────────────────
An axis is compared against the most it has ever held, not against last week.
A tolerance measured from the last run is a ratchet you can walk down one
tolerated step at a time -- lose four a week for ten weeks and no single run
ever fails while forty instruments' worth of research is gone. Against a
high-water mark the same walk fails on the second step.

The mark only ever rises on its own. Lowering it is `--accept`: deliberate,
human, and a different command from the one that detects the problem. That is
the right shape for a legitimate shrink -- deleting GB's sixteen fake funds on
2026-08-07 correctly reduced several axes, and saying so out loud is the point.

Usage:
  python3 ETL/terms/coverage_gate.py            # check; advance the mark on a pass
  python3 ETL/terms/coverage_gate.py --dry-run  # check, write nothing
  python3 ETL/terms/coverage_gate.py --accept   # record the current state, mark included
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

_sys.path.insert(0, str(ROOT / "website" / "build" / "lib"))
from corpus_kpis import compute_kpis  # noqa: E402

BASELINE = ROOT / "project-mgmt" / "coverage_baseline.json"

# How far a SHARE may fall before dilution is worth stopping for. Only ever
# consulted when the axis gained nothing, so this is not the loose knob it
# looks like -- see DILUTION above.
TOLERANCE_PP = 3.0

# How far a COUNT may fall below its high-water mark before that is a loss
# rather than the noise of re-splitting a regime. Proportional with a floor:
# three instruments is small enough to be a rounding of parent/child gate
# inheritance, and 0.5% keeps it that way as the corpus grows.
COUNT_TOLERANCE_FLOOR = 3
COUNT_TOLERANCE_SHARE = 0.005


def count_tolerance(baseline_count: int) -> int:
    return max(COUNT_TOLERANCE_FLOOR, round(COUNT_TOLERANCE_SHARE * baseline_count))


# ── The headline figures, which this gate could not see until now ────────────
# The gate judged the INSTRUMENT corpus -- the funds and their coverage axes --
# and nothing else. The figures a founder actually reads on the home page
# (companies, events, euros, countries, sectors) went straight from
# corpus_kpis.py onto the page with nothing standing between them, and that was
# survivable only while a human had to run `make data` and would presumably
# notice. The site now reads them live from the census, so the last human in the
# path is gone and the only thing left to notice is this.
#
# Which is not a hypothetical omission. Census #4, 2026-08-07, the first ever
# taken inside the Railway container:
#
#     companies 151,426 -> 150,868      sectors 11 -> 8
#     events    297,933 -> 299,384      capital EUR 352.9B -> 408.4B
#
# Three of the eleven sector families vanished. The gate as it stood had no
# opinion, because none of those numbers was an axis.
#
# Only LOSS applies. There is no dilution analogue for a KPI: `companies` has no
# denominator to be diluted against, and "we recorded more events than last
# week" is the corpus working.
KPI_AXES = (
    "companies", "events", "champions", "step_companies",
    "total_capital_eur_raw", "countries", "source_families", "sectors",
)

# A KPI's tolerance is PROPORTIONAL ONLY -- no floor.
#
# The instrument axes carry a floor of three because a parent/child re-split of
# one regime legitimately moves a handful of rows, and 3-in-900 is noise. The
# KPIs have no such mechanism, and two of them are small: `sectors` is 11 and
# `countries` is 23, so a floor of three would license losing 27% of the sector
# taxonomy without a word. Census #4 lost exactly three sectors. The same 0.5%
# that is generous on 151,426 companies is strict where it needs to be.
KPI_TOLERANCE_SHARE = 0.005


def kpi_tolerance(mark: float) -> float:
    return max(1.0, KPI_TOLERANCE_SHARE * abs(mark))


def snapshot(conn: sqlite3.Connection) -> dict:
    s = build(conn)["summary"]
    n = s["instruments"]
    return {
        "takenAt": _dt.date.today().isoformat(),
        "instruments": n,
        "complete": s["complete"],
        "shares": {a: round(100 * s["axes"][a] / n, 2) for a in AXES},
        "counts": {a: s["axes"][a] for a in AXES},
        # THE canonical definitions, imported rather than restated. corpus_kpis
        # is stdlib-only precisely so it can be reached from here and from the
        # census inside the ETL image; a lookalike query in this file would be
        # the fourth time this repo learned that lesson.
        "kpis": compute_kpis(conn),
    }


def _high_water(baseline: dict) -> dict:
    """The most each axis has ever held.

    Absent from baselines written before this rule existed, in which case the
    last accepted state is the best evidence available and is used as the mark.
    That is the conservative reading: it cannot invent a mark higher than
    something the corpus actually reached.
    """
    hw = baseline.get("highWater")
    if hw:
        # `kpis` is absent from every mark written before the KPI axes existed.
        # Absent means "no mark", which means "not judged" -- the same reading
        # the per-axis loop already gives a missing axis. It establishes itself
        # on the first passing run rather than inventing a mark from a single
        # observation, because a mark invented from one reading would fail the
        # NEXT run on any legitimate movement.
        return {**hw, "kpis": hw.get("kpis", {})}
    return {"counts": dict(baseline.get("counts", {})),
            "complete": baseline.get("complete", 0),
            "kpis": {}}


def evaluate(current: dict, baseline: dict) -> tuple[bool, list[str], list[str]]:
    """Compare a snapshot against a baseline. Pure: reads nothing, writes nothing.

    Returns (ok, failures, notes). `notes` carries the growth-that-diluted
    lines — true, worth printing, and never a reason to stop.
    """
    hw = _high_water(baseline)
    failures: list[str] = []
    notes: list[str] = []

    # ── LOSS ────────────────────────────────────────────────────────────────
    for axis in AXES:
        mark = hw["counts"].get(axis)
        if mark is None:
            continue
        now = current["counts"][axis]
        tol = count_tolerance(mark)
        if mark - now > tol:
            failures.append(
                f"LOSS  {axis}: {now} instruments, down from a high of {mark} "
                f"(tolerance {tol}). Something the corpus knew, it no longer knows.")

    # ── LOSS, on the figures the site publishes ─────────────────────────────
    for kpi in KPI_AXES:
        mark = hw.get("kpis", {}).get(kpi)
        now = current.get("kpis", {}).get(kpi)
        if mark is None or now is None:
            continue
        tol = kpi_tolerance(mark)
        if mark - now > tol:
            failures.append(
                f"LOSS  {kpi}: {now:,.0f}, down from a high of {mark:,.0f} "
                f"(tolerance {tol:,.0f}). This is a figure on the home page.")

    mark_complete = hw.get("complete")
    if mark_complete is not None:
        now_complete = current["complete"]
        tol = count_tolerance(mark_complete)
        if mark_complete - now_complete > tol:
            failures.append(
                f"LOSS  complete: {now_complete} instruments documented on all six, "
                f"down from a high of {mark_complete} (tolerance {tol}).")

    # ── DILUTION ────────────────────────────────────────────────────────────
    for axis in AXES:
        before_share = baseline.get("shares", {}).get(axis)
        if before_share is None:
            continue
        now_share = current["shares"][axis]
        fell = before_share - now_share
        if fell <= TOLERANCE_PP:
            continue
        before_count = baseline.get("counts", {}).get(axis, 0)
        now_count = current["counts"][axis]
        if now_count > before_count:
            notes.append(
                f"{axis}: {before_share:.1f}% -> {now_share:.1f}% while the count "
                f"ROSE {before_count} -> {now_count}. The corpus grew "
                f"{baseline.get('instruments', 0)} -> {current['instruments']}; "
                f"nothing was lost, the new arrivals are thinner.")
        else:
            failures.append(
                f"DILUTION  {axis}: {before_share:.1f}% -> {now_share:.1f}% and the "
                f"count did not rise ({before_count} -> {now_count}). Rows were "
                f"added that nothing is known about.")

    return not failures, failures, notes


def advance(baseline: dict, current: dict) -> dict:
    """The baseline after a passing run.

    Shares and counts move to the current state so growth stops re-reporting
    itself. The high-water mark only ever rises — that is what makes the
    tolerance non-cumulative.
    """
    hw = _high_water(baseline)
    return {
        **current,
        "highWater": {
            "counts": {a: max(hw["counts"].get(a, 0), current["counts"][a])
                       for a in AXES},
            "complete": max(hw.get("complete", 0), current["complete"]),
            "kpis": {k: max(hw.get("kpis", {}).get(k, 0), v)
                     for k, v in current.get("kpis", {}).items()},
        },
    }


def accept(current: dict) -> dict:
    """A deliberately re-set baseline: the mark comes down to today."""
    return {**current,
            "highWater": {"counts": dict(current["counts"]),
                          "complete": current["complete"],
                          "kpis": dict(current.get("kpis", {}))}}


def _report(current: dict, baseline: dict, failures: list[str], notes: list[str]) -> None:
    hw = _high_water(baseline)
    print(f"coverage_gate: {current['instruments']} instruments "
          f"({baseline.get('instruments', 0)} at baseline, "
          f"{baseline.get('takenAt', '?')}), "
          f"{current['complete']} complete on all six "
          f"(high {hw.get('complete', 0)})")
    for a in AXES:
        d = current["shares"][a] - baseline.get("shares", {}).get(a, 0.0)
        dc = current["counts"][a] - baseline.get("counts", {}).get(a, 0)
        print(f"   {a:14}{current['shares'][a]:6.1f}%  ({d:+.1f}pp)   "
              f"{current['counts'][a]:5d}  ({dc:+d}, high {hw['counts'].get(a, 0)})")
    kpis = current.get("kpis") or {}
    if kpis:
        print("   the figures on the home page:")
        for k in KPI_AXES:
            if k not in kpis:
                continue
            mark = hw.get("kpis", {}).get(k)
            mark_s = f"high {mark:,.0f}" if mark is not None else "no mark yet"
            print(f"   {k:24}{kpis[k]:>18,.0f}   ({mark_s})")
    for n in notes:
        print(f"\n   growth, not regression — {n}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--accept", action="store_true",
                    help="record the current state as the accepted baseline, "
                         "lowering the high-water mark to it")
    ap.add_argument("--dry-run", action="store_true",
                    help="check and report; never write the baseline")
    args = ap.parse_args()

    conn = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    try:
        cur = snapshot(conn)
    finally:
        conn.close()

    if args.accept or not BASELINE.exists():
        BASELINE.write_text(json.dumps(accept(cur), indent=1) + "\n")
        what = "recorded" if args.accept else "no baseline yet, recorded"
        print(f"coverage_gate: {what} — {cur['complete']}/{cur['instruments']} "
              f"complete on all six")
        return

    old = json.loads(BASELINE.read_text())
    ok, failures, notes = evaluate(cur, old)
    _report(cur, old, failures, notes)

    if not ok:
        print(f"\nFAIL: {len(failures)} regression(s).")
        for f in failures:
            print(f"  {f}")
        print("\nIf this is intended — a corpus that legitimately shrank, like "
              "deleting rows that were never funds — re-run with --accept. Do "
              "not do that without knowing which change caused it.")
        raise SystemExit(1)

    if not args.dry_run:
        BASELINE.write_text(json.dumps(advance(old, cur), indent=1) + "\n")
    print("\nno regression")


if __name__ == "__main__":
    main()
