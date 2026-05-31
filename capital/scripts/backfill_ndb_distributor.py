"""Backfill entrusted_entity + financial_intermediaries onto public_funding_events,
then run the NDB-distributor classifier across all three identifier fields
(granting_authority, entrusted_entity, financial_intermediaries) and set
public_funding_events.ndb_distributor.

For SATR rows (satr_tm_id IS NOT NULL): joins to satr_staging on tm_id to pull
the staging-only fields and copies them into public_funding_events. Also
classifies based on all three fields jointly.

For non-SATR rows (existing NDB scrapers + EU instruments): classifies based on
granting_authority alone (entrusted_entity and financial_intermediaries are
NULL for non-SATR rows).

Usage:
    python scripts/backfill_ndb_distributor.py            # full backfill
    python scripts/backfill_ndb_distributor.py --report   # report only, no writes
"""
from __future__ import annotations

import argparse
import sqlite3
import sys
from collections import Counter
from pathlib import Path

# Make scripts.* importable
sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.lib.ndb_taxonomy import (  # noqa: E402
    classify_ndb,
    classify_ndb_from_source,
    NDB_LABELS,
)

DB_PATH = Path(__file__).parent.parent / "db.sqlite"


def backfill_satr_columns(conn: sqlite3.Connection) -> int:
    """Copy entrusted_entity and financial_intermediaries from satr_staging
    onto public_funding_events for matching tm_ids.
    """
    cur = conn.execute(
        """
        UPDATE public_funding_events
        SET entrusted_entity = (
                SELECT entrusted_entity FROM satr_staging
                WHERE satr_staging.tm_id = public_funding_events.satr_tm_id
            ),
            financial_intermediaries = (
                SELECT financial_intermediaries FROM satr_staging
                WHERE satr_staging.tm_id = public_funding_events.satr_tm_id
            )
        WHERE satr_tm_id IS NOT NULL
        """
    )
    conn.commit()
    return cur.rowcount


def tag_ndb_distributor(conn: sqlite3.Connection) -> tuple[int, Counter]:
    """Tag ndb_distributor on every public_funding_events row.

    Two-pass logic:
      1. SATR rows + ministry-granted rows: classify by granting_authority,
         entrusted_entity, financial_intermediaries.
      2. Direct-NDB-scraper rows (htgf_*, cdti_*, etc.): classify by source
         prefix. This unifies the NDB layer across both ingestion paths.
    Source-prefix-based classification wins over text classification when
    both produce a hit (the source prefix is the authoritative ingestion-time
    tag from Sprint 13).
    """
    rows = conn.execute(
        """
        SELECT id, source, granting_authority, entrusted_entity, financial_intermediaries
        FROM public_funding_events
        """
    ).fetchall()

    counts: Counter = Counter()
    updates: list[tuple[str | None, int]] = []
    for row_id, source, ga, ee, fi in rows:
        # Source prefix is authoritative — it's an explicit Sprint-13 tag.
        ndb = classify_ndb_from_source(source)
        if ndb is None:
            ndb = classify_ndb(ga, ee, fi)
        counts[ndb] += 1
        if ndb is not None:
            updates.append((ndb, row_id))

    cur = conn.cursor()
    cur.executemany(
        "UPDATE public_funding_events SET ndb_distributor=? WHERE id=?",
        updates,
    )
    conn.commit()

    return len(updates), counts


def report(conn: sqlite3.Connection) -> None:
    print("=== NDB-distributor coverage on public_funding_events ===\n")

    n_total = conn.execute(
        "SELECT COUNT(*) FROM public_funding_events"
    ).fetchone()[0]
    n_tagged = conn.execute(
        "SELECT COUNT(*) FROM public_funding_events WHERE ndb_distributor IS NOT NULL"
    ).fetchone()[0]
    print(f"  Total events:           {n_total:,}")
    print(f"  NDB-distributor tagged: {n_tagged:,}  ({100*n_tagged/n_total:.1f}%)\n")

    print("  Top NDB distributors by event count:")
    print(f"  {'NDB id':25} {'events':>7} {'companies':>10} {'€M':>10}  Label")
    for ndb, events, companies, eur in conn.execute(
        """
        SELECT ndb_distributor, COUNT(*) AS n, COUNT(DISTINCT company_id) AS c,
               ROUND(SUM(grant_amount_eur)/1e6, 1) AS m
        FROM public_funding_events
        WHERE ndb_distributor IS NOT NULL
        GROUP BY 1 ORDER BY 2 DESC LIMIT 40
        """
    ):
        label = NDB_LABELS.get(ndb, "?")
        eur_s = f"{eur:,}" if eur else "-"
        print(f"  {ndb:25} {events:>7,} {companies:>10,} {eur_s:>10}  {label}")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--report", action="store_true",
                    help="Print report only, skip backfill + tagging")
    args = ap.parse_args()

    conn = sqlite3.connect(DB_PATH)
    try:
        if not args.report:
            print("Step 1: Backfill entrusted_entity + financial_intermediaries from satr_staging...")
            n_satr = backfill_satr_columns(conn)
            print(f"  Updated {n_satr:,} SATR rows.\n")

            print("Step 2: Tag ndb_distributor across all events...")
            n_tagged, counts = tag_ndb_distributor(conn)
            print(f"  Tagged {n_tagged:,} events with a canonical NDB id.")
            print(f"  Untagged (no NDB pattern match): {counts[None]:,}\n")

        report(conn)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
