"""The split must key on the id it built, never on the name it displays.

THE FAILURE THIS ENCODES, measured 2026-08-09. `attribution.Split` keyed a
scheme child on `(parent_id, name, scheme_code)` and looked it up with the
award's `granting_authority`. That was true of the child at the moment
`populate_funding_instruments.py` constructs it —

    now.append(dict(id=child_id, parent_id=fam, name=authority, ...))

— and untrue two hundred lines later in the same function, which does

    row["name"] = title ; row["name_source"] = "case_register"

for every child carrying an SA number: 430 of 453. The map then held the
Commission's registered scheme title and the lookup asked for the granting
body. Two vocabularies, one membership test, and the test cannot succeed.

Nothing failed. Placement read 11.5% instead of 41.9%, 241 leaves instead of
671, and SEVEN countries with a nameable fund instead of 22 — for long enough
that an audit concluded the instrument layer had gone STALE and that one clean
rebuild would repair it. It appeared to: a rebuild run inside an agent worktree
skips the rename, because `data/raw/state_aid_cases/` is gitignored and absent
there, and "repairs" placement by discarding all 430 registered titles. The
repair and the defect were the same missing distinction between a key and a
label, seen from two sides.

THE PROPERTY, not the column. Asserting "key on administering_body" would be a
register of today's schema, and the next enrichment would rename its way around
it just as this one did. What must hold is:

    a value used as a JOIN KEY must be a value nothing renames.

`name` has four writers — the split, the state-aid case register,
reference/programme_names.json, and apply_override_names.py. The ID has
one, and `child_slug`'s own docstring commits to its stability across runs
because the reconcile step cannot tell a renamed instrument from a vanished
one. So the test is behavioural and needs to know nothing about which column is
used: RENAME EVERY DISPLAY FIELD IN THE CORPUS AND THE SPLIT MUST STILL PLACE
THE AWARD.

Credential-free and instant: an in-memory sqlite shaped like the real tables, so
this runs in CI on every pull request, where the corpus never can.

Run: python3 ETL/terms/test_split_key_is_not_a_name.py
"""
from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_ROOT / "ETL" / "lib"))
sys.path.insert(0, str(_ROOT / "ETL" / "events" / "load"))
sys.path.insert(0, str(_ROOT / "ETL" / "terms"))
from populate_funding_instruments import child_slug, _name_digest  # noqa: E402
from attribution import Split  # noqa: E402

FAILURES: list[str] = []

# One rollup, one scheme child and one programme child, built with the ETL's own
# id construction so the fixture cannot drift from the thing under test.
FAM = "satr_at_rnd"
BODY = 'Amt der Niederösterreichischen Landesregierung, Abteilung WST3'
CALL = "SA.115611"
PROG = "Tremplin pour la transition ecologique des PME"

SCHEME_CHILD = f"{FAM}__{child_slug(CALL)}__{child_slug(BODY)}"
PROG_CHILD = f"ademe_aid__{child_slug(PROG)}_{_name_digest(PROG)}"


def fixture(scheme_name: str, prog_name: str) -> sqlite3.Connection:
    """The corpus, with the two children's DISPLAY names under the caller's
    control and every identity field held constant."""
    conn = sqlite3.connect(":memory:")
    conn.execute("CREATE TABLE funding_instruments "
                 "(id TEXT PRIMARY KEY, parent_id TEXT, name TEXT, scheme_code TEXT)")
    conn.execute("CREATE TABLE funding_instrument_sources "
                 "(instrument_id TEXT, source TEXT)")
    conn.execute("CREATE TABLE public_funding_events "
                 "(source TEXT, programme_name TEXT, granting_authority TEXT, call_id TEXT)")
    conn.executemany("INSERT INTO funding_instruments VALUES (?,?,?,?)", [
        (FAM, None, "SATR At Rnd", ""),
        (SCHEME_CHILD, FAM, scheme_name, CALL),
        ("ademe_aid", None, "ADEME", ""),
        (PROG_CHILD, "ademe_aid", prog_name, ""),
    ])
    conn.executemany("INSERT INTO funding_instrument_sources VALUES (?,?)",
                     [(FAM, "satr_at_rnd_2024"), ("ademe_aid", "ademe")])
    # `programme_split` is decided from the events themselves: a source splits by
    # programme only when it publishes more than one name, above the floor.
    rows = [("ademe", PROG, "ADEME", "")] * 40 + [("ademe", "Autre dispositif", "ADEME", "")] * 40
    rows += [("satr_at_rnd_2024", None, BODY, CALL)] * 40
    conn.executemany("INSERT INTO public_funding_events VALUES (?,?,?,?)", rows)
    conn.commit()
    return conn


def place(conn) -> tuple[str | None, str | None]:
    split = Split(conn)
    return (split.leaf_for("satr_at_rnd_2024", None, BODY, CALL),
            split.leaf_for("ademe", PROG, "ADEME", ""))


def main() -> None:
    # 1. The corpus as the split first builds it: name IS the key's value.
    scheme, prog = place(fixture(BODY, PROG))
    if scheme != SCHEME_CHILD or prog != PROG_CHILD:
        FAILURES.append(
            "the split cannot place an award even before anything is renamed "
            f"(scheme={scheme!r} want {SCHEME_CHILD!r}; prog={prog!r} want "
            f"{PROG_CHILD!r}). Nothing below is meaningful until this passes.")

    # 2. THE PROPERTY. Rename both display names to something with no relation
    #    to the award's fields -- which is exactly what the case register and
    #    programme_names.json do -- and the same two awards must still place.
    scheme, prog = place(fixture(
        "Allgemeine Richtlinie für NÖ Förderungen im Bereich Wirtschaft",
        "Tremplin — transition écologique (ADEME)"))
    if scheme != SCHEME_CHILD:
        FAILURES.append(
            "a SCHEME child stopped being placeable when its display name was "
            "rewritten to its registered scheme title. The award still carries "
            f"the same published (granting_authority, call_id) pair, and its "
            f"id {SCHEME_CHILD!r} did not move — so the split is keyed on a "
            "label rather than on a key, and 430 of 453 children go dark the "
            "moment the state-aid register is applied.")
    if prog != PROG_CHILD:
        FAILURES.append(
            "a PROGRAMME child stopped being placeable when its display name "
            "was rewritten from reference/programme_names.json. Same "
            "defect, different renamer — which is why this asserts the property "
            "and not one column.")

    # 3. And placement must stay EXACT. A key robust to renaming is worthless if
    #    it also matches something the source did not name: crediting an award
    #    to a fund the publisher never named is the one outcome worse than
    #    crediting the parent.
    conn = fixture(BODY, PROG)
    split = Split(conn)
    if split.leaf_for("satr_at_rnd_2024", None, "Some Other Ministry", CALL) is not None:
        FAILURES.append("an award naming a DIFFERENT granting authority was "
                        "placed on this child. The split must return None, not "
                        "the nearest thing.")
    if split.leaf_for("satr_at_rnd_2024", None, BODY, "SA.999999") is not None:
        FAILURES.append("an award naming a call the corpus has no child for was "
                        "placed. A reconstructed id must be checked against the "
                        "corpus, never returned because it parses.")

    if FAILURES:
        print("FAIL: the split is keyed on a name something else rewrites\n")
        for f in FAILURES:
            print(f"  - {f}\n")
        sys.exit(1)
    print("ok: both child kinds place from the award's own published fields, "
          "before and after every display name is rewritten")


if __name__ == "__main__":
    main()
