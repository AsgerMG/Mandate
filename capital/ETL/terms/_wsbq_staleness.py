"""Did attribution DECAY, or was it never there?

WS-BQ. 88.5% of awards do not resolve to an exact leaf. That is a RATE, and a
rate cannot say whether something broke. Two stories fit it equally well:

  DECAY       the children exist in the ETL's own logic but not in the table,
              because the corpus moved and `populate_funding_instruments.py`
              did not run against it. Repairable by running the rebuild.
  STRUCTURAL  the ETL, run on today's corpus, would create exactly the children
              that exist. Then nothing decayed; the rate is what the sources
              publish, and no rerun changes it.

The two are distinguishable, and this distinguishes them. It replays the child
key derivation from `populate_funding_instruments.py` against today's events --
the same `programme_split` test, the same `split_targets`, the same
MIN_CHILD_EVENTS floor -- and diffs the children that logic WANTS against the
children `funding_instruments` HOLDS, read from Postgres.

Read-only. It creates nothing and writes nothing.

  python3 ETL/terms/_wsbq_staleness.py
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB, ROOT  # noqa: E402

import collections  # noqa: E402
import os  # noqa: E402
import sqlite3  # noqa: E402

import psycopg2  # noqa: E402

_sys.path.insert(0, str(ROOT / "ETL" / "events" / "load"))
from populate_funding_instruments import (  # noqa: E402
    MIN_CHILD_EVENTS, source_to_family, split_families,
)


def main() -> None:
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise SystemExit("DATABASE_URL is required")
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row

    # WHAT EXISTS -- from Postgres, the corpus of record for what a fund is.
    db = psycopg2.connect(dsn)
    cur = db.cursor()
    cur.execute("SELECT parent_id, name, COALESCE(scheme_code,''), id "
                "FROM funding_instruments "
                " WHERE parent_id IS NOT NULL AND parent_id != ''")
    have = {(p, (n or "")[:200], c.strip()): i for p, n, c, i in cur.fetchall()}
    cur.execute("SELECT COUNT(*) FROM funding_instruments")
    n_inst = cur.fetchone()[0]
    db.close()
    print(f"Postgres: {n_inst} instruments, {len(have)} of them children")

    # WHAT THE ETL WOULD BUILD -- the same derivation, replayed on today's
    # events. `split_targets` reads funding_instruments, so it is taken from
    # the same store the children were, keeping the comparison honest.
    programme_split = {r[0] for r in conn.execute("""
        SELECT source FROM public_funding_events
         WHERE programme_name IS NOT NULL AND programme_name != ''
         GROUP BY source
        HAVING COUNT(*) >= ? AND COUNT(DISTINCT programme_name) > 1
    """, (MIN_CHILD_EVENTS,))}
    split_targets = split_families(conn)
    print(f"programme-split sources {len(programme_split)}, "
          f"SATR split families {len(split_targets)}")

    rows = conn.execute("""
        SELECT e.source, e.programme_name, e.granting_authority, e.call_id
          FROM public_funding_events e
         INNER JOIN v_european_companies c ON c.id = e.company_id
         INNER JOIN v_events v ON v.id = e.id
         WHERE COALESCE(e.is_duplicate, 0) = 0
    """).fetchall()
    print(f"events considered by the rebuild: {len(rows):,}")

    want: collections.Counter = collections.Counter()
    for r in rows:
        fam = source_to_family(r["source"])
        prog = (r["programme_name"] or "").strip()
        if prog and r["source"] in programme_split:
            want[(fam, prog[:200], "")] += 1
        elif fam in split_targets and r["granting_authority"] and r["call_id"]:
            want[(fam, r["granting_authority"][:200], r["call_id"])] += 1

    kept = {k: n for k, n in want.items() if n >= MIN_CHILD_EVENTS}
    print(f"child keys the derivation forms: {len(want):,}; "
          f"above MIN_CHILD_EVENTS={MIN_CHILD_EVENTS}: {len(kept):,}")
    print()

    missing = {k: n for k, n in kept.items() if k not in have}
    extra = {k: i for k, i in have.items() if k not in kept}
    print("── the diff that answers the question ──────────────────────────")
    print(f"  children the rebuild WOULD create and the table lacks: {len(missing):,}")
    print(f"  children the table HOLDS and the rebuild would not:    {len(extra):,}")
    print(f"  children in both:                                     "
          f"{len(set(kept) & set(have)):,}")
    print()
    if missing:
        print("  awards those missing children would place: "
              f"{sum(missing.values()):,}")
        print("  largest missing children:")
        for k, n in sorted(missing.items(), key=lambda kv: -kv[1])[:15]:
            print(f"    {n:>7,}  {k[0]:<28} {k[1][:60]:<60} {k[2]}")
    if extra:
        print("  largest children the rebuild would drop:")
        for k in list(extra)[:10]:
            print(f"    {k[0]:<28} {k[1][:60]:<60} {k[2]}")

    # A near-miss census. If most of the unplaceable mass sits just under the
    # floor, the rate is a THRESHOLD choice; if it sits far under, it is what
    # the sources publish.
    print()
    print("── the floor, and how much sits under it ───────────────────────")
    below = {k: n for k, n in want.items() if n < MIN_CHILD_EVENTS}
    print(f"  keys below the floor: {len(below):,}, "
          f"holding {sum(below.values()):,} awards")
    for lo, hi in ((1, 2), (2, 5), (5, 10), (10, 20), (20, 40)):
        band = [n for n in below.values() if lo <= n < hi]
        print(f"    {lo:>3}-{hi - 1:<3} events  {len(band):>7,} keys  "
              f"{sum(band):>9,} awards")
    unkeyed = len(rows) - sum(want.values())
    print(f"  events the derivation forms NO key for at all: {unkeyed:,} "
          f"({unkeyed / len(rows):.1%})")
    conn.close()


if __name__ == "__main__":
    main()
