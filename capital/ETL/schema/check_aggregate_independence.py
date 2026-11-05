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

── Where this runs, and why that moved ────────────────────────────────────
It used to sit in CI, which cannot see the corpus. So on every run it has ever
had, it printed "skipping" and returned 0: a green tick from a check that had
not executed a single one of its assertions. It now runs in the weekly Railway
cron, against the store (schema `capital`), and publishes a verdict that CI
reads without needing credentials
(ETL/lib/guard_verdicts.py -> web/scripts/check_verdicts.ts).

The manipulation is an UPDATE of every funding_instruments row, made in a
transaction that is ALWAYS rolled back. Other sessions never see it (MVCC);
the rows are locked for the seconds compute_kpis takes, and a lock_timeout
means the guard fails rather than queues behind a writer.

Which makes the absent corpus a FAILURE here rather than a skip. There is no
longer any legitimate place this runs without one, and "the data was missing"
and "the assertions held" must not produce the same exit code -- that identity
is the entire defect being removed.

Run:  python3 ETL/schema/check_aggregate_independence.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "website" / "build" / "lib"))
sys.path.insert(0, str(ROOT / "ETL" / "lib"))

import etl_env  # noqa: E402,F401  (loads .env.local)
from corpus_kpis import compute_kpis  # noqa: E402

# Every scheme_end_date in the store is NULL or YYYY-MM-DD (checked 2026-11-05),
# so this is the same predicate SQLite's date() comparison was.
OFFERABLE = ("SELECT count(*) FROM funding_instruments WHERE scheme_end_date IS NULL "
             "OR scheme_end_date::date >= (now() AT TIME ZONE 'UTC')::date")


def main() -> int:
    if not os.environ.get("DATABASE_URL"):
        print("check_aggregate_independence: FAILED — no DATABASE_URL.")
        print("  This runs against the store. Nothing here can be asserted without")
        print("  it, and reporting that as a pass is what this check spent its")
        print("  whole life doing.")
        return 2
    from store import connect  # noqa: PLC0415

    with connect(readonly=True) as con:
        before = compute_kpis(con)

    # Force-close everything, in a transaction we never commit.
    with connect() as con:
        try:
            con.execute("SET LOCAL lock_timeout = '5s'")
            offerable_before = con.execute(OFFERABLE).fetchone()[0]
            con.execute("UPDATE funding_instruments SET scheme_end_date = '2000-01-01'")
            offerable_after = con.execute(OFFERABLE).fetchone()[0]
            after = compute_kpis(con)
        finally:
            con.rollback()

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
