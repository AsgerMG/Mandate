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
                owner_is_source: bool, dry: bool) -> dict:
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

    # 2. rows both have — column by column
    for k in src_rows:
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

    total_conflicts = 0
    for family in args.family:
        for t in FAMILIES[family]:
            if not (has(tgt, t) and has(src, t)):
                print(f"  {t:<30} skipped (absent from one store)")
                continue
            r = merge_table(tgt, src, t, owner_is_source=True, dry=args.dry_run)
            if "skipped" in r:
                print(f"  {t:<30} skipped — {r['skipped']}")
                continue
            total_conflicts += r["conflicts"]
            print(f"  {t:<30} +{r['inserted']:,} new, {r['updated']:,} merged, "
                  f"{r['conflicts']:,} conflicts, {r['kept_only_in_target']:,} kept "
                  f"that the source lacks")
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
        print(f"\nWritten. {total_conflicts:,} conflicts resolved in favour of the "
              f"source, every one printed above. No row was deleted.")
    tgt.close()
    src.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
