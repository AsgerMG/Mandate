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
    python3 ETL/lib/merge_volume_into_local.py <volume.sqlite> --only companies

── Keying on `id` alone is only safe when somebody has checked ───────────────
This file's whole correctness rests on `id` meaning the same thing in both
stores, and for a long time nothing established that. It is not free:

  * both stores draw from the SAME `sqlite_sequence` counters, forked 2026-08-08,
    so an id issued after the fork was handed out twice -- and `INSERT OR IGNORE`
    would skip the volume's row while the after-check below reported the exact
    count a clean merge produces;
  * a row already here under a DIFFERENT id is not skipped, it is inserted a
    second time, and the count goes up by precisely the expected amount.

The after-check compares row COUNTS, and a count is the one thing that looks
right in both cases. So the check now runs IN FRONT of the merge rather than
beside it: `check_id_collisions.py` compares rows, and this refuses to write
unless it passes for the tables actually being merged. There is no override
flag. If it refuses, the answer is to scope the merge with `--only`, not to
argue with it -- on 2026-08-09 it correctly refused a five-table merge in which
every one of the 174 gates and 14 clauses on offer was a duplicate of a row
already here, under a different id, which would have broken a natural key
(instrument_id, gate_key) that had held exactly across 7,471 rows.
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

    only = None
    for i, a in enumerate(sys.argv):
        if a == "--only" and i + 1 < len(sys.argv):
            only = [t.strip() for t in sys.argv[i + 1].split(",") if t.strip()]
    tables = [(t, k) for t, k in MERGE if only is None or t in only]
    if only:
        unknown = set(only) - {t for t, _ in MERGE}
        if unknown:
            return print(f"--only names no such table: {sorted(unknown)}",
                         file=sys.stderr) or 2
        print(f"scoped to {', '.join(t for t, _ in tables)}\n")

    # The check in front of the merge, not beside it. Scoped to the same tables,
    # because refusing on a table this run will not touch would teach people to
    # reach for an override -- and there is deliberately no override.
    import check_id_collisions  # noqa: E402
    audit_con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    audit_con.execute("ATTACH DATABASE ? AS vol", (str(vol),))
    keep = check_id_collisions.IDENTITY
    check_id_collisions.IDENTITY = [
        row for row in keep if row[0] in {t for t, _ in tables}]
    try:
        print("id-collision audit (rows, not counts):")
        coll, alias, notes = check_id_collisions.audit(audit_con)
    finally:
        check_id_collisions.IDENTITY = keep
        audit_con.close()
    for n in notes:
        print(f"  NOTE  {n}")
    if coll or alias:
        print(f"\nREFUSING: {coll:,} id collision(s), {alias:,} alias(es). Keying on\n"
              f"  `id` is not safe for this set. Narrow it with --only.")
        return 1
    print()

    con = sqlite3.connect(DB)
    # Plain path, not a file: URI -- ATTACH only honours URIs when the
    # connection was opened with uri=True, and it fails opaquely otherwise.
    # The volume copy is only ever SELECTed from below; nothing writes to it.
    con.execute("ATTACH DATABASE ? AS vol", (str(vol),))

    before = {t: con.execute(f"SELECT count(*) FROM main.{t}").fetchone()[0]
              for t, _ in tables}

    plan = []
    for table, key in tables:
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
    for table, _ in tables:
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
