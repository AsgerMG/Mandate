"""`door_for` must name ONE fund or none. Never a regime, never a guess.

The answer key is built from what this returns. A pair whose answer is a rollup
grades retrieval on a row the founder cannot apply to; a pair whose answer was
guessed between two candidates grades it on a coin flip. Both read as recall.

`leaf_for` had the opposite failure and it went unnoticed for the life of four
answer keys: it can only return a CHILD, so it answered None for every family
nobody split -- CDTI, Innovate UK, Bpifrance's innovation line -- and 199 of the
782 leaves the product offers could never be an answer. That is not something a
test of "does it return the right child" would ever have caught, because it was
right about every child. So the cases below are about the BOUNDARY: what counts
as a door, and what the function must refuse.

Built on an in-memory corpus, so it needs no database and no credentials.

Run: python3 ETL/terms/test_attribution.py
"""
from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "events" / "load"))
from attribution import Split  # noqa: E402

FAILURES: list[str] = []


def check(got, want, label: str) -> None:
    if got != want:
        FAILURES.append(f"{label}: got {got!r}, want {want!r}")


def corpus(instruments, sources, events) -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.execute("CREATE TABLE funding_instruments "
                 "(id TEXT, parent_id TEXT, name TEXT, scheme_code TEXT)")
    conn.execute("CREATE TABLE funding_instrument_sources "
                 "(source TEXT, instrument_id TEXT)")
    conn.execute("CREATE TABLE public_funding_events "
                 "(source TEXT, programme_name TEXT)")
    conn.executemany("INSERT INTO funding_instruments VALUES (?,?,?,?)", instruments)
    conn.executemany("INSERT INTO funding_instrument_sources VALUES (?,?)", sources)
    conn.executemany("INSERT INTO public_funding_events VALUES (?,?)", events)
    return conn


# ── 1. A family with no children IS the door ───────────────────────────────
# The whole finding. `agency` is one row, it is what publishableInstruments()
# offers, and it is what the founder applies to.
c = corpus(
    instruments=[("agency", None, "National Innovation Agency", "")],
    sources=[("agency_register", "agency")],
    events=[],
)
s = Split(c)
check(s.leaf_for("agency_register", None, "Agency", "CALL-1"), None,
      "leaf_for refuses a childless family (it can only return a child)")
check(s.door_for("agency_register", None, "Agency", "CALL-1"), "agency",
      "door_for names the childless family")

# ── 2. A family WITH children is a regime, and must be refused ──────────────
# An award the split cannot place under a split regime belongs to a child we did
# not build (below MIN_CHILD_EVENTS) or to a body the register did not name.
# Crediting the regime would make the right answer a row nobody can apply to.
c = corpus(
    instruments=[("regime", None, "State aid regime", ""),
                 ("regime__body_a", "regime", "Body A", "SA.1")],
    sources=[("satr", "regime")],
    events=[],
)
s = Split(c)
check(s.door_for("satr", None, "Body A", "SA.1"), "regime__body_a",
      "door_for still returns the exact child when the split places the award")
check(s.door_for("satr", None, "Body Z", "SA.999"), None,
      "door_for REFUSES a regime when the split places nothing")

# ── 3. Ambiguity is refused, not resolved ──────────────────────────────────
# One source in the live corpus maps to 88 childless families at once. "Which of
# these did this award come from" has no answer and a test pair needs exactly
# one, so the honest return is None.
c = corpus(
    instruments=[("call_a", None, "Convocatoria A", ""),
                 ("call_b", None, "Convocatoria B", "")],
    sources=[("bdns", "call_a"), ("bdns", "call_b")],
    events=[],
)
s = Split(c)
check(s.door_for("bdns", None, "Ministerio", "CONV-7"), None,
      "door_for REFUSES a source mapping to more than one childless family")

# ── 4. A source we hold no map for is refused ──────────────────────────────
c = corpus(instruments=[("x", None, "X", "")], sources=[], events=[])
s = Split(c)
check(s.door_for("unmapped", None, "Body", "CALL"), None,
      "door_for refuses a source with no family at all")

# ── 5. A programme child still wins over the family ────────────────────────
# `door_for` is `leaf_for` plus a fallback, never instead of it: the most
# specific door the register names is always the answer.
c = corpus(
    instruments=[("fam", None, "Family", ""),
                 ("fam__prog", "fam", "Tremplin", "")],
    sources=[("ademe", "fam")],
    # A programme split needs MORE THAN ONE distinct programme name and at least
    # MIN_CHILD_EVENTS rows, which is the ETL's own test.
    events=[("ademe", "Tremplin")] * 40 + [("ademe", "Autre")] * 40,
)
s = Split(c)
check(s.door_for("ademe", "Tremplin", None, None), "fam__prog",
      "door_for prefers the programme child over its family")

# ── 6. has_children is the same set publishableInstruments() computes ──────
c = corpus(
    instruments=[("p", None, "Parent", ""), ("p__c", "p", "Child", ""),
                 ("alone", None, "Alone", "")],
    sources=[], events=[],
)
s = Split(c)
check(s.has_children, {"p"}, "has_children holds exactly the split families")

if FAILURES:
    print(f"test_attribution: {len(FAILURES)} FAILURE(S)")
    for f in FAILURES:
        print(f"  {f}")
    raise SystemExit(1)
print("test_attribution: ok — door_for names one fund or refuses, 8 cases")
