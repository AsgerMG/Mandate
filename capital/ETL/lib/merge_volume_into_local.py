"""Union the ETL volume's rows into the local corpus. Never overwrite.

The weekly pipeline writes to a SQLite file on a Railway volume; instrument and
eligibility work is written to the laptop and published to Postgres. Nothing
reconciled the two, so they diverged in OPPOSITE directions and each ended up
holding what the other lacked.

Measured at one instant (`diff_stores.py`), volume against laptop:

    public_funding_events   311,355 / 309,898   volume-only 1,457   laptop-only 0
    companies               162,982 / 163,538   volume-only     0   laptop-only 556
    funding_instruments         322 /   1,086   volume-only     2   laptop-only 766
    eligibility_gates         4,018 /   6,368   volume-only    33   laptop-only 2,383
    eligibility_clauses         893 /     879   volume-only    14   laptop-only 0

The two sets are DISJOINT on every table -- there is no row present in both with
different values -- so this is a union with no conflict rule to argue about. The
1,457 volume-only events are EUR 55.71B of real awards (IPCEI microelectronics,
hydrogen and batteries; Spanish BDNS; ADEME) that the cron collected and that
never reached the product.

INSERT OR IGNORE, keyed on the primary key, in a transaction. A row that already
exists locally is left exactly as it is: the laptop is ahead on instruments and
this must not walk that back. Columns the volume does not have are left NULL
rather than defaulted, because a missing value and a zero are different claims.

    python3 ETL/lib/merge_volume_into_local.py <volume.sqlite> [--write]
"""
from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from etl_env import DB  # noqa: E402

# (table, primary key). Order matters: parents before children, so a child row
# never lands pointing at a parent that has not arrived.
MERGE = [
    ("companies", "id"),
    ("funding_instruments", "id"),
    ("public_funding_events", "id"),
    ("eligibility_gates", "id"),
    ("eligibility_clauses", "id"),
]


def main() -> int:
    if len(sys.argv) < 2:
        return print(__doc__) or 2
    vol = Path(sys.argv[1]).expanduser().resolve()
    write = "--write" in sys.argv
    if not vol.exists():
        return print(f"no such file: {vol}", file=sys.stderr) or 1

    con = sqlite3.connect(DB)
    # Plain path, not a file: URI -- ATTACH only honours URIs when the
    # connection was opened with uri=True, and it fails opaquely otherwise.
    # The volume copy is only ever SELECTed from below; nothing writes to it.
    con.execute("ATTACH DATABASE ? AS vol", (str(vol),))

    before = {t: con.execute(f"SELECT count(*) FROM main.{t}").fetchone()[0]
              for t, _ in MERGE}

    plan = []
    for table, key in MERGE:
        vcols = {r[1] for r in con.execute(f"PRAGMA vol.table_info({table})")}
        lcols = [r[1] for r in con.execute(f"PRAGMA main.table_info({table})")]
        if not vcols:
            print(f"  {table:26s} absent from the volume, skipping")
            continue
        # Only columns BOTH sides have; the laptop's extra 35 columns on
        # funding_instruments are this week's work and are not in the volume.
        shared = [c for c in lcols if c in vcols]
        n = con.execute(
            f"SELECT count(*) FROM vol.{table} v WHERE v.{key} NOT IN "
            f"(SELECT {key} FROM main.{table})").fetchone()[0]
        plan.append((table, key, shared, n))
        print(f"  {table:26s} would insert {n:>7,}  ({len(shared)} shared columns)")

    if not write:
        print("\nDRY RUN — nothing written. Re-run with --write.")
        return 0

    try:
        con.execute("BEGIN")
        for table, key, shared, _ in plan:
            cols = ", ".join(f'"{c}"' for c in shared)
            con.execute(
                f"INSERT OR IGNORE INTO main.{table} ({cols}) "
                f"SELECT {cols} FROM vol.{table} v WHERE v.{key} NOT IN "
                f"(SELECT {key} FROM main.{table})")
        con.commit()
    except Exception:
        con.rollback()
        raise

    print("\nAFTER — every table must be a superset:")
    ok = True
    for table, _ in MERGE:
        after = con.execute(f"SELECT count(*) FROM main.{table}").fetchone()[0]
        delta = after - before[table]
        flag = "" if after >= before[table] else "   LOST ROWS"
        if after < before[table]:
            ok = False
        print(f"  {table:26s} {before[table]:>8,} -> {after:>8,}  {delta:+,}{flag}")
    con.close()
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
