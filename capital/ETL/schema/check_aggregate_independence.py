"""The corpus we TRACK and the funds we OFFER are two different populations.

── The contract ──────────────────────────────────────────────────────────────
  AGGREGATES (the headline figures, the maps, "how much public capital we
  track") count EVERYTHING ever recorded -- including schemes that have since
  closed and calls whose windows shut years ago. That history is the asset. A
  fund closing does not un-spend the money it spent.

  BRIEFS (the five funds a founder is told to apply to) contain ONLY what a
  founder can apply to today. A closed call in a memo is worse than no memo.

Stated by the PM, 2026-08-07. It held at the time -- but only by accident of
structure: `corpus_kpis.py` happens to count from `companies` and
`public_funding_events` and never joins `funding_instruments`, so liveness
cannot reach it. Nothing prevented the next query from joining it, and this
week alone the corpus lost 16 rows to a deletion, 306 to closure and 11 to a
route withholding. Any one of those, wired into a KPI, would have quietly
shrunk the number on the home page.

So the contract is asserted rather than assumed, from both sides:

  1. Liveness cannot reach the aggregate. Every instrument in the database is
     force-closed inside a transaction, the KPIs are recomputed, and the
     figures must be IDENTICAL. Rolled back afterwards; nothing is written.
  2. The offerable set does move under the same change -- otherwise assertion 1
     would pass trivially on a corpus where liveness does nothing at all, and
     the test would be measuring its own irrelevance.

Run:  python3 ETL/schema/check_aggregate_independence.py
"""
from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "website" / "build" / "lib"))

from corpus_kpis import compute_kpis  # noqa: E402


def main() -> int:
    db = ROOT / "data" / "db.sqlite"
    if not db.exists():
        print(f"check_aggregate_independence: no {db}, skipping")
        return 0

    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    before = compute_kpis(con)
    con.close()

    # Force-close everything, in a transaction we never commit.
    con = sqlite3.connect(db)
    try:
        con.execute("BEGIN")
        offerable_before = con.execute(
            "SELECT count(*) FROM funding_instruments WHERE scheme_end_date IS NULL "
            "OR date(scheme_end_date) >= date('now')").fetchone()[0]
        con.execute("UPDATE funding_instruments SET scheme_end_date = '2000-01-01'")
        offerable_after = con.execute(
            "SELECT count(*) FROM funding_instruments WHERE scheme_end_date IS NULL "
            "OR date(scheme_end_date) >= date('now')").fetchone()[0]
        after = compute_kpis(con)
    finally:
        con.rollback()
        con.close()

    problems = []
    for key in sorted(set(before) | set(after)):
        if before.get(key) != after.get(key):
            problems.append(f"    {key}: {before.get(key)} -> {after.get(key)}")

    # Assertion 2: the manipulation has to actually do something, or assertion
    # 1 is vacuous.
    if offerable_after >= offerable_before:
        problems.append(
            f"    the test is vacuous: force-closing every instrument left the "
            f"offerable count at {offerable_after} (was {offerable_before}), so "
            f"assertion 1 proved nothing")

    if problems:
        print("check_aggregate_independence: FAILED\n")
        print("  Closing every fund changed a figure we report as TRACKED.")
        print("  Aggregates count what we have ever recorded; only briefs are")
        print("  filtered to what a founder can apply to today.\n")
        print("\n".join(problems))
        print("\n  Look for a liveness column joined into corpus_kpis.py, or an")
        print("  instrument DELETE that cascaded into companies/events.")
        return 1

    print(f"check_aggregate_independence: ok — closing all "
          f"{offerable_before} offerable instruments leaves every corpus figure "
          f"unchanged ({before['companies']:,} companies, {before['events']:,} "
          f"events, {before['countries']} countries); offerable falls to "
          f"{offerable_after}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
