"""The two sides of the split's own test must speak the same value space.

THE FAILURE THIS ENCODES. `populate_funding_instruments.py` decides whether an
award gets a scheme child with

    elif fam in split_targets and r["granting_authority"] and r["call_id"]:

where `fam = source_to_family(r["source"])` -- an instrument id such as
`satr_be_rnd` -- and `split_targets = split_families(conn)`. On 2026-07-30 the
hardcoded `SPLIT_FAMILIES = {"satr_fr_rnd", "satr_fr_equity"}` was replaced by a
query, in a commit whose subject was "All 22 countries, down to the schemes
founders apply to". The query selected the wrong column:

    SELECT DISTINCT source_family_bucket FROM funding_instruments WHERE ...

`source_family_bucket` is `'state_aid_satr'` for every SATR row. So
`split_targets` became `{'state_aid_satr'}`, an id was compared against a bucket
name, and the two sets never intersected again. The scheme arm of the split --
the half that turns "French R&D state aid" into a door a founder can knock on --
became unreachable code for all 22 countries, INCLUDING the two it had worked
for an hour earlier.

Nothing failed. The rollout that was meant to widen the split switched it off,
and the only visible symptom was a placement rate, a year later, in a different
module: 122,814 SATR awards carry a complete (granting_authority, call_id) key
and 97,032 awards' worth of children stopped being rebuilt.

THE PROPERTY, not the column name. Asserting "the query must say `id`" would be
a register of one, and the next refactor would rename its way around it. What
must hold is that the SET USED AS A TEST is drawn from the SAME VALUE SPACE as
the values tested against it. A membership test between two disjoint vocabularies
is always dead code, whatever the columns are called, and that is checkable
without knowing anything about either.

Credential-free and instant: the fixture is an in-memory sqlite shaped like the
real table, so this runs in CI on every pull request, where the corpus never
can. A cheap signal that runs beats an expensive one that gets skipped.

Run: python3 ETL/events/load/test_split_value_space.py
"""
from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib"))
from populate_funding_instruments import (  # noqa: E402
    source_to_family, split_families,
)

FAILURES: list[str] = []


def fixture() -> sqlite3.Connection:
    """`funding_instruments` as the corpus really holds it.

    The three columns that matter and the one relationship that matters: a SATR
    rollup's id is per country and per channel, and its `source_family_bucket`
    is the SAME string for every one of them. That identity is the whole trap --
    a bucket looks like a family key right up until you test membership with it.
    """
    conn = sqlite3.connect(":memory:")
    conn.execute("CREATE TABLE funding_instruments "
                 "(id TEXT, parent_id TEXT, source_family_bucket TEXT)")
    conn.executemany(
        "INSERT INTO funding_instruments VALUES (?,?,?)",
        [("satr_fr_rnd", None, "state_aid_satr"),
         ("satr_fr_equity", None, "state_aid_satr"),
         ("satr_be_rnd", None, "state_aid_satr"),
         ("satr_de_rnd", None, "state_aid_satr"),
         # A non-SATR family, so the query has something to exclude and a pass
         # cannot come from it matching everything.
         ("ademe_aid", None, "national_agency"),
         # A child, to prove the answer is about rollups and not row count.
         ("satr_fr_rnd__x", "satr_fr_rnd", "state_aid_satr")])
    conn.commit()
    return conn


def main() -> None:
    conn = fixture()
    targets = split_families(conn)

    # The sources the call site will actually hand to `source_to_family`, in the
    # shape the events table publishes them: family plus a cohort year.
    sources = ["satr_fr_rnd_2023", "satr_be_rnd_2024", "satr_de_rnd_2025"]
    tested = {source_to_family(s) for s in sources}

    if not targets:
        FAILURES.append("split_families() returned nothing: the scheme arm of "
                        "the split cannot fire for any source.")

    # THE PROPERTY. Not "targets equals this list" -- targets may legitimately
    # grow or shrink with the corpus -- but that the membership test the caller
    # performs can succeed at all. Disjoint means dead.
    reachable = tested & targets
    if not reachable:
        FAILURES.append(
            "split_families() and source_to_family() return DISJOINT value "
            "spaces, so `fam in split_targets` in populate_funding_instruments.py "
            "can never be true and the scheme arm of the split is dead code.\n"
            f"    split_families() returned:   {sorted(targets)}\n"
            f"    source_to_family() produces: {sorted(tested)}\n"
            "    A SATR rollup id is what the caller compares; "
            "source_family_bucket is a channel label shared by all of them.")

    # Every SATR rollup in the fixture must be reachable, not just one. A query
    # that happened to return a single family would pass the test above while
    # still silently denying the split to 21 countries -- which is the shape of
    # the original defect, one refactor removed.
    unreachable = tested - targets
    if targets and not unreachable and len(targets & tested) != len(tested):
        FAILURES.append("internal: set arithmetic disagrees with itself")
    if reachable and unreachable:
        FAILURES.append(
            "split_families() reaches only part of the SATR corpus: "
            f"{sorted(unreachable)} would silently never be split, which looks "
            "exactly like a country we hold thin data for.")

    # And the exclusion must still work: a bucket-wide answer would sweep in
    # families that are not SATR rollups at all.
    if source_to_family("ademe_aid") in targets:
        FAILURES.append("split_families() returned a non-SATR family; the "
                        "scheme split would be applied where it does not belong.")

    if FAILURES:
        print("FAIL: the split's target set is not in the caller's value space\n")
        for f in FAILURES:
            print(f"  - {f}\n")
        sys.exit(1)
    print("ok: split_families() returns rollup ids the call site can match "
          f"({len(targets)} in the fixture, all reachable)")


if __name__ == "__main__":
    main()
