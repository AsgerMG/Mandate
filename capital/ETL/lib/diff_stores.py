"""Compare two SQLite corpora table by table, at one instant, changing nothing.

Read-only, by construction: both connections open with `mode=ro`. This exists to
answer "what does each store hold that the other does not" BEFORE any merge, and
to answer it from one moment rather than from readings taken hours apart.

That last point is not pedantry. A "+EUR 55.6B, +1,451 events" delta was read as
the result of a weekly ETL run and reported upward as growth. It was neither: it
was the gap between two databases, measured an hour apart, one on a laptop and
one in a container. The stores had diverged in OPPOSITE directions -- the volume
accumulating events from the cron, the laptop holding the instrument corpus --
so every naive comparison was measuring the divergence and calling it change.

    python3 ETL/lib/diff_stores.py <a.sqlite> <b.sqlite>
"""
from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

# Tables where a row missing on one side is a MERGE CANDIDATE rather than a
# schema difference. Anything else is reported but not counted as data loss.
INTEREST = [
    ("public_funding_events", "id"),
    ("companies", "id"),
    ("funding_instruments", "id"),
    ("eligibility_gates", "id"),
    ("eligibility_clauses", "id"),
    ("funding_instrument_sources", None),   # composite key
]


def open_ro(p: Path) -> sqlite3.Connection:
    return sqlite3.connect(f"file:{p}?mode=ro", uri=True)


def tables(con: sqlite3.Connection) -> set[str]:
    return {r[0] for r in con.execute(
        "SELECT name FROM sqlite_master WHERE type='table'")}


def main() -> int:
    if len(sys.argv) < 3:
        return print(__doc__) or 2
    pa, pb = Path(sys.argv[1]).expanduser(), Path(sys.argv[2]).expanduser()
    a, b = open_ro(pa), open_ro(pb)
    ta, tb = tables(a), tables(b)

    print(f"A = {pa}")
    print(f"B = {pb}\n")

    only_a, only_b = sorted(ta - tb), sorted(tb - ta)
    if only_a or only_b:
        print("TABLES present in one store only:")
        for t in only_a: print(f"  A only: {t}")
        for t in only_b: print(f"  B only: {t}")
        print()

    print(f"{'table':32s} {'A':>10s} {'B':>10s} {'A-only':>9s} {'B-only':>9s}")
    for name, key in INTEREST:
        if name not in ta or name not in tb:
            print(f"{name:32s} {'-' if name not in ta else '?':>10s} "
                  f"{'-' if name not in tb else '?':>10s}   (absent one side)")
            continue
        na = a.execute(f"SELECT count(*) FROM {name}").fetchone()[0]
        nb = b.execute(f"SELECT count(*) FROM {name}").fetchone()[0]
        if not key:
            print(f"{name:32s} {na:>10,} {nb:>10,} {'(no key)':>9s} {'':>9s}")
            continue
        ka = {r[0] for r in a.execute(f"SELECT {key} FROM {name}")}
        kb = {r[0] for r in b.execute(f"SELECT {key} FROM {name}")}
        print(f"{name:32s} {na:>10,} {nb:>10,} {len(ka - kb):>9,} {len(kb - ka):>9,}")

    # The columns each store has and the other does not -- the schema drift that
    # broke the census coverage block, reported rather than discovered later.
    print("\nSCHEMA DRIFT (columns present one side only):")
    drift = 0
    for t in sorted(ta & tb):
        ca = {r[1] for r in a.execute(f"PRAGMA table_info({t})")}
        cb = {r[1] for r in b.execute(f"PRAGMA table_info({t})")}
        if ca - cb or cb - ca:
            drift += 1
            print(f"  {t}")
            if ca - cb: print(f"      A only: {', '.join(sorted(ca - cb))}")
            if cb - ca: print(f"      B only: {', '.join(sorted(cb - ca))}")
    if not drift:
        print("  none")
    return 0


if __name__ == "__main__":
    sys.exit(main())
