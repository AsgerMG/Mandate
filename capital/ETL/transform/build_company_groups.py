"""Populate companies.company_group — name-based sister-entity rollup key.

Reuses the audit_dedup.py normalization (shared canonical form), so the groups
are exactly the same-name buckets the dedup sweep sees: same-country members
are unapplied merge candidates, cross-country members are sister entities kept
separate by the IPCEI NOMAGIC convention. Either way, rolling them up under one
key is correct for "largest recipient group" analyses.

The group key is the shared normalized name (lowercase). NULL = singleton.

Guards:
  - normalized name must be >= 4 chars (junk/initials excluded)
  - buckets larger than MAX_GROUP members are skipped and reported instead of
    tagged (a 30-company "group" is a generic-name collision, not a parent)

Reset-then-tag: clears all existing keys first, so re-runs are reproducible
from the current companies table. Requires migration 006.

Usage: python3 ETL/transform/build_company_groups.py
"""

import sqlite3
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib"))
from etl_env import DB as DB_PATH  # noqa: E402 (wires ETL extract/transform/load/qa/lib onto sys.path)
from audit_dedup import normalize_name  # noqa: E402

MIN_NORM_LEN = 4
MAX_GROUP = 25


def main() -> None:
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()

    cur.execute("UPDATE companies SET company_group=NULL WHERE company_group IS NOT NULL")
    print(f"Reset {cur.rowcount} existing keys")

    buckets: dict[str, list[int]] = defaultdict(list)
    for cid, name in cur.execute("SELECT id, canonical_name FROM companies"):
        norm = normalize_name(name or "")
        if len(norm) >= MIN_NORM_LEN:
            buckets[norm].append(cid)

    tagged_groups = 0
    tagged_companies = 0
    skipped_oversize: list[tuple[str, int]] = []
    for norm, ids in buckets.items():
        if len(ids) < 2:
            continue
        if len(ids) > MAX_GROUP:
            skipped_oversize.append((norm, len(ids)))
            continue
        cur.executemany(
            "UPDATE companies SET company_group=? WHERE id=?",
            [(norm, cid) for cid in ids],
        )
        tagged_groups += 1
        tagged_companies += len(ids)

    con.commit()
    print(f"Tagged {tagged_companies} companies into {tagged_groups} groups")
    if skipped_oversize:
        print(f"Skipped {len(skipped_oversize)} oversize buckets (> {MAX_GROUP} members):")
        for norm, n in sorted(skipped_oversize, key=lambda x: -x[1])[:10]:
            print(f"  {n:>4}  {norm}")

    print("\nTop 10 groups by total committed funding:")
    for row in cur.execute(
        """SELECT c.company_group, COUNT(DISTINCT c.id) members,
                  COUNT(DISTINCT c.country) countries,
                  ROUND(SUM(COALESCE(e.grant_amount_eur,0) + COALESCE(e.debt_amount_eur,0)
                        + COALESCE(e.equity_amount_eur,0)) / 1e6, 1) total_m
           FROM companies c JOIN public_funding_events e ON e.company_id = c.id
           WHERE c.company_group IS NOT NULL
           GROUP BY c.company_group ORDER BY total_m DESC LIMIT 10"""
    ):
        print(f"  €{row[3]:>9}M  {row[1]:>2} entities / {row[2]} countries  {row[0]}")

    con.close()


if __name__ == "__main__":
    main()
