"""A PROMOTION carries rows nobody disputes. It never settles a dispute.

`test_overwrite_refusal.py` proves a whole-file overwrite cannot delete the
sole copy of a ROW. This proves the thing that guard cannot see: that promoting
one store's rows into another does not silently displace COLUMN VALUES on the
rows they already share.

THE NEAR MISS THIS ENCODES. On 2026-08-19 the corpus of record was missing
3,362 encoded eligibility gates and the promotion was one command:

    reconcile_stores.py --into record.sqlite --from local.sqlite \
        --family instruments

`overwrite_gate` was green on it — `proven loss: 0 row(s)` — and it was right:
no row would have been lost. What it does not measure is COLUMNS. The same
command had 374 values queued to be displaced on rows BOTH stores hold, across
19 columns that do not share a reason: 91 `capital_type_basis`, 70
`name_source`, 48 `name`, 26 `capital_type`, and one `scheme_end_date` — that
last written weekly ON THE RECORD by `refresh_open_calls.py`.

`name_source` is why a FAMILY cannot own this. `registerNamesTheRow()` withholds
a row from every founder when it reads `partition_key`; the laptop calls 44
loader-composed buckets `partition_key` and the record still calls them
`deterministic`. Run the merge either way and a publishability decision on 44
rows moves as a side effect of promoting eligibility gates.

THE PROPERTY, not the list. No table, column, store or count is a rule below:

    A transfer run as a PROMOTION may add rows the target does not have and may
    change NOTHING ELSE. Every row the target already holds must be
    byte-for-byte identical afterwards, whatever the source says about it and
    whatever column the disagreement is in.

The test for the unseen case is section 3: a column this file has never named,
holding a value this file has never seen, on a table declared at runtime. The
property is checked by comparing the target's shared rows before and after,
column by column, over whatever columns the store happens to have — so a column
added next year is covered with no edit here.

Hermetic: fixture stores in a temp directory. No credentials, no corpus, no
network.

Run: python3 ETL/events/load/test_promotion_is_inserts_only.py
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

import corpus_stores  # noqa: E402
import reconcile_stores as R  # noqa: E402

FAILURES: list[str] = []


def must(cond: bool, why: str) -> None:
    if not cond:
        FAILURES.append(why)


def snapshot(path: Path, table: str) -> dict:
    """Every row of `table`, keyed on its declared identity, as a plain dict of
    every column the store has. Read generically so a column added later is
    compared without an edit here."""
    con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    cols = [r[1] for r in con.execute(f"PRAGMA table_info({table})")]
    keys = R.IDENTITY[table]
    out = {}
    for row in con.execute(f'SELECT * FROM "{table}"'):
        out[tuple(str(row[k]) for k in keys)] = {c: row[c] for c in cols}
    con.close()
    return out


def build(path: Path, table: str, extra_col: str, rows: list[tuple]) -> None:
    con = sqlite3.connect(path)
    con.execute(
        f'CREATE TABLE "{table}" (id INTEGER PRIMARY KEY AUTOINCREMENT, '
        f'instrument_id TEXT, gate_key TEXT, requirement TEXT, "{extra_col}" TEXT, '
        f"created_at TEXT, UNIQUE(instrument_id, gate_key))")
    con.executemany(
        f'INSERT INTO "{table}" (instrument_id, gate_key, requirement, "{extra_col}", '
        f"created_at) VALUES (?,?,?,?,?)", rows)
    con.commit()
    con.close()


def main() -> None:
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        target, source = tmp / "record.sqlite", tmp / "local.sqlite"
        table = "eligibility_gates"

        # ── 1. a column nothing in this repository has named ─────────────
        # The disagreement is deliberately NOT in a column any part of the
        # transfer knows about. If the property held only for `requirement` or
        # `value_spec` it would be an enumeration wearing a test.
        extra = "a_column_added_next_year"

        # target: two shared rows carrying values only IT has, plus one of its own.
        # Which store is "better" is deliberately not modelled — the property is
        # that a promotion does not decide, whichever way the answer runs.
        build(target, table, extra, [
            ("inst_a", "g1", "the target's wording", "target-only-1", "t0"),
            ("inst_b", "g1", "another of the target's", "target-only-2", "t0"),
            ("inst_z", "g9", "a row the source has never seen", "target-only-3", "t0"),
        ])
        # source: the same two shared rows, disagreeing on every column, plus the
        # rows the promotion exists to carry
        build(source, table, extra, [
            ("inst_a", "g1", "the source's wording", "source-1", "t1"),
            ("inst_b", "g1", "also the source's", "source-2", "t1"),
            ("inst_new1", "g1", "a gate the record has never been given", "new-1", "t1"),
            ("inst_new2", "g2", "and another", "new-2", "t1"),
        ])

        corpus_stores.FAMILIES["a_family_declared_at_runtime"] = [table]
        before = snapshot(target, table)

        tgt = sqlite3.connect(target)
        tgt.row_factory = sqlite3.Row
        src = R.ro(str(source))
        res = R.merge_table(tgt, src, table, owner_is_source=True, dry=False,
                            inserts_only=True)
        tgt.commit()
        tgt.close()
        src.close()
        after = snapshot(target, table)

        # ── 2. the rows the promotion exists to carry DID arrive ─────────
        # A test that only proves nothing changed is passed by a no-op.
        must(res["inserted"] == 2,
             f"a promotion that carries nothing is not a promotion: inserted "
             f"{res['inserted']}, expected 2")
        must(("inst_new1", "g1") in after and ("inst_new2", "g2") in after,
             "the rows the target did not have were not inserted")

        # ── 3. NOTHING the target already held moved ─────────────────────
        for key, row in before.items():
            got = after.get(key)
            if got is None:
                FAILURES.append(f"a promotion DELETED {key} from the target")
                continue
            for col, was in row.items():
                if col in ("id",):
                    continue
                must(got[col] == was,
                     f"a promotion displaced {key}.{col}: was {was!r}, now {got[col]!r}. "
                     f"A row both stores hold is a JUDGEMENT about whose evidence is "
                     f"better, and a transfer must not make it.")

        # ── 4. and it SAYS it left them alone ────────────────────────────
        # Silence about the shared rows reads exactly like there being none.
        must(res.get("shared_untouched") == 2,
             f"a promotion must COUNT what it left alone, so 'we did not touch these' "
             f"is a stated fact and not an empty result: got "
             f"{res.get('shared_untouched')!r}")
        must(res["updated"] == 0 and res["conflicts"] == 0,
             f"a promotion reported {res['updated']} update(s) and {res['conflicts']} "
             f"conflict(s); it may report neither")

        # ── 5. and the ordinary merge STILL settles them ─────────────────
        # The flag must be a restriction somebody asks for, not a change of
        # default that silently stops the merge path doing its job.
        t2, s2 = tmp / "t2.sqlite", tmp / "s2.sqlite"
        build(t2, table, extra, [("inst_a", "g1", "target", "t", "t0")])
        build(s2, table, extra, [("inst_a", "g1", "source", "s", "t1")])
        c2 = sqlite3.connect(t2)
        c2.row_factory = sqlite3.Row
        r2 = R.merge_table(c2, R.ro(str(s2)), table, owner_is_source=True, dry=False)
        c2.commit()
        c2.close()
        must(r2["updated"] == 1 and r2["conflicts"] >= 1,
             "the default merge stopped settling conflicts — --inserts-only must be a "
             "restriction the caller asks for, not a new default")
        must(snapshot(t2, table)[("inst_a", "g1")]["requirement"] == "source",
             "the default merge no longer applies the source's value")

        corpus_stores.FAMILIES.pop("a_family_declared_at_runtime")

    if FAILURES:
        print("FAIL: a promotion changed something it does not own\n")
        for f in FAILURES:
            print(f"  - {f}\n")
        sys.exit(1)
    print("ok: a promotion inserts the rows the target lacks, counts the shared rows "
          "it left\n    untouched, and changes no column on any of them — including a "
          "column this\n    test invented")


if __name__ == "__main__":
    main()
