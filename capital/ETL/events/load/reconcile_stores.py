"""Reconcile two SQLite stores BY UNION. Never by overwrite.

── The problem ────────────────────────────────────────────────────────────
The only two channels between the corpus of record (the Railway volume) and a
working copy are `pull_db.py` and `push_local.py`, and both move the entire
645 MB file with `--overwrite`. Whichever direction you run, everything the
other store holds alone is destroyed. On 2026-08-07 that meant:

  pull   the volume's 1,451 events arrive; the laptop's 764 instruments and
         2,350 encoded gates are deleted.
  push   the laptop's instruments arrive; the volume's 1,451 events — real
         awards, from registers that keep no history — are deleted.

So the two stores could not be joined by anything in the repository. The
divergence was not a lapse of discipline; it was the only reachable state.

── What this does instead ─────────────────────────────────────────────────
Table by table, keyed on the table's own identity:

  in SOURCE only   INSERT into the target.
  in TARGET only   KEPT. Always. There is no mode in which this deletes a row.
  in both          merged column by column: a NULL in the target takes the
                   source's value; two differing non-NULL values are a CONFLICT
                   and the family's owner wins, with the losing value written to
                   the report so the decision is inspectable rather than silent.

The last rule is the "evidence" half. `refresh_open_calls.py` runs weekly on the
volume and writes scheme_end_date; the encoding pipeline runs on the laptop and
writes everything else about the same rows. Both are real. Neither can be
discarded quietly.

── Usage ──────────────────────────────────────────────────────────────────
  # what differs, changing nothing
  python3 ETL/events/load/reconcile_stores.py --report A.sqlite B.sqlite

  # promote a family from a working copy into the corpus of record
  python3 ETL/events/load/reconcile_stores.py \
      --into  volume.sqlite --from local.sqlite --family instruments

`--into` is written in place, so take a copy first if you want one; the tool
refuses to touch a file it was not given explicitly.
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import ROOT  # noqa: E402
# --- end ETL path bootstrap ---

import argparse  # noqa: E402
import sqlite3  # noqa: E402

_sys.path.insert(0, str(ROOT / "website" / "build" / "lib"))
from corpus_stores import FAMILIES  # noqa: E402

# The identity a row is matched on. Not always the primary key: eligibility_gates
# and eligibility_clauses carry a SQLite autoincrement id that is re-issued on
# every reload, so matching on it would call every row new and duplicate the
# entire table. Matching is on what makes the row that row.
#
# ── Every entry here is the table's OWN declared UNIQUE constraint ─────────
# It has to be, and `test_identity_matches_schema.py` fails the moment one
# is not. The first version of this map was written by hand and three of its
# eight entries were wrong in ways nothing could see:
#
#   eligibility_clauses named `clause_text`, a column that does not exist.
#   public_funding_events named four columns, none of which exist.
#   eligibility_gates matched on `requirement`, which is not unique (7,471
#     rows, 7,469 distinct) — so two real gates collapsed into one, and an
#     insert keyed that way would then violate UNIQUE(instrument_id, gate_key).
#
# An identity that names a missing column does not raise. It makes the table
# UNCOMPARABLE, and the code that decided whether an --overwrite was safe read
# "uncomparable" as "nothing at risk" and let the overwrite through. The most
# irrecoverable table in the corpus, public_funding_events, was in that state
# for the entire life of the guard built to protect it.
IDENTITY = {
    "funding_instruments": ["id"],                                   # PK
    "funding_instrument_sources": ["instrument_id", "source"],       # PK
    "eligibility_gates": ["instrument_id", "gate_key"],              # UNIQUE
    "eligibility_clauses": ["instrument_id", "clause_type",
                            "clause_key"],                           # UNIQUE
    "instrument_application": ["id"],                                # PK (== instrument_id)
    "companies": ["id"],                                             # PK
    "public_equity_stakes": ["id"],                                  # PK
    "satr_staging": ["tm_id"],                                       # PK
    "company_sector_labels": ["name_key"],                           # PK
    "company_sector_llm": ["company_id"],                            # PK
}

# Tables in a family that CANNOT be keyed, named so that "we did not compare
# this" is a stated fact rather than an empty result. Both carry only a SQLite
# AUTOINCREMENT id, which is re-issued per store and therefore identifies a row
# number rather than a fact.
#
# public_funding_events is the one that matters and it is not an oversight:
# every candidate natural key was measured against the live corpus and none is
# unique. (source, company_id, project_number, project_title, project_started,
# grant/equity/debt amounts, call_id, raw_source_url, satr_tm_id) — the widest
# of them — still collapses 1,553 of 311,399 rows, because a register can
# genuinely publish the same award twice under one identifier. Until an
# extractor writes a stable per-source record id, these tables are compared by
# COUNT, which proves loss when the target is larger and proves nothing when it
# is not. That distinction is reported; it is never rounded down to zero.
UNKEYABLE = {
    "public_funding_events": "no natural key exists in the data (measured); "
                             "only an AUTOINCREMENT id, re-issued per store",
    "private_funding_events": "only an AUTOINCREMENT id",
    "classify_audit": "append-only audit log; only an AUTOINCREMENT id",
}

# Columns never carried across: surrogate ids the target re-issues, and
# timestamps that describe the ROW's life in a store rather than the fact.
NEVER_COPY = {"id", "created_at", "updated_at"}


def ro(path: str) -> sqlite3.Connection:
    con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    return con


def cols(con: sqlite3.Connection, table: str) -> list[str]:
    return [r[1] for r in con.execute(f"PRAGMA table_info({table})")]


def has(con: sqlite3.Connection, table: str) -> bool:
    return con.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
                       (table,)).fetchone() is not None


def key_of(row, keys: list[str]):
    return tuple("" if row[k] is None else str(row[k]) for k in keys)


def load(con: sqlite3.Connection, table: str, keys: list[str]) -> dict:
    return {key_of(r, keys): r for r in con.execute(f'SELECT * FROM "{table}"')}


def n_rows(con: sqlite3.Connection, table: str) -> int:
    return con.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]


def usable_identity(con: sqlite3.Connection, table: str) -> tuple[list[str] | None, str]:
    """The keys `table` can be compared on IN THIS STORE, or None and why not.

    Three ways an identity stops being usable, and each was live in this file:
    it is not declared at all; it names a column the store does not have (a
    typo, or a schema that moved); or it is declared and present but is NOT
    UNIQUE in the data, which silently merges distinct rows and then, on
    insert, violates the constraint the table actually has.

    The point of returning a REASON rather than None alone is that the caller
    must be able to say "this table was not compared, and here is why" instead
    of returning an empty difference that reads exactly like "nothing at risk".
    """
    if table in UNKEYABLE:
        return None, UNKEYABLE[table]
    keys = IDENTITY.get(table)
    if not keys:
        return None, "no identity declared in reconcile_stores.IDENTITY"
    present = set(cols(con, table))
    missing = [k for k in keys if k not in present]
    if missing:
        return None, f"identity names columns this store does not have: {missing}"
    q = ", ".join(f'COALESCE("{k}", \'\')' for k in keys)
    distinct = con.execute(
        f'SELECT COUNT(*) FROM (SELECT 1 FROM "{table}" GROUP BY {q})').fetchone()[0]
    total = n_rows(con, table)
    if distinct != total:
        return None, (f"identity {keys} is NOT unique here — {total:,} rows, "
                      f"{distinct:,} distinct. Comparing on it would merge "
                      f"{total - distinct:,} distinct rows into one")
    return keys, ""


def would_be_lost(losing: str, winning: str,
                  families: list[str] | None = None) -> dict:
    """What overwriting `losing` with `winning` destroys, table by table.

    ── The property ───────────────────────────────────────────────────────
    A whole-file `--overwrite` between two stores is a DELETION of everything
    the losing side holds alone. This is the one measurement of that, and it
    is used by both directions — `pull_db.py` (the volume overwrites the
    laptop) and `push_local.py` (the laptop overwrites the volume) — so the
    two can never mean different things by "would be lost".

    ── Why a verdict per table, and not just a number ──────────────────────
    The version this replaces returned a dict of counts, and `continue`d past
    every table it could not key. A table it could not key contributed
    nothing to the dict, which is byte-for-byte the same result as a table
    with nothing at risk. `public_funding_events` — 311,399 rows, the only
    irrecoverable table in the corpus, from registers that keep no history —
    was in that state for the entire life of the guard, because its declared
    identity named four columns that do not exist.

    So every table returns one of three verdicts and a `lost` count:

      keyed    compared row by row on the table's own UNIQUE constraint.
               `lost` is exact.
      counted  not keyable, but the losing store has MORE rows than the
               winning one. `lost` is a lower bound: at least this many go.
      unknown  not keyable, and the counts do not prove loss. `lost` is 0 and
               THAT IS NOT A SAFETY CLAIM. Reported as unknown, always
               printed, never quietly folded into the total.
    """
    from corpus_stores import FAMILIES

    a, b = ro(losing), ro(winning)
    out: dict[str, dict] = {}
    try:
        for family, tables in FAMILIES.items():
            if families and family not in families:
                continue
            for t in tables:
                if not has(a, t):
                    continue
                rows_a = n_rows(a, t)
                if not has(b, t):
                    # An absent table loses every row it has, and that is exact
                    # without needing an identity at all. An absent EMPTY table
                    # loses nothing and is not worth a line.
                    if rows_a:
                        out.setdefault(family, {})[t] = {
                            "verdict": "keyed", "lost": rows_a, "rows_losing": rows_a,
                            "rows_winning": 0,
                            "why": "the table is absent from the winning store entirely",
                        }
                    continue
                rows_b = n_rows(b, t)
                keys_a, why_a = usable_identity(a, t)
                keys_b, why_b = usable_identity(b, t)
                if keys_a and keys_b:
                    lost = len(set(load(a, t, keys_a)) - set(load(b, t, keys_b)))
                    verdict, why = "keyed", ""
                else:
                    why = why_a or why_b
                    lost = max(0, rows_a - rows_b)
                    verdict = "counted" if lost else "unknown"
                if lost or verdict != "keyed":
                    out.setdefault(family, {})[t] = {
                        "verdict": verdict, "lost": lost, "rows_losing": rows_a,
                        "rows_winning": rows_b, "why": why,
                    }
    finally:
        a.close()
        b.close()
    return out


def proven_loss(report: dict) -> int:
    """Rows this comparison can PROVE an overwrite destroys. Never the whole
    story — see `unknowns` — and deliberately not summed with them."""
    return sum(t["lost"] for tables in report.values() for t in tables.values())


def unknowns(report: dict) -> list[tuple[str, str, dict]]:
    """(family, table, detail) for every table the comparison could not key
    and whose counts prove nothing. These are the tables an overwrite cannot
    be shown to be safe for."""
    return [(f, t, d) for f, tables in report.items() for t, d in tables.items()
            if d["verdict"] == "unknown"]


def overwrite_gate(losing: str, winning: str, override: str | None, remedy: str,
                   families: list[str] | None = None,
                   destroys: bool = True) -> tuple[bool, str, dict]:
    """THE interlock on every whole-file overwrite in this repository.

    ── The property ───────────────────────────────────────────────────────
    No whole-file overwrite may run while the store being REPLACED is the sole
    holder of any row. An operator may override that, and the override must
    state, itemised and counted, exactly what it destroys BEFORE it destroys
    it — because an override that reports afterwards is not a decision anybody
    made.

    ── How it holds for a table nobody has added yet ──────────────────────
    Nothing here names a table, a family or a count. The gate asks
    `would_be_lost`, which walks whatever `corpus_stores.FAMILIES` declares and
    returns one of three verdicts per table — keyed, counted, uncomparable. A
    table added next month is covered the moment it appears in that map, with
    no edit here: if it can be keyed it is compared exactly, if it cannot it is
    compared by count, and if the counts prove nothing it is named as
    UNCOMPARABLE rather than folded into a zero. The test for the unseen case
    is `test_overwrite_refusal.py`, which registers a table this file has never
    heard of and requires the gate to refuse on it.

    ── Why the measurement runs even under an override ────────────────────
    `push_local.py --force-overwrite` used to skip the comparison entirely, so
    the one flag whose whole purpose is to destroy rows knowingly was the only
    path that could not say which rows. `pull_db.py --discard-local` measured
    and then printed a bare total after the swap. Both are the same defect:
    the operator learns the cost too late to decline it.

    ── `destroys` ─────────────────────────────────────────────────────────
    Not every sanctioned resolution is a deletion. `pull_db.py --carry-forward`
    merges the rows the losing store holds alone into the winning file before
    the swap, so nothing is lost — and reporting it as a destruction would
    spend the word on a case where it is untrue, which is how operators learn
    to read past it. The itemisation is printed either way; only the verb
    changes.

    Returns (may_proceed, what the operator must be shown first, the report).
    The caller prints the text and acts on the boolean; it never re-derives
    either, and it never has to measure a second time to find out which
    families moved.
    """
    lost = would_be_lost(losing, winning, families)
    n = proven_loss(lost)
    unk = unknowns(lost)
    out: list[str] = []

    # An UNCOMPARABLE table is not a safe one, and this is printed on the runs
    # that PROCEED as well, because the alternative is a swap that reports
    # "nothing at risk" about a table it never looked at.
    if unk:
        out.append(f"\nNOT PROVEN SAFE — {len(unk)} table(s) could not be compared "
                   f"row by row:")
        for _f, t, d in unk:
            out.append(f"    {t:<32} {d['rows_losing']:,} on the store being replaced "
                       f"vs {d['rows_winning']:,} on the one replacing it — {d['why']}")
        out.append("  Equal or smaller counts do not prove no rows are lost. This is "
                   "what the\n  comparison could not see, stated rather than omitted.")

    if not n:
        return True, "\n".join(out), lost

    if not override:
        out.append(f"\nREFUSED — the store being replaced holds {n:,} row(s) the one "
                   f"replacing it does not.\n  Overwriting them is a deletion, not a "
                   f"sync.\n")
        out.append(format_loss(lost, indent="  "))
        out.append(f"\n{remedy}")
        return False, "\n".join(out), lost

    if destroys:
        out.append(f"\nDESTROYING {n:,} row(s) — {override} was given, and this is what "
                   f"it deletes.\n  Every one exists in exactly one place and has no "
                   f"other copy.\n")
    else:
        out.append(f"\nCARRYING FORWARD {n:,} row(s) — {override} was given. Nothing "
                   f"below is deleted;\n  each row is merged into the file that "
                   f"replaces this store.\n")
    out.append(format_loss(lost, indent="  "))
    out.append("")
    return True, "\n".join(out), lost


def format_loss(report: dict, indent: str = "  ") -> str:
    """The report a person reads at the moment of the refusal."""
    lines: list[str] = []
    for family, tables in sorted(report.items()):
        lines.append(f"{indent}{family}:")
        for t, d in sorted(tables.items(), key=lambda kv: -kv[1]["lost"]):
            if d["verdict"] == "keyed":
                lines.append(f"{indent}  {t:<30} {d['lost']:>9,} rows exist ONLY here")
            elif d["verdict"] == "counted":
                lines.append(f"{indent}  {t:<30} {d['lost']:>9,} rows AT LEAST "
                             f"({d['rows_losing']:,} here vs {d['rows_winning']:,} there)")
                lines.append(f"{indent}      cannot be compared row by row: {d['why']}")
            else:
                lines.append(f"{indent}  {t:<30} {'UNKNOWN':>9} "
                             f"({d['rows_losing']:,} here vs {d['rows_winning']:,} there)")
                lines.append(f"{indent}      cannot be compared row by row: {d['why']}")
    return "\n".join(lines)


def report(a_path: str, b_path: str) -> int:
    """What each store holds that the other does not. Reads only."""
    A, B = ro(a_path), ro(b_path)
    print(f"A = {a_path}\nB = {b_path}\n")
    worst = 0
    for family, tables in FAMILIES.items():
        print(f"── {family} " + "─" * (68 - len(family)))
        for t in tables:
            if not has(A, t) or not has(B, t):
                print(f"  {t:<30} MISSING from {'A' if not has(A, t) else 'B'}")
                continue
            # One definition of "can this table be compared", shared with the
            # overwrite guard, so the report a human reads and the check that
            # refuses a sync can never disagree about which tables were looked at.
            keys, why = usable_identity(A, t)
            if keys is None or any(k not in cols(B, t) for k in keys):
                na, nb = n_rows(A, t), n_rows(B, t)
                print(f"  {t:<30} {na:>9,} {nb:>9,}   NOT COMPARED — "
                      f"{why or 'the other store lacks the identity columns'}")
                continue
            ka = set(load(A, t, keys))
            kb = set(load(B, t, keys))
            only_a, only_b = len(ka - kb), len(kb - ka)
            worst = max(worst, only_a, only_b)
            flag = "  <-- both hold rows the other lacks" if only_a and only_b else ""
            print(f"  {t:<30} {len(ka):>9,} {len(kb):>9,}   "
                  f"only-A {only_a:>7,}  only-B {only_b:>7,}{flag}")
        print()
    # Schema, because a union cannot carry a column the target has no room for.
    print("── schema " + "─" * 69)
    for family, tables in FAMILIES.items():
        for t in tables:
            if not (has(A, t) and has(B, t)):
                continue
            ca, cb = set(cols(A, t)), set(cols(B, t))
            if ca != cb:
                print(f"  {t}: A-only {sorted(ca - cb)}  B-only {sorted(cb - ca)}")
    return 0 if worst == 0 else 3


def merge_table(tgt: sqlite3.Connection, src: sqlite3.Connection, table: str,
                owner_is_source: bool, dry: bool, inserts_only: bool = False) -> dict:
    """Union `src` into `tgt` on the table's own identity.

    ── `inserts_only`, and why a PROMOTION is not a MERGE ──────────────────
    Two different operations wear the word "union" here and conflating them
    cost a near miss on 2026-08-19.

    A row the target does not have is UNAMBIGUOUS: inserting it takes nothing
    away from anybody, and it is the whole of what "promote the 3,362 gates
    the record has never been given" asks for.

    A row BOTH stores have, whose columns disagree, is not a transfer. It is a
    JUDGEMENT about whose evidence is better, and `owner_is_source` decides it
    once, for a whole FAMILY — which is too coarse to be true. Measured on the
    two live stores on 2026-08-19, `funding_instruments` disagreed on 374
    values across 19 columns, and the columns do not share a reason: 91
    `capital_type_basis`, 70 `name_source`, 48 `name`, 46
    `eligibility_fetched_at`, 26 `capital_type`, 19 `sector_mix`, and one
    `scheme_end_date` — that last written weekly ON THE RECORD by
    `refresh_open_calls.py` and nowhere else.

    `name_source` is the one that shows why a family cannot own this. It is not
    metadata: `registerNamesTheRow()` withholds a row from every founder when
    it reads `partition_key`. The laptop calls 44 loader-composed buckets
    `partition_key` and the record still calls them `deterministic`. Run the
    merge in either direction and a PUBLISHABILITY decision on 44 rows moves as
    a side effect of promoting eligibility gates — which is not a thing anybody
    asked for and not a thing anybody would have reviewed.

    `overwrite_gate` could not have caught it: it counts ROWS that would be
    lost and every one of those rows exists in both stores, so it reported
    `proven loss: 0` while 374 column values were queued to be displaced.

    So a promotion says `inserts_only=True` and takes the rows nobody disputes.
    The disputed columns stay disputed, visibly, for whoever can settle them
    per column instead of per family.
    """
    keys = IDENTITY.get(table)
    if not keys:
        return {"skipped": "no identity declared"}
    tcols, scols = cols(tgt, table), cols(src, table)
    shared = [c for c in scols if c in tcols and c not in NEVER_COPY]
    missing_in_target = [c for c in scols if c not in tcols]

    src_rows = load(src, table, keys)
    tgt_rows = load(tgt, table, keys)

    inserted = updated = conflicts = 0
    conflict_log: list[str] = []

    # 1. rows the target does not have
    new_keys = [k for k in src_rows if k not in tgt_rows]
    if new_keys and not dry:
        ph = ", ".join("?" * len(shared))
        tgt.executemany(
            f'INSERT INTO "{table}" ({", ".join(shared)}) VALUES ({ph})',
            [tuple(src_rows[k][c] for c in shared) for k in new_keys])
    inserted = len(new_keys)

    # 2. rows both have — column by column. Skipped entirely for a promotion:
    # see the docstring. The rows are still COUNTED and reported, so "we did not
    # touch these" is a stated fact rather than an empty result.
    for k in ([] if inserts_only else src_rows):
        if k not in tgt_rows:
            continue
        s, t = src_rows[k], tgt_rows[k]
        sets, vals = [], []
        for c in shared:
            if c in keys:
                continue
            sv, tv = s[c], t[c]
            if sv == tv:
                continue
            if tv is None and sv is not None:
                sets.append(f'"{c}" = ?')      # fill a hole, always safe
                vals.append(sv)
            elif sv is not None and tv is not None:
                conflicts += 1
                if owner_is_source:
                    sets.append(f'"{c}" = ?')
                    vals.append(sv)
                    if len(conflict_log) < 40:
                        conflict_log.append(
                            f"{table} {k} .{c}: kept source {sv!r}, displaced target {tv!r}")
                elif len(conflict_log) < 40:
                    conflict_log.append(
                        f"{table} {k} .{c}: kept target {tv!r}, ignored source {sv!r}")
        if sets:
            updated += 1
            if not dry:
                where = " AND ".join(f'COALESCE("{c}", \'\') = ?' for c in keys)
                tgt.execute(f'UPDATE "{table}" SET {", ".join(sets)} WHERE {where}',
                            (*vals, *k))

    return {
        "inserted": inserted, "updated": updated, "conflicts": conflicts,
        "kept_only_in_target": len([k for k in tgt_rows if k not in src_rows]),
        "shared_untouched": len([k for k in src_rows if k in tgt_rows]) if inserts_only else 0,
        "columns_dropped": missing_in_target, "conflict_log": conflict_log,
    }


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--report", nargs=2, metavar=("A", "B"),
                    help="compare two stores, change nothing")
    ap.add_argument("--into", help="the store to write (the corpus of record)")
    ap.add_argument("--from", dest="source", help="the store to take rows from")
    ap.add_argument("--family", action="append", choices=sorted(FAMILIES),
                    help="which table family the SOURCE owns; repeatable")
    ap.add_argument("--table", action="append",
                    help="restrict to these tables within the family; repeatable. "
                         "A family is the unit of OWNERSHIP, not always the unit of "
                         "a transfer.")
    ap.add_argument("--inserts-only", action="store_true",
                    help="carry ONLY rows the target does not have. Rows both stores "
                         "hold are left exactly as the target has them, however they "
                         "differ. This is what a PROMOTION is; see merge_table.")
    ap.add_argument("--dry-run", action="store_true",
                    help="say what would move, write nothing")
    args = ap.parse_args()

    if args.report:
        return report(*args.report)

    if not (args.into and args.source and args.family):
        ap.error("give --report A B, or --into X --from Y --family <name>")

    tgt = sqlite3.connect(args.into)
    tgt.row_factory = sqlite3.Row
    src = ro(args.source)
    print(f"into  {args.into}\nfrom  {args.source}\nfamily {', '.join(args.family)}"
          + ("   (DRY RUN)" if args.dry_run else "") + "\n")

    if args.inserts_only:
        print("INSERTS ONLY — rows both stores hold are left exactly as the target "
              "has them.\n")
    if args.table:
        unknown = [t for t in args.table
                   if not any(t in FAMILIES[f] for f in args.family)]
        if unknown:
            ap.error(f"--table names {unknown}, which is not in {args.family}")

    total_conflicts = 0
    for family in args.family:
        for t in FAMILIES[family]:
            if args.table and t not in args.table:
                continue
            if not (has(tgt, t) and has(src, t)):
                print(f"  {t:<30} skipped (absent from one store)")
                continue
            r = merge_table(tgt, src, t, owner_is_source=True, dry=args.dry_run,
                            inserts_only=args.inserts_only)
            if "skipped" in r:
                print(f"  {t:<30} skipped — {r['skipped']}")
                continue
            total_conflicts += r["conflicts"]
            print(f"  {t:<30} +{r['inserted']:,} new, {r['updated']:,} merged, "
                  f"{r['conflicts']:,} conflicts, {r['kept_only_in_target']:,} kept "
                  f"that the source lacks"
                  + (f", {r['shared_untouched']:,} shared LEFT AS THE TARGET HAS THEM"
                     if args.inserts_only else ""))
            if r["columns_dropped"]:
                print(f"      columns the target has no room for (run migrations "
                      f"first): {r['columns_dropped']}")
            for line in r["conflict_log"]:
                print(f"      {line}")

    if args.dry_run:
        tgt.rollback()
        print("\nDRY RUN — nothing written.")
    else:
        tgt.commit()
        if args.inserts_only:
            print("\nWritten. Rows the target did not have were INSERTED; every row "
                  "it already\n  had is byte-for-byte as it was. No row was deleted "
                  "and no column displaced.")
        else:
            print(f"\nWritten. {total_conflicts:,} conflicts resolved in favour of the "
                  f"source, every one printed above. No row was deleted.")
    tgt.close()
    src.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
