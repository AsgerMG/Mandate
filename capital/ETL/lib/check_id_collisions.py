"""Before unioning two stores: prove no `id` means two different things.

`merge_volume_into_local.py` is `INSERT OR IGNORE ... WHERE id NOT IN (SELECT id
FROM main)`. That is exactly right when an `id` names the same real-world thing
in both stores, and silently destructive when it does not -- and nothing
established which of those was true.

Both stores allocate from the SAME `sqlite_sequence` counter, forked on
2026-08-08. Every id issued before the fork is shared history. Every id issued
after it was handed out TWICE, once by each store, to two unrelated rows. So the
merge has two failure modes, and its after-check -- which compares row COUNTS --
cannot see either of them:

  COLLISION   same id, different thing.  `id NOT IN` says "already have it", the
              volume's row is skipped, and the count is exactly what a clean
              merge would produce. The row is not lost loudly; it is lost
              silently, and the number at the end says 'ok'.

  ALIAS       same thing, different ids. `id NOT IN` says "new", and the entity
              is inserted a second time. The count goes UP by the expected
              amount, so this too reads as success.

A count is the one thing that is right in both failure modes. This reads rows.

    python3 ETL/lib/check_id_collisions.py <volume.sqlite>
    python3 ETL/lib/check_id_collisions.py --self-test

Exit 0 only when every shared id names the same thing on both sides. RUN IT
BEFORE THE MERGE, not after: afterwards the two rows are one row and the
evidence is gone.

── On the identity tuples ────────────────────────────────────────────────────
Identity is DECLARED here, per table, rather than inferred, because these tables
carry no unique index -- `sqlite_master` has not one UNIQUE on any of the five,
so there is nothing to read the answer off. A declared tuple is reviewable; an
inferred one is a guess wearing a proof.

Two exclusions are deliberate:

  * Foreign-key columns (`company_id`, `instrument_id`) are NOT identity for
    the tables that point with them. They are ids drawn from the same forked
    counters, so using one to establish identity assumes the answer. Where a
    child table has nothing else to be identified by, this file says so in the
    verdict rather than pretending the tuple is stronger than it is.

  * Enrichment and timestamps (`*_updated_at`, `created_at`, classifier output)
    are NOT identity. The laptop has classified rows the volume has not; that is
    the divergence working as intended, not two things sharing an id. Reporting
    it as a collision would bury the real ones under thousands of false ones.

Text is compared trimmed and case-folded. `"ACME Oy"` and `"acme oy "` are one
company recorded twice, and a check that called those a collision would cry wolf
on the first run and be switched off by the second.
"""
from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

# (table, primary key, identity columns). Order matches merge_volume_into_local.py
# so the two files can be read side by side.
IDENTITY: list[tuple[str, str, list[str]]] = [
    # What a company IS: a name in a country. Not its sector, which is
    # classifier output and legitimately differs between the stores.
    ("companies", "id", ["canonical_name", "country"]),
    # A scheme, its country, and who administers it. Not event_count/total_eur,
    # which are recomputed aggregates.
    ("funding_instruments", "id", ["name", "country", "administering_body"]),
    # An award: which register it came from, its number there, and what it was
    # for. `company_id` is deliberately absent -- see the header.
    ("public_funding_events", "id",
     ["source", "project_number", "project_title", "grant_amount_eur"]),
    # A requirement. `instrument_id` IS included: without it gate_key repeats
    # across instruments by design, and the tuple would be too weak to mean
    # anything. The caveat is real and is printed in the verdict.
    ("eligibility_gates", "id", ["instrument_id", "gate_key", "requirement", "value"]),
    ("eligibility_clauses", "id", ["instrument_id", "clause_type", "clause_key", "text"]),
]


def _norm(expr: str) -> str:
    """Trim and case-fold text for comparison; leave NULL as NULL.

    `lower(trim(x))` on a number is a no-op in SQLite's type system, so this is
    safe to apply to the amount column too.
    """
    return f"lower(trim(coalesce({expr}, char(1))))"


def _shared(con: sqlite3.Connection, table: str) -> set[str]:
    main = {r[1] for r in con.execute(f"PRAGMA main.table_info({table})")}
    vol = {r[1] for r in con.execute(f"PRAGMA vol.table_info({table})")}
    return main & vol


def audit(con: sqlite3.Connection) -> tuple[int, int, list[str]]:
    collisions = 0
    aliases = 0
    notes: list[str] = []

    for table, key, ident in IDENTITY:
        shared = _shared(con, table)
        if not shared:
            print(f"  {table:24s} absent from one store, skipping")
            continue
        cols = [c for c in ident if c in shared]
        if not cols:
            notes.append(f"{table}: NO identity column is shared by both stores "
                         f"-- this table was NOT checked")
            print(f"  {table:24s} UNCHECKABLE (no shared identity column)")
            continue
        if len(cols) < len(ident):
            notes.append(f"{table}: identity weakened to {cols} "
                         f"(missing {[c for c in ident if c not in shared]})")

        same = " AND ".join(f"{_norm('m.' + c)} = {_norm('v.' + c)}" for c in cols)
        idt = ", ".join(cols)

        # 1. Same id, different thing. The merge skips these silently.
        n_coll = con.execute(
            f"SELECT count(*) FROM main.{table} m JOIN vol.{table} v "
            f"USING ({key}) WHERE NOT ({same})").fetchone()[0]

        # 2. Same thing, different ids. The merge inserts these twice. Counted
        #    over volume rows the merge WOULD insert, because a volume row the
        #    merge skips cannot become a duplicate.
        vsel = ", ".join(_norm("v." + c) for c in cols)
        msel = ", ".join(_norm("m." + c) for c in cols)
        n_alias = con.execute(
            f"SELECT count(*) FROM vol.{table} v "
            f"WHERE v.{key} NOT IN (SELECT {key} FROM main.{table}) "
            f"AND ({vsel}) IN (SELECT {msel} FROM main.{table} m)").fetchone()[0]

        collisions += n_coll
        aliases += n_alias
        mark = "  <-- SILENT LOSS" if n_coll else ""
        amark = "  <-- SILENT DUPLICATE" if n_alias else ""
        print(f"  {table:24s} identity ({idt})")
        print(f"  {'':24s}   shared ids, different thing : {n_coll:>7,}{mark}")
        print(f"  {'':24s}   same thing, different ids   : {n_alias:>7,}{amark}")

        if n_coll:
            for row in con.execute(
                    f"SELECT m.{key}, {', '.join('m.' + c for c in cols)}, "
                    f"{', '.join('v.' + c for c in cols)} "
                    f"FROM main.{table} m JOIN vol.{table} v USING ({key}) "
                    f"WHERE NOT ({same}) LIMIT 5"):
                print(f"  {'':24s}     id={row[0]}  laptop={row[1:1+len(cols)]}  "
                      f"volume={row[1+len(cols):]}")

    return collisions, aliases, notes


def self_test() -> int:
    """Prove the check fails. A guard never seen red is not a guard.

    Builds two tiny stores holding, by construction, one of each defect, and
    asserts this file finds exactly both. Runs in-memory, touches no corpus.
    """
    con = sqlite3.connect(":memory:")
    con.execute("ATTACH DATABASE ':memory:' AS vol")
    for db in ("main", "vol"):
        con.execute(f"CREATE TABLE {db}.companies "
                    f"(id INTEGER PRIMARY KEY, canonical_name TEXT, country TEXT)")
    # shared history: same id, same thing -- must be silent
    con.execute("INSERT INTO main.companies VALUES (1, 'Shared Oy', 'FI')")
    con.execute("INSERT INTO vol.companies  VALUES (1, ' shared oy ', 'FI')")
    # COLLISION: one id, two companies
    con.execute("INSERT INTO main.companies VALUES (2, 'Laptop Oy', 'FI')")
    con.execute("INSERT INTO vol.companies  VALUES (2, 'Volume Oy', 'SE')")
    # ALIAS: one company, two ids
    con.execute("INSERT INTO main.companies VALUES (3, 'Twice Oy', 'DK')")
    con.execute("INSERT INTO vol.companies  VALUES (9, 'Twice Oy', 'DK')")

    global IDENTITY
    keep = IDENTITY
    IDENTITY = [("companies", "id", ["canonical_name", "country"])]
    try:
        coll, alias, _ = audit(con)
    finally:
        IDENTITY = keep

    ok = coll == 1 and alias == 1
    print(f"\nself-test: collisions={coll} (want 1), aliases={alias} (want 1) "
          f"-- {'PASS' if ok else 'FAIL'}")
    if ok:
        print("The shared-history row was correctly silent, so a green run on the "
              "real stores means 'no collision', not 'nothing was compared'.")
    return 0 if ok else 1


def main() -> int:
    if "--self-test" in sys.argv:
        return self_test()
    if len(sys.argv) < 2:
        return print(__doc__) or 2

    from etl_env import DB  # noqa: E402  (import here so --self-test needs no env)

    vol = Path(sys.argv[1]).expanduser().resolve()
    if not vol.exists():
        return print(f"no such file: {vol}", file=sys.stderr) or 1

    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    con.execute("ATTACH DATABASE ? AS vol", (str(vol),))
    print(f"laptop {DB}\nvolume {vol}\n")
    collisions, aliases, notes = audit(con)

    for n in notes:
        print(f"\n  NOTE  {n}")
    print()
    if collisions:
        print(f"REFUSE: {collisions:,} ids name a different row in each store.\n"
              f"  merge_volume_into_local.py would skip every one of them and its\n"
              f"  after-check would report the expected count. Do not merge.")
        return 1
    if aliases:
        print(f"REFUSE: {aliases:,} rows exist in both stores under different ids.\n"
              f"  The merge would insert them a second time and the count would\n"
              f"  look exactly right. Do not merge.")
        return 1
    print("ok — every shared id names the same row in both stores, and no row\n"
          "     the merge would insert already exists here under another id.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
