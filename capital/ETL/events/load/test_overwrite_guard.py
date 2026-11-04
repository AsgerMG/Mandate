"""A table nobody could compare must not report itself as safe.

THE FAILURE THIS ENCODES. Both channels between the corpus of record and a
working copy move the whole 645 MB file with `--overwrite`. Whichever direction
runs, everything the losing store holds alone is deleted. `pull_db.py` was
given a guard against that on 2026-08-07, and the guard worked like this:

    keys = IDENTITY.get(t)
    if not keys or any(k not in cols(a, t) for k in keys):
        continue                      # <-- the whole defect
    ...
    if n:
        out.setdefault(family, {})[t] = n

A table it could not key was `continue`d past. It contributed nothing to the
result, and nothing is exactly what a table with no rows at risk contributes.
The two are indistinguishable at the call site, which then reads an empty dict
as "the swap costs nothing".

Three of the eight declared identities could not be used:

  public_funding_events   named source_family, source_record_id, company_name,
                          award_date. NONE of those columns exist. 311,399 rows
                          — the only irrecoverable table in the corpus, from
                          registers that republish a current file and keep no
                          history — were never once compared.
  eligibility_clauses     named `clause_text`. The column is `text`.
  eligibility_gates       named `requirement`, which is not unique: 7,471 rows,
                          7,469 distinct. Two real gates collapse into one, and
                          an insert keyed that way then violates the table's
                          own UNIQUE(instrument_id, gate_key).

THE PROPERTY, not the list. Naming those three would be a register of today's
three mistakes. What must hold for any table, declared or not, today or after
the next schema change:

    A table that cannot be compared row by row is reported as UNCOMPARABLE.
    It is never reported as zero rows at risk, because "we did not look" and
    "there is nothing there" are different facts and only one of them makes an
    overwrite safe.

Hermetic: two fixture stores in a temp directory, no credentials, no corpus,
milliseconds. Runs where the corpus cannot.

Run: python3 ETL/events/load/test_overwrite_guard.py
"""
from __future__ import annotations

import sqlite3
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "website" / "build" / "lib"))

import reconcile_stores as R  # noqa: E402

FAILURES: list[str] = []

# A cut of the real schema: the constraints are the ones production declares,
# because the property under test is that the identity map agrees with them.
DDL = """
CREATE TABLE companies (id INTEGER PRIMARY KEY, name TEXT);
CREATE TABLE public_funding_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER, source TEXT NOT NULL,
    project_title TEXT, grant_amount_eur REAL);
CREATE TABLE funding_instruments (id TEXT PRIMARY KEY, name TEXT);
CREATE TABLE eligibility_gates (
    id INTEGER PRIMARY KEY AUTOINCREMENT, instrument_id TEXT NOT NULL,
    gate_key TEXT NOT NULL, requirement TEXT NOT NULL,
    UNIQUE (instrument_id, gate_key));
CREATE TABLE eligibility_clauses (
    id INTEGER PRIMARY KEY AUTOINCREMENT, instrument_id TEXT NOT NULL,
    clause_type TEXT NOT NULL, clause_key TEXT NOT NULL DEFAULT 'default',
    text TEXT NOT NULL, UNIQUE (instrument_id, clause_type, clause_key));
"""


def store(path: Path) -> sqlite3.Connection:
    con = sqlite3.connect(path)
    con.executescript(DDL)
    return con


def find(report: dict, table: str) -> dict | None:
    for tables in report.values():
        if table in tables:
            return tables[table]
    return None


def main() -> None:
    tmp = Path(tempfile.mkdtemp())
    record, laptop = tmp / "record.sqlite", tmp / "laptop.sqlite"
    a, b = store(record), store(laptop)

    # Both stores hold the same one instrument and the same two gates...
    for con in (a, b):
        con.execute("INSERT INTO funding_instruments VALUES ('f1', 'Fund One')")
        con.execute("INSERT INTO eligibility_gates (instrument_id, gate_key, requirement)"
                    " VALUES ('f1','g1','SME test')")
        con.execute("INSERT INTO eligibility_gates (instrument_id, gate_key, requirement)"
                    " VALUES ('f1','g2','SME test')")   # SAME requirement, different gate

    # ...the RECORD holds three awards and one clause the laptop does not.
    for i in range(3):
        a.execute("INSERT INTO public_funding_events (company_id, source, project_title,"
                  " grant_amount_eur) VALUES (1,'cordis','P',1.0)")
    a.execute("INSERT INTO eligibility_clauses (instrument_id, clause_type, clause_key,"
              " text) VALUES ('f1','obligation','ob0','stay in France')")

    # ...and the LAPTOP holds one gate the record does not. This is the 1,070
    # of 2026-08-11 in miniature.
    b.execute("INSERT INTO eligibility_gates (instrument_id, gate_key, requirement)"
              " VALUES ('f1','g3','turnover under 50m')")
    for con in (a, b):
        con.commit()
        con.close()

    # ── 1. the keyed direction is exact ──────────────────────────────────
    lost_from_record = R.would_be_lost(str(record), str(laptop))   # push: record loses
    lost_from_laptop = R.would_be_lost(str(laptop), str(record))   # pull: laptop loses

    g = find(lost_from_laptop, "eligibility_gates")
    if not g or g["verdict"] != "keyed" or g["lost"] != 1:
        FAILURES.append(
            f"a gate held only by the laptop was not reported exactly: {g}")

    c = find(lost_from_record, "eligibility_clauses")
    if not c or c["verdict"] != "keyed" or c["lost"] != 1:
        FAILURES.append(
            "eligibility_clauses was not compared. Its identity used to name "
            f"`clause_text`, a column that does not exist, and the guard skipped "
            f"it in silence: {c}")

    # ── 2. THE REGRESSION. An uncomparable table is never silence ────────
    # public_funding_events has no natural key and cannot get one. The record
    # holds three awards the laptop does not; a push deletes them. The old code
    # returned {} here — this is the assertion that goes red against it.
    e = find(lost_from_record, "public_funding_events")
    if e is None:
        FAILURES.append(
            "public_funding_events was omitted from the report entirely. An "
            "omitted table reads as a safe one, and a push would have deleted "
            "3 awards from registers that keep no history.")
    elif e["verdict"] != "counted" or e["lost"] != 3:
        FAILURES.append(
            f"public_funding_events should be COUNTED as at least 3 rows lost "
            f"(3 on the record, 0 here): {e}")
    if e and not e["why"]:
        FAILURES.append("an uncomparable table was reported without saying why.")

    # ── 3. equal counts do not become a safety claim ─────────────────────
    # The laptop has FEWER events than the record, so from the laptop's side
    # the counts prove nothing. That must be UNKNOWN, not zero-and-silent.
    e2 = find(lost_from_laptop, "public_funding_events")
    if e2 is None or e2["verdict"] != "unknown":
        FAILURES.append(
            f"a table that cannot be keyed and whose counts prove nothing must "
            f"be reported UNKNOWN, not omitted: {e2}")
    if R.unknowns(lost_from_laptop) == []:
        FAILURES.append("unknowns() reported none while a table was uncomparable.")

    # ── 4. an unknown is never summed into the proven loss ───────────────
    if R.proven_loss(lost_from_laptop) != 1:
        FAILURES.append(
            f"proven_loss must count only what was proven; got "
            f"{R.proven_loss(lost_from_laptop)}, expected the 1 keyed gate.")

    # ── 5. a declared identity that is not UNIQUE is not usable ──────────
    # Both gates carry the requirement 'SME test'. Keying on it would merge
    # them. This is the property, not the eligibility_gates special case: swap
    # in any non-unique identity and it must be rejected.
    con = sqlite3.connect(f"file:{record}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    saved = R.IDENTITY["eligibility_gates"]
    R.IDENTITY["eligibility_gates"] = ["instrument_id", "requirement"]
    keys, why = R.usable_identity(con, "eligibility_gates")
    R.IDENTITY["eligibility_gates"] = saved
    if keys is not None:
        FAILURES.append(
            "an identity that is not unique in the data was accepted. Comparing "
            "on it merges distinct rows, and inserting on it violates the "
            "table's own UNIQUE constraint.")
    elif "NOT unique" not in why:
        FAILURES.append(f"a non-unique identity was rejected without saying so: {why}")

    # ── 6. an identity naming a missing column is not usable ─────────────
    R.IDENTITY["eligibility_gates"] = ["instrument_id", "no_such_column"]
    keys, why = R.usable_identity(con, "eligibility_gates")
    R.IDENTITY["eligibility_gates"] = saved
    if keys is not None or "does not have" not in why:
        FAILURES.append(
            f"an identity naming a column the store lacks was accepted: {keys} {why}")

    # ── 7. the real identity IS the table's own UNIQUE constraint ────────
    # Not a spot check of three tables: every entry in the map, against every
    # store this test can build. A future schema change that moves a column
    # fails here rather than in a silent overwrite.
    for table, keys in R.IDENTITY.items():
        if not R.has(con, table):
            continue
        got, why = R.usable_identity(con, table)
        if got is None:
            FAILURES.append(
                f"IDENTITY[{table!r}] = {keys} is not usable against the schema: {why}")
    con.close()

    # ── 8. nothing declared both keyable and unkeyable ───────────────────
    both = set(R.IDENTITY) & set(R.UNKEYABLE)
    if both:
        FAILURES.append(
            f"tables in both IDENTITY and UNKEYABLE — the guard cannot know which "
            f"to believe: {sorted(both)}")

    if FAILURES:
        print("FAIL: an overwrite could report itself safe about a table nobody "
              "compared\n")
        for f in FAILURES:
            print(f"  - {f}\n")
        sys.exit(1)
    print("ok: every family table is compared, counted, or named as uncomparable — "
          "none is silently zero")


if __name__ == "__main__":
    main()
