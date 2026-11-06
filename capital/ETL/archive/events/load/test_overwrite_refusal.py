"""A sync must REFUSE while the store it replaces is the sole holder of a row.

`test_overwrite_guard.py` proves the MEASUREMENT is honest — that a table
nobody could compare is never reported as zero rows at risk. This proves the
DECISION built on it: that the two channels between the corpus of record and a
working copy actually stop, and that the flags which proceed anyway say what
they destroy before they destroy it.

THE FAILURE THIS ENCODES. On 2026-08-11 the derived stores held 7,471
eligibility gates and the corpus of record held 6,401. Both channels
(`pull_db.py`, `push_local.py`) move the whole 645 MB file with `--overwrite`,
so 1,070 gates — the rules that decide whether a fund may rule a founder out —
were one command from deletion with no second copy. Refusals were added. Two
holes were left in them, and both were in the overrides:

  push_local.py --force-overwrite   skipped the comparison ENTIRELY. The one
                                    flag whose whole purpose is to delete rows
                                    knowingly was the only path that could not
                                    name a single one of them.
  pull_db.py --discard-local        measured, swapped, and printed a bare total
                                    afterwards. By the time the operator read
                                    the number the rows were gone.

THE PROPERTY, not the list. No table, family or count appears below as a rule.
What must hold for any store, any table, today or after the next schema change:

    No whole-file overwrite may run while the store being replaced is the sole
    holder of any row. An operator may override that, and the override must
    state, itemised and counted, exactly what it destroys BEFORE it does.

The test for the unseen case is section 5: a table this repository has never
heard of is registered into the family map at runtime, with rows only on the
destination, and the gate must refuse on it — with no entry in IDENTITY, no
entry in UNKEYABLE, and no edit to the gate.

Hermetic: fixture stores in a temp directory. No credentials, no corpus, no
network — the sync functions under test are the DECISIONS, split out from the
transfers precisely so they can be run where the transfer cannot.

Run: python3 ETL/events/load/test_overwrite_refusal.py
"""
from __future__ import annotations

import sqlite3
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(ROOT / "website" / "build" / "lib"))
sys.path.insert(0, str(ROOT / "ETL" / "lib"))
sys.path.insert(0, str(ROOT / "ETL" / "events" / "extract"))

import corpus_stores  # noqa: E402
import reconcile_stores as R  # noqa: E402
import pull_db  # noqa: E402
import push_local  # noqa: E402

FAILURES: list[str] = []

# A cut of the real schema. The constraints are the ones production declares,
# because the identities the gate compares on are those constraints.
DDL = """
CREATE TABLE funding_instruments (id TEXT PRIMARY KEY, name TEXT);
CREATE TABLE eligibility_gates (
    id INTEGER PRIMARY KEY AUTOINCREMENT, instrument_id TEXT NOT NULL,
    gate_key TEXT NOT NULL, requirement TEXT NOT NULL,
    UNIQUE (instrument_id, gate_key));
CREATE TABLE public_funding_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER, source TEXT NOT NULL,
    project_title TEXT, grant_amount_eur REAL);
"""

REMEDY = "  Merge them rather than deleting them."


def build(tmp: Path) -> tuple[Path, Path]:
    """The 2026-08-11 divergence in miniature, in BOTH directions at once.

    The laptop holds gates the record does not (a pull deletes them); the
    record holds awards the laptop does not (a push deletes those). Every real
    divergence this repo has had was bidirectional, and a fixture that is not
    would let a one-sided gate pass.
    """
    record, laptop = tmp / "record.sqlite", tmp / "laptop.sqlite"
    a, b = sqlite3.connect(record), sqlite3.connect(laptop)
    for con in (a, b):
        con.executescript(DDL)
        con.execute("INSERT INTO funding_instruments VALUES ('f1', 'Fund One')")
        con.execute("INSERT INTO eligibility_gates (instrument_id, gate_key, requirement)"
                    " VALUES ('f1','g1','SME test')")
    b.execute("INSERT INTO eligibility_gates (instrument_id, gate_key, requirement)"
              " VALUES ('f1','g2','turnover under 50m')")
    a.execute("INSERT INTO public_funding_events (company_id, source, project_title,"
              " grant_amount_eur) VALUES (1,'cordis','P',1.0)")
    for con in (a, b):
        con.commit()
        con.close()
    return record, laptop


def must(cond: bool, msg: str) -> None:
    if not cond:
        FAILURES.append(msg)


def states_the_cost(text: str, table: str, n: int) -> bool:
    """Does this text name the table and the count? Both, or the operator is
    told a number with nothing behind it, or a name with no size."""
    return table in text and f"{n:,}" in text


def main() -> None:
    tmp = Path(tempfile.mkdtemp())
    record, laptop = build(tmp)

    # ── 1. a PULL refuses while the laptop is the sole holder ────────────
    # pull_db swaps the record's file over the laptop's, so the laptop is the
    # store being replaced.
    proceed, text, _ = pull_db.swap_decision(laptop, record,
                                          carry_forward=False, discard_local=False)
    must(not proceed, "a pull PROCEEDED while the local store held a gate the "
                      "corpus of record does not. That is the 1,070 of 2026-08-11.")
    must("REFUSED" in text, f"a refusal that does not say it refused: {text!r}")
    must(states_the_cost(text, "eligibility_gates", 1),
         f"the refusal did not name the table and count at risk: {text!r}")

    # ── 2. the override states the cost BEFORE it acts ───────────────────
    # This is the assertion that goes red against the version where
    # --discard-local printed a bare total after the swap.
    proceed, text, _ = pull_db.swap_decision(laptop, record,
                                          carry_forward=False, discard_local=True)
    must(proceed, "--discard-local did not proceed; an explicit override must work.")
    must(states_the_cost(text, "eligibility_gates", 1),
         "--discard-local proceeded without itemising what it deletes. The "
         "operator learns the cost only after the rows are gone: " + repr(text))

    # ── 3. carrying forward is NOT a destruction and must not read as one ──
    proceed, text, _ = pull_db.swap_decision(laptop, record,
                                          carry_forward=True, discard_local=False)
    must(proceed, "--carry-forward did not proceed.")
    must("DESTROY" not in text.upper(),
         "--carry-forward was reported as a deletion. It merges the rows "
         "forward; calling it a deletion teaches operators to ignore the word.")

    # ── 4. a PUSH refuses, and ITS override states the cost too ──────────
    # push_local uploads the laptop over the record, so the record is the store
    # being replaced. This is the direction that deletes awards from registers
    # which keep no history.
    proceed, text, _ = push_local.judge_push(record, laptop, force=False)
    must(not proceed, "a push PROCEEDED while the corpus of record held an award "
                      "this file does not. Those rows have no other copy anywhere.")
    must(states_the_cost(text, "public_funding_events", 1),
         f"the push refusal did not name what it would delete: {text!r}")

    proceed, text, _ = push_local.judge_push(record, laptop, force=True)
    must(proceed, "--force-overwrite did not proceed; an explicit override must work.")
    must(states_the_cost(text, "public_funding_events", 1),
         "--force-overwrite proceeded without naming a single row it deletes. It "
         "used to skip the comparison entirely: " + repr(text))

    # ── 5. THE UNSEEN CASE. A table added next month, with no edit here ──
    # Registered into the family map at runtime. It has no entry in IDENTITY
    # and none in UNKEYABLE — it is exactly what a schema change looks like
    # before anybody remembers this file exists. The gate must still refuse.
    future, laptop2 = tmp / "future_record.sqlite", tmp / "future_laptop.sqlite"
    for p, rows in ((future, 2), (laptop2, 0)):
        con = sqlite3.connect(p)
        con.executescript(
            "CREATE TABLE a_table_added_next_month (id INTEGER PRIMARY KEY, fact TEXT);")
        for i in range(rows):
            con.execute("INSERT INTO a_table_added_next_month (fact) VALUES (?)", (str(i),))
        con.commit()
        con.close()
    saved = dict(corpus_stores.FAMILIES)
    corpus_stores.FAMILIES.clear()
    corpus_stores.FAMILIES["a_family_added_next_month"] = ["a_table_added_next_month"]
    try:
        proceed, text, _ = R.overwrite_gate(str(future), str(laptop2),
                                         override=None, remedy=REMEDY)
    finally:
        corpus_stores.FAMILIES.clear()
        corpus_stores.FAMILIES.update(saved)
    must(not proceed,
         "the gate allowed an overwrite over a table it has never heard of, which "
         "held rows the replacement does not. A guard that only covers the tables "
         "somebody remembered to list covers nothing next month.")
    must(states_the_cost(text, "a_table_added_next_month", 2),
         f"an unknown table was refused without saying what it holds: {text!r}")

    # ── 6. both directions ask ONE question ──────────────────────────────
    # Not "the same answer" — the answers differ by direction — but the same
    # function. Two implementations of "would this delete something" is how one
    # direction comes to be safe and the other not.
    must(pull_db.swap_decision.__module__ != R.overwrite_gate.__module__
         and R.overwrite_gate is not None, "sanity")
    src = (Path(pull_db.__file__).read_text() + Path(push_local.__file__).read_text())
    must(src.count("overwrite_gate") >= 2,
         "one of the two sync directions does not go through the shared gate. "
         "A second copy of the rule is a second thing that can be wrong, in the "
         "direction nobody tested.")

    if FAILURES:
        print("FAIL: a whole-file overwrite could still delete the only copy of "
              "something\n")
        for f in FAILURES:
            print(f"  - {f}\n")
        sys.exit(1)
    print("ok: both sync directions refuse while the store they replace is the sole "
          "holder of a row, every override names what it destroys first, and a table "
          "nobody has declared is covered")


if __name__ == "__main__":
    main()
