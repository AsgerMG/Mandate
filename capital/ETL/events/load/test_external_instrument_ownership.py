"""A rebuild may delete only the rows it authored.

THE FAILURE THIS ENCODES. `funding_instruments` has two provenances.
`populate_funding_instruments.py` AGGREGATES it out of `public_funding_events`:
every row it makes is a fund some award in the corpus was paid out of. Other
scripts INSERT into the same table additively, from registers of funds that have
paid out nothing we hold — `harvest_bdns_open_calls.py` writes live Spanish
convocatorias, each with a fetched `eligibility_text` and gates extracted from
that text, and two Italian frameworks were hand-curated straight in.

Those rows carry zero events by construction and permanently: an OPEN call has
no award history yet, which is the entire reason a founder wants to see it.

The reconcile step deletes gates whose instrument "disappeared", and read
disappearance as "not in this pass's output" — which is true of every externally
owned row on every single run. So the routine rebuild of 2026-08-09 deleted 90
real instruments and 629 gates encoded from those instruments' own published
text. Not stale rows, not duplicates the split collapses, not superseded by
anything: rows this pass was never the author of. The 20%-of-curated guard did
not fire, because 629 of 7,471 is 8%.

The same fault ran the other way earlier and is recorded in the source: 33 gates
for `fondo_di_garanzia` and `invitalia_smart_start` survived every reconcile
until a Postgres FK violation exposed them. Both directions are one missing
distinction — who owns the row.

THE PROPERTY, not the id prefix. Asserting `bdns_conv_%` is spared would be a
register of today's one importer, and the next importer would be deleted the day
it landed. What holds without knowing any importer:

    this pass derives instruments FROM events and is the only writer of
    `event_count`, so a row it does not produce AND that carries no events
    cannot ever have been its output.

and its converse, which is what keeps the reconcile useful:

    a row that DID come from events and no longer does keeps its stale positive
    count, and is still reconciled away.

Credential-free and instant: the fixture is an in-memory sqlite shaped like the
real table, so this runs in CI on every pull request, where the corpus never can.

Run: python3 ETL/events/load/test_external_instrument_ownership.py
"""
from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib"))
from populate_funding_instruments import externally_owned  # noqa: E402

FAILURES: list[str] = []


def fixture() -> sqlite3.Connection:
    """`funding_instruments` as the corpus really holds it, in four kinds.

    The distinction under test is provenance, and provenance is not a column, so
    the fixture has to carry every combination of (this pass produced it?) x
    (does it carry events?) — otherwise a rule that gets one axis right and
    ignores the other passes.
    """
    conn = sqlite3.connect(":memory:")
    conn.execute("CREATE TABLE funding_instruments "
                 "(id TEXT PRIMARY KEY, event_count INTEGER)")
    conn.executemany(
        "INSERT INTO funding_instruments VALUES (?,?)",
        [
            # (1) event-derived and still produced — the ordinary row.
            ("satr_fr_rnd", 4120),
            ("satr_fr_rnd__bpifrance__sa50627", 312),
            # (2) produced but carrying no events: synthetic parents and the
            # framework records this pass seeds itself. Zero events AND in the
            # output, so ownership must come from the output, not the count.
            ("eu_sme_definition", 0),
            ("national_dev_banks", 0),
            # (3) externally owned: an open call, and a hand-curated fund. Never
            # in the output, never had an event, and each carries gates.
            ("bdns_conv_919489", 0),
            ("invitalia_smart_start", 0),
            # (4) genuinely stale: this pass built it once, the events behind it
            # are gone, and the count it left behind is the evidence of that.
            ("satr_it_rnd__dead_scheme", 88),
        ])
    conn.commit()
    return conn


def main() -> None:
    conn = fixture()
    produced = {"satr_fr_rnd", "satr_fr_rnd__bpifrance__sa50627",
                "eu_sme_definition", "national_dev_banks"}
    external = externally_owned(conn, produced)
    surviving = produced | external

    # THE PROPERTY, stated as survival rather than as a set equality, because
    # the reconcile and the DELETE both consume `surviving` and that is the only
    # thing either of them asks.
    for iid in ("bdns_conv_919489", "invitalia_smart_start"):
        if iid not in surviving:
            FAILURES.append(
                f"{iid!r} is externally owned — zero events, never produced by "
                "this pass — and a rebuild would delete it and every gate "
                "encoded from its own published eligibility text. A pass may "
                "only delete rows it authored.")

    # The converse. Without it the safe answer is 'delete nothing', which would
    # leave the layer accumulating dead children forever — the exact decay this
    # rebuild exists to clear.
    if "satr_it_rnd__dead_scheme" in surviving:
        FAILURES.append(
            "a row this pass built from events and no longer produces is being "
            "kept. Its stale positive event_count is the evidence that it WAS "
            "an output, so it is this pass's to reconcile; sparing it turns the "
            "reconcile into a no-op and the child layer never stops growing.")

    # A produced row must not be re-classified as somebody else's just because
    # it has no events of its own. Frameworks and synthetic parents are exactly
    # that, and they are this pass's to rewrite.
    for iid in ("eu_sme_definition", "national_dev_banks"):
        if iid in external:
            FAILURES.append(
                f"{iid!r} is produced by this pass and carries no events; "
                "ownership must be decided by the output first, or every "
                "framework row becomes untouchable.")

    # And ordinary rows must be unaffected in both directions.
    if external & {"satr_fr_rnd", "satr_fr_rnd__bpifrance__sa50627"}:
        FAILURES.append("an event-bearing produced row was called external.")

    # Not a register: nothing above names a prefix, and this asserts it stays
    # that way. A future importer writing rows under any id at all gets the same
    # protection on the day it lands.
    conn.execute("INSERT INTO funding_instruments VALUES ('some_future_importer_row', 0)")
    if "some_future_importer_row" not in externally_owned(conn, produced):
        FAILURES.append(
            "a newly inserted zero-event row from an unknown importer is not "
            "protected, so the rule is keyed on who the importer is rather than "
            "on whether this pass authored the row.")

    if FAILURES:
        print("FAIL: the rebuild would delete rows it does not own\n")
        for f in FAILURES:
            print(f"  - {f}\n")
        sys.exit(1)
    print(f"ok: {len(external)} externally owned rows survive the rebuild, "
          "and a genuinely stale one still does not")


if __name__ == "__main__":
    main()
