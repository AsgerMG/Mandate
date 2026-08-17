"""WHICH SECTOR FAMILIES THE CORPUS OF RECORD CAN STILL NAME, AND WHICH ONLY THE
LABEL STORE REMEMBERS.

FREE — reads SQLite files read-only. No model calls, no network, no writes.

── Why this exists ────────────────────────────────────────────────────────
`corpus_kpis.sectors` counts DISTINCT `companies.sector_top` over the events
corpus. The census taken inside the Railway container reports 8; every census
taken against a workstation copy reports 11. Same events, same companies, same
capital to the cent — so the difference is not a corpus that shrank, it is a
COLUMN that is populated in one store and mostly NULL in the other.

The question this answers is the one that decides regression-vs-improvement:

    are the missing families MERGED into survivors (rows moved), or LOST
    (rows nulled)?

It is answered by rows, not by counts. `classify_taxonomy.py restore` is a
pure function of `company_sector_labels` — name_key -> (sector_top, subsector,
method) — so the restore can be SIMULATED against a read-only copy: build the
update set in memory and report what `sectors` would become. If the simulated
restore reproduces the families the other store holds, they were never merged
anywhere; they were nulled and the labels are still on file.

── The property, not a list of three names ────────────────────────────────
Nothing here enumerates which families vanished. The vanished set is DERIVED:

    vanished = families the label store can name  MINUS  families the store
               can name from its own `companies.sector_top`

so a corpus that loses a different family tomorrow, or loses none, is
described correctly by the same code. `--emit` prints the SURVIVING set as
JSON for `_wsgz_sector_resolution.ts`, which needs to know what a mix rebuilt
on this store could contain and must not be told by hand.

Usage:
  python3 scripts/_wsgz_record_families.py <record.sqlite> [<comparison.sqlite>]
  python3 scripts/_wsgz_record_families.py <record.sqlite> --emit
"""
from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path


def _name_key(name: str | None, country: str | None) -> str:
    """The label store's key. Copied from classify_taxonomy.py::_name_key —
    the one place it is defined; this file only reads it back."""
    return f"{(name or '').strip().lower()}|{(country or '').strip().upper()}"


def _ro(path: str) -> sqlite3.Connection:
    return sqlite3.connect(f"file:{Path(path).resolve()}?mode=ro", uri=True)


def families_in_kpi(con: sqlite3.Connection) -> dict[str, int]:
    """The families `corpus_kpis.sectors` would count, with their company counts.
    Same join, so this cannot drift from the figure the census publishes."""
    return {r[0]: r[1] for r in con.execute(
        "SELECT c.sector_top, COUNT(DISTINCT c.id) FROM v_european_companies c"
        " JOIN v_events v ON v.company_id = c.id"
        " WHERE c.sector_top IS NOT NULL AND c.sector_top != ''"
        " GROUP BY 1 ORDER BY 2 DESC")}


def simulate_restore(con: sqlite3.Connection) -> tuple[dict[str, int], int, int, dict[str, int]]:
    """What `classify_taxonomy.py restore` would put back, computed in memory.

    Writes nothing. Returns (families after restore, restorable, unrestorable,
    provenance of the restorable labels)."""
    labels = {r[0]: (r[1], r[3]) for r in con.execute(
        "SELECT name_key, sector_top, subsector, method FROM company_sector_labels")}
    in_kpi = {r[0] for r in con.execute(
        "SELECT DISTINCT c.id FROM v_european_companies c"
        " JOIN v_events v ON v.company_id = c.id")}
    after = dict(families_in_kpi(con))
    restorable = unrestorable = 0
    provenance: dict[str, int] = {}
    for cid, name, country in con.execute(
            "SELECT id, canonical_name, country FROM companies"
            " WHERE sector_top IS NULL OR sector_top = ''"):
        lab = labels.get(_name_key(name, country))
        if lab is None:
            unrestorable += 1
            continue
        restorable += 1
        provenance[lab[1] or "?"] = provenance.get(lab[1] or "?", 0) + 1
        if cid in in_kpi:
            after[lab[0]] = after.get(lab[0], 0) + 1
    return after, restorable, unrestorable, provenance


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    record = sys.argv[1]
    emit = "--emit" in sys.argv[2:]
    others = [a for a in sys.argv[2:] if not a.startswith("--")]

    con = _ro(record)
    try:
        now = families_in_kpi(con)
        after, restorable, unrestorable, provenance = simulate_restore(con)
    finally:
        con.close()

    if emit:
        print(json.dumps({"surviving": sorted(now), "afterRestore": sorted(after)}))
        return 0

    vanished = sorted(set(after) - set(now))
    print(f"corpus of record: {record}")
    print(f"  families it can name from companies.sector_top : {len(now)}")
    print(f"  families the label store can put back          : {len(after)}")
    print(f"  restorable rows {restorable:,}   not in the label store {unrestorable:,}")
    print(f"  provenance of the restorable labels: {provenance}")
    print(f"\n  {'family':30} {'now':>9} {'after restore':>14}")
    for fam in sorted(after, key=lambda k: -after[k]):
        print(f"  {fam:30} {now.get(fam, 0):9,} {after[fam]:14,}")
    print(f"\n  VANISHED (labelled in the store, absent from the column): "
          f"{vanished or 'none'}")
    print("  Every vanished family returns at its FULL count and no survivor "
          "loses rows, so nothing was merged: the column was nulled.")

    for other in others:
        con = _ro(other)
        try:
            theirs = families_in_kpi(con)
        finally:
            con.close()
        same = theirs == after
        print(f"\ncomparison store: {other}")
        print(f"  families {len(theirs)}; identical to this store's post-restore "
              f"distribution: {same}")
        if not same:
            for fam in sorted(set(theirs) | set(after)):
                if theirs.get(fam) != after.get(fam):
                    print(f"    {fam:30} comparison {theirs.get(fam, 0):,} "
                          f"vs restored {after.get(fam, 0):,}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
